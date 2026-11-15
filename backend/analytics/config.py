from dataclasses import dataclass
from math import isfinite

from analytics.models import OperatingState


@dataclass(frozen=True, slots=True)
class PiecewisePowerBaseline:
    rated_power_kw: float = 100.0
    idle_power_kw: float = 18.5
    stopped_power_kw: float = 0.0
    low_load_intercept_fraction: float = 0.10
    low_load_slope: float = 0.75
    running_intercept_fraction: float = 0.12
    running_slope: float = 0.80
    high_load_intercept_fraction: float = 0.16
    high_load_slope: float = 0.82
    starting_intercept_fraction: float = 0.18
    starting_slope: float = 0.75
    voltage_current_multiplier: float = 1.0

    def __post_init__(self) -> None:
        numeric_values = (
            self.rated_power_kw,
            self.idle_power_kw,
            self.stopped_power_kw,
            self.low_load_intercept_fraction,
            self.low_load_slope,
            self.running_intercept_fraction,
            self.running_slope,
            self.high_load_intercept_fraction,
            self.high_load_slope,
            self.starting_intercept_fraction,
            self.starting_slope,
            self.voltage_current_multiplier,
        )
        if not all(isfinite(value) for value in numeric_values):
            raise ValueError("baseline configuration values must be finite")
        if self.rated_power_kw <= 0 or self.idle_power_kw < 0 or self.stopped_power_kw < 0:
            raise ValueError("rated power must be positive and baseline powers cannot be negative")
        if self.voltage_current_multiplier <= 0:
            raise ValueError("voltage_current_multiplier must be positive")
        for intercept, slope in (
            (self.low_load_intercept_fraction, self.low_load_slope),
            (self.running_intercept_fraction, self.running_slope),
            (self.high_load_intercept_fraction, self.high_load_slope),
            (self.starting_intercept_fraction, self.starting_slope),
        ):
            if intercept < 0 or slope < 0:
                raise ValueError("baseline curve coefficients cannot be negative")

    def expected_power_kw(self, state: OperatingState, load_percent: float | None) -> float | None:
        if state is OperatingState.STOPPED:
            return self.stopped_power_kw
        if state is OperatingState.IDLE:
            return self.idle_power_kw
        if state is OperatingState.FAULT or load_percent is None:
            return None

        load_fraction = load_percent / 100.0
        curves = {
            OperatingState.STARTING: (self.starting_intercept_fraction, self.starting_slope),
            OperatingState.LOW_LOAD: (self.low_load_intercept_fraction, self.low_load_slope),
            OperatingState.RUNNING: (self.running_intercept_fraction, self.running_slope),
            OperatingState.HIGH_LOAD: (self.high_load_intercept_fraction, self.high_load_slope),
        }
        intercept, slope = curves[state]
        return self.rated_power_kw * (intercept + slope * load_fraction)


DEFAULT_BASELINE = PiecewisePowerBaseline()


@dataclass(frozen=True, slots=True)
class DetectionConfig:
    maximum_sample_gap_seconds: float = 30.0
    minimum_condition_samples: int = 2
    minimum_idle_duration_seconds: float = 60.0
    minimum_idle_excess_power_kw: float = 5.0
    idle_power_ratio_threshold: float = 1.5
    maximum_low_load_percent: float = 30.0
    minimum_low_load_excess_power_kw: float = 8.0
    minimum_low_load_duration_seconds: float = 120.0
    minimum_abnormal_excess_power_kw: float = 10.0
    minimum_abnormal_excess_ratio: float = 1.25
    minimum_abnormal_duration_seconds: float = 60.0
    abnormal_operating_states: tuple[OperatingState, ...] = (
        OperatingState.IDLE,
        OperatingState.LOW_LOAD,
        OperatingState.RUNNING,
        OperatingState.HIGH_LOAD,
    )
    cycling_window_seconds: float = 600.0
    minimum_cycles: int = 3

    def __post_init__(self) -> None:
        positive_values = (
            self.maximum_sample_gap_seconds,
            self.minimum_idle_duration_seconds,
            self.minimum_idle_excess_power_kw,
            self.idle_power_ratio_threshold,
            self.maximum_low_load_percent,
            self.minimum_low_load_excess_power_kw,
            self.minimum_low_load_duration_seconds,
            self.minimum_abnormal_excess_power_kw,
            self.minimum_abnormal_excess_ratio,
            self.minimum_abnormal_duration_seconds,
            self.cycling_window_seconds,
        )
        if not all(isfinite(value) and value > 0 for value in positive_values):
            raise ValueError("detection thresholds and durations must be finite and greater than zero")
        if not 0.0 <= self.maximum_low_load_percent <= 100.0:
            raise ValueError("maximum_low_load_percent must be within 0..100")
        if self.minimum_condition_samples < 2 or self.minimum_cycles < 2:
            raise ValueError("persistence requires at least two samples and two cycles")
        if not self.abnormal_operating_states:
            raise ValueError("abnormal_operating_states cannot be empty")