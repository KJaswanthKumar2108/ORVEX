import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { EnergyIntelligenceView } from "../pages/EnergyIntelligenceView";
import { endpoints } from "../api/endpoints";
import type {
  ActionImpactResponse,
  CorrectiveActionResponse,
  FleetIntelligenceSummary,
  MachineBaselineResponse,
  MachineSummaryResponse,
  PatternAnalysisResponse,
} from "../api/types";

const mockMachines: MachineSummaryResponse[] = [
  {
    id: "m-1",
    site_id: "site-1",
    machine_identifier: "CRUSH-01",
    name: "Primary Jaw Crusher",
    machine_type: "crusher",
    rated_power_kw: 132.0,
    status: "active",
    telemetry_freshness: "fresh",
    latest_telemetry_timestamp: "2026-10-30T10:00:00Z",
    latest_operating_state: "RUNNING",
    latest_active_power: 95.0,
    latest_power_factor: 0.88,
    latest_temperature: 65.0,
    latest_load_percent: 72.0,
  },
];

const mockFleetSummary: FleetIntelligenceSummary = {
  start_time: "2026-10-29T10:00:00Z",
  end_time: "2026-10-30T10:00:00Z",
  monitored_machines_count: 1,
  total_actual_energy_kwh: 1500.0,
  total_wasted_energy_kwh: 120.5,
  total_unestimated_events_count: 1,
  fleet_wastage_percentage: 8.03,
  assumed_energy_tariff_per_kwh: 0.12,
  estimated_fleet_cost_impact: 14.46,
  tariff_assumptions_note: "Monetary estimate based on an assumed flat electricity tariff of $0.12/kWh.",
  scoring_formula_note: "Priority Score formula note",
  priority_rankings: [
    {
      machine_id: "m-1",
      machine_identifier: "CRUSH-01",
      machine_name: "Primary Jaw Crusher",
      machine_type: "crusher",
      priority_rank: 1,
      priority_score: 55.4,
      priority_level: "HIGH",
      estimated_wasted_energy_kwh: 120.5,
      wastage_events_count: 3,
      wasted_duration_hours: 2.5,
      data_coverage_ratio: 0.94,
      data_quality: "GOOD",
      estimated_cost_impact: 14.46,
      cost_currency: "USD",
      score_breakdown: {
        wastage_score: 25.4,
        recurrence_score: 15.0,
        duration_score: 15.0,
        quality_multiplier: 1.0,
      },
      key_contributing_factor: "High quantified energy wastage (120.5 kWh)",
    },
  ],
  top_insights: [],
  data_quality_summary: { GOOD: 1, PARTIAL: 0, INSUFFICIENT_DATA: 0 },
  generated_at: "2026-10-30T10:00:00Z",
};

const mockPatterns: PatternAnalysisResponse = {
  start_time: "2026-10-29T10:00:00Z",
  end_time: "2026-10-30T10:00:00Z",
  patterns: [
    {
      pattern_type: "IDLE_WASTAGE",
      pattern_name: "Recurring Sustained Idle Wastage",
      description: "Motors kept fully energized while unloaded.",
      affected_machine_count: 1,
      affected_machine_names: ["Primary Jaw Crusher"],
      total_event_count: 2,
      recurrence_rate_events_per_day: 2.0,
      total_duration_hours: 2.0,
      estimated_wasted_energy_kwh: 120.5,
      typical_operating_conditions: "Shift changes and meal breaks",
      representative_event_ids: ["ev-1"],
      recommended_countermeasure: "Implement 5-minute auto-off timer",
      pattern_limitations: "Assumes constant no-load power",
    },
    {
      pattern_type: "START_STOP_CYCLING",
      pattern_name: "Frequent Start/Stop Cycling Stress",
      description: "Repeated start/stop cycles.",
      affected_machine_count: 1,
      affected_machine_names: ["Primary Jaw Crusher"],
      total_event_count: 1,
      recurrence_rate_events_per_day: 1.0,
      total_duration_hours: 0.5,
      estimated_wasted_energy_kwh: null, // Unquantified
      typical_operating_conditions: "Hunting bin level switch",
      representative_event_ids: ["ev-2"],
      recommended_countermeasure: "Increase deadband on bin level switches",
      pattern_limitations: "Energy wastage is unquantified; primary risk is motor winding failure",
    },
  ],
  total_quantified_wasted_kwh: 120.5,
  unquantified_pattern_count: 1,
  deduplication_method_note: "Deduplicated note",
  generated_at: "2026-10-30T10:00:00Z",
};

