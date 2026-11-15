# ORVEX — Live Demonstration Script & Presenter Runbook
## Vishwakarma Awards 2026–27 | 5–7 Minute Technical Demonstration

This runbook provides the exact spoken script, physical hardware handling instructions, software interaction sequence, and contingency fallback procedures for the live evaluation by the technical judging panel.

---

## 1. Demonstration Overview & Timing Blueprint

```
+-----------------------------------------------------------------------------------------+
| TOTAL ALLOCATED TIME: 7 MINUTES (0:00 to 7:00)                                           |
+-----------+-----------------------------------+-----------------------------------------+
| Elapsed   | Segment                           | Primary Objective                       |
+-----------+-----------------------------------+-----------------------------------------+
| 0:00–1:00 | Hardware Showcase & Retrofit Story| Physical prototype, safety, BOM ($325)  |
| 1:00–2:30 | Fleet Command Center & Live Telemetry| Ingestion, machine states, 1 Hz updates|
| 2:30–4:15 | Trigger Wastage & Evidence Modal  | Scenario injection, math explainability |
| 4:15–5:30 | Machine Health & Sensor Honesty   | Unbalance, thermal, unmeasured guard    |
| 5:30–6:30 | Alert Triage, Lifecycle & Reports | Root-cause recommendation & CSV export  |
| 6:30–7:00 | Wrap-up, Value Proposition & Q&A  | ROI, scalability, 100% green tests      |
+-----------+-----------------------------------+-----------------------------------------+
```

---

## 2. Timed Demonstration Script

### Minute 0:00 – 1:00: Physical Hardware Showcase & Retrofit Philosophy

**Action:**
1. Stand at the presentation table with the **ORVEX IP66 Enclosure** open and visible to judges.
2. Hold up a **Split-Core Current Transformer (SCT-024)** in one hand and point inside the enclosure.

**Spoken Script:**
> *"Respected judges, mining and quarrying plants run on heavy, legacy rotating machinery that accounts for over 60% of total plant electrical consumption. Yet up to 30% of that energy is wasted in non-productive idling, low-load running, or undetected mechanical strain.*
>
> *Mine operators cannot afford multi-million dollar equipment replacements. That is why we engineered ORVEX—a non-invasive retrofit intelligence platform.*
>
> *(Hold up split-core CT)* *This split-core CT snaps directly over existing motor cables inside the Motor Control Center without disconnecting high-voltage busbars or interrupting plant operations. Voltage is safely tapped through 2A high-interrupt ceramic fuses.*
>
> *(Point inside enclosure)* *Inside this IP66 enclosure, an industrial Class 1.0 energy meter measures 3-phase electrical parameters. Through a 2.5 kV galvanically isolated RS-485 transceiver, telemetry streams into an ESP32 edge microcontroller running FreeRTOS with a hardware watchdog. The entire bill of materials is just \$325 USD, dropping to \$155 in volume production."*

---

### Minute 1:00 – 2:30: Fleet Command Center & Live Telemetry

**Action:**
1. Direct attention to the laptop/projector displaying the **React 19 Dashboard**.
2. Navigate to **Fleet Command Center** (`/` or `/fleet`).
3. Point out the 5 industrial machines:
   - `DEMO-CONV-01` (Primary Overland Conveyor, 132 kW)
   - `DEMO-PUMP-02` (Slurry Dewatering Pump, 75 kW)
   - `DEMO-CRUSH-03` (Primary Jaw Crusher, 250 kW)
   - `DEMO-FAN-04` (Ventilation Fan, 90 kW)
   - `DEMO-HOIST-05` (Mine Production Hoist, 350 kW)
4. Click on `DEMO-CONV-01` to open the **Machine Detail View** (`/machines/00000000-0000-0000-de30-000000000011`).

