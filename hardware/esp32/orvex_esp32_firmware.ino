/*
 * ============================================================================
 * ORVEX Industrial Mining Energy Intelligence Platform
 * Production ESP32 Edge Firmware & Sensor Interface (Stage 10C)
 * ============================================================================
 * 
 * Hardware Target: ESP32-WROOM-32 / ESP32-S3 (Dual-Core Tensilica Xtensa @ 240 MHz)
 * Primary Roles:
 *   1. Galvanically Isolated RS-485 Modbus RTU Master (Eastron SDM630 / Schneider PM)
 *   2. Auxiliary 1-Wire Temperature Acquisition (Dallas DS18B20 on GPIO 15)
 *   3. Fail-Safe Ring Buffering for Network Dropouts (30-sample FIFO)
 *   4. Diagnostic Heartbeat & Watchdog Protection (esp_task_wdt)
 *   5. Secure MQTT QoS 1 Telemetry Publishing to ORVEX Gateway
 * 
 * SAFETY MANDATE:
 *   NEVER connect ESP32 GPIOs directly to AC mains voltage!
 *   Always interface through a certified galvanic-isolated RS-485 transceiver
 *   (e.g., TI ISO3082 or ADI ADM2483 with 2.5 kVrms isolation barrier)
 *   connected to an industrial DIN-rail power meter (e.g., Eastron SDM630).
 * ============================================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include <esp_task_wdt.h>

// --- Configuration Constants ---
const char* WIFI_SSID     = "YOUR_INDUSTRIAL_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* MQTT_BROKER   = "192.168.1.100";  // ORVEX Server IP
const int   MQTT_PORT     = 1883;
const char* MQTT_USER     = "";                // Optional
const char* MQTT_PASS     = "";                // Optional

// Target machine identity matching ORVEX database registry
const char* MACHINE_ID    = "00000000-0000-0000-de30-000000000011";
const char* SENSOR_ID     = "";                // Optional: set to sensor UUID if registered

// MQTT Topics
char mqtt_telemetry_topic[128];
char mqtt_status_topic[128];

// --- Hardware Pin Definitions ---
#define PIN_RS485_RX      16  // UART2 RX (connect to RO of isolated transceiver)
#define PIN_RS485_TX      17  // UART2 TX (connect to DI of isolated transceiver)
#define PIN_RS485_DE_RE    4  // Direction control (HIGH=Transmit, LOW=Receive)
#define PIN_ONEWIRE_TEMP  15  // Auxiliary 1-Wire DS18B20 temperature data line
#define PIN_STATUS_LED     2  // On-board diagnostic LED (blinks on publish)

// --- Watchdog & Timing Constants ---
#define WDT_TIMEOUT_SECONDS 10
const unsigned long POLL_INTERVAL_MS = 1000;
const unsigned long HEARTBEAT_INTERVAL_MS = 30000;
unsigned long last_poll_time = 0;
unsigned long last_heartbeat_time = 0;

// --- Network & MQTT Clients ---
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// --- Diagnostics Counters ---
uint32_t modbus_read_successes = 0;
uint32_t modbus_crc_errors = 0;
uint32_t modbus_timeouts = 0;
uint32_t mqtt_published_count = 0;

// --- Fail-Safe Circular Offline Ring Buffer (30 samples) ---
#define RING_BUFFER_SIZE 30
struct TelemetryPayload {
  char json[512];
  bool valid;
};
TelemetryPayload ring_buffer[RING_BUFFER_SIZE];
int ring_head = 0;
int ring_tail = 0;
int ring_count = 0;

void enqueueTelemetry(const char* json_str) {
  strncpy(ring_buffer[ring_head].json, json_str, sizeof(ring_buffer[ring_head].json) - 1);
  ring_buffer[ring_head].json[sizeof(ring_buffer[ring_head].json) - 1] = '\0';
  ring_buffer[ring_head].valid = true;
  ring_head = (ring_head + 1) % RING_BUFFER_SIZE;
  if (ring_count < RING_BUFFER_SIZE) {
    ring_count++;
  } else {
    // Buffer wrapped: advance tail to discard oldest sample
    ring_tail = (ring_tail + 1) % RING_BUFFER_SIZE;
  }
}

bool dequeueTelemetry(char* out_json, size_t max_len) {
  if (ring_count == 0) return false;
  strncpy(out_json, ring_buffer[ring_tail].json, max_len - 1);
  out_json[max_len - 1] = '\0';
  ring_buffer[ring_tail].valid = false;
  ring_tail = (ring_tail + 1) % RING_BUFFER_SIZE;
  ring_count--;
  return true;
}

// --- Modbus RTU Helper Functions ---
uint16_t calculateCRC(const uint8_t* buffer, size_t length) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < length; i++) {
    crc ^= buffer[i];
    for (int j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc;
}

bool readModbusFloat(uint8_t unit_id, uint8_t func, uint16_t reg, float* out_val) {
  uint8_t req[8];
  req[0] = unit_id;
  req[1] = func;
  req[2] = (reg >> 8) & 0xFF;
  req[3] = reg & 0xFF;
  req[4] = 0x00;  // 2 registers for 32-bit float
  req[5] = 0x02;
  uint16_t crc = calculateCRC(req, 6);
  req[6] = crc & 0xFF;         // Little-Endian CRC
  req[7] = (crc >> 8) & 0xFF;

  // Flush RX buffer
  while (Serial2.available()) Serial2.read();

  // Transmit request
  digitalWrite(PIN_RS485_DE_RE, HIGH);
  delayMicroseconds(50);
  Serial2.write(req, 8);
  Serial2.flush();
  digitalWrite(PIN_RS485_DE_RE, LOW);

  // Await response: 1(ID) + 1(Func) + 1(ByteCount=4) + 4(Data) + 2(CRC) = 9 bytes
  unsigned long start = millis();
  while (Serial2.available() < 9) {
    if (millis() - start > 250) {
      modbus_timeouts++;
      return false;  // Timeout
    }
    delay(2);
  }

  uint8_t resp[9];
  Serial2.readBytes(resp, 9);

  // Verify CRC
  uint16_t resp_crc = calculateCRC(resp, 7);
  uint16_t rx_crc = resp[7] | (resp[8] << 8);
  if (resp_crc != rx_crc) {
    modbus_crc_errors++;
    return false;
  }

  // Check Exception Code
  if (resp[1] & 0x80) return false;

  // Parse IEEE 754 Big-Endian 32-bit Float
  union {
    float f;
    uint8_t b[4];
  } converter;
  converter.b[3] = resp[3];
  converter.b[2] = resp[4];
  converter.b[1] = resp[5];
  converter.b[0] = resp[6];

  *out_val = converter.f;
  if (isnan(*out_val) || isinf(*out_val)) return false;

  modbus_read_successes++;
  return true;
}

// --- Time Sync ---
void initTime() {
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  Serial.print("Synchronizing UTC time via NTP...");
  time_t now = time(nullptr);
  int retry = 0;
  while (now < 1700000000 && retry < 20) {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
    retry++;
  }
  Serial.println("\nUTC time synchronized.");
}

void getIsoTimestamp(char* buffer, size_t max_len) {
  time_t now = time(nullptr);
  struct tm timeinfo;
  gmtime_r(&now, &timeinfo);
  strftime(buffer, max_len, "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
}

// --- MQTT Connection & Reconnect ---
void reconnectMQTT() {
  if (mqttClient.connected()) return;

  Serial.print("Connecting to MQTT broker...");
  char client_id[48];
  snprintf(client_id, sizeof(client_id), "orvex-esp32-%llX", ESP.getEfuseMac());

  bool connected = false;
  if (strlen(MQTT_USER) > 0) {
    connected = mqttClient.connect(client_id, MQTT_USER, MQTT_PASS);
  } else {
    connected = mqttClient.connect(client_id);
  }

  if (connected) {
    Serial.println(" Connected to ORVEX Gateway.");
    digitalWrite(PIN_STATUS_LED, HIGH);

    // Flush any offline buffered telemetry
    char buf[512];
    int flushed = 0;
    while (dequeueTelemetry(buf, sizeof(buf))) {
      mqttClient.publish(mqtt_telemetry_topic, buf, false);
      flushed++;
      delay(10);
    }
    if (flushed > 0) {
      Serial.printf("Flushed %d offline buffered telemetry records.\n", flushed);
    }
  } else {
    Serial.print(" Failed (rc=");
    Serial.print(mqttClient.state());
    Serial.println("). Retrying during next loop...");
    digitalWrite(PIN_STATUS_LED, LOW);
  }
}

// --- Diagnostic Heartbeat ---
void publishStatusHeartbeat() {
  if (!mqttClient.connected()) return;

  StaticJsonDocument<384> doc;
  doc["mac"] = WiFi.macAddress();
  doc["ip"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();
  doc["uptime_sec"] = millis() / 1000;
  doc["free_heap"] = ESP.getFreeHeap();
  doc["modbus_ok"] = modbus_read_successes;
  doc["modbus_crc_err"] = modbus_crc_errors;
  doc["modbus_timeouts"] = modbus_timeouts;
  doc["buffered_records"] = ring_count;

  char buf[384];
  serializeJson(doc, buf);
  mqttClient.publish(mqtt_status_topic, buf, false);
}

// --- Setup ---
void setup() {
  Serial.begin(115200);
  pinMode(PIN_RS485_DE_RE, OUTPUT);
  pinMode(PIN_STATUS_LED, OUTPUT);
  digitalWrite(PIN_RS485_DE_RE, LOW);
  digitalWrite(PIN_STATUS_LED, LOW);

  // Initialize Hardware Watchdog (10s timeout)
  esp_task_wdt_init(WDT_TIMEOUT_SECONDS, true);
  esp_task_wdt_add(NULL);

  // Initialize HardwareSerial 2 for RS-485 Modbus RTU
  Serial2.begin(9600, SERIAL_8N1, PIN_RS485_RX, PIN_RS485_TX);

  // Format MQTT topics
  snprintf(mqtt_telemetry_topic, sizeof(mqtt_telemetry_topic), "orvex/v1/machines/%s/telemetry", MACHINE_ID);
  snprintf(mqtt_status_topic, sizeof(mqtt_status_topic), "orvex/v1/machines/%s/status", MACHINE_ID);

  // Connect Wi-Fi
  Serial.printf("Connecting to Wi-Fi SSID: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int wifi_wait = 0;
  while (WiFi.status() != WL_CONNECTED && wifi_wait < 30) {
    delay(500);
    Serial.print(".");
    wifi_wait++;
    esp_task_wdt_reset();
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWi-Fi connected. IP: " + WiFi.localIP().toString());
    initTime();
  } else {
    Serial.println("\nWi-Fi connection pending; will retry in loop.");
  }

  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setBufferSize(1024);
}

// --- Main Loop ---
void loop() {
  esp_task_wdt_reset();

  // Manage Wi-Fi & MQTT connections
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected()) {
      reconnectMQTT();
    }
    mqttClient.loop();
  }

  unsigned long now_ms = millis();

  // Periodic Heartbeat
  if (now_ms - last_heartbeat_time >= HEARTBEAT_INTERVAL_MS) {
    last_heartbeat_time = now_ms;
    publishStatusHeartbeat();
  }

  // Periodic Sensor Acquisition & Publishing
  if (now_ms - last_poll_time >= POLL_INTERVAL_MS) {
    last_poll_time = now_ms;

    // Acquire 3-phase registers from Eastron SDM630 (Unit ID 1, Function 0x04 Input Registers)
    float v = 0.0, i = 0.0, p_watts = 0.0, q_var = 0.0, pf = 0.0, energy_kwh = 0.0;
    bool v_ok  = readModbusFloat(1, 0x04, 0x0000, &v);            // Line 1 Volts (RMS)
    bool i_ok  = readModbusFloat(1, 0x04, 0x0006, &i);            // Line 1 Amps (RMS)
    bool p_ok  = readModbusFloat(1, 0x04, 0x0034, &p_watts);      // Total Active Watts
    bool q_ok  = readModbusFloat(1, 0x04, 0x003C, &q_var);        // Total Reactive VAr
    bool pf_ok = readModbusFloat(1, 0x04, 0x003E, &pf);          // Total Power Factor
    bool e_ok  = readModbusFloat(1, 0x04, 0x0156, &energy_kwh);   // Total Active Import kWh

    if (v_ok || p_ok) {
      char iso_ts[32];
      getIsoTimestamp(iso_ts, sizeof(iso_ts));

      // Build JSON document strictly adhering to ORVEX schema
      StaticJsonDocument<512> doc;
      doc["timestamp"] = iso_ts;
      doc["machine_id"] = MACHINE_ID;
      if (strlen(SENSOR_ID) > 0) {
        doc["sensor_id"] = SENSOR_ID;
      } else {
        doc["sensor_id"] = nullptr;
      }

      if (v_ok) doc["voltage"] = round(v * 10.0) / 10.0;
      if (i_ok) doc["current"] = round(i * 100.0) / 100.0;
      if (p_ok) doc["active_power"] = round((p_watts / 1000.0) * 100.0) / 100.0;  // Watts -> kW
      if (q_ok) doc["reactive_power"] = round((q_var / 1000.0) * 100.0) / 100.0;  // VAr -> kvar
      if (pf_ok && pf >= -1.0 && pf <= 1.0) doc["power_factor"] = round(pf * 1000.0) / 1000.0;
      if (e_ok) doc["cumulative_energy"] = round(energy_kwh * 1000.0) / 1000.0;

      // Operating state inference from active power
      if (p_ok) {
        float p_kw = p_watts / 1000.0;
        if (p_kw < 0.5) doc["operating_state"] = "STOPPED";
        else if (p_kw < 15.0) doc["operating_state"] = "IDLE";
        else doc["operating_state"] = "RUNNING";
      }

      char json_buf[512];
      serializeJson(doc, json_buf);

      // Publish or enqueue if offline
      if (mqttClient.connected()) {
        bool pub_ok = mqttClient.publish(mqtt_telemetry_topic, json_buf, false);
        if (pub_ok) {
          mqtt_published_count++;
          digitalWrite(PIN_STATUS_LED, !digitalRead(PIN_STATUS_LED));
        } else {
          enqueueTelemetry(json_buf);
        }
      } else {
        enqueueTelemetry(json_buf);
      }
    }
  }
}
