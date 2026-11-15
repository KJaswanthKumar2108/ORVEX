from datetime import datetime, timedelta, timezone
from decimal import Decimal
import unittest
from unittest.mock import MagicMock
from uuid import uuid4

from fastapi import status
from fastapi.testclient import TestClient

from app.api.routes.reports import get_report_service
from app.db.models import EnergyWastageEvent, Machine
from app.main import create_app
from app.repositories.machine_repository import MachineRepository
from app.repositories.wastage_event_repository import WastageEventRepository
from app.schemas.energy import EnergyDataQuality, EnergySummaryResponse
from app.schemas.report import EnergyWastageReportResponse, ReportReasonBreakdown
from app.services.energy_analytics_service import EnergyAnalyticsService
from app.services.report_service import ReportService


class TestReportService(unittest.TestCase):
    def setUp(self) -> None:
        self.machine_repo = MagicMock(spec=MachineRepository)
        self.event_repo = MagicMock(spec=WastageEventRepository)
        self.energy_service = MagicMock(spec=EnergyAnalyticsService)
        self.report_service = ReportService(
            machine_repository=self.machine_repo,
            wastage_event_repository=self.event_repo,
            energy_analytics_service=self.energy_service,
        )

        self.start = datetime(2026, 10, 29, 0, 0, 0, tzinfo=timezone.utc)
        self.end = datetime(2026, 10, 30, 0, 0, 0, tzinfo=timezone.utc)
        self.machine_id = uuid4()
        self.machine = Machine(
            id=self.machine_id,
            site_id=uuid4(),
            machine_identifier="DEMO-CONV-01",
            name="Primary Overland Conveyor",
            machine_type="conveyor",
            rated_power_kw=Decimal("132.0"),
            status="active",
        )

    def test_report_generation_single_machine(self) -> None:
        self.machine_repo.get_by_id.return_value = self.machine

        summary = EnergySummaryResponse(
            machine_id=self.machine_id,
            start_time=self.start,
            end_time=self.end,
            actual_energy_kwh=150.25,
            estimated_wasted_energy_kwh=18.5,
            wastage_event_count=2,
            operating_duration_seconds=3600.0,
            idle_duration_seconds=600.0,
            low_load_duration_seconds=0.0,
            abnormal_power_duration_seconds=0.0,
            data_coverage_ratio=0.95,
            quality=EnergyDataQuality.GOOD,
            telemetry_sample_count=3600,
        )
        self.energy_service.get_energy_summary.return_value = summary

        # 1 idle wastage event with 18.5 kWh, 1 cycling candidate with None
        ev1 = EnergyWastageEvent(
            id=uuid4(),
            machine_id=self.machine_id,
            start_time=self.start + timedelta(hours=1),
            end_time=self.start + timedelta(hours=1, minutes=10),
            duration_seconds=600.0,
            estimated_energy_kwh=Decimal("25.0"),
            estimated_wasted_energy_kwh=Decimal("18.5"),
            detection_reason="IDLE_WASTAGE",
            confidence_score=0.9,
            status="detected",
        )
        ev2 = EnergyWastageEvent(
            id=uuid4(),
            machine_id=self.machine_id,
            start_time=self.start + timedelta(hours=2),
            end_time=self.start + timedelta(hours=2, minutes=5),
            duration_seconds=300.0,
            estimated_energy_kwh=Decimal("10.0"),
            estimated_wasted_energy_kwh=None,  # Preserved null
            detection_reason="START_STOP_CYCLING",
            confidence_score=0.7,
            status="detected",
        )
        self.event_repo.get_events_intersecting_range.return_value = [ev1, ev2]

        report = self.report_service.generate_energy_wastage_report(
            start_time=self.start,
            end_time=self.end,
            machine_id=self.machine_id,
        )

        self.assertEqual(report.actual_energy_kwh, 150.25)
        self.assertEqual(report.estimated_wasted_energy_kwh, 18.5)
        self.assertEqual(report.total_wastage_events, 2)
        # Verify unestimated events tracked separately
        self.assertEqual(report.unestimated_wastage_events, 1)
        self.assertEqual(len(report.by_reason), 2)

        cycling_breakdown = next(r for r in report.by_reason if r.reason == "START_STOP_CYCLING")
        self.assertIsNone(cycling_breakdown.estimated_wasted_energy_kwh)
        self.assertEqual(cycling_breakdown.unestimated_event_count, 1)

        idle_breakdown = next(r for r in report.by_reason if r.reason == "IDLE_WASTAGE")
        self.assertEqual(idle_breakdown.estimated_wasted_energy_kwh, 18.5)

    def test_csv_export_format_and_escaping(self) -> None:
        self.machine_repo.get_by_id.return_value = self.machine
        summary = EnergySummaryResponse(
            machine_id=self.machine_id,
            start_time=self.start,
            end_time=self.end,
            actual_energy_kwh=100.0,
            estimated_wasted_energy_kwh=10.0,
            wastage_event_count=1,
            operating_duration_seconds=1000.0,
            idle_duration_seconds=200.0,
            low_load_duration_seconds=0.0,
            abnormal_power_duration_seconds=0.0,
            data_coverage_ratio=0.9,
            quality=EnergyDataQuality.GOOD,
            telemetry_sample_count=1000,
        )
        self.energy_service.get_energy_summary.return_value = summary
        ev = EnergyWastageEvent(
            id=uuid4(),
            machine_id=self.machine_id,
            start_time=self.start,
            end_time=self.end,
            duration_seconds=3600.0,
            estimated_energy_kwh=Decimal("50.0"),
            estimated_wasted_energy_kwh=Decimal("10.0"),
            detection_reason="IDLE_WASTAGE",
            confidence_score=0.95,
            status="detected",
        )
        self.event_repo.get_events_intersecting_range.return_value = [ev]

        report = self.report_service.generate_energy_wastage_report(
            start_time=self.start,
            end_time=self.end,
            machine_id=self.machine_id,
        )

        csv_output = self.report_service.generate_csv(report)
        self.assertIn("# ORVEX Energy Wastage Report", csv_output)
        self.assertIn("DEMO-CONV-01", csv_output)
        self.assertIn("IDLE_WASTAGE", csv_output)
        self.assertIn("10.0000", csv_output)
        self.assertIn("Estimated Wasted Energy (kWh)", csv_output)

    def test_report_endpoints(self) -> None:
        app = create_app()
        mock_svc = MagicMock(spec=ReportService)
        app.dependency_overrides[get_report_service] = lambda: mock_svc
        client = TestClient(app)

        mock_report = EnergyWastageReportResponse(
            start_time=self.start,
            end_time=self.end,
            actual_energy_kwh=50.0,
            estimated_wasted_energy_kwh=5.0,
            total_wastage_events=1,
            unestimated_wastage_events=0,
            total_event_duration_seconds=300.0,
            data_coverage_ratio=0.9,
            overall_quality="GOOD",
            by_reason=[],
            by_machine=[],
            events_detail=[],
            generated_at=datetime.now(timezone.utc),
        )
        mock_svc.generate_energy_wastage_report.return_value = mock_report
        mock_svc.generate_csv.return_value = "col1,col2\nval1,val2\n"

        # 1. JSON endpoint
        resp_json = client.get("/api/v1/reports/energy-wastage?start_time=2026-10-29T00:00:00Z&end_time=2026-10-30T00:00:00Z")
        self.assertEqual(resp_json.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_json.json()["actual_energy_kwh"], 50.0)

        # 2. CSV via ?format=csv
        resp_csv1 = client.get("/api/v1/reports/energy-wastage?format=csv")
        self.assertEqual(resp_csv1.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_csv1.headers["content-type"], "text/csv; charset=utf-8")
        self.assertIn("col1,col2", resp_csv1.text)

        # 3. CSV via /energy-wastage/csv
        resp_csv2 = client.get("/api/v1/reports/energy-wastage/csv")
        self.assertEqual(resp_csv2.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_csv2.headers["content-type"], "text/csv; charset=utf-8")


if __name__ == "__main__":
    unittest.main()

