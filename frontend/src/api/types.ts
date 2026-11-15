/**
 * ORVEX Frontend API Data Contracts
 * Strictly aligned with backend FastAPI Pydantic response schemas.
 */

export interface HealthResponse {
  status: string;
}

export interface MachineResponse {
  id: string;
  site_id: string;
  machine_identifier: string;
  name: string;
  machine_type: string;
  rated_power_kw: number | null;
  status: string;
  created_at: string;
}

export interface MachineListResponse {
  items: MachineResponse[];
  total: number;
  limit: number;
  offset: number;
}

export type TelemetryFreshness = "fresh" | "stale" | "missing";

export interface MachineSummaryResponse {
  id: string;
  site_id: string;
  machine_identifier: string;
  name: string;
  machine_type: string;
  rated_power_kw: number | null;
  status: string;
  telemetry_freshness: TelemetryFreshness;
  latest_telemetry_timestamp: string | null;
  latest_operating_state: string | null;
  latest_active_power: number | null;
  latest_power_factor: number | null;
  latest_temperature: number | null;
  latest_load_percent: number | null;
}

export interface TelemetryRecordResponse {
  timestamp: string;
  machine_id: string;
  sensor_id: string | null;
  voltage: number | null;
  current: number | null;
  active_power: number | null;
  reactive_power: number | null;
  apparent_power: number | null;
  power_factor: number | null;
  cumulative_energy: number | null;
  rpm: number | null;
  temperature: number | null;
  load_percent: number | null;
  operating_state: string | null;
}

export interface TelemetryListResponse {
  items: TelemetryRecordResponse[];
  total: number;
  limit: number;
  offset: number;
}

export type EnergyDataQuality = "GOOD" | "PARTIAL" | "INSUFFICIENT_DATA";

export interface EnergySummaryResponse {
  machine_id: string;
  start_time: string;
  end_time: string;
  actual_energy_kwh: number | null;
  estimated_wasted_energy_kwh: number | null;
  wastage_event_count: number;
  operating_duration_seconds: number | null;
  idle_duration_seconds: number | null;
  low_load_duration_seconds: number | null;
  abnormal_power_duration_seconds: number | null;
  data_coverage_ratio: number;
  quality: EnergyDataQuality;
  telemetry_sample_count: number;
}

