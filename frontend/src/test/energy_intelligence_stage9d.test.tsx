import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EnergyPerformanceOverview } from "../components/intelligence/EnergyPerformanceOverview";
import { WastageInvestigationTable } from "../components/intelligence/WastageInvestigationTable";
import { ExplainableIntelligencePanel } from "../components/intelligence/ExplainableIntelligencePanel";
import { BaselineAndActionImpact } from "../components/intelligence/BaselineAndActionImpact";
import type {
  FleetIntelligenceSummary,
  MachineBaselineResponse,
  MachineSummaryResponse,
  WastageEventResponse,
  ActionImpactResponse,
  CorrectiveActionResponse,
  ExplainableInsight,
} from "../api/types";

const mockMachine: MachineSummaryResponse = {
  id: "m-jaw-01",
  site_id: "site-01",
  machine_identifier: "CRUSH-01",
  name: "Primary Jaw Crusher",
  machine_type: "crusher",
  rated_power_kw: 132.0,
  status: "active",
  telemetry_freshness: "fresh",
  latest_telemetry_timestamp: "2026-11-04T12:00:00Z",
  latest_operating_state: "RUNNING",
  latest_active_power: 95.0,
  latest_power_factor: 0.88,
  latest_temperature: 65.0,
  latest_load_percent: 72.0,
};

const mockSummaryWithData: FleetIntelligenceSummary = {
  start_time: "2026-11-03T12:00:00Z",
  end_time: "2026-11-04T12:00:00Z",
  monitored_machines_count: 3,
  total_actual_energy_kwh: 2450.5,
  total_wasted_energy_kwh: 185.2,
  total_unestimated_events_count: 1,
  fleet_wastage_percentage: 7.56,
  assumed_energy_tariff_per_kwh: 0.12,
  estimated_fleet_cost_impact: 22.22,
  tariff_assumptions_note: "Assumed flat tariff note",
  scoring_formula_note: "Formula note",
  priority_rankings: [],
  top_insights: [],
  data_quality_summary: { GOOD: 3, PARTIAL: 0, INSUFFICIENT_DATA: 0 },
  generated_at: "2026-11-04T12:00:00Z",
};

const mockSummaryEmptyData: FleetIntelligenceSummary = {
  start_time: "2026-11-03T12:00:00Z",
  end_time: "2026-11-04T12:00:00Z",
  monitored_machines_count: 1,
  total_actual_energy_kwh: 0,
  total_wasted_energy_kwh: null,
  total_unestimated_events_count: 0,
  fleet_wastage_percentage: null,
  assumed_energy_tariff_per_kwh: 0.12,
  estimated_fleet_cost_impact: null,
  tariff_assumptions_note: "Assumed flat tariff note",
  scoring_formula_note: "Formula note",
  priority_rankings: [],
  top_insights: [],
  data_quality_summary: { GOOD: 0, PARTIAL: 0, INSUFFICIENT_DATA: 1 },
  generated_at: "2026-11-04T12:00:00Z",
};

const mockEvents: WastageEventResponse[] = [
  {
    id: "ev-idle-101",
    machine_id: "m-jaw-01",
    start_time: "2026-11-04T08:00:00Z",
    end_time: "2026-11-04T08:45:00Z",
    duration_seconds: 2700,
    detection_reason: "sustained_idle",
    severity: "high",
    estimated_energy_kwh: 22.5,
    estimated_wasted_energy_kwh: 18.2,
    confidence_score: 0.95,
    quality_score: 1.0,
    status: "open",
    evidence_metadata: {
      power_draw_kw: 24.2,
      idle_baseline_kw: 22.5,
      motor_rated_kw: 132.0,
      duration_minutes: 45,
    },
    created_at: "2026-11-04T08:45:00Z",
  },
  {
    id: "ev-cycle-102",
    machine_id: "m-jaw-01",
    start_time: "2026-11-04T09:00:00Z",
    end_time: "2026-11-04T09:15:00Z",
    duration_seconds: 900,
    detection_reason: "rapid_cycling",
    severity: "critical",
    estimated_energy_kwh: 8.0,
    estimated_wasted_energy_kwh: null, // Stress pattern: unquantified
    confidence_score: 0.9,
    quality_score: 0.9,
    status: "acknowledged",
    evidence_metadata: {
      cycle_count: 6,
      period_minutes: 15,
      threshold_max_cycles: 3,
    },
    created_at: "2026-11-04T09:15:00Z",
  },
];

