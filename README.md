# ORVEX — Industrial Mining Energy Intelligence Platform

ORVEX (Operational Resource & Vibration eXplorer) is an industrial energy-intelligence, condition-monitoring, and wastage-detection platform engineered for legacy mining and quarrying equipment (overland conveyors, slurry pumps, primary crushers, ventilation fans, mine hoists) using retrofit telemetry, explainable deterministic analytics, and condition-monitoring intelligence.

The platform is a low-cost, non-invasive retrofit system that attaches to existing machinery without modifying the equipment. It uses non-invasive electrical metering, split-core current sensing, motor casing temperature monitoring, and edge telemetry to learn and evaluate operating patterns, eliminating hidden energy wastage and detecting equipment degradation.

---

## Production Architecture & Network Topology

```text
[ Physical Sensors / Edge Nodes / Simulators ]
                       │
                       ▼ (Port 1883 / TLS 8883 - MQTT with ACLs)
              [ Eclipse Mosquitto ]
                       │
                       ▼
 ┌─── orvex-prod-network (Internal Docker Bridge) ────────┐
 │                                                        │
 │  [ FastAPI Backend ] ◄──► [ TimescaleDB / Postgres 16] │
 │  (Port 8000 Internal)     (Port 5432 Internal)         │
 │           ▲                                            │
 │           │ (Reverse Proxy: /api/*, /health)           │
 │  [ Nginx Frontend ] (Port 8080)                        │
 └───────────┬────────────────────────────────────────────┘
             │
             ▼ (Port 8080 External)
    [ Operator Web Browser ]
```

---

## Subsystem Overview

| Component | Tech Stack | Status | Primary Location |
|---|---|---|---|
| **Database** | PostgreSQL 16 + TimescaleDB 2.17, Alembic | Complete | `database/`, `backend/app/db/` |
| **Ingestion API** | FastAPI, Pydantic v2, SQLAlchemy 2.x | Complete | `backend/app/api/routes/telemetry.py` |
| **Telemetry Simulator** | Python, Stochastic Physics Engine | Complete | `simulator/` |
| **Feature Engine** | Python, Numerical Integration | Complete | `analytics/features/`, `analytics/services/` |
| **Wastage Detector** | Deterministic Multi-Condition Rules | Complete | `analytics/detectors/` |
| **Event Persistence** | PostgreSQL `energy_wastage_events` Table | Complete | `backend/app/services/wastage_event_service.py` |
| **Analytics Pipeline** | Orchestrator, History-Window Engine | Complete | `backend/app/services/analytics_orchestrator.py` |
| **Backend REST APIs** | FastAPI Read-Only Analytics Endpoints | Complete | `backend/app/api/routes/` |
| **Industrial Dashboard** | React 19, TypeScript, Vite, Tailwind CSS | Complete | `frontend/` |
| **System Reliability & Demo** | Demo Runner CLI, End-to-End Suites | Complete | `scripts/demo_runner.py`, `scripts/demo_stage_8a.py` |
| **Intelligent Alerts** | Rule-Based Severity, Actionable Recommendations | Complete | `backend/app/services/alert_service.py` |
| **Energy Reports & CSV** | Fleet Aggregation, RFC 4180 CSV Export | Complete | `backend/app/services/report_service.py` |
| **MQTT Hardware Gateway** | Paho MQTT 2.x, Mosquitto Broker, Unit Normalization | Complete | `backend/app/gateway/` |
| **Hardware Adapters** | Modbus TCP/RTU, CT Clamp, Vibration, Temp Specs | Complete | `hardware/` |
| **Explainable Energy Intelligence** | Pattern Recognition, Benchmarking, Impact Tracking | Complete | `backend/app/services/energy_intelligence_service.py` |
| **Condition Monitoring & Health** | ISO 10816 Vibration, Thermal, Electrical Imbalance | Complete | `backend/app/services/machine_health_service.py` |
| **Validation & Benchmarking** | 10 Scenarios, Trapezoidal Tests, Micro-benchmarks | Complete | `validation/`, `scripts/validate_stage_8a.py` |
| **Production Hardening & Ops** | Docker, Nginx, Security Headers, Rate Limits, Backups | Complete | `docker-compose.prod.yml`, `backend/app/middleware/` |
| **CAD & Mechanical Models** | STEP 3D Model, SolidWorks Part | Complete | `InitialModel.STEP`, `e_cad.SLDPRT` |
| **EDA & Circuit Schematics** | KiCad Schematic, Hardware Firmware | Complete | `eda.kicad_sch`, `hardware/esp32/` |
| **Competition Package** | Vishwakarma Awards 2026–27 Deliverables | Complete | `competition/` |

---

## Quickstart: Production Deployment (Single-Command)

### 1. Launch the Stack
```powershell
# Windows PowerShell
.\scripts\start_orvex.ps1

# Linux / macOS Bash
./scripts/start_orvex.sh
```

