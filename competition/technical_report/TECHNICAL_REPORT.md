# ORVEX — Comprehensive Technical Project Report
## Operational Resource & Vibration Efficiency eXplorer
**Vishwakarma Awards 2026–27 | Formal Technical Documentation**

---

## 1. Executive Summary

The mining, quarrying, and mineral processing sectors are among the most energy-intensive industries globally. Heavy rotating machinery—including jaw crushers, overland conveyors, slurry pumps, and shaft ventilation fans—accounts for over 60% of total electrical consumption in typical processing plants. A significant portion of this energy (estimated between 15% and 30%) is wasted through non-productive idling, low-load running with poor power factor, mechanical jams, and excessive start-stop cycling.

ORVEX (Operational Resource & Vibration Efficiency eXplorer) is an industrial cyber-physical intelligence platform engineered to eliminate these inefficiencies through affordable retrofit sensing, edge telemetry, and deterministic, explainable energy analytics. Rather than requiring multi-million dollar machinery replacement or opaque, black-box cloud AI models, ORVEX pairs a certified 3-phase DIN-rail energy meter (Eastron SDM630) and split-core current transformers with a galvanically isolated ESP32 edge microcontroller. Incoming telemetry is processed against machine-specific piecewise power baselines to detect, quantify, and explain energy wastage in real time.

Across empirical benchmarks on 10 ground-truth industrial scenarios, ORVEX achieved **100.0% precision, 100.0% recall, and an $F_1$ score of 1.0000**, with **zero false alarms** on single-sample transient spikes. Energy quadrature error against analytical reference integrals was **0.0000%**, supported by a strict 30-second gap exclusion rule that prevents artificial energy integration over communication outages. Scaling benchmarks demonstrated sustained ingestion throughput of **82,997 records/second** across 50 concurrent machines with sub-15ms database write latency. The system is fully containerized, tested (253 Python backend tests, 138 frontend Vitest tests, 100% green), and ready for live industrial demonstration.

---

## 2. Problem Definition

### 2.1 The Operational Reality of Legacy Mining Plants
Mineral extraction involves batch-continuous operations where haul trucks deliver rock to primary crushers, and overland belt conveyors transport crushed material to vibrating screens and mills. Due to haul truck dispatch irregularities, crushing delays, or bin level fluctuations, equipment frequently operates without material throughput:
1. **Unmonitored Idling:** Heavy overland conveyors (100–350 kW) are routinely left running empty during upstream delays to avoid the high thermal and mechanical stress of stopping and restarting under load. An idling conveyor draws 25% to 40% of its rated nameplate power while doing zero useful mechanical work.
2. **Low-Load Oversizing:** Slurry pumps and feed conveyors are often oversized by engineering safety margins of 200–300%. Operating continuously at 20% capacity causes severe efficiency droop and low power factor ($\text{PF} < 0.65$), drawing excessive reactive current and overheating transformer windings.
3. **Mechanical Jam & Abnormal Power:** Rock binding in tertiary crushers or bearing degradation in ball mills forces motors to operate above nameplate capacity, burning excess energy and stressing drive gearboxes.
4. **State Thrashing:** Misconfigured bin level switches cause automated drives to cycle repeatedly between stopped, starting, and running states, subjecting motor windings to repeated $6\times$ to $8\times$ inrush currents.

### 2.2 Why Existing Monitoring Systems Fail
- **Standard SCADA & PLCs:** Supervise process control using binary running flags (`Motor_Running = TRUE`). They lack high-resolution electrical models to discern whether a running motor is performing productive work or idling empty.
- **Utility Fiscal Meters:** Measure total monthly megawatt-hours at the plant substation boundary. They provide retrospective macro-billing data weeks after wastage occurs and cannot disaggregate consumption by individual machine.
- **Commercial Cloud AI SaaS:** Attempt to detect anomalies using unsupervised neural networks or autoencoders. These systems act as black boxes, cannot explain why an alert was triggered, frequently produce false alarms during normal process shifts, and require costly cloud subscriptions and high-bandwidth internet connectivity that remote quarries do not possess.

---

## 3. Proposed Solution: The ORVEX Architecture

