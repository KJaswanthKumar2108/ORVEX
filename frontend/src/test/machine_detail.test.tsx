import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MachineDetailHeader } from "../components/machine/MachineDetailHeader";
import { LiveOperatingOverview } from "../components/machine/LiveOperatingOverview";
import { ElectricalPerformanceCharts } from "../components/machine/ElectricalPerformanceCharts";
import { OperationalPerformanceCharts } from "../components/machine/OperationalPerformanceCharts";
import { WastageInvestigationSection } from "../components/machine/WastageInvestigationSection";
import { MachineHealthInvestigationSection } from "../components/machine/MachineHealthInvestigationSection";
import { HistoricalActivityTimeline } from "../components/machine/HistoricalActivityTimeline";
import { MachineDetailView } from "../pages/MachineDetailView";
import { api } from "../api/endpoints";
import type {
  AlertRecord,
  EnergySummaryResponse,
  MachineHealthDetailResponse,
  MachineHealthWarning,
  MachineResponse,
  MachineSummaryResponse,
  MaintenanceObservation,
  TelemetryRecordResponse,
  WastageEventResponse,
} from "../api/types";

// Mock Data Fixtures
const mockMachineSummary: MachineSummaryResponse = {
  id: "mach-jaw-01",
  site_id: "site-north-pit",
  machine_identifier: "CRUSH-JAW-01",
  name: "Primary Jaw Crusher 01",
  machine_type: "crusher",
  rated_power_kw: 250.0,
  status: "active",
  telemetry_freshness: "fresh",
  latest_telemetry_timestamp: "2026-11-04T12:00:00Z",
  latest_operating_state: "operating",
  latest_active_power: 185.4,
  latest_power_factor: 0.88,
  latest_temperature: 64.2,
  latest_load_percent: 74.1,
};

const mockMachineMeta: MachineResponse = {
  id: "mach-jaw-01",
  site_id: "site-north-pit",
  machine_identifier: "CRUSH-JAW-01",
  name: "Primary Jaw Crusher 01",
  machine_type: "crusher",
  rated_power_kw: 250.0,
  status: "active",
  created_at: "2026-01-15T08:00:00Z",
};

const mockLatestTelemetry: TelemetryRecordResponse = {
  timestamp: "2026-11-04T12:00:00Z",
  machine_id: "mach-jaw-01",
  sensor_id: "ct-clamp-01",
  voltage: 412.5,
  current: 295.2,
  active_power: 185.4,
  reactive_power: 98.3,
  apparent_power: 210.0,
  power_factor: 0.88,
  cumulative_energy: 1420.5,
  rpm: 850,
  temperature: 64.2,
  load_percent: 74.1,
  operating_state: "operating",
};

const mockTelemetrySeries: TelemetryRecordResponse[] = [
  {
    timestamp: "2026-11-04T11:00:00Z",
    machine_id: "mach-jaw-01",
    sensor_id: "ct-clamp-01",
    voltage: 415.0,
    current: 280.0,
    active_power: 175.0,
    reactive_power: 90.0,
    apparent_power: 196.0,
    power_factor: 0.89,
    cumulative_energy: 1245.5,
    rpm: 850,
    temperature: 61.0,
    load_percent: 70.0,
    operating_state: "operating",
  },
  {
    timestamp: "2026-11-04T11:30:00Z",
    machine_id: "mach-jaw-01",
    sensor_id: "ct-clamp-01",
    voltage: 414.0,
    current: 45.0,
    active_power: 28.5,
    reactive_power: 35.0,
    apparent_power: 45.0,
    power_factor: 0.63,
    cumulative_energy: 1332.5,
    rpm: 850,
    temperature: 62.5,
    load_percent: 11.4,
    operating_state: "idle",
  },
  {
    timestamp: "2026-11-04T12:00:00Z",
    machine_id: "mach-jaw-01",
    sensor_id: "ct-clamp-01",
    voltage: 412.5,
    current: 295.2,
    active_power: 185.4,
    reactive_power: 98.3,
    apparent_power: 210.0,
    power_factor: 0.88,
    cumulative_energy: 1420.5,
    rpm: 850,
    temperature: 64.2,
    load_percent: 74.1,
    operating_state: "operating",
  },
];

