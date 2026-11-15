# ORVEX Analytics

This package converts canonical raw telemetry into transparent engineering features and deterministic in-memory detection candidates. It has no FastAPI, SQLAlchemy, or database dependency. Detection output is not persisted in this stage.

## Input and units

`TelemetryInput` is an internal analytics model, not a replacement API schema. It uses the existing telemetry field names and UUID identifiers. All measurement values are nullable; timestamps must be timezone-aware when present and are normalized to UTC.

Power inputs follow the existing ORVEX canonical units: `active_power` in kW, `reactive_power` in kvar, `apparent_power` in kVA, `cumulative_energy` in kWh, voltage in V, current in A, RPM in revolutions/minute, temperature in degrees Celsius, and load in percent. The feature output makes these units explicit in field names.

When telemetry includes measured apparent power, the engine prefers it. Otherwise, it estimates kVA as `voltage_V * current_A * voltage_current_multiplier / 1000`. The multiplier is configurable in the baseline profile: use `1` for compatible single-phase/aggregated readings or `sqrt(3)` for three-phase line-to-line voltage and line current. A supplied power factor is preferred; otherwise it is derived as `active_power_kW / apparent_power_kVA` only when apparent power is positive and the result is physically bounded to [-1, 1]. Active power is allowed to be negative for regeneration.

`power_per_load_percent` is `active_power_kw / load_percent` for positive load. It is an engineering diagnostic, not a physical efficiency measurement by itself.

## Features and quality

`FeatureEngine.process()` produces normalized power, power factor, operating state, load, RPM, temperature, energy increment, the cumulative-energy reference, baseline, excess power, and quality fields. `DetectionEngine.process(ordered_features)` consumes an ordered sequence of feature records. Missing and non-finite values do not cause division by zero or leak NaN/infinity into results. Impossible measurement values and invalid timestamps break detection evidence; naive timestamps are rejected by telemetry input and ignored as persistence evidence if supplied in a feature record.

Quality is `GOOD` when core calculations and the configured baseline are available, `PARTIAL` when data or a baseline needed for some features is unavailable, and `INVALID` for impossible timestamps, non-finite inputs, or physically invalid measurements. `quality_reasons` makes the reason explicit. The first sample has no interval; its energy increment is null and its quality is partial for that reason.

## Energy and chronology

For consecutive valid samples in the same machine/sensor stream, energy increment uses trapezoidal integration of the two active-power samples:

`energy_increment_kwh = ((previous_power_kw + current_power_kw) / 2) * elapsed_seconds / 3600`

This handles irregular intervals and retains the sign for regenerative intervals; it never silently takes an absolute value. The first sample has no previous interval and returns a null increment. Missing timestamps invalidate the sample and reset that stream's interval reference; duplicate or backwards timestamps are flagged invalid and do not advance the reference. Cumulative energy is carried as a consistency/reference signal and is not used as the primary interval calculation.

## Explainable expected-power baseline

`PiecewisePowerBaseline` is an explicit configurable model, not a learned or historical prediction. It supplies stopped and idle values and state-specific affine curves in rated-power fractions for STARTING, LOW_LOAD, RUNNING, and HIGH_LOAD. FAULT intentionally has no expected baseline by default. The feature engine depends on a small baseline interface, so a future machine-specific or historical baseline can replace it without changing feature extraction.

The default example profile is illustrative and configurable; production equipment should have a reviewed profile. For a 100 kW machine, a 20% LOW_LOAD sample and the default low-load curve yield `100 * (0.10 + 0.75 * 0.20) = 25 kW` expected power. If actual active power is 45 kW, `excess_power_kw = max(45 - 25, 0) = 20 kW`.

That 20 kW is excess power, **not automatically wasted energy**. The output's `estimated_wasted_energy_kwh` remains null in this stage. Persistence, operating context, duration, and detection criteria belong to the future detection engine.

## Detection rules

The detector evaluates a feature sample only when it is not `INVALID` and the rule's required fields are available. A `PARTIAL` sample can support a rule if the fields needed by that rule are present, but it marks the resulting event partial and lowers confidence. A match must persist across at least two samples and the configured duration. Timestamps must increase, and each interval must be no longer than `maximum_sample_gap_seconds`; a missing/invalid sample or larger gap ends the segment. Irregular intervals use observed time, not sample counts, to determine duration.

`DetectionConfig` defaults are development starting points, **not universal mining-industry thresholds**. They require field calibration:

