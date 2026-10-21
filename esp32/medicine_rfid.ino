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
 * 1) PN532 I2C 4-WIRE SETUP (PRIMARY DEFAULT):
 *    - SDA           -> GPIO 21
 *    - SCL           -> GPIO 22
 *    - VCC           -> 5V (or 3.3V)
 *    - GND           -> GND
 *    - IRQ           -> (Leave Disconnected)
 *    - RST           -> (Leave Disconnected)
 *    * DIP Switch Settings on PN532:
 *      Channel 1 (SEL0) = ON  (1)
 *      Channel 2 (SEL1) = OFF (0)
 * 
 * 2) LEDS & BUZZER WIRING:
 *    - Blue LED (+)  -> GPIO 2  (Wi-Fi Status: Solid ON when connected)
 *    - Green LED (+) -> GPIO 12 (Real Medicine: Solid ON for 2s)
 *    - Red LED (+)   -> GPIO 14 (Fake Medicine: Rapid alarm warning flashes)
 *    - Buzzer (+)    -> GPIO 13 (Audio Feedback: 3 distinct modes)
 * 
 * 3) OPTIONAL RC522 SPI WIRING (Alternative if toggled):
 *    - SDA (SS)=GPIO 5, SCK=GPIO 18, MOSI=GPIO 23, MISO=GPIO 19, RST=GPIO 22, 3.3V=3.3V
 * ==============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <esp_system.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

// ====================================================
// HARDWARE SELECTOR
// Set USE_RC522 to 0 for PN532 (I2C) - ACTIVE DEFAULT
// Set USE_RC522 to 1 for RC522 (SPI)
// ====================================================
#define USE_RC522 0

#if USE_RC522
  #include <SPI.h>
  #include <MFRC522.h>
  #define SS_PIN  5
  #define RST_PIN 22
  MFRC522 rfid(SS_PIN, RST_PIN);
#else
  #include <Wire.h>
  #include <Adafruit_PN532.h>
  // Pure 4-wire I2C setup (VCC, GND, SDA=21, SCL=22). Pass -1, -1 for IRQ and RESET
  Adafruit_PN532 nfc(-1, -1);
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

// Target Backends: Primary Cloud Render URL + Local Fallback
const char* API_BASE_URL_PRIMARY  = "https://med-rfid.onrender.com"; // Primary cloud website
const char* API_BASE_URL_FALLBACK = "http://10.36.170.52:4000";     // Local laptop backend
String currentApiBaseUrl          = API_BASE_URL_PRIMARY;

const char* DEVICE_API_KEY = "esp32-device-secure-key-9988776655";
const char* DEVICE_ID      = "esp32-medicine-reader-01";
const char* FIRMWARE_VER   = "1.4.1";

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
// (Blue turns OFF during scan; Green or Red turns ON;
//  after scan, Blue turns back ON if Wi-Fi connected)
// ----------------------------------------------------
void indicateRealMedicine() {
  Serial.println(">>> [FEEDBACK] REAL MEDICINE CONFIRMED -> GREEN LED ON (BLUE LED OFF)");
  digitalWrite(BLUE_LED_PIN, LOW);  // Turn off Blue LED during scan result
  digitalWrite(RED_LED_PIN, LOW);
  digitalWrite(GREEN_LED_PIN, HIGH); // Solid Green ON for authentic medicine

  buzzerRealMedicine();
  delay(1800);

  digitalWrite(GREEN_LED_PIN, LOW); // Turn off Green LED

  // Restore Blue LED if Wi-Fi is connected
  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(BLUE_LED_PIN, HIGH);
  }
}

void indicateFakeMedicine() {
  Serial.println(">>> [FEEDBACK] WARNING: FAKE / UNVERIFIED TAG -> RED LED ALARM (BLUE LED OFF)");
  digitalWrite(BLUE_LED_PIN, LOW);  // Turn off Blue LED during scan result
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
  digitalWrite(RED_LED_PIN, LOW); // Turn off Red LED

  // Restore Blue LED if Wi-Fi is connected
  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(BLUE_LED_PIN, HIGH);
  }
}

