# Database

ORVEX uses PostgreSQL with TimescaleDB for relational machine metadata and raw time-series telemetry. The SQLAlchemy 2.x models live in `backend/app/db/models.py`; Alembic configuration and the initial migration live in this directory.

## Schema

- `sites` own machines; each site has a human-readable name, optional location, and IANA timezone name.
- `machines` belong to one site and have a site-scoped machine identifier. Rated power is expressed in kW. Inventory status is separate from live operating state.
- `sensors` belong to one machine and have a machine-scoped sensor identifier, type, unit, optional JSONB installation details, and lifecycle status.
- `telemetry` stores raw measurements, not dashboard aggregates. `sensor_id` is optional for machine-level readings; each non-null sensor reference is constrained to belong to the same machine. Measurement columns are nullable because equipment does not necessarily expose every signal. `timestamp` is the event time and partitions the TimescaleDB hypertable.
- `machine_events` stores operational transitions and abnormal conditions independently of sampled telemetry.
- `alerts` stores detected conditions and their review/resolution lifecycle.
- `energy_wastage_events` stores derived detections separately from raw measurements. Duration is a generated value from start/end times, avoiding a separately maintained duplicate.

All entity identifiers are UUIDs. The telemetry table uses `(timestamp, id)` as its primary key: TimescaleDB requires every unique key on a hypertable to include its partitioning column. `id` is still a UUID row identifier, but is not globally unique by a standalone database constraint. Times are `timestamp with time zone`; applications should submit UTC-aware datetimes. PostgreSQL normalizes these instants internally.

Telemetry values use canonical units: voltage in V, current in A, active power in kW, reactive power in kvar, apparent power in kVA, cumulative energy in kWh, RPM in revolutions per minute, temperature in degrees Celsius, and load as a percentage from 0 to 100. Power factor is unitless and constrained to -1 through 1. Active power may be negative for regenerative operation. Device adapters should convert source units before persistence; a sensor's `unit` records its measured quantity/unit for inventory, not a per-row override.

Foreign keys use restrictive deletion to protect historical records. Indexes support site/machine lookup and machine- or sensor-scoped time-range queries. Status and measurement checks reject invalid values at the database boundary.

## Migrations

Install the backend database dependencies, then set `DATABASE_URL` in the environment of the migration process (copy the value from `.env.example` and replace the local password). For PowerShell, for example:

```sh
python -m pip install -r backend/requirements.txt
$env:DATABASE_URL = "postgresql+psycopg://orvex:your-local-password@localhost:5432/orvex"
alembic -c database/alembic.ini upgrade head
```

The initial migration enables the TimescaleDB extension, creates the schema, and converts `telemetry` to a hypertable. The PostgreSQL role must be allowed to create the extension. The local Compose database uses the TimescaleDB image declared in the root `docker-compose.yml`.

No seed records are required. Retention/compression policies, continuous aggregates, and additional indexes should be added only after workload and retention requirements are established.