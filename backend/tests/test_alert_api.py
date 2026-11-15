from datetime import datetime, timezone
import unittest
from unittest.mock import MagicMock
from uuid import uuid4

from fastapi import status
from fastapi.testclient import TestClient

from app.api.routes.alerts import get_alert_service
from app.api.routes.machines import get_alert_service as get_machine_alert_service, get_machine_service
from app.db.models import Alert, Machine
from app.main import create_app
from app.repositories.alert_repository import AlertNotFoundError
from app.schemas.alert import AlertListResponse, AlertResponse


class TestAlertAPI(unittest.TestCase):
    def setUp(self) -> None:
        self.app = create_app()
        self.mock_alert_service = MagicMock()
        self.mock_machine_service = MagicMock()

        self.app.dependency_overrides[get_alert_service] = lambda: self.mock_alert_service
        self.app.dependency_overrides[get_machine_alert_service] = lambda: self.mock_alert_service
        self.app.dependency_overrides[get_machine_service] = lambda: self.mock_machine_service
        self.client = TestClient(self.app)

        self.alert_id = uuid4()
        self.machine_id = uuid4()
        self.event_id = uuid4()
        self.now = datetime(2026, 10, 30, 12, 0, 0, tzinfo=timezone.utc)

        self.sample_alert = AlertResponse(
            id=self.alert_id,
            machine_id=self.machine_id,
            machine_identifier="DEMO-CONV-01",
            machine_name="Primary Conveyor",
            event_id=self.event_id,
            alert_type="IDLE_WASTAGE",
            severity="medium",
            title="Sustained Idle Energy Wastage",
            description="Machine operated in IDLE state for 5.0 minutes.",
            recommendation="Inspect whether machine remains energized while idle.",
            status="open",
            occurred_at=self.now,
            resolved_at=None,
            created_at=self.now,
        )

    def tearDown(self) -> None:
        self.app.dependency_overrides.clear()

    def test_list_alerts_endpoint(self) -> None:
        self.mock_alert_service.list_alerts.return_value = AlertListResponse(
            items=[self.sample_alert],
            total=1,
            limit=50,
            offset=0,
        )
        response = self.client.get("/api/v1/alerts?severity=medium&status=open")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["total"], 1)
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["severity"], "medium")
        self.assertEqual(data["items"][0]["status"], "open")

    def test_get_alert_by_id_success(self) -> None:
        self.mock_alert_service.get_alert_by_id.return_value = self.sample_alert
        response = self.client.get(f"/api/v1/alerts/{self.alert_id}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["id"], str(self.alert_id))
        self.assertEqual(data["event_id"], str(self.event_id))

    def test_get_alert_by_id_not_found(self) -> None:
        self.mock_alert_service.get_alert_by_id.side_effect = AlertNotFoundError("Not found")
        response = self.client.get(f"/api/v1/alerts/{uuid4()}")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_get_machine_alerts(self) -> None:
        self.mock_alert_service.list_alerts.return_value = AlertListResponse(
            items=[self.sample_alert],
            total=1,
            limit=50,
            offset=0,
        )
        response = self.client.get(f"/api/v1/machines/{self.machine_id}/alerts")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["total"], 1)

    def test_acknowledge_alert(self) -> None:
        ack_alert = self.sample_alert.model_copy(update={"status": "acknowledged"})
        self.mock_alert_service.acknowledge_alert.return_value = ack_alert
        response = self.client.post(f"/api/v1/alerts/{self.alert_id}/acknowledge")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["status"], "acknowledged")

    def test_resolve_alert(self) -> None:
        res_alert = self.sample_alert.model_copy(
            update={"status": "resolved", "resolved_at": self.now}
        )
        self.mock_alert_service.resolve_alert.return_value = res_alert
        response = self.client.post(f"/api/v1/alerts/{self.alert_id}/resolve")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["status"], "resolved")
        self.assertIsNotNone(data["resolved_at"])

    def test_dismiss_alert(self) -> None:
        dismissed_alert = self.sample_alert.model_copy(update={"status": "dismissed"})
        self.mock_alert_service.dismiss_alert.return_value = dismissed_alert
        response = self.client.post(f"/api/v1/alerts/{self.alert_id}/dismiss")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["status"], "dismissed")

    def test_invalid_time_range_returns_400(self) -> None:
        response = self.client.get(
            "/api/v1/alerts?start_time=2026-10-30T15:00:00Z&end_time=2026-10-30T10:00:00Z"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


if __name__ == "__main__":
    unittest.main()