const mockEnergySummary: EnergySummaryResponse = {
  machine_id: "mach-jaw-01",
  start_time: "2026-11-03T12:00:00Z",
  end_time: "2026-11-04T12:00:00Z",
  actual_energy_kwh: 2450.8,
  estimated_wasted_energy_kwh: 182.4,
  wastage_event_count: 2,
  operating_duration_seconds: 64800, // 18h
  idle_duration_seconds: 14400, // 4h
  low_load_duration_seconds: 3600, // 1h
  abnormal_power_duration_seconds: 0,
  data_coverage_ratio: 0.985,
  quality: "GOOD",
  telemetry_sample_count: 86400,
};

const mockWastageEvents: WastageEventResponse[] = [
  {
    id: "we-001",
    machine_id: "mach-jaw-01",
    start_time: "2026-11-04T09:15:00Z",
    end_time: "2026-11-04T10:00:00Z",
    duration_seconds: 2700,
    detection_reason: "idle_running",
    severity: "high",
    estimated_energy_kwh: 45.0,
    estimated_wasted_energy_kwh: 38.5,
    confidence_score: 0.94,
    quality_score: 1.0,
    status: "confirmed",
    evidence_metadata: {
      average_idle_power_kw: 28.5,
      idle_power_threshold_kw: 25.0,
      feed_sensor_state: "EMPTY",
    },
    created_at: "2026-11-04T10:00:05Z",
  },
  {
    id: "we-002",
    machine_id: "mach-jaw-01",
    start_time: "2026-11-04T06:00:00Z",
    end_time: "2026-11-04T06:45:00Z",
    duration_seconds: 2700,
    detection_reason: "rapid_cycling",
    severity: "medium",
    estimated_energy_kwh: 30.0,
    estimated_wasted_energy_kwh: null, // Rapid cycling not directly quantifiable in kWh
    confidence_score: 0.88,
    quality_score: 1.0,
    status: "detected",
    evidence_metadata: {
      cycle_count: 14,
      threshold_cycles_per_hour: 6,
    },
    created_at: "2026-11-04T06:45:10Z",
  },
];

const mockAlerts: AlertRecord[] = [
  {
    id: "alt-01",
    machine_id: "mach-jaw-01",
    machine_identifier: "CRUSH-JAW-01",
    machine_name: "Primary Jaw Crusher 01",
    event_id: "we-001",
    alert_type: "wastage",
    severity: "high",
    title: "Excessive Unloaded Idle Running",
    description: "Crusher running idle for >45 minutes without feeder material.",
    recommendation: "Interlock feeder conveyor with crusher drive.",
    status: "open",
    occurred_at: "2026-11-04T09:30:00Z",
    resolved_at: null,
    created_at: "2026-11-04T09:30:00Z",
  },
];

const mockHealthWarnings: MachineHealthWarning[] = [
  {
    id: "hw-01",
    machine_id: "mach-jaw-01",
    machine_name: "Primary Jaw Crusher 01",
    warning_type: "thermal_drift",
    severity: "WARNING",
    status: "open",
    detected_at: "2026-11-04T10:30:00Z",
    window_start: "2026-11-04T08:30:00Z",
    window_end: "2026-11-04T10:30:00Z",
    observed_value: 68.4,
    baseline_value: 58.0,
    threshold_value: 65.0,
    unit: "°C",
    severity_rationale: "Housing temperature is +10.4°C above historical baseline under equivalent 75% load.",
    telemetry_evidence: {
      ambient_temp: 24.5,
      cooling_fan_status: "ACTIVE",
    },
    confidence_score: 0.91,
    data_quality: "GOOD",
    recommended_action: "Inspect bearing lubrication grease and verify radiator fins are clean.",
    created_at: "2026-11-04T10:30:10Z",
  },
];

