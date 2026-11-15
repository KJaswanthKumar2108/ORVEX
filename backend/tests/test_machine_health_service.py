from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.db.models import Machine, MachineHealthWarning, MaintenanceObservation, Telemetry
from app.repositories.machine_health_repository import MachineHealthRepository
from app.repositories.machine_repository import MachineRepository
from app.repositories.telemetry_repository import TelemetryRepository
from app.schemas.machine_health import (
    ChannelCoverageReport,
    ChannelStatus,
    HealthSeverity,
    HealthStatus,
    MaintenanceObservationCreate,
    WarningType,
)
from app.services.machine_health_service import (
    CRITICAL_TEMP_C,
    DEFAULT_BASELINE_TEMP_C,
    MINIMUM_HEALTH_HISTORY_HOURS,
    MINIMUM_HEALTH_TELEMETRY_SAMPLES,
    WARNING_TEMP_C,
    WATCH_TEMP_C,
    MachineHealthService,
)


def make_test_machine(name: str = "Jaw Crusher 01", rated_power_kw: float = 132.0) -> Machine:
    return Machine(
        id=uuid4(),
        site_id=uuid4(),
        machine_identifier=f"MACH-{uuid4().hex[:6]}",
        name=name,
        machine_type="Crusher",
        rated_power_kw=rated_power_kw,
        status="active",
    )


def make_telemetry_series(
    machine_id,
    start_time: datetime,
    count: int = 40,
    interval_seconds: int = 120,
    *,
    power_kw: float = 80.0,
    power_jitter: float = 0.0,
    current_a: float = 130.0,
    temperature_c: float | None = 65.0,
    temperature_drift_per_sample: float = 0.0,
    rpm: float | None = 1480.0,
    operating_state: str = "OPTIMAL",
    state_thrashing: bool = False,
) -> list[Telemetry]:
    records = []
    current_temp = temperature_c
    states = ["OPTIMAL", "LOW_LOAD", "HIGH_LOAD", "OFF"]
    for i in range(count):
        t = start_time + timedelta(seconds=i * interval_seconds)
        jitter = ((i % 5) - 2) * power_jitter
        actual_power = max(0.0, power_kw + jitter)
        temp_val = (current_temp + i * temperature_drift_per_sample) if current_temp is not None else None
        state_val = states[i % 4] if state_thrashing else operating_state
        records.append(
            Telemetry(
                id=uuid4(),
                machine_id=machine_id,
                timestamp=t,
                active_power=actual_power,
                current=current_a,
                voltage=415.0,
                reactive_power=20.0,
                apparent_power=82.0,
                power_factor=0.92,
                cumulative_energy=100.0 + (i * 2.5),
                temperature=temp_val,
                rpm=rpm,
                load_percentage=65.0,
                operating_state=state_val,
            )
        )
    return records


