from datetime import datetime, timedelta, timezone
from decimal import Decimal
import unittest
from unittest.mock import MagicMock
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from app.api.routes.machines import get_machine_service
from app.db.models import Machine, Telemetry
from app.main import create_app
from app.repositories.machine_repository import MachineRepository
from app.schemas.machine import MachineListResponse, MachineResponse, MachineSummaryResponse, TelemetryFreshness
from app.services.machine_service import MachineNotFoundError, MachineService


def make_dummy_machine(
    machine_id: UUID | None = None,
    site_id: UUID | None = None,
    name: str = "Test Machine",
    machine_identifier: str = "TM-01",
    status: str = "active",
    rated_power_kw: float | None = 132.0,
) -> Machine:
    now = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
    machine = Machine(
        id=machine_id or uuid4(),
        site_id=site_id or uuid4(),
        machine_identifier=machine_identifier,
        name=name,
        machine_type="conveyor",
        status=status,
        rated_power_kw=Decimal(str(rated_power_kw)) if rated_power_kw is not None else None,
        created_at=now,
        updated_at=now,
    )
    return machine


class MachineApiUnitTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = create_app()
        self.mock_repo = MagicMock(spec=MachineRepository)
        self.service = MachineService(self.mock_repo)
        self.app.dependency_overrides[get_machine_service] = lambda: self.service
        self.client = TestClient(self.app)
        self.client.__enter__()

    def tearDown(self) -> None:
        self.client.__exit__(None, None, None)
        self.app.dependency_overrides.clear()

    def test_list_machines_pagination_and_schema(self) -> None:
        m1 = make_dummy_machine(name="Conveyor A")
        m2 = make_dummy_machine(name="Conveyor B")
        self.mock_repo.list_machines.return_value = ([m1, m2], 2)

        response = self.client.get("/api/v1/machines?limit=10&offset=0")
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["total"], 2)
        self.assertEqual(data["limit"], 10)
        self.assertEqual(data["offset"], 0)
        self.assertEqual(len(data["items"]), 2)
        self.assertEqual(data["items"][0]["name"], "Conveyor A")
        self.assertEqual(data["items"][0]["rated_power_kw"], 132.0)
        self.mock_repo.list_machines.assert_called_once_with(limit=10, offset=0, status=None)

    def test_list_machines_status_filter(self) -> None:
        m1 = make_dummy_machine(status="maintenance")
        self.mock_repo.list_machines.return_value = ([m1], 1)

        response = self.client.get("/api/v1/machines?status=maintenance")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total"], 1)
        self.mock_repo.list_machines.assert_called_once_with(limit=50, offset=0, status="maintenance")

    def test_get_machine_by_id_success(self) -> None:
        m = make_dummy_machine()
        self.mock_repo.get_by_id.return_value = m

        response = self.client.get(f"/api/v1/machines/{m.id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["id"], str(m.id))
        self.assertEqual(data["name"], m.name)

    def test_get_machine_unknown_id_returns_404(self) -> None:
        missing_id = uuid4()
        self.mock_repo.get_by_id.return_value = None

        response = self.client.get(f"/api/v1/machines/{missing_id}")
        self.assertEqual(response.status_code, 404)
        self.assertIn("not found", response.json()["detail"].lower())

    def test_get_machine_invalid_uuid_returns_422(self) -> None:
        response = self.client.get("/api/v1/machines/not-a-uuid")
        self.assertEqual(response.status_code, 422)

    def test_get_machine_summary_fresh_telemetry(self) -> None:
        m = make_dummy_machine()
        now = datetime.now(timezone.utc)
        summary = MachineSummaryResponse(
            machine_id=m.id,
            site_id=m.site_id,
            machine_identifier=m.machine_identifier,
            name=m.name,
            machine_type=m.machine_type,
            status=m.status,
            rated_power_kw=132.0,
            latest_telemetry_timestamp=now - timedelta(seconds=15),
            latest_operating_state="RUNNING",
            latest_active_power=85.4,
            latest_power_factor=0.92,
            latest_temperature=54.2,
            latest_load_percentage=65.0,
            telemetry_freshness=TelemetryFreshness.FRESH,
            seconds_since_last_telemetry=15.0,
        )
        self.mock_repo.get_summary.return_value = summary

        response = self.client.get(f"/api/v1/machines/{m.id}/summary")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["telemetry_freshness"], "fresh")
        self.assertEqual(data["latest_operating_state"], "RUNNING")
        self.assertEqual(data["latest_active_power"], 85.4)
        self.assertEqual(data["seconds_since_last_telemetry"], 15.0)

    def test_get_machine_summary_stale_telemetry(self) -> None:
        m = make_dummy_machine()
        old_time = datetime.now(timezone.utc) - timedelta(seconds=300)
        summary = MachineSummaryResponse(
            machine_id=m.id,
            site_id=m.site_id,
            machine_identifier=m.machine_identifier,
            name=m.name,
            machine_type=m.machine_type,
            status=m.status,
            rated_power_kw=132.0,
            latest_telemetry_timestamp=old_time,
            latest_operating_state="RUNNING",
            latest_active_power=85.4,
            telemetry_freshness=TelemetryFreshness.STALE,
            seconds_since_last_telemetry=300.0,
        )
        self.mock_repo.get_summary.return_value = summary

        response = self.client.get(f"/api/v1/machines/{m.id}/summary")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["telemetry_freshness"], "stale")
        self.assertEqual(data["seconds_since_last_telemetry"], 300.0)

    def test_get_machine_summary_missing_telemetry(self) -> None:
        m = make_dummy_machine()
        summary = MachineSummaryResponse(
            machine_id=m.id,
            site_id=m.site_id,
            machine_identifier=m.machine_identifier,
            name=m.name,
            machine_type=m.machine_type,
            status=m.status,
            rated_power_kw=132.0,
            latest_telemetry_timestamp=None,
            latest_operating_state=None,
            latest_active_power=None,
            latest_power_factor=None,
            latest_temperature=None,
            latest_load_percentage=None,
            telemetry_freshness=TelemetryFreshness.MISSING,
            seconds_since_last_telemetry=None,
        )
        self.mock_repo.get_summary.return_value = summary

        response = self.client.get(f"/api/v1/machines/{m.id}/summary")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["telemetry_freshness"], "missing")
        self.assertIsNone(data["latest_telemetry_timestamp"])
        self.assertIsNone(data["latest_active_power"])

    def test_get_machine_summary_stopped_machine_with_fresh_telemetry(self) -> None:
        m = make_dummy_machine()
        now = datetime.now(timezone.utc)
        summary = MachineSummaryResponse(
            machine_id=m.id,
            site_id=m.site_id,
            machine_identifier=m.machine_identifier,
            name=m.name,
            machine_type=m.machine_type,
            status=m.status,
            rated_power_kw=132.0,
            latest_telemetry_timestamp=now - timedelta(seconds=5),
            latest_operating_state="STOPPED",
            latest_active_power=0.0,
            latest_power_factor=None,
            latest_temperature=32.0,
            latest_load_percentage=0.0,
            telemetry_freshness=TelemetryFreshness.FRESH,
            seconds_since_last_telemetry=5.0,
        )
        self.mock_repo.get_summary.return_value = summary

        response = self.client.get(f"/api/v1/machines/{m.id}/summary")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        # Freshness is fresh because telemetry arrived 5s ago, but state is STOPPED
        self.assertEqual(data["telemetry_freshness"], "fresh")
        self.assertEqual(data["latest_operating_state"], "STOPPED")
        self.assertEqual(data["latest_active_power"], 0.0)

    def test_get_machine_summary_unknown_machine_returns_404(self) -> None:
        missing_id = uuid4()
        self.mock_repo.get_summary.return_value = None

        response = self.client.get(f"/api/v1/machines/{missing_id}/summary")
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