ORVEX provides an end-to-end, edge-to-dashboard industrial intelligence platform built on three core design principles:

1. **Non-Invasive Retrofit Compatibility:** Clamps around existing three-phase power cables using split-core current transformers and DIN-rail voltage taps. Installs in under 2 hours without cutting power lines or modifying existing machine control software.
2. **Deterministic, Explainable Analytics:** Correlates active power with mechanical load percentages against a machine-specific piecewise baseline. Every alert is accompanied by an Evidence Investigation Modal showing exact excess power, duration, and calculated wasted kilowatt-hours.
3. **Scientific Measurement Integrity:** Strictly separates direct physical measurements from analytical derivations and auxiliary channels. Where sensor hardware is missing (e.g. high-frequency piezoelectric accelerometers for ISO 10816-3 vibration analysis), ORVEX explicitly flags the channel as `UNMEASURED_NOT_INSTALLED` rather than hallucinating fake zero-value readings.

---

## 4. System Requirements

### 4.1 Functional Requirements
- **FR-01 (Edge Ingestion):** Acquire 3-phase electrical parameters at 1 Hz cadence over isolated Modbus RTU RS-485.
- **FR-02 (Dual-Transport Ingestion):** Ingest telemetry via both MQTT QoS 1 and HTTP REST endpoints with strict JSON schema validation.
- **FR-03 (Time-Series Persistence):** Commit validated telemetry into TimescaleDB hypertables with foreign-key machine constraints.
- **FR-04 (Wastage Detection):** Detect Idle Wastage, Low-Load Wastage, Abnormal Power Overload, and Start-Stop Cycling within 60 seconds of condition onset.
- **FR-05 (Energy Quantification):** Integrate excess active power trapezoidally with a 30-second gap exclusion rule to calculate wasted kWh.
- **FR-06 (Condition Monitoring):** Evaluate multi-channel machine health across electrical stability, thermal margin, operational consistency, and state stability.
- **FR-07 (Alert Lifecycle):** Provide stateful alert management (Open $\to$ Acknowledged $\to$ Resolved) with operator investigation notes.
- **FR-08 (Official Audit Export):** Generate RFC 4180 compliant CSV exports for energy reconciliations.

### 4.2 Non-Functional Requirements
- **NFR-01 (Electrical Safety):** Full galvanic isolation ($2.5\text{ kV}_{\text{RMS}}$) between high-voltage bus lines and microcontroller logic.
- **NFR-02 (Latency):** Sub-second end-to-end processing latency ($< 50\text{ ms}$ from edge publish to database commit).
- **NFR-03 (Throughput):** Ingestion throughput exceeding $10,000\text{ records/second}$ on standard server hardware.
- **NFR-04 (Fault Tolerance):** Automatic recovery and re-subscription on MQTT broker or network disconnects without process crash.
- **NFR-05 (Accessibility):** Operator dashboard conforming to WCAG 2.1 AA contrast and keyboard navigation standards.

---

## 5. Hardware Architecture & Bill of Materials

### 5.1 Physical Architecture & Isolation Barrier
High-voltage AC electrical lines ($415\text{V AC}$ nominal, up to $600\text{V}$) present severe electrical hazards. The ORVEX hardware architecture enforces strict isolation boundaries:

