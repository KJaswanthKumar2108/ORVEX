from dataclasses import dataclass
from datetime import datetime
from math import isfinite
from typing import Protocol
from uuid import UUID

from analytics.config import DEFAULT_BASELINE
from analytics.features.electrical import calculate_apparent_power_kva, calculate_power_factor
from analytics.features.energy import calculate_energy_increment_kwh
from analytics.features.operational import (
    calculate_excess_power_kw,
    calculate_idle_power_ratio,
    calculate_power_per_load_percent,
    parse_operating_state,
)
from analytics.models import FeatureQuality, FeatureRecord, OperatingState, TelemetryInput


class PowerBaseline(Protocol):
    def expected_power_kw(self, state: OperatingState, load_percent: float | None) -> float | None: ...


@dataclass(frozen=True, slots=True)
class _PreviousSample:
    timestamp: datetime
    active_power_kw: float | None


class FeatureEngine:
    def __init__(self, baseline: PowerBaseline = DEFAULT_BASELINE) -> None:
        self._baseline = baseline
        self._previous: dict[tuple[UUID, UUID | None], _PreviousSample] = {}

    def process(self, telemetry: TelemetryInput) -> FeatureRecord:
        reasons: list[str] = []
        invalid = False

        def clean(name: str, value: float | None) -> float | None:
            nonlocal invalid
            if value is None:
                reasons.append(f"missing_{name}")
                return None
            if not isfinite(value):
                reasons.append(f"non_finite_{name}")
                invalid = True
                return None
            return value

        voltage = clean("voltage", telemetry.voltage)
        current = clean("current", telemetry.current)
        active_power = clean("active_power", telemetry.active_power)
        reactive_power = clean("reactive_power", telemetry.reactive_power)
        measured_apparent = clean("apparent_power", telemetry.apparent_power)
        measured_power_factor = clean("power_factor", telemetry.power_factor)
        cumulative_energy = clean("cumulative_energy", telemetry.cumulative_energy)
        rpm = clean("rpm", telemetry.rpm)
        temperature = clean("temperature", telemetry.temperature)
        load_percent = clean("load_percent", telemetry.load_percent)

        for name, value in (
            ("voltage", voltage),
            ("current", current),
            ("apparent_power", measured_apparent),
            ("cumulative_energy", cumulative_energy),
            ("rpm", rpm),
        ):
            if value is not None and value < 0:
                reasons.append(f"negative_{name}")
                invalid = True
                if name == "voltage":
                    voltage = None
                elif name == "current":
                    current = None
                elif name == "apparent_power":
                    measured_apparent = None
                elif name == "cumulative_energy":
                    cumulative_energy = None
                elif name == "rpm":
                    rpm = None
        if load_percent is not None and not 0.0 <= load_percent <= 100.0:
            reasons.append("load_percent_out_of_range")
            invalid = True
            load_percent = None
        if measured_power_factor is not None and not -1.0 <= measured_power_factor <= 1.0:
            reasons.append("power_factor_out_of_range")
            invalid = True
            measured_power_factor = None

        state = parse_operating_state(telemetry.operating_state)
        if telemetry.operating_state is None:
            reasons.append("missing_operating_state")
        elif state is None:
            reasons.append("unknown_operating_state")
            invalid = True

        apparent_power = measured_apparent
        if apparent_power is None:
            apparent_power = calculate_apparent_power_kva(
                voltage,
                current,
                self._baseline.voltage_current_multiplier,
            )
            if voltage is not None and current is not None and apparent_power is None:
                reasons.append("invalid_apparent_power_calculation")
                invalid = True
        power_factor = measured_power_factor
        if power_factor is None:
            power_factor = calculate_power_factor(active_power, apparent_power)
            if active_power is not None and apparent_power is not None and apparent_power > 0 and power_factor is None:
                reasons.append("derived_power_factor_out_of_range")
                invalid = True

        expected_power = self._baseline.expected_power_kw(state, load_percent) if state is not None else None
        if expected_power is None:
            reasons.append("baseline_unavailable")

        excess_power = calculate_excess_power_kw(active_power, expected_power)
        idle_ratio = calculate_idle_power_ratio(state, active_power, expected_power)
        power_per_load = calculate_power_per_load_percent(active_power, load_percent)

        stream = (telemetry.machine_id, telemetry.sensor_id)
        energy_increment: float | None = None
        timestamp = telemetry.timestamp
        if timestamp is None:
            reasons.append("missing_timestamp")
            invalid = True
            self._previous.pop(stream, None)
        else:
            previous = self._previous.get(stream)
            if previous is None:
                reasons.append("first_sample_no_interval")
            else:
                elapsed_seconds = (timestamp - previous.timestamp).total_seconds()
                if elapsed_seconds <= 0:
                    reasons.append("non_increasing_timestamp")
                    invalid = True
                else:
                    energy_increment = calculate_energy_increment_kwh(
                        previous.active_power_kw,
                        active_power,
                        elapsed_seconds,
                    )
                    if energy_increment is None:
                        if previous.active_power_kw is not None and active_power is not None:
                            reasons.append("non_finite_energy_calculation")
                            invalid = True
                        else:
                            reasons.append("missing_power_for_energy_interval")
            if previous is None or timestamp > previous.timestamp:
                self._previous[stream] = _PreviousSample(timestamp, active_power)

        derived_values = {
            "apparent_power_kva": apparent_power,
            "power_factor": power_factor,
            "expected_power_kw": expected_power,
            "excess_power_kw": excess_power,
            "idle_power_ratio": idle_ratio,
            "power_per_load_percent": power_per_load,
            "energy_increment_kwh": energy_increment,
        }
        for name, value in derived_values.items():
            if value is not None and not isfinite(value):
                reasons.append(f"non_finite_derived_{name}")
                invalid = True
                if name == "apparent_power_kva":
                    apparent_power = None
                elif name == "power_factor":
                    power_factor = None
                elif name == "expected_power_kw":
                    expected_power = None
                elif name == "excess_power_kw":
                    excess_power = None
                elif name == "idle_power_ratio":
                    idle_ratio = None
                elif name == "power_per_load_percent":
                    power_per_load = None
                elif name == "energy_increment_kwh":
                    energy_increment = None

        quality = (
            FeatureQuality.INVALID
            if invalid
            else FeatureQuality.PARTIAL
            if reasons
            else FeatureQuality.GOOD
        )
        return FeatureRecord(
            timestamp=timestamp,
            machine_id=telemetry.machine_id,
            operating_state=state.value if state is not None else telemetry.operating_state,
            load_percent=load_percent,
            active_power_kw=active_power,
            apparent_power_kva=apparent_power,
            power_factor=power_factor,
            rpm=rpm,
            temperature_c=temperature,
            energy_increment_kwh=energy_increment,
            cumulative_energy_kwh=cumulative_energy,
            expected_power_kw=expected_power,
            excess_power_kw=excess_power,
            estimated_wasted_energy_kwh=None,
            idle_power_ratio=idle_ratio,
            power_per_load_percent=power_per_load,
            quality=quality,
            quality_reasons=tuple(dict.fromkeys(reasons)),
        )