// ----------------------------------------------------
// HTTP HELPER (WITH AUTO-FALLBACK BETWEEN RENDER & LOCAL)
// ----------------------------------------------------
bool executeHttpJsonPost(const String& baseUrl, const String& path, JsonDocument& doc, int& outCode, String& outResponse) {
  HTTPClient http;
  String url = baseUrl + path;

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

  outCode = http.POST(requestBody);
  outResponse = (outCode > 0) ? http.getString() : HTTPClient::errorToString(outCode);
  http.end();

  Serial.printf("[HTTP POST %s] Status: %d | Response: %s\n", url.c_str(), outCode, outResponse.c_str());
  return (outCode >= 200 && outCode < 300);
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

  int httpCode = 0;
  String response = "";
  bool ok = executeHttpJsonPost(currentApiBaseUrl, path, doc, httpCode, response);

  // If primary website returns 404 or connection fails, auto-fallback to alternate URL
  if (!ok && (httpCode == 404 || httpCode < 0)) {
    String alternativeUrl = (currentApiBaseUrl == API_BASE_URL_PRIMARY) ? API_BASE_URL_FALLBACK : API_BASE_URL_PRIMARY;
    Serial.printf("[BACKEND] Retrying scan with alternative backend: %s\n", alternativeUrl.c_str());
    ok = executeHttpJsonPost(alternativeUrl, path, doc, httpCode, response);
    if (ok) {
      currentApiBaseUrl = alternativeUrl;
      Serial.printf("[BACKEND] Successfully switched active backend to: %s\n", currentApiBaseUrl.c_str());
    }
  }

  if (ok) {
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

  int httpCode = 0;
  String response = "";
  bool ok = executeHttpJsonPost(currentApiBaseUrl, "/api/device/heartbeat", doc, httpCode, response);

  // If primary returns 404 or connection fails, auto-fallback to alternate URL
  if (!ok && (httpCode == 404 || httpCode < 0)) {
    String alternativeUrl = (currentApiBaseUrl == API_BASE_URL_PRIMARY) ? API_BASE_URL_FALLBACK : API_BASE_URL_PRIMARY;
    Serial.printf("[HEARTBEAT] Retrying heartbeat with alternative backend: %s\n", alternativeUrl.c_str());
    ok = executeHttpJsonPost(alternativeUrl, "/api/device/heartbeat", doc, httpCode, response);
    if (ok) {
      currentApiBaseUrl = alternativeUrl;
      Serial.printf("[HEARTBEAT] Active backend updated to: %s\n", currentApiBaseUrl.c_str());
    }
  }
}

void processTagScan(const String& uid) {
  // Turn OFF Blue LED immediately upon card detection
  digitalWrite(BLUE_LED_PIN, LOW);

  JsonDocument doc;
  doc["tag_uid"]   = uid;
  doc["device_id"] = DEVICE_ID;
  doc["event_id"]  = makeUuid();

  Serial.printf("\n=================================================\n");
  Serial.printf(">>> SCAN DETECTED: %s\n", uid.c_str());
  Serial.printf("=================================================\n");

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ Wi-Fi is currently disconnected. Cannot verify with server.");
    playBuzzerTone(1000, 200);
    delay(400);
    return;
  }

  bool isGenuine = false;
  String medName = "";
  bool ok = postScanToServer("/api/scans", doc, isGenuine, medName);

  if (ok && isGenuine) {
    Serial.printf("✓ AUTHENTIC MEDICINE: %s\n", medName.c_str());
    indicateRealMedicine(); // Green LED ON for 2s (Blue is OFF)
  } else if (ok && !isGenuine) {
    Serial.println("✗ SUSPECT / COUNTERFEIT MEDICINE ALERT!");
    indicateFakeMedicine(); // Red LED flashes with alarm (Blue is OFF)
  } else {
    Serial.println("⚠️ Server communication failed. Not classifying as fake.");
    playBuzzerTone(1000, 200);
    delay(400);
  }

  // Restore Blue LED if Wi-Fi remains connected
  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(BLUE_LED_PIN, HIGH);
  }
}

// ----------------------------------------------------
// WI-FI DIAGNOSTICS & AUTO-CONNECT
// ----------------------------------------------------
const char* getWifiStatusText(wl_status_t status) {
  switch (status) {
    case WL_IDLE_STATUS:     return "Idle";
    case WL_NO_SSID_AVAIL:   return "SSID not found (Check 2.4GHz / Hotspot turned on)";
    case WL_SCAN_COMPLETED:  return "Scan completed";
    case WL_CONNECTED:       return "Connected";
    case WL_CONNECT_FAILED:  return "Connect failed (Check password / WPA2 security)";
    case WL_CONNECTION_LOST: return "Connection lost";
    case WL_DISCONNECTED:    return "Disconnected";
    default:                 return "Unknown";
  }
}

