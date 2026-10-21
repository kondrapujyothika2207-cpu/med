/*
 * ==============================================================================
 * MedTrack Smart RFID Medicine Authentication System - ESP32 Firmware
 * 
 * Target Hotspot:  Nothing Phone (3a)_2505
 * Wi-Fi Password:  praveen DSP
 * 
 * FEATURES:
 * 1. Auto-connects to Wi-Fi every time (background reconnection watchdog)
 * 2. LED Status Indicators:
 *    - BLUE LED (GPIO 2): Solid ON when Wi-Fi is connected (Blinks while connecting)
 *    - GREEN LED (GPIO 12): Solid ON for 2s when REAL / GENUINE medicine is scanned
 *    - RED LED (GPIO 14): Rapid warning flashes when FAKE / COUNTERFEIT medicine is scanned
 * 3. Buzzer Audio Feedback Modes:
 *    - Mode 1: Wi-Fi connected chime (2 melodic ascending beeps)
 *    - Mode 2: Authentic medicine confirmation beep (crisp 3000Hz tone)
 *    - Mode 3: Counterfeit fraud siren alarm (3 urgent warning bursts)
 * 4. Dual Reader Support: Supports both RC522 (SPI) and PN532 (I2C)
 * 5. Sends live IP in heartbeat so website displays the IP in real-time scroll!
 * ==============================================================================
 * 
 * --- WIRING PINOUT GUIDE ---
 * 
 * 1) LEDS & BUZZER WIRING:
 *    - Blue LED (+)  -> GPIO 2  (Can also use onboard blue LED)
 *    - Green LED (+) -> GPIO 12 (via 220 ohm resistor to GND)
 *    - Red LED (+)   -> GPIO 14 (via 220 ohm resistor to GND)
 *    - Buzzer (+)    -> GPIO 13 (Buzzer (-) to GND)
 * 
 * 2) RC522 (MFRC522) SPI WIRING (DEFAULT):
 *    - SDA (SS)      -> GPIO 5
 *    - SCK           -> GPIO 18
 *    - MOSI          -> GPIO 23
 *    - MISO          -> GPIO 19
 *    - IRQ           -> (Not connected)
 *    - GND           -> GND
 *    - RST           -> GPIO 22
 *    - 3.3V          -> 3.3V (CAUTION: 3.3V ONLY, NOT 5V!)
 * 
 * 3) PN532 I2C WIRING (Alternative):
 *    - SDA           -> GPIO 21
 *    - SCL           -> GPIO 22
 *    - VCC           -> 3.3V or 5V
 *    - GND           -> GND
 *    - IRQ           -> GPIO 4
 *    - RST           -> GPIO 5
 *    (Set PN532 DIP Switches: Channel 1=ON, Channel 2=OFF for I2C)
 * ==============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <esp_system.h>

// ====================================================
// HARDWARE SELECTOR
// Set USE_RC522 to 1 if using RFID-RC522 (SPI)
// Set USE_RC522 to 0 if using Adafruit PN532 (I2C)
// ====================================================
#define USE_RC522 1

#if USE_RC522
  #include <SPI.h>
  #include <MFRC522.h>
  #define SS_PIN  5
  #define RST_PIN 22
  MFRC522 rfid(SS_PIN, RST_PIN);
#else
  #include <Wire.h>
  #include <Adafruit_PN532.h>
  #define PN532_IRQ   4
  #define PN532_RESET 5
  Adafruit_PN532 nfc(PN532_IRQ, PN532_RESET, &Wire);
#endif

// ====================================================
// PIN DEFINITIONS FOR LEDS AND BUZZER
// ====================================================
#define BLUE_LED_PIN   2   // Wi-Fi Status Indicator
#define GREEN_LED_PIN  12  // Real / Genuine Medicine Verified
#define RED_LED_PIN    14  // Fake / Counterfeit Alert
#define BUZZER_PIN     13  // Audio Feedback Buzzer

// ====================================================
// WI-FI CREDENTIALS & BACKEND SETTINGS
// ====================================================
const char* WIFI_SSID     = "Nothing Phone (3a)_2505";
const char* WIFI_PASSWORD = "praveen DSP";

// Put your Render URL here (e.g. "https://med-xxxx.onrender.com")
// Or for local testing: "http://YOUR_PC_IP:4000"
const char* API_BASE_URL   = "https://med-rfid.onrender.com"; // UPDATE WITH YOUR RENDER URL
const char* DEVICE_API_KEY = "esp32-device-secure-key-9988776655";
const char* DEVICE_ID      = "esp32-medicine-reader-01";
const char* FIRMWARE_VER   = "1.3.0";

unsigned long lastHeartbeat = 0;
unsigned long lastScanSent  = 0;
String lastUid              = "";
const unsigned long HEARTBEAT_INTERVAL_MS = 25000; // Send heartbeat & IP every 25s
const unsigned long DUPLICATE_GUARD_MS    = 2500;  // Prevent re-scanning same tag within 2.5s

// Generate standard UUIDv4
String makeUuid() {
  uint8_t b[16];
  for (int i = 0; i < 16; i += 4) {
    uint32_t r = esp_random();
    memcpy(&b[i], &r, 4);
  }
  b[6] = (b[6] & 0x0F) | 0x40;
  b[8] = (b[8] & 0x3F) | 0x80;
  char out[37];
  snprintf(out, sizeof(out),
    "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
    b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
    b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]);
  return String(out);
}

// Format UID byte array to hex string (e.g. 04:A2:3B:5C)
String formatUid(byte* buffer, byte bufferSize) {
  String uidStr = "";
  for (byte i = 0; i < bufferSize; i++) {
    if (buffer[i] < 0x10) uidStr += "0";
    uidStr += String(buffer[i], HEX);
    if (i < bufferSize - 1) uidStr += ":";
  }
  uidStr.toUpperCase();
  return uidStr;
}

// ----------------------------------------------------
// BUZZER MODES
// ----------------------------------------------------
void playBuzzerTone(unsigned int frequency, unsigned long durationMs) {
  tone(BUZZER_PIN, frequency, durationMs);
  delay(durationMs);
  noTone(BUZZER_PIN);
}

// Mode 1: Wi-Fi Connected Chime
void buzzerWifiConnected() {
  playBuzzerTone(2000, 100);
  delay(50);
  playBuzzerTone(2800, 180);
}

// Mode 2: Authentic Medicine Verified (Positive high chime)
void buzzerRealMedicine() {
  playBuzzerTone(3000, 280);
}

// Mode 3: Counterfeit / Fake Medicine Warning (Alarm siren bursts)
void buzzerFakeMedicine() {
  for (int i = 0; i < 3; i++) {
    playBuzzerTone(1200, 140);
    delay(80);
  }
}

// ----------------------------------------------------
// LED FEEDBACK MODES
// ----------------------------------------------------
void indicateRealMedicine() {
  Serial.println(">>> [FEEDBACK] REAL MEDICINE CONFIRMED -> GREEN LED ON");
  digitalWrite(GREEN_LED_PIN, HIGH);
  digitalWrite(RED_LED_PIN, LOW);
  buzzerRealMedicine();
  delay(1800);
  digitalWrite(GREEN_LED_PIN, LOW);
}

void indicateFakeMedicine() {
  Serial.println(">>> [FEEDBACK] WARNING: FAKE / UNVERIFIED TAG -> RED LED ALARM");
  digitalWrite(GREEN_LED_PIN, LOW);
  // Flash red LED and sound siren
  for (int i = 0; i < 4; i++) {
    digitalWrite(RED_LED_PIN, HIGH);
    tone(BUZZER_PIN, 1100, 120);
    delay(120);
    digitalWrite(RED_LED_PIN, LOW);
    noTone(BUZZER_PIN);
    delay(80);
  }
  digitalWrite(RED_LED_PIN, LOW);
}

// ----------------------------------------------------
// POST JSON TO SERVER & RECEIVE AUTHENTICATION RESULT
// ----------------------------------------------------
bool postScanToServer(const String& path, JsonDocument& doc, bool& outIsGenuine, String& outMedName) {
  outIsGenuine = false;
  outMedName = "";

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[ERROR] Cannot send scan: Wi-Fi disconnected!");
    return false;
  }

  HTTPClient http;
  String url = String(API_BASE_URL) + path;

  if (url.startsWith("https://")) {
    WiFiClientSecure client;
    client.setInsecure(); // Automatically trust Render SSL certificate
    http.begin(client, url);
  } else {
    WiFiClient client;
    http.begin(client, url);
  }

  http.setTimeout(10000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);

  String requestBody;
  serializeJson(doc, requestBody);

  int httpCode = http.POST(requestBody);
  String response = http.getString();
  http.end();

  Serial.printf("[HTTP %s] Status: %d | Response: %s\n", path.c_str(), httpCode, response.c_str());

  if (httpCode >= 200 && httpCode < 300) {
    JsonDocument resDoc;
    DeserializationError err = deserializeJson(resDoc, response);
    if (!err) {
      outIsGenuine = resDoc["is_genuine"] | false;
      outMedName   = resDoc["medicine_name"].as<String>();
      return true;
    }
  }
  return false;
}

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;

  JsonDocument doc;
  doc["device_id"]        = DEVICE_ID;
  doc["local_ip"]         = WiFi.localIP().toString();
  doc["firmware_version"] = FIRMWARE_VER;

  Serial.printf("[HEARTBEAT] Publishing live ESP32 IP: %s\n", WiFi.localIP().toString().c_str());

  HTTPClient http;
  String url = String(API_BASE_URL) + "/api/device/heartbeat";
  if (url.startsWith("https://")) {
    WiFiClientSecure client;
    client.setInsecure();
    http.begin(client, url);
  } else {
    WiFiClient client;
    http.begin(client, url);
  }

  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);
  String body;
  serializeJson(doc, body);
  http.POST(body);
  http.end();
}

void processTagScan(const String& uid) {
  JsonDocument doc;
  doc["tag_uid"]   = uid;
  doc["device_id"] = DEVICE_ID;
  doc["event_id"]  = makeUuid();

  Serial.printf("\n=================================================\n");
  Serial.printf(">>> SCAN DETECTED: %s\n", uid.c_str());
  Serial.printf("=================================================\n");

  bool isGenuine = false;
  String medName = "";
  bool ok = postScanToServer("/api/scans", doc, isGenuine, medName);

  if (ok && isGenuine) {
    Serial.printf("✓ AUTHENTIC MEDICINE: %s\n", medName.c_str());
    indicateRealMedicine();
  } else {
    Serial.println("✗ SUSPECT / COUNTERFEIT MEDICINE ALERT!");
    indicateFakeMedicine();
  }
}

// ----------------------------------------------------
// AUTO-CONNECT TO WI-FI (EVERY TIME)
// ----------------------------------------------------
void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("\nConnecting to Wi-Fi SSID: '%s'", WIFI_SSID);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(350);
    Serial.print(".");
    // Blink Blue LED while connecting
    digitalWrite(BLUE_LED_PIN, !digitalRead(BLUE_LED_PIN));
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(BLUE_LED_PIN, HIGH); // Blue LED Solid ON when connected
    Serial.println("=================================================");
    Serial.println("✓ WI-FI CONNECTED!");
    Serial.print("  ESP32 Local IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("  Gateway:        ");
    Serial.println(WiFi.gatewayIP());
    Serial.print("  Target Backend: ");
    Serial.println(API_BASE_URL);
    Serial.println("=================================================");
    buzzerWifiConnected();
    sendHeartbeat();
  } else {
    digitalWrite(BLUE_LED_PIN, LOW); // Turn off if not connected
    Serial.println("✗ Connection failed. Auto-reconnecting in background...");
  }
}

void setup() {
  Serial.begin(115200);

  // Initialize LED & Buzzer Pins
  pinMode(BLUE_LED_PIN, OUTPUT);
  pinMode(GREEN_LED_PIN, OUTPUT);
  pinMode(RED_LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  digitalWrite(BLUE_LED_PIN, LOW);
  digitalWrite(GREEN_LED_PIN, LOW);
  digitalWrite(RED_LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  delay(600);
  Serial.println("\n\n=================================================");
  Serial.println("  MedTrack RFID Smart Medicine Authentication    ");
  Serial.println("  ESP32 Firmware v1.3.0 - Hardware Ready         ");
  Serial.println("=================================================");

  // Connect to Wi-Fi
  connectWifi();

#if USE_RC522
  SPI.begin();
  rfid.PCD_Init();
  delay(80);
  Serial.println("✓ RFID-RC522 Initialized over SPI.");
  Serial.println("  Pins: SS=5, SCK=18, MOSI=23, MISO=19, RST=22");
  rfid.PCD_DumpVersionToSerial();
#else
  Wire.begin(21, 22);
  nfc.begin();
  uint32_t versiondata = nfc.getFirmwareVersion();
  if (!versiondata) {
    Serial.println("[ERROR] PN532 not detected. Check I2C wiring (SDA=21, SCL=22).");
  } else {
    Serial.println("✓ Adafruit PN532 Initialized over I2C.");
    nfc.SAMConfig();
  }
#endif

  Serial.println("✓ Ready for RFID Medicine Tag Scans.");
}

void loop() {
  // Auto-connect watchdog
  if (WiFi.status() != WL_CONNECTED) {
    digitalWrite(BLUE_LED_PIN, LOW);
    static unsigned long lastReconnectAttempt = 0;
    if (millis() - lastReconnectAttempt > 6000) {
      lastReconnectAttempt = millis();
      Serial.println("[Wi-Fi Watchdog] Reconnecting to Wi-Fi...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
  } else {
    digitalWrite(BLUE_LED_PIN, HIGH); // Blue LED stays Solid ON while Wi-Fi is active
    if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
      lastHeartbeat = millis();
      sendHeartbeat();
    }
  }

#if USE_RC522
  // Check for MFRC522 Card
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    delay(40);
    return;
  }

  String currentUid = formatUid(rfid.uid.uidByte, rfid.uid.size);

  if (currentUid != lastUid || (millis() - lastScanSent > DUPLICATE_GUARD_MS)) {
    processTagScan(currentUid);
    lastUid = currentUid;
    lastScanSent = millis();
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

#else
  // Check for PN532 Card
  uint8_t uid[7];
  uint8_t uidLength = 0;
  bool found = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 50);

  if (found) {
    String currentUid = formatUid(uid, uidLength);

    if (currentUid != lastUid || (millis() - lastScanSent > DUPLICATE_GUARD_MS)) {
      processTagScan(currentUid);
      lastUid = currentUid;
      lastScanSent = millis();
    }
    delay(200);
  }
#endif

  delay(40);
}