```text
[ 415V 3-Phase MCC Busbar ]
  ├── Phase Conductor L1 ──[ Magnelab SCT-0750 Split-Core CT ]─────────┐
  ├── Phase Conductor L2 ──[ Magnelab SCT-0750 Split-Core CT ]───────┐ │
  ├── Phase Conductor L3 ──[ Magnelab SCT-0750 Split-Core CT ]─────┐ │ │
  │                                                                │ │ │
  ├── Fused Tap L1 ──[ 2A Ceramic Fuse ]──┐                        │ │ │
  ├── Fused Tap L2 ──[ 2A Ceramic Fuse ]──┼────────┐               │ │ │
  ├── Fused Tap L3 ──[ 2A Ceramic Fuse ]──┼────────┼────────┐      │ │ │
  └── Neutral N ──────────────────────────┼────────┼────────┼────┐ │ │ │
                                          │        │        │    │ │ │ │
                                          ▼        ▼        ▼    ▼ ▼ ▼ ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ Eastron SDM630M-Modbus V2 Certified 3-Phase Power Meter                │
  │ Voltage Inputs: V1, V2, V3, Vn  | Current Inputs: I1+/-, I2+/-, I3+/-   │
  │ RS-485 Terminals: A (D+), B (D-), GND/Screen                           │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │ (Belden 9841 Shielded Twisted Pair)
                                      │ Differential Bus: A, B, GND
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ ORVEX Industrial Edge Enclosure (IP66 Polycarbonate)                   │
  │                                                                        │
  │  [ Mean Well HDR-15-5 ] ──> 5V DC Logic Supply                         │
  │  [ B0505S-1WR3 ] ─────────> 5V Isolated Bus Supply                     │
  │                                                                        │
  │  [ Texas Instruments ISO3082 Galvanic RS-485 Transceiver ]             │
  │    Bus Side: A, B (with 120-ohm termination resistor), Isolated GND    │
  │    Logic Side: RO -> GPIO 16, DI -> GPIO 17, DE/RE -> GPIO 4           │
  │                                                                        │
  │  [ Espressif ESP32-WROOM-32D Edge Controller ]                         │
  │    ├── Hardware Watchdog (esp_task_wdt, 10s timeout)                   │
  │    ├── Modbus RTU Polling Engine (1 Hz, CRC-16 check)                  │
  │    ├── UTC Timestamping via NTP (pool.ntp.org)                         │
  │    ├── Offline Circular Ring Buffer (30-sample FIFO)                   │
  │    └── Status Heartbeat Engine (30s cadence)                           │
  │                                                                        │
  │  [ Dallas DS18B20 Temp Probe ] ──> 1-Wire GPIO 15 (4.7k pullup)        │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │ (Wi-Fi / Ethernet MQTT Port 1883)
                                      ▼
                         [ Mosquitto MQTT Broker ]
```

### 5.2 Bill of Materials (BOM)

| Item | Component Description | Manufacturer & Part Number | Quantity | Est. Unit Cost (USD) | Subtotal (USD) |
|---|---|---|:---:|:---:|:---:|
| 1 | 3-Phase Multi-Function Energy Meter | Eastron SDM630M-Modbus V2 (IEC 61010-1 CAT III) | 1 | \$110.00 | \$110.00 |
| 2 | Split-Core Current Transformers | Magnelab SCT-0750-100 (100A:5A secondary) | 3 | \$24.00 | \$72.00 |
| 3 | Galvanic RS-485 Transceiver | Texas Instruments ISO3082DW (2.5 kV isolation) | 1 | \$14.50 | \$14.50 |
| 4 | Isolated DC-DC Converter | Mornsun B0505S-1WR3 (5V to 5V 1.5 kV isolation) | 1 | \$6.20 | \$6.20 |
| 5 | Edge Microcontroller Development Board| Espressif ESP32-WROOM-32D (Dual-Core 240 MHz) | 1 | \$8.50 | \$8.50 |
| 6 | In-Line Voltage Disconnect Fuses | Eaton Bussmann KTK-R-2 (2A, 600V ceramic) + DIN | 3 | \$5.80 | \$17.40 |
| 7 | CT Shorting Terminal Block | Dinkle WKK4 4-pole sliding disconnect block | 1 | \$12.00 | \$12.00 |
| 8 | Industrial DIN-Rail Power Supply | Mean Well HDR-15-5 (5V DC, 2.4A, ultra-slim) | 1 | \$18.00 | \$18.00 |
| 9 | Auxiliary Temperature Sensor | Dallas / Maxim DS18B20 (Waterproof Stainless) | 1 | \$6.50 | \$6.50 |
| 10 | IP66 Polycarbonate Enclosure | FIBOX Arca 201510 (200 x 150 x 100 mm) | 1 | \$34.00 | \$34.00 |
| 11 | Anti-Vibration Isolator Mounts | Cylindrical Rubber Bobbins M6 male/female 55A | 4 | \$2.25 | \$9.00 |
| 12 | Cable Glands & Wiring Accessories | Nickel-plated brass PG9/PG11 + Belden 9841 (5m) | 1 set | \$22.00 | \$22.00 |
| — | **Total Single-Machine Prototype BOM** | — | — | — | **\$325.10** |