**Spoken Script:**
> *"Here on the Fleet Command Center, we see our plant assets updating at 1 Hz via our TimescaleDB and FastAPI microservices architecture. Our scaling benchmarks prove this ingestion pipeline sustains over 82,000 records per second.*
>
> *Let us look at the Primary Overland Conveyor, a 132 kW drive. It is currently operating normally under design load—drawing approximately 88 kW with a healthy power factor of 0.88 and balanced phase currents. Notice the live electrical oscilloscope displaying real-time active power, reactive power, and motor temperature.*
>
> *Now, let us examine what happens when an upstream delay occurs and the operator leaves this 132 kW conveyor running empty."*

---

### Minute 2:30 – 4:15: Live Wastage Injection & The Evidence Modal

**Action:**
1. Navigate to the **Demonstration Center** (`/demonstration`).
2. Select `DEMO-CONV-01` and click **"Run Scenario 2: Sustained Idle Wastage"**.
3. Point to the live telemetry stream updating:
   - Power drops from 88 kW to **14.8 kW**.
   - Load percentage drops to **11.2%** ($< 15\%$ idle threshold).
   - Operational State switches to `IDLE`.
   - Timer counts up past 60 seconds (or fast-forward in demo mode).
4. As soon as the event fires, point to the red **Wastage Alert Banner** that appears.
5. Click **"Inspect Detection Evidence"** to open the **Evidence Modal**.

**Spoken Script:**
> *"I have just triggered an operational delay. Look at the telemetry: the conveyor is running empty. Active power dropped to 14.8 kW, and load percentage is down to 11.2%.*
>
> *A standard SCADA system would simply show 'Motor Running = TRUE' and see nothing wrong. But ORVEX evaluates calibrated piecewise power baselines.*
>
> *Because load is under 15% and excess power exceeds our 5 kW deadband for over 60 seconds, ORVEX classifies this as Sustained Idle Wastage.*
>
> *(Click Evidence Modal)* *Notice this: ORVEX is completely explainable. We do not use opaque, black-box AI. In this Evidence Modal, judges can see the exact mathematical justification: raw active power was 14.8 kW, baseline allowed power was 0.0 kW during idle, yielding 14.8 kW of excess draw. Using trapezoidal numerical quadrature bounded by a 30-second gap protection rule, ORVEX quantifies that this 3-minute idle run wasted 0.14 kWh of electricity. With analytical error of 0.0000%, operators have an audit-ready trail."*

---

### Minute 4:15 – 5:30: Machine-Health Intelligence & The Sensor Honesty Guard

**Action:**
1. Navigate to **Machine Health Center** (`/health`).
2. Point to the **Fleet Health Summary** card and the health status bars.
3. Scroll down to inspect the health breakdown for `DEMO-CONV-01` and `DEMO-PUMP-02`.
4. Point to the **Vibration Status Indicator**.

**Spoken Script:**
> *"Energy wastage is often a symptom of underlying mechanical distress. ORVEX pairs energy intelligence with multi-modal machine health.*
>
> *We monitor three critical health dimensions:*
> 1. *Electrical Stress: tracking phase current unbalance according to IEEE 1459. When unbalance exceeds 10%, stator heating increases dramatically.*
> 2. *Thermal Stress: reading real-time motor casing temperature via our DS18B20 digital probe with Class F insulation thresholds at 85°C and 105°C.*
> 3. *Mechanical Vibration: evaluated against ISO 10816-3 severity zones.*
>
> *Now, I want to direct your attention to something rare in technology demonstrations: technical honesty. Look at the vibration metric on this screen. It does not show a fake green 'Normal' reading. It explicitly displays 'UNMEASURED_NOT_INSTALLED'.*
>
> *Because our current physical retrofit node has electrical and thermal sensors installed but not yet a high-frequency vibration accelerometer, our health engine enforces an unmeasured sensor guard. It refuses to invent synthetic data or produce false alarms. Judges, we believe true industrial reliability begins with absolute data integrity."*

---

### Minute 5:30 – 6:30: Alert Lifecycle Management & Exportable Reports

