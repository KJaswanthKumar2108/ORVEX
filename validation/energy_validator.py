"""Energy Quantification Validation Engine.

Compares ORVEX trapezoidal power-to-energy integration against exact analytical
reference solutions, evaluating:
- Absolute and percentage error across known load functions (constant, ramp, sinusoidal)
- Sampling interval sensitivity (1s, 5s, 10s, 30s)
- Missing-data gap exclusion (> 30s gap threshold)
- Overlapping wastage event deduplication
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import pi, sin
from typing import Any

from analytics.features.energy import calculate_energy_increment_kwh
from app.services.energy_analytics_service import _merge_intervals


@dataclass
class EnergyValidationResult:
    test_name: str
    description: str
    sampling_interval_seconds: float
    duration_hours: float
    reference_energy_kwh: float
    estimated_energy_kwh: float
    absolute_error_kwh: float
    percentage_error: float
    passed: bool
    notes: str = ""


class EnergyQuantificationValidator:
    def __init__(self, maximum_sample_gap_seconds: float = 30.0) -> None:
        self.maximum_sample_gap_seconds = maximum_sample_gap_seconds

    def _integrate_series(
        self,
        timestamps: list[datetime],
        powers_kw: list[float],
    ) -> float:
        """Runs the exact ORVEX trapezoidal integration with gap protection."""
        total_energy_kwh = 0.0
        for i in range(1, len(timestamps)):
            dt = (timestamps[i] - timestamps[i - 1]).total_seconds()
            if dt <= 0:
                continue
            if dt > self.maximum_sample_gap_seconds:
                # Gap exceeded: exclude unmeasured interval
                continue
            inc = calculate_energy_increment_kwh(powers_kw[i - 1], powers_kw[i], dt)
            if inc is not None:
                total_energy_kwh += inc
        return round(total_energy_kwh, 6)

    def validate_constant_power(
        self,
        power_kw: float = 100.0,
        duration_hours: float = 1.0,
        interval_seconds: float = 10.0,
    ) -> EnergyValidationResult:
        """Validates integration against constant load P(t) = P0."""
        t0 = datetime(2026, 11, 4, 0, 0, 0, tzinfo=timezone.utc)
        n_steps = int((duration_hours * 3600.0) / interval_seconds)
        timestamps = [t0 + timedelta(seconds=i * interval_seconds) for i in range(n_steps + 1)]
        powers = [power_kw] * len(timestamps)

        ref_energy = power_kw * duration_hours
        est_energy = self._integrate_series(timestamps, powers)
        abs_err = abs(est_energy - ref_energy)
        pct_err = (abs_err / ref_energy) * 100.0 if ref_energy > 0 else 0.0

        return EnergyValidationResult(
            test_name="Constant Power Integration",
            description=f"Constant {power_kw} kW load over {duration_hours} hr.",
            sampling_interval_seconds=interval_seconds,
            duration_hours=duration_hours,
            reference_energy_kwh=ref_energy,
            estimated_energy_kwh=est_energy,
            absolute_error_kwh=round(abs_err, 6),
            percentage_error=round(pct_err, 4),
            passed=pct_err < 0.01,
            notes="Trapezoidal rule is analytically exact for constant functions.",
        )

    def validate_linear_ramp(
        self,
        p_start_kw: float = 50.0,
        p_end_kw: float = 100.0,
        duration_hours: float = 1.0,
        interval_seconds: float = 10.0,
    ) -> EnergyValidationResult:
        """Validates integration against linear ramp P(t) = P_start + alpha * t."""
        t0 = datetime(2026, 11, 4, 0, 0, 0, tzinfo=timezone.utc)
        total_seconds = duration_hours * 3600.0
        n_steps = int(total_seconds / interval_seconds)
        timestamps = [t0 + timedelta(seconds=i * interval_seconds) for i in range(n_steps + 1)]

        slope = (p_end_kw - p_start_kw) / total_seconds
        powers = [p_start_kw + slope * (i * interval_seconds) for i in range(len(timestamps))]

        # Analytical integral: int_0^T (p0 + alpha * t) dt = p0*T + 0.5*alpha*T^2
        ref_energy = ((p_start_kw + p_end_kw) / 2.0) * duration_hours
        est_energy = self._integrate_series(timestamps, powers)
        abs_err = abs(est_energy - ref_energy)
        pct_err = (abs_err / ref_energy) * 100.0 if ref_energy > 0 else 0.0

        return EnergyValidationResult(
            test_name="Linear Power Ramp Integration",
            description=f"Linear ramp from {p_start_kw} kW to {p_end_kw} kW over {duration_hours} hr.",
            sampling_interval_seconds=interval_seconds,
            duration_hours=duration_hours,
            reference_energy_kwh=round(ref_energy, 4),
            estimated_energy_kwh=est_energy,
            absolute_error_kwh=round(abs_err, 6),
            percentage_error=round(pct_err, 4),
            passed=pct_err < 0.01,
            notes="Trapezoidal rule is analytically exact for 1st-degree polynomials.",
        )

    def validate_dynamic_cyclical(
        self,
        p_mean_kw: float = 80.0,
        p_amp_kw: float = 20.0,
        cycle_period_seconds: float = 300.0,
        duration_hours: float = 1.0,
        interval_seconds: float = 10.0,
    ) -> EnergyValidationResult:
        """Validates integration against sinusoidal dynamic load P(t) = P_mean + P_amp * sin(omega * t)."""
        t0 = datetime(2026, 11, 4, 0, 0, 0, tzinfo=timezone.utc)
        total_seconds = duration_hours * 3600.0
        n_steps = int(total_seconds / interval_seconds)
        timestamps = [t0 + timedelta(seconds=i * interval_seconds) for i in range(n_steps + 1)]

        omega = 2.0 * pi / cycle_period_seconds
        powers = [p_mean_kw + p_amp_kw * sin(omega * (i * interval_seconds)) for i in range(len(timestamps))]

        # Integral of full periods of sin is 0, so reference energy = p_mean * duration
        num_cycles = total_seconds / cycle_period_seconds
        ref_energy = p_mean_kw * duration_hours
        # Exact correction for any fractional cycle at the end
        if num_cycles % 1.0 != 0.0:
            sin_integral = -(p_amp_kw / omega) * (sin(omega * total_seconds) - 0.0) / 3600.0
            ref_energy += sin_integral

        est_energy = self._integrate_series(timestamps, powers)
        abs_err = abs(est_energy - ref_energy)
        pct_err = (abs_err / ref_energy) * 100.0 if ref_energy > 0 else 0.0

        return EnergyValidationResult(
            test_name="Cyclical Dynamic Load Integration",
            description=f"Sinusoidal load {p_mean_kw} +/- {p_amp_kw} kW (T={cycle_period_seconds}s) over {duration_hours} hr.",
            sampling_interval_seconds=interval_seconds,
            duration_hours=duration_hours,
            reference_energy_kwh=round(ref_energy, 4),
            estimated_energy_kwh=est_energy,
            absolute_error_kwh=round(abs_err, 6),
            percentage_error=round(pct_err, 4),
            passed=pct_err < 0.20,  # Within 0.2%
            notes="Sampling at 10s gives 30 samples/period (Nyquist factor 15x).",
        )

    def validate_missing_data_gap_exclusion(self) -> EnergyValidationResult:
        """Validates that gaps exceeding 30 seconds are safely excluded from energy integration."""
        t0 = datetime(2026, 11, 4, 0, 0, 0, tzinfo=timezone.utc)
        # Period 1: 30 minutes at 100 kW = 50.0 kWh (180 samples @ 10s)
        # GAP: 20 minutes with zero samples (sensor offline)
        # Period 2: 30 minutes at 100 kW = 50.0 kWh (180 samples @ 10s)
        # Monitored time: 1.0 hr. Reference energy across monitored segments: 100.0 kWh.
        # If naive integration interpolated across the 20-min gap: naive result = 133.33 kWh (+33.3% error).
        timestamps: list[datetime] = []
        powers: list[float] = []

        # Period 1
        for i in range(181):
            timestamps.append(t0 + timedelta(seconds=i * 10))
            powers.append(100.0)

        # Gap of 20 minutes (1200 seconds)
        t_resume = timestamps[-1] + timedelta(minutes=20)
        for i in range(181):
            timestamps.append(t_resume + timedelta(seconds=i * 10))
            powers.append(100.0)

        ref_monitored_energy = 100.0 * (60.0 / 60.0)  # 1.0 hour total active monitoring = 100 kWh
        est_energy = self._integrate_series(timestamps, powers)
        abs_err = abs(est_energy - ref_monitored_energy)
        pct_err = (abs_err / ref_monitored_energy) * 100.0

        return EnergyValidationResult(
            test_name="Telemetry Outage Gap Exclusion",
            description="Exclusion of 20-minute unmonitored communication dropout between active segments.",
            sampling_interval_seconds=10.0,
            duration_hours=1.0,
            reference_energy_kwh=ref_monitored_energy,
            estimated_energy_kwh=est_energy,
            absolute_error_kwh=round(abs_err, 6),
            percentage_error=round(pct_err, 4),
            passed=abs_err < 0.001,
            notes="ORVEX gap threshold (30s) correctly prevented unmeasured gap interpolation.",
        )

    def validate_overlapping_event_deduplication(self) -> dict[str, Any]:
        """Validates that overlapping wastage intervals are merged into disjoint intervals."""
        t0 = datetime(2026, 11, 4, 10, 0, 0, tzinfo=timezone.utc)
        # Interval 1: 10:00 to 10:45 (45 mins)
        # Interval 2: 10:30 to 11:15 (45 mins, overlaps with Interval 1 from 10:30 to 10:45)
        # Interval 3: 11:30 to 12:00 (30 mins, disjoint)
        raw_intervals = [
            (t0, t0 + timedelta(minutes=45)),
            (t0 + timedelta(minutes=30), t0 + timedelta(minutes=75)),
            (t0 + timedelta(minutes=90), t0 + timedelta(minutes=120)),
        ]
        merged = _merge_intervals(raw_intervals)

        # Expected merged:
        # Segment 1: 10:00 to 11:15 (75 mins)
        # Segment 2: 11:30 to 12:00 (30 mins)
        # Total duration = 105 mins (instead of naive sum of 120 mins)
        naive_duration_min = sum((end - start).total_seconds() / 60.0 for start, end in raw_intervals)
        merged_duration_min = sum((end - start).total_seconds() / 60.0 for start, end in merged)

        passed = len(merged) == 2 and merged_duration_min == 105.0

        return {
            "test_name": "Overlapping Wastage Event Interval Deduplication",
            "raw_interval_count": len(raw_intervals),
            "merged_interval_count": len(merged),
            "naive_duration_minutes": naive_duration_min,
            "deduplicated_duration_minutes": merged_duration_min,
            "double_count_prevented_minutes": naive_duration_min - merged_duration_min,
            "passed": passed,
        }

    def run_all_energy_validations(self) -> list[EnergyValidationResult]:
        """Executes all energy quantification tests across sampling intervals and load functions."""
        results: list[EnergyValidationResult] = []

        # Constant power across intervals
        for interval in [1.0, 5.0, 10.0, 30.0]:
            results.append(self.validate_constant_power(interval_seconds=interval))

        # Linear ramp across intervals
        for interval in [5.0, 10.0, 30.0]:
            results.append(self.validate_linear_ramp(interval_seconds=interval))

        # Sinusoidal dynamic load across intervals
        for interval in [5.0, 10.0, 30.0]:
            results.append(self.validate_dynamic_cyclical(interval_seconds=interval))

        # Gap handling test
        results.append(self.validate_missing_data_gap_exclusion())

        return results

