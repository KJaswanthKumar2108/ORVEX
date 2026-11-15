import math
import unittest
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from analytics.config import DEFAULT_BASELINE, PiecewisePowerBaseline
from analytics.models import FeatureQuality, OperatingState, TelemetryInput
from analytics.services.feature_engine import FeatureEngine


class FeatureEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.machine_id = uuid4()
        self.start = datetime(2026, 9, 26, 12, tzinfo=timezone.utc)

    def sample(self, **values: object) -> TelemetryInput:
        defaults: dict[str, object] = {
            "timestamp": self.start,
            "machine_id": self.machine_id,
            "voltage": 400.0,
            "current": 10.0,
            "active_power": 4.0,
            "reactive_power": 3.0,
            "apparent_power": 5.0,
            "power_factor": 0.8,
            "cumulative_energy": 100.0,
            "rpm": 1200.0,
            "temperature": 45.0,
            "load_percent": 20.0,
            "operating_state": "LOW_LOAD",
        }
        defaults.update(values)
        return TelemetryInput(**defaults)

    def test_prefers_measured_apparent_power_and_power_factor(self) -> None:
        result = FeatureEngine(DEFAULT_BASELINE).process(self.sample())
        self.assertEqual(result.apparent_power_kva, 5.0)
        self.assertEqual(result.power_factor, 0.8)

    def test_derives_apparent_power_and_factor_when_missing(self) -> None:
        baseline = PiecewisePowerBaseline(voltage_current_multiplier=3**0.5)
        result = FeatureEngine(baseline).process(self.sample(apparent_power=None, power_factor=None))
        self.assertAlmostEqual(result.apparent_power_kva, 6.928203, places=5)
        self.assertAlmostEqual(result.power_factor, 4.0 / result.apparent_power_kva)

    def test_excess_is_feature_not_wasted_energy(self) -> None:
        result = FeatureEngine(DEFAULT_BASELINE).process(self.sample(active_power=45.0))
        self.assertEqual(result.expected_power_kw, 25.0)
        self.assertEqual(result.excess_power_kw, 20.0)
        self.assertIsNone(result.estimated_wasted_energy_kwh)

    def test_idle_ratio_uses_configured_idle_baseline(self) -> None:
        result = FeatureEngine(DEFAULT_BASELINE).process(
            self.sample(operating_state="IDLE", active_power=37.0, load_percent=8.0)
        )
        self.assertEqual(result.expected_power_kw, 18.5)
        self.assertEqual(result.idle_power_ratio, 2.0)

    def test_missing_fault_baseline_is_partial_and_has_no_excess(self) -> None:
        result = FeatureEngine().process(self.sample(operating_state="FAULT", active_power=80.0))
        self.assertEqual(result.quality, FeatureQuality.PARTIAL)
        self.assertIsNone(result.expected_power_kw)
        self.assertIsNone(result.excess_power_kw)
        self.assertIn("baseline_unavailable", result.quality_reasons)

    def test_missing_values_are_partial_and_unavailable_features_are_null(self) -> None:
        result = FeatureEngine(DEFAULT_BASELINE).process(
            self.sample(
                active_power=None,
                voltage=None,
                current=None,
                apparent_power=None,
                load_percent=None,
            )
        )
        self.assertEqual(result.quality, FeatureQuality.PARTIAL)
        self.assertIsNone(result.active_power_kw)
        self.assertIsNone(result.apparent_power_kva)
        self.assertIsNone(result.expected_power_kw)
        self.assertIsNone(result.excess_power_kw)
        self.assertIn("missing_active_power", result.quality_reasons)
        self.assertIn("missing_load_percent", result.quality_reasons)

    def test_missing_timestamp_is_flagged_and_resets_energy_stream(self) -> None:
        engine = FeatureEngine(DEFAULT_BASELINE)
        engine.process(self.sample())
        missing = engine.process(self.sample(timestamp=None))
        resumed = engine.process(self.sample(timestamp=self.start + timedelta(seconds=1)))
        self.assertEqual(missing.quality, FeatureQuality.INVALID)
        self.assertIn("missing_timestamp", missing.quality_reasons)
        self.assertIsNone(resumed.energy_increment_kwh)
        self.assertIn("first_sample_no_interval", resumed.quality_reasons)

    def test_naive_timestamp_is_rejected_and_utc_timestamp_accepted(self) -> None:
        accepted = self.sample()
        self.assertEqual(accepted.timestamp.utcoffset(), timedelta(0))
        with self.assertRaises(ValueError):
            self.sample(timestamp=datetime(2026, 9, 26, 12))

    def test_non_finite_and_impossible_values_are_flagged_invalid(self) -> None:
        engine = FeatureEngine(DEFAULT_BASELINE)
        result = engine.process(self.sample(active_power=math.nan, voltage=-1.0, power_factor=1.2))
        self.assertEqual(result.quality, FeatureQuality.INVALID)
        self.assertIsNone(result.active_power_kw)
        self.assertIsNone(result.power_factor)
        self.assertIn("non_finite_active_power", result.quality_reasons)
        self.assertIn("negative_voltage", result.quality_reasons)
        self.assertIn("power_factor_out_of_range", result.quality_reasons)

    def test_finite_inputs_that_overflow_apparent_power_are_flagged_invalid(self) -> None:
        result = FeatureEngine().process(
            self.sample(voltage=1e308, current=1e308, apparent_power=None, power_factor=None)
        )
        self.assertEqual(result.quality, FeatureQuality.INVALID)
        self.assertIsNone(result.apparent_power_kva)
        self.assertIn("invalid_apparent_power_calculation", result.quality_reasons)

    def test_negative_active_power_is_preserved(self) -> None:
        result = FeatureEngine(DEFAULT_BASELINE).process(self.sample(active_power=-2.0, apparent_power=5.0))
        self.assertEqual(result.active_power_kw, -2.0)
        self.assertEqual(result.excess_power_kw, 0.0)

    def test_quality_is_good_for_complete_valid_sample_with_interval(self) -> None:
        engine = FeatureEngine(DEFAULT_BASELINE)
        engine.process(self.sample())
        result = engine.process(self.sample(timestamp=self.start + timedelta(seconds=1)))
        self.assertEqual(result.quality, FeatureQuality.GOOD)
        self.assertEqual(result.quality_reasons, ())

    def test_five_simulator_scenarios_produce_features(self) -> None:
        from simulator.generator import TelemetryGenerator
        from simulator.models import Scenario as SimulatorScenario
        from simulator.profiles import DEFAULT_PROFILE as SIMULATOR_PROFILE
        from simulator.scenarios import ScenarioController

        scenarios = (
            SimulatorScenario.NORMAL_OPERATION,
            SimulatorScenario.IDLE_WASTAGE,
            SimulatorScenario.LOW_LOAD_WASTAGE,
            SimulatorScenario.ABNORMAL_POWER,
            SimulatorScenario.START_STOP_CYCLING,
        )
        for index, scenario in enumerate(scenarios):
            with self.subTest(scenario=scenario.value):
                controller = ScenarioController(scenario, SIMULATOR_PROFILE)
                step = controller.step_at(7.0)
                generated = TelemetryGenerator(seed=10 + index).generate(
                    step.state,
                    timestamp=self.start + timedelta(seconds=index),
                    state_elapsed_seconds=step.state_elapsed_seconds,
                    power_multiplier=step.power_multiplier,
                    load_fraction=step.load_fraction,
                )
                raw = generated.to_payload()
                telemetry = TelemetryInput(
                    timestamp=generated.timestamp,
                    machine_id=generated.machine_id,
                    sensor_id=generated.sensor_id,
                    voltage=generated.voltage,
                    current=generated.current,
                    active_power=generated.active_power,
                    reactive_power=generated.reactive_power,
                    apparent_power=generated.apparent_power,
                    power_factor=generated.power_factor,
                    cumulative_energy=generated.cumulative_energy,
                    rpm=generated.rpm,
                    temperature=generated.temperature,
                    load_percent=generated.load_percent,
                    operating_state=generated.operating_state.value,
                )
                features = FeatureEngine(DEFAULT_BASELINE).process(telemetry)
                self.assertIsNotNone(features.active_power_kw)
                self.assertIsNotNone(features.expected_power_kw)
                self.assertIsNone(features.estimated_wasted_energy_kwh)
                self.assertEqual(raw["operating_state"], step.state.value)


if __name__ == "__main__":
    unittest.main()