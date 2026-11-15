import unittest
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from analytics.features.energy import calculate_energy_increment_kwh
from analytics.models import FeatureQuality, TelemetryInput
from analytics.services.feature_engine import FeatureEngine
from analytics.config import DEFAULT_BASELINE


class EnergyFeatureTests(unittest.TestCase):
    def test_known_power_and_interval(self) -> None:
        self.assertAlmostEqual(calculate_energy_increment_kwh(10.0, 10.0, 1800), 5.0)

    def test_irregular_interval_uses_trapezoidal_power(self) -> None:
        self.assertAlmostEqual(calculate_energy_increment_kwh(10.0, 20.0, 900), 3.75)

    def test_negative_power_keeps_signed_energy(self) -> None:
        self.assertAlmostEqual(calculate_energy_increment_kwh(-10.0, -10.0, 3600), -10.0)

    def test_missing_power_returns_null(self) -> None:
        self.assertIsNone(calculate_energy_increment_kwh(10.0, None, 60))

    def test_overflowing_energy_increment_returns_null(self) -> None:
        self.assertIsNone(calculate_energy_increment_kwh(1e308, 1e308, 3600))

    def test_non_positive_interval_is_rejected(self) -> None:
        for interval in (0.0, -1.0, float("inf")):
            with self.subTest(interval=interval), self.assertRaises(ValueError):
                calculate_energy_increment_kwh(1.0, 1.0, interval)

    def test_first_engine_sample_has_null_increment(self) -> None:
        engine = FeatureEngine(DEFAULT_BASELINE)
        sample = TelemetryInput(
            datetime(2026, 9, 26, tzinfo=timezone.utc),
            uuid4(),
            active_power=12.0,
            load_percent=30.0,
            operating_state="RUNNING",
        )
        result = engine.process(sample)
        self.assertIsNone(result.energy_increment_kwh)
        self.assertIn("first_sample_no_interval", result.quality_reasons)

    def test_engine_integrates_irregular_consecutive_samples(self) -> None:
        machine_id = uuid4()
        engine = FeatureEngine(DEFAULT_BASELINE)
        start = datetime(2026, 9, 26, tzinfo=timezone.utc)
        engine.process(TelemetryInput(start, machine_id, active_power=10.0, operating_state="RUNNING"))
        result = engine.process(
            TelemetryInput(start + timedelta(minutes=15), machine_id, active_power=20.0, operating_state="RUNNING")
        )
        self.assertAlmostEqual(result.energy_increment_kwh, 3.75)

    def test_non_increasing_timestamp_is_invalid_and_does_not_advance_stream(self) -> None:
        machine_id = uuid4()
        engine = FeatureEngine(DEFAULT_BASELINE)
        start = datetime(2026, 9, 26, tzinfo=timezone.utc)
        engine.process(TelemetryInput(start, machine_id, active_power=10.0, operating_state="RUNNING"))
        invalid = engine.process(
            TelemetryInput(start - timedelta(seconds=1), machine_id, active_power=99.0, operating_state="RUNNING")
        )
        next_sample = engine.process(
            TelemetryInput(start + timedelta(seconds=3600), machine_id, active_power=20.0, operating_state="RUNNING")
        )
        self.assertEqual(invalid.quality, FeatureQuality.INVALID)
        self.assertIn("non_increasing_timestamp", invalid.quality_reasons)
        self.assertAlmostEqual(next_sample.energy_increment_kwh, 15.0)