import math
import unittest
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from urllib.error import HTTPError
from unittest.mock import patch

from simulator.client import TelemetryApiClient, TelemetryClientError
from simulator.generator import TelemetryGenerator
from simulator.models import OperatingState, Scenario
from simulator.profiles import DEFAULT_PROFILE
from simulator.scenarios import ScenarioController


class TelemetryGeneratorTests(unittest.TestCase):
    def make_generator(self, seed: int = 21) -> TelemetryGenerator:
        return TelemetryGenerator(interval_seconds=1.0, seed=seed)

    def test_stopped_has_approximately_zero_power(self) -> None:
        sample = self.make_generator().generate(OperatingState.STOPPED)
        self.assertEqual(sample.active_power, 0.0)
        self.assertEqual(sample.current, 0.0)
        self.assertEqual(sample.rpm, 0.0)

    def test_running_has_positive_power(self) -> None:
        sample = self.make_generator().generate(OperatingState.RUNNING)
        self.assertGreater(sample.active_power, 0.0)

    def test_higher_load_generally_produces_higher_power(self) -> None:
        low_generator = self.make_generator()
        high_generator = self.make_generator()
        start = datetime(2026, 9, 26, tzinfo=timezone.utc)
        low_samples = [
            low_generator.generate(OperatingState.LOW_LOAD, timestamp=start + timedelta(seconds=index))
            for index in range(20)
        ]
        high_samples = [
            high_generator.generate(OperatingState.HIGH_LOAD, timestamp=start + timedelta(seconds=index))
            for index in range(20)
        ]
        low_average = sum(sample.active_power for sample in low_samples) / len(low_samples)
        high_average = sum(sample.active_power for sample in high_samples) / len(high_samples)
        self.assertGreater(high_average, low_average)

    def test_idle_consumes_nonzero_power(self) -> None:
        sample = self.make_generator().generate(OperatingState.IDLE)
        self.assertGreater(sample.active_power, 0.0)

    def test_idle_wastage_scenario_exceeds_normal_idle_power(self) -> None:
        controller = ScenarioController(Scenario.IDLE_WASTAGE, DEFAULT_PROFILE)
        step = controller.step_at(DEFAULT_PROFILE.starting_duration_seconds + 1.0)
        normal_idle = self.make_generator().generate(OperatingState.IDLE)
        wasted_idle = self.make_generator().generate(
            step.state,
            power_multiplier=step.power_multiplier,
            state_elapsed_seconds=step.state_elapsed_seconds,
        )
        self.assertEqual(step.state, OperatingState.IDLE)
        self.assertGreater(wasted_idle.active_power, normal_idle.active_power)

    def test_low_load_wastage_has_excess_power_at_low_load(self) -> None:
        controller = ScenarioController(Scenario.LOW_LOAD_WASTAGE, DEFAULT_PROFILE)
        step = controller.step_at(DEFAULT_PROFILE.starting_duration_seconds + 1.0)
        baseline = self.make_generator().generate(OperatingState.LOW_LOAD, load_fraction=0.25)
        wastage = self.make_generator().generate(
            step.state,
            load_fraction=step.load_fraction,
            power_multiplier=step.power_multiplier,
            state_elapsed_seconds=step.state_elapsed_seconds,
        )
        self.assertEqual(step.state, OperatingState.LOW_LOAD)
        self.assertLess(wastage.load_percent, 35.0)
        self.assertGreater(wastage.active_power, baseline.active_power)

    def test_abnormal_power_scenario_increases_power_at_fixed_load(self) -> None:
        controller = ScenarioController(Scenario.ABNORMAL_POWER, DEFAULT_PROFILE)
        step = controller.step_at(DEFAULT_PROFILE.starting_duration_seconds + 1.0)
        baseline = self.make_generator().generate(OperatingState.RUNNING, load_fraction=0.62)
        abnormal = self.make_generator().generate(
            step.state,
            load_fraction=step.load_fraction,
            power_multiplier=step.power_multiplier,
            state_elapsed_seconds=step.state_elapsed_seconds,
        )
        self.assertAlmostEqual(abnormal.load_percent, baseline.load_percent)
        self.assertGreater(abnormal.active_power, baseline.active_power)

    def test_start_stop_cycling_repeats_expected_states(self) -> None:
        controller = ScenarioController(Scenario.START_STOP_CYCLING, DEFAULT_PROFILE)
        startup = DEFAULT_PROFILE.starting_duration_seconds
        self.assertEqual(controller.step_at(0).state, OperatingState.STARTING)
        self.assertEqual(controller.step_at(startup + 1).state, OperatingState.RUNNING)
        self.assertEqual(controller.step_at(startup + 9).state, OperatingState.STOPPED)
        self.assertEqual(controller.step_at(startup + 19).state, OperatingState.STARTING)

    def test_cumulative_energy_increases_by_power_over_time(self) -> None:
        generator = self.make_generator()
        timestamp = datetime(2026, 9, 26, tzinfo=timezone.utc)
        first = generator.generate(OperatingState.RUNNING, timestamp=timestamp)
        second = generator.generate(OperatingState.RUNNING, timestamp=timestamp + timedelta(seconds=1))
        self.assertGreater(second.cumulative_energy, first.cumulative_energy)
        self.assertAlmostEqual(
            second.cumulative_energy - first.cumulative_energy,
            second.active_power / 3600.0,
            places=8,
        )

    def test_generated_timestamps_are_utc_aware(self) -> None:
        sample = self.make_generator().generate(OperatingState.RUNNING)
        self.assertIsNotNone(sample.timestamp.tzinfo)
        self.assertEqual(sample.timestamp.utcoffset(), timedelta(0))

    def test_load_and_power_factor_stay_in_bounds_for_every_state(self) -> None:
        generator = self.make_generator()
        start = datetime(2026, 9, 26, tzinfo=timezone.utc)
        for index, state in enumerate(OperatingState):
            sample = generator.generate(state, timestamp=start + timedelta(seconds=index))
            self.assertGreaterEqual(sample.load_percent, 0.0)
            self.assertLessEqual(sample.load_percent, 100.0)
            self.assertGreaterEqual(sample.power_factor, -1.0)
            self.assertLessEqual(sample.power_factor, 1.0)

    def test_all_measurements_are_finite_and_nonnegative_when_required(self) -> None:
        generator = self.make_generator()
        start = datetime(2026, 9, 26, tzinfo=timezone.utc)
        for index, state in enumerate(OperatingState):
            sample = generator.generate(state, timestamp=start + timedelta(seconds=index))
            for value in (
                sample.voltage,
                sample.current,
                sample.active_power,
                sample.reactive_power,
                sample.apparent_power,
                sample.power_factor,
                sample.cumulative_energy,
                sample.rpm,
                sample.temperature,
                sample.load_percent,
            ):
                self.assertTrue(math.isfinite(value))
            self.assertGreaterEqual(sample.voltage, 0.0)
            self.assertGreaterEqual(sample.current, 0.0)
            self.assertGreaterEqual(sample.temperature, 0.0)

    def test_serialized_payload_matches_canonical_api_fields(self) -> None:
        sample = self.make_generator().generate(OperatingState.RUNNING)
        self.assertEqual(
            set(sample.to_payload()),
            {
                "timestamp", "machine_id", "sensor_id", "voltage", "current",
                "active_power", "reactive_power", "apparent_power", "power_factor",
                "cumulative_energy", "rpm", "temperature", "load_percent", "operating_state",
            },
        )
        self.assertEqual(sample.to_payload()["operating_state"], "RUNNING")


class TelemetryClientTests(unittest.TestCase):
    def test_client_posts_canonical_payload_and_accepts_http_201(self) -> None:
        received: list[dict[str, object]] = []

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                import json

                body = self.rfile.read(int(self.headers["Content-Length"]))
                received.append(json.loads(body))
                self.send_response(201)
                self.end_headers()

            def log_message(self, _format: str, *_args: object) -> None:
                return

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            record = TelemetryGenerator(seed=4).generate(OperatingState.RUNNING)
            client = TelemetryApiClient(
                f"http://127.0.0.1:{server.server_port}", retries=0
            )
            client.send(record)
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()

        self.assertEqual(len(received), 1)
        self.assertEqual(set(received[0]), set(record.to_payload()))

    def test_client_rejects_non_success_response(self) -> None:
        record = TelemetryGenerator(seed=4).generate(OperatingState.RUNNING)
        client = TelemetryApiClient("http://127.0.0.1:1", retries=0)
        error = HTTPError("http://127.0.0.1:1", 422, "invalid", {}, None)
        with patch.object(client._opener, "open", side_effect=error):
            with self.assertRaises(TelemetryClientError):
                client.send(record)


if __name__ == "__main__":
    unittest.main()