void connectWifi() {
  WiFi.persistent(false); // Do not write Wi-Fi config to flash on every boot
  WiFi.mode(WIFI_STA);
  WiFi.setTxPower(WIFI_POWER_15dBm); // Mitigate current surge that triggers brownout reset
  WiFi.setAutoReconnect(true);

  Serial.printf("\nConnecting to Wi-Fi SSID: '%s'...\n", WIFI_SSID);
  Serial.flush();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  // Quick initial check (up to 5 seconds) - never hang or block setup!
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 5000) {
    delay(250);
    yield();
    Serial.print(".");
    digitalWrite(BLUE_LED_PIN, !digitalRead(BLUE_LED_PIN)); // Blink Blue LED while connecting
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(BLUE_LED_PIN, HIGH); // Blue LED Solid ON
    Serial.println("=================================================");
    Serial.println("✓ WI-FI CONNECTED!");
    Serial.print("  ESP32 Local IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("  Target Backend: ");
    Serial.println(currentApiBaseUrl);
    Serial.println("=================================================");
    buzzerWifiConnected();
    sendHeartbeat();
  } else {
    digitalWrite(BLUE_LED_PIN, LOW);
    Serial.printf("ℹ [Wi-Fi] Status: %s (will auto-connect in background).\n", getWifiStatusText(WiFi.status()));
    Serial.println("  Proceeding to PN532 RFID reader initialization...");
  }
}

void setup() {
  // Disable brownout detector to prevent ESP32 power-sag reboot loops during RF spikes
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

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

  delay(300);
  Serial.println("\n\n=================================================");
  Serial.println("  MedTrack RFID Smart Medicine Authentication    ");
  Serial.println("  ESP32 Firmware v1.4.1 - Hardware Ready         ");
  Serial.println("=================================================");

  // Connect to Wi-Fi (non-blocking)
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
  delay(120);
  nfc.begin();
  uint32_t versiondata = nfc.getFirmwareVersion();
  if (!versiondata) {
    Serial.println("\n[ERROR] PN532 NFC module not responding on I2C (SDA=GPIO 21, SCL=GPIO 22)!");
    Serial.println("  Troubleshooting Checklist:");
    Serial.println("  1. DIP Switches: Ensure Channel 1 (SEL0)=ON, Channel 2 (SEL1)=OFF for I2C mode.");
    Serial.println("  2. Wiring: VCC -> 5V/3.3V, GND -> GND, SDA -> GPIO 21, SCL -> GPIO 22.");
    Serial.println("  3. Check that the red power LED on the PN532 board is illuminated.");
  } else {
    Serial.println("=================================================");
    Serial.printf("✓ Adafruit PN532 Initialized over I2C! Chip: PN5%02X\n", (versiondata >> 24) & 0xFF);
    Serial.printf("  Firmware: v%d.%d\n", (versiondata >> 16) & 0xFF, (versiondata >> 8) & 0xFF);
    Serial.println("  I2C Pins: SDA=GPIO 21, SCL=GPIO 22");
    Serial.println("=================================================");
    nfc.SAMConfig();
  }
#endif

  Serial.println("✓ Ready for RFID Medicine Tag Scans.");
}

void loop() {
  // ----------------------------------------------------
  // NON-BLOCKING BACKGROUND WI-FI & HEARTBEAT HANDLER
  // ----------------------------------------------------
  static bool wasConnected = false;
  static unsigned long lastReconnectAttempt = 0;

  if (WiFi.status() == WL_CONNECTED) {
    if (!wasConnected) {
      wasConnected = true;
      digitalWrite(BLUE_LED_PIN, HIGH); // Solid Blue ON when connected
      Serial.println("\n=================================================");
      Serial.println("✓ WI-FI CONNECTED (Background)!");
      Serial.print("  ESP32 Local IP: ");
      Serial.println(WiFi.localIP());
      Serial.println("=================================================");
      buzzerWifiConnected();
      sendHeartbeat();
    } else {
      digitalWrite(BLUE_LED_PIN, HIGH);
    }

    if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
      lastHeartbeat = millis();
      sendHeartbeat();
    }
  } else {
    if (wasConnected) {
      wasConnected = false;
      digitalWrite(BLUE_LED_PIN, LOW); // Turn off Blue LED when disconnected
      Serial.println("[Wi-Fi] Connection lost. Auto-reconnecting in background...");
    } else {
      digitalWrite(BLUE_LED_PIN, LOW);
    }

    // Try background reconnect every 15s without interrupting RFID reading
    if (millis() - lastReconnectAttempt > 15000) {
      lastReconnectAttempt = millis();
      Serial.println("[Wi-Fi Watchdog] Reconnecting in background...");
      WiFi.reconnect();
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