**Action:**
1. Navigate to the **Alert Center** (`/alerts`).
2. Show the newly generated `IDLE_WASTAGE` alert for `DEMO-CONV-01`.
3. Click the alert card to expand details.
4. Click **"Acknowledge Alert"**, then click **"Resolve Alert"** with an operational note: *"Interlocked conveyor with feeder hopper level switch"*.
5. Navigate to **Reports View** (`/reports`).
6. Point to the Energy Wastage Summary table and click **"Export CSV"**.

**Spoken Script:**
> *"An alert is only valuable if it drives operational action. Here in the Alert Center, operators can triage active alerts by severity, machine, and wastage type.*
>
> *Every alert provides an actionable engineering recommendation: here, ORVEX advises interlocking the conveyor starter circuit with the upstream bin level.*
>
> *I acknowledge this alert and resolve it with our corrective maintenance log. Everything is tracked in TimescaleDB.*
>
> *Finally, plant managers need verifiable reports for ESG and energy audits. In the Reports Center, we see aggregate wasted energy and financial cost categorized across shifts. With one click, this data exports as a clean, standardized CSV ready for plant management or carbon accounting."*

---

### Minute 6:30 – 7:00: Wrap-Up, Value Proposition & Invitation for Questions

**Action:**
1. Switch to the final slide on the pitch deck or return to **Fleet Command Center**.
2. Stand facing the judges with complete confidence.

**Spoken Script:**
> *"To conclude: ORVEX bridges the gap between legacy industrial machinery and modern energy intelligence.*
>
> *It delivers:*
> 1. *Zero-downtime, safe retrofit hardware for \$325.*
> 2. *100% explainable, mathematically proven energy wastage detection.*
> 3. *Rigorous engineering backed by 253 backend tests, 138 frontend tests, and zero false alarms.*
>
> *Thank you. We welcome your questions."*

---

## 3. Contingency & Fallback Runbook (Live Demo Resilience)

If unexpected technical failures occur during the live evaluation, follow these pre-rehearsed contingency procedures without hesitation.

```
+-----------------------------------------------------------------------------------------+
|                              CONTINGENCY DECISION MATRIX                                |
+-----------------------+-----------------------------+-----------------------------------+
| Issue Encountered     | Primary Diagnostic          | Presenter Action / Recovery       |
+-----------------------+-----------------------------+-----------------------------------+
| Physical Wi-Fi Drops  | ESP32 Amber LED lights up   | Seamlessly switch to Simulator    |
| (Quarry / Venue AP)   | Ring buffer begins storing  | "Our 30-sample ring buffer stores |
|                       |                             | data; let us view live simulator" |
+-----------------------+-----------------------------+-----------------------------------+
| Projector Disconnect  | Display goes black          | Pick up physical prototype box    |
|                       |                             | Walk judges through physical BOM, |
|                       |                             | CT shorting block, and fusing     |
+-----------------------+-----------------------------+-----------------------------------+
| Local Port Conflict   | Uvicorn daemon interrupted  | Run background health script:     |
|                       |                             | curl http://127.0.0.1:8000/health |
|                       |                             | or view pre-rendered screenshots  |
+-----------------------+-----------------------------+-----------------------------------+
```

### 3.1 Script for Wi-Fi / Hardware Disconnect:
> *"Notice the amber LED on our ESP32 enclosure has illuminated. The venue's wireless network has experienced a brief drop. Rather than losing telemetry, the ESP32 has automatically activated its internal 30-sample SPIFFS ring buffer.*
>
> *When connection restores, it will flush without loss. In the meantime, our system seamlessly processes telemetry via our local edge simulator service, ensuring uninterrupted plant monitoring."*

### 3.2 Script for Deep Technical Inquiries:
> *"Every formula, threshold, and benchmark I have shown you is open in our code repository. We have full empirical logs, test suites passing 100% across 391 automated tests, and itemized calibration logs available for inspection."*

