from datetime import datetime, timezone
import unittest
from unittest.mock import MagicMock
from uuid import uuid4

from fastapi import status
from fastapi.testclient import TestClient

from app.api.routes.insights import get_insight_service
from app.main import create_app
from app.schemas.insight import (
    BaselineStatus,
    ConfidenceLevel,
    CorrectiveActionResponse,
    DataQualityClassification,
    ExplainableInsight,
    FleetIntelligenceSummary,
    ImpactClassification,
    MachineBaselineResponse,
    MachineInsightDetailResponse,
    MachinePrioritization,
    PatternAnalysisResponse,
    PatternBreakdown,
    PeriodMetrics,
    PriorityLevel,
)
from app.services.machine_service import MachineNotFoundError


class TestInsightAPI(unittest.TestCase):
    def setUp(self) -> None:
        self.app = create_app()
        self.mock_service = MagicMock()
        self.app.dependency_overrides[get_insight_service] = lambda: self.mock_service
        self.client = TestClient(self.app)

        self.machine_id = uuid4()
        self.now = datetime(2026, 10, 30, 12, 0, 0, tzinfo=timezone.utc)

    def tearDown(self) -> None:
        self.app.dependency_overrides.clear()

    def test_get_fleet_summary_api(self) -> None:
        self.mock_service.get_fleet_summary.return_value = FleetIntelligenceSummary(
            start_time=self.now,
            end_time=self.now,
            monitored_machines_count=1,
            total_actual_energy_kwh=100.0,
            total_wasted_energy_kwh=15.0,
            total_unestimated_events_count=0,
            fleet_wastage_percentage=15.0,
            assumed_energy_tariff_per_kwh=0.12,
            estimated_fleet_cost_impact=1.80,
            tariff_assumptions_note="Note",
            scoring_formula_note="Formula",
            priority_rankings=[
                MachinePrioritization(
                    machine_id=self.machine_id,
                    machine_identifier="M1",
                    machine_name="Conveyor 1",
                    machine_type="conveyor",
                    priority_rank=1,
                    priority_score=45.0,
                    priority_level=PriorityLevel.HIGH,
                    estimated_wasted_energy_kwh=15.0,
                    wastage_events_count=2,
                    wasted_duration_hours=1.0,
                    data_coverage_ratio=0.95,
                    data_quality=DataQualityClassification.GOOD,
                    estimated_cost_impact=1.80,
                    cost_currency="USD",
                    score_breakdown={
                        "wastage_score": 25.0,
                        "recurrence_score": 10.0,
                        "duration_score": 10.0,
                        "quality_multiplier": 1.0,
                    },
                    key_contributing_factor="High wastage",
                )
            ],
            top_insights=[],
            data_quality_summary={"GOOD": 1, "PARTIAL": 0, "INSUFFICIENT_DATA": 0},
            generated_at=self.now,
        )

        response = self.client.get("/api/v1/insights/summary")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["monitored_machines_count"] == 1
        assert len(data["priority_rankings"]) == 1
        assert data["priority_rankings"][0]["priority_score"] == 45.0

    def test_get_pattern_analysis_api(self) -> None:
        self.mock_service.get_pattern_analysis.return_value = PatternAnalysisResponse(
            start_time=self.now,
            end_time=self.now,
            patterns=[
                PatternBreakdown(
                    pattern_type="IDLE_WASTAGE",
                    pattern_name="Recurring Sustained Idle Wastage",
                    description="Desc",
                    affected_machine_count=1,
                    affected_machine_names=["Conveyor 1"],
                    total_event_count=3,
                    recurrence_rate_events_per_day=3.0,
                    total_duration_hours=2.0,
                    estimated_wasted_energy_kwh=25.0,
                    typical_operating_conditions="Conditions",
                    representative_event_ids=[],
                    recommended_countermeasure="Action",
                    pattern_limitations="Limits",
                )
            ],
            total_quantified_wasted_kwh=25.0,
            unquantified_pattern_count=0,
            deduplication_method_note="Note",
            generated_at=self.now,
        )

        response = self.client.get("/api/v1/insights/patterns")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data["patterns"]) == 1
        assert data["patterns"][0]["estimated_wasted_energy_kwh"] == 25.0

    def test_get_baseline_api_not_found(self) -> None:
        self.mock_service.get_machine_baseline.side_effect = MachineNotFoundError("Machine not found")
        response = self.client.get(f"/api/v1/insights/baseline?machine_id={self.machine_id}")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_corrective_action_crud_flow(self) -> None:
        action_id = uuid4()
        sample_action = CorrectiveActionResponse(
            id=action_id,
            machine_id=self.machine_id,
            action_type="parameter_tuning",
            title="Calibrated feeder frequency",
            description="Tuned VFD minimum frequency",
            performed_at=self.now,
            operator_name="Operator J",
            notes=None,
            created_at=self.now,
        )

        self.mock_service.record_corrective_action.return_value = sample_action
        self.mock_service.list_corrective_actions.return_value = [sample_action]
        self.mock_service.delete_corrective_action.return_value = True

        # 1. Create action
        payload = {
            "machine_id": str(self.machine_id),
            "action_type": "parameter_tuning",
            "title": "Calibrated feeder frequency",
            "performed_at": self.now.isoformat(),
            "operator_name": "Operator J",
        }
        res_post = self.client.post("/api/v1/insights/actions", json=payload)
        assert res_post.status_code == status.HTTP_201_CREATED
        assert res_post.json()["title"] == "Calibrated feeder frequency"

        # 2. List actions
        res_get = self.client.get(f"/api/v1/insights/actions?machine_id={self.machine_id}")
        assert res_get.status_code == status.HTTP_200_OK
        assert len(res_get.json()) == 1

        # 3. Delete action
        res_del = self.client.delete(f"/api/v1/insights/actions/{action_id}")
        assert res_del.status_code == status.HTTP_200_OK
        assert res_del.json()["deleted"] is True

    def test_invalid_time_range(self) -> None:
        response = self.client.get(
            "/api/v1/insights/summary?start_time=2026-10-30T15:00:00Z&end_time=2026-10-30T10:00:00Z"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

