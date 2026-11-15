import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import UUID, uuid4

from analytics.config import DetectionConfig
from analytics.detectors.detector import DetectionEngine
from analytics.models import (
    DetectionConfidence,
    DetectionEvent,
    DetectionReason,
    DetectionStatus,
    FeatureQuality,
    OperatingState,
)
from analytics.services.feature_engine import FeatureEngine
from app.db.models import EnergyWastageEvent, Telemetry
from app.repositories.wastage_event_repository import (
    RepositoryPersistResult,
    WastageEventPersistenceError,
)
from app.services.analytics_orchestrator import (
    AnalyticsOrchestrator,
    OrchestrationError,
    OrchestrationResult,
    telemetry_row_to_input,
)
from app.services.wastage_event_service import (
    PersistedDetectionEvent,
    WastageEventService,
)


def make_telemetry_row(
    machine_id: UUID,
    timestamp: datetime,
    *,
    operating_state: str = "idle",
    active_power: float | None = 25.0,
    voltage: float | None = 400.0,
    current: float | None = 36.0,
    load_percentage: float | None = 10.0,
    power_factor: float | None = 0.85,
    cumulative_energy: float | None = 100.0,
    rpm: float | None = 0.0,
    temperature: float | None = 45.0,
    reactive_power: float | None = 5.0,
    apparent_power: float | None = 25.5,
) -> Telemetry:
    row = Telemetry(
        id=uuid4(),
        machine_id=machine_id,
        timestamp=timestamp,
        sensor_id=uuid4(),
        operating_state=operating_state,
        active_power=active_power,
        voltage=voltage,
        current=current,
        load_percentage=load_percentage,
        power_factor=power_factor,
        cumulative_energy=cumulative_energy,
        rpm=rpm,
        temperature=temperature,
        reactive_power=reactive_power,
        apparent_power=apparent_power,
    )
    return row


def make_detection_event(
    machine_id: UUID,
    start_time: datetime,
    end_time: datetime,
    *,
    reason: DetectionReason = DetectionReason.IDLE_WASTAGE,
    estimated_wasted_energy_kwh: float = 2.5,
) -> DetectionEvent:
    duration = (end_time - start_time).total_seconds()
    return DetectionEvent(
        event_id=uuid4(),
        machine_id=machine_id,
        start_time=start_time,
        end_time=end_time,
        duration_seconds=duration,
        primary_reason=reason,
        contributing_reasons=(),
        peak_excess_power_kw=15.0,
        average_excess_power_kw=10.0,
        actual_energy_consumed_kwh=5.0,
        estimated_wasted_energy_kwh=estimated_wasted_energy_kwh,
        confidence=DetectionConfidence.HIGH,
        quality=FeatureQuality.GOOD,
        status=DetectionStatus.CANDIDATE,
        evidence={"sample_count": 10},
    )


class DummyPersistenceService:
    def __init__(self) -> None:
        self.persisted_records: list[DetectionEvent] = []
        self.should_fail = False

    def persist_many(
        self, events: tuple[DetectionEvent, ...]
    ) -> tuple[PersistedDetectionEvent, ...]:
        if self.should_fail:
            raise WastageEventPersistenceError("Simulated persistence failure")
        results = []
        for event in events:
            self.persisted_records.append(event)
            db_row = EnergyWastageEvent(
                id=event.event_id,
                machine_id=event.machine_id,
                start_time=event.start_time,
                end_time=event.end_time,
                estimated_energy_kwh=Decimal("5.0"),
                estimated_wasted_energy_kwh=Decimal(str(event.estimated_wasted_energy_kwh)),
                detection_reason=event.primary_reason.value,
                confidence_score=0.9,
                status="detected",
            )
            results.append(
                PersistedDetectionEvent(
                    detection_event=event,
                    database_event=db_row,
                    created=True,
                )
            )
        return tuple(results)


