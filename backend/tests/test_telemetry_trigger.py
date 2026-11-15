import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from app.api.routes.telemetry import get_telemetry_service
from app.db.models import EnergyWastageEvent, Machine, Site, Telemetry
from app.main import create_app
from app.repositories.telemetry_repository import TelemetryRepository
from app.schemas.telemetry import TelemetryCreate
from app.services.analytics_orchestrator import AnalyticsOrchestrator, OrchestrationResult
from app.services.telemetry_service import TelemetryService


class TelemetryTriggerApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = create_app()
        self.mock_repo = MagicMock(spec=TelemetryRepository)
        self.mock_orchestrator = MagicMock(spec=AnalyticsOrchestrator)
        self.service = TelemetryService(
            repository=self.mock_repo,
            orchestrator=self.mock_orchestrator,
        )
        self.app.dependency_overrides[get_telemetry_service] = lambda: self.service
        self.client = TestClient(self.app)
        self.client.__enter__()

    def tearDown(self) -> None:
        self.client.__exit__(None, None, None)
        self.app.dependency_overrides.clear()

    def test_ingestion_commits_telemetry_and_triggers_orchestrator(self) -> None:
        machine_id = uuid4()
        record_id = uuid4()
        ts = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)

        fake_record = Telemetry(
            id=record_id,
            machine_id=machine_id,
            timestamp=ts,
            operating_state="idle",
            active_power=25.0,
        )
        self.mock_repo.create.return_value = fake_record

        self.mock_orchestrator.process_machine.return_value = OrchestrationResult(
            machine_id=machine_id,
            telemetry_count=1,
            features_count=1,
            candidates_count=0,
            finalized_count=0,
            persisted_events=(),
            success=True,
        )

        response = self.client.post(
            "/api/v1/telemetry",
            json={
                "machine_id": str(machine_id),
                "timestamp": ts.isoformat(),
                "operating_state": "idle",
                "active_power": 25.0,
            },
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["id"], str(record_id))
        self.assertEqual(data["timestamp"], "2026-09-26T12:00:00Z")

        # Telemetry must be committed before analytics starts
        self.mock_repo.create.assert_called_once()
        # Orchestrator triggered with the affected machine_id
        self.mock_orchestrator.process_machine.assert_called_once_with(machine_id)

    def test_orchestrator_failure_does_not_abort_or_erase_accepted_telemetry(self) -> None:
        machine_id = uuid4()
        record_id = uuid4()
        ts = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)

        fake_record = Telemetry(
            id=record_id,
            machine_id=machine_id,
            timestamp=ts,
            operating_state="idle",
            active_power=25.0,
        )
        self.mock_repo.create.return_value = fake_record

        # Orchestrator raises an unexpected exception
        self.mock_orchestrator.process_machine.side_effect = RuntimeError(
            "Feature calculation memory spike"
        )

        response = self.client.post(
            "/api/v1/telemetry",
            json={
                "machine_id": str(machine_id),
                "timestamp": ts.isoformat(),
                "operating_state": "idle",
                "active_power": 25.0,
            },
        )

        # Telemetry ingestion must still succeed with HTTP 201
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["id"], str(record_id))
        self.assertEqual(data["timestamp"], "2026-09-26T12:00:00Z")

        # Telemetry was created in DB
        self.mock_repo.create.assert_called_once()
        # Orchestrator was called
        self.mock_orchestrator.process_machine.assert_called_once_with(machine_id)


if __name__ == "__main__":
    unittest.main()