| Rule | Conditions | Development defaults |
| --- | --- | --- |
| `IDLE_WASTAGE` | IDLE, actual power above baseline, and either excess meets its absolute threshold or idle ratio meets its threshold; then persistent | 60 s, 5 kW, ratio 1.5 |
| `LOW_LOAD_WASTAGE` | LOW_LOAD, load at/below limit, excess at/above threshold; then persistent | 30%, 8 kW, 120 s |
| `ABNORMAL_POWER` | Allowed operational state, excess at/above threshold, actual/expected ratio at/above threshold; then persistent | 10 kW, ratio 1.25, 60 s |
| `START_STOP_CYCLING` | At least the configured number of `STOPPED -> STARTING -> RUNNING` completed transition patterns in the rolling window | 3 cycles in 600 s |

`STOPPED`, `STARTING`, and `FAULT` are excluded from generic abnormal-power evaluation by default. Callers can explicitly configure the included states. The default baseline has no FAULT expectation, so a fault still cannot match until a caller supplies a valid fault baseline. Cycling produces an observation candidate, not a wastage classification; its estimated wasted energy is null.

## Persistence and event aggregation

Each continuous rule match becomes one candidate segment after the duration/sample requirements are met. Defaults require at least two matching samples and no interval gap greater than 30 seconds; both are configurable. Overlapping candidates for a machine are merged into one in-memory event. The primary reason is selected deterministically in this order: idle, low-load, abnormal power, then cycling; other matched reasons are listed as contributors. Separate machines and non-overlapping periods remain separate events.

Event energy uses trapezoidal integration of adjacent observed samples, with intervals exceeding the configured maximum gap omitted. `estimated_wasted_energy_kwh` integrates the excess-power curve only across samples supporting a non-cycling rule. `actual_energy_consumed_kwh` independently integrates active power over the event window when available; signed values are preserved for regenerative flow. Neither metric is inferred by multiplying peak power by total duration.

In Stage 3C, the analytics engine remains strictly decoupled from persistence: it produces in-memory `DetectionEvent` objects with no database or ORM dependencies. Downstream persistence is handled by the backend layer (`WastageEventService` and `WastageEventRepository`), which idempotently maps finalized events to the `energy_wastage_events` table in TimescaleDB/PostgreSQL.

## Confidence and quality

Confidence is an evidence-strength label, not a probability. Any partial-quality evidence makes confidence `LOW`. For sustained rules with complete quality, `HIGH` requires duration at least 3 times the rule minimum and mean excess at least 2 times its minimum threshold; `MEDIUM` requires duration at least 1.5 times minimum and mean excess at least 1.25 times threshold; otherwise it is `LOW`. For cycling with complete quality, the same levels use observed cycle count relative to the configured minimum: 2x for high, 1.5x for medium, otherwise low. Condition consistency comes from consecutive matching samples without an excessive gap.

Every event includes machine/time range, primary and contributing reasons, peak/time-weighted average excess, actual and estimated energy, confidence, quality, candidate status, and structured evidence with rule thresholds, durations, sample counts, operating states, and summary values. A stable UUID is derived from the event identity and time range (UUIDv5), ensuring identical detection input yields identical deterministic event IDs for safe, idempotent persistence. Cycling candidates retain `estimated_wasted_energy_kwh = None` (persisted as SQL NULL).

## Current limitations

Stage 3C establishes detection event persistence infrastructure. The analytics and persistence pipeline currently does NOT:
- Automatically process telemetry in the background (no Celery, Redis, or Kafka workers).
- Expose wastage events through a public API or frontend dashboard.
- Generate operational alerts or notification emails.
- Ingest live telemetry directly from hardware or MQTT brokers into the detector.
- Use machine learning or unexplainable black-box models.

## Use and tests

From the repository root, process ordered samples with one engine instance per stream:

```python
from analytics.models import TelemetryInput
from analytics.services.feature_engine import FeatureEngine
from analytics.detectors.detector import DetectionEngine

engine = FeatureEngine()
features = engine.process(TelemetryInput(...))
events = DetectionEngine().process([features])
```

`excess_power_kw` is a feature, not a finding. Even a detection candidate is evidence for later domain validation, not proof that a machine is wasting energy. No detector claims that excess power is automatically wasted energy, and there is no ML or learned baseline in this stage.

The unit suite is deterministic and includes compatibility coverage for the five existing simulator scenarios without asserting that any scenario is wastage:

```powershell
python -m unittest discover -s analytics/tests -t .
```