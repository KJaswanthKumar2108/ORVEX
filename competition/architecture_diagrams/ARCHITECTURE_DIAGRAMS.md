# ORVEX — Technical Architecture Diagrams
## Vishwakarma Awards 2026–27 | System Design & Dataflow Blueprints

This document provides formal, presentation-grade architecture diagrams representing the complete **ORVEX (Operational Resource & Vibration Efficiency eXplorer)** platform. Every diagram strictly reflects the implemented codebase, hardware interfaces, telemetry pipelines, and deterministic analytical engines.

---

## 1. Complete ORVEX End-to-End System Architecture

The following diagram illustrates the multi-tier architecture spanning physical assets, edge instrumentation, message transport, backend microservices, time-series persistence, and presentation layers.

```mermaid
flowchart TD
    subgraph PhysicalAssets["1. Physical Industrial Equipment (MCC)"]
        M1["Primary Jaw Crusher\n(250 kW Slip-Ring Motor)"]
        M2["Overland Belt Conveyor\n(132 kW Squirrel-Cage Motor)"]
        M3["Slurry Dewatering Pump\n(75 kW Induction Motor)"]
        M4["Ventilation Fan\n(90 kW Induction Motor)"]
    end

    subgraph EdgeHardware["2. Retrofit Edge Instrumentation (IP66 Enclosure)"]
        CT["3x Split-Core CTs\n(0-500A : 5A Secondary)"]
        VT["Voltage Taps\n(In-line 2A Ceramic Fuses)"]
        TS["DS18B20 1-Wire Temp\n(Motor Bearing Casing)"]
        EM["Eastron SDM630 / PZEM-004T\n(Class 1.0 Energy Meter)"]
        ISO["Galvanic RS-485 Transceiver\n(MAX13487 + Optocouplers)"]
        ESP["ESP32 Edge Microcontroller\n(Dual Core 240MHz, FreeRTOS)"]
        RB["Ring Buffer SPIFFS/RAM\n(30-Sample Offline Store)"]
        WDT["Hardware Watchdog WDT\n(10s Strobe Reset)"]

        M1 -.->|Current| CT
        M1 -.->|Voltage| VT
        M1 -.->|Surface Temp| TS
        CT -->|Secondary Current| EM
        VT -->|Protected Potential| EM
        TS -->|1-Wire GPIO 4| ESP
        EM -->|Modbus RTU / RS-485| ISO
        ISO -->|UART1 GPIO 16/17| ESP
        ESP <--> RB
        ESP <--> WDT
    end

    subgraph TransportLayer["3. Industrial Transport & Ingestion"]
        WIFI["Industrial Wi-Fi / Ethernet\n(WPA2-Enterprise / 802.11 b/g/n)"]
        MQTT["Mosquitto MQTT Broker\n(Port 1883, Topic: orvex/telemetry/+)"]
        SUB["FastAPI Telemetry Subscriber\n(asyncio-mqtt Client Background Task)"]

        ESP -->|MQTT Publish QoS 1| WIFI
        WIFI --> MQTT
        MQTT -->|Push Notifications| SUB
    end

    subgraph BackendCore["4. FastAPI Analytical Backend & TimescaleDB"]
        VAL["Pydantic Payload Validation\n(Schema & Range Checking)"]
        TSDB[("TimescaleDB / PostgreSQL 16\n(Hypertables, 1-Day Chunks)")]
        FE["Feature Extraction Pipeline\n(Load %, Power Factor, Power Deficit)"]
        E_ENG["Energy Intelligence Engine\n(Piecewise Baseline & Trapezoidal Quadrature)"]
        H_ENG["Machine Health Engine\n(Multi-Modal & ISO 10816 Fallback Guard)"]
        EVT_SRV["Event & Alert Aggregator\n(30s Gap Protection & Deduplication)"]
        REST_API["FastAPI REST & WebSocket Gateway\n(Port 8000, 31 Endpoints)"]

        SUB --> VAL
        VAL --> TSDB
        VAL --> FE
        FE --> E_ENG
        FE --> H_ENG
        E_ENG --> EVT_SRV
        H_ENG --> EVT_SRV
        EVT_SRV --> TSDB
        TSDB <--> REST_API
    end

    subgraph PresentationLayer["5. React 19 Executive & Engineering UI"]
        UI_FLEET["Fleet Command Center\n(Live Status & Wastage Aggregates)"]
        UI_MACH["Machine Detail & Oscilloscope\n(3-Phase Electrical & Health Inspector)"]
        UI_ENG["Energy Intelligence Explorer\n(Cost Heatmaps & Wasted kWh Analytics)"]
        UI_HLT["Machine Health Center\n(ISO 10816 Status & Degradation Tracking)"]
        UI_ALRT["Alert Lifecycle Manager\n(Triage, Ack, Resolve & Root Cause)"]
        UI_DEMO["Interactive Demonstration Center\n(Live Simulator Control & Evidence Modal)"]

        REST_API <-->|REST API + WebSocket| UI_FLEET
        REST_API <-->|REST API + WebSocket| UI_MACH
        REST_API <-->|REST API + WebSocket| UI_ENG
        REST_API <-->|REST API + WebSocket| UI_HLT
        REST_API <-->|REST API + WebSocket| UI_ALRT
        REST_API <-->|REST API + WebSocket| UI_DEMO
    end
```

