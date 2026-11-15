import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FleetHealthOverview } from "../components/health/FleetHealthOverview";
import { MachineHealthAnalysis } from "../components/health/MachineHealthAnalysis";
import { WarningInvestigationList } from "../components/health/WarningInvestigationList";
import { MaintenanceObservationsLog } from "../components/health/MaintenanceObservationsLog";
import { HealthScoreExplanationPanel } from "../components/health/HealthScoreExplanationPanel";
import type {
  FleetHealthSummaryResponse,
  MachineHealthDetailResponse,
  MachineSummaryResponse,
  MachineHealthWarning,
  MaintenanceObservation,
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
  latest_power_factor: 0.91,
  latest_temperature: 64.0,
  latest_load_percent: 72.0,
};

const mockFleetSummary: FleetHealthSummaryResponse = {
  fleet_health_score: 87.4,
  total_machines_monitored: 4,
  status_breakdown: {
    HEALTHY: 2,
    WATCH: 1,
    WARNING: 1,
    CRITICAL: 0,
    INSUFFICIENT_DATA: 0,
  },
  active_warnings_count: 2,
  active_warnings_by_severity: {
    WATCH: 1,
    WARNING: 1,
    CRITICAL: 0,
  },
  unmeasured_channels: [
    "Vibration (ISO 10816-3 RMS velocity): Requires retrofitted high-frequency piezoelectric accelerometer.",
  ],
  recent_observations_count: 3,
  last_evaluated_at: "2026-11-04T12:00:00Z",
  causality_disclaimer:
    "Fleet condition scores represent observable electrical and thermal stability. Vibration is unmeasured.",
};

const mockDetail: MachineHealthDetailResponse = {
  machine_id: "m-jaw-01",
  machine_name: "Primary Jaw Crusher",
  machine_type: "crusher",
  rated_power_kw: 132.0,
  health_score: 82.5,
  health_status: "WATCH",
  sub_scores: {
    electrical_stability: 89.0,
    thermal_margin: 84.0,
    operational_consistency: 88.0,
    state_stability: 92.0,
    weights_applied: {
      electrical_stability: 0.35,
      thermal_margin: 0.25,
      operational_consistency: 0.25,
      state_stability: 0.15,
    },
  },
  channels: [
    {
      channel_name: "3-Phase Electrical (V, I, P, Q, PF)",
      status: "ACTIVE_HARDWARE",
      sample_count: 1440,
      description: "Measured via Eastron SDM630 / Modbus RTU.",
    },
    {
      channel_name: "Winding/Bearing Temperature",
      status: "AUXILIARY_SIMULATED",
      sample_count: 1440,
      description: "Auxiliary RTD sensor adapter.",
    },
    {
      channel_name: "Vibration (ISO 10816-3 RMS)",
      status: "UNMEASURED_NOT_INSTALLED",
      sample_count: 0,
      description: "Requires retrofit piezoelectric accelerometer.",
    },
  ],
  data_coverage_hours: 24.0,
  telemetry_sample_count: 1440,
  insufficient_data_reason: null,
  active_warnings: [],
  recent_observations: [],
  causality_disclaimer: "Condition indicators reflect observable electrical and thermal stability.",
};

const mockWarning: MachineHealthWarning = {
  id: "warn-volt-01",
  machine_id: "m-jaw-01",
  machine_name: "Primary Jaw Crusher",
  warning_type: "ELECTRICAL_SURGE_DENSITY",
  severity: "WARNING",
  status: "open",
  detected_at: "2026-11-04T10:15:00Z",
  window_start: "2026-11-04T09:15:00Z",
  window_end: "2026-11-04T10:15:00Z",
  observed_value: 8.0,
  baseline_value: 1.0,
  threshold_value: 5.0,
  unit: "surges/hr",
  severity_rationale: "Elevated instantaneous inrush current surges detected during loaded cycles.",
  telemetry_evidence: {
    surge_count: 8,
    peak_current_a: 245.0,
    rated_fla_a: 180.0,
  },
  confidence_score: 0.92,
  data_quality: "HIGH",
  recommended_action: "Inspect crusher jaw feed chute for oversize boulders causing drive motor stalling.",
  created_at: "2026-11-04T10:15:00Z",
};

const mockObservation: MaintenanceObservation = {
  id: "obs-jaw-101",
  machine_id: "m-jaw-01",
  machine_name: "Primary Jaw Crusher",
  warning_id: "warn-volt-01",
  inspector_name: "Sarah Miller (Reliability Tech)",
  inspection_date: "2026-11-04T11:00:00Z",
  suspected_issue: "Oversize limestone feed bridging feed throat",
  corrective_action: "Cleared rock jam with hydraulic rock breaker; verified smooth idling current",
  status: "resolved",
  notes: "Current surges returned to 0 post clearing",
  created_at: "2026-11-04T11:00:00Z",
};

