import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { DemonstrationCenterView } from "../pages/DemonstrationCenterView";
import { endpoints } from "../api/endpoints";
import type {
  AlertRecord,
  MachineResponse,
  MachineSummaryResponse,
  TelemetryRecordResponse,
  WastageEventResponse,
} from "../api/types";

const mockDemoMachines: MachineSummaryResponse[] = [
  {
    id: "00000000-0000-0000-de30-000000000011",
    site_id: "site-1",
    machine_identifier: "DEMO-CONV-01",
    name: "Primary Overland Conveyor",
    machine_type: "conveyor",
    rated_power_kw: 132.0,
    status: "active",
    telemetry_freshness: "fresh",
    latest_telemetry_timestamp: "2026-11-04T10:50:37Z",
    latest_operating_state: "IDLE",
    latest_active_power: 39.6,
    latest_power_factor: 0.64,
    latest_temperature: 32.1,
    latest_load_percent: 12.0,
  },
  {
    id: "00000000-0000-0000-de30-000000000022",
    site_id: "site-1",
    machine_identifier: "DEMO-PUMP-02",
    name: "Slurry Transfer Pump",
    machine_type: "pump",
    rated_power_kw: 75.0,
    status: "active",
    telemetry_freshness: "fresh",
    latest_telemetry_timestamp: "2026-11-04T10:50:37Z",
    latest_operating_state: "STARTING",
    latest_active_power: 65.0,
    latest_power_factor: 0.85,
    latest_temperature: 45.0,
    latest_load_percent: 50.0,
  },
  {
    id: "00000000-0000-0000-de30-000000000055",
    site_id: "site-1",
    machine_identifier: "DEMO-HOIST-05",
    name: "Mine Production Hoist",
    machine_type: "hoist",
    rated_power_kw: 200.0,
    status: "active",
    telemetry_freshness: "fresh",
    latest_telemetry_timestamp: "2026-11-04T10:50:37Z",
    latest_operating_state: "RUNNING",
    latest_active_power: 185.0,
    latest_power_factor: 0.90,
    latest_temperature: 58.0,
    latest_load_percent: 62.0,
  },
];

const mockTelemetry: TelemetryRecordResponse = {
  timestamp: "2026-11-04T10:50:38Z",
  machine_id: "00000000-0000-0000-de30-000000000011",
  sensor_id: null,
  voltage: 410.0,
  current: 88.0,
  active_power: 39.6,
  reactive_power: 47.8,
  apparent_power: 62.1,
  power_factor: 0.64,
  cumulative_energy: 0.025,
  rpm: 0.0,
  temperature: 32.1,
  load_percent: 12.0,
  operating_state: "IDLE",
};

const mockWastageEvents: WastageEventResponse[] = [
  {
    id: "75f03af2-3915-507c-b072-e75c34daf59b",
    machine_id: "00000000-0000-0000-de30-000000000011",
    start_time: "2026-11-04T10:50:42Z",
    end_time: "2026-11-04T10:51:01Z",
    duration_seconds: 19.0,
    detection_reason: "IDLE_WASTAGE",
    severity: "low",
    estimated_energy_kwh: 0.2729,
    estimated_wasted_energy_kwh: 0.144,
    confidence_score: 1.0,
    quality_score: 1.0,
    status: "detected",
    evidence_metadata: {
      idle_power_kw: 39.6,
      baseline_threshold_kw: 15.0,
      excess_power_kw: 24.6,
    },
    created_at: "2026-11-04T10:51:09Z",
  },
];

const mockAlerts: AlertRecord[] = [
  {
    id: "6afca8a1-4c70-5617-aa00-2b293cfd74ad",
    machine_id: "00000000-0000-0000-de30-000000000011",
    machine_identifier: "DEMO-CONV-01",
    machine_name: "Primary Overland Conveyor",
    event_id: "75f03af2-3915-507c-b072-e75c34daf59b",
    alert_type: "IDLE_WASTAGE",
    severity: "low",
    title: "Sustained Idle Energy Wastage",
    description: "Machine 'Primary Overland Conveyor' operated in IDLE state for 0.3 minutes.",
    recommendation: "Inspect whether the machine remains energized while idle.",
    status: "open",
    occurred_at: "2026-11-04T10:50:42Z",
    resolved_at: null,
    created_at: "2026-11-04T10:51:09Z",
  },
];