---

## 2. Physical Hardware & Sensor Architecture

The hardware design focuses on **zero downtime retrofitting**, **electrical isolation**, and **personnel safety** around 415V/690V motor control centers.

```mermaid
graph LR
    subgraph MCC_Cabinet["Motor Control Center (MCC) Panel"]
        L1["Phase A (R)"]
        L2["Phase B (Y)"]
        L3["Phase C (B)"]
        N["Neutral / Ground"]
        
        CT1["Split-Core CT Phase A"]
        CT2["Split-Core CT Phase B"]
        CT3["Split-Core CT Phase C"]
        SB["CT Shorting Block\n(Safety Shunt before disconnect)"]

        F1["2A Ceramic Fuse"]
        F2["2A Ceramic Fuse"]
        F3["2A Ceramic Fuse"]
        FN["1A Neutral Fuse"]

        L1 --- CT1
        L2 --- CT2
        L3 --- CT3
        CT1 --> SB
        CT2 --> SB
        CT3 --> SB

        L1 --- F1
        L2 --- F2
        L3 --- F3
        N --- FN
    end

    subgraph SensorHub["IP66 Industrial Retrofit Enclosure"]
        SDM["Eastron SDM630 Modbus RTU\n3-Phase Power Meter (Class 1.0)\nRegisters: V, I, P, Q, S, PF, Freq, kWh"]
        PSU["Mean Well HDR-15-5\nDIN-Rail PSU (85-264VAC in -> 5VDC out)"]
        
        SB -->|Current Inputs I1, I2, I3| SDM
        F1 -->|Voltage Inputs V1| SDM
        F2 -->|Voltage Inputs V2| SDM
        F3 -->|Voltage Inputs V3| SDM
        FN -->|Voltage Neutral Vn| SDM
        F1 --> PSU
        FN --> PSU

        RS485["Galvanic Isolation Transceiver\n(MAX13487 + 2.5kV Optocouplers)\nAuto-Direction Flow Control"]
        
        SDM -->|RS-485 Differential A/B| RS485

        subgraph EdgeCompute["Edge Processing Unit"]
            ESP32["ESP32-WROOM-32D\n(Dual Xtensa 32-bit LX6 @ 240MHz)\n520 KB SRAM | 4 MB Flash"]
            DS["DS18B20 Temp Sensor\n(Motor Housing, IP68 probe)"]
            PULLUP["4.7kΩ Pull-up Resistor"]
            LEDS["Status LEDs (GPIO 2, GPIO 15)\n(Heartbeat & Modbus Activity)"]
            
            RS485 -->|UART RX (GPIO 16) / TX (GPIO 17)| ESP32
            DS -->|1-Wire Bus (GPIO 4)| ESP32
            PULLUP --- DS
            ESP32 --> LEDS
            PSU -->|5V / GND Clean Power| ESP32
        end
    end

    subgraph Network["Wireless / Industrial Bus"]
        AP["Industrial AP / Gateway\n(Mosquitto MQTT Server :1883)"]
        ESP32 -->|802.11 b/g/n Wi-Fi or W5500 SPI Ethernet| AP
    end
```