class TestMachineHealthService:
    def setup_method(self) -> None:
        self.mock_machine_repo = MagicMock(spec=MachineRepository)
        self.mock_telemetry_repo = MagicMock(spec=TelemetryRepository)
        self.mock_health_repo = MagicMock(spec=MachineHealthRepository)
        self.service = MachineHealthService(
            machine_repository=self.mock_machine_repo,
            telemetry_repository=self.mock_telemetry_repo,
            health_repository=self.mock_health_repo,
        )

    def test_feature_extraction_healthy_stream(self) -> None:
        machine = make_test_machine()
        t0 = datetime(2026, 11, 4, 10, 0, 0, tzinfo=timezone.utc)
        telemetry = make_telemetry_series(machine.id, t0, count=40, power_kw=80.0, power_jitter=1.0)

        features = self.service._extract_telemetry_features(telemetry, machine)

        assert features["sample_count"] == 40
        assert features["coverage_hours"] > 1.0
        assert features["power_mean"] == pytest.approx(80.0, abs=1.0)
        assert features["power_cv"] < 0.05  # highly stable
        assert features["temp_mean"] == pytest.approx(65.0, abs=0.5)
        assert features["state_transitions"] == 0

    def test_insufficient_data_scoring_safeguard(self) -> None:
        machine = make_test_machine()
        # Only 5 samples (less than MINIMUM_HEALTH_TELEMETRY_SAMPLES=30)
        t0 = datetime(2026, 11, 4, 10, 0, 0, tzinfo=timezone.utc)
        telemetry = make_telemetry_series(machine.id, t0, count=5, interval_seconds=10)
        features = self.service._extract_telemetry_features(telemetry, machine)

        score, status, breakdown, reason = self.service.calculate_health_score(features, active_warnings=[])

        assert score is None
        assert status == HealthStatus.INSUFFICIENT_DATA
        assert reason is not None
        assert "Insufficient historical telemetry" in reason
        assert breakdown.electrical_stability is None

    def test_healthy_machine_high_score(self) -> None:
        machine = make_test_machine()
        t0 = datetime(2026, 11, 4, 10, 0, 0, tzinfo=timezone.utc)
        # 40 samples over 80 minutes: stable power, normal temperature (65°C), stable states
        telemetry = make_telemetry_series(
            machine.id, t0, count=40, interval_seconds=120, power_kw=80.0, power_jitter=0.5, temperature_c=65.0
        )
        features = self.service._extract_telemetry_features(telemetry, machine)

        score, status, breakdown, reason = self.service.calculate_health_score(features, active_warnings=[])

        assert score is not None
        assert score >= 85.0
        assert status == HealthStatus.HEALTHY
        assert reason is None
        assert breakdown.electrical_stability is not None and breakdown.electrical_stability > 90.0
        assert breakdown.thermal_margin is not None and breakdown.thermal_margin > 90.0

    def test_sustained_temperature_anomaly_rule(self) -> None:
        machine = make_test_machine()
        t0 = datetime(2026, 11, 4, 10, 0, 0, tzinfo=timezone.utc)
        # 40 samples at 96°C (above critical threshold 95°C)
        telemetry = make_telemetry_series(
            machine.id, t0, count=40, interval_seconds=120, temperature_c=96.0, power_kw=80.0
        )
        features = self.service._extract_telemetry_features(telemetry, machine)

        warnings = self.service.evaluate_condition_rules(machine, features, persist=False)

        temp_warnings = [w for w in warnings if w.warning_type == WarningType.TEMPERATURE_HIGH_SUSTAINED.value]
        assert len(temp_warnings) == 1
        w = temp_warnings[0]
        assert w.severity == HealthSeverity.CRITICAL.value
        assert w.observed_value >= 95.0
        assert "thermal saturation" in w.severity_rationale
        assert "Inspect motor cooling" in w.recommended_action
        assert w.telemetry_evidence["temp_mean_c"] >= 95.0

    def test_electrical_power_volatility_rule(self) -> None:
        machine = make_test_machine()
        t0 = datetime(2026, 11, 4, 10, 0, 0, tzinfo=timezone.utc)
        # Severe power jitter: power_jitter=25 on 80kW baseline yields CV > 0.45
        telemetry = make_telemetry_series(
            machine.id, t0, count=40, interval_seconds=120, power_kw=80.0, power_jitter=25.0
        )
        features = self.service._extract_telemetry_features(telemetry, machine)

        warnings = self.service.evaluate_condition_rules(machine, features, persist=False)

        elec_warnings = [w for w in warnings if w.warning_type == WarningType.POWER_FLUCTUATION.value]
        assert len(elec_warnings) == 1
        w = elec_warnings[0]
        assert w.severity in [HealthSeverity.WARNING.value, HealthSeverity.CRITICAL.value]
        assert "mechanical binding" in w.severity_rationale or "fluctuation" in w.severity_rationale

    def test_state_thrashing_rule(self) -> None:
        machine = make_test_machine()
        t0 = datetime(2026, 11, 4, 10, 0, 0, tzinfo=timezone.utc)
        # State thrashing alternating every sample
        telemetry = make_telemetry_series(
            machine.id, t0, count=40, interval_seconds=120, state_thrashing=True
        )
        features = self.service._extract_telemetry_features(telemetry, machine)

        warnings = self.service.evaluate_condition_rules(machine, features, persist=False)

        thrash_warnings = [w for w in warnings if w.warning_type == WarningType.STATE_THRASHING.value]
        assert len(thrash_warnings) == 1
        w = thrash_warnings[0]
        assert w.severity in [HealthSeverity.WARNING.value, HealthSeverity.CRITICAL.value]
        assert "state thrashing" in w.severity_rationale.lower() or "cycling" in w.severity_rationale.lower()

    def test_score_capping_with_critical_warning(self) -> None:
        machine = make_test_machine()
        t0 = datetime(2026, 11, 4, 10, 0, 0, tzinfo=timezone.utc)
        telemetry = make_telemetry_series(machine.id, t0, count=40, interval_seconds=120, power_kw=80.0)
        features = self.service._extract_telemetry_features(telemetry, machine)

        # Create active CRITICAL warning
        critical_warning = MachineHealthWarning(
            id=uuid4(),
            machine_id=machine.id,
            warning_type=WarningType.TEMPERATURE_HIGH_SUSTAINED.value,
            severity=HealthSeverity.CRITICAL.value,
            status="open",
            detected_at=t0,
            window_start=t0,
            window_end=t0 + timedelta(hours=1),
            observed_value=98.0,
            unit="°C",
            severity_rationale="Overheating",
            telemetry_evidence={},
            confidence_score=0.9,
            data_quality="HIGH",
            recommended_action="Inspect",
        )

        score, status, _, _ = self.service.calculate_health_score(features, active_warnings=[critical_warning])

        assert score is not None
        assert score <= 40.0
        assert status == HealthStatus.CRITICAL

    def test_dynamic_weight_renormalization_for_missing_temperature(self) -> None:
        machine = make_test_machine()
        t0 = datetime(2026, 11, 4, 10, 0, 0, tzinfo=timezone.utc)
        # Telemetry with NO temperature readings (temperature_c=None)
        telemetry = make_telemetry_series(
            machine.id, t0, count=40, interval_seconds=120, temperature_c=None, power_kw=80.0
        )
        features = self.service._extract_telemetry_features(telemetry, machine)

        score, status, breakdown, reason = self.service.calculate_health_score(features, active_warnings=[])

        assert score is not None
        assert status == HealthStatus.HEALTHY
        assert breakdown.thermal_margin is None
        # Verify that remaining weights sum to 1.0
        weights = breakdown.weights_applied
        assert "thermal_margin" not in weights
        assert sum(weights.values()) == pytest.approx(1.0, abs=1e-3)

    def test_idempotent_warning_refresh_prevents_duplicates(self) -> None:
        machine = make_test_machine()
        now = datetime.now(timezone.utc)
        existing_warning = MachineHealthWarning(
            id=uuid4(),
            machine_id=machine.id,
            warning_type=WarningType.POWER_FLUCTUATION.value,
            severity=HealthSeverity.WATCH.value,
            status="open",
            detected_at=now - timedelta(minutes=30),
            window_start=now - timedelta(hours=1),
            window_end=now,
            observed_value=0.20,
            unit="CV",
            severity_rationale="Initial watch",
            telemetry_evidence={},
            confidence_score=0.9,
            data_quality="HIGH",
            recommended_action="Check load",
        )
        self.mock_health_repo.get_active_warning.return_value = existing_warning
        self.mock_health_repo.update_warning.side_effect = lambda w: w

        updated = self.service._build_or_update_warning(
            machine_id=machine.id,
            warning_type=WarningType.POWER_FLUCTUATION.value,
            severity=HealthSeverity.WARNING.value,
            detected_at=now,
            window_start=now - timedelta(hours=1),
            window_end=now,
            observed_value=0.35,
            baseline_value=0.08,
            threshold_value=0.30,
            unit="CV",
            severity_rationale="Escalated to warning",
            telemetry_evidence={"cv": 0.35},
            confidence_score=0.92,
            data_quality="HIGH",
            recommended_action="Inspect connections",
            persist=True,
        )

        assert updated.id == existing_warning.id
        assert updated.severity == HealthSeverity.WARNING.value
        assert updated.observed_value == 0.35
        self.mock_health_repo.create_warning.assert_not_called()
        self.mock_health_repo.update_warning.assert_called_once()

    def test_maintenance_observation_creation_and_auto_resolution(self) -> None:
        machine = make_test_machine()
        self.mock_machine_repo.get_by_id.return_value = machine
        warning_id = uuid4()

        saved_obs = MaintenanceObservation(
            id=uuid4(),
            machine_id=machine.id,
            warning_id=warning_id,
            inspector_name="John Doe",
            inspection_date=datetime.now(timezone.utc),
            suspected_issue="Bearing friction",
            corrective_action="Lubricated bearings and tightened drive belt",
            status="resolved",
            notes="Machine running smoothly now",
        )
        self.mock_health_repo.create_observation.return_value = saved_obs

        payload = MaintenanceObservationCreate(
            machine_id=machine.id,
            warning_id=warning_id,
            inspector_name="John Doe",
            inspection_date=datetime.now(timezone.utc),
            suspected_issue="Bearing friction",
            corrective_action="Lubricated bearings and tightened drive belt",
            status="resolved",
            notes="Machine running smoothly now",
        )

        resp = self.service.create_observation(payload)

        assert resp.id == saved_obs.id
        assert resp.status == "resolved"
        # Verify linked warning was automatically marked resolved
        self.mock_health_repo.resolve_warning.assert_called_once_with(warning_id)