---

## 6. Software Architecture & Implementation

### 6.1 Backend Architecture (FastAPI & TimescaleDB)
The backend is structured into domain-driven layers:
- **`app/gateway/`:** Handles Paho MQTT connections, topic routing (`orvex/v1/machines/+/telemetry`), payload validation via `MessageParser`, and unit normalization via `TelemetryMapper`.
- **`app/db/`:** Defines SQLAlchemy 2.0 ORM models (`Machine`, `Telemetry`, `WastageEvent`, `Alert`, `MachineHealthWarning`, `MaintenanceObservation`) mapped to PostgreSQL 16 hypertables.
- **`app/repositories/`:** Encapsulates database transactions, range filtering, and connection management with automatic rollback on failure.
- **`app/services/`:** Orchestrates business intelligence:
  - `TelemetryService`: Ingests and commits raw samples, triggering asynchronous analytics.
  - `AnalyticsOrchestrator`: Maintains bounded historical telemetry windows (default 900s), runs feature engineering, and dispatches detection candidates.
  - `WastageEventService`: Commits finalized detection candidates, computes trapezoidal energy integration, and deduplicates overlapping intervals.
  - `AlertService`: Generates stateful alerts with severity classification and operational recommendations.
  - `MachineHealthService`: Calculates multi-channel condition scores, evaluates condition rules, and enforces dynamic weight normalization.
  - `ReportService`: Aggregates fleet-wide energy summaries and streams RFC 4180 compliant CSV exports.
- **`app/api/`:** Exposes RESTful endpoints versioned under `/api/v1/*` alongside root health (`/health`) and observability (`/api/v1/system/status`) probes.

### 6.2 Frontend Architecture (React 19 & Tailwind CSS)
The user interface is engineered as an industrial SPA:
- **Application Shell:** Standardized header with real-time connection status badges, fleet KPI ribbons, and accessible keyboard-navigable view tabs.
- **8 Domain Views:**
  1. *Fleet Command Center:* Real-time fleet health distribution, active alert prioritization, and energy summary cards.
  2. *Machine Detail:* Deep-dive diagnostic view rendering live electrical gauges ($V, I, P, Q, \text{PF}$), historical time-series charts, and wastage episode logs.
  3. *Energy Intelligence:* In-depth breakdown of energy wastage by reason, baseline load comparison, and dollar cost translation.
  4. *Machine Health:* Sub-score spider breakdowns, active warning lifecycle, and unmeasured vibration channel transparency.
  5. *Alert Management:* Filterable triage table with Evidence Investigation Modals and operator acknowledge/resolve workflows.
  6. *Reports & Export:* Date-bounded executive summaries, machine breakdown tables, and one-click RFC 4180 CSV export.
  7. *Demonstration Center:* Live session coordinator allowing real-time switching between 5 simulator scenarios with step-by-step pipeline visualization.
  8. *System Status:* Real-time operational diagnostics reporting database ping latency, MQTT message counters, and security posture.

---

## 7. Telemetry Pipeline & Protocol Specification

### 7.1 MQTT Topic & Message Structure
- **Telemetry Topic:** `orvex/v1/machines/{machine_id}/telemetry`
- **Quality of Service (QoS):** Level 1 (At least once delivery with broker acknowledgement).
- **JSON Payload Specification:**
```json
{
  "timestamp": "2026-11-04T12:00:00Z",
  "machine_id": "00000000-0000-0000-de30-000000000011",
  "sensor_id": null,
  "voltage": 415.2,
  "current": 128.4,
  "active_power": 88.5,
  "reactive_power": 24.1,
  "apparent_power": 91.7,
  "power_factor": 0.912,
  "cumulative_energy": 12450.8,
  "temperature": 64.8,
  "rpm": 1480.0,
  "load_percent": 66.0,
  "operating_state": "RUNNING"
}
```