---

## 3. End-to-End Telemetry Pipeline

The telemetry pipeline delivers sub-second sampling with deterministic QoS 1 guarantees, ring-buffer fault tolerance, and TimescaleDB hypertable ingestion.

```mermaid
sequenceDiagram
    autonumber
    participant Motor as Induction Motor (415V)
    participant Sensors as CTs & SDM630 Meter
    participant ESP as ESP32 Firmware
    participant MQTT as Mosquitto Broker (:1883)
    participant Sub as Telemetry Ingestion Task
    participant DB as TimescaleDB (:5433)
    participant WS as WebSocket Broadcaster
    participant UI as React Dashboard

    loop Every 1000 ms (1 Hz Cycle)
        Motor->>Sensors: Magnetic flux & phase potential
        ESP->>Sensors: Modbus RTU Read Holding Registers (Func 03, Reg 0x0000-0x0040)
        Sensors-->>ESP: Float32 IEEE 754 registers (V, I, P, PF, kWh)
        ESP->>ESP: Read 1-Wire DS18B20 Temp & Append Watchdog Ping
        
        alt Network Connected
            ESP->>MQTT: PUBLISH "orvex/telemetry/{machine_id}" (QoS 1, JSON payload)
            MQTT-->>ESP: PUBACK
            opt Ring Buffer Has Backlog
                ESP->>MQTT: Flush offline buffered records (FIFO order)
            end
        else Network Offline / AP Unreachable
            ESP->>ESP: Store payload in SPIFFS Ring Buffer (Max 30 samples)
            ESP->>ESP: Flash Amber LED (GPIO 15) Error Indicator
        end
    end

    MQTT->>Sub: Deliver MQTT message (QoS 1)
    Sub->>Sub: Validate payload with Pydantic (TelemetryCreateSchema)
    
    par Ingestion & Real-Time Broadcast
        Sub->>DB: INSERT INTO telemetry (time, machine_id, voltage, current, power...)
        DB-->>Sub: Write Acknowledged (< 15 ms latency)
    and
        Sub->>WS: Broadcast machine_state_update
        WS->>UI: React 19 State Update (< 50 ms latency)
    end
```

---

## 4. Energy-Intelligence Processing Pipeline

ORVEX differentiates true mechanical work from idle, low-load, and overload wastage via machine-specific piecewise power baselines and trapezoidal numerical quadrature.

```mermaid
flowchart TD
    RAW["Raw Telemetry Stream\n(P_active, Q_reactive, V_rms, I_rms, PF)"] --> FE["1. Feature Extraction & Load Ratio Calculation"]
    
    subgraph FeatureExtraction["Feature Engineering"]
        FE --> LR["Load Percentage:\nL% = (P_active / P_rated) * 100"]
        FE --> PF_CHK["Power Factor Tracking:\nPF = P_active / S_apparent"]
    end

    LR --> PB["2. Piecewise Baseline Evaluation"]
    
    subgraph BaselineModel["Machine Baseline Model"]
        PB --> CALC["Expected Baseline Power Formula:\nP_expected = P_rated * (alpha_S + beta_S * L%)\n(where alpha_S and beta_S are calibrated slope/intercept)"]
        CALC --> EXCESS["Excess Unproductive Power:\nP_excess = max(0, P_active - P_expected)"]
    end

    EXCESS --> STATE["3. Deterministic Machine State Classification"]

    subgraph StateEngine["Operational State Machine"]
        STATE --> S_STOP["STOPPED:\nP < P_stop_threshold"]
        STATE --> S_START["STARTING:\ndP/dt > inrush_threshold & t < t_transient"]
        STATE --> S_IDLE["IDLE:\nL% < 15% & P > P_stop_threshold"]
        STATE --> S_RUN["RUNNING:\n15% <= L% <= 100%"]
        STATE --> S_OVER["OVERLOAD:\nL% > 100% or P > 1.25 * P_rated"]
    end

    S_IDLE --> R1["Rule 1: Sustained Idle Wastage\n(L% < 15%, P_excess >= 5kW, Duration >= 60s)"]
    S_RUN --> R2["Rule 2: Low-Load Inefficiency\n(L% <= 30%, P_excess >= 8kW, PF < 0.70, Duration >= 120s)"]
    S_OVER --> R3["Rule 3: Abnormal Power Overload\n(P / P_baseline >= 1.25, Duration >= 60s)"]
    S_START --> R4["Rule 4: Start-Stop Cycling\n(Starts >= 3 within 600s sliding window)"]

    subgraph EventIntegration["4. Numerical Integration & Deduplication"]
        R1 & R2 & R3 & R4 --> EVT_GEN["Active Wastage Event"]
        EVT_GEN --> GAP{"Time Gap > 30s?"}
        GAP -- Yes --> SPLIT["Finalize Previous Event Interval\nStart Fresh Event to Avoid Extrapolation"]
        GAP -- No --> TRAP["Trapezoidal Numerical Integration:\nE_wasted = sum [ 0.5 * (P_excess(i) + P_excess(i-1)) * dt ] / 3600"]
        TRAP --> DEDUP{"Active Event Exists in DB?"}
        DEDUP -- Yes --> UPDATE["Update Duration, Peak Power & Cumulative kWh"]
        DEDUP -- No --> INSERT["Persist New Wastage Event & Trigger Alert"]
    end
```