describe("Machine Health Subcomponents (Stage 9D)", () => {
  it("renders fleet health index and discloses unmeasured vibration channel boundary", () => {
    render(<FleetHealthOverview summary={mockFleetSummary} />);

    expect(screen.getByText("Predictive Maintenance & Condition Monitoring")).toBeInTheDocument();
    expect(screen.getByText("87.4 / 100")).toBeInTheDocument();
    expect(screen.getByText("Fleet Equipment Monitored")).toBeInTheDocument();
    expect(screen.getByText("Vibration Unmeasured")).toBeInTheDocument();
    expect(
      screen.getByText(/Requires retrofitted high-frequency piezoelectric accelerometer/i)
    ).toBeInTheDocument();
  });

  it("renders machine condition sub-scores with weights and channel instrumentation audit", () => {
    render(
      <MachineHealthAnalysis
        detail={mockDetail}
        machines={[mockMachine]}
        selectedMachineId="m-jaw-01"
        onSelectMachine={vi.fn()}
      />
    );

    expect(screen.getByText("82.5")).toBeInTheDocument();
    expect(screen.getByText("WATCH")).toBeInTheDocument();
    expect(screen.getByText("89.0%")).toBeInTheDocument();
    expect(screen.getByText("Weight: 35%")).toBeInTheDocument();
    expect(screen.getByText("Thermal Margin")).toBeInTheDocument();
    expect(screen.getByText("84.0%")).toBeInTheDocument();

    // Check instrumentation coverage
    expect(screen.getByText("Active Hardware")).toBeInTheDocument();
    expect(screen.getByText("Auxiliary / Simulated")).toBeInTheDocument();
    expect(screen.getByText("Unmeasured (Not Fitted)")).toBeInTheDocument();
  });

  it("withholds score when telemetry history is insufficient (< 1.0 hr)", () => {
    const insufficientDetail: MachineHealthDetailResponse = {
      ...mockDetail,
      health_score: null,
      health_status: "INSUFFICIENT_DATA",
      insufficient_data_reason:
        "Insufficient historical telemetry: 0.3 hours evaluated, minimum 1.0 hour and 30 samples required.",
      data_coverage_hours: 0.3,
      telemetry_sample_count: 18,
    };

    render(
      <MachineHealthAnalysis
        detail={insufficientDetail}
        machines={[mockMachine]}
        selectedMachineId="m-jaw-01"
        onSelectMachine={vi.fn()}
      />
    );

    expect(
      screen.getByText("Machine Health Score Withheld — Insufficient Telemetry History")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/0\.3 hours evaluated, minimum 1\.0 hour and 30 samples required/i)
    ).toBeInTheDocument();
  });

  it("renders warning cards with observed vs baseline vs threshold and opens acknowledge modal", () => {
    const onAcknowledge = vi.fn().mockResolvedValue(undefined);

    render(
      <WarningInvestigationList
        warnings={[mockWarning]}
        onAcknowledge={onAcknowledge}
      />
    );

    expect(screen.getByText("ELECTRICAL_SURGE_DENSITY")).toBeInTheDocument();
    expect(screen.getByText("8.00 surges/hr")).toBeInTheDocument();
    expect(screen.getByText("1.00 surges/hr")).toBeInTheDocument();
    expect(screen.getByText("5.00 surges/hr")).toBeInTheDocument();
    expect(
      screen.getByText(/Inspect crusher jaw feed chute for oversize boulders/i)
    ).toBeInTheDocument();

    // Open Acknowledge modal
    fireEvent.click(screen.getByText("Acknowledge"));
    expect(screen.getByText("Acknowledge Condition Warning")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. Alex Morgan/i)).toBeInTheDocument();
  });

  it("renders inspection observations and allows logging new technician observation", () => {
    const onCreateObservation = vi.fn().mockResolvedValue(undefined);

    render(
      <MaintenanceObservationsLog
        observations={[mockObservation]}
        machineId="m-jaw-01"
        activeWarnings={[mockWarning]}
        onCreateObservation={onCreateObservation}
      />
    );

    expect(screen.getByText("Sarah Miller (Reliability Tech)")).toBeInTheDocument();
    expect(screen.getByText("Oversize limestone feed bridging feed throat")).toBeInTheDocument();
    expect(screen.getByText(/Cleared rock jam with hydraulic rock breaker/i)).toBeInTheDocument();
    expect(screen.getByText("Resolved")).toBeInTheDocument();

    // Open observation modal
    fireEvent.click(screen.getByText("Log Inspection Observation"));
    expect(screen.getByText("Log Equipment Maintenance Observation")).toBeInTheDocument();
  });

  it("renders health score methodology panel with 4-vector model and condition monitoring notice", () => {
    render(<HealthScoreExplanationPanel />);

    expect(
      screen.getByText("Condition Scoring Methodology & Analytical Transparency")
    ).toBeInTheDocument();
    expect(screen.getByText("35% Weight")).toBeInTheDocument();
    expect(screen.getAllByText("25% Weight").length).toBe(2);
    expect(screen.getByText("15% Weight")).toBeInTheDocument();

    // Check Integrity Notice
    expect(
      screen.getByText(/Industrial Integrity Notice: Condition Monitoring vs Failure Prediction/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The system does not claim to predict mechanical equipment failure/i)
    ).toBeInTheDocument();
  });
});
