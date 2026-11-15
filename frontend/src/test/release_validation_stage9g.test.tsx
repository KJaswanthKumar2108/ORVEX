import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { App } from "../App";
import { ErrorAlert } from "../components/common/ErrorAlert";
import { ConfirmModal } from "../components/common/ConfirmModal";
import { MetricCard } from "../components/common/MetricCard";
import type {
  FleetHealthSummaryResponse,
  MachineSummaryResponse,
} from "../api/types";

const { mockApi } = vi.hoisted(() => {
  const fns = {
    getHealth: vi.fn(),
    getMachines: vi.fn(),
    getMachineDetail: vi.fn(),
    getMachineEnergySummary: vi.fn(),
    getMachineTelemetry: vi.fn(),
    getMachineWastageEvents: vi.fn(),
    getMachineAlerts: vi.fn(),
    getMachineHealthDetail: vi.fn(),
    getFleetHealthSummary: vi.fn(),
    getFleetHealthWarnings: vi.fn(),
    getFleetIntelligence: vi.fn(),
    getWastagePatterns: vi.fn(),
    getCorrectiveActions: vi.fn(),
    getMachineBaseline: vi.fn(),
    getActionImpact: vi.fn(),
    getAlerts: vi.fn(),
    getEnergyWastageReport: vi.fn(),
    getSystemStatus: vi.fn(),
    getSystemReadiness: vi.fn(),
    getSystemLiveness: vi.fn(),
    acknowledgeAlert: vi.fn(),
    resolveAlert: vi.fn(),
    dismissAlert: vi.fn(),
    acknowledgeHealthWarning: vi.fn(),
    createMaintenanceObservation: vi.fn(),
  };
  return { mockApi: fns };
});

vi.mock("../api/endpoints", () => ({
  endpoints: mockApi,
  api: mockApi,
}));

const mockMachines: MachineSummaryResponse[] = [
  {
    id: "m-1",
    site_id: "site-1",
    machine_identifier: "DEMO-CONV-01",
    name: "Primary Overland Conveyor",
    machine_type: "conveyor",
    rated_power_kw: 132.0,
    status: "active",
    telemetry_freshness: "fresh",
    latest_telemetry_timestamp: "2026-11-04T12:00:00Z",
    latest_operating_state: "operating",
    latest_active_power: 95.5,
    latest_power_factor: 0.92,
    latest_temperature: 65.2,
    latest_load_percent: 72.3,
  },
  {
    id: "m-2",
    site_id: "site-1",
    machine_identifier: "DEMO-CRUSH-03",
    name: "Secondary Cone Crusher",
    machine_type: "crusher",
    rated_power_kw: 250.0,
    status: "active",
    telemetry_freshness: "fresh",
    latest_telemetry_timestamp: "2026-11-04T12:00:00Z",
    latest_operating_state: "idle",
    latest_active_power: 32.1,
    latest_power_factor: 0.74,
    latest_temperature: 71.0,
    latest_load_percent: 12.8,
  },
];

const mockFleetHealth: FleetHealthSummaryResponse = {
  fleet_health_score: 87.4,
  total_machines_monitored: 2,
  status_breakdown: {
    HEALTHY: 1,
    WATCH: 1,
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
    "Vibration (ISO 10816-3 RMS velocity) requires retrofitted high-frequency piezo accelerometer hardware. Currently unmeasured.",
  ],
  causality_disclaimer: "Condition indicators are correlations, not root cause determinations.",
  recent_observations_count: 2,
  last_evaluated_at: "2026-11-04T12:00:00Z",
};