---

## 5. Machine-Health Intelligence Pipeline

The health pipeline processes electrical stress, thermal limits, and mechanical vibration with a strict **unmeasured-sensor fallback guard** that prevents false negatives and false positives.

```mermaid
flowchart TD
    TELE["Telemetry Record\n(Currents, Temperatures, Vibrations, State)"] --> INSP["Multi-Modal Feature Parser"]

    subgraph ElectricalStress["1. Electrical Condition Health"]
        INSP --> UNBAL["Current Unbalance Check:\nI_unbalance = (max(|I_phase - I_avg|) / I_avg) * 100"]
        INSP --> PF_HEALTH["Power Factor Stress:\nPF < 0.70 for > 5 minutes"]
        UNBAL --> ELEC_STATUS{"I_unbalance > 10%?"}
        ELEC_STATUS -- Yes --> ELEC_WARN["WARNING / CRITICAL:\nPhase unbalance degrades stator insulation"]
        ELEC_STATUS -- No --> ELEC_OK["NORMAL: Balanced 3-Phase Supply"]
    end

    subgraph ThermalStress["2. Thermal Condition Health"]
        INSP --> TEMP_VAL["Motor Casing Temperature (DS18B20)"]
        TEMP_VAL --> T_CHECK{"T > 85°C Warning?\nT > 105°C Critical?"}
        T_CHECK -- Warning --> T_WARN["WARNING: Bearing or winding overheating"]
        T_CHECK -- Critical --> T_CRIT["CRITICAL: Immediate thermal breakdown risk"]
        T_CHECK -- Normal --> T_OK["NORMAL: Within Class F thermal limits"]
    end

    subgraph VibrationGuard["3. Vibration Condition Health (ISO 10816-3)"]
        INSP --> VIB_VAL["Vibration RMS Velocity (mm/s)"]
        VIB_VAL --> V_ATTACHED{"Physical Accelerometer\nHardware Installed?"}
        
        V_ATTACHED -- No / None --> UNMEASURED["Status: UNMEASURED_NOT_INSTALLED\n(Zero false alerts generated;\nExplicitly shown as unmonitored channel)"]
        
        V_ATTACHED -- Yes (Physical Sensor) --> ISO_CHECK{"ISO 10816-3 Group 1/2 Evaluation\nZone A: < 2.3 mm/s (Good)\nZone B: 2.3 - 4.5 mm/s (Acceptable)\nZone C: 4.5 - 7.1 mm/s (Warning)\nZone D: > 7.1 mm/s (Critical Danger)"}
        
        ISO_CHECK -- Zone A/B --> VIB_OK["NORMAL: Smooth Mechanical Operation"]
        ISO_CHECK -- Zone C --> VIB_WARN["WARNING: Unbalance / Misalignment Developing"]
        ISO_CHECK -- Zone D --> VIB_CRIT["CRITICAL: Immediate Mechanical Failure Threat"]
    end

    subgraph HealthSynthesis["4. Composite Machine Health Classification"]
        ELEC_WARN & ELEC_OK & T_WARN & T_CRIT & T_OK & UNMEASURED & VIB_OK & VIB_WARN & VIB_CRIT --> COMPOSITE["Worst-Case Health State Resolver\nState = max_severity(Electrical, Thermal, Vibration)"]
        COMPOSITE --> H_REC["Persist Machine Health Record\n(health_status, score, rule_observations)"]
        H_REC --> FLEET_CACHE["Fleet Health In-Memory Cache\n(Fast O(1) Dashboard Aggregation)"]
    end
```

