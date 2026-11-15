from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class MachineProfile:
    name: str
    machine_type: str
    rated_power_kw: float
    nominal_voltage_v: float
    nominal_frequency_hz: float
    normal_rpm: float
    maximum_rpm: float
    baseline_temperature_c: float
    temperature_rise_at_rated_load_c: float
    thermal_time_constant_seconds: float
    minimum_power_factor: float
    maximum_power_factor: float
    starting_power_factor: float
    idle_power_factor: float
    fault_power_factor: float
    idle_power_kw: float
    idle_load_percent: float
    running_load_range: tuple[float, float]
    low_load_range: tuple[float, float]
    high_load_range: tuple[float, float]
    fault_load_range: tuple[float, float]
    starting_duration_seconds: float
    starting_power_fraction_range: tuple[float, float]
    maximum_power_multiplier: float
    maximum_voltage_sag_fraction: float


DEFAULT_PROFILE = MachineProfile(
    name="DefaultHaulageMotor",
    machine_type="three_phase_induction_motor",
    rated_power_kw=132.0,
    nominal_voltage_v=415.0,
    nominal_frequency_hz=50.0,
    normal_rpm=1480.0,
    maximum_rpm=1600.0,
    baseline_temperature_c=32.0,
    temperature_rise_at_rated_load_c=52.0,
    thermal_time_constant_seconds=240.0,
    minimum_power_factor=0.78,
    maximum_power_factor=0.96,
    starting_power_factor=0.64,
    idle_power_factor=0.72,
    fault_power_factor=0.70,
    idle_power_kw=18.5,
    idle_load_percent=8.0,
    running_load_range=(0.48, 0.78),
    low_load_range=(0.18, 0.34),
    high_load_range=(0.84, 0.97),
    fault_load_range=(0.62, 0.88),
    starting_duration_seconds=5.0,
    starting_power_fraction_range=(0.30, 0.82),
    maximum_power_multiplier=1.25,
    maximum_voltage_sag_fraction=0.035,
)