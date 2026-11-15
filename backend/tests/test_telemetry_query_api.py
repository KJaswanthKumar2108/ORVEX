from datetime import datetime, timezone
import unittest
from unittest.mock import MagicMock
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from app.api.routes.machines import get_telemetry_query_service
from app.db.models import Machine, Telemetry
from app.main import create_app
from app.repositories.machine_repository import MachineRepository
from app.repositories.telemetry_repository import TelemetryRepository
from app.schemas.telemetry import TelemetryListResponse, TelemetryRecordResponse
from app.services.telemetry_query_service import TelemetryQueryService


def make_dummy_telemetry(
    machine_id: UUID,
    timestamp: datetime,
    *,
    active_power: float | None = 45.2,
    voltage: float | None = 400.0,
    current: float | None = 65.0,
    operating_state: str = "RUNNING",
) -> Telemetry:
    return Telemetry(
        id=uuid4(),
        machine_id=machine_id,
        timestamp=timestamp,
        sensor_id=uuid4(),
        voltage=voltage,
        current=current,
        active_power=active_power,
        reactive_power=10.0,
        apparent_power=46.3,
        power_factor=0.97,
        cumulative_energy=1024.5,
        rpm=1480.0,
        temperature=58.2,
        load_percentage=60.0,
        operating_state=operating_state,
    )


class TelemetryQueryApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = create_app()
        self.mock_machine_repo = MagicMock(spec=MachineRepository)
        self.mock_telemetry_repo = MagicMock(spec=TelemetryRepository)
        self.service = TelemetryQueryService(
            telemetry_repository=self.mock_telemetry_repo,
            machine_repository=self.mock_machine_repo,
        )
        self.app.dependency_overrides[get_telemetry_query_service] = lambda: self.service
        self.client = TestClient(self.app)
        self.client.__enter__()

    def tearDown(self) -> None:
        self.client.__exit__(None, None, None)
        self.app.dependency_overrides.clear()

    def test_get_telemetry_range_success(self) -> None:
        mid = uuid4()
        t1 = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        t2 = datetime(2026, 9, 26, 12, 1, 0, tzinfo=timezone.utc)
        rec1 = make_dummy_telemetry(mid, t1)
        rec2 = make_dummy_telemetry(mid, t2)

        self.mock_machine_repo.get_by_id.return_value = Machine(id=mid, name="M")
        self.mock_telemetry_repo.get_range.return_value = ([rec1, rec2], 2)

        resp = self.client.get(
            f"/api/v1/machines/{mid}/telemetry?start_time=2026-09-26T12:00:00Z&end_time=2026-09-26T12:05:00Z&limit=50&offset=0"
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total"], 2)
        self.assertEqual(len(data["items"]), 2)
        self.assertEqual(data["items"][0]["active_power"], 45.2)

    def test_get_telemetry_unknown_machine_returns_404(self) -> None:
        mid = uuid4()
        self.mock_machine_repo.get_by_id.return_value = None

        resp = self.client.get(f"/api/v1/machines/{mid}/telemetry")
        self.assertEqual(resp.status_code, 404)
        self.assertIn("not found", resp.json()["detail"].lower())

    def test_get_telemetry_invalid_time_range_returns_400(self) -> None:
        mid = uuid4()
        self.mock_machine_repo.get_by_id.return_value = Machine(id=mid, name="M")

        # start_time is AFTER end_time
        resp = self.client.get(
            f"/api/v1/machines/{mid}/telemetry?start_time=2026-09-26T14:00:00Z&end_time=2026-09-26T12:00:00Z"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("less than or equal", resp.json()["detail"].lower())

    def test_get_telemetry_empty_history(self) -> None:
        mid = uuid4()
        self.mock_machine_repo.get_by_id.return_value = Machine(id=mid, name="M")
        self.mock_telemetry_repo.get_range.return_value = ([], 0)

        resp = self.client.get(f"/api/v1/machines/{mid}/telemetry")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total"], 0)
        self.assertEqual(len(data["items"]), 0)

    def test_missing_optional_measurements_serialize_as_null(self) -> None:
        mid = uuid4()
        t = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        sparse_rec = Telemetry(
            id=uuid4(),
            machine_id=mid,
            timestamp=t,
            sensor_id=None,
            voltage=None,
            current=None,
            active_power=None,
            reactive_power=None,
            apparent_power=None,
            power_factor=None,
            cumulative_energy=None,
            rpm=None,
            temperature=None,
            load_percentage=None,
            operating_state=None,
        )
        self.mock_machine_repo.get_by_id.return_value = Machine(id=mid, name="M")
        self.mock_telemetry_repo.get_range.return_value = ([sparse_rec], 1)

        resp = self.client.get(f"/api/v1/machines/{mid}/telemetry")
        self.assertEqual(resp.status_code, 200)
        item = resp.json()["items"][0]
        self.assertIsNone(item["active_power"])
        self.assertIsNone(item["load_percentage"])
        self.assertIsNone(item["operating_state"])


if __name__ == "__main__":
    unittest.main()