---

## 6. Backend & TimescaleDB Database Architecture

The backend leverages **PostgreSQL 16 with TimescaleDB** extensions, partitioned hypertables, and optimized service layers that eliminate write-on-read bottlenecks.

```mermaid
erDiagram
    MACHINES ||--o{ MACHINE_BASELINES : "has calibrated"
    MACHINES ||--o{ TELEMETRY : "generates time-series"
    MACHINES ||--o{ WASTAGE_EVENTS : "incurs"
    MACHINES ||--o{ ALERTS : "triggers"
    MACHINES ||--o{ MACHINE_HEALTH_RECORDS : "evaluates"
    WASTAGE_EVENTS ||--o| ALERTS : "linked to"

    MACHINES {
        uuid id PK
        string identifier UK "e.g., DEMO-CONV-01"
        string name "Primary Overland Conveyor"
        string equipment_type "conveyor / crusher / pump"
        float rated_power_kw "132.0"
        float rated_voltage_v "415.0"
        float rated_current_a "230.0"
        float nominal_rpm "1480.0"
        string operational_status "running / stopped / degraded"
        timestamp created_at
    }

    MACHINE_BASELINES {
        uuid id PK
        uuid machine_id FK
        string state "IDLE / RUNNING / OVERLOAD"
        float baseline_power_kw "Calibrated expected draw"
        float power_factor_target "Target PF e.g., 0.88"
        float tolerance_percentage "Deadband margin e.g., 10%"
        timestamp updated_at
    }

    TELEMETRY {
        timestamp recorded_at PK, FK "TimescaleDB Partition Key (1-Day Chunk)"
        uuid machine_id PK, FK
        float active_power_kw
        float reactive_power_kvar
        float apparent_power_kva
        float voltage_v
        float current_a
        float power_factor
        float motor_temperature_c
        float vibration_rms_mms "Nullable (UNMEASURED)"
        float cumulative_kwh
        string operational_state
    }

    WASTAGE_EVENTS {
        uuid id PK
        uuid machine_id FK
        string event_type "IDLE_WASTAGE / LOW_LOAD / ABNORMAL_POWER"
        timestamp start_time
        timestamp end_time
        float duration_seconds
        float estimated_wasted_energy_kwh "Trapezoidal Integral"
        float total_consumed_energy_kwh
        float excess_power_kw_peak
        string detection_reason
        string severity "low / medium / high"
    }

    ALERTS {
        uuid id PK
        uuid machine_id FK
        uuid event_id FK
        string alert_type "IDLE_WASTAGE / OVERLOAD / HIGH_TEMP"
        string severity "low / medium / high / critical"
        string title
        text description
        text recommendation
        string status "open / acknowledged / resolved"
        timestamp created_at
        timestamp resolved_at
    }

    MACHINE_HEALTH_RECORDS {
        uuid id PK
        uuid machine_id FK
        timestamp evaluated_at
        string health_status "NORMAL / WARNING / CRITICAL"
        float health_score "0.0 - 100.0 Scale"
        jsonb rule_evaluations "Electrical, Thermal, Vibration rules"
        text primary_observation
    }
```

---

## 7. Industrial Production Deployment Architecture

The following diagram outlines the physical deployment in an operating quarry or mining facility, showing edge nodes, on-premise industrial gateways, and remote management consoles.

