# Backend

Python and FastAPI services will own the ORVEX API, telemetry ingestion, validation, persistence coordination, and WebSocket delivery. Keep transport adapters separate from domain rules so MQTT remains replaceable and future edge gateways can use the same documented telemetry contract.

The database foundation uses SQLAlchemy 2.x models in `app/db/models.py` and a PostgreSQL engine/session configuration in `app/db/session.py`. Install `requirements.txt` for the API and database dependencies. The app loads settings from environment variables and the project-root `.env`; environment variables take precedence. Keep credentials out of source control.

## Run locally

From either the repository root or the `backend/` directory:

```powershell
python -m pip install -r backend/requirements.txt
python -m uvicorn app.main:app --app-dir backend --reload
```

When already in `backend/`, use `python -m pip install -r requirements.txt` and `python -m uvicorn app.main:app --reload` instead. The API listens on `http://127.0.0.1:8000` by default.

## Endpoints

- `GET /health` returns `{"status":"ok"}` and does not query the database.
- `POST /api/v1/telemetry` validates and persists one canonical telemetry record, returning HTTP 201 with its record UUID and timestamp.

Telemetry values use the canonical units documented in `../database/README.md`. Send only the measurements available for a machine; omitted values are stored as `NULL`. Timestamps must include a timezone and are normalized to UTC.

Example payload:

```json
{
	"timestamp": "2026-09-26T14:30:00Z",
	"machine_id": "7ef24888-4aef-4eb9-84b4-a2ad8b31b754",
	"sensor_id": null,
	"voltage": 415.2,
	"current": 18.7,
	"active_power": 11.4,
	"reactive_power": 2.1,
	"apparent_power": 11.6,
	"power_factor": 0.98,
	"cumulative_energy": 18342.6,
	"rpm": 1480,
	"temperature": 67.3,
	"load_percent": 74.5,
	"operating_state": "operating"
}
```

PowerShell request:
```powershell
$payload = @{
	timestamp = "2026-09-26T14:30:00Z"
	machine_id = "7ef24888-4aef-4eb9-84b4-a2ad8b31b754"
	voltage = 415.2
	current = 18.7
	active_power = 11.4
	power_factor = 0.98
	load_percent = 74.5
	operating_state = "operating"
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
	-Uri http://127.0.0.1:8000/api/v1/telemetry `
	-ContentType "application/json" `
	-Body $payload
```

## Wastage Event Persistence (Stage 3C)

Stage 3C adds the persistence bridge between the explainable Stage 3B analytics engine and the `energy_wastage_events` PostgreSQL/TimescaleDB table.

### Architecture and Persistence Boundary

The analytics package produces in-memory, deterministic `DetectionEvent` objects with no database or framework imports. The backend persistence boundary is structured as:

```text
Detection Engine (analytics)
      ↓
Detection Event Model (analytics.models.DetectionEvent)
      ↓
WastageEventService (app.services.wastage_event_service)
      ↓
WastageEventRepository (app.repositories.wastage_event_repository)
      ↓
SQLAlchemy (app.db.models.EnergyWastageEvent)
      ↓
TimescaleDB / PostgreSQL (energy_wastage_events)
```

### Persistence Rules and Mapping

- **Validation:** `WastageEventService` validates that detection events are finalized candidates, have UTC-aware timestamps, valid interval durations, and non-negative finite energy values.
- **Initial Status:** New events are inserted with status `detected` (consistent with the schema check constraint `status IN ('detected', 'confirmed', 'dismissed', 'resolved')`).
- **Duration:** The PostgreSQL column `duration_seconds` is generated automatically from `EXTRACT(EPOCH FROM (end_time - start_time))`.
- **Reason Mapping:** The primary reason is mapped directly (`IDLE_WASTAGE`, `LOW_LOAD_WASTAGE`, `ABNORMAL_POWER`, `START_STOP_CYCLING`). Contributing reasons are appended as `; contributing=...`.
- **Cycling NULL Energy Semantics:** `START_STOP_CYCLING` candidates intentionally do NOT estimate wasted energy. The service and repository preserve `estimated_wasted_energy_kwh = NULL` without converting it to 0.

### Idempotency Strategy