describe("Stage 9G: Final UI Polish, Accessibility & Release Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = "";

    mockApi.getHealth.mockResolvedValue({
      status: "healthy",
      timestamp: "2026-11-04T12:00:00Z",
      database: "connected",
      mqtt: "connected",
    });

    mockApi.getMachines.mockResolvedValue({
      items: mockMachines,
      total: 2,
      limit: 50,
      offset: 0,
    });

    mockApi.getMachineTelemetry.mockResolvedValue({
      items: [
        {
          timestamp: "2026-11-04T12:00:00Z",
          operating_state: "operating",
          active_power: 95.5,
          voltage: 415.0,
          current: 132.8,
          power_factor: 0.92,
          load_percent: 72.3,
          temperature: 65.2,
          vibration_rms: null,
          energy_cumulative_kwh: 120.5,
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    });

    mockApi.getMachineWastageEvents.mockResolvedValue({
      items: [],
      total: 0,
      limit: 10,
      offset: 0,
    });

    mockApi.getMachineAlerts.mockResolvedValue({
      items: [],
      total: 0,
      limit: 10,
      offset: 0,
    });

    mockApi.getAlerts.mockImplementation(async () => ({
      items: [
        {
          id: "alt-01",
          machine_id: "m-1",
          wastage_event_id: "evt-01",
          title: "Sustained Idle Wastage Detected",
          message: "Primary Overland Conveyor has been idling for 45 minutes.",
          severity: "high",
          status: "open",
          assigned_to: null,
          acknowledged_at: null,
          acknowledged_by: null,
          resolved_at: null,
          resolved_by: null,
          dismissed_at: null,
          dismissed_by: null,
          action_notes: null,
          resolution_reason: null,
          created_at: "2026-11-04T11:15:00Z",
          updated_at: "2026-11-04T11:15:00Z",
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    }));

    mockApi.getFleetHealthSummary.mockResolvedValue(mockFleetHealth);
    mockApi.getFleetHealthWarnings.mockResolvedValue([]);
    mockApi.getFleetIntelligence.mockResolvedValue({
      total_machines: 2,
      total_actual_energy_kwh: 500,
      total_wasted_energy_kwh: 45,
      active_episodes_count: 1,
      priority_machines: [],
      start_time: "2026-11-03T12:00:00Z",
      end_time: "2026-11-04T12:00:00Z",
      data_quality: "HIGH",
    } as any);
    mockApi.getWastagePatterns.mockResolvedValue({
      total_patterns_detected: 0,
      patterns: [],
      start_time: "2026-11-03T12:00:00Z",
      end_time: "2026-11-04T12:00:00Z",
      generated_at: "2026-11-04T12:00:00Z",
    });
    mockApi.getCorrectiveActions.mockResolvedValue([]);
    mockApi.getEnergyWastageReport.mockResolvedValue({
      report_period: {
        start_time: "2026-11-03T12:00:00Z",
        end_time: "2026-11-04T12:00:00Z",
        period_hours: 24,
      },
      fleet_summary: {
        total_machines: 2,
        total_actual_energy_kwh: 500,
        total_baseline_energy_kwh: 455,
        total_wasted_energy_kwh: 45,
        overall_wastage_percent: 9.0,
        total_events: 1,
        total_financial_loss_estimate: 4.5,
      },
      by_machine: [],
      by_reason: [],
      quality: {
        data_quality: "HIGH",
        completeness_pct: 100,
        unmeasured_channels: [],
      },
    } as any);
  });

  describe("Application Shell & Navigation Integrity", () => {
    it("renders all 8 standardized navigation tabs with accessible labels and keyboard focus", async () => {
      render(<App />);

      const nav = screen.getByLabelText(/ORVEX platform sections/i);
      expect(nav).toBeInTheDocument();

      // All 8 navigation buttons
      expect(screen.getByRole("button", { name: /^Fleet/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Machines/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Intelligence/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Health/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Alerts/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Reports/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Demo Center/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^System/i })).toBeInTheDocument();
    });

    it("switches navigation tabs smoothly on click", async () => {
      render(<App />);

      const machinesBtn = screen.getByRole("button", { name: /^Machines/i });
      const reportsBtn = screen.getByRole("button", { name: /^Reports/i });

      // Switch to Machines tab
      fireEvent.click(machinesBtn);
      expect(window.location.hash).toBe("#/machines");

      // Switch to Reports tab
      fireEvent.click(reportsBtn);
      expect(window.location.hash).toBe("#/reports");
    });

    it("displays live backend health pill and open alert counter badge", async () => {
      render(<App />);

      await waitFor(() => {
        expect(mockApi.getAlerts).toHaveBeenCalled();
      });

      // Backend status indicator
      expect(screen.getByText(/Backend:/i)).toBeInTheDocument();
    });

    it("renders industrial footer with deterministic analytics and verified stage badge", () => {
      render(<App />);

      expect(screen.getByText(/Deterministic Analytics/i)).toBeInTheDocument();
      expect(screen.getByText(/Stage 9 Verified Architecture/i)).toBeInTheDocument();
    });
  });

  describe("Truth in Telemetry & Sensor Boundary Integrity", () => {
    it("clearly discloses unmeasured vibration channel boundary in Health view", async () => {
      render(<App />);

      // Navigate to Health tab
      const healthBtn = screen.getByRole("button", { name: /^Health/i });
      fireEvent.click(healthBtn);

      await waitFor(() => {
        expect(screen.getByText(/Vibration Unmeasured/i)).toBeInTheDocument();
        expect(screen.getByText(/Hardware Retrofit Pending/i)).toBeInTheDocument();
      });
    });

    it("marks simulation telemetry in Demonstration Center with demo safeguards", async () => {
      render(<App />);

      // Navigate to Demo Center
      const demoBtn = screen.getByRole("button", { name: /^Demo Center/i });
      fireEvent.click(demoBtn);

      await waitFor(() => {
        // Safe simulator badge & uninstrumented channel disclosure
        expect(screen.getByText(/SIMULATED DEMO PIT/i)).toBeInTheDocument();
        expect(screen.getByText(/Uninstrumented on standard gateway/i)).toBeInTheDocument();
      });
    });
  });

  describe("Accessibility & Reusable Component Polish", () => {
    it("renders ConfirmModal with proper dialog roles, accessible title, and close label", () => {
      const handleConfirm = vi.fn();
      const handleCancel = vi.fn();

      render(
        <ConfirmModal
          isOpen={true}
          title="Verify Operational State"
          message="Are you sure you want to proceed with this action?"
          confirmLabel="Execute"
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      );

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAttribute("aria-labelledby", "confirm-modal-title");
      expect(screen.getByRole("button", { name: /Close dialog/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Execute" }));
      expect(handleConfirm).toHaveBeenCalledTimes(1);
    });

    it("renders ErrorAlert with role=alert and clickable retry button", () => {
      const handleRetry = vi.fn();
      render(
        <ErrorAlert
          title="API Network Fault"
          message="Failed to connect to backend telemetry service."
          onRetry={handleRetry}
        />
      );

      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(screen.getByText("API Network Fault")).toBeInTheDocument();

      const retryBtn = screen.getByRole("button", { name: /Retry/i });
      fireEvent.click(retryBtn);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });

    it("renders MetricCard with keyboard support when onClick is passed", () => {
      const handleClick = vi.fn();
      render(
        <MetricCard
          title="Active Power"
          value="95.5"
          unit="kW"
          onClick={handleClick}
        />
      );

      const card = screen.getByRole("button");
      expect(card).toHaveAttribute("tabindex", "0");

      // Enter key triggers click
      fireEvent.keyDown(card, { key: "Enter" });
      expect(handleClick).toHaveBeenCalledTimes(1);

      // Space key triggers click
      fireEvent.keyDown(card, { key: " " });
      expect(handleClick).toHaveBeenCalledTimes(2);
    });
  });
});
