# ORVEX Telemetry Simulator

The development simulator generates correlated mining-machine telemetry and sends each record to the existing ORVEX ingestion API. It does not connect to the database or MQTT broker, create machines, implement a device protocol, or detect energy wastage.

## Architecture

```text
Simulator profile and scenario
		  |
		  v
Canonical telemetry payload
		  |
		  v
POST /api/v1/telemetry
		  |
		  v
Existing FastAPI service -> TimescaleDB
```

This is the same logical boundary intended for future hardware: sensors feed a gateway, the gateway emits canonical telemetry, and the existing ingestion API persists it. The simulator's internal dataclass serializes to the backend's established request fields; it does not introduce another API contract or storage path. Potential wastage scenarios only generate observations. Independent analytics must determine whether those observations constitute wastage.

## Requirements and installation

The simulator uses only the Python standard library. No simulator-specific packages need installation. From the repository root, ensure the backend dependencies are installed and the FastAPI service is running:

```powershell
python -m pip install -r backend/requirements.txt
python -m uvicorn app.main:app --app-dir backend --reload
```

In a second terminal, run a scenario from the repository root:

```powershell
$env:ORVEX_MACHINE_ID = "your-existing-machine-uuid"
python -m simulator.main --scenario normal --machine-id $env:ORVEX_MACHINE_ID
```

`machine_id` must already identify a row in the ORVEX database. The simulator does not create site, machine, or sensor records. If a `sensor_id` is supplied, it must belong to the selected machine. Machine-level telemetry works without a sensor ID.

## Scenarios

- `normal`: startup followed by a cycle of running, low-load, idle, and high-load observations.
- `idle_wastage`: prolonged idle operation with power above the profile's expected idle consumption.
- `low_load_wastage`: low reported load with disproportionately elevated active power.
- `abnormal_power`: elevated active power at a steady load and RPM.
- `start_stop_cycling`: repeated start, run, and stop cycles.

The `DefaultHaulageMotor` profile is defined centrally in `profiles.py` and can be extended with additional profiles. Measurements are correlated: three-phase apparent power follows voltage and current, active power tracks apparent power and power factor, RPM and temperature respond to operating conditions, and cumulative energy integrates active power over elapsed time. The default profile produces nonnegative active power; the API's support for regenerative negative power is unchanged.

## Options

```text
--scenario       normal | idle_wastage | low_load_wastage | abnormal_power | start_stop_cycling (default: normal)
--interval       seconds between samples, positive float (default: 1)
--duration       run time in seconds, positive float (default: 60)
--machine-id     existing machine UUID (generated and printed when omitted)
--sensor-id      optional sensor UUID belonging to that machine
--api-url        API base URL (default: http://127.0.0.1:8000)
```

Examples:

```powershell
python -m simulator.main --scenario normal --interval 1 --duration 30 --machine-id 7ef24888-4aef-4eb9-84b4-a2ad8b31b754
python -m simulator.main --scenario idle_wastage --duration 180 --machine-id 7ef24888-4aef-4eb9-84b4-a2ad8b31b754
python -m simulator.main --scenario start_stop_cycling --interval 0.5 --duration 45 --api-url http://127.0.0.1:8000 --machine-id 7ef24888-4aef-4eb9-84b4-a2ad8b31b754
```

The client posts only to `/api/v1/telemetry`, expects HTTP 201, and retries transient connection/server failures a small number of times. An ambiguous timeout can result in a repeated observation because the current API does not define an idempotency key.

Example console output:

```text
ORVEX Telemetry Simulator
Machine: 7ef24888-4aef-4eb9-84b4-a2ad8b31b754
Scenario: NORMAL_OPERATION
Interval: 1s | Duration: 60s
[14:30:01Z] state=STARTING load=31.0% power=42.8kW rpm=296
[14:30:02Z] state=STARTING load=39.0% power=53.6kW rpm=592
Summary: sent=10 avg_power=78.4kW
```

Press Ctrl+C to stop cleanly. Run generator tests from the repository root with `python -m unittest discover -s simulator/tests -t .`.