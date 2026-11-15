from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.db.models import CorrectiveAction, EnergyWastageEvent, Machine, Telemetry
from app.repositories.corrective_action_repository import CorrectiveActionRepository
from app.repositories.machine_repository import MachineRepository
from app.repositories.telemetry_repository import TelemetryRepository
from app.repositories.wastage_event_repository import WastageEventRepository
from app.schemas.energy import EnergySummaryResponse
from app.schemas.insight import (
    BaselineStatus,
    ConfidenceLevel,
    CorrectiveActionCreate,
    DataQualityClassification,
    ImpactClassification,
    PeriodMetrics,
    PriorityLevel,
)
from app.services.energy_analytics_service import EnergyAnalyticsService
from app.services.insight_service import (
    DEFAULT_TARIFF_PER_KWH,
    MINIMUM_BASELINE_HISTORY_HOURS,
    MINIMUM_BASELINE_SAMPLES,
    InsightService,
)


@pytest.fixture
def mock_repos():
    machine_repo = MagicMock(spec=MachineRepository)
    telemetry_repo = MagicMock(spec=TelemetryRepository)
    event_repo = MagicMock(spec=WastageEventRepository)
    action_repo = MagicMock(spec=CorrectiveActionRepository)
    energy_service = MagicMock(spec=EnergyAnalyticsService)

    service = InsightService(
        machine_repository=machine_repo,
        telemetry_repository=telemetry_repo,
        wastage_event_repository=event_repo,
        corrective_action_repository=action_repo,
        energy_analytics_service=energy_service,
        energy_tariff_per_kwh=0.15,
    )
    return service, machine_repo, telemetry_repo, event_repo, action_repo, energy_service


