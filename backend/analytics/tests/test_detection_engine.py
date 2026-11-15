import unittest
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from analytics.config import DEFAULT_BASELINE, DetectionConfig
from analytics.detectors.detector import DetectionEngine
from analytics.models import (
    DetectionConfidence,
    DetectionReason,
    FeatureQuality,
    FeatureRecord,
    OperatingState,
)


class DetectionEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.machine_id = uuid4()
        self.start = datetime(2026, 9, 26, 12, tzinfo=timezone.utc)

    def config(
        self,
        *,
        max_gap: float = 10.0,
        idle_duration: float = 4.0,
        low_duration: float = 4.0,
        abnormal_duration: float = 4.0,
        minimum_cycles: int = 3,
        cycling_window: float = 600.0,
    ) -> DetectionConfig:
        return DetectionConfig(
            maximum_sample_gap_seconds=max_gap,
            minimum_condition_samples=2,
            minimum_idle_duration_seconds=idle_duration,
            minimum_idle_excess_power_kw=5.0,
            idle_power_ratio_threshold=1.5,
            maximum_low_load_percent=30.0,
            minimum_low_load_excess_power_kw=8.0,
            minimum_low_load_duration_seconds=low_duration,
            minimum_abnormal_excess_power_kw=10.0,
            minimum_abnormal_excess_ratio=1.25,
            minimum_abnormal_duration_seconds=abnormal_duration,
            cycling_window_seconds=cycling_window,
            minimum_cycles=minimum_cycles,
        )

    def feature(
        self,
        second: float,
        state: OperatingState,
        active_power_kw: float,
        load_percent: float,
        *,
        quality: FeatureQuality = FeatureQuality.GOOD,
        machine_id=None,
    ) -> FeatureRecord:
        expected = DEFAULT_BASELINE.expected_power_kw(state, load_percent)
        excess = max(active_power_kw - expected, 0.0) if expected is not None else None
        return FeatureRecord(
            timestamp=self.start + timedelta(seconds=second),
            machine_id=machine_id or self.machine_id,
            operating_state=state.value,
            load_percent=load_percent,
            active_power_kw=active_power_kw,
            apparent_power_kva=active_power_kw / 0.9 if active_power_kw > 0 else 0.0,
            power_factor=0.9 if active_power_kw > 0 else 0.0,
            rpm=0.0 if state is OperatingState.STOPPED else 1200.0,
            temperature_c=40.0,
            energy_increment_kwh=None,
            cumulative_energy_kwh=None,
            expected_power_kw=expected,
            excess_power_kw=excess,
            estimated_wasted_energy_kwh=None,
            idle_power_ratio=(active_power_kw / expected if state is OperatingState.IDLE and expected else None),
            power_per_load_percent=(active_power_kw / load_percent if load_percent > 0 else None),
            quality=quality,
            quality_reasons=() if quality is FeatureQuality.GOOD else ("test_partial",),
        )

    def idle_samples(self, start: float, end: float, power_kw: float = 40.0):
        return [
            self.feature(second, OperatingState.IDLE, power_kw, 8.0)
            for second in range(int(start), int(end) + 1)
        ]

    def test_normal_operation_has_no_event_for_small_excess(self) -> None:
        features = [
            self.feature(second, OperatingState.RUNNING, expected + 2.0, 60.0)
            for second in range(8)
            for expected in (DEFAULT_BASELINE.expected_power_kw(OperatingState.RUNNING, 60.0),)
        ]
        self.assertEqual(DetectionEngine(self.config()).process(features), ())

    def test_sustained_idle_power_creates_one_integrated_event(self) -> None:
        features = [
            self.feature(0, OperatingState.STOPPED, 0.0, 0.0),
            *self.idle_samples(1, 5),
        ]
        events = DetectionEngine(self.config()).process(features)
        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event.primary_reason, DetectionReason.IDLE_WASTAGE)
        self.assertIn(DetectionReason.ABNORMAL_POWER, event.contributing_reasons)
        self.assertEqual(event.start_time, self.start + timedelta(seconds=1))
        self.assertEqual(event.end_time, self.start + timedelta(seconds=5))
        self.assertEqual(event.duration_seconds, 4.0)
        self.assertAlmostEqual(event.estimated_wasted_energy_kwh, 21.5 * 4 / 3600)
        self.assertAlmostEqual(event.actual_energy_consumed_kwh, 40.0 * 4 / 3600)
        self.assertAlmostEqual(event.average_excess_power_kw, 21.5)
        self.assertEqual(event.status.value, "CANDIDATE")

    def test_brief_idle_spike_does_not_create_event(self) -> None:
        features = [
            self.feature(0, OperatingState.STOPPED, 0.0, 0.0),
            self.feature(1, OperatingState.IDLE, 40.0, 8.0),
            self.feature(2, OperatingState.STOPPED, 0.0, 0.0),
        ]
        self.assertEqual(DetectionEngine(self.config()).process(features), ())

    def test_sustained_low_load_excess_creates_candidate(self) -> None:
        features = [
            self.feature(second, OperatingState.LOW_LOAD, 50.0, 20.0)
            for second in range(6)
        ]
        events = DetectionEngine(self.config()).process(features)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].primary_reason, DetectionReason.LOW_LOAD_WASTAGE)
        self.assertIn(DetectionReason.ABNORMAL_POWER, events[0].contributing_reasons)
        self.assertAlmostEqual(events[0].estimated_wasted_energy_kwh, 25.0 * 5 / 3600)

    def test_sustained_abnormal_operating_power_creates_candidate(self) -> None:
        features = [
            self.feature(second, OperatingState.RUNNING, 80.0, 60.0)
            for second in range(6)
        ]
        events = DetectionEngine(self.config()).process(features)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].primary_reason, DetectionReason.ABNORMAL_POWER)

    def test_stopped_starting_and_fault_do_not_trigger_abnormal_rule(self) -> None:
        features = []
        for offset, state in enumerate((OperatingState.STOPPED, OperatingState.STARTING, OperatingState.FAULT)):
            features.extend(
                self.feature(offset * 6 + second, state, 100.0, 80.0)
                for second in range(5)
            )
        events = DetectionEngine(self.config()).process(features)
        self.assertEqual(events, ())

    def test_small_idle_excess_below_threshold_does_not_trigger(self) -> None:
        features = [
            self.feature(second, OperatingState.IDLE, 20.5, 8.0)
            for second in range(6)
        ]
        self.assertEqual(DetectionEngine(self.config()).process(features), ())

    def test_large_sample_gap_breaks_idle_persistence(self) -> None:
        features = [
            self.feature(0, OperatingState.IDLE, 40.0, 8.0),
            self.feature(1, OperatingState.IDLE, 40.0, 8.0),
            self.feature(20, OperatingState.IDLE, 40.0, 8.0),
            self.feature(21, OperatingState.IDLE, 40.0, 8.0),
        ]
        self.assertEqual(DetectionEngine(self.config(max_gap=5)).process(features), ())

    def test_missing_or_invalid_features_break_persistence(self) -> None:
        features = [
            self.feature(0, OperatingState.IDLE, 40.0, 8.0),
            self.feature(1, OperatingState.IDLE, 40.0, 8.0),
            self.feature(2, OperatingState.IDLE, 40.0, 8.0, quality=FeatureQuality.INVALID),
            self.feature(3, OperatingState.IDLE, 40.0, 8.0),
            self.feature(4, OperatingState.IDLE, 40.0, 8.0),
        ]
        self.assertEqual(DetectionEngine(self.config()).process(features), ())

    def test_naive_feature_timestamps_break_persistence(self) -> None:
        first = self.feature(0, OperatingState.IDLE, 40.0, 8.0)
        naive = self.feature(1, OperatingState.IDLE, 40.0, 8.0)
        object.__setattr__(naive, "timestamp", naive.timestamp.replace(tzinfo=None))
        last = self.feature(2, OperatingState.IDLE, 40.0, 8.0)
        self.assertEqual(DetectionEngine(self.config()).process([first, naive, last]), ())

    def test_irregular_intervals_integrate_excess_by_observed_time(self) -> None:
        features = [
            self.feature(0, OperatingState.STOPPED, 0.0, 0.0),
            self.feature(1, OperatingState.IDLE, 28.5, 8.0),
            self.feature(2, OperatingState.IDLE, 28.5, 8.0),
            self.feature(4, OperatingState.IDLE, 28.5, 8.0),
            self.feature(5, OperatingState.IDLE, 28.5, 8.0),
        ]
        event = DetectionEngine(self.config()).process(features)[0]
        self.assertAlmostEqual(event.estimated_wasted_energy_kwh, 10.0 * 4 / 3600)

    def test_energy_quantification_known_hour_and_half_hour_examples(self) -> None:
        hour_config = self.config(max_gap=4000, idle_duration=3600)
        hour_event = DetectionEngine(hour_config).process(
            [
                self.feature(0, OperatingState.IDLE, 28.5, 8.0),
                self.feature(3600, OperatingState.IDLE, 28.5, 8.0),
            ]
        )[0]
        self.assertAlmostEqual(hour_event.estimated_wasted_energy_kwh, 10.0)

        half_hour_config = self.config(max_gap=2000, idle_duration=1800)
        half_hour_event = DetectionEngine(half_hour_config).process(
            [
                self.feature(0, OperatingState.IDLE, 23.5, 8.0),
                self.feature(1800, OperatingState.IDLE, 23.5, 8.0),
            ]
        )[0]
        self.assertAlmostEqual(half_hour_event.estimated_wasted_energy_kwh, 2.5)

    def test_cycle_pattern_produces_candidate_not_wasted_energy(self) -> None:
        states = (
            OperatingState.STOPPED,
            OperatingState.STARTING,
            OperatingState.RUNNING,
            OperatingState.STOPPED,
            OperatingState.STARTING,
            OperatingState.RUNNING,
            OperatingState.STOPPED,
            OperatingState.STARTING,
            OperatingState.RUNNING,
        )
        features = [
            self.feature(index, state, 20.0 if state is not OperatingState.STOPPED else 0.0, 10.0)
            for index, state in enumerate(states)
        ]
        events = DetectionEngine(self.config()).process(features)
        cycling = [event for event in events if event.primary_reason is DetectionReason.START_STOP_CYCLING]
        self.assertEqual(len(cycling), 1)
        self.assertEqual(cycling[0].start_time, self.start)
        self.assertEqual(cycling[0].duration_seconds, 8.0)
        self.assertIsNotNone(cycling[0].actual_energy_consumed_kwh)
        self.assertIsNone(cycling[0].estimated_wasted_energy_kwh)
        self.assertEqual(cycling[0].evidence["rules"]["START_STOP_CYCLING"]["cycle_count"], 3)

    def test_fewer_than_minimum_cycles_do_not_create_candidate(self) -> None:
        states = (
            OperatingState.STOPPED,
            OperatingState.STARTING,
            OperatingState.RUNNING,
            OperatingState.STOPPED,
            OperatingState.STARTING,
            OperatingState.RUNNING,
        )
        features = [
            self.feature(index, state, 20.0, 10.0)
            for index, state in enumerate(states)
        ]
        self.assertEqual(DetectionEngine(self.config()).process(features), ())

    def test_overlapping_rules_merge_to_one_event_with_contributors(self) -> None:
        features = [
            self.feature(second, OperatingState.LOW_LOAD, 50.0, 20.0)
            for second in range(6)
        ]
        events = DetectionEngine(self.config()).process(features)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].primary_reason, DetectionReason.LOW_LOAD_WASTAGE)
        self.assertEqual(events[0].contributing_reasons, (DetectionReason.ABNORMAL_POWER,))

    def test_confidence_is_deterministic_and_event_id_stable(self) -> None:
        features = [
            self.feature(second, OperatingState.IDLE, 50.0, 8.0)
            for second in range(7)
        ]
        config = self.config(idle_duration=2)
        first = DetectionEngine(config).process(features)[0]
        second = DetectionEngine(config).process(features)[0]
        self.assertEqual(first.confidence, DetectionConfidence.HIGH)
        self.assertEqual(first.event_id, second.event_id)

    def test_partial_quality_lowers_confidence(self) -> None:
        features = [
            self.feature(
                second,
                OperatingState.IDLE,
                50.0,
                8.0,
                quality=FeatureQuality.PARTIAL if second == 3 else FeatureQuality.GOOD,
            )
            for second in range(7)
        ]
        event = DetectionEngine(self.config(idle_duration=2)).process(features)[0]
        self.assertEqual(event.quality, FeatureQuality.PARTIAL)
        self.assertEqual(event.confidence, DetectionConfidence.LOW)

    def test_events_are_separate_by_machine(self) -> None:
        other_machine = uuid4()
        features = [
            self.feature(second, OperatingState.IDLE, 40.0, 8.0, machine_id=machine_id)
            for machine_id in (self.machine_id, other_machine)
            for second in range(5)
        ]
        events = DetectionEngine(self.config()).process(features)
        self.assertEqual(len(events), 2)
        self.assertEqual({event.machine_id for event in events}, {self.machine_id, other_machine})


if __name__ == "__main__":
    unittest.main()