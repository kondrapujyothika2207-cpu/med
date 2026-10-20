#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_PN532.h>
#include <ArduinoJson.h>
#include <esp_system.h>

// ESP32 DevKit default I2C pins: SDA=21, SCL=22.
// Set the PN532 breakout switches/jumpers to I2C mode.
#define PN532_IRQ   (4)
#define PN532_RESET (5)
Adafruit_PN532 nfc(PN532_IRQ, PN532_RESET, &Wire);

const char* WIFI_SSID = "REPLACE_WIFI_NAME";
const char* WIFI_PASSWORD = "REPLACE_WIFI_PASSWORD";

// Use your Render backend URL for cloud mode, or a trusted LAN API URL for local testing.
// Do not append /api here.
const char* API_BASE_URL = "https://YOUR-BACKEND.onrender.com";
const char* DEVICE_API_KEY = "REPLACE_WITH_LONG_RANDOM_DEVICE_KEY";
const char* DEVICE_ID = "esp32-medicine-01";
const char* FIRMWARE_VERSION = "1.0.0";

unsigned long lastHeartbeat = 0;
unsigned long lastScanSent = 0;
String lastUid = "";
const unsigned long HEARTBEAT_INTERVAL_MS = 30000;
const unsigned long DUPLICATE_GUARD_MS = 2500;

String makeUuid() {
  uint8_t b[16];
  for (int i=0;i<16;i+=4) {
    uint32_t r = esp_random();
    memcpy(&b[i], &r, 4);
  }
  b[6] = (b[6] & 0x0F) | 0x40;
  b[8] = (b[8] & 0x3F) | 0x80;
  char out[37];
  snprintf(out, sizeof(out),
    "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
    b[0],b[1],b[2],b[3],b[4],b[5],b[6],b[7],
    b[8],b[9],b[10],b[11],b[12],b[13],b[14],b[15]);
  return String(out);
}

String uidToHex(uint8_t* uid, uint8_t uidLength) {
  String result;
  for (uint8_t i = 0; i < uidLength; i++) {
    if (uid[i] < 0x10) result += "0";
    result += String(uid[i], HEX);
  }
  result.toUpperCase();
  return result;
}

bool postJson(const String& path, JsonDocument& doc) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  String url = String(API_BASE_URL) + path;
  http.begin(url);
  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);
  String body;
  serializeJson(doc, body);
  int status = http.POST(body);
  String response = http.getString();
  http.end();
  Serial.printf("POST %s -> %d %s\n", path.c_str(), status, response.c_str());
  return status >= 200 && status < 300;
}

void sendScan(const String& uid) {
  StaticJsonDocument<256> doc;
  doc["tag_uid"] = uid;
  doc["device_id"] = DEVICE_ID;
  doc["event_id"] = makeUuid();
  bool ok = postJson("/api/scans", doc);
  if (!ok) {
    Serial.println("Scan send failed. This starter firmware logs the failure; add a persistent queue for offline delivery.");
  }
}

void sendHeartbeat() {
  StaticJsonDocument<256> doc;
  doc["device_id"] = DEVICE_ID;
  doc["local_ip"] = WiFi.localIP().toString();
  doc["firmware_version"] = FIRMWARE_VERSION;
  postJson("/api/device/heartbeat", doc);
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 20000) {
    delay(400); Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Wi-Fi connected. Local IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Wi-Fi not connected; will retry.");
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Wire.begin(21, 22);
  connectWifi();

  nfc.begin();
  uint32_t version = nfc.getFirmwareVersion();
  if (!version) {
    Serial.println("PN532 not found. Check I2C wiring, power, and interface switch settings.");
    while (true) delay(1000);
  }
  nfc.SAMConfig();
  Serial.println("PN532 ready. Present an NFC tag.");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastWifiRetry = 0;
    if (millis() - lastWifiRetry > 10000) {
      lastWifiRetry = millis();
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
  } else if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeat = millis();
    sendHeartbeat();
  }

  uint8_t uid[7];
  uint8_t uidLength = 0;
  bool found = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 80);
  if (found) {
    String currentUid = uidToHex(uid, uidLength);
    Serial.print("RFID UID: ");
    Serial.println(currentUid);
    if (currentUid != lastUid || millis() - lastScanSent > DUPLICATE_GUARD_MS) {
      sendScan(currentUid);
      lastUid = currentUid;
      lastScanSent = millis();
    }
    delay(250);
  }
}