class AnalyticsOrchestratorUnitTests(unittest.TestCase):
    def setUp(self) -> None:
        self.machine_id = uuid4()
        self.session = MagicMock()
        self.persistence = DummyPersistenceService()
        self.orchestrator = AnalyticsOrchestrator(
            session=self.session,
            persistence_service=self.persistence,
            history_window_seconds=900.0,
        )

    def test_empty_history_returns_safe_zero_result(self) -> None:
        self.session.scalar.return_value = None
        result = self.orchestrator.process_machine(self.machine_id)

        self.assertTrue(result.success)
        self.assertEqual(result.telemetry_count, 0)
        self.assertEqual(result.features_count, 0)
        self.assertEqual(result.candidates_count, 0)
        self.assertEqual(result.finalized_count, 0)
        self.assertEqual(len(result.persisted_events), 0)

    def test_missing_optional_measurements_mapping(self) -> None:
        ts = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        sparse_row = Telemetry(
            id=uuid4(),
            machine_id=self.machine_id,
            timestamp=ts,
            sensor_id=None,
            operating_state=None,
            active_power=None,
            voltage=None,
            current=None,
            load_percentage=None,
            power_factor=None,
            cumulative_energy=None,
            rpm=None,
            temperature=None,
            reactive_power=None,
            apparent_power=None,
        )
        input_data = telemetry_row_to_input(sparse_row)
        self.assertEqual(input_data.machine_id, self.machine_id)
        self.assertEqual(input_data.timestamp, ts)
        self.assertIsNone(input_data.active_power)
        self.assertIsNone(input_data.operating_state)

        # FeatureEngine should process sparse input safely without crashing
        engine = FeatureEngine()
        feature = engine.process(input_data)
        self.assertEqual(feature.machine_id, self.machine_id)
        self.assertEqual(feature.quality, FeatureQuality.PARTIAL)

    def test_valid_telemetry_history_processed_and_finalized(self) -> None:
        start = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        # Create 70 consecutive idle samples (60s minimum idle duration satisfied)
        rows = [
            make_telemetry_row(
                self.machine_id,
                start + timedelta(seconds=i),
                operating_state="idle",
                active_power=25.0,
            )
            for i in range(70)
        ]
        # Add 1 subsequent running sample to finalize the idle wastage event
        rows.append(
            make_telemetry_row(
                self.machine_id,
                start + timedelta(seconds=70),
                operating_state="running",
                active_power=50.0,
            )
        )

        self.session.scalar.return_value = rows[-1].timestamp
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = rows
        self.session.scalars.return_value = scalars_mock

        result = self.orchestrator.process_machine(self.machine_id)

        self.assertTrue(result.success)
        self.assertEqual(result.telemetry_count, 71)
        self.assertGreater(result.features_count, 0)
        self.assertGreaterEqual(result.candidates_count, 1)
        self.assertEqual(result.finalized_count, 1)
        self.assertEqual(len(result.persisted_events), 1)
        self.assertEqual(len(self.persistence.persisted_records), 1)
        self.assertEqual(
            self.persistence.persisted_records[0].primary_reason,
            DetectionReason.IDLE_WASTAGE,
        )

    def test_developing_event_is_not_prematurely_finalized(self) -> None:
        start = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        # 65 idle samples where the latest sample is still idle (event actively developing)
        rows = [
            make_telemetry_row(
                self.machine_id,
                start + timedelta(seconds=i),
                operating_state="idle",
                active_power=25.0,
            )
            for i in range(65)
        ]

        self.session.scalar.return_value = rows[-1].timestamp
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = rows
        self.session.scalars.return_value = scalars_mock

        result = self.orchestrator.process_machine(self.machine_id)

        self.assertTrue(result.success)
        self.assertEqual(result.telemetry_count, 65)
        self.assertGreaterEqual(result.candidates_count, 1)
        # Because candidate.end_time == latest_time and machine is still idle, not finalized yet
        self.assertEqual(result.finalized_count, 0)
        self.assertEqual(len(result.persisted_events), 0)

    def test_flush_machine_finalizes_developing_events(self) -> None:
        start = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        rows = [
            make_telemetry_row(
                self.machine_id,
                start + timedelta(seconds=i),
                operating_state="idle",
                active_power=25.0,
            )
            for i in range(65)
        ]

        self.session.scalar.return_value = rows[-1].timestamp
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = rows
        self.session.scalars.return_value = scalars_mock

        result = self.orchestrator.flush_machine(self.machine_id)

        self.assertTrue(result.success)
        self.assertGreaterEqual(result.candidates_count, 1)
        self.assertEqual(result.finalized_count, 1)
        self.assertEqual(len(result.persisted_events), 1)

    def test_machine_stopped_finalizes_developing_event(self) -> None:
        start = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        rows = [
            make_telemetry_row(
                self.machine_id,
                start + timedelta(seconds=i),
                operating_state="idle",
                active_power=25.0,
            )
            for i in range(65)
        ]
        # Append stopped sample at end
        rows.append(
            make_telemetry_row(
                self.machine_id,
                start + timedelta(seconds=65),
                operating_state="stopped",
                active_power=0.0,
            )
        )

        self.session.scalar.return_value = rows[-1].timestamp
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = rows
        self.session.scalars.return_value = scalars_mock

        result = self.orchestrator.process_machine(self.machine_id)

        self.assertTrue(result.success)
        self.assertGreaterEqual(result.finalized_count, 1)
        self.assertEqual(len(result.persisted_events), 1)

    def test_database_retrieval_failure_surfaced(self) -> None:
        self.session.scalar.side_effect = RuntimeError("DB connection dropped")

        # Without raise_on_error
        result = self.orchestrator.process_machine(self.machine_id, raise_on_error=False)
        self.assertFalse(result.success)
        self.assertIn("DB connection dropped", result.error or "")
        self.session.rollback.assert_called()

        # With raise_on_error
        with self.assertRaises(OrchestrationError):
            self.orchestrator.process_machine(self.machine_id, raise_on_error=True)

    def test_detection_failure_surfaced(self) -> None:
        start = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        rows = [make_telemetry_row(self.machine_id, start)]
        self.session.scalar.return_value = start
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = rows
        self.session.scalars.return_value = scalars_mock

        mock_detector = MagicMock()
        mock_detector.process.side_effect = ValueError("Detector corrupted state")

        orchestrator = AnalyticsOrchestrator(
            session=self.session,
            detection_engine=mock_detector,
        )

        result = orchestrator.process_machine(self.machine_id, raise_on_error=False)
        self.assertFalse(result.success)
        self.assertIn("Detector corrupted state", result.error or "")
        self.session.rollback.assert_called()

    def test_persistence_failure_surfaced(self) -> None:
        start = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        rows = [
            make_telemetry_row(
                self.machine_id,
                start + timedelta(seconds=i),
                operating_state="idle",
                active_power=25.0,
            )
            for i in range(70)
        ]
        rows.append(
            make_telemetry_row(
                self.machine_id,
                start + timedelta(seconds=70),
                operating_state="running",
                active_power=50.0,
            )
        )
        self.session.scalar.return_value = rows[-1].timestamp
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = rows
        self.session.scalars.return_value = scalars_mock

        self.persistence.should_fail = True

        result = self.orchestrator.process_machine(self.machine_id, raise_on_error=False)
        self.assertFalse(result.success)
        self.assertIn("Simulated persistence failure", result.error or "")
        self.session.rollback.assert_called()

    def test_normal_operation_produces_no_wastage_events(self) -> None:
        start = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        # Normal running machine with expected load and power
        rows = [
            make_telemetry_row(
                self.machine_id,
                start + timedelta(seconds=i),
                operating_state="running",
                active_power=30.0,
                load_percentage=60.0,
                voltage=400.0,
                current=45.0,
            )
            for i in range(60)
        ]
        self.session.scalar.return_value = rows[-1].timestamp
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = rows
        self.session.scalars.return_value = scalars_mock

        result = self.orchestrator.flush_machine(self.machine_id)
        self.assertTrue(result.success)
        self.assertEqual(result.candidates_count, 0)
        self.assertEqual(result.finalized_count, 0)
        self.assertEqual(len(result.persisted_events), 0)


if __name__ == "__main__":
    unittest.main()