- Stage 3B computes deterministic UUIDv5 identifiers from `(machine_id, start_time, end_time, reasons)`.
- `WastageEventRepository.create_if_not_exists()` executes `INSERT ... ON CONFLICT (id) DO NOTHING RETURNING *`.
- If an event is re-submitted, the repository loads the existing row, verifies identity consistency, and returns `created=False` without creating duplicate records.
- If an existing event ID belongs to a conflicting event identity, a `WastageEventIdentityConflict` exception is raised.

### Transaction Safety

- All database operations are wrapped in safe transaction boundaries.
- On error (e.g. invalid foreign key machine ID or database violation), the session rolls back immediately, leaving the database clean and the session reusable.

### Current Limitations

- **No background task / queue:** No Celery, Redis, or Kafka workers; persistence is currently invoked directly via the service.
- **No public API endpoints:** Wastage events are not yet exposed via public REST endpoints.
- **No frontend changes:** Dashboards have not been modified yet.
- **No ML:** Detection and energy calculations are 100% deterministic engineering rules.
- **No alerts or MQTT pipeline:** Operational alerting and direct MQTT event triggers are deferred to subsequent stages.

## Automated Analytics Pipeline (Stage 3D)

Stage 3D completes the automated end-to-end processing pipeline, connecting telemetry ingestion directly to historical feature calculation, deterministic wastage detection, and event persistence.

### Target Flow

```text
Telemetry Simulator / Future Hardware
              |
              v
      FastAPI Telemetry API (POST /api/v1/telemetry)
              |
              v
       Telemetry Database (telemetry hypertable)
              |  [Committed before analytics processing]
              v
      Analytics Orchestrator (app.services.analytics_orchestrator)
              |
              v
        Feature Engine (analytics.services.feature_engine)
              |
              v
        Detection Engine (analytics.detectors.detector)
              |
              v
      Event Aggregation & Finalization Policy
              |
              v
      Persistence Service (app.services.wastage_event_service)
              |
              v
  energy_wastage_events table (TimescaleDB / PostgreSQL)
```

### Telemetry Commit Before Processing

1. In `TelemetryService.ingest()`, incoming telemetry is validated and committed to the database first.
2. Only after a successful database commit is `AnalyticsOrchestrator.process_machine(machine_id)` triggered.
3. If analytics orchestration encounters an error (retrieval, feature calculation, or persistence), the error is logged with diagnostic details, the session is rolled back, but the committed telemetry is **never deleted or rolled back**.
4. The API response contract remains unchanged and returns HTTP 201 with `{id, timestamp}`.

### History-Window Strategy

- The detector evaluates sustained persistence rules: 60-second idle persistence, 120-second low-load persistence, 60-second abnormal power persistence, and 600-second start/stop cycling.
- Rather than evaluating single telemetry samples in isolation, `AnalyticsOrchestrator._retrieve_telemetry_history` queries a bounded time window:
  - Finds the latest sample timestamp for the machine.
  - Queries historical samples within `[latest_time - history_window_seconds, latest_time]` (default window: 900.0 seconds / 15 minutes).
  - Orders records strictly ascending by `(timestamp ASC, id ASC)`.
  - Maps database rows to `TelemetryInput` using `telemetry_row_to_input()`, safely handling missing or sparse measurements without crashing.

### Event Finalization Policy

An event candidate is not prematurely persisted as completed on every telemetry sample while it is actively developing. A candidate event is considered finalized when:
1. **Condition Ended:** `candidate.end_time < latest_time` (a subsequent sample arrived showing the machine is no longer in the wastage condition).
2. **Machine Shutdown:** The latest sample indicates the machine has stopped (`latest_state.upper() == "STOPPED"`).
3. **Telemetry Gap:** The elapsed time since `candidate.end_time` exceeds `maximum_sample_gap_seconds` (30.0 seconds).
4. **Explicit Stream Flush:** `flush_machine()` or `finalize_ongoing=True` is invoked at the conclusion of a batch/stream.

### Idempotency and Ongoing Episode Extension

