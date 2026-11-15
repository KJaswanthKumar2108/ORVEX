import math
import random
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from simulator.models import OperatingState, TelemetryRecord
from simulator.profiles import DEFAULT_PROFILE, MachineProfile


class TelemetryGenerator:
    def __init__(
        self,
        machine_id: UUID | None = None,
        sensor_id: UUID | None = None,
        profile: MachineProfile = DEFAULT_PROFILE,
        interval_seconds: float = 1.0,
        seed: int | None = None,
    ) -> None:
        if interval_seconds <= 0:
            raise ValueError("interval_seconds must be greater than zero")
        self.machine_id = machine_id or uuid4()
        self.sensor_id = sensor_id
        self.profile = profile
        self.interval_seconds = interval_seconds
        self._random = random.Random(seed)
        self._last_timestamp: datetime | None = None
        self._cumulative_energy_kwh = 0.0
        self._temperature_c = profile.baseline_temperature_c

    def generate(
        self,
        state: OperatingState,
        *,
        timestamp: datetime | None = None,
        state_elapsed_seconds: float = 0.0,
        power_multiplier: float = 1.0,
        load_fraction: float | None = None,
    ) -> TelemetryRecord:
        sample_time = timestamp or datetime.now(timezone.utc)
        if sample_time.tzinfo is None or sample_time.utcoffset() is None:
            raise ValueError("timestamp must be timezone-aware")
        sample_time = sample_time.astimezone(timezone.utc)
        if self._last_timestamp is not None and sample_time <= self._last_timestamp:
            raise ValueError("timestamp must increase for each generated sample")
        if power_multiplier < 0:
            raise ValueError("power_multiplier cannot be negative")
        if load_fraction is not None and not 0.0 <= load_fraction <= 1.0:
            raise ValueError("load_fraction must be between zero and one")

        elapsed_seconds = (
            (sample_time - self._last_timestamp).total_seconds()
            if self._last_timestamp is not None
            else self.interval_seconds
        )
        load, target_power = self._operating_point(state, state_elapsed_seconds, load_fraction)
        target_power *= power_multiplier
        target_power = min(target_power, self.profile.rated_power_kw * self.profile.maximum_power_multiplier)

        voltage, current, active_power, reactive_power, apparent_power, power_factor = self._electrical_measurements(
            load, target_power, state
        )
        rpm = self._rpm_measurement(load, state, state_elapsed_seconds)
        temperature = self._temperature_measurement(active_power, elapsed_seconds)
        self._cumulative_energy_kwh += active_power * elapsed_seconds / 3600.0
        self._last_timestamp = sample_time

        return TelemetryRecord(
            timestamp=sample_time,
            machine_id=self.machine_id,
            sensor_id=self.sensor_id,
            voltage=voltage,
            current=current,
            active_power=active_power,
            reactive_power=reactive_power,
            apparent_power=apparent_power,
            power_factor=power_factor,
            cumulative_energy=self._cumulative_energy_kwh,
            rpm=rpm,
            temperature=temperature,
            load_percent=load * 100.0,
            operating_state=state,
        )

    def _operating_point(
        self,
        state: OperatingState,
        state_elapsed_seconds: float,
        load_override: float | None,
    ) -> tuple[float, float]:
        profile = self.profile
        rated_power = profile.rated_power_kw

        if state is OperatingState.STOPPED:
            return 0.0, 0.0
        if state is OperatingState.STARTING:
            progress = min(max(state_elapsed_seconds / profile.starting_duration_seconds, 0.0), 1.0)
            start_min, start_max = profile.starting_power_fraction_range
            power_fraction = start_min + (start_max - start_min) * progress
            return power_fraction, rated_power * power_fraction * self._random.uniform(0.98, 1.02)
        if state is OperatingState.IDLE:
            return profile.idle_load_percent / 100.0, profile.idle_power_kw

        load_ranges = {
            OperatingState.RUNNING: profile.running_load_range,
            OperatingState.LOW_LOAD: profile.low_load_range,
            OperatingState.HIGH_LOAD: profile.high_load_range,
            OperatingState.FAULT: profile.fault_load_range,
        }
        load_range = load_ranges[state]
        load = load_override if load_override is not None else self._random.uniform(*load_range)
        load = min(max(load, 0.0), 1.0)
        if state is OperatingState.FAULT:
            power_fraction = self._random.uniform(0.65, 0.92)
        else:
            power_fraction = 0.04 + 0.93 * load
        power = rated_power * power_fraction * self._random.uniform(0.985, 1.015)
        return load, power

    def _electrical_measurements(
        self,
        load: float,
        target_power_kw: float,
        state: OperatingState,
    ) -> tuple[float, float, float, float, float, float]:
        profile = self.profile
        voltage_factor = 1.0 - profile.maximum_voltage_sag_fraction * load
        voltage_factor += self._random.uniform(-0.006, 0.006)
        voltage = max(1.0, profile.nominal_voltage_v * voltage_factor)

        if target_power_kw <= 0:
            return voltage, 0.0, 0.0, 0.0, 0.0, 0.0

        if state is OperatingState.STARTING:
            power_factor = profile.starting_power_factor + self._random.uniform(-0.015, 0.015)
        elif state is OperatingState.IDLE:
            power_factor = profile.idle_power_factor + self._random.uniform(-0.02, 0.02)
        elif state is OperatingState.FAULT:
            power_factor = profile.fault_power_factor + self._random.uniform(-0.025, 0.025)
        else:
            power_factor = profile.minimum_power_factor + (
                profile.maximum_power_factor - profile.minimum_power_factor
            ) * math.sqrt(max(load, 0.0))
            power_factor += self._random.uniform(-0.015, 0.015)
        power_factor = min(max(power_factor, 0.55), 0.99)

        apparent_target_kva = target_power_kw / power_factor
        current = apparent_target_kva * 1000.0 / (math.sqrt(3.0) * voltage)
        apparent_power = math.sqrt(3.0) * voltage * current / 1000.0
        active_power = apparent_power * power_factor * self._random.uniform(0.99, 1.01)
        reactive_power = math.sqrt(max(apparent_power**2 - active_power**2, 0.0))
        return voltage, current, active_power, reactive_power, apparent_power, power_factor

    def _rpm_measurement(self, load: float, state: OperatingState, state_elapsed_seconds: float) -> float:
        profile = self.profile
        if state is OperatingState.STOPPED:
            return 0.0
        if state is OperatingState.STARTING:
            progress = min(max(state_elapsed_seconds / profile.starting_duration_seconds, 0.0), 1.0)
            rpm = profile.normal_rpm * progress
        elif state is OperatingState.IDLE:
            rpm = profile.normal_rpm * 0.88
        elif state is OperatingState.LOW_LOAD:
            rpm = profile.normal_rpm * 0.92
        elif state is OperatingState.HIGH_LOAD:
            rpm = profile.normal_rpm * 0.99
        elif state is OperatingState.FAULT:
            rpm = profile.normal_rpm * self._random.uniform(0.62, 0.88)
        else:
            rpm = profile.normal_rpm * (0.97 + load * 0.04)
        return min(max(rpm + self._random.uniform(-8.0, 8.0), 0.0), profile.maximum_rpm)

    def _temperature_measurement(self, active_power_kw: float, elapsed_seconds: float) -> float:
        profile = self.profile
        load_fraction = min(active_power_kw / profile.rated_power_kw, profile.maximum_power_multiplier)
        target = profile.baseline_temperature_c + profile.temperature_rise_at_rated_load_c * load_fraction
        blend = 1.0 - math.exp(-elapsed_seconds / profile.thermal_time_constant_seconds)
        self._temperature_c += (target - self._temperature_c) * blend
        self._temperature_c += self._random.uniform(-0.08, 0.08)
        return max(0.0, self._temperature_c)