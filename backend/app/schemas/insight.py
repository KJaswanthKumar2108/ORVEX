from __future__ import annotations

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ConfidenceLevel(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class DataQualityClassification(str, Enum):
    GOOD = "GOOD"
    PARTIAL = "PARTIAL"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


class BaselineStatus(str, Enum):
    NORMAL = "NORMAL"
    DEVIATION_DETECTED = "DEVIATION_DETECTED"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


class ImpactClassification(str, Enum):
    IMPROVED = "IMPROVED"
    REGRESSED = "REGRESSED"
    NO_SIGNIFICANT_CHANGE = "NO_SIGNIFICANT_CHANGE"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


class PriorityLevel(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class ExplainableInsight(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    insight_id: UUID
    machine_id: UUID
    machine_name: str
    insight_type: str = Field(
        description="Categorical insight type, e.g. RECURRING_IDLE_WASTAGE, CHRONIC_LOW_LOAD, ABNORMAL_POWER_SPIKE, FREQUENT_CYCLING_STRESS"
    )
    title: str
    severity: str
    start_time: datetime
    end_time: datetime
    observation_window_description: str
    supporting_event_ids: list[UUID]
    telemetry_evidence: dict[str, float | str | int | None]
    measured_values: dict[str, float | None]
    applicable_thresholds: dict[str, float | None]
    estimated_wasted_energy_kwh: float | None = Field(
        description="Conservative estimated energy wastage in kWh, or null if unquantified (e.g. cycling events)"
    )
    energy_unit: str = "kWh"
    confidence: ConfidenceLevel
    confidence_definition: str
    explanation: str
    recommended_action: str
    limitations: str


class MachinePrioritization(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    machine_id: UUID
    machine_identifier: str
    machine_name: str
    machine_type: str
    priority_rank: int
    priority_score: float = Field(
        description="Deterministic composite score from 0.0 to 100.0 based on wasted kWh, recurrence, duration, and data quality"
    )
    priority_level: PriorityLevel
    estimated_wasted_energy_kwh: float | None
    wastage_events_count: int
    wasted_duration_hours: float
    data_coverage_ratio: float
    data_quality: DataQualityClassification
    estimated_cost_impact: float | None = Field(
        description="Estimated monetary cost using the configured tariff assumption"
    )
    cost_currency: str = "USD"
    score_breakdown: dict[str, float] = Field(
        description="Component points: wastage_score (max 45), recurrence_score (max 25), duration_score (max 20), quality_multiplier (0.5-1.0)"
    )
    key_contributing_factor: str


class FleetIntelligenceSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    start_time: datetime
    end_time: datetime
    monitored_machines_count: int
    total_actual_energy_kwh: float | None
    total_wasted_energy_kwh: float | None
    total_unestimated_events_count: int
    fleet_wastage_percentage: float | None
    assumed_energy_tariff_per_kwh: float
    estimated_fleet_cost_impact: float | None
    tariff_assumptions_note: str
    scoring_formula_note: str
    priority_rankings: list[MachinePrioritization]
    top_insights: list[ExplainableInsight]
    data_quality_summary: dict[str, int]
    generated_at: datetime


class PatternBreakdown(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    pattern_type: str
    pattern_name: str
    description: str
    affected_machine_count: int
    affected_machine_names: list[str]
    total_event_count: int
    recurrence_rate_events_per_day: float
    total_duration_hours: float
    estimated_wasted_energy_kwh: float | None
    typical_operating_conditions: str
    representative_event_ids: list[UUID]
    recommended_countermeasure: str
    pattern_limitations: str


class PatternAnalysisResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    start_time: datetime
    end_time: datetime
    patterns: list[PatternBreakdown]
    total_quantified_wasted_kwh: float | None
    unquantified_pattern_count: int
    deduplication_method_note: str
    generated_at: datetime


class MachineBaselineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    machine_id: UUID
    machine_name: str
    machine_type: str
    rated_power_kw: float | None
    observation_start_time: datetime
    observation_end_time: datetime
    baseline_status: BaselineStatus
    is_baseline_valid: bool
    insufficient_data_reason: str | None
    required_history_hours: float
    available_history_hours: float
    telemetry_samples_evaluated: int
    baseline_metrics: dict[str, float | None]
    current_metrics: dict[str, float | None]
    deviation_percentage: float | None
    explanation: str
    methodology_and_limitations: str


class CorrectiveActionCreate(BaseModel):
    machine_id: UUID
    action_type: str = Field(description="operational_change, maintenance_repair, parameter_tuning, equipment_replacement")
    title: str
    description: str | None = None
    performed_at: datetime
    operator_name: str | None = None
    notes: str | None = None


class CorrectiveActionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    machine_id: UUID
    action_type: str
    title: str
    description: str | None
    performed_at: datetime
    operator_name: str | None
    notes: str | None
    created_at: datetime


class PeriodMetrics(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    start_time: datetime
    end_time: datetime
    duration_hours: float
    telemetry_sample_count: int
    data_coverage_ratio: float
    actual_energy_kwh: float | None
    estimated_wasted_energy_kwh: float | None
    idle_duration_hours: float
    wastage_event_count: int
    average_active_power_kw: float | None


class ActionImpactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    action: CorrectiveActionResponse
    evaluation_window_hours: float
    pre_action_period: PeriodMetrics
    post_action_period: PeriodMetrics
    impact_status: ImpactClassification
    is_statistically_comparable: bool
    comparability_notes: str
    absolute_wasted_energy_delta_kwh: float | None
    percentage_wasted_energy_delta: float | None
    absolute_idle_hours_delta: float | None
    event_count_delta: int
    summary_explanation: str
    causality_disclaimer: str = (
        "Correlation does not establish causation. Observed changes in energy consumption may be influenced "
        "by ore feed variability, maintenance cycles, operational stoppages, or unmonitored plant variables."
    )


class MachineInsightDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    machine_id: UUID
    machine_identifier: str
    machine_name: str
    machine_type: str
    rated_power_kw: float | None
    prioritization: MachinePrioritization
    insights: list[ExplainableInsight]
    baseline: MachineBaselineResponse
    recent_actions: list[CorrectiveActionResponse]
    telemetry_freshness: str
    data_quality: DataQualityClassification
    generated_at: datetime

