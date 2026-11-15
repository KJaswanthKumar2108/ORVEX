import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from math import nan
from uuid import UUID, uuid4

from analytics.models import (
    DetectionConfidence,
    DetectionEvent,
    DetectionReason,
    DetectionStatus,
    FeatureQuality,
)
from app.db.models import EnergyWastageEvent
from app.repositories.wastage_event_repository import RepositoryPersistResult
from app.services.wastage_event_service import (
    InvalidDetectionEvent,
    PersistedDetectionEvent,
    WastageEventService,
)


class DummyRepository:
    def __init__(self) -> None:
        self.created_records: list[EnergyWastageEvent] = []

    def create_if_not_exists(self, record: EnergyWastageEvent) -> RepositoryPersistResult:
        self.created_records.append(record)
        return RepositoryPersistResult(record=record, created=True)

    def create_or_update(self, record: EnergyWastageEvent) -> RepositoryPersistResult:
        return self.create_if_not_exists(record)


def make_detection_event(
    *,
    event_id: UUID | None = None,
    machine_id: UUID | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    duration_seconds: float = 60.0,
    primary_reason: DetectionReason = DetectionReason.IDLE_WASTAGE,
    contributing_reasons: tuple[DetectionReason, ...] = (),
    peak_excess_power_kw: float | None = 25.0,
    average_excess_power_kw: float | None = 20.0,
    actual_energy_consumed_kwh: float | None = 10.0,
    estimated_wasted_energy_kwh: float | None = 2.5,
    confidence: DetectionConfidence = DetectionConfidence.HIGH,
    quality: FeatureQuality = FeatureQuality.GOOD,
    status: DetectionStatus = DetectionStatus.CANDIDATE,
    evidence: dict | None = None,
) -> DetectionEvent:
    start = start_time or datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
    end = end_time or (start + timedelta(seconds=duration_seconds))
    return DetectionEvent(
        event_id=event_id or uuid4(),
        machine_id=machine_id or uuid4(),
        start_time=start,
        end_time=end,
        duration_seconds=duration_seconds,
        primary_reason=primary_reason,
        contributing_reasons=contributing_reasons,
        peak_excess_power_kw=peak_excess_power_kw,
        average_excess_power_kw=average_excess_power_kw,
        actual_energy_consumed_kwh=actual_energy_consumed_kwh,
        estimated_wasted_energy_kwh=estimated_wasted_energy_kwh,
        confidence=confidence,
        quality=quality,
        status=status,
        evidence=evidence or {"test": True},
    )


class WastageEventServiceUnitTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repo = DummyRepository()
        self.service = WastageEventService(self.repo)

    def test_valid_idle_wastage_event_maps_correctly(self) -> None:
        event = make_detection_event(
            primary_reason=DetectionReason.IDLE_WASTAGE,
            actual_energy_consumed_kwh=12.5,
            estimated_wasted_energy_kwh=3.25,
            confidence=DetectionConfidence.HIGH,
        )
        result = self.service.persist(event)

        self.assertIsInstance(result, PersistedDetectionEvent)
        self.assertTrue(result.created)
        self.assertEqual(result.detection_event, event)

        db_record = result.database_event
        self.assertEqual(db_record.id, event.event_id)
        self.assertEqual(db_record.machine_id, event.machine_id)
        self.assertEqual(db_record.start_time, event.start_time)
        self.assertEqual(db_record.end_time, event.end_time)
        self.assertEqual(db_record.estimated_energy_kwh, Decimal("12.5000"))
        self.assertEqual(db_record.estimated_wasted_energy_kwh, Decimal("3.2500"))
        self.assertEqual(db_record.detection_reason, "IDLE_WASTAGE")
        self.assertEqual(db_record.confidence_score, 1.0)
        self.assertEqual(db_record.status, "detected")

    def test_cycling_event_preserves_none_wasted_energy(self) -> None:
        event = make_detection_event(
            primary_reason=DetectionReason.START_STOP_CYCLING,
            actual_energy_consumed_kwh=8.0,
            estimated_wasted_energy_kwh=None,
            confidence=DetectionConfidence.MEDIUM,
        )
        result = self.service.persist(event)

        self.assertIsNone(result.database_event.estimated_wasted_energy_kwh)
        self.assertEqual(result.database_event.confidence_score, 0.67)

    def test_confidence_scores_map_accurately(self) -> None:
        for conf, expected_score in (
            (DetectionConfidence.LOW, 0.33),
            (DetectionConfidence.MEDIUM, 0.67),
            (DetectionConfidence.HIGH, 1.0),
        ):
            event = make_detection_event(confidence=conf)
            result = self.service.persist(event)
            self.assertEqual(result.database_event.confidence_score, expected_score)

    def test_contributing_reasons_appended_to_detection_reason(self) -> None:
        event = make_detection_event(
            primary_reason=DetectionReason.LOW_LOAD_WASTAGE,
            contributing_reasons=(DetectionReason.ABNORMAL_POWER,),
        )
        result = self.service.persist(event)
        self.assertEqual(
            result.database_event.detection_reason,
            "LOW_LOAD_WASTAGE; contributing=ABNORMAL_POWER",
        )

    def test_naive_timestamp_rejected(self) -> None:
        naive_start = datetime(2026, 9, 26, 12, 0, 0)
        aware_end = datetime(2026, 9, 26, 12, 1, 0, tzinfo=timezone.utc)
        event = make_detection_event(start_time=naive_start, end_time=aware_end)
        with self.assertRaises(InvalidDetectionEvent):
            self.service.persist(event)

    def test_negative_duration_rejected(self) -> None:
        start = datetime(2026, 9, 26, 12, 1, 0, tzinfo=timezone.utc)
        end = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        event = make_detection_event(start_time=start, end_time=end, duration_seconds=-60.0)
        with self.assertRaises(InvalidDetectionEvent):
            self.service.persist(event)

    def test_duration_mismatch_rejected(self) -> None:
        start = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        end = start + timedelta(seconds=60.0)
        event = make_detection_event(start_time=start, end_time=end, duration_seconds=120.0)
        with self.assertRaises(InvalidDetectionEvent):
            self.service.persist(event)

    def test_wasted_energy_exceeding_actual_energy_rejected(self) -> None:
        event = make_detection_event(
            actual_energy_consumed_kwh=5.0,
            estimated_wasted_energy_kwh=10.0,
        )
        with self.assertRaises(InvalidDetectionEvent):
            self.service.persist(event)

    def test_negative_actual_energy_rejected(self) -> None:
        event = make_detection_event(actual_energy_consumed_kwh=-1.0)
        with self.assertRaises(InvalidDetectionEvent):
            self.service.persist(event)

    def test_negative_wasted_energy_rejected(self) -> None:
        event = make_detection_event(estimated_wasted_energy_kwh=-0.5)
        with self.assertRaises(InvalidDetectionEvent):
            self.service.persist(event)

    def test_non_finite_energy_rejected(self) -> None:
        event = make_detection_event(actual_energy_consumed_kwh=float("inf"))
        with self.assertRaises(InvalidDetectionEvent):
            self.service.persist(event)

        event_nan = make_detection_event(actual_energy_consumed_kwh=nan)
        with self.assertRaises(InvalidDetectionEvent):
            self.service.persist(event_nan)

    def test_persist_many_processes_all_events(self) -> None:
        events = [
            make_detection_event(primary_reason=DetectionReason.IDLE_WASTAGE),
            make_detection_event(primary_reason=DetectionReason.LOW_LOAD_WASTAGE),
        ]
        results = self.service.persist_many(events)
        self.assertEqual(len(results), 2)
        self.assertEqual(len(self.repo.created_records), 2)


if __name__ == "__main__":
    unittest.main()