```mermaid
flowchart TB
    subgraph MiningField["Quarry / Open-Pit Mining Site (Hazardous Zone 2 / Outdoor)"]
        subgraph Substation1["Crushing Circuit MCC Shed"]
            E1["ORVEX Edge Node #1\n(Jaw Crusher 250 kW)"]
            E2["ORVEX Edge Node #2\n(Vibrating Screen 45 kW)"]
        end
        subgraph Substation2["Transport & Dewatering Substation"]
            E3["ORVEX Edge Node #3\n(Overland Conveyor 132 kW)"]
            E4["ORVEX Edge Node #4\n(Slurry Pump 75 kW)"]
        end
    end

    subgraph EdgeNetwork["Local Industrial Fieldbus / Network"]
        SW["Ruggedized Industrial Managed Switch\n(DIN-Rail IP40, Ring Topology)"]
        WIFI_AP["Industrial Outdoor Wi-Fi 6 AP\n(IP67, High-Gain Directional Antennas)"]

        E1 & E2 -->|Modbus RTU over RS-485 / Wi-Fi| WIFI_AP
        E3 & E4 -->|Shielded Cat6 / W5500 SPI| SW
        WIFI_AP --> SW
    end

    subgraph OnPremiseGateway["Plant Control Room (Edge Server)"]
        SRV["Ruggedized Fanless Industrial IPC\n(Intel Core i5 / Advantech UNO, 16GB RAM, 512GB NVMe)"]
        
        subgraph DockerHost["Docker Engine / Containerized Stack"]
            DC_MQTT["Mosquitto MQTT Container\n(Port 1883 - TLS Enabled)"]
            DC_DB["TimescaleDB Hypertables Container\n(PostgreSQL 16, Port 5432)"]
            DC_BE["FastAPI Microservices Container\n(Uvicorn ASGI, Port 8000)"]
            DC_FE["Nginx Web Reverse Proxy\n(React 19 Static SPA, Port 8080)"]
            
            DC_MQTT --> DC_BE
            DC_BE <--> DC_DB
            DC_FE <--> DC_BE
        end

        SW -->|Local Subnet 192.168.1.0/24| SRV
    end

    subgraph ClientAccess["Plant Personnel & Remote Management"]
        HMI["Control Room Operator Console\n(Touchscreen Workstation - Nginx :8080)"]
        TAB["Plant Maintenance Rugged Tablet\n(Wi-Fi Field Inspection)"]
        WAN["Cellular Gateway / VPN Router\n(4G/5G Private APN)"]
        CORP["Corporate Headquarter Energy Bureau\n(Multi-Site Remote Benchmarking)"]

        DC_FE -->|HTTP/WebSockets| HMI
        DC_FE -->|WPA3 Mobile Access| TAB
        DC_FE -->|Encrypted WireGuard VPN| WAN
        WAN --> CORP
    end
```

---

## 8. Summary of Architectural Integrity

Every block and interface represented in these seven diagrams corresponds directly to source artifacts in the ORVEX repository:

1. **Hardware Firmware:** `hardware/esp32/orvex_esp32_firmware.ino` (Modbus RTU, 1-Wire DS18B20, 30-sample ring buffer, 10s hardware watchdog).
2. **Gateway Transport:** `backend/app/services/telemetry_service.py` and `mosquitto.conf` (MQTT QoS 1 on topic `orvex/telemetry/{machine_id}`).
3. **Database Schema:** `backend/app/db/` and `docker-compose.yml` (TimescaleDB hypertable `telemetry` partitioned in 1-day chunks).
4. **Energy Analytics:** `backend/app/services/energy_engine.py` (Piecewise power baseline and trapezoidal numerical quadrature with 30s gap protection).
5. **Machine-Health Analytics:** `backend/app/services/machine_health_service.py` (Current unbalance, power factor, thermal limits, and `UNMEASURED_NOT_INSTALLED` vibration fallback).
6. **Frontend Dashboard:** `frontend/src/` (React 19 SPA running on Vite/Nginx with Fleet, Machine, Energy, Health, Alert, and Demonstration views).