export interface WastageEventResponse {
  id: string;
  machine_id: string;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  detection_reason: string;
  severity: string;
  estimated_energy_kwh: number | null;
  estimated_wasted_energy_kwh: number | null;
  confidence_score: number | null;
  quality_score: number | null;
  status: string;
  evidence_metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface WastageEventListResponse {
  items: WastageEventResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface MachineQueryParams {
  limit?: number;
  offset?: number;
  status?: string;
}

export interface TelemetryQueryParams {
  start_time?: string;
  end_time?: string;
  limit?: number;
  offset?: number;
}

export interface EnergySummaryQueryParams {
  start_time: string;
  end_time: string;
}

export interface WastageEventQueryParams {
  machine_id?: string;
  detection_reason?: string;
  status?: string;
  start_time?: string;
  end_time?: string;
  limit?: number;
  offset?: number;
}


// --- Stage 5A: Alerts & Energy-Wastage Reports ---

export type AlertSeverity = "info" | "low" | "medium" | "high" | "critical";
export type AlertStatus = "open" | "acknowledged" | "resolved" | "dismissed";

export interface AlertRecord {
  id: string;
  machine_id: string;
  machine_identifier: string | null;
  machine_name: string | null;
  event_id: string | null;
  alert_type: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  recommendation: string;
  status: AlertStatus;
  occurred_at: string;
  resolved_at: string | null;
  created_at: string;
}

export interface AlertListResponse {
  items: AlertRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface AlertQueryParams {
  machine_id?: string;
  severity?: string;
  alert_type?: string;
  status?: string;
  start_time?: string;
  end_time?: string;
  limit?: number;
  offset?: number;
}

export interface ReportReasonBreakdown {
  reason: string;
  event_count: number;
  total_duration_seconds: number;
  estimated_wasted_energy_kwh: number | null;
  unestimated_event_count: number;
}

export interface ReportMachineBreakdown {
  machine_id: string;
  machine_identifier: string;
  machine_name: string;
  machine_type: string;
  actual_energy_kwh: number | null;
  estimated_wasted_energy_kwh: number | null;
  total_wastage_events: number;
  unestimated_wastage_events: number;
  total_event_duration_seconds: number;
  data_coverage_ratio: number;
  quality: string;
}

export interface ReportEventDetail {
  event_id: string;
  machine_id: string;
  machine_identifier: string;
  machine_name: string;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  detection_reason: string;
  estimated_wasted_energy_kwh: number | null;
  confidence_score: number | null;
  status: string;
}

export interface EnergyWastageReportResponse {
  start_time: string;
  end_time: string;
  machine_id: string | null;
  machine_name: string | null;
  actual_energy_kwh: number | null;
  estimated_wasted_energy_kwh: number | null;
  total_wastage_events: number;
  unestimated_wastage_events: number;
  total_event_duration_seconds: number;
  data_coverage_ratio: number | null;
  overall_quality: string;
  by_reason: ReportReasonBreakdown[];
  by_machine: ReportMachineBreakdown[];
  events_detail: ReportEventDetail[];
  generated_at: string;
}

export interface ReportQueryParams {
  start_time?: string;
  end_time?: string;
  machine_id?: string;
  format?: string;
}

// --- Stage 7A: Explainable Energy Intelligence ---

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
export type DataQualityClassification = "GOOD" | "PARTIAL" | "INSUFFICIENT_DATA";
export type BaselineStatus = "NORMAL" | "DEVIATION_DETECTED" | "INSUFFICIENT_DATA";
export type ImpactClassification = "IMPROVED" | "REGRESSED" | "NO_SIGNIFICANT_CHANGE" | "INSUFFICIENT_DATA";
export type PriorityLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface ExplainableInsight {
  insight_id: string;
  machine_id: string;
  machine_name: string;
  insight_type: string;
  title: string;
  severity: string;
  start_time: string;
  end_time: string;
  observation_window_description: string;
  supporting_event_ids: string[];
  telemetry_evidence: Record<string, string | number | null>;
  measured_values: Record<string, number | null>;
  applicable_thresholds: Record<string, number | null>;
  estimated_wasted_energy_kwh: number | null;
  energy_unit: string;
  confidence: ConfidenceLevel;
  confidence_definition: string;
  explanation: string;
  recommended_action: string;
  limitations: string;
}

export interface MachinePrioritization {
  machine_id: string;
  machine_identifier: string;
  machine_name: string;
  machine_type: string;
  priority_rank: number;
  priority_score: number;
  priority_level: PriorityLevel;
  estimated_wasted_energy_kwh: number | null;
  wastage_events_count: number;
  wasted_duration_hours: number;
  data_coverage_ratio: number;
  data_quality: DataQualityClassification;
  estimated_cost_impact: number | null;
  cost_currency: string;
  score_breakdown: {
    wastage_score: number;
    recurrence_score: number;
    duration_score: number;
    quality_multiplier: number;
  };
  key_contributing_factor: string;
}

export interface FleetIntelligenceSummary {
  start_time: string;
  end_time: string;
  monitored_machines_count: number;
  total_actual_energy_kwh: number | null;
  total_wasted_energy_kwh: number | null;
  total_unestimated_events_count: number;
  fleet_wastage_percentage: number | null;
  assumed_energy_tariff_per_kwh: number;
  estimated_fleet_cost_impact: number | null;
  tariff_assumptions_note: string;
  scoring_formula_note: string;
  priority_rankings: MachinePrioritization[];
  top_insights: ExplainableInsight[];
  data_quality_summary: Record<string, number>;
  generated_at: string;
}

export interface PatternBreakdown {
  pattern_type: string;
  pattern_name: string;
  description: string;
  affected_machine_count: number;
  affected_machine_names: string[];
  total_event_count: number;
  recurrence_rate_events_per_day: number;
  total_duration_hours: number;
  estimated_wasted_energy_kwh: number | null;
  typical_operating_conditions: string;
  representative_event_ids: string[];
  recommended_countermeasure: string;
  pattern_limitations: string;
}

export interface PatternAnalysisResponse {
  start_time: string;
  end_time: string;
  patterns: PatternBreakdown[];
  total_quantified_wasted_kwh: number | null;
  unquantified_pattern_count: number;
  deduplication_method_note: string;
  generated_at: string;
}

export interface MachineBaselineResponse {
  machine_id: string;
  machine_name: string;
  machine_type: string;
  rated_power_kw: number | null;
  observation_start_time: string;
  observation_end_time: string;
  baseline_status: BaselineStatus;
  is_baseline_valid: boolean;
  insufficient_data_reason: string | null;
  required_history_hours: number;
  available_history_hours: number;
  telemetry_samples_evaluated: number;
  baseline_metrics: Record<string, number | null>;
  current_metrics: Record<string, number | null>;
  deviation_percentage: number | null;
  explanation: string;
  methodology_and_limitations: string;
}

export interface CorrectiveActionCreate {
  machine_id: string;
  action_type: string;
  title: string;
  description?: string | null;
  performed_at: string;
  operator_name?: string | null;
  notes?: string | null;
}

export interface CorrectiveActionResponse {
  id: string;
  machine_id: string;
  action_type: string;
  title: string;
  description: string | null;
  performed_at: string;
  operator_name: string | null;
  notes: string | null;
  created_at: string;
}

export interface PeriodMetrics {
  start_time: string;
  end_time: string;
  duration_hours: number;
  telemetry_sample_count: number;
  data_coverage_ratio: number;
  actual_energy_kwh: number | null;
  estimated_wasted_energy_kwh: number | null;
  idle_duration_hours: number;
  wastage_event_count: number;
  average_active_power_kw: number | null;
}

export interface ActionImpactResponse {
  action: CorrectiveActionResponse;
  evaluation_window_hours: number;
  pre_action_period: PeriodMetrics;
  post_action_period: PeriodMetrics;
  impact_status: ImpactClassification;
  is_statistically_comparable: boolean;
  comparability_notes: string;
  absolute_wasted_energy_delta_kwh: number | null;
  percentage_wasted_energy_delta: number | null;
  absolute_idle_hours_delta: number | null;
  event_count_delta: number;
  summary_explanation: string;
  causality_disclaimer: string;
}

export interface MachineInsightDetailResponse {
  machine_id: string;
  machine_identifier: string;
  machine_name: string;
  machine_type: string;
  rated_power_kw: number | null;
  prioritization: MachinePrioritization;
  insights: ExplainableInsight[];
  baseline: MachineBaselineResponse;
  recent_actions: CorrectiveActionResponse[];
  telemetry_freshness: string;
  data_quality: DataQualityClassification;
  generated_at: string;
}

// ==========================================
// Machine Health & Predictive Maintenance
// ==========================================

export type HealthSeverity = "NORMAL" | "WATCH" | "WARNING" | "CRITICAL";
export type HealthStatus = "HEALTHY" | "WATCH" | "WARNING" | "CRITICAL" | "INSUFFICIENT_DATA";
export type ChannelStatus = "ACTIVE_HARDWARE" | "AUXILIARY_SIMULATED" | "UNMEASURED_NOT_INSTALLED";

export interface MachineHealthWarning {
  id: string;
  machine_id: string;
  machine_name?: string | null;
  warning_type: string;
  severity: HealthSeverity;
  status: "open" | "acknowledged" | "resolved";
  detected_at: string;
  window_start: string;
  window_end: string;
  observed_value: number;
  baseline_value: number | null;
  threshold_value: number | null;
  unit: string;
  severity_rationale: string;
  telemetry_evidence: Record<string, unknown>;
  confidence_score: number;
  data_quality: string;
  recommended_action: string;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

export interface MaintenanceObservation {
  id: string;
  machine_id: string;
  machine_name?: string | null;
  warning_id?: string | null;
  inspector_name: string;
  inspection_date: string;
  suspected_issue: string;
  corrective_action?: string | null;
  status: "open" | "acknowledged" | "resolved";
  notes?: string | null;
  created_at: string;
}

export interface MaintenanceObservationCreate {
  machine_id: string;
  inspector_name: string;
  inspection_date: string;
  suspected_issue: string;
  corrective_action?: string | null;
  status?: "open" | "acknowledged" | "resolved";
  notes?: string | null;
  warning_id?: string | null;
}

export interface SubScoreBreakdown {
  electrical_stability?: number | null;
  thermal_margin?: number | null;
  operational_consistency?: number | null;
  state_stability?: number | null;
  weights_applied?: Record<string, number>;
}

export interface ChannelCoverageReport {
  channel_name: string;
  status: ChannelStatus;
  sample_count: number;
  description: string;
}

export interface MachineHealthDetailResponse {
  machine_id: string;
  machine_name: string;
  machine_type: string;
  rated_power_kw: number | null;
  health_score: number | null;
  health_status: HealthStatus;
  sub_scores: SubScoreBreakdown;
  channels: ChannelCoverageReport[];
  data_coverage_hours: number;
  telemetry_sample_count: number;
  insufficient_data_reason?: string | null;
  active_warnings: MachineHealthWarning[];
  recent_observations: MaintenanceObservation[];
  causality_disclaimer: string;
}

export interface FleetHealthSummaryResponse {
  fleet_health_score: number | null;
  total_machines_monitored: number;
  status_breakdown: Record<string, number>;
  active_warnings_count: number;
  active_warnings_by_severity: Record<string, number>;
  unmeasured_channels: string[];
  recent_observations_count: number;
  last_evaluated_at: string;
  causality_disclaimer: string;
}

export interface SystemStatusResponse {
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  uptime_seconds: number;
  database: {
    status: string;
    latency_ms: number | null;
    url_redacted: string;
  };
  mqtt_gateway: {
    enabled: boolean;
    running: boolean;
    connected: boolean;
    broker: string;
    topic_prefix: string;
    subscribed_topic: string;
    messages_received: number;
    messages_ingested: number;
    messages_rejected: number;
    last_connected_at?: string | null;
    last_disconnected_at?: string | null;
    last_message_at?: string | null;
    note?: string;
  };
  active_monitoring: {
    open_alerts: number;
    active_health_warnings: number;
  };
  security_posture: {
    environment: string;
    allowed_cors_origins: string[];
    rate_limiting_enabled: boolean;
    rate_limit_per_minute: number;
    max_payload_bytes: number;
    tls_enabled: boolean;
    api_authentication: string;
    security_warning?: string;
  };
  system: {
    python_version: string;
    os: string;
    architecture: string;
  };
}