const mockInsight: ExplainableInsight = {
  insight_id: "ins-01",
  machine_id: "m-jaw-01",
  machine_name: "Primary Jaw Crusher",
  insight_type: "SUSTAINED_IDLE",
  title: "Sustained Unloaded Idle Operation",
  severity: "HIGH",
  start_time: "2026-11-04T08:00:00Z",
  end_time: "2026-11-04T08:45:00Z",
  observation_window_description: "Crusher ran for 45 minutes drawing 24 kW without any material throughput.",
  supporting_event_ids: ["ev-idle-101"],
  telemetry_evidence: { power_draw_kw: 24.2 },
  measured_values: { active_power: 24.2 },
  applicable_thresholds: { idle_threshold: 25.0 },
  estimated_wasted_energy_kwh: 18.2,
  energy_unit: "kWh",
  confidence: "HIGH",
  confidence_definition: "Deterministic sensor integration above baseline",
  explanation: "Power draw remained continuously within idle band (20-30 kW) exceeding the 15-minute threshold.",
  recommended_action: "Interlock jaw crusher main motor with primary surge bin level switch or feeder PLC.",
  limitations: "Assumes continuous idle operation without unmonitored ore pulses.",
};

describe("Energy Intelligence Subcomponents (Stage 9D)", () => {
  it("renders executive KPI values accurately and calculates avoidable spend", () => {
    render(
      <EnergyPerformanceOverview
        summary={mockSummaryWithData}
        timeRangeLabel="Trailing 24 Hours"
      />
    );

    expect(screen.getByText("Fleet Energy Consumption & Wastage Overview")).toBeInTheDocument();
    expect(screen.getByText("2,450.50 kWh")).toBeInTheDocument();
    expect(screen.getByText(/185\.20 kWh/i)).toBeInTheDocument();
    expect(screen.getByText("7.6%")).toBeInTheDocument();
    expect(screen.getByText("$22.22")).toBeInTheDocument();
  });

  it("handles empty/zero energy gracefully without fabricating NaN percentages", () => {
    render(
      <EnergyPerformanceOverview
        summary={mockSummaryEmptyData}
        timeRangeLabel="Trailing 24 Hours"
      />
    );

    expect(screen.getByText("Awaiting valid power data")).toBeInTheDocument();
    // Must display em-dash "—" for missing/invalid wastage share
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("renders wastage episodes table and preserves unquantified label for cycling stress", () => {
    render(
      <WastageInvestigationTable
        events={mockEvents}
        machineNamesMap={{ "m-jaw-01": "Primary Jaw Crusher" }}
      />
    );

    expect(screen.getByText("Wastage Episodes & Engineering Evidence Investigation")).toBeInTheDocument();
    expect(screen.getByText(/sustained idle/i)).toBeInTheDocument();
    expect(screen.getByText(/rapid cycling/i)).toBeInTheDocument();

    // The unquantified cycling event must explicitly state cycling stress, not 0.00 kWh
    expect(screen.getByText("Not quantified (cycling stress)")).toBeInTheDocument();
    expect(screen.getByText(/18\.20 kWh/i)).toBeInTheDocument();

    // Click "Evidence" button to open modal dossier
    const evidenceButtons = screen.getAllByText("Evidence");
    fireEvent.click(evidenceButtons[0]);
    expect(screen.getByText(/Evidence Dossier:/i)).toBeInTheDocument();
    expect(screen.getByText("Deterministic Quantification Formula")).toBeInTheDocument();
  });

  it("renders explainable intelligence panel with 6-point breakdown and measured vs calculated indicators", () => {
    render(
      <ExplainableIntelligencePanel
        insights={[mockInsight]}
      />
    );

    expect(screen.getByText("Explainable Energy Intelligence Insights")).toBeInTheDocument();
    expect(screen.getByText("1. What Happened")).toBeInTheDocument();
    expect(screen.getByText("2. Why ORVEX Detected It")).toBeInTheDocument();
    expect(screen.getByText("3. Supporting Physical Measurements")).toBeInTheDocument();
    expect(screen.getByText("4. Quantified Energy Loss")).toBeInTheDocument();
    expect(screen.getByText("5. Recommended Operator Countermeasure (SOP)")).toBeInTheDocument();

    // Check Measured vs Calculated distinction
    expect(screen.getByText("Measured Sensor Value")).toBeInTheDocument();
    expect(screen.getByText("Calculated Estimate")).toBeInTheDocument();
  });

  it("evaluates baseline data sufficiency and warns when historical depth is below threshold", () => {
    const insufficientBaseline: MachineBaselineResponse = {
      machine_id: "m-jaw-01",
      machine_name: "Primary Jaw Crusher",
      machine_type: "crusher",
      rated_power_kw: 132.0,
      observation_start_time: "2026-11-04T11:45:00Z",
      observation_end_time: "2026-11-04T12:00:00Z",
      baseline_status: "INSUFFICIENT_DATA",
      is_baseline_valid: false,
      insufficient_data_reason:
        "Insufficient historical telemetry: 0.25 hours available, minimum 1.0 hour required.",
      required_history_hours: 1.0,
      available_history_hours: 0.25,
      telemetry_samples_evaluated: 15,
      baseline_metrics: {
        baseline_idle_power_kw: null,
        baseline_running_power_kw: null,
        baseline_power_factor: null,
      },
      current_metrics: {
        current_average_power_kw: 95.0,
        current_idle_power_kw: 24.0,
        current_average_power_factor: 0.88,
      },
      deviation_percentage: null,
      explanation: "Telemetry depth insufficient.",
      methodology_and_limitations: "Requires 1.0h minimum.",
    };

    render(
      <BaselineAndActionImpact
        baseline={insufficientBaseline}
        selectedMachineId="m-jaw-01"
        onSelectMachine={vi.fn()}
        machines={[mockMachine]}
        correctiveActions={[]}
        selectedActionId=""
        onSelectAction={vi.fn()}
        actionImpact={null}
        onCreateAction={vi.fn()}
      />
    );

    expect(
      screen.getByText("Baseline Withheld — Insufficient Telemetry History")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/0\.25 hours available, minimum 1\.0 hour required/i)
    ).toBeInTheDocument();
  });

  it("displays before-and-after corrective action impact and mandatory causality disclaimer", () => {
    const mockAction: CorrectiveActionResponse = {
      id: "act-timer-01",
      machine_id: "m-jaw-01",
      action_type: "parameter_tuning",
      title: "Configured Crusher 5-minute Auto-Idle Shutdown",
      description: "PLC timer programmed to turn off lube pump and main drive after 5 mins of zero load",
      performed_at: "2026-11-04T06:00:00Z",
      operator_name: "Marcus Vance",
      notes: "Verified with electrical instrumentation",
      created_at: "2026-11-04T06:00:00Z",
    };

    const mockImpact: ActionImpactResponse = {
      action: mockAction,
      evaluation_window_hours: 24.0,
      pre_action_period: {
        start_time: "2026-11-03T06:00:00Z",
        end_time: "2026-11-04T06:00:00Z",
        duration_hours: 24.0,
        telemetry_sample_count: 1440,
        data_coverage_ratio: 0.98,
        actual_energy_kwh: 1650.0,
        estimated_wasted_energy_kwh: 125.0,
        idle_duration_hours: 5.2,
        wastage_event_count: 4,
        average_active_power_kw: 68.7,
      },
      post_action_period: {
        start_time: "2026-11-04T06:00:00Z",
        end_time: "2026-11-05T06:00:00Z",
        duration_hours: 24.0,
        telemetry_sample_count: 1440,
        data_coverage_ratio: 0.98,
        actual_energy_kwh: 1540.0,
        estimated_wasted_energy_kwh: 15.0,
        idle_duration_hours: 0.8,
        wastage_event_count: 1,
        average_active_power_kw: 64.1,
      },
      impact_status: "IMPROVED",
      is_statistically_comparable: true,
      comparability_notes: "Symmetric 24h operational windows",
      absolute_wasted_energy_delta_kwh: -110.0,
      percentage_wasted_energy_delta: -88.0,
      absolute_idle_hours_delta: -4.4,
      event_count_delta: -3,
      summary_explanation: "Wasted energy dropped by 88.0% following timer deployment.",
      causality_disclaimer:
        "Correlation does not establish causation. Observed changes in energy consumption may be influenced by ore feed variability, maintenance cycles, operational stoppages, or unmonitored plant variables.",
    };

    render(
      <BaselineAndActionImpact
        baseline={null}
        selectedMachineId="m-jaw-01"
        onSelectMachine={vi.fn()}
        machines={[mockMachine]}
        correctiveActions={[mockAction]}
        selectedActionId={mockAction.id}
        onSelectAction={vi.fn()}
        actionImpact={mockImpact}
        onCreateAction={vi.fn()}
      />
    );

    expect(screen.getByText("Configured Crusher 5-minute Auto-Idle Shutdown")).toBeInTheDocument();
    expect(screen.getByText("IMPROVED")).toBeInTheDocument();
    expect(screen.getByText("-110.0 kWh (-88%)")).toBeInTheDocument();

    // Check mandatory causality disclaimer
    expect(screen.getByText(/Correlation does not establish causation/i)).toBeInTheDocument();
  });
});
