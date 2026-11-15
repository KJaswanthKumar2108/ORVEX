# ORVEX Deployment Troubleshooting Guide

This guide covers common deployment, containerization, network, and operational issues encountered when running ORVEX in development or production.

---

## 1. Port Conflicts

### Symptom: `Bind for 0.0.0.0:<port> failed: port is already allocated`
Common default ports used by ORVEX:
- `5433`: Local development PostgreSQL / TimescaleDB
- `1883`: Mosquitto MQTT Broker
- `8000`: Local FastAPI Backend (Uvicorn)
- `8080`: Production Nginx Reverse Proxy & Dashboard
- `5173`: Local Vite Development Server

### Resolution
Identify the process holding the port:
```powershell
# Windows PowerShell
Get-NetTCPConnection -LocalPort 5433,1883,8000,8080 -ErrorAction SilentlyContinue | Select-Object LocalPort,OwningProcess,State

# Linux / macOS
sudo lsof -i :5433 -i :1883 -i :8000 -i :8080
```
To adjust ports without modifying code, edit `.env`:
```env
POSTGRES_PORT=5434
MQTT_PORT=1884
```

---

## 2. Database Connection Issues

### Symptom: Backend logs `(psycopg.errors.ConnectionException) connection refused` or HTTP 503 on `/api/v1/system/readiness`
1. **Container Not Healthy**: TimescaleDB requires several seconds on initial start to configure the database cluster and load the Timescale extension.
   - Check container status: `docker ps --filter "name=database"`
   - Inspect PostgreSQL logs: `docker compose logs database`
2. **Network Resolution**:
   - Inside Docker Compose (`docker-compose.prod.yml`), the database hostname is `database` on port `5432`.
   - On the host machine (local dev), the database hostname is `localhost` (or `127.0.0.1`) on port `5433`.
   - Verify `DATABASE_URL` matches your execution context.
3. **Connection Pool Invalidation**:
   - If the database was restored or dropped while the backend was running, cached table OIDs in SQLAlchemy's connection pool may cause `could not open relation with OID ...`.
   - Fix: Restart the backend container or process:
     ```bash
     docker compose -f docker-compose.prod.yml restart backend
     ```

---

## 3. Database Migration Errors

### Symptom: Alembic fails with `Can't locate revision identified by '...'` or `Path does not exist`
1. **Script Location in alembic.ini**:
   - Alembic must resolve migrations relative to its configuration file. ORVEX uses `script_location = %(here)s/migrations`.
2. **Current Revision Inspection**:
   ```powershell
   python -m alembic -c database/alembic.ini current
   ```
3. **Upgrade to Head**:
   ```powershell
   python -m alembic -c database/alembic.ini upgrade head
   ```

---

## 4. MQTT Gateway Disconnections

### Symptom: `Disconnected unexpectedly from MQTT broker: reason_code=...`
1. **Broker Readiness**:
   - The ORVEX MQTT Gateway uses asynchronous background reconnection with exponential backoff (`reconnect_delay_set(min_delay=1, max_delay=20)`).
   - If the broker restarts, the gateway will automatically reconnect and re-subscribe without dropping the backend process.
2. **Authentication Mismatch**:
   - If `docker/mosquitto.prod.conf` has `allow_anonymous false`, verify that `MQTT_USERNAME` and `MQTT_PASSWORD` in `.env` match credentials created via `mosquitto_passwd`.
3. **Inspect Gateway Health**:
   - Call `GET /api/v1/system/status` and inspect the `mqtt_gateway` JSON object:
     ```json
     {
       "enabled": true,
       "running": true,
       "connected": true,
       "messages_received": 1420,
       "messages_ingested": 1420,
       "messages_rejected": 0
     }
     ```

---

## 5. Ingestion Rate Limiting & HTTP 413 / 429 Errors

### Symptom: Telemetry ingestion receives `HTTP 413 Payload Too Large`
- ORVEX enforces a default 2MB limit on request bodies to prevent memory exhaustion attacks.
- If sending extremely large batches, adjust in `.env`:
  ```env
  MAX_REQUEST_BODY_BYTES=5242880  # 5MB
  ```

### Symptom: Telemetry simulator receives `HTTP 429 Too Many Requests`
- In-memory rate limiting is set to 120 req/min per IP by default.
- For high-frequency bench testing, increase the limit or disable temporarily in `.env`:
  ```env
  RATE_LIMIT_PER_MINUTE=1000
  # or
  RATE_LIMIT_ENABLED=false
  ```

---

## 6. Diagnostic & Emergency Recovery Commands

### Run Full System Health & Security Verification
```bash
python scripts/verify_deployment.py
```

### Inspect Live Docker Container Logs
```bash
# Production stack logs
docker compose -f docker-compose.prod.yml logs -f --tail=100

# Specific backend logs
docker compose -f docker-compose.prod.yml logs -f backend
```

### Emergency Database Backup
```powershell
.\scripts\backup_db.ps1
```

### Emergency Database Restore
```powershell
.\scripts\restore_db.ps1 -BackupFile backups\orvex_backup_<timestamp>.sql
```

### Test Backup & Restore Data Integrity
```bash
python scripts/test_db_backup_restore.py
```