### 2. Verify Services
- **Dashboard Web UI**: [http://localhost:8080](http://localhost:8080)
- **Health Check**: [http://localhost:8080/health](http://localhost:8080/health)
- **Readiness Probe**: [http://localhost:8080/api/v1/system/readiness](http://localhost:8080/api/v1/system/readiness)
- **Liveness Probe**: [http://localhost:8080/api/v1/system/liveness](http://localhost:8080/api/v1/system/liveness)
- **System Observability**: [http://localhost:8080/api/v1/system/status](http://localhost:8080/api/v1/system/status)

Run the automated verification suite:
```powershell
python scripts/verify_deployment.py
```

### 3. Graceful Shutdown
```powershell
# Windows PowerShell
.\scripts\stop_orvex.ps1

# Linux / macOS Bash
./scripts/stop_orvex.sh
```

---

## Local Development Workflow

### Step 1: Start Database & MQTT Broker
```powershell
docker compose up -d
```
Maps PostgreSQL/TimescaleDB to `127.0.0.1:5433` and Mosquitto to `127.0.0.1:1883`.

### Step 2: Apply Database Migrations
```powershell
# Windows PowerShell
.\scripts\migrate_db.ps1

# Linux / macOS Bash
./scripts/migrate_db.sh
```

### Step 3: Run Backend Service
```powershell
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```
- API Docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### Step 4: Run Frontend Development Server
```powershell
cd frontend
npm install
npm run dev
```
- Dashboard: [http://localhost:5173](http://localhost:5173)

---

## Operational Automation & Database Management

| Script | Purpose | Usage |
|---|---|---|
| `scripts/start_orvex.ps1` (`.sh`) | Single-command production stack startup | `.\scripts\start_orvex.ps1` |
| `scripts/stop_orvex.ps1` (`.sh`) | Graceful stack shutdown | `.\scripts\stop_orvex.ps1` |
| `scripts/migrate_db.ps1` (`.sh`) | Runs pending Alembic migrations | `.\scripts\migrate_db.ps1` |
| `scripts/backup_db.ps1` (`.sh`) | Timestamped SQL backup of PostgreSQL / TimescaleDB | `.\scripts\backup_db.ps1` |
| `scripts/restore_db.ps1` (`.sh`) | Restores database from a specified backup file | `.\scripts\restore_db.ps1 -BackupFile <file>` |
| `scripts/test_db_backup_restore.py` | Automated backup/restore data integrity test | `python scripts/test_db_backup_restore.py` |
| `scripts/verify_deployment.py` | Production health, security headers, & status verification | `python scripts/verify_deployment.py` |
| `scripts/demo_stage_8a.py` | Stage 8A validation and live dashboard demo script | `python scripts/demo_stage_8a.py` |

---

## Security Architecture & OT Scope Statement

> [!CAUTION]
> **API Authentication Scope Limitation**:
> ORVEX currently does **NOT** enforce user authentication (e.g., JWT, OAuth2, session cookies, or API keys) on its REST API endpoints. All endpoints exposed via the backend/reverse proxy are accessible to any client with network reachability.
> 
> ORVEX is engineered as an internal monitoring tool for closed Operational Technology (OT) networks (Purdue Model Level 2/3). **Never expose ORVEX directly to the public Internet without an upstream VPN, Zero-Trust Access proxy, or authenticating reverse proxy.**

### Layered Defensive Controls Implemented:
1. **Non-Root Containers**: Backend runs as `UID 10001` (`orvex`); Frontend runs on unprivileged Nginx (`UID 101`).
2. **Network Isolation**: PostgreSQL/TimescaleDB port is not published to the host network in production; communication is internal to `orvex-prod-network`.
3. **HTTP Security Headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`, CSP, and conditional HSTS.
4. **Denial-of-Service Defense**: Ingestion request body limit of 2MB (HTTP 413) and sliding-window rate limiting per IP (120 req/min, HTTP 429).
5. **Sanitized Observability**: Credential redaction (`***`) on database connection strings in logs and system status endpoints; production exception shielding preventing traceback leakage.
6. **MQTT Security**: Password authentication and topic ACL configuration templates (`docker/mosquitto.prod.conf` and `docker/acl_file.example`).

---

## Validation & Automated Test Suites

```powershell
# 1. Deployment & Security Verification Suite
python scripts/verify_deployment.py

# 2. Database Backup & Restore Data Integrity Test
python scripts/test_db_backup_restore.py

# 3. Stage 8A Validation & Benchmark Suite (10 Scenarios, Trapezoidal, Health Engine)
python scripts/validate_stage_8a.py

# 4. Stage 7B Machine Health & Condition Monitoring Validation
python scripts/validate_stage_7b.py

# 5. Combined Python Unit & Integration Tests (253 tests)
python -m pytest

# 6. Frontend Vitest Suite (138 tests)
npm --prefix frontend test
```
