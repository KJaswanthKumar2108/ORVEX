from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class HealthSeverity(str, Enum):
    NORMAL = "NORMAL"
    WATCH = "WATCH"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class HealthStatus(str, Enum):
    HEALTHY = "HEALTHY"
    WATCH = "WATCH"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


class ChannelStatus(str, Enum):
    ACTIVE_HARDWARE = "ACTIVE_HARDWARE"
    AUXILIARY_SIMULATED = "AUXILIARY_SIMULATED"
    UNMEASURED_NOT_INSTALLED = "UNMEASURED_NOT_INSTALLED"


class WarningType(str, Enum):
    TEMPERATURE_HIGH_SUSTAINED = "TEMPERATURE_HIGH_SUSTAINED"
    POWER_FLUCTUATION = "POWER_FLUCTUATION"
    RPM_FLUCTUATION_OR_SLIP = "RPM_FLUCTUATION_OR_SLIP"
    STATE_THRASHING = "STATE_THRASHING"
    VIBRATION_ANOMALY = "VIBRATION_ANOMALY"


class MachineHealthWarningResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    machine_id: UUID
    machine_name: str | None = None
    warning_type: str
    severity: HealthSeverity
    status: str
    detected_at: datetime
    window_start: datetime
    window_end: datetime
    observed_value: float
    baseline_value: float | None = None
    threshold_value: float | None = None
    unit: str
    severity_rationale: str
    telemetry_evidence: dict[str, Any]
    confidence_score: float = Field(ge=0.0, le=1.0)
    data_quality: str
    recommended_action: str
    acknowledged_at: datetime | None = None
    acknowledged_by: str | None = None
    resolved_at: datetime | None = None
    created_at: datetime


class WarningAcknowledgeRequest(BaseModel):
    acknowledged_by: str = Field(min_length=1, max_length=128)
    notes: str | None = Field(default=None, max_length=1000)


class MaintenanceObservationCreate(BaseModel):
    machine_id: UUID
    inspector_name: str = Field(min_length=1, max_length=128)
    inspection_date: datetime
    suspected_issue: str = Field(min_length=1, max_length=255)
    corrective_action: str | None = Field(default=None, max_length=2000)
    status: str = Field(default="open", pattern="^(open|acknowledged|resolved)$")
    notes: str | None = Field(default=None, max_length=2000)
    warning_id: UUID | None = None


class MaintenanceObservationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    machine_id: UUID
    machine_name: str | None = None
    warning_id: UUID | None = None
    inspector_name: str
    inspection_date: datetime
    suspected_issue: str
    corrective_action: str | None = None
    status: str
    notes: str | None = None
    created_at: datetime


class SubScoreBreakdown(BaseModel):
    electrical_stability: float | None = None
    thermal_margin: float | None = None
    operational_consistency: float | None = None
    state_stability: float | None = None
    weights_applied: dict[str, float] = Field(default_factory=dict)


class ChannelCoverageReport(BaseModel):
    channel_name: str
    status: ChannelStatus
    sample_count: int
    description: str


class MachineHealthDetailResponse(BaseModel):
    machine_id: UUID
    machine_name: str
    machine_type: str
    rated_power_kw: float | None = None
    health_score: float | None = None
    health_status: HealthStatus
    sub_scores: SubScoreBreakdown
    channels: list[ChannelCoverageReport]
    data_coverage_hours: float
    telemetry_sample_count: int
    insufficient_data_reason: str | None = None
    active_warnings: list[MachineHealthWarningResponse]
    recent_observations: list[MaintenanceObservationResponse]
    causality_disclaimer: str = (
        "Condition monitoring indicators reflect electrical, thermal, and operational stability. "
        "They indicate abnormal operating behaviour and do not guarantee mechanical failure prevention, "
        "nor do they estimate remaining useful life without validated destructive test history."
    )


class FleetHealthSummaryResponse(BaseModel):
    fleet_health_score: float | None = None
    total_machines_monitored: int
    status_breakdown: dict[str, int]
    active_warnings_count: int
    active_warnings_by_severity: dict[str, int]
    unmeasured_channels: list[str] = Field(default_factory=list)
    recent_observations_count: int
    last_evaluated_at: datetime
    causality_disclaimer: str = (
        "Fleet condition scores represent observable stability and thermal margin from available telemetry. "
        "Physical vibration monitoring is unmeasured until accelerometer hardware is retrofitted."
    )