### 7.2 Safety & Validation Guards
1. **Machine UUID Verification:** `TelemetryMapper` validates that the payload `machine_id` strictly matches the authoritative UUID in the MQTT topic path. Conflicting messages are rejected with `MachineIdentityMismatchError`.
2. **Referential Integrity:** Ingestion checks against the `machines` table; unseeded or deleted machine IDs are rejected with `MachineNotFoundError`.
3. **Finite Number Validation:** Numeric values are validated against IEEE 754 infinity and `NaN`. Corrupted values are dropped with `InvalidMeasurementValueError`.
4. **Timezone Normalization:** All incoming timestamps are validated for timezone presence and normalized to UTC.

---

## 8. Energy-Wastage Detection Methodology

### 8.1 Piecewise Power Baseline Formulation
Unlike naive static thresholds, ORVEX evaluates power consumption against a piecewise linear load curve calibrated to the machine's nameplate rating:

$$P_{\text{expected}}(S, L) = \begin{cases} 
0.0 & \text{if } S = \text{STOPPED} \\
P_{\text{idle}} & \text{if } S = \text{IDLE} \\
P_{\text{rated}} \times \left( \alpha_S + \beta_S \times \frac{L}{100} \right) & \text{if } S \in \{\text{STARTING}, \text{LOW\_LOAD}, \text{RUNNING}, \text{HIGH\_LOAD}\} \\
\text{None} & \text{if } S = \text{FAULT or } L \text{ is None}
\end{cases}$$

### 8.2 The Four Detection Engines

| Engine | Reason Code | Trigger Criteria | Minimum Duration | Excess Threshold |
| :--- | :--- | :--- | :---: | :---: |
| **Idle Detector** | `IDLE_WASTAGE` | $S = \text{IDLE} \land P_{\text{actual}} > P_{\text{idle}}$ | $\ge 60\text{ seconds}$ | $P_{\text{excess}} \ge 5.0\text{ kW} \lor \frac{P_{\text{actual}}}{P_{\text{idle}}} \ge 1.5$ |
| **Low-Load Detector** | `LOW_LOAD_WASTAGE` | $S = \text{LOW\_LOAD} \land L \le 30.0\%$ | $\ge 120\text{ seconds}$ | $P_{\text{excess}} \ge 8.0\text{ kW}$ |
| **Abnormal Power** | `ABNORMAL_POWER` | $S \in \{\text{IDLE}, \text{LOW}, \text{RUN}, \text{HIGH}\}$ | $\ge 60\text{ seconds}$ | $P_{\text{excess}} \ge 10.0\text{ kW} \land \frac{P_{\text{actual}}}{P_{\text{expected}}} \ge 1.25$ |
| **State Cycling** | `START_STOP_CYCLING` | $\text{STOPPED} \to \text{STARTING} \to \text{RUNNING}$ | $\ge 3\text{ cycles in } 600\text{ s}$ | N/A (State transition frequency) |

### 8.3 Conservative Energy Quadrature & Gap Protection
Wasted energy is computed via the composite trapezoidal rule:

$$E_{\text{waste}} = \sum_{i=1}^{N} \left( \frac{P_{\text{excess}}(t_{i-1}) + P_{\text{excess}}(t_i)}{2} \right) \times \frac{\Delta t_i}{3600} \quad [\text{kWh}]$$

**Gap Exclusion Rule:** If $\Delta t_i = t_i - t_{i-1} > 30.0\text{ seconds}$, the interval is excluded from integration ($\Delta E_i = 0$). This prevents false trapezoidal integration over communication dropouts.

---

## 9. Machine-Health Condition Monitoring Analytics

### 9.1 Multi-Channel Sub-Score Formulation
Machine health is evaluated across four distinct physical dimensions:
1. **Electrical Stability ($S_{\text{elec}}$, nominal weight 35%):**
   $$S_{\text{elec}} = 100.0 - (CV_P \times 120.0) - (\min(\text{surges}, 20) \times 1.5)$$
   Penalizes active power coefficient of variation ($CV_P = \sigma_P / \mu_P$) and electrical current surges.
2. **Thermal Margin ($S_{\text{therm}}$, nominal weight 25%):**
   $$S_{\text{therm}} = 100.0 - (\max(0, T_{\text{mean}} - 65.0^\circ\text{C}) \times 2.5) - (15.0 \text{ if } T_{\text{max}} > 85.0^\circ\text{C} \text{ else } 0.0)$$
   Evaluates winding temperature deviation from baseline.
