import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MachineHealthView } from "../pages/MachineHealthView";
import { endpoints } from "../api/endpoints";
import type {
  FleetHealthSummaryResponse,
  MachineHealthDetailResponse,
  MachineSummaryResponse,
} from "../api/types";

const mockMachines: MachineSummaryResponse[] = [
  {
    id: "m-1",
    site_id: "site-1",
    machine_identifier: "CRUSH-01",
    name: "Primary Jaw Crusher",
    machine_type: "Crusher",
    rated_power_kw: 132.0,
    status: "active",
    telemetry_freshness: "fresh",
    latest_telemetry_timestamp: "2026-11-04T10:00:00Z",
    latest_operating_state: "OPTIMAL",
    latest_active_power: 95.0,
    latest_power_factor: 0.92,
    latest_temperature: 65.0,
    latest_load_percent: 72.0,
  },
];

const mockFleetSummary: FleetHealthSummaryResponse = {
  fleet_health_score: 88.5,
  total_machines_monitored: 1,
  status_breakdown: {
    HEALTHY: 1,
    WATCH: 0,
    WARNING: 0,
    CRITICAL: 0,
    INSUFFICIENT_DATA: 0,
  },
  active_warnings_count: 1,
  active_warnings_by_severity: {
    WATCH: 1,
    WARNING: 0,
    CRITICAL: 0,
  },
  unmeasured_channels: [
    "Vibration (ISO 10816-3 RMS velocity): Requires retrofitted high-frequency accelerometer.",
  ],
  recent_observations_count: 1,
  last_evaluated_at: "2026-11-04T12:00:00Z",
  causality_disclaimer:
    "Fleet condition scores represent observable stability and thermal margin from available telemetry. Physical vibration monitoring is unmeasured until accelerometer hardware is retrofitted.",
};

const mockMachineDetail: MachineHealthDetailResponse = {
  machine_id: "m-1",
  machine_name: "Primary Jaw Crusher",
  machine_type: "Crusher",
  rated_power_kw: 132.0,
  health_score: 84.0,
  health_status: "WATCH",
  sub_scores: {
    electrical_stability: 92.0,
    thermal_margin: 88.0,
    operational_consistency: 90.0,
    state_stability: 95.0,
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
      sample_count: 45,
      description: "Measured via Eastron SDM630 / 3-phase power meter over Modbus RTU.",
    },
    {
      channel_name: "Winding/Bearing Temperature",
      status: "AUXILIARY_SIMULATED",
      sample_count: 45,
      description: "Requires external RTD/PT100 sensor adapter; currently simulated or unmeasured.",
    },
    {
      channel_name: "Vibration (ISO 10816-3 RMS)",
      status: "UNMEASURED_NOT_INSTALLED",
      sample_count: 0,
      description: "Requires retrofit tri-axial piezo accelerometer hardware. Channel unmeasured in current deployment.",
    },
  ],
  data_coverage_hours: 2.0,
  telemetry_sample_count: 45,
  insufficient_data_reason: null,
  active_warnings: [
    {
      id: "w-1",
      machine_id: "m-1",
      machine_name: "Primary Jaw Crusher",
      warning_type: "POWER_FLUCTUATION",
      severity: "WATCH",
      status: "open",
      detected_at: "2026-11-04T11:30:00Z",
      window_start: "2026-11-04T10:00:00Z",
      window_end: "2026-11-04T11:30:00Z",
      observed_value: 0.19,
      baseline_value: 0.08,
      threshold_value: 0.18,
      unit: "CV",
      severity_rationale: "Moderate power fluctuation detected (CV=0.19, surges=6).",
      telemetry_evidence: {
        power_mean_kw: 95.0,
        power_cv: 0.19,
        current_surges: 6,
      },
      confidence_score: 0.9,
      data_quality: "HIGH",
      recommended_action: "Review conveyor / crusher feed rate regularity to ensure steady-state loading.",
      created_at: "2026-11-04T11:30:00Z",
    },
  ],
  recent_observations: [
    {
      id: "obs-1",
      machine_id: "m-1",
      machine_name: "Primary Jaw Crusher",
      warning_id: "w-1",
      inspector_name: "Marcus Vance (Reliability Eng)",
      inspection_date: "2026-11-04T09:00:00Z",
      suspected_issue: "Eccentric shaft counterweight imbalance",
      corrective_action: "Torqued mounting fasteners and lubricated main bearings",
      status: "resolved",
      notes: "Baseline power fluctuation normalized post-greasing",
      created_at: "2026-11-04T09:00:00Z",
    },
  ],
  causality_disclaimer:
    "Condition monitoring indicators reflect electrical, thermal, and operational stability. They indicate abnormal operating behaviour and do not guarantee mechanical failure prevention.",
};