- `WastageEventRepository.create_or_update(record)`:
  - If a record with the deterministic UUID5 already exists, it verifies identity and returns `created=False`.
  - If not found by ID, it queries for an existing episode by `(machine_id, start_time, detection_reason)`.
  - When an existing episode is found:
    - If `incoming.end_time > existing.end_time`: extends the ongoing episode in-place (`end_time`, `estimated_energy_kwh`, `estimated_wasted_energy_kwh`, `confidence_score`), avoiding multiple duplicate records as the event develops.
    - If `incoming.end_time <= existing.end_time`: refuses to overwrite a previously persisted longer window with a shorter or incomplete window.

### Current Synchronous-Processing Limitations

- Processing is triggered synchronously within the ingestion request cycle. This is an initial development architecture designed for deterministic local testing and validation.
- For high-frequency industrial telemetry, this processing trigger will move to a decoupled background worker (e.g., Celery, Redis, or an event-driven worker) without changing the detector or persistence logic.

### End-to-End Scenario Validation

Run the automated scenario validation script against all five simulator scenarios:

```powershell
python scripts/validate_stage_3d.py
```

This validates:
1. `normal`: 0 false wastage events.
2. `idle_wastage`: 1 persisted event with estimated wasted energy > 0.
3. `low_load_wastage`: 1 persisted event with estimated wasted energy > 0.
4. `abnormal_power`: 1 persisted event with estimated wasted energy > 0.
5. `start_stop_cycling`: 1 persisted event with `estimated_wasted_energy_kwh = NULL`.
6. Zero duplicate events on re-processing.
7. Complete cleanup of all temporary validation machines, telemetry, and wastage events.

## Read-Only Analytics API (Stage 4A)

Stage 4A implements the production-ready, read-only REST API exposing machines, historical telemetry ranges, conservative energy summaries, and wastage events to the future React dashboard.

### Endpoint Overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/machines` | Paginated machine directory with status filter. |
| `GET` | `/api/v1/machines/{machine_id}` | Machine metadata and rated power details. |
| `GET` | `/api/v1/machines/{machine_id}/summary` | Machine identity, rated power, latest readings, and telemetry freshness. |
| `GET` | `/api/v1/machines/{machine_id}/telemetry` | Time-range filtered telemetry records with pagination. |
| `GET` | `/api/v1/machines/{machine_id}/energy-summary` | Energy analytics, durations, event counts, and data quality indicator. |
| `GET` | `/api/v1/machines/{machine_id}/wastage-events` | Persisted wastage events for a specific machine. |
| `GET` | `/api/v1/wastage-events` | Global wastage event registry with multi-criteria filtering. |
| `GET` | `/api/v1/wastage-events/{event_id}` | Single wastage event details and evidence metadata. |

### Query Parameters and Filters

- **Pagination:**
  - `limit`: Integer, default `50`, maximum `1000` (or `100` for machines).
  - `offset`: Integer, default `0`, non-negative.
- **Time Ranges:**
  - `start_time` and `end_time`: ISO 8601 strings (e.g. `2026-09-26T12:00:00Z`).
  - Normalizes URL space-decoded offsets (e.g. `+00:00`).
  - Strict validation: returns HTTP 400 if `start_time > end_time`.
- **Wastage Event Filters:**
  - `machine_id`: UUID filter.
  - `detection_reason`: Case-insensitive substring match (e.g. `IDLE_WASTAGE`).
  - `status`: Exact match against `detected`, `confirmed`, `dismissed`, `resolved`.

### Telemetry Freshness Semantics

Telemetry freshness evaluates sensor connectivity independently of machine operating state:

- **`fresh`:** The most recent telemetry sample arrived within `freshness_threshold_seconds` (default: 60 seconds). A machine can be `STOPPED` and still have `fresh` telemetry (the sensor connection is active).
- **`stale`:** The most recent telemetry sample is older than `freshness_threshold_seconds`.
- **`missing`:** No telemetry records exist in the database for this machine.

