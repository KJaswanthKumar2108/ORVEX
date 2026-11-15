import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AlertsView } from "../pages/AlertsView";
import { endpoints } from "../api/endpoints";
import type {
  AlertRecord,
  MachineHealthWarning,
  MachineSummaryResponse,
  WastageEventResponse,
} from "../api/types";

const mockMachines: MachineSummaryResponse[] = [
  {
    id: "m-1",
    site_id: "site-1",
    machine_identifier: "EX-01",
    name: "Primary Excavator",
    machine_type: "excavator",
    rated_power_kw: 350.0,
    status: "active",
    telemetry_freshness: "fresh",
    latest_telemetry_timestamp: "2026-03-30T10:00:00Z",
    latest_operating_state: "operating",
    latest_active_power: 280.0,
    latest_power_factor: 0.92,
    latest_temperature: 75.0,
    latest_load_percent: 80.0,
  },
  {
    id: "m-2",
    site_id: "site-1",
    machine_identifier: "CR-01",
    name: "Jaw Crusher A",
    machine_type: "crusher",
    rated_power_kw: 250.0,
    status: "active",
    telemetry_freshness: "fresh",
    latest_telemetry_timestamp: "2026-03-30T10:00:00Z",
    latest_operating_state: "idle",
    latest_active_power: 45.0,
    latest_power_factor: 0.70,
    latest_temperature: 68.0,
    latest_load_percent: 18.0,
  },
];

const mockAlerts: AlertRecord[] = [
  {
    id: "alert-101",
    machine_id: "m-1",
    machine_identifier: "EX-01",
    machine_name: "Primary Excavator",
    event_id: "evt-201",
    alert_type: "IDLE_WASTAGE",
    severity: "critical",
    title: "Sustained Unproductive Idling at Full Ancillary Draw",
    description: "Excavator idle for 48 minutes with secondary hydraulics engaged.",
    recommendation: "Instruct operator to activate automatic hydraulic standby.",
    status: "open",
    occurred_at: "2026-03-30T08:15:00Z",
    resolved_at: null,
    created_at: "2026-03-30T08:20:00Z",
  },
  {
    id: "alert-102",
    machine_id: "m-2",
    machine_identifier: "CR-01",
    machine_name: "Jaw Crusher A",
    event_id: "evt-202",
    alert_type: "START_STOP_CYCLING",
    severity: "medium",
    title: "Frequent Cycling Anomaly Detected",
    description: "Repeated starts and stops observed over 20 minutes.",
    recommendation: "Verify crusher feed conveyor interlock settings.",
    status: "acknowledged",
    occurred_at: "2026-03-30T07:45:00Z",
    resolved_at: null,
    created_at: "2026-03-30T07:50:00Z",
  },
  {
    id: "alert-103",
    machine_id: "m-1",
    machine_identifier: "EX-01",
    machine_name: "Primary Excavator",
    event_id: null,
    alert_type: "POOR_POWER_FACTOR",
    severity: "low",
    title: "Low Power Factor Drift",
    description: "Power factor dropped below 0.75 for 15 minutes.",
    recommendation: "Check capacitor bank stage 2 engagement.",
    status: "resolved",
    occurred_at: "2026-03-30T06:00:00Z",
    resolved_at: "2026-03-30T06:30:00Z",
    created_at: "2026-03-30T06:05:00Z",
  },
];

const mockLinkedEvent: WastageEventResponse = {
  id: "evt-201",
  machine_id: "m-1",
  start_time: "2026-03-30T08:15:00Z",
  end_time: "2026-03-30T09:03:00Z",
  duration_seconds: 2880,
  detection_reason: "IDLE_WASTAGE",
  severity: "critical",
  estimated_energy_kwh: 42.5,
  estimated_wasted_energy_kwh: 34.2,
  confidence_score: 0.94,
  quality_score: 0.98,
  status: "verified",
  evidence_metadata: {
    idle_power_kw: 42.8,
    baseline_threshold_kw: 15.0,
    excess_power_kw: 27.8,
  },
  created_at: "2026-03-30T08:20:00Z",
};