const mockBaselineValid: MachineBaselineResponse = {
  machine_id: "m-1",
  machine_name: "Primary Jaw Crusher",
  machine_type: "crusher",
  rated_power_kw: 132.0,
  observation_start_time: "2026-10-29T10:00:00Z",
  observation_end_time: "2026-10-30T10:00:00Z",
  baseline_status: "NORMAL",
  is_baseline_valid: true,
  insufficient_data_reason: null,
  required_history_hours: 1.0,
  available_history_hours: 14.5,
  telemetry_samples_evaluated: 450,
  baseline_metrics: {
    baseline_idle_power_kw: 22.5,
    baseline_running_power_kw: 92.0,
    baseline_power_factor: 0.88,
  },
  current_metrics: {
    current_average_power_kw: 95.0,
    current_idle_power_kw: 23.0,
    current_average_power_factor: 0.87,
  },
  deviation_percentage: 3.3,
  explanation: "Machine operating metrics are within normal baseline tolerances.",
  methodology_and_limitations: "Baseline derived solely from this machine's own historical telemetry.",
};

const mockActions: CorrectiveActionResponse[] = [
  {
    id: "act-1",
    machine_id: "m-1",
    action_type: "operational_change",
    title: "Programmed 5-min auto-shutoff timer",
    description: "Added timer logic to PLC",
    performed_at: "2026-10-29T12:00:00Z",
    operator_name: "Lead Electrical Engineer",
    notes: null,
    created_at: "2026-10-29T12:00:00Z",
  },
];

const mockActionImpact: ActionImpactResponse = {
  action: mockActions[0],
  evaluation_window_hours: 24.0,
  pre_action_period: {
    start_time: "2026-10-28T12:00:00Z",
    end_time: "2026-10-29T12:00:00Z",
    duration_hours: 24.0,
    telemetry_sample_count: 480,
    data_coverage_ratio: 0.95,
    actual_energy_kwh: 1200.0,
    estimated_wasted_energy_kwh: 85.0,
    idle_duration_hours: 4.0,
    wastage_event_count: 3,
    average_active_power_kw: 50.0,
  },
  post_action_period: {
    start_time: "2026-10-29T12:00:00Z",
    end_time: "2026-10-30T12:00:00Z",
    duration_hours: 24.0,
    telemetry_sample_count: 480,
    data_coverage_ratio: 0.95,
    actual_energy_kwh: 1130.0,
    estimated_wasted_energy_kwh: 15.0,
    idle_duration_hours: 0.8,
    wastage_event_count: 1,
    average_active_power_kw: 47.0,
  },
  impact_status: "IMPROVED",
  is_statistically_comparable: true,
  comparability_notes: "Symmetrical 24h periods",
  absolute_wasted_energy_delta_kwh: -70.0,
  percentage_wasted_energy_delta: -82.4,
  absolute_idle_hours_delta: -3.2,
  event_count_delta: -2,
  summary_explanation: "Energy wastage decreased by 82.4% following action.",
  causality_disclaimer:
    "Correlation does not establish causation. Observed changes in energy consumption may be influenced by ore feed variability, maintenance cycles, operational stoppages, or unmonitored plant variables.",
};

describe("EnergyIntelligenceView Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(endpoints, "getFleetIntelligence").mockResolvedValue(mockFleetSummary);
    vi.spyOn(endpoints, "getWastagePatterns").mockResolvedValue(mockPatterns);
    vi.spyOn(endpoints, "getMachineBaseline").mockResolvedValue(mockBaselineValid);
    vi.spyOn(endpoints, "getCorrectiveActions").mockResolvedValue(mockActions);
    vi.spyOn(endpoints, "getActionImpact").mockResolvedValue(mockActionImpact);
  });

  it("renders intelligence KPIs, machine prioritization, and patterns correctly", async () => {
    render(<EnergyIntelligenceView machines={mockMachines} onSelectMachine={vi.fn()} />);

    // Check title
    expect(screen.getByText("Explainable Energy Intelligence")).toBeInTheDocument();

    // Check KPIs
    await waitFor(() => {
      expect(screen.getAllByText(/120\.50 kWh/i).length).toBeGreaterThan(0);
      expect(screen.getByText("Primary Jaw Crusher")).toBeInTheDocument();
      expect(screen.getByText("55.4 / 100")).toBeInTheDocument();
      expect(screen.getByText("HIGH")).toBeInTheDocument();
    });

    // Check Patterns
    expect(screen.getByText("Recurring Sustained Idle Wastage")).toBeInTheDocument();
    expect(screen.getByText("Frequent Start/Stop Cycling Stress")).toBeInTheDocument();
    expect(screen.getByText("Unquantified (stress)")).toBeInTheDocument();

    // Check Causality Disclaimer
    await waitFor(() => {
      expect(screen.getByText(/Correlation does not establish causation/i)).toBeInTheDocument();
    });
  }, 15000);

  it("renders baseline insufficient data warning when history is lacking", async () => {
    vi.spyOn(endpoints, "getMachineBaseline").mockResolvedValueOnce({
      ...mockBaselineValid,
      is_baseline_valid: false,
      baseline_status: "INSUFFICIENT_DATA",
      insufficient_data_reason:
        "Insufficient historical telemetry: 0.2 hours available, minimum 1.0 hour required.",
    });

    render(<EnergyIntelligenceView machines={mockMachines} onSelectMachine={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByText(/Baseline Withheld — Insufficient Telemetry History/i)
      ).toBeInTheDocument();
    });
  }, 15000);
});