describe("Interactive Demonstration Center (Stage 9F)", () => {
  beforeEach(() => {
    vi.spyOn(endpoints, "getMachines").mockResolvedValue({
      items: mockDemoMachines.map((m) => ({
        id: m.id,
        site_id: m.site_id,
        machine_identifier: m.machine_identifier,
        name: m.name,
        machine_type: m.machine_type,
        rated_power_kw: m.rated_power_kw,
        status: m.status,
        created_at: "2026-11-04T10:00:00Z",
      })) as MachineResponse[],
      total: 3,
      limit: 50,
      offset: 0,
    });

    vi.spyOn(endpoints, "getMachineTelemetry").mockResolvedValue({
      items: [mockTelemetry],
      total: 26,
      limit: 10,
      offset: 0,
    });

    vi.spyOn(endpoints, "getMachineWastageEvents").mockResolvedValue({
      items: mockWastageEvents,
      total: 1,
      limit: 10,
      offset: 0,
    });

    vi.spyOn(endpoints, "getMachineAlerts").mockResolvedValue({
      items: mockAlerts,
      total: 1,
      limit: 10,
      offset: 0,
    });
  });

  it("renders all 5 supported simulator scenarios with simulated source labels", async () => {
    render(<DemonstrationCenterView machines={mockDemoMachines} />);

    expect(screen.getByText("Interactive Demonstration Center")).toBeInTheDocument();
    expect(screen.getAllByText(/SIMULATED/i).length).toBeGreaterThanOrEqual(1);

    // 5 supported scenarios
    expect(screen.getAllByText("Sustained Idle Wastage").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Low-Load Operating Inefficiency")).toBeInTheDocument();
    expect(screen.getByText("Abnormal Power Consumption")).toBeInTheDocument();
    expect(screen.getByText("Rapid Start-Stop Cycling")).toBeInTheDocument();
    expect(screen.getByText("Normal Operation (Golden Reference)")).toBeInTheDocument();
  });

  it("switches scenario and synchronizes target equipment", async () => {
    render(<DemonstrationCenterView machines={mockDemoMachines} />);

    // Click "Abnormal Power Consumption" scenario card
    const abnormalCard = screen.getByRole("button", {
      name: /Abnormal Power Consumption/i,
    });

    await act(async () => {
      fireEvent.click(abnormalCard);
    });

    // Check header updates
    expect(screen.getAllByText("Abnormal Power Consumption").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/abnormal_power/i).length).toBeGreaterThanOrEqual(1);
  });

  it("opens confirmation modal before initiating verification session", async () => {
    render(<DemonstrationCenterView machines={mockDemoMachines} />);

    const startBtn = screen.getByRole("button", {
      name: /Initiate Verification Session/i,
    });
    expect(startBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(startBtn);
    });

    // Modal is open
    expect(
      screen.getByRole("heading", { name: "Confirm Demonstration Session" })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/python scripts\/demo_runner\.py/i).length).toBeGreaterThanOrEqual(1);

    const confirmBtn = screen.getByRole("button", {
      name: /Confirm & Start Verification/i,
    });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    // Modal closes and session starts
    expect(
      screen.queryByRole("heading", { name: "Confirm Demonstration Session" })
    ).not.toBeInTheDocument();
  });

  it("displays live telemetry monitor with unmeasured vibration channel disclaimer", async () => {
    render(<DemonstrationCenterView machines={mockDemoMachines} />);

    await waitFor(() => {
      expect(screen.getByText("Live Telemetry Ingestion Monitor")).toBeInTheDocument();
      // Power and operating state from mock telemetry
      expect(screen.getByText("39.6 kW")).toBeInTheDocument();
      expect(screen.getByText("Idle")).toBeInTheDocument();
      expect(screen.getByText("12.0%")).toBeInTheDocument();
      expect(screen.getByText("32.1 °C")).toBeInTheDocument();
      // Vibration unmeasured indicator
      expect(screen.getByText("Uninstrumented on standard gateway")).toBeInTheDocument();
    });
  });

  it("renders 9-stage detection pipeline with verified state checks", async () => {
    render(<DemonstrationCenterView machines={mockDemoMachines} />);

    await waitFor(() => {
      expect(screen.getByText("9-Stage Analytics Detection Pipeline")).toBeInTheDocument();
      expect(screen.getByText("Scenario Initiated")).toBeInTheDocument();
      expect(screen.getByText("Telemetry Generated")).toBeInTheDocument();
      expect(screen.getByText("Telemetry Ingested")).toBeInTheDocument();
      expect(screen.getByText("Features Calculated")).toBeInTheDocument();
      expect(screen.getByText("Analytics Evaluated")).toBeInTheDocument();
      expect(screen.getByText("Wastage Detected")).toBeInTheDocument();
      expect(screen.getByText("Event Persisted")).toBeInTheDocument();
      expect(screen.getByText("Alert Dispatched")).toBeInTheDocument();
      expect(screen.getByText("Evidence Available")).toBeInTheDocument();
    });
  });

  it("renders actual detection results and preserves unestimated label for cycling", async () => {
    // 1. Check idle wastage rendering
    render(<DemonstrationCenterView machines={mockDemoMachines} />);

    await waitFor(() => {
      expect(screen.getByText("Actual Analytics Detection Output")).toBeInTheDocument();
      expect(screen.getByText("Idle Wastage")).toBeInTheDocument();
      expect(screen.getByText(/0\.14 kWh \(est\.\)/i)).toBeInTheDocument();
      expect(screen.getByText("Sustained Idle Energy Wastage")).toBeInTheDocument();
      expect(screen.getByText(/Inspect whether the machine remains energized/i)).toBeInTheDocument();
    });
  });

  it("confirms zero false positives when evaluating normal operation scenario", async () => {
    vi.spyOn(endpoints, "getMachineWastageEvents").mockResolvedValue({
      items: [],
      total: 0,
      limit: 10,
      offset: 0,
    });
    vi.spyOn(endpoints, "getMachineAlerts").mockResolvedValue({
      items: [],
      total: 0,
      limit: 10,
      offset: 0,
    });

    render(<DemonstrationCenterView machines={mockDemoMachines} />);

    const normalCard = screen.getByRole("button", {
      name: /Normal Operation \(Golden Reference\)/i,
    });

    await act(async () => {
      fireEvent.click(normalCard);
    });

    await waitFor(() => {
      expect(
        screen.getByText("Nominal Operation Verified — 0 Wastage Events & 0 False Positives")
      ).toBeInTheDocument();
      expect(screen.getByText("0 Events")).toBeInTheDocument();
      expect(screen.getByText("0 Alerts")).toBeInTheDocument();
      expect(screen.getByText("100%")).toBeInTheDocument();
    });
  });

  it("navigates to alert center, fleet overview, and system status via callbacks", async () => {
    const handleNavigateAlerts = vi.fn();
    const handleNavigateFleet = vi.fn();
    const handleNavigateSystem = vi.fn();
    const handleSelectMachine = vi.fn();

    render(
      <DemonstrationCenterView
        machines={mockDemoMachines}
        onNavigateToAlerts={handleNavigateAlerts}
        onNavigateToFleet={handleNavigateFleet}
        onNavigateToSystem={handleNavigateSystem}
        onSelectMachine={handleSelectMachine}
      />
    );

    // Stop session to show summary
    const startBtn = screen.getByRole("button", {
      name: /Initiate Verification Session/i,
    });
    await act(async () => {
      fireEvent.click(startBtn);
    });
    const confirmBtn = screen.getByRole("button", {
      name: /Confirm & Start Verification/i,
    });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    const stopBtn = screen.getByRole("button", {
      name: /Conclude Session/i,
    });
    await act(async () => {
      fireEvent.click(stopBtn);
    });

    // Summary buttons
    expect(screen.getByText("Demonstration Verification Summary")).toBeInTheDocument();

    const viewAlertsBtn = screen.getByRole("button", {
      name: /View Alerts in Triage Center/i,
    });
    await act(async () => {
      fireEvent.click(viewAlertsBtn);
    });
    expect(handleNavigateAlerts).toHaveBeenCalled();

    const viewFleetBtn = screen.getByRole("button", {
      name: /Fleet Command Center/i,
    });
    await act(async () => {
      fireEvent.click(viewFleetBtn);
    });
    expect(handleNavigateFleet).toHaveBeenCalled();

    const viewSystemBtn = screen.getByRole("button", {
      name: /Verify Infrastructure Status/i,
    });
    await act(async () => {
      fireEvent.click(viewSystemBtn);
    });
    expect(handleNavigateSystem).toHaveBeenCalled();
  });
});