const mockHealthWarnings: MachineHealthWarning[] = [
  {
    id: "warn-301",
    machine_id: "m-1",
    warning_type: "THERMAL_DRIFT",
    severity: "CRITICAL",
    status: "open",
    detected_at: "2026-03-30T08:30:00Z",
    window_start: "2026-03-30T07:30:00Z",
    window_end: "2026-03-30T08:30:00Z",
    observed_value: 94.5,
    baseline_value: 68.0,
    threshold_value: 85.0,
    unit: "°C",
    severity_rationale: "Hydraulic oil temperature exceeds 85°C trip margin.",
    telemetry_evidence: { oil_temp_c: 94.5 },
    confidence_score: 0.91,
    data_quality: "GOOD",
    recommended_action: "Inspect oil cooler airflow and hydraulic fluid viscosity.",
    acknowledged_at: null,
    acknowledged_by: null,
    resolved_at: null,
    created_at: "2026-03-30T08:30:00Z",
  },
];

describe("Alerts & Triage Center (Stage 9E)", () => {
  beforeEach(() => {
    vi.spyOn(endpoints, "getAlerts").mockResolvedValue({
      items: mockAlerts,
      total: 3,
      limit: 200,
      offset: 0,
    });
    vi.spyOn(endpoints, "getFleetHealthWarnings").mockResolvedValue(mockHealthWarnings);
    vi.spyOn(endpoints, "getWastageEvent").mockResolvedValue(mockLinkedEvent);
  });

  it("renders metric cards and alert table with multi-criteria status and severity counts", async () => {
    render(<AlertsView machines={mockMachines} onSelectMachine={vi.fn()} />);

    expect(screen.getByText("Alert & Triage Center")).toBeInTheDocument();

    await waitFor(() => {
      // Metric card numbers
      expect(screen.getByText("1 Open Energy")).toBeInTheDocument();
      expect(screen.getByText("1 Health Warnings")).toBeInTheDocument();
      // Titles in table
      expect(screen.getByText(/Sustained Unproductive Idling/i)).toBeInTheDocument();
      expect(screen.getByText(/Frequent Cycling Anomaly Detected/i)).toBeInTheDocument();
      expect(screen.getByText(/Low Power Factor Drift/i)).toBeInTheDocument();
    });
  });

  it("filters alerts dynamically by text search", async () => {
    render(<AlertsView machines={mockMachines} onSelectMachine={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Sustained Unproductive Idling/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search alerts, machines, keywords/i);
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "Cycling" } });
    });

    expect(screen.getByText(/Frequent Cycling Anomaly Detected/i)).toBeInTheDocument();
    expect(screen.queryByText(/Sustained Unproductive Idling/i)).not.toBeInTheDocument();
  });

  it("opens alert investigation modal and loads linked wastage event evidence", async () => {
    render(<AlertsView machines={mockMachines} onSelectMachine={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Sustained Unproductive Idling/i)).toBeInTheDocument();
    });

    const investigateBtns = screen.getAllByRole("button", { name: /investigate/i });
    await act(async () => {
      fireEvent.click(investigateBtns[0]);
    });

    // Verification of modal content
    await waitFor(() => {
      expect(screen.getByText("Recommended Operational Protocol")).toBeInTheDocument();
      expect(screen.getByText(/Instruct operator to activate automatic hydraulic standby/i)).toBeInTheDocument();
      expect(screen.getByText("Linked Wastage Episode Evidence")).toBeInTheDocument();
      expect(screen.getByText(/34\.20 kWh \(est\.\)/i)).toBeInTheDocument();
      expect(screen.getByText("48m")).toBeInTheDocument();
    });
  });

  it("completes full acknowledge lifecycle with operator notes", async () => {
    const updatedAlert: AlertRecord = {
      ...mockAlerts[0],
      status: "acknowledged",
    };
    const ackSpy = vi.spyOn(endpoints, "acknowledgeAlert").mockResolvedValue(updatedAlert);

    render(<AlertsView machines={mockMachines} onSelectMachine={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Sustained Unproductive Idling/i)).toBeInTheDocument();
    });

    // Click Acknowledge in table
    const ackBtn = screen.getByRole("button", { name: "Acknowledge" });
    await act(async () => {
      fireEvent.click(ackBtn);
    });

    // Modal opens
    expect(screen.getByRole("heading", { name: "Acknowledge Alert" })).toBeInTheDocument();

    const commentInput = screen.getByPlaceholderText(/Assigned to John Doe/i);
    await act(async () => {
      fireEvent.change(commentInput, { target: { value: "Assigned to Shift Lead Mike" } });
    });

    const confirmAckBtn = screen.getByRole("button", { name: "Confirm Acknowledge" });
    await act(async () => {
      fireEvent.click(confirmAckBtn);
    });

    await waitFor(() => {
      expect(ackSpy).toHaveBeenCalledWith("alert-101", "Assigned to Shift Lead Mike");
      expect(screen.getByText(/successfully acknowledged/i)).toBeInTheDocument();
    });
  });

  it("completes full resolve lifecycle with resolution notes", async () => {
    const updatedAlert: AlertRecord = {
      ...mockAlerts[0],
      status: "resolved",
      resolved_at: "2026-03-30T10:00:00Z",
    };
    const resolveSpy = vi.spyOn(endpoints, "resolveAlert").mockResolvedValue(updatedAlert);

    render(<AlertsView machines={mockMachines} onSelectMachine={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Sustained Unproductive Idling/i)).toBeInTheDocument();
    });

    const resolveBtns = screen.getAllByRole("button", { name: "Resolve" });
    await act(async () => {
      fireEvent.click(resolveBtns[0]);
    });

    expect(screen.getByRole("heading", { name: "Resolve Alert" })).toBeInTheDocument();

    const notesInput = screen.getByPlaceholderText(/Idle protocol enforced/i);
    await act(async () => {
      fireEvent.change(notesInput, { target: { value: "Operator set idle shutdown timeout to 5 mins." } });
    });

    const confirmResolveBtn = screen.getByRole("button", { name: "Mark Resolved" });
    await act(async () => {
      fireEvent.click(confirmResolveBtn);
    });

    await waitFor(() => {
      expect(resolveSpy).toHaveBeenCalledWith("alert-101", "Operator set idle shutdown timeout to 5 mins.");
      expect(screen.getByText(/marked as resolved/i)).toBeInTheDocument();
    });
  });

  it("navigates to condition monitoring health warnings tab and acknowledges warning", async () => {
    const updatedWarning: MachineHealthWarning = {
      ...mockHealthWarnings[0],
      status: "acknowledged",
      acknowledged_by: "Engineer Dave",
    };
    const ackWarnSpy = vi.spyOn(endpoints, "acknowledgeHealthWarning").mockResolvedValue(updatedWarning);

    render(<AlertsView machines={mockMachines} onSelectMachine={vi.fn()} />);

    // Click Health Warnings tab
    const healthTab = screen.getByRole("button", { name: /Health Warnings/i });
    await act(async () => {
      fireEvent.click(healthTab);
    });

    await waitFor(() => {
      expect(screen.getByText("Machine-Health Condition Monitoring Warnings")).toBeInTheDocument();
      expect(screen.getByText("THERMAL DRIFT")).toBeInTheDocument();
      expect(screen.getByText("94.50 °C")).toBeInTheDocument();
    });

    // Click Acknowledge on health warning
    const ackWarningBtn = screen.getByRole("button", { name: /acknowledge/i });
    await act(async () => {
      fireEvent.click(ackWarningBtn);
    });

    // Modal opens
    expect(screen.getByRole("heading", { name: "Acknowledge Health Warning" })).toBeInTheDocument();

    const inspectorInput = screen.getByPlaceholderText(/Chief Inspector Smith/i);
    await act(async () => {
      fireEvent.change(inspectorInput, { target: { value: "Engineer Dave" } });
    });

    const confirmBtn = screen.getByRole("button", { name: "Confirm Acknowledge" });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      expect(ackWarnSpy).toHaveBeenCalledWith("warn-301", {
        acknowledged_by: "Engineer Dave",
        notes: undefined,
      });
      expect(screen.getByText(/successfully acknowledged by Engineer Dave/i)).toBeInTheDocument();
    });
  });
});