const mockObservations: MaintenanceObservation[] = [
  {
    id: "obs-01",
    machine_id: "mach-jaw-01",
    machine_name: "Primary Jaw Crusher 01",
    inspector_name: "A. Sharma (Lead Tech)",
    inspection_date: "2026-11-03T14:00:00Z",
    suspected_issue: "Drive belt tension slack and bearing grease contamination",
    corrective_action: "Re-tensioned V-belts and topped up synthetic lithium complex grease",
    status: "resolved",
    notes: "Thermal trend stabilized after lubrication.",
    created_at: "2026-11-03T15:00:00Z",
  },
];

const mockHealthDetail: MachineHealthDetailResponse = {
  machine_id: "mach-jaw-01",
  machine_name: "Primary Jaw Crusher 01",
  machine_type: "crusher",
  rated_power_kw: 250.0,
  health_score: 84.5,
  health_status: "WATCH",
  sub_scores: {
    electrical_stability: 92.0,
    thermal_margin: 74.0,
    operational_consistency: 88.0,
    state_stability: 84.0,
  },
  channels: [
    {
      channel_name: "vibration",
      status: "UNMEASURED_NOT_INSTALLED",
      sample_count: 0,
      description: "External piezo accelerometer not retrofitted (ISO 10816-3)",
    },
  ],
  data_coverage_hours: 24.0,
  telemetry_sample_count: 86400,
  active_warnings: mockHealthWarnings,
  recent_observations: mockObservations,
  causality_disclaimer: "Deterministic condition monitoring only.",
};

