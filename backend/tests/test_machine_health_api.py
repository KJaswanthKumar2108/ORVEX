from datetime import datetime, timezone
import unittest
from unittest.mock import MagicMock
from uuid import uuid4

from fastapi import status
from fastapi.testclient import TestClient

from app.api.routes.machine_health import get_machine_health_service
from app.main import create_app
from app.schemas.machine_health import (
    ChannelCoverageReport,
    ChannelStatus,
    FleetHealthSummaryResponse,
    HealthSeverity,
    HealthStatus,
    MachineHealthDetailResponse,
    MachineHealthWarningResponse,
    MaintenanceObservationCreate,
    MaintenanceObservationResponse,
    SubScoreBreakdown,
    WarningAcknowledgeRequest,
    WarningType,
)


class TestMachineHealthAPI(unittest.TestCase):
    def setUp(self) -> None:
        self.app = create_app()
        self.mock_service = MagicMock()
        self.app.dependency_overrides[get_machine_health_service] = lambda: self.mock_service
        self.client = TestClient(self.app)

        self.machine_id = uuid4()
        self.now = datetime(2026, 11, 4, 12, 0, 0, tzinfo=timezone.utc)

    def tearDown(self) -> None:
        self.app.dependency_overrides.clear()

    def test_get_fleet_summary_api(self) -> None:
        self.mock_service.get_fleet_summary.return_value = None
        self.mock_service.get_fleet_health_summary.return_value = FleetHealthSummaryResponse(
            fleet_health_score=87.5,
            total_machines_monitored=3,
            status_breakdown={
                "HEALTHY": 2,
                "WATCH": 1,
                "WARNING": 0,
                "CRITICAL": 0,
                "INSUFFICIENT_DATA": 0,
            },
            active_warnings_count=1,
            active_warnings_by_severity={"WATCH": 1, "WARNING": 0, "CRITICAL": 0},
            unmeasured_channels=["Vibration (ISO 10816-3 RMS)"],
            recent_observations_count=2,
            last_evaluated_at=self.now,
        )

        resp = self.client.get("/api/v1/machine-health/summary")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(data["fleet_health_score"], 87.5)
        self.assertEqual(data["total_machines_monitored"], 3)
        self.assertEqual(data["status_breakdown"]["HEALTHY"], 2)
        self.assertIn("causality_disclaimer", data)

    def test_get_machine_health_detail_success(self) -> None:
        self.mock_service.get_machine_health_detail.return_value = MachineHealthDetailResponse(
            machine_id=self.machine_id,
            machine_name="Jaw Crusher 01",
            machine_type="Crusher",
            rated_power_kw=132.0,
            health_score=92.0,
            health_status=HealthStatus.HEALTHY,
            sub_scores=SubScoreBreakdown(
                electrical_stability=95.0,
                thermal_margin=90.0,
                operational_consistency=92.0,
                state_stability=98.0,
                weights_applied={"electrical_stability": 0.35, "thermal_margin": 0.25},
            ),
            channels=[
                ChannelCoverageReport(
                    channel_name="3-Phase Electrical",
                    status=ChannelStatus.ACTIVE_HARDWARE,
                    sample_count=60,
                    description="Active",
                ),
                ChannelCoverageReport(
                    channel_name="Vibration (ISO 10816-3)",
                    status=ChannelStatus.UNMEASURED_NOT_INSTALLED,
                    sample_count=0,
                    description="Unmeasured",
                ),
            ],
            data_coverage_hours=2.0,
            telemetry_sample_count=60,
            active_warnings=[],
            recent_observations=[],
        )

        resp = self.client.get(f"/api/v1/machine-health/machines/{self.machine_id}?window_hours=24.0")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(data["machine_id"], str(self.machine_id))
        self.assertEqual(data["health_score"], 92.0)
        self.assertEqual(data["health_status"], "HEALTHY")
        self.assertEqual(data["channels"][1]["status"], "UNMEASURED_NOT_INSTALLED")

    def test_get_machine_health_detail_not_found(self) -> None:
        self.mock_service.get_machine_health_detail.return_value = None
        unknown_id = uuid4()
        resp = self.client.get(f"/api/v1/machine-health/machines/{unknown_id}")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_list_machine_warnings_api(self) -> None:
        warning_id = uuid4()
        self.mock_service.list_warnings.return_value = [
            MachineHealthWarningResponse(
                id=warning_id,
                machine_id=self.machine_id,
                machine_name="Jaw Crusher 01",
                warning_type=WarningType.POWER_FLUCTUATION.value,
                severity=HealthSeverity.WARNING,
                status="open",
                detected_at=self.now,
                window_start=self.now,
                window_end=self.now,
                observed_value=0.36,
                baseline_value=0.08,
                threshold_value=0.30,
                unit="CV",
                severity_rationale="Active power fluctuation elevated",
                telemetry_evidence={"cv": 0.36},
                confidence_score=0.9,
                data_quality="HIGH",
                recommended_action="Inspect mechanical binding",
                created_at=self.now,
            )
        ]

        resp = self.client.get(f"/api/v1/machine-health/machines/{self.machine_id}/warnings?status=open")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["id"], str(warning_id))
        self.assertEqual(data[0]["severity"], "WARNING")

    def test_acknowledge_warning_api(self) -> None:
        warning_id = uuid4()
        self.mock_service.acknowledge_warning.return_value = MachineHealthWarningResponse(
            id=warning_id,
            machine_id=self.machine_id,
            machine_name="Jaw Crusher 01",
            warning_type=WarningType.POWER_FLUCTUATION.value,
            severity=HealthSeverity.WARNING,
            status="acknowledged",
            detected_at=self.now,
            window_start=self.now,
            window_end=self.now,
            observed_value=0.36,
            baseline_value=0.08,
            threshold_value=0.30,
            unit="CV",
            severity_rationale="Active power fluctuation elevated",
            telemetry_evidence={"cv": 0.36},
            confidence_score=0.9,
            data_quality="HIGH",
            recommended_action="Inspect mechanical binding [Ack note: Investigating]",
            acknowledged_at=self.now,
            acknowledged_by="Tech Alex",
            created_at=self.now,
        )

        resp = self.client.post(
            f"/api/v1/machine-health/warnings/{warning_id}/acknowledge",
            json={"acknowledged_by": "Tech Alex", "notes": "Investigating"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(data["status"], "acknowledged")
        self.assertEqual(data["acknowledged_by"], "Tech Alex")

    def test_acknowledge_warning_not_found(self) -> None:
        self.mock_service.acknowledge_warning.return_value = None
        unknown_id = uuid4()
        resp = self.client.post(
            f"/api/v1/machine-health/warnings/{unknown_id}/acknowledge",
            json={"acknowledged_by": "Tech Alex"},
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_create_maintenance_observation_api(self) -> None:
        obs_id = uuid4()
        self.mock_service.create_observation.return_value = MaintenanceObservationResponse(
            id=obs_id,
            machine_id=self.machine_id,
            machine_name="Jaw Crusher 01",
            inspector_name="Chief Mech Roberts",
            inspection_date=self.now,
            suspected_issue="Bearing friction and belt looseness",
            corrective_action="Lubricated bearings and adjusted tensioning screw",
            status="resolved",
            notes="Vibration audibly dampened",
            created_at=self.now,
        )

        payload = {
            "machine_id": str(self.machine_id),
            "inspector_name": "Chief Mech Roberts",
            "inspection_date": self.now.isoformat(),
            "suspected_issue": "Bearing friction and belt looseness",
            "corrective_action": "Lubricated bearings and adjusted tensioning screw",
            "status": "resolved",
            "notes": "Vibration audibly dampened",
        }
        resp = self.client.post("/api/v1/machine-health/observations", json=payload)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        data = resp.json()
        self.assertEqual(data["id"], str(obs_id))
        self.assertEqual(data["status"], "resolved")
        self.assertEqual(data["inspector_name"], "Chief Mech Roberts")

    def test_create_maintenance_observation_invalid_payload(self) -> None:
        # Missing required fields like suspected_issue
        payload = {
            "machine_id": str(self.machine_id),
            "inspector_name": "Chief Mech Roberts",
            "inspection_date": self.now.isoformat(),
        }
        resp = self.client.post("/api/v1/machine-health/observations", json=payload)
        self.assertEqual(resp.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)

