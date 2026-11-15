# ORVEX — Hardware Integration & Sensor Prototype (Stage 6B)

The Stage 6B hardware subsystem provides a modular, production-minded edge layer to acquire physical sensor readings from industrial equipment and publish them directly into the ORVEX MQTT Gateway, telemetry database, explainable wastage detectors, alert engine, reports, and frontend dashboard.

---

## 1. Measurement Taxonomy: Direct, Derived & Auxiliary

To avoid assuming every sensor is mandatory, ORVEX categorizes operational metrics into three distinct classes:

| Metric | Category | Source / Methodology | Mandatory? | Fallback if Missing |
|---|---|---|---|---|
| **Voltage ($V$)** | Directly Measured | 3-Phase Energy Meter (L1, L2, L3 to Neutral RMS) | Recommended | Stored as `NULL` |
| **Current ($I$)** | Directly Measured | Split-Core Current Transformers on phase conductors | Recommended | Stored as `NULL` |
| **Active Power ($P$)** | Directly Measured | Real-time integrated 3-phase active power in kW | **Essential for wastage detection** | Must be available |
| **Apparent Power ($S$)** | Directly Measured or Derived | Measured by meter, or derived via $S = \sqrt{3} \times V \times I / 1000$ | Optional | Stored as `NULL` |
| **Reactive Power ($Q$)** | Directly Measured or Derived | Measured by meter, or derived via $Q = \sqrt{S^2 - P^2}$ | Optional | Stored as `NULL` |
| **Power Factor ($\text{PF}$)** | Directly Measured or Derived | Measured by meter, or calculated via $\text{PF} = P / S$ | Recommended | Stored as `NULL` |
| **Cumulative Energy ($E$)** | Directly Measured | Active import kWh accumulator register inside meter | Recommended | Backend integrates active power trapezoidally if missing |
| **Load Percent ($\%$)** | Derived | Calculated via $(P / P_{\text{rated}}) \times 100$ when rated kW is known | Derived | Calculated by backend feature engine |
| **Operating State** | Inferred or Auxiliary | Inferred from power thresholds ($P < 0.5\,\text{kW} \rightarrow \text{STOPPED}$, $P < 0.15 \times P_{\text{rated}} \rightarrow \text{IDLE}$, load $< 30\% \rightarrow \text{LOW\_LOAD}$), or from auxiliary contactor switch | Inferred | Backend feature engine infers state |
| **Motor RPM** | External Sensor | Requires inductive proximity sensor, shaft encoder, or optical tachometer | Optional | Preserved as `NULL` |
| **Winding Temp (°C)** | External Sensor | Requires PT100/PT1000 RTD sensor or Modbus temperature module | Optional | Preserved as `NULL` |

> [!IMPORTANT]
> In accordance with ORVEX schema guarantees, measurements that are not physically present on a given installation are explicitly preserved as `None` (`NULL`). **Zero is never substituted for missing data.**

---

## 2. Staged Prototype Architecture

ORVEX supports two hardware deployment paths:

### Path 1: Industrial Edge PC / Gateway with Modbus RTU (Recommended)
An industrial DIN-rail edge computer (e.g. Raspberry Pi CM4 with RS-485 HAT or industrial x86 box PC) connects to a certified 3-phase DIN-rail power meter over an isolated RS-485 bus running Modbus RTU.
- Python daemon [`hardware/collector.py`](collector.py) manages serial acquisition and MQTT transmission.
- Uses [`ModbusRtuAdapter`](adapters/modbus_adapter.py) with pre-configured register profiles (e.g. Eastron SDM630).

### Path 2: Dedicated Microcontroller Bridge (ESP32)
A localized embedded prototype using an ESP32-WROOM-32 or ESP32-S3 with a galvanic-isolated RS-485 transceiver (ISO3082).
- Firmware [`hardware/esp32/orvex_esp32_firmware.ino`](esp32/orvex_esp32_firmware.ino) queries the meter, serializes JSON matching the ORVEX schema, and publishes over Wi-Fi/Ethernet MQTT.

### Path 3: Synthetic Mock Adapter (Development & CI)
When physical hardware is not yet wired, [`MockSensorAdapter`](adapters/mock_adapter.py) generates reproducible industrial waveforms and supports fault injection (disconnections, bus errors, NaN injection, unmeasured field masks) for end-to-end testing without falsifying real hardware validation.

---

## 3. Bill of Materials (BOM) & Component Selection

For physical installation on a 415V/480V 3-phase mining conveyor, pump, or crusher motor:

| Component | Recommended Model / Specification | Purpose | Quantity | Est. Unit Price (USD) |
|---|---|---|---|---|
| **3-Phase DIN-Rail Energy Meter** | **Eastron SDM630M-Modbus V2** (or Schneider Electric Acti9 iEM3255) | Certified IEC 61010-1 CAT III 600V meter, Modbus RTU RS-485 output | 1 | \$95 – \$140 |
| **Split-Core Current Transformers** | **Acuvance / Magnelab SCT-0750** (100A/5A or 200A/5A or 333mV output) | Non-invasive current sensing clamped around insulated phase conductors | 3 | \$20 – \$35 each (\$60 – \$105 total) |
| **Galvanic-Isolated USB-RS485 Adapter** | **DSD TECH SH-U10L** (with FTDI FT232R + ADM2483 isolated transceiver) | Connects RS-485 bus to edge computer with 2.5 kV isolation protection | 1 | \$22 – \$30 |
| **In-Line Voltage Disconnect Fuses** | Ferraz Shawmut / Eaton Bussmann 2A 600V AC Ceramic Fast-Acting Fuses + DIN Holders | Protects meter voltage inputs from MCC busbar fault currents | 3 | \$15 – \$25 total |
| **Industrial Edge Computer** | **Raspberry Pi Compute Module 4 IO Board** (or Advantech UNO-2271G) | Runs the ORVEX collector daemon and buffers telemetry locally | 1 | \$65 – \$120 |
| **Industrial 24V/5V DIN Power Supply** | **Mean Well HDR-30-24** (or HDR-15-5 for USB power) | Powers edge gateway from control panel auxiliary circuit | 1 | \$15 – \$22 |
| **Shielded Twisted Pair Cable** | Belden 9841 (24 AWG, 120-ohm nominal impedance, foil + braid shield) | RS-485 differential bus wiring between meter and edge gateway | 10 meters | \$15 – \$25 |
| **Total Estimated BOM (Single Machine Prototype):** | — | — | — | **\$287 – \$477** |

---

## 4. Edge Collector Configuration & Execution

The collector daemon is configured via environment variables or a local `.env` file:

```env
# Edge Collector Configuration
EDGE_MACHINE_ID=00000000-0000-0000-de30-000000000011
EDGE_SENSOR_ID=
EDGE_ADAPTER_TYPE=mock          # Options: mock, modbus
EDGE_POLL_INTERVAL_SECONDS=1.0
EDGE_RATED_POWER_KW=132.0

# Modbus RTU Serial Port (when EDGE_ADAPTER_TYPE=modbus)
MODBUS_PORT=COM3                # /dev/ttyUSB0 on Linux
MODBUS_BAUDRATE=9600
MODBUS_PARITY=N
MODBUS_STOPBITS=1
MODBUS_UNIT_ID=1
MODBUS_TIMEOUT=1.0

# MQTT Gateway Connection
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_TOPIC_PREFIX=orvex
EDGE_MQTT_CLIENT_ID=orvex-edge-collector
```

### Running the Edge Collector Daemon:

```powershell
# Run with Mock Adapter (synthetic hardware test):
python -m hardware.collector

# Run with physical Modbus RTU meter:
$env:EDGE_ADAPTER_TYPE="modbus"
$env:MODBUS_PORT="COM3"
python -m hardware.collector
```

---

## 5. Troubleshooting Guide

| Symptom | Probable Cause | Verification & Resolution |
|---|---|---|
| **Modbus CRC Mismatch** | RS-485 lines A and B reversed, or baud rate/parity mismatch | Swap A and B terminals. Verify that meter baud rate (default 9600) and parity (None, Even, Odd) match `MODBUS_BAUDRATE` and `MODBUS_PARITY`. |
| **Negative Active Power Readings** | CTs clamped backwards on phase conductors | Verify arrow on CT points toward the load (motor). Reverse CT orientation or swap S1/S2 secondary wires. |
| **MQTT Connection Refused** | Broker offline or port mismatch | Verify Mosquitto is running on port 1883 via `docker ps`. Verify firewall permits traffic on port 1883. |
| **Dropped Telemetry (Status 422 / Reject)** | Payload contains `NaN` or unparseable timestamp | The gateway strictly forbids `NaN` and requires UTC timezone. Check sensor health logs; verify collector sanitization. |
| **Stale Telemetry Indicator in Dashboard** | Collector polling loop stalled or serial communication timeout | Check collector process status. Verify `MODBUS_TIMEOUT` is set to $\ge 1.0\,\text{s}$. |

---

## 6. Electrical Safety & Deployment Mandates

1. **Isolation First**: Always use galvanically isolated USB-to-RS485 converters or transceiver chips (ISO3082). Never share signal grounds between industrial AC mains equipment and low-voltage digital microcontrollers without galvanic isolation.
2. **Current Transformer Safety**: Never disconnect a current transformer's secondary wiring while primary current is flowing. Always install a **CT shorting terminal block**.
3. **De-Energize Before Installation**: Always follow site Lockout/Tagout (LOTO) procedures when installing CTs or tapping voltage lines inside MCC cubicles.

---

## 7. Exact Next Step for Physical Sensor Connection

To transition from the tested mock adapter to live commercial hardware:
1. **Procure Equipment**: Acquire an Eastron SDM630M-Modbus V2 meter, 3x split-core CTs (e.g. 100A/5A), and an isolated USB-to-RS485 adapter (DSD TECH SH-U10L).
2. **Bench Test**: Connect the SDM630 on a laboratory test bench to a known resistive test load (e.g. 1 kW space heater or motor test rig) powered from a fused 230V source.
3. **Connect Adapter**: Wire meter terminals A, B, and GND to the isolated USB-RS485 dongle. Plug the dongle into your workstation.
4. **Configure & Launch Collector**:
   ```powershell
   $env:EDGE_ADAPTER_TYPE="modbus"
   $env:MODBUS_PORT="COM3"  # or /dev/ttyUSB0
   python -m hardware.collector
   ```
5. **Verify Telemetry**: Open the ORVEX dashboard at `http://localhost:5173` to observe live physical voltage, current, power factor, and active power streaming via MQTT into TimescaleDB and the analytics engine.