class TestInsightService:
    def test_calculate_prioritization_scoring(self, mock_repos):
        service, _, _, _, _, _ = mock_repos

        machine = Machine(
            id=uuid4(),
            machine_identifier="CRUSH-01",
            name="Primary Jaw Crusher",
            machine_type="crusher",
            rated_power_kw=Decimal("100.0"),
        )

        # 100 kWh wasted on 100 kW machine -> ratio 1.0 -> wastage_score = 15.0
        # 3 events -> recurrence_score = 15.0
        # 3600s (1.0 hr) -> duration_score = 10.0
        # Data quality GOOD -> multiplier 1.0
        # Total = 15 + 15 + 10 = 40.0 -> Priority HIGH
        prio = service._calculate_prioritization(
            machine=machine,
            wasted_kwh=100.0,
            event_count=3,
            wasted_duration_seconds=3600.0,
            coverage_ratio=0.95,
            data_quality=DataQualityClassification.GOOD,
        )

        assert prio.priority_score == 40.0
        assert prio.priority_level == PriorityLevel.HIGH
        assert prio.score_breakdown["wastage_score"] == 15.0
        assert prio.score_breakdown["recurrence_score"] == 15.0
        assert prio.score_breakdown["duration_score"] == 10.0
        assert prio.score_breakdown["quality_multiplier"] == 1.0
        assert prio.estimated_cost_impact == round(100.0 * 0.15, 2)

    def test_calculate_prioritization_partial_quality_penalty(self, mock_repos):
        service, _, _, _, _, _ = mock_repos

        machine = Machine(
            id=uuid4(),
            machine_identifier="CONV-01",
            name="Conveyor 1",
            machine_type="conveyor",
            rated_power_kw=Decimal("50.0"),
        )

        # 100 kWh on 50 kW -> ratio 2.0 -> wastage_score = 30.0
        # 2 events -> recurrence_score = 10.0
        # 1800s (0.5 hr) -> duration_score = 5.0
        # Raw = 45.0. Data quality PARTIAL -> multiplier 0.75 -> 45 * 0.75 = 33.75 -> round to 33.8
        prio = service._calculate_prioritization(
            machine=machine,
            wasted_kwh=100.0,
            event_count=2,
            wasted_duration_seconds=1800.0,
            coverage_ratio=0.50,
            data_quality=DataQualityClassification.PARTIAL,
        )

        assert prio.priority_score == 33.8
        assert prio.priority_level == PriorityLevel.MEDIUM
        assert prio.score_breakdown["quality_multiplier"] == 0.75

    def test_pattern_analysis_unquantified_cycling(self, mock_repos):
        service, machine_repo, _, event_repo, _, _ = mock_repos

        m_id = uuid4()
        machine = Machine(id=m_id, machine_identifier="M1", name="Ball Mill", machine_type="mill")
        machine_repo.list_machines.return_value = ([machine], 1)

        now = datetime.now(timezone.utc)
        # Create 1 idle event with 25.0 kWh and 1 cycling event with None kWh
        ev_idle = EnergyWastageEvent(
            id=uuid4(),
            machine_id=m_id,
            start_time=now - timedelta(hours=2),
            end_time=now - timedelta(hours=1),
            duration_seconds=3600.0,
            detection_reason="IDLE_WASTAGE",
            estimated_energy_kwh=Decimal("30.0"),
            estimated_wasted_energy_kwh=Decimal("25.0"),
        )
        ev_cycling = EnergyWastageEvent(
            id=uuid4(),
            machine_id=m_id,
            start_time=now - timedelta(minutes=40),
            end_time=now - timedelta(minutes=10),
            duration_seconds=1800.0,
            detection_reason="START_STOP_CYCLING",
            estimated_energy_kwh=Decimal("15.0"),
            estimated_wasted_energy_kwh=None,  # Crucial: unquantified
        )

        event_repo.get_all_events_in_range.return_value = [ev_idle, ev_cycling]

        response = service.get_pattern_analysis(now - timedelta(hours=3), now)

        assert len(response.patterns) == 4
        cycling_pat = next(p for p in response.patterns if p.pattern_type == "START_STOP_CYCLING")
        assert cycling_pat.total_event_count == 1
        assert cycling_pat.estimated_wasted_energy_kwh is None  # MUST remain None
        assert response.unquantified_pattern_count == 1

        idle_pat = next(p for p in response.patterns if p.pattern_type == "IDLE_WASTAGE")
        assert idle_pat.total_event_count == 1
        assert idle_pat.estimated_wasted_energy_kwh == 25.0

    def test_baseline_insufficient_data(self, mock_repos):
        service, machine_repo, telemetry_repo, _, _, _ = mock_repos

        m_id = uuid4()
        machine = Machine(id=m_id, machine_identifier="M1", name="SAG Mill", machine_type="mill")
        machine_repo.get_by_id.return_value = machine

        # Only 5 samples over 10 minutes -> far below minimum 1.0 hour / 30 samples
        now = datetime.now(timezone.utc)
        telemetry_repo.get_all_in_range.return_value = [
            Telemetry(timestamp=now - timedelta(minutes=i * 2), machine_id=m_id, active_power=50.0)
            for i in range(5)
        ]

        baseline = service.get_machine_baseline(m_id, now - timedelta(hours=1), now)

        assert baseline.is_baseline_valid is False
        assert baseline.baseline_status == BaselineStatus.INSUFFICIENT_DATA
        assert baseline.insufficient_data_reason is not None
        assert "Insufficient historical telemetry" in baseline.insufficient_data_reason

    def test_baseline_valid_and_deviation(self, mock_repos):
        service, machine_repo, telemetry_repo, _, _, _ = mock_repos

        m_id = uuid4()
        machine = Machine(
            id=m_id,
            machine_identifier="M1",
            name="SAG Mill",
            machine_type="mill",
            rated_power_kw=Decimal("200.0"),
        )
        machine_repo.get_by_id.return_value = machine

        # 60 historical samples spanning prior 2 hours (140 to 22 minutes ago)
        now = datetime.now(timezone.utc)
        records = []
        for i in range(60):
            ts = now - timedelta(minutes=140 - (i * 2))
            records.append(
                Telemetry(
                    timestamp=ts,
                    machine_id=m_id,
                    active_power=140.0,
                    power_factor=0.88,
                    operating_state="RUNNING",
                )
            )

        # Recent records in current window (last 20 mins) elevated to 180 kW (+28.5% deviation)
        for i in range(10):
            ts = now - timedelta(minutes=20 - (i * 2))
            records.append(
                Telemetry(
                    timestamp=ts,
                    machine_id=m_id,
                    active_power=180.0,
                    power_factor=0.85,
                    operating_state="RUNNING",
                )
            )

        telemetry_repo.get_all_in_range.return_value = records

        baseline = service.get_machine_baseline(m_id, now - timedelta(minutes=20), now)

        assert baseline.is_baseline_valid is True
        assert baseline.baseline_status == BaselineStatus.DEVIATION_DETECTED
        assert baseline.deviation_percentage is not None
        assert baseline.deviation_percentage > 15.0

    def test_action_impact_insufficient_data(self, mock_repos):
        service, _, _, _, action_repo, _ = mock_repos

        m_id = uuid4()
        action_id = uuid4()
        action = CorrectiveAction(
            id=action_id,
            machine_id=m_id,
            action_type="maintenance_repair",
            title="Greased head pulley bearing",
            performed_at=datetime.now(timezone.utc) - timedelta(hours=12),
        )
        action_repo.get_by_id.return_value = action

        # Simulate empty telemetry period metrics
        service._compute_period_metrics = MagicMock(
            return_value=PeriodMetrics(
                start_time=datetime.now(timezone.utc),
                end_time=datetime.now(timezone.utc),
                duration_hours=24.0,
                telemetry_sample_count=2,  # < min_samples
                data_coverage_ratio=0.05,  # < min coverage
                actual_energy_kwh=None,
                estimated_wasted_energy_kwh=None,
                idle_duration_hours=0.0,
                wastage_event_count=0,
                average_active_power_kw=None,
            )
        )

        impact = service.assess_action_impact(action_id, window_hours=24.0)

        assert impact.is_statistically_comparable is False
        assert impact.impact_status == ImpactClassification.INSUFFICIENT_DATA
        assert "Correlation does not establish causation" in impact.causality_disclaimer

    def test_action_impact_improved_quantification(self, mock_repos):
        service, _, _, _, action_repo, _ = mock_repos

        m_id = uuid4()
        action_id = uuid4()
        action_time = datetime.now(timezone.utc) - timedelta(hours=24)
        action = CorrectiveAction(
            id=action_id,
            machine_id=m_id,
            action_type="operational_change",
            title="Adjusted conveyor idle auto-shutoff to 3 minutes",
            performed_at=action_time,
        )
        action_repo.get_by_id.return_value = action

        # Pre-action period: 100 kWh wasted, 4 events, 5.0 idle hours
        pre_metrics = PeriodMetrics(
            start_time=action_time - timedelta(hours=24),
            end_time=action_time,
            duration_hours=24.0,
            telemetry_sample_count=500,
            data_coverage_ratio=0.92,
            actual_energy_kwh=1200.0,
            estimated_wasted_energy_kwh=100.0,
            idle_duration_hours=5.0,
            wastage_event_count=4,
            average_active_power_kw=55.0,
        )

        # Post-action period: 20 kWh wasted, 1 event, 1.0 idle hours
        post_metrics = PeriodMetrics(
            start_time=action_time,
            end_time=action_time + timedelta(hours=24),
            duration_hours=24.0,
            telemetry_sample_count=490,
            data_coverage_ratio=0.90,
            actual_energy_kwh=1120.0,
            estimated_wasted_energy_kwh=20.0,
            idle_duration_hours=1.0,
            wastage_event_count=1,
            average_active_power_kw=51.0,
        )

        def mock_compute(machine_id, start_time, end_time):
            if start_time < action_time:
                return pre_metrics
            return post_metrics

        service._compute_period_metrics = mock_compute

        impact = service.assess_action_impact(action_id, window_hours=24.0)

        assert impact.is_statistically_comparable is True
        assert impact.impact_status == ImpactClassification.IMPROVED
        assert impact.absolute_wasted_energy_delta_kwh == -80.0
        assert impact.percentage_wasted_energy_delta == -80.0
        assert impact.absolute_idle_hours_delta == -4.0
        assert impact.event_count_delta == -3
        assert "Correlation does not establish causation" in impact.causality_disclaimer
