# ORVEX Deployment Guide

## Overview

ORVEX is an industrial energy-intelligence and machine condition-monitoring platform engineered for mining equipment. This document provides complete instructions for both **Local Development** and **Production-Hardened Containerized Deployment**.

---

## 1. Network Topology & Architecture

In production, ORVEX enforces network isolation to protect industrial data assets:

```
[ Industrial Sensors / Edge Nodes ]
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

### Key Security & Operational Guarantees:
- **Zero Direct Exposure of Database**: PostgreSQL/TimescaleDB port is not published to the host network in production; it is accessible solely inside `orvex-prod-network`.
- **Backend Internal Isolation**: Backend runs on internal port 8000; the Nginx reverse proxy routes public web and API traffic on non-root port 8080.
- **Persistent Storage**: Named volumes ensure persistence of time-series data and MQTT broker states:
  - `timescale_prod_data`: TimescaleDB relational and hypertable data.
  - `mosquitto_prod_data`: MQTT broker persistent storage.
  - `mosquitto_prod_log`: Broker operational logs.

---

## 2. Prerequisites

- **Docker Engine** (v24.0+) & **Docker Compose** (v2.20+)
- For local development outside containers:
  - **Python** (v3.11+)
  - **Node.js** (v20+) & **npm** (v10+)
  - **PowerShell** (Windows) or **Bash** (Linux/macOS)

---

## 3. Quickstart: Production Deployment (Docker Compose)

The production deployment compiles the React dashboard into an optimized static build served via an unprivileged Nginx container, runs the backend with multi-worker Uvicorn, applies pending database migrations on boot, and orchestrates health dependencies.

### Step 1: Prepare Environment Configuration
Copy the production configuration template:
```powershell
# PowerShell
Copy-Item .env.example .env

# Bash
cp .env.example .env
```
Ensure you update passwords in `.env`:
```env
ENVIRONMENT=production
POSTGRES_PASSWORD=your_secure_db_password
DATABASE_URL=postgresql+psycopg://orvex:your_secure_db_password@database:5432/orvex
CORS_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
```

### Step 2: Launch the Stack
Use the automated startup script:
```powershell
# Windows PowerShell
.\scripts\start_orvex.ps1

# Linux / macOS Bash
./scripts/start_orvex.sh
```

Or run Docker Compose directly:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Step 3: Verify Deployment
Once started, access the platform:
- **Web Dashboard**: [http://localhost:8080](http://localhost:8080)
- **Health Check**: [http://localhost:8080/health](http://localhost:8080/health)
- **Readiness Probe**: [http://localhost:8080/api/v1/system/readiness](http://localhost:8080/api/v1/system/readiness)
- **Liveness Probe**: [http://localhost:8080/api/v1/system/liveness](http://localhost:8080/api/v1/system/liveness)
- **System Observability & Status**: [http://localhost:8080/api/v1/system/status](http://localhost:8080/api/v1/system/status)

Execute the automated verification suite:
```bash
python scripts/verify_deployment.py
```

### Step 4: Graceful Shutdown
```powershell
# Windows PowerShell
.\scripts\stop_orvex.ps1

# Linux / macOS Bash
./scripts/stop_orvex.sh
```

---

## 4. Local Development Workflow

For active local development with hot-reloading:

### Step 1: Start Core Infrastructure (DB & MQTT)
```bash
docker compose up -d
```
This exposes PostgreSQL/TimescaleDB on `127.0.0.1:5433` and Mosquitto MQTT on `127.0.0.1:1883`.

### Step 2: Apply Database Migrations
```powershell
# PowerShell
.\scripts\migrate_db.ps1

# Bash
./scripts/migrate_db.sh
```

### Step 3: Run Backend Service
```bash
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
- API Docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### Step 4: Run Frontend Development Server
```bash
cd frontend
npm install
npm run dev
```
- Dashboard: [http://localhost:5173](http://localhost:5173)

---

## 5. Database Maintenance & Disaster Recovery

### Creating a Timestamped Database Backup
```powershell
# PowerShell
.\scripts\backup_db.ps1

# Bash
./scripts/backup_db.sh
```
Backups are saved to `backups/orvex_backup_YYYYMMDD_HHMMSS.sql`.

### Restoring Database from Backup
```powershell
# PowerShell
.\scripts\restore_db.ps1 -BackupFile backups\orvex_backup_YYYYMMDD_HHMMSS.sql

# Bash
./scripts/restore_db.sh backups/orvex_backup_YYYYMMDD_HHMMSS.sql
```

### Verifying Backup Integrity
ORVEX includes an automated end-to-end backup and restore integrity test:
```bash
python scripts/test_db_backup_restore.py
```
This creates a canary entity, takes a full database dump, simulates catastrophic data loss, restores from the dump, verifies record integrity, and audits the database to verify zero residual rows.

