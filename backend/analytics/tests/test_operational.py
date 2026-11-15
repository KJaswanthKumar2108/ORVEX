import unittest

from analytics.config import DEFAULT_BASELINE, PiecewisePowerBaseline
from analytics.features.operational import (
    calculate_excess_power_kw,
    calculate_idle_power_ratio,
    calculate_power_per_load_percent,
)
from analytics.models import OperatingState


class OperationalFeatureTests(unittest.TestCase):
    def test_stopped_baseline_and_excess(self) -> None:
        expected = DEFAULT_BASELINE.expected_power_kw(OperatingState.STOPPED, 0.0)
        self.assertEqual(expected, 0.0)
        self.assertEqual(calculate_excess_power_kw(0.5, expected), 0.5)

    def test_idle_baseline_comes_from_configuration(self) -> None:
        baseline = PiecewisePowerBaseline(idle_power_kw=12.25)
        expected = baseline.expected_power_kw(OperatingState.IDLE, 0.0)
        self.assertEqual(expected, 12.25)
        self.assertAlmostEqual(calculate_idle_power_ratio(OperatingState.IDLE, 24.5, expected), 2.0)

    def test_low_load_piecewise_baseline_and_power_per_load(self) -> None:
        expected = DEFAULT_BASELINE.expected_power_kw(OperatingState.LOW_LOAD, 20.0)
        self.assertAlmostEqual(expected, 25.0)
        self.assertAlmostEqual(calculate_power_per_load_percent(45.0, 20.0), 2.25)

    def test_high_load_baseline_increases_with_load(self) -> None:
        low = DEFAULT_BASELINE.expected_power_kw(OperatingState.HIGH_LOAD, 60.0)
        high = DEFAULT_BASELINE.expected_power_kw(OperatingState.HIGH_LOAD, 90.0)
        self.assertGreater(high, low)

    def test_excess_power_only_reports_positive_difference(self) -> None:
        self.assertEqual(calculate_excess_power_kw(45.0, 25.0), 20.0)
        self.assertEqual(calculate_excess_power_kw(20.0, 25.0), 0.0)

    def test_unavailable_baseline_keeps_excess_null(self) -> None:
        self.assertIsNone(DEFAULT_BASELINE.expected_power_kw(OperatingState.FAULT, 80.0))
        self.assertIsNone(calculate_excess_power_kw(80.0, None))

    def test_idle_ratio_and_load_ratio_avoid_zero_division(self) -> None:
        self.assertIsNone(calculate_idle_power_ratio(OperatingState.IDLE, 10.0, 0.0))
        self.assertIsNone(calculate_idle_power_ratio(OperatingState.RUNNING, 10.0, 10.0))
        self.assertIsNone(calculate_power_per_load_percent(10.0, 0.0))
