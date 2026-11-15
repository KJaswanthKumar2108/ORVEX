from datetime import datetime, timezone
from decimal import Decimal
import unittest
from unittest.mock import MagicMock
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from app.api.routes.machines import get_wastage_event_query_service as get_machine_event_service
from app.api.routes.wastage_events import get_wastage_event_query_service
from app.db.models import EnergyWastageEvent, Machine
from app.main import create_app
from app.repositories.machine_repository import MachineRepository
from app.repositories.wastage_event_repository import WastageEventRepository
from app.schemas.wastage_event import WastageEventListResponse, WastageEventResponse
from app.services.wastage_event_query_service import WastageEventNotFoundError, WastageEventQueryService


def make_dummy_event(
    event_id: UUID | None = None,
    machine_id: UUID | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    reason: str = "IDLE_WASTAGE",
    wasted_kwh: float | None = 2.5,
    status: str = "detected",
) -> EnergyWastageEvent:
    now = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
    s = start_time or now
    e = end_time or (now if reason != "START_STOP_CYCLING" else None)
    return EnergyWastageEvent(
        id=event_id or uuid4(),
        machine_id=machine_id or uuid4(),
        start_time=s,
        end_time=e,
        estimated_energy_kwh=Decimal("10.0"),
        estimated_wasted_energy_kwh=Decimal(str(wasted_kwh)) if wasted_kwh is not None else None,
        detection_reason=reason,
        confidence_score=0.85,
        status=status,
        created_at=now,
    )


class WastageEventApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = create_app()
        self.mock_event_repo = MagicMock(spec=WastageEventRepository)
        self.mock_machine_repo = MagicMock(spec=MachineRepository)
        self.service = WastageEventQueryService(
            event_repository=self.mock_event_repo,
            machine_repository=self.mock_machine_repo,
        )
        self.app.dependency_overrides[get_wastage_event_query_service] = lambda: self.service
        self.app.dependency_overrides[get_machine_event_service] = lambda: self.service
        self.client = TestClient(self.app)
        self.client.__enter__()

    def tearDown(self) -> None:
        self.client.__exit__(None, None, None)
        self.app.dependency_overrides.clear()

    def test_list_wastage_events_pagination_and_filters(self) -> None:
        mid = uuid4()
        ev1 = make_dummy_event(machine_id=mid, reason="IDLE_WASTAGE")
        ev2 = make_dummy_event(machine_id=mid, reason="ABNORMAL_POWER")

        self.mock_event_repo.list_events.return_value = ([ev1, ev2], 2)

        resp = self.client.get(
            f"/api/v1/wastage-events?machine_id={mid}&detection_reason=IDLE&status=detected&limit=25&offset=0"
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total"], 2)
        self.assertEqual(data["limit"], 25)
        self.assertEqual(len(data["items"]), 2)
        self.assertEqual(data["items"][0]["detection_reason"], "IDLE_WASTAGE")
        self.assertEqual(data["items"][0]["status"], "detected")

        self.mock_event_repo.list_events.assert_called_once_with(
            machine_id=mid,
            detection_reason="IDLE",
            status="detected",
            start_time=None,
            end_time=None,
            limit=25,
            offset=0,
        )

    def test_list_wastage_events_invalid_time_range_returns_400(self) -> None:
        resp = self.client.get(
            "/api/v1/wastage-events?start_time=2026-09-26T14:00:00Z&end_time=2026-09-26T12:00:00Z"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("less than or equal", resp.json()["detail"].lower())

    def test_get_wastage_event_by_id_success(self) -> None:
        ev = make_dummy_event()
        self.mock_event_repo.get_by_id.return_value = ev

        resp = self.client.get(f"/api/v1/wastage-events/{ev.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["id"], str(ev.id))
        self.assertEqual(data["machine_id"], str(ev.machine_id))
        self.assertEqual(data["detection_reason"], ev.detection_reason)
        self.assertEqual(data["estimated_wasted_energy_kwh"], 2.5)

    def test_get_wastage_event_cycling_candidate_preserves_null_wasted_energy(self) -> None:
        ev = make_dummy_event(reason="START_STOP_CYCLING", wasted_kwh=None)
        self.mock_event_repo.get_by_id.return_value = ev

        resp = self.client.get(f"/api/v1/wastage-events/{ev.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsNone(data["estimated_wasted_energy_kwh"])

    def test_get_wastage_event_unknown_id_returns_404(self) -> None:
        missing_id = uuid4()
        self.mock_event_repo.get_by_id.return_value = None

        resp = self.client.get(f"/api/v1/wastage-events/{missing_id}")
        self.assertEqual(resp.status_code, 404)
        self.assertIn("not found", resp.json()["detail"].lower())

    def test_get_machine_wastage_events_success(self) -> None:
        mid = uuid4()
        ev = make_dummy_event(machine_id=mid)

        self.mock_machine_repo.get_by_id.return_value = Machine(id=mid, name="M")
        self.mock_event_repo.list_events.return_value = ([ev], 1)

        resp = self.client.get(f"/api/v1/machines/{mid}/wastage-events")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total"], 1)
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["machine_id"], str(mid))

    def test_get_machine_wastage_events_unknown_machine_returns_404(self) -> None:
        missing_mid = uuid4()
        self.mock_machine_repo.get_by_id.return_value = None

        resp = self.client.get(f"/api/v1/machines/{missing_mid}/wastage-events")
        self.assertEqual(resp.status_code, 404)
        self.assertIn("not found", resp.json()["detail"].lower())


if __name__ == "__main__":
    unittest.main()