Summary response example (`GET /api/v1/machines/{machine_id}/summary`):
```json
{
  "id": "7ef24888-4aef-4eb9-84b4-a2ad8b31b754",
  "site_id": "8fa13999-5bff-4fc0-95c5-b3be9c42c865",
  "machine_identifier": "CONV-01",
  "name": "Primary Overland Conveyor",
  "machine_type": "conveyor",
  "rated_power_kw": 132.0,
  "status": "active",
  "telemetry_freshness": "fresh",
  "latest_telemetry_timestamp": "2026-09-26T14:30:20Z",
  "latest_operating_state": "stopped",
  "latest_active_power": 0.0,
  "latest_power_factor": 0.0,
  "latest_temperature": 54.2,
  "latest_load_percent": 0.0
}
```

### Energy Analytics & Calculation Assumptions

The endpoint `GET /api/v1/machines/{machine_id}/energy-summary` computes energy metrics across a specified time range:

1. **Actual Energy Consumption (`actual_energy_kwh`):**
   - Uses **trapezoidal numerical integration** of `active_power` across successive telemetry records:
     $$\Delta E = \frac{P_i + P_{i+1}}{2} \times \frac{\Delta t}{3600}$$
   - **Gap Exclusion:** If $\Delta t > 30.0\,\text{seconds}$ (`maximum_sample_gap_seconds`), the interval is omitted from energy integration. Missing telemetry is **never** fabricated or assumed to be 0 kW.
   - **Cumulative Energy Handling:** Telemetry cumulative counter readings are inspected for monotonicity and reset anomalies; integration directly accumulates actual active power intervals to prevent counter-reset corruptions.
2. **Estimated Wasted Energy (`estimated_wasted_energy_kwh`):**
   - Retrieved from persisted `energy_wastage_events` intersecting the query window.
   - **Overlapping Event Deduplication:** If multiple concurrent wastage events occur or overlap, intervals are merged via union logic so wasted energy is never double-counted.
   - Preserves `null` for cycling events where no baseline excess power exists.
3. **Operating Durations:**
   - Evaluates consecutive valid intervals ($\Delta t \le 30\,\text{s}$) where operating state is `OPERATING`, `IDLE`, or `LOW_LOAD`.
   - Abnormal power duration merges intervals flagged with `ABNORMAL_POWER` without double-counting.
4. **Data Coverage & Quality Indicators:**
   - `data_coverage_ratio`: $\frac{\text{sum of valid continuous intervals}}{\text{total requested time window}}$.
   - `quality`:
     - **`GOOD`:** Data coverage $\ge 90\%$.
     - **`PARTIAL`:** Data coverage between $30\%$ and $90\%$.
     - **`INSUFFICIENT_DATA`:** Less than 2 samples or coverage $< 30\%$.

Energy summary response example:
```json
{
  "machine_id": "7ef24888-4aef-4eb9-84b4-a2ad8b31b754",
  "start_time": "2026-09-26T14:00:00Z",
  "end_time": "2026-09-26T14:30:00Z",
  "actual_energy_kwh": 42.158,
  "estimated_wasted_energy_kwh": 8.420,
  "wastage_event_count": 2,
  "operating_duration_seconds": 1500.0,
  "idle_duration_seconds": 300.0,
  "low_load_duration_seconds": 0.0,
  "abnormal_power_duration_seconds": 60.0,
  "data_coverage_ratio": 0.985,
  "quality": "GOOD",
  "telemetry_sample_count": 1780
}
```

### Wastage Event Response Details

`GET /api/v1/wastage-events/{event_id}` and `GET /api/v1/machines/{machine_id}/wastage-events` expose persisted event records:

```json
{
  "id": "2d1b8274-1215-5ab4-bf83-e18e3845b412",
  "machine_id": "7ef24888-4aef-4eb9-84b4-a2ad8b31b754",
  "start_time": "2026-09-26T14:10:00Z",
  "end_time": "2026-09-26T14:15:00Z",
  "duration_seconds": 300.0,
  "detection_reason": "IDLE_WASTAGE",
  "severity": "medium",
  "estimated_energy_kwh": 3.75,
  "estimated_wasted_energy_kwh": 3.75,
  "confidence_score": 0.95,
  "quality_score": 1.0,
  "status": "detected",
  "evidence_metadata": {
    "idle_duration_seconds": 300.0,
    "average_idle_power_kw": 45.0,
    "excess_power_kw": 45.0
  },
  "created_at": "2026-09-26T14:15:01Z"
}
```

