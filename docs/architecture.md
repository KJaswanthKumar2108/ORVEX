# Initial Architecture

## Data path

1. Physical sensors measure machine electrical, mechanical, and operating-state signals.
2. An edge gateway acquires readings and publishes telemetry to MQTT. A development simulator will act as an interchangeable source at this boundary.
3. Backend ingestion will validate incoming messages and persist accepted raw telemetry to the TimescaleDB hypertable. The initial relational schema and migration are documented in `database/README.md`.
4. Independent Python analytics processes persisted data and produces derived energy and wastage results.
5. FastAPI exposes operational and analytical data. WebSockets carry selected real-time updates to the React and TypeScript client.

## Component ownership

- **Simulator / future edge gateway:** telemetry production, device identity, timestamps, and MQTT publishing. Neither source owns database writes.
- **MQTT:** asynchronous transport between telemetry producers and backend ingestion; it is not the system of record.
- **Backend:** message validation, ingestion orchestration, API access, and client update delivery.
- **Database:** durable machine metadata and time-series observations.
- **Analytics:** independent computation over persisted observations and publication of derived results.
- **Frontend:** operator-facing presentation through stable API and WebSocket contracts.

## Integration principles

- Define and version a telemetry message contract before implementing either the simulator or ingestion consumer. Include machine identity, event time, units, and schema version; do not assume a particular sensor vendor or gateway protocol.
- Keep ingestion idempotency, late/out-of-order event handling, and invalid-message policy explicit when implementing persistence.
- Separate raw observations from derived analytics and preserve provenance for computed results.
- Keep credentials and deployment-specific settings outside source control. The included anonymous MQTT listener is restricted to local development and must be replaced with authenticated broker access for shared environments.
- Add schema migrations, retention policy, observability, and failure/retry behavior alongside the first working service paths rather than encoding premature schema or runtime choices here.

## Current scope

This document records boundaries and data flow only. The initial database entities are defined, but the telemetry message contract, analytics algorithm, MQTT topic hierarchy, and production deployment topology remain undecided.