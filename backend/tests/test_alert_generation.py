from datetime import datetime, timedelta, timezone
from decimal import Decimal
import unittest
from unittest.mock import MagicMock
from uuid import uuid4

from app.db.models import Alert, EnergyWastageEvent, Machine
from app.repositories.alert_repository import AlertRepository
from app.services.alert_service import (
    AlertService,
    get_recommendation_for_reason,
    map_event_to_alert_attributes,
)


class TestAlertGeneration(unittest.TestCase):
    def setUp(self) -> None:
        self.session = MagicMock()
        self.repo = MagicMock(spec=AlertRepository)
        self.service = AlertService(self.repo)
        self.machine_id = uuid4()
        self.event_id = uuid4()
        self.now = datetime(2026, 10, 30, 10, 0, 0, tzinfo=timezone.utc)

    def test_map_idle_wastage_severity_and_wording(self) -> None:
        # High severity (> 5.0 kWh wasted)
        event_high = EnergyWastageEvent(
            id=self.event_id,
            machine_id=self.machine_id,
            start_time=self.now,
            end_time=self.now + timedelta(minutes=15),
            duration_seconds=900.0,
            estimated_energy_kwh=Decimal("20.0"),
            estimated_wasted_energy_kwh=Decimal("6.5"),
            detection_reason="IDLE_WASTAGE",
        )
        alert_type, severity, title, desc, rec = map_event_to_alert_attributes(
            event_high, machine_name="Conveyor 1"
        )
        self.assertEqual(alert_type, "IDLE_WASTAGE")
        self.assertEqual(severity, "high")
        self.assertEqual(title, "Sustained Idle Energy Wastage")
        self.assertIn("6.50 kWh", desc)
        self.assertIn("Conveyor 1", desc)
        self.assertIn("shutdown procedure permits stopping", rec)

        # Medium severity (1.0 to 5.0 kWh wasted)
        event_med = EnergyWastageEvent(
            id=self.event_id,
            machine_id=self.machine_id,
            start_time=self.now,
            end_time=self.now + timedelta(minutes=5),
            duration_seconds=300.0,
            estimated_energy_kwh=Decimal("10.0"),
            estimated_wasted_energy_kwh=Decimal("2.5"),
            detection_reason="IDLE_WASTAGE",
        )
        _, severity_med, _, _, _ = map_event_to_alert_attributes(event_med)
        self.assertEqual(severity_med, "medium")

        # Low severity (< 1.0 kWh wasted)
        event_low = EnergyWastageEvent(
            id=self.event_id,
            machine_id=self.machine_id,
            start_time=self.now,
            end_time=self.now + timedelta(minutes=2),
            duration_seconds=120.0,
            estimated_energy_kwh=Decimal("2.0"),
            estimated_wasted_energy_kwh=Decimal("0.5"),
            detection_reason="IDLE_WASTAGE",
        )
        _, severity_low, _, _, _ = map_event_to_alert_attributes(event_low)
        self.assertEqual(severity_low, "low")

    def test_map_low_load_wastage_severity(self) -> None:
        event = EnergyWastageEvent(
            id=self.event_id,
            machine_id=self.machine_id,
            start_time=self.now,
            end_time=self.now + timedelta(minutes=20),
            duration_seconds=1200.0,
            estimated_energy_kwh=Decimal("30.0"),
            estimated_wasted_energy_kwh=Decimal("5.5"),
            detection_reason="LOW_LOAD_WASTAGE; contributing=ABNORMAL_POWER",
        )
        alert_type, severity, title, desc, rec = map_event_to_alert_attributes(
            event, machine_name="Crusher 2"
        )
        self.assertEqual(alert_type, "LOW_LOAD_WASTAGE")
        self.assertEqual(severity, "high")
        self.assertEqual(title, "Low Load Inefficient Operation")
        self.assertIn("5.50 kWh", desc)
        self.assertIn("appropriately sized", rec)

    def test_map_abnormal_power_severity(self) -> None:
        event = EnergyWastageEvent(
            id=self.event_id,
            machine_id=self.machine_id,
            start_time=self.now,
            end_time=self.now + timedelta(minutes=10),
            duration_seconds=600.0,
            estimated_energy_kwh=Decimal("25.0"),
            estimated_wasted_energy_kwh=Decimal("3.0"),
            detection_reason="ABNORMAL_POWER",
        )
        alert_type, severity, title, desc, rec = map_event_to_alert_attributes(
            event, machine_name="Hoist 3"
        )
        self.assertEqual(alert_type, "ABNORMAL_POWER")
        self.assertEqual(severity, "medium")
        self.assertEqual(title, "Abnormal Power Consumption")
        self.assertIn("Inspect load conditions", rec)

    def test_cycling_candidate_wording_preserves_null_wasted_energy(self) -> None:
        event = EnergyWastageEvent(
            id=self.event_id,
            machine_id=self.machine_id,
            start_time=self.now,
            end_time=self.now + timedelta(minutes=5),
            duration_seconds=300.0,
            estimated_energy_kwh=Decimal("15.0"),
            estimated_wasted_energy_kwh=None,  # Null energy
            detection_reason="START_STOP_CYCLING",
        )
        alert_type, severity, title, desc, rec = map_event_to_alert_attributes(
            event, machine_name="Pump 4"
        )
        self.assertEqual(alert_type, "START_STOP_CYCLING")
        self.assertEqual(severity, "low")
        self.assertEqual(title, "Repeated Start/Stop Cycling Candidate")
        # Critical guarantee: Cycling candidate does NOT claim confirmed energy waste!
        self.assertIn("wasted energy is not estimated", desc)
        self.assertNotIn("wasted energy of", desc)
        self.assertIn("Review operating schedules", rec)

    def test_idempotent_creation_returns_existing_alert(self) -> None:
        event = EnergyWastageEvent(
            id=self.event_id,
            machine_id=self.machine_id,
            start_time=self.now,
            end_time=self.now + timedelta(minutes=10),
            duration_seconds=600.0,
            estimated_energy_kwh=Decimal("20.0"),
            estimated_wasted_energy_kwh=Decimal("4.0"),
            detection_reason="IDLE_WASTAGE",
        )

        mock_alert = Alert(
            id=uuid4(),
            machine_id=self.machine_id,
            event_id=self.event_id,
            alert_type="IDLE_WASTAGE",
            severity="medium",
            occurred_at=self.now,
            description="Existing alert description",
            status="open",
        )

        # First call creates
        self.repo.create_or_get_for_event.return_value = (mock_alert, True)
        alert1, created1 = self.service.create_or_get_for_event(event)
        self.assertEqual(alert1.id, mock_alert.id)
        self.assertTrue(created1)

        # Second call reuses existing
        self.repo.create_or_get_for_event.return_value = (mock_alert, False)
        alert2, created2 = self.service.create_or_get_for_event(event)
        self.assertEqual(alert2.id, mock_alert.id)
        self.assertFalse(created2)


if __name__ == "__main__":
    unittest.main()
