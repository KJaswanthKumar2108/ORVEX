# ORVEX — Edge Hardware Wiring & Schematics Specification

> [!CAUTION]
> **CRITICAL ELECTRICAL SAFETY MANDATE**
> - **NEVER** connect microcontrollers, breadboards, development boards, or unisolated sensor circuits directly to AC mains voltage (230V/400V/480V/690V).
> - High-voltage measurements must **ONLY** be acquired by certified, appropriately rated commercial DIN-rail energy meters (e.g. IEC 61010-1, CAT III 600V or CAT IV 300V rated).
> - All connections to live distribution boards or motor control centers (MCCs) must be performed or supervised by a licensed industrial electrician under approved Lockout/Tagout (LOTO) procedures.

---

## 1. System Topology Overview

```text
[ 415V 3-Phase Mining MCC ]
  ├── Phase A/B/C Power Lines
  │     │
  │     ├── [ Split-Core Current Transformers ] (3x CTs: 100A/5A or 200A/5A)
  │     │       │ (Low voltage secondary mA or 5A signals)
  │     │       ▼
  │     └── [ 3x In-Line 2A Ceramic Fuses ]
  │             │ (Fused voltage references L1, L2, L3, N)
  │             ▼
  │   [ Certified Industrial Energy Meter ]
  │   (e.g., Eastron SDM630 / Schneider PM5000)
  │             │
  │             └── [ RS-485 Modbus RTU Terminal ] (A, B, GND/Shield)
  │                     │
  │                     │ (Galvanically Isolated 2-Wire Differential Bus)
  │                     ▼
  ┌─────────────────────────────────────────────────────────────┐
  │         ORVEX Hardware Gateway / Edge Collector             │
  │                                                             │
  │  Option A: Industrial Edge PC (Raspberry Pi CM4 / Box PC)  │
  │    └── [ Isolated USB-to-RS485 Transceiver ]               │
  │                                                             │
  │  Option B: Industrial ESP32 Microcontroller                 │
  │    └── [ Galvanic-Isolated RS-485 Transceiver (ISO3082) ]   │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼ (Wi-Fi 802.11b/g/n or Industrial Ethernet)
                     [ Local Network / Switch ]
                                 │
                                 ▼
                     [ ORVEX MQTT Broker (1883) ]
```

---

## 2. Option A: Edge PC / Linux Gateway with Isolated USB-RS485

This is the recommended deployment architecture for production mining substations and containerized control rooms.

### Hardware Connection:
1. Connect **Terminal A (D+)** on the meter to **A (D+)** on the isolated USB-RS485 converter.
2. Connect **Terminal B (D-)** on the meter to **B (D-)** on the isolated USB-RS485 converter.
3. Connect **Shield / Common (GND)** between meter and converter ground.
4. If this is the terminal node on the RS-485 line, switch ON the **$120\,\Omega$ termination resistor**.
5. Plug the converter into the industrial PC's USB port (recognized as `/dev/ttyUSB0` on Linux or `COM3` on Windows).

---

## 3. Option B: ESP32 Microcontroller with Galvanic RS-485 Isolation

For localized edge telemetry enclosures, an ESP32 microcontroller can be paired with an isolated RS-485 transceiver.

### Required Components:
- **MCU**: ESP32-WROOM-32 or ESP32-S3 development board.
- **RS-485 Transceiver**: Texas Instruments **ISO3082** or Analog Devices **ADM2483** (integrated 2.5 kVrms galvanic isolation).
- **Isolated DC-DC Converter**: B0505S-1WR3 (5V to 5V isolated DC power for the bus side).
- **Termination**: $120\,\Omega$, $0.25\,\text{W}$ metal film resistor across A and B.

### Schematic Pinout:

| ESP32 Pin | Transceiver Pin | Function / Notes |
|---|---|---|
| `3V3` | `VCC1` (Logic side) | 3.3V Logic Supply |
| `GND` | `GND1` (Logic side) | Logic Ground |
| `GPIO 16` | `R` / `RO` | UART2 RX (Receive Data from Bus) |
| `GPIO 17` | `D` / `DI` | UART2 TX (Transmit Data to Bus) |
| `GPIO 4` | `DE` / `RE_N` | Direction Control: HIGH = TX, LOW = RX |
| `Isolated +5V` | `VCC2` (Bus side) | Output from B0505S isolated DC-DC |
| `Isolated GND` | `GND2` (Bus side) | Isolated Bus Ground |
| — | `A` (Bus terminal) | Connect to Meter Terminal A (D+) |
| — | `B` (Bus terminal) | Connect to Meter Terminal B (D-) |

---

## 4. Current Transformer (CT) Safety & Wiring Rules

1. **Split-Core CTs Only**: Always use split-core CTs for retrofit installations so primary high-voltage busbars or cables do not need to be disconnected.
2. **Directionality (Arrow P1 $\rightarrow$ P2)**: The arrow stamped on the CT housing must point towards the electrical load (the mining equipment motor). Backward CT orientation produces negative active power readings and inverted power factor.
3. **Open-Circuit Secondary Hazard**:
   > [!WARNING]
   > A current transformer whose secondary circuit is opened while primary current flows will develop dangerously high voltages (thousands of volts) across its secondary terminals, risking electrical explosion, fire, and fatal shock.
   - Always install a dedicated **CT Shorting Terminal Block** between the CT secondaries and the energy meter.
   - For prototype testing, use voltage-output CTs (e.g. 0–333 mV output with internal burden resistors) which are inherently fail-safe against open-circuit secondary high voltage.