describe("MachineHealthView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(endpoints, "getFleetHealthSummary").mockResolvedValue(mockFleetSummary);
    vi.spyOn(endpoints, "getMachineHealthDetail").mockResolvedValue(mockMachineDetail);
  });

  it("renders fleet health KPIs and unmeasured vibration banner", async () => {
    render(
      <MachineHealthView
        machines={mockMachines}
        selectedMachineId="m-1"
        onSelectMachine={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Predictive Maintenance & Condition Monitoring/i)).toBeInTheDocument();
    });

    // Check Fleet KPIs
    expect(screen.getByText("88.5 / 100")).toBeInTheDocument();
    expect(screen.getByText("Fleet Equipment Monitored")).toBeInTheDocument();
    expect(screen.getAllByText(/Unmeasured/i).length).toBeGreaterThan(0);
  });

  it("renders machine health score, sub-scores, and warnings", async () => {
    render(
      <MachineHealthView
        machines={mockMachines}
        selectedMachineId="m-1"
        onSelectMachine={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("84.0")).toBeInTheDocument();
    });

    // Sub-scores
    expect(screen.getByText(/Electrical Stability/i)).toBeInTheDocument();
    expect(screen.getByText("92.0%")).toBeInTheDocument();

    // Active warning
    expect(screen.getByText("POWER_FLUCTUATION")).toBeInTheDocument();
    expect(screen.getByText(/Moderate power fluctuation detected/i)).toBeInTheDocument();
    expect(screen.getByText(/Review conveyor \/ crusher feed rate regularity/i)).toBeInTheDocument();

    // Channel coverage
    expect(screen.getByText(/Active Hardware/i)).toBeInTheDocument();
    expect(screen.getByText(/Unmeasured \(Not Fitted\)/i)).toBeInTheDocument();

    // Observation history
    expect(screen.getByText(/Eccentric shaft counterweight imbalance/i)).toBeInTheDocument();
    expect(screen.getByText(/Marcus Vance/i)).toBeInTheDocument();
  });

  it("opens observation modal and submits inspection record", async () => {
    const createObsSpy = vi
      .spyOn(endpoints, "createMaintenanceObservation")
      .mockResolvedValue({
        id: "obs-2",
        machine_id: "m-1",
        inspector_name: "Sarah Connors",
        inspection_date: "2026-11-04T12:00:00Z",
        suspected_issue: "Loose drive pulley bolt",
        corrective_action: "Tightened to 120 Nm",
        status: "resolved",
        created_at: "2026-11-04T12:00:00Z",
      });

    render(
      <MachineHealthView
        machines={mockMachines}
        selectedMachineId="m-1"
        onSelectMachine={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Log Inspection Observation/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Log Inspection Observation/i));

    expect(screen.getByText(/Log Equipment Maintenance Observation/i)).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Sarah Miller/i), {
      target: { value: "Sarah Connors" },
    });
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Belt slip and elevated drive friction/i), {
      target: { value: "Loose drive pulley bolt" },
    });
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Retensioned V-belts/i), {
      target: { value: "Tightened to 120 Nm" },
    });

    fireEvent.click(screen.getByText(/Save Observation/i));

    await waitFor(() => {
      expect(createObsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          inspector_name: "Sarah Connors",
          suspected_issue: "Loose drive pulley bolt",
          corrective_action: "Tightened to 120 Nm",
          status: "resolved",
        })
      );
    });
  });
});
