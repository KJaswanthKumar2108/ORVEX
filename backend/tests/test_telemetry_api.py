import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID

from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.routes.telemetry import get_telemetry_service
from app.main import create_app
from app.schemas.telemetry import TelemetryCreate

MACHINE_ID = "7ef24888-4aef-4eb9-84b4-a2ad8b31b754"
TIMESTAMP = "2026-09-26T14:30:00Z"


def valid_payload(**updates: object) -> dict[str, object]:
    payload: dict[str, object] = {"timestamp": TIMESTAMP, "machine_id": MACHINE_ID}
    payload.update(updates)
    return payload


class StubTelemetryService:
    def __init__(self) -> None:
        self.received: TelemetryCreate | None = None

    def ingest(self, telemetry: TelemetryCreate) -> SimpleNamespace:
        self.received = telemetry
        return SimpleNamespace(
            id=UUID("4c8cce14-46c0-43ed-a5f4-c7fa34c5ca21"),
            timestamp=telemetry.timestamp,
        )


class TelemetrySchemaTests(unittest.TestCase):
    def test_valid_record_preserves_utc_timestamp(self) -> None:
        record = TelemetryCreate.model_validate(valid_payload())
        self.assertEqual(record.timestamp.utcoffset().total_seconds(), 0)

    def test_naive_timestamp_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            TelemetryCreate.model_validate(valid_payload(timestamp="2026-09-26T14:30:00"))

    def test_invalid_load_percent_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            TelemetryCreate.model_validate(valid_payload(load_percent=100.1))

    def test_invalid_power_factor_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            TelemetryCreate.model_validate(valid_payload(power_factor=-1.1))

    def test_negative_active_power_is_accepted(self) -> None:
        record = TelemetryCreate.model_validate(valid_payload(active_power=-2.5))
        self.assertEqual(record.active_power, -2.5)

    def test_non_finite_measurement_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            TelemetryCreate.model_validate(valid_payload(temperature=float("inf")))


class TelemetryApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = create_app()
        self.service = StubTelemetryService()
        self.app.dependency_overrides[get_telemetry_service] = lambda: self.service
        self.client = TestClient(self.app)
        self.client.__enter__()

    def tearDown(self) -> None:
        self.client.__exit__(None, None, None)
        self.app.dependency_overrides.clear()

    def test_health_does_not_require_database_session(self) -> None:
        self.app.state.session_factory = None
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_telemetry_endpoint_returns_created_record(self) -> None:
        response = self.client.post("/api/v1/telemetry", json=valid_payload(load_percent=50))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["id"], "4c8cce14-46c0-43ed-a5f4-c7fa34c5ca21")
        self.assertEqual(response.json()["timestamp"], "2026-09-26T14:30:00Z")
        self.assertEqual(self.service.received.load_percent, 50)

    def test_invalid_request_returns_unprocessable_entity(self) -> None:
        response = self.client.post("/api/v1/telemetry", json=valid_payload(load_percent=101))
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()