describe("Stage 9C: Machine Detail & Live Telemetry Experience", () => {
  describe("MachineDetailHeader", () => {
    it("renders identity metadata, status pills, and last telemetry received", () => {
      render(
        <MachineDetailHeader
          machine={mockMachineSummary}
          machineMeta={mockMachineMeta}
          healthStatus="WATCH"
          selectedRange="24h"
          onRangeChange={vi.fn()}
          onBack={vi.fn()}
          onRefresh={vi.fn()}
          lastRefreshed={new Date("2026-11-04T12:05:00Z")}
          autoRefreshInterval={30}
          onAutoRefreshChange={vi.fn()}
        />
      );

      // Identity & Attributes
      expect(screen.getByText("Primary Jaw Crusher 01")).toBeInTheDocument();
      expect(screen.getByText("CRUSH-JAW-01")).toBeInTheDocument();
      expect(screen.getByText("250 kW")).toBeInTheDocument();
      expect(screen.getByText(/Site: site-north-pit/)).toBeInTheDocument();

      // Operating & Health state pills
      expect(screen.getByText("Operating")).toBeInTheDocument();
      expect(screen.getByText("Watch")).toBeInTheDocument();

      // Telemetry freshness & Gateway notice
      expect(screen.getByText("Fresh")).toBeInTheDocument();
      expect(screen.getByText("Active Modbus RTU / MQTT Feed")).toBeInTheDocument();

      // Back navigation button
      expect(screen.getByText("Back to Fleet Command Center")).toBeInTheDocument();
    });

    it("distinguishes stopped equipment with fresh sensor from stale sensor drop", () => {
      // 1. Stopped equipment but fresh telemetry
      const { rerender } = render(
        <MachineDetailHeader
          machine={{
            ...mockMachineSummary,
            latest_operating_state: "stopped",
            telemetry_freshness: "fresh",
          }}
          selectedRange="24h"
          onRangeChange={vi.fn()}
          onBack={vi.fn()}
          onRefresh={vi.fn()}
          lastRefreshed={new Date()}
          autoRefreshInterval={30}
          onAutoRefreshChange={vi.fn()}
        />
      );

      expect(
        screen.getByText("Equipment Stopped • Sensor Online (0 kW)")
      ).toBeInTheDocument();

      // 2. Stale telemetry
      rerender(
        <MachineDetailHeader
          machine={{
            ...mockMachineSummary,
            telemetry_freshness: "stale",
          }}
          selectedRange="24h"
          onRangeChange={vi.fn()}
          onBack={vi.fn()}
          onRefresh={vi.fn()}
          lastRefreshed={new Date()}
          autoRefreshInterval={30}
          onAutoRefreshChange={vi.fn()}
        />
      );

      expect(
        screen.getByText("Telemetry Stale • Gateway Delayed")
      ).toBeInTheDocument();
    });

    it("triggers back button callback on click", () => {
      const handleBack = vi.fn();
      render(
        <MachineDetailHeader
          machine={mockMachineSummary}
          selectedRange="24h"
          onRangeChange={vi.fn()}
          onBack={handleBack}
          onRefresh={vi.fn()}
          lastRefreshed={new Date()}
          autoRefreshInterval={30}
          onAutoRefreshChange={vi.fn()}
        />
      );

      fireEvent.click(screen.getByText("Back to Fleet Command Center"));
      expect(handleBack).toHaveBeenCalledTimes(1);
    });
  });

  describe("LiveOperatingOverview", () => {
    it("renders all 9 operating instrumentation metrics with proper units", () => {
      render(
        <LiveOperatingOverview
          machine={mockMachineSummary}
          latestRecord={mockLatestTelemetry}
          energySummary={mockEnergySummary}
        />
      );

      // 1. Active power
      expect(screen.getByText("185.4 kW")).toBeInTheDocument();
      // 2. Voltage
      expect(screen.getByText("412.5")).toBeInTheDocument();
      // 3. Current
      expect(screen.getByText("295.2")).toBeInTheDocument();
      // 4. Power factor
      expect(screen.getByText("0.88")).toBeInTheDocument();
      // 5. Cumulative energy
      expect(screen.getByText("2,450.80 kWh")).toBeInTheDocument();
      // 6. RPM
      expect(screen.getByText("850")).toBeInTheDocument();
      // 7. Temperature
      expect(screen.getByText("64.2")).toBeInTheDocument();
      // 8. Load factor
      expect(screen.getByText("74.1%")).toBeInTheDocument();
      // 9. Operating State
      expect(screen.getAllByText("Operating").length).toBeGreaterThanOrEqual(1);
    });

    it("displays unmeasured '—' for missing parameters instead of fabricating zero", () => {
      render(
        <LiveOperatingOverview
          machine={{
            ...mockMachineSummary,
            latest_active_power: null,
            latest_power_factor: null,
            latest_temperature: null,
            latest_load_percent: null,
          }}
          latestRecord={null}
          energySummary={null}
        />
      );

      // Dash placeholders for missing readings
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThanOrEqual(4);

      // Should explicitly state unmeasured
      const unmeasuredBadges = screen.getAllByText("Unmeasured");
      expect(unmeasuredBadges.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("ElectricalPerformanceCharts", () => {
    it("renders time-series SVG tabs and navigates between power, VI, and PF", () => {
      render(
        <ElectricalPerformanceCharts
          telemetry={mockTelemetrySeries}
          ratedPowerKw={250}
          timeRangeLabel="Last 24 hours"
        />
      );

      expect(screen.getByText("Electrical Performance Analysis")).toBeInTheDocument();
      expect(screen.getByText(/Nameplate Rated: 250 kW/)).toBeInTheDocument();

      // Click Voltage & Current tab
      fireEvent.click(screen.getByText("Voltage & Current"));
      expect(screen.getByText("Voltage (V)")).toBeInTheDocument();
      expect(screen.getByText("Current (A)")).toBeInTheDocument();

      // Click Power Factor tab
      fireEvent.click(screen.getByText("Power Factor (cos φ)"));
      expect(screen.getByText(/Target PF Benchmark: 0.85/)).toBeInTheDocument();
    });

    it("displays empty state when telemetry is sparse/empty", () => {
      render(
        <ElectricalPerformanceCharts
          telemetry={[]}
          timeRangeLabel="Last 24 hours"
        />
      );

      expect(
        screen.getByText("No telemetry recorded for this interval")
      ).toBeInTheDocument();
    });
  });

  describe("OperationalPerformanceCharts", () => {
    it("renders load and thermal curves, and state duration breakdown", () => {
      render(
        <OperationalPerformanceCharts
          telemetry={mockTelemetrySeries}
          energySummary={mockEnergySummary}
          timeRangeLabel="Last 24 hours"
        />
      );

      expect(screen.getByText("Operational Performance & State Dynamics")).toBeInTheDocument();

      // Click Temperature tab
      fireEvent.click(screen.getByText("Temperature (°C)"));
      expect(screen.getByText(/Warning Limit: 70.0 °C/)).toBeInTheDocument();

      // Click State Breakdown tab
      fireEvent.click(screen.getByText("State Breakdown"));
      expect(screen.getByText("State Durations & Equipment Utilization (Last 24 hours)")).toBeInTheDocument();
      expect(screen.getByText("18h")).toBeInTheDocument(); // 64800s operating
      expect(screen.getByText("4h")).toBeInTheDocument(); // 14400s idle
    });
  });

  describe("WastageInvestigationSection", () => {
    it("renders detected episodes table and opens evidence investigation modal", () => {
      render(
        <WastageInvestigationSection
          events={mockWastageEvents}
          machineName="Primary Jaw Crusher 01"
        />
      );

      expect(screen.getByText("Energy Wastage Episodes & Evidence Investigation")).toBeInTheDocument();
      expect(screen.getByText("2 Detected Episodes")).toBeInTheDocument();
      expect(screen.getByText("38.50 kWh")).toBeInTheDocument();

      // Check unquantified handling (rapid cycling)
      expect(screen.getByText("Not quantified (cycling stress)")).toBeInTheDocument();

      // Click Investigate on the first episode
      const investigateButtons = screen.getAllByRole("button", { name: /investigate/i });
      fireEvent.click(investigateButtons[0]);

      // Evidence modal should open
      expect(screen.getByText(/Evidence Dossier: IDLE RUNNING/i)).toBeInTheDocument();
      expect(screen.getByText(/Deterministic Quantification Formula/i)).toBeInTheDocument();
      expect(screen.getByText(/Operator Standard Operating Procedure/i)).toBeInTheDocument();

      // Close modal
      fireEvent.click(screen.getByRole("button", { name: /close dossier/i }));
      expect(screen.queryByText(/Evidence Dossier: IDLE RUNNING/i)).not.toBeInTheDocument();
    });
  });

  describe("MachineHealthInvestigationSection", () => {
    it("renders health index, sub-scores, unmeasured vibration disclosure, and warnings", () => {
      render(
        <MachineHealthInvestigationSection
          machineId="mach-jaw-01"
          healthDetail={mockHealthDetail}
          healthWarnings={mockHealthWarnings}
          onAcknowledgeWarning={vi.fn()}
          onCreateObservation={vi.fn()}
        />
      );

      // Health Score
      expect(screen.getByText("85")).toBeInTheDocument();
      expect(screen.getByText("Watch State")).toBeInTheDocument();

      // Sub scores
      expect(screen.getByText("92%")).toBeInTheDocument(); // electrical
      expect(screen.getByText("74%")).toBeInTheDocument(); // thermal

      // Unmeasured Vibration Disclosure
      expect(screen.getByText(/Vibration Channel Disclosure \(ISO 10816-3\):/)).toBeInTheDocument();

      // Warning card
      expect(screen.getByText(/Thermal Drift/i)).toBeInTheDocument();
      expect(screen.getByText("68.4 °C")).toBeInTheDocument();
      expect(screen.getByText("58 °C")).toBeInTheDocument();
    });
  });

  describe("HistoricalActivityTimeline", () => {
    it("renders combined chronological events and filters by category", () => {
      render(
        <HistoricalActivityTimeline
          telemetry={mockTelemetrySeries}
          wastageEvents={mockWastageEvents}
          alerts={mockAlerts}
          healthWarnings={mockHealthWarnings}
          observations={mockObservations}
        />
      );

      expect(screen.getByText("Historical Operational Activity Timeline")).toBeInTheDocument();

      // Check presence of items
      expect(screen.getByText(/Energy Wastage: IDLE RUNNING/)).toBeInTheDocument();
      expect(screen.getByText(/Alert: Excessive Unloaded Idle Running/)).toBeInTheDocument();
      expect(screen.getByText(/Condition Warning: THERMAL DRIFT/)).toBeInTheDocument();
      expect(screen.getByText(/Maintenance: Drive belt tension slack/)).toBeInTheDocument();

      // Filter to Wastage only
      fireEvent.click(screen.getByRole("button", { name: /^wastage/i }));
      expect(screen.getByText(/Energy Wastage: IDLE RUNNING/)).toBeInTheDocument();
      expect(screen.queryByText(/Alert: Excessive Unloaded Idle Running/)).not.toBeInTheDocument();
    });
  });

  describe("MachineDetailView (Full Page Integration)", () => {
    beforeEach(() => {
      vi.spyOn(api, "getMachineSummary").mockResolvedValue(mockMachineSummary);
      vi.spyOn(api, "getMachine").mockResolvedValue(mockMachineMeta);
      vi.spyOn(api, "getMachineEnergySummary").mockResolvedValue(mockEnergySummary);
      vi.spyOn(api, "getMachineTelemetry").mockResolvedValue({
        items: mockTelemetrySeries,
        total: mockTelemetrySeries.length,
        limit: 20,
        offset: 0,
      });
      vi.spyOn(api, "getMachineWastageEvents").mockResolvedValue({
        items: mockWastageEvents,
        total: mockWastageEvents.length,
        limit: 50,
        offset: 0,
      });
      vi.spyOn(api, "getMachineAlerts").mockResolvedValue({
        items: mockAlerts,
        total: mockAlerts.length,
        limit: 50,
        offset: 0,
      });
      vi.spyOn(api, "getMachineHealthDetail").mockResolvedValue(mockHealthDetail);
      vi.spyOn(api, "getMachineHealthWarnings").mockResolvedValue(mockHealthWarnings);
    });

    it("loads and displays full diagnostic experience for valid machine", async () => {
      render(<MachineDetailView machineId="mach-jaw-01" onBack={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Primary Jaw Crusher 01")).toBeInTheDocument();
        expect(screen.getByText("CRUSH-JAW-01")).toBeInTheDocument();
      });

      // Verify sections are mounted
      expect(screen.getByText("Live Operating Overview & Instrumentation")).toBeInTheDocument();
      expect(screen.getByText("Electrical Performance Analysis")).toBeInTheDocument();
      expect(screen.getByText("Operational Performance & State Dynamics")).toBeInTheDocument();
      expect(screen.getByText("Energy Wastage Episodes & Evidence Investigation")).toBeInTheDocument();
      expect(screen.getByText("Machine Health & Condition Diagnostics")).toBeInTheDocument();
      expect(screen.getByText("Historical Operational Activity Timeline")).toBeInTheDocument();
      expect(screen.getByText("Raw Telemetry Log")).toBeInTheDocument();
    });

    it("displays 404 Machine Not Found state with return action when ID is invalid", async () => {
      vi.spyOn(api, "getMachineSummary").mockRejectedValue(new Error("Machine 404 Not Found"));
      vi.spyOn(api, "getMachine").mockRejectedValue(new Error("Machine 404 Not Found"));

      const handleBack = vi.fn();
      render(<MachineDetailView machineId="invalid-id-999" onBack={handleBack} />);

      await waitFor(() => {
        expect(screen.getByText(/Machine Not Found \(ID: invalid-id-999\)/)).toBeInTheDocument();
      });

      const returnBtn = screen.getByRole("button", { name: /Return to Fleet Command Center/i });
      expect(returnBtn).toBeInTheDocument();
      fireEvent.click(returnBtn);
      expect(handleBack).toHaveBeenCalledTimes(1);
    });
  });
});