## Testing & Validation

### Unit and Integration Tests

Run all unit and integration test suites:

```powershell
# From project root with PYTHONPATH configured:
$env:PYTHONPATH = ".;backend"
python -m pytest backend/tests analytics/tests simulator/tests
```

144 tests cover API routes, repository operations, detection logic, and energy integration:
- `backend/tests/test_machine_api.py`: 10 tests for machine listing, pagination, details, 404s, freshness semantics.
- `backend/tests/test_telemetry_query_api.py`: 5 tests for telemetry range querying, ordering, pagination, 400/404 handling.
- `backend/tests/test_energy_summary_api.py`: 7 tests for energy integration, gap exclusion, counter resets, overlap deduplication, quality levels.
- `backend/tests/test_wastage_event_api.py`: 7 tests for event listing, machine filtering, cycling null wasted energy preservation, 404s.
- Existing suites (`test_telemetry_api.py`, `test_analytics_orchestrator.py`, `test_wastage_event_*.py`, `analytics/tests/`, `simulator/tests/`).

### Stage 4A End-to-End Integration Validation

Execute the automated end-to-end integration script using the live TimescaleDB database and simulator:

```powershell
python scripts/validate_stage_4a.py
```

This validates:
1. Temporary machine and site provisioning.
2. Machine listing, detail, and summary endpoints before telemetry.
3. Telemetry ingestion triggering the automated analytics pipeline.
4. Machine summary update showing telemetry freshness and latest operating state.
5. Telemetry time-range filtering and pagination.
6. Energy summary calculation with actual energy, wasted energy, durations, and quality scoring.
7. Wastage event listing, machine filtering, and detail endpoints.
8. Normal scenario producing 0 false wastage events.
9. Guaranteed cleanup leaving 0 residual test records in the database.


## System Reliability, Demo Runner & 5-Scenario Integration (Stage 4C)

Stage 4C verifies system stability, addresses edge cases in energy calculations and detection rules, and provides a repeatable demonstration and verification workflow.

### Enhancements & Regression Fixes

1. **CORS Middleware Support:** Added FastAPI CORSMiddleware in `app/main.py` enabling cross-origin requests from the React dashboard (`http://localhost:5173`).
2. **Machine-Tailored Baseline Scaling:** In `AnalyticsOrchestrator`, baseline power profiles are scaled dynamically to the machine's nameplate `rated_power_kw`, preventing false positive detections when operating equipment of different sizes (e.g., 55 kW fan vs 200 kW hoist).
3. **Energy Summary Regressions:** Added unit tests verifying single-sample coverage behavior, irregular sampling intervals, and cumulative counter reset immunity.
4. **Idempotency Verification:** Validated that re-processing telemetry history extends ongoing episodes without generating duplicate database records.
5. **Non-Destructive Demo Manager:** Implemented [`scripts/demo_runner.py`](../scripts/demo_runner.py) with `--status`, `--provision`, `--scenario`, `--run-all`, and guarded `--reset-demo-data --confirm`.
6. **5-Scenario End-to-End Suite:** Implemented [`scripts/validate_stage_4c.py`](../scripts/validate_stage_4c.py) proving zero false positives on `normal`, accurate detections on `idle_wastage`, `low_load_wastage`, `abnormal_power`, and `null` wasted energy preservation on `start_stop_cycling`.


## Intelligent Alerts & Energy-Wastage Reports (Stage 5A)

Stage 5A adds an explainable alerting and reporting layer linking persisted wastage events to operator action and engineering audits.

### Schema Extension & Migration 0003

- Migration `0003_alert_event_link.py` extends the existing `alerts` table:
  - `event_id`: Nullable UUID foreign key referencing `energy_wastage_events(id)` with `ondelete="SET NULL"`.
  - `title`: Nullable `VARCHAR(200)` for human-readable alert titles.
  - Partial unique index `ix_alerts_event_id` (`WHERE event_id IS NOT NULL`) enforcing 1:1 alert-to-event idempotency.

### Alert Service & Lifecycle Management

