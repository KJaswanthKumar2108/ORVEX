import os
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from analytics.models import (
    DetectionConfidence,
    DetectionEvent,
    DetectionReason,
    DetectionStatus,
    FeatureQuality,
)
from app.core.config import get_settings
from app.db.models import EnergyWastageEvent, Machine, Site
from app.db.session import create_database_engine, create_session_factory
from app.repositories.wastage_event_repository import (
    WastageEventIdentityConflict,
    WastageEventPersistenceError,
    WastageEventRepository,
)
from app.services.wastage_event_service import (
    PersistedDetectionEvent,
    WastageEventService,
)


def make_event(
    machine_id: UUID,
    *,
    event_id: UUID | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    duration_seconds: float = 60.0,
    primary_reason: DetectionReason = DetectionReason.IDLE_WASTAGE,
    contributing_reasons: tuple[DetectionReason, ...] = (),
    actual_energy_consumed_kwh: float = 10.0,
    estimated_wasted_energy_kwh: float | None = 2.5,
    confidence: DetectionConfidence = DetectionConfidence.HIGH,
) -> DetectionEvent:
    start = start_time or datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
    end = end_time or (start + timedelta(seconds=duration_seconds))
    return DetectionEvent(
        event_id=event_id or uuid4(),
        machine_id=machine_id,
        start_time=start,
        end_time=end,
        duration_seconds=duration_seconds,
        primary_reason=primary_reason,
        contributing_reasons=contributing_reasons,
        peak_excess_power_kw=25.0,
        average_excess_power_kw=20.0,
        actual_energy_consumed_kwh=actual_energy_consumed_kwh,
        estimated_wasted_energy_kwh=estimated_wasted_energy_kwh,
        confidence=confidence,
        quality=FeatureQuality.GOOD,
        status=DetectionStatus.CANDIDATE,
        evidence={"test": True},
    )


class WastageEventPersistenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        db_url = get_settings().database_url
        if not db_url:
            raise unittest.SkipTest("DATABASE_URL is not set; skipping database persistence tests")
        try:
            cls.engine = create_database_engine(db_url)
            cls.session_factory = create_session_factory(cls.engine)
            with cls.engine.connect() as conn:
                pass
        except Exception as exc:
            raise unittest.SkipTest(f"Database connection failed: {exc}")

    @classmethod
    def tearDownClass(cls) -> None:
        if hasattr(cls, "engine"):
            cls.engine.dispose()

    def setUp(self) -> None:
        self.session: Session = self.session_factory()
        self.site_ids: list[UUID] = []
        self.machine_ids: list[UUID] = []

        # Create temporary site and machine for test
        self.site = Site(name=f"Test-Site-{uuid4().hex[:8]}", timezone="UTC")
        self.session.add(self.site)
        self.session.flush()
        self.site_ids.append(self.site.id)

        self.machine = Machine(
            site_id=self.site.id,
            machine_identifier=f"M-{uuid4().hex[:8]}",
            name="Persistence Test Machine",
            machine_type="conveyor",
            status="active",
        )
        self.session.add(self.machine)
        self.session.flush()
        self.machine_ids.append(self.machine.id)
        self.session.commit()

        self.repo = WastageEventRepository(self.session)
        self.service = WastageEventService(self.repo)

    def tearDown(self) -> None:
        self.session.rollback()
        # Clean up all created test data completely
        with self.engine.begin() as conn:
            if self.machine_ids:
                conn.exec_driver_sql(
                    "DELETE FROM energy_wastage_events WHERE machine_id = ANY(%(ids)s)",
                    {"ids": self.machine_ids},
                )
                conn.exec_driver_sql(
                    "DELETE FROM machines WHERE id = ANY(%(ids)s)",
                    {"ids": self.machine_ids},
                )
            if self.site_ids:
                conn.exec_driver_sql(
                    "DELETE FROM sites WHERE id = ANY(%(ids)s)",
                    {"ids": self.site_ids},
                )
        self.session.close()

    def test_basic_persistence_idle_wastage(self) -> None:
        event = make_event(
            self.machine.id,
            primary_reason=DetectionReason.IDLE_WASTAGE,
            actual_energy_consumed_kwh=10.0,
            estimated_wasted_energy_kwh=3.5,
            confidence=DetectionConfidence.HIGH,
        )

        persisted = self.service.persist(event)

        self.assertTrue(persisted.created)
        self.assertEqual(persisted.database_event.id, event.event_id)

        # Query database row directly
        row = self.session.scalar(
            select(EnergyWastageEvent).where(EnergyWastageEvent.id == event.event_id)
        )
        self.assertIsNotNone(row)
        self.assertEqual(row.machine_id, self.machine.id)
        self.assertEqual(row.start_time, event.start_time)
        self.assertEqual(row.end_time, event.end_time)
        self.assertAlmostEqual(row.duration_seconds, 60.0, places=2)
        self.assertEqual(row.detection_reason, "IDLE_WASTAGE")
        self.assertEqual(row.estimated_energy_kwh, Decimal("10.0000"))
        self.assertEqual(row.estimated_wasted_energy_kwh, Decimal("3.5000"))
        self.assertEqual(row.confidence_score, 1.0)
        self.assertEqual(row.status, "detected")

    def test_different_detection_reasons(self) -> None:
        reasons_data = [
            (DetectionReason.IDLE_WASTAGE, 12.0, 4.0),
            (DetectionReason.LOW_LOAD_WASTAGE, 15.0, 5.0),
            (DetectionReason.ABNORMAL_POWER, 20.0, 8.0),
            (DetectionReason.START_STOP_CYCLING, 8.0, None),
        ]

        for idx, (reason, actual_kwh, wasted_kwh) in enumerate(reasons_data):
            start = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc) + timedelta(minutes=10 * idx)
            event = make_event(
                self.machine.id,
                start_time=start,
                primary_reason=reason,
                actual_energy_consumed_kwh=actual_kwh,
                estimated_wasted_energy_kwh=wasted_kwh,
            )
            persisted = self.service.persist(event)
            self.assertTrue(persisted.created)
            self.assertEqual(persisted.database_event.detection_reason, reason.value)

            row = self.session.scalar(
                select(EnergyWastageEvent).where(EnergyWastageEvent.id == event.event_id)
            )
            self.assertIsNotNone(row)
            if wasted_kwh is None:
                self.assertIsNone(row.estimated_wasted_energy_kwh)
            else:
                self.assertEqual(row.estimated_wasted_energy_kwh, Decimal(f"{wasted_kwh:.4f}"))

    def test_cycling_candidate_has_null_wasted_energy(self) -> None:
        event = make_event(
            self.machine.id,
            primary_reason=DetectionReason.START_STOP_CYCLING,
            actual_energy_consumed_kwh=6.0,
            estimated_wasted_energy_kwh=None,
        )

        persisted = self.service.persist(event)
        self.assertTrue(persisted.created)

        row = self.session.scalar(
            select(EnergyWastageEvent).where(EnergyWastageEvent.id == event.event_id)
        )
        self.assertIsNotNone(row)
        # Ensure it is strictly None, and NOT 0 or 0.0000
        self.assertIsNone(row.estimated_wasted_energy_kwh)
        self.assertNotEqual(row.estimated_wasted_energy_kwh, Decimal("0.0000"))
        self.assertNotEqual(row.estimated_wasted_energy_kwh, 0)

    def test_idempotency_duplicate_submission(self) -> None:
        event = make_event(
            self.machine.id,
            primary_reason=DetectionReason.IDLE_WASTAGE,
            actual_energy_consumed_kwh=10.0,
            estimated_wasted_energy_kwh=3.0,
        )

        # First persist: created = True
        first_result = self.service.persist(event)
        self.assertTrue(first_result.created)

        # Second persist with same event: created = False, same database ID
        second_result = self.service.persist(event)
        self.assertFalse(second_result.created)
        self.assertEqual(first_result.database_event.id, second_result.database_event.id)

        # Verify only 1 row exists in the database
        count = self.session.scalar(
            select(func.count()).select_from(EnergyWastageEvent).where(
                EnergyWastageEvent.id == event.event_id
            )
        )
        self.assertEqual(count, 1)

    def test_idempotency_conflict_raises_error(self) -> None:
        shared_id = uuid4()
        event1 = make_event(
            self.machine.id,
            event_id=shared_id,
            primary_reason=DetectionReason.IDLE_WASTAGE,
        )
        self.service.persist(event1)

        # Event with same ID but different detection reason
        event2 = make_event(
            self.machine.id,
            event_id=shared_id,
            primary_reason=DetectionReason.LOW_LOAD_WASTAGE,
        )
        with self.assertRaises(WastageEventIdentityConflict):
            self.service.persist(event2)

    def test_multiple_distinct_events_same_machine(self) -> None:
        event1 = make_event(
            self.machine.id,
            start_time=datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc),
            primary_reason=DetectionReason.IDLE_WASTAGE,
        )
        event2 = make_event(
            self.machine.id,
            start_time=datetime(2026, 9, 26, 13, 0, 0, tzinfo=timezone.utc),
            primary_reason=DetectionReason.LOW_LOAD_WASTAGE,
        )

        res1 = self.service.persist(event1)
        res2 = self.service.persist(event2)

        self.assertTrue(res1.created)
        self.assertTrue(res2.created)

        count = self.session.scalar(
            select(func.count()).select_from(EnergyWastageEvent).where(
                EnergyWastageEvent.machine_id == self.machine.id
            )
        )
        self.assertEqual(count, 2)

    def test_multiple_machines_events(self) -> None:
        # Create a second machine
        machine2 = Machine(
            site_id=self.site.id,
            machine_identifier=f"M2-{uuid4().hex[:8]}",
            name="Second Machine",
            machine_type="fan",
            status="active",
        )
        self.session.add(machine2)
        self.session.commit()
        self.machine_ids.append(machine2.id)

        event1 = make_event(self.machine.id, primary_reason=DetectionReason.IDLE_WASTAGE)
        event2 = make_event(machine2.id, primary_reason=DetectionReason.ABNORMAL_POWER)

        self.service.persist(event1)
        self.service.persist(event2)

        row1 = self.session.scalar(
            select(EnergyWastageEvent).where(EnergyWastageEvent.id == event1.event_id)
        )
        row2 = self.session.scalar(
            select(EnergyWastageEvent).where(EnergyWastageEvent.id == event2.event_id)
        )

        self.assertEqual(row1.machine_id, self.machine.id)
        self.assertEqual(row2.machine_id, machine2.id)

    def test_transaction_failure_rollback_and_session_recovery(self) -> None:
        non_existent_machine_id = uuid4()
        bad_event = make_event(
            non_existent_machine_id,
            primary_reason=DetectionReason.IDLE_WASTAGE,
        )

        with self.assertRaises(WastageEventPersistenceError):
            self.service.persist(bad_event)

        # Verify no event row was left behind
        row = self.session.scalar(
            select(EnergyWastageEvent).where(EnergyWastageEvent.id == bad_event.event_id)
        )
        self.assertIsNone(row)

        # Verify the session remains usable after rollback
        good_event = make_event(self.machine.id, primary_reason=DetectionReason.IDLE_WASTAGE)
        persisted = self.service.persist(good_event)
        self.assertTrue(persisted.created)

    def test_ongoing_episode_extension_updates_in_place_without_duplicate_row(self) -> None:
        t0 = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        t1 = t0 + timedelta(seconds=60)
        t2 = t0 + timedelta(seconds=120)

        # Initial event candidate at t1
        event1 = make_event(
            self.machine.id,
            start_time=t0,
            end_time=t1,
            duration_seconds=60.0,
            primary_reason=DetectionReason.IDLE_WASTAGE,
            actual_energy_consumed_kwh=10.0,
            estimated_wasted_energy_kwh=2.5,
        )
        res1 = self.service.persist(event1)
        self.assertTrue(res1.created)

        # Extended event candidate at t2 (ongoing event extends duration and wasted energy)
        event2 = make_event(
            self.machine.id,
            start_time=t0,
            end_time=t2,
            duration_seconds=120.0,
            primary_reason=DetectionReason.IDLE_WASTAGE,
            actual_energy_consumed_kwh=20.0,
            estimated_wasted_energy_kwh=5.0,
        )
        res2 = self.service.persist(event2)
        self.assertFalse(res2.created)

        # Verify only 1 row exists in database and its end_time and energy were extended in place
        rows = self.session.scalars(
            select(EnergyWastageEvent).where(EnergyWastageEvent.machine_id == self.machine.id)
        ).all()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].end_time, t2)
        self.assertEqual(rows[0].estimated_wasted_energy_kwh, Decimal("5.0000"))

    def test_shorter_window_does_not_overwrite_longer_window(self) -> None:
        t0 = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        t1 = t0 + timedelta(seconds=60)
        t2 = t0 + timedelta(seconds=120)

        # First persist longer window ending at t2
        event2 = make_event(
            self.machine.id,
            start_time=t0,
            end_time=t2,
            duration_seconds=120.0,
            primary_reason=DetectionReason.IDLE_WASTAGE,
            actual_energy_consumed_kwh=20.0,
            estimated_wasted_energy_kwh=5.0,
        )
        res1 = self.service.persist(event2)
        self.assertTrue(res1.created)

        # Then reprocess or receive shorter window ending at t1
        event1 = make_event(
            self.machine.id,
            start_time=t0,
            end_time=t1,
            duration_seconds=60.0,
            primary_reason=DetectionReason.IDLE_WASTAGE,
            actual_energy_consumed_kwh=10.0,
            estimated_wasted_energy_kwh=2.5,
        )
        res2 = self.service.persist(event1)
        self.assertFalse(res2.created)

        # Confirm the database row retains the longer window t2
        row = self.session.scalar(
            select(EnergyWastageEvent).where(EnergyWastageEvent.machine_id == self.machine.id)
        )
        self.assertEqual(row.end_time, t2)
        self.assertEqual(row.estimated_wasted_energy_kwh, Decimal("5.0000"))


if __name__ == "__main__":
    unittest.main()