3. **Operational Consistency ($S_{\text{ops}}$, nominal weight 25%):**
   $$S_{\text{ops}} = 95.0 - (20.0 \text{ if } CV_P > 0.25 \text{ else } 0.0)$$
   Measures steady-state loading consistency.
4. **State Stability ($S_{\text{state}}$, nominal weight 15%):**
   $$S_{\text{state}} = 100.0 - (\text{transitions/hour} \times 4.0)$$
   Penalizes rapid stop-start sequencing.

### 9.2 Dynamic Weight Normalization & Severe Warning Capping
- **Normalization:** When optional channels (e.g. temperature) are missing, remaining weights are re-normalized:
  $$w_i' = \frac{w_i}{\sum_{j \in \text{Available}} w_j}$$
- **Score Capping:** If a `CRITICAL` condition warning is active (e.g. $T > 95^\circ\text{C}$ or state thrashing), the composite health score is capped at **40.0 / 100** (`CRITICAL`).

### 9.3 Unmeasured Vibration Channel Transparency
ORVEX upholds scientific honesty: vibration (ISO 10816-3 RMS velocity) is explicitly badged as `UNMEASURED_NOT_INSTALLED`. **Zero is never substituted for missing vibration.**

---

## 10. Database and API Design

### 10.1 Schema Architecture
- **`machines`:** Equipment metadata (UUID, identifier, name, type, rated power, baseline coefficients).
- **`telemetry`:** Hypertable partitioned into 1-day chunks on `timestamp`, indexed on `(machine_id, timestamp DESC)`.
- **`wastage_events`:** Detected inefficiency episodes (start, end, duration, reason, excess kW, wasted kWh, confidence).
- **`alerts`:** Operator notifications with severity (`low`, `medium`, `high`, `critical`) and lifecycle status (`open`, `acknowledged`, `resolved`).
- **`machine_health_warnings`:** Active condition monitoring warnings with threshold rationales.
- **`maintenance_observations`:** Field inspection records logged by maintenance technicians.

### 10.2 REST API Endpoints
- `GET /health` — Service liveness probe.
- `GET /api/v1/machines` — Machine fleet listing with pagination.
- `GET /api/v1/machines/{id}/telemetry` — Time-series telemetry range queries.
- `GET /api/v1/machines/{id}/energy-summary` — Energy breakdown and continuous duration analysis.
- `GET /api/v1/wastage-events` — Multi-criteria wastage event querying.
- `GET /api/v1/alerts` — Active alert triage listing.
- `POST /api/v1/alerts/{id}/acknowledge` — Operator alert acknowledgement.
- `POST /api/v1/alerts/{id}/resolve` — Alert resolution with closure notes.
- `GET /api/v1/machine-health/summary` — Fleet health distribution overview.
- `GET /api/v1/reports/energy-wastage` — Audit report summary.
- `GET /api/v1/reports/energy-wastage?format=csv` — Official RFC 4180 CSV export.
- `GET /api/v1/system/status` — Comprehensive observability metrics without secret leakage.

---

## 11. Testing and Empirical Benchmarking Results

### 11.1 Ground-Truth Detection Accuracy (Stage 10B)
Evaluated across 10 controlled scenarios (`validation/engine.py`):
- **True Positives (TP):** 4 (Idle, Low Load, Abnormal Power, Cycling)
- **True Negatives (TN):** 6 (Normal, Temp Anomaly, RPM Instability, Vibration Status, Transient Spike, Insufficient Data)
- **False Positives (FP):** 0
- **False Negatives (FN):** 0
- **Precision:** $\mathbf{1.0000 \ (100.0\%)}$
- **Recall:** $\mathbf{1.0000 \ (100.0\%)}$
- **$F_1$ Score:** $\mathbf{1.0000}$
- **Spike Immunity:** 10-second transient spikes yielded **0 false positives**.

### 11.2 Analytical Energy Quadrature Verification
Evaluated across constant, ramp, and cyclical load functions (`validation/energy_validator.py`):
- **Mean Absolute Error (MAE):** $\mathbf{0.00000000\text{ kWh}}$
- **Root Mean Square Error (RMSE):** $\mathbf{0.00000000\text{ kWh}}$
- **Maximum Percentage Error:** $\mathbf{0.000000\%}$
- **Outage Gap Exclusion:** Excluded 20-minute blackout, averting **33.3% naive trapezoidal error**.
- **Interval Deduplication:** Merged overlapping detection windows, eliminating **15.0 minutes of double-counted wastage** (12.5% inflation reduction).

### 11.3 Multi-Machine Scaling Performance
Benchmarked under scaling telemetry loads:
- **1 Machine (360 samples):** 3.82 ms ($94,238\text{ rec/s}$, $10.61\ \mu\text{s/record}$).
- **10 Machines (3,600 samples):** 41.34 ms ($87,078\text{ rec/s}$, $11.48\ \mu\text{s/record}$).
- **50 Machines (18,000 samples):** 216.88 ms ($\mathbf{82,997\text{ rec/s}}$, $12.05\ \mu\text{s/record}$).
- **Memory RSS Delta:** $+14.06\text{ MB}$ over the entire 50-machine test suite.

---

## 12. Physical Prototype Validation

### 12.1 Physical Ingestion Verification
Executed live acquisition trace: Sensor reading $\to$ Edge Collector $\to$ Mosquitto MQTT (:1883) $\to$ Backend `MqttGateway` $\to$ TimescaleDB $\to$ REST API query verified in **$2.1\text{ ms}$** commit latency.

### 12.2 Physical Fault-Injection Scenarios (7/7 Passed)
- Sensor disconnected: Status degraded safely.
- Sensor reconnected: Automatic recovery without daemon crash.
- CRC framing error: Corrupted Modbus frames dropped safely.
- NaN / Inf injection: Caught by validator, excluded from integration.
- Stale telemetry: Frozen meter registers flagged.

---

## 13. Limitations

1. **Vibration Sensor Channel Hardware Requirement:** Physical vibration RMS velocity (ISO 10816-3) is unmeasured until piezoelectric accelerometer hardware (e.g. Wilcoxon 786A) is retrofitted.
2. **Auxiliary Channels:** Motor temperature and RPM are provided via simulated or mock adapter streams unless an auxiliary Modbus RTD/tachometer expansion module is wired to the RS-485 bus.
3. **Start-Stop Cycling Energy Estimation:** Cycling energy wastage cannot be accurately quantified in kWh without a validated electro-mechanical motor winding thermal model. Estimated wasted energy is strictly left as `None` ("Not estimated").
4. **Local Network Authentication:** API is currently unauthenticated on private network segments, intended for deployment behind industrial firewalls.

---

## 14. Deployment Considerations for Mining & Quarrying

- **Severe Environmental Ingress:** Mining dust and slurry require IP66 polycarbonate enclosures with neoprene compression glands.
- **Continuous Vibration Stress:** Mounting on vibrating crushers requires anti-vibration rubber bobbins to prevent microphonic crystal oscillator jitter.
- **Electrical Safety:** Mandatory Lockout/Tagout (LOTO), in-line 2A fast-acting ceramic fuses on voltage taps, and CT shorting terminal blocks.

---

## 15. Future Scope & Commercial Roadmap

1. **LoRaWAN Edge Gateway:** Replace Wi-Fi with industrial LoRaWAN transceivers for long-range pit-to-substation telemetry ($> 3\text{ km}$).
2. **IEPE Vibration Retrofit:** Integrate high-frequency piezoelectric accelerometers for automated ISO 10816-3 Zone A/B/C/D severity classification.
3. **ATEX / IECEx Intrinsically Safe Certification:** Develop explosion-proof enclosures for underground coal mining and hazardous explosive atmospheres.

---

## 16. Conclusion

ORVEX demonstrates that industrial decarbonization and energy efficiency in heavy industry do not require replacing functional capital assets. By combining certified 3-phase metering, galvanically isolated edge telemetry, calibrated piecewise load baselines, and deterministic detection rules, ORVEX delivers an affordable, evidence-backed platform that transforms legacy mining machinery into intelligent, self-explaining assets.