- **Event-to-Alert Mapping:** `AlertService.create_or_get_for_event()` generates alerts deterministically using UUIDv5 based on `orvex:alert:{event_id}`.
- **Rule-Based Severity:**
  - Sustained wastage $\ge 5.0\,\text{kWh}$ or severe excess $\rightarrow$ `high` / `critical`.
  - Moderate wastage $1.0\text{–}5.0\,\text{kWh}$ or cycling $\ge 10\,\text{min}$ $\rightarrow$ `medium`.
  - Minor wastage $< 1.0\,\text{kWh}$ $\rightarrow$ `low`.
- **Actionable Recommendations:** Tailored to each detection reason (`IDLE_WASTAGE`, `LOW_LOAD_WASTAGE`, `ABNORMAL_POWER`, `START_STOP_CYCLING`).
- **Lifecycle Constraints:**
  - Statuses: `open`, `acknowledged`, `resolved`, `dismissed`.
  - Database check constraint `(status = 'resolved') = (resolved_at IS NOT NULL)` is strictly maintained. Resolving an alert populates `resolved_at` in UTC.

### Energy-Wastage Reporting & CSV Export

- **Service:** `ReportService.generate_energy_wastage_report()` aggregates fleet consumption and wastage:
  - Actual consumption via trapezoidal power integration with gap exclusion (> 30s).
  - Wasted energy with overlapping interval deduplication.
  - Separate quantification of unestimated cycling candidate episodes.
- **RFC 4180 CSV Export:** `ReportService.generate_csv()` produces structured CSV reports with metadata comments, physical units in headers, reason breakdowns, equipment breakdowns, and detailed event logs.

### Testing & Validation

```powershell
# Run backend test suite (120 tests including 34 MQTT gateway tests)
python -m pytest backend/tests

# Run full project test suite (197 tests)
python -m pytest backend/tests analytics/tests simulator/tests

# Execute Stage 5A End-to-End Validation Suite
python scripts/validate_stage_5a.py

# Execute Stage 6A End-to-End MQTT Gateway Validation Suite
python scripts/validate_stage_6a.py
```

## MQTT Hardware Gateway (Stage 6A)

Stage 6A introduces an industrial MQTT hardware gateway that connects to Mosquitto, subscribes to `{prefix}/v1/machines/+/telemetry`, normalizes telemetry payloads, and forwards readings directly into the existing `TelemetryService` and `AnalyticsOrchestrator` pipelines.

### Architecture & Components

```text
MQTT Broker (Mosquitto)
          │
          ▼  (Topic: orvex/v1/machines/{machine_id}/telemetry)
MqttGateway (app.gateway.mqtt_client)
          │
          ├── MessageParser (app.gateway.message_parser)
          │     ├── Topic structure & UUID validation
          │     ├── Payload size check (<= 64 KB)
          │     └── UTF-8 & JSON parsing
          │
          ├── TelemetryMapper (app.gateway.telemetry_mapper)
          │     ├── Authoritative machine ID enforcement
          │     ├── Sensor existence & machine ownership check
          │     ├── Unit suffix normalization (voltage_v, etc.)
          │     └── NaN / +/-Infinity rejection
          │
          ▼
TelemetryService.ingest()
          │
          ├── TelemetryRepository.create()  --> telemetry table
          │
          ▼
AnalyticsOrchestrator.process_machine()
          │
          ├── FeatureEngine & DetectionEngine
          ├── WastageEventService.persist_many()  --> energy_wastage_events table
          └── AlertService.create_or_get_for_event()  --> alerts table
```

### Operational Endpoints & Health Check
- `GET /health` returns standard lightweight status: `{"status": "ok"}`
- `GET /health?details=true` exposes MQTT gateway runtime metrics:
  ```json
  {
    "status": "ok",
    "mqtt_gateway": {
      "enabled": true,
      "running": true,
      "connected": true,
      "broker": "localhost:1883",
      "topic_prefix": "orvex",
      "subscribed_topic": "orvex/v1/machines/+/telemetry",
      "messages_received": 1106,
      "messages_ingested": 1106,
      "messages_rejected": 0,
      "last_connected_at": "2026-10-29T21:19:23.275001+00:00",
      "last_disconnected_at": null,
      "last_message_at": "2026-10-29T21:28:13.120000+00:00"
    }
  }
  ```
