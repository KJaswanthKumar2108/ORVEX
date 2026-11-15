import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FleetKpiGrid } from "../components/dashboard/FleetKpiGrid";
import { FleetEnergyOverTimeChart } from "../components/dashboard/FleetEnergyOverTimeChart";
import { FleetEnergyByMachineChart } from "../components/dashboard/FleetEnergyByMachineChart";
import { WastageCategoryDistributionChart } from "../components/dashboard/WastageCategoryDistributionChart";
import { MachineTable } from "../components/dashboard/MachineTable";
import { AttentionRequiredPanel } from "../components/dashboard/AttentionRequiredPanel";
import { OperationalActivityStream } from "../components/dashboard/OperationalActivityStream";
import type {
  AlertRecord,
  MachineHealthWarning,
  MachineSummaryResponse,
  ReportMachineBreakdown,
  ReportReasonBreakdown,
  TelemetryRecordResponse,
  WastageEventResponse,
} from "../api/types";

describe("Stage 9B: Fleet Command Center Components", () => {
  describe("FleetKpiGrid", () => {
    it("renders all 6 fleet metrics with units, reporting period, and percentages", () => {
      render(
        <FleetKpiGrid
          kpis={{
            totalMonitoredMachines: 5,
            currentlyOperatingMachines: 3,
            totalEnergyConsumptionKwh: 350.5,
            estimatedEnergyWastageKwh: 45.2,
            activeAlertsCount: 2,
            machinesRequiringAttentionCount: 2,
          }}
          selectedRangeLabel="Last 24 hours"
        />
      );

      // 1. Total Monitored Machines
      expect(screen.getByText("Monitored Fleet")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("units")).toBeInTheDocument();

      // 2. Currently Operating Machines
      expect(screen.getByText("Operating Now")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText(/60.0% of fleet energized/)).toBeInTheDocument();

      // 3. Energy Consumption
      expect(screen.getByText("Energy Consumption")).toBeInTheDocument();
      expect(screen.getByText("350.5")).toBeInTheDocument();

      // 4. Estimated Energy Wastage
      expect(screen.getByText("Estimated Wastage")).toBeInTheDocument();
      expect(screen.getByText("45.2")).toBeInTheDocument();
      expect(screen.getByText(/12.9% of total power/)).toBeInTheDocument();

      // 5. Active Alerts & 6. Attention Needed (both count = 2)
      expect(screen.getByText("Active Alerts")).toBeInTheDocument();
      expect(screen.getAllByText("2").length).toBe(2);

      // 6. Attention Needed
      expect(screen.getByText("Attention Needed")).toBeInTheDocument();
      expect(screen.getByText("assets")).toBeInTheDocument();
    });

    it("handles missing/null energy metrics gracefully without fabricating values", () => {
      render(
        <FleetKpiGrid
          kpis={{
            totalMonitoredMachines: 0,
            currentlyOperatingMachines: 0,
            totalEnergyConsumptionKwh: null,
            estimatedEnergyWastageKwh: null,
            activeAlertsCount: 0,
            machinesRequiringAttentionCount: 0,
          }}
          selectedRangeLabel="Last 24 hours"
        />
      );

      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("No machines monitored")).toBeInTheDocument();
    });
  });

  describe("FleetEnergyOverTimeChart", () => {
    it("renders empty state fallback when no telemetry is present", () => {
      render(
        <FleetEnergyOverTimeChart
          telemetry={[]}
          timeRangeLabel="Last 24 hours"
        />
      );

      expect(
        screen.getByText("Insufficient Telemetry in Selected Window")
      ).toBeInTheDocument();
    });

    it("renders active power profile and average/peak power metrics when telemetry exists", () => {
      const mockTelemetry: TelemetryRecordResponse[] = [
        {
          timestamp: "2026-11-04T05:00:00Z",
          machine_id: "m-1",
          sensor_id: "s-1",
          voltage: 415.0,
          current: 120.0,
          active_power: 85.0,
          reactive_power: 12.0,
          apparent_power: 86.0,
          power_factor: 0.94,
          cumulative_energy: 1200.0,
          rpm: 1480.0,
          temperature: 62.0,
          load_percent: 64.0,
          operating_state: "operating",
        },
        {
          timestamp: "2026-11-04T05:00:30Z",
          machine_id: "m-1",
          sensor_id: "s-1",
          voltage: 415.0,
          current: 130.0,
          active_power: 95.0,
          reactive_power: 14.0,
          apparent_power: 96.0,
          power_factor: 0.94,
          cumulative_energy: 1201.0,
          rpm: 1480.0,
          temperature: 63.0,
          load_percent: 72.0,
          operating_state: "operating",
        },
      ];

      render(
        <FleetEnergyOverTimeChart
          telemetry={mockTelemetry}
          timeRangeLabel="Last 1 hour"
          machineName="Primary Overland Conveyor"
          ratedPowerKw={132.0}
        />
      );

      expect(
        screen.getByText("Active Power & Wastage Trend (Primary Overland Conveyor)")
      ).toBeInTheDocument();
      expect(screen.getByText("90.0 kW")).toBeInTheDocument(); // average power
      expect(screen.getByText("95.0 kW")).toBeInTheDocument(); // peak power
      expect(screen.getByText("Measured Power (kW)")).toBeInTheDocument();
    });
  });

  describe("FleetEnergyByMachineChart", () => {
    const mockMachineBreakdown: ReportMachineBreakdown[] = [
      {
        machine_id: "m-1",
        machine_identifier: "CONV-01",
        machine_name: "Overland Conveyor",
        machine_type: "conveyor",
        actual_energy_kwh: 120.5,
        estimated_wasted_energy_kwh: 15.2,
        total_wastage_events: 2,
        unestimated_wastage_events: 0,
        total_event_duration_seconds: 600,
        data_coverage_ratio: 0.95,
        quality: "GOOD",
      },
      {
        machine_id: "m-2",
        machine_identifier: "PUMP-02",
        machine_name: "Slurry Pump",
        machine_type: "pump",
        actual_energy_kwh: 80.0,
        estimated_wasted_energy_kwh: 0.0,
        total_wastage_events: 0,
        unestimated_wastage_events: 0,
        total_event_duration_seconds: 0,
        data_coverage_ratio: 0.9,
        quality: "GOOD",
      },
    ];

    it("renders comparative energy bars and navigates on machine click", () => {
      const onSelect = vi.fn();
      render(
        <FleetEnergyByMachineChart
          machineBreakdown={mockMachineBreakdown}
          onSelectMachine={onSelect}
        />
      );

      expect(screen.getByText("CONV-01")).toBeInTheDocument();
      expect(screen.getByText("Overland Conveyor")).toBeInTheDocument();
      expect(screen.getByText("120.50 kWh")).toBeInTheDocument();
      expect(screen.getByText(/Wasted: 15.20 kWh/)).toBeInTheDocument();

      expect(screen.getByText("PUMP-02")).toBeInTheDocument();
      expect(screen.getByText("0 kWh wasted")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Overland Conveyor"));
      expect(onSelect).toHaveBeenCalledWith("m-1");
    });

    it("renders empty state when no machines consumed energy", () => {
      render(
        <FleetEnergyByMachineChart
          machineBreakdown={[]}
          onSelectMachine={vi.fn()}
        />
      );

      expect(screen.getByText("No Asset Energy Recorded")).toBeInTheDocument();
    });
  });

  describe("WastageCategoryDistributionChart", () => {
    it("renders reason breakdown and preserves candidate unquantified events", () => {
      const mockReasons: ReportReasonBreakdown[] = [
        {
          reason: "IDLE_WASTAGE",
          event_count: 3,
          total_duration_seconds: 1200,
          estimated_wasted_energy_kwh: 18.5,
          unestimated_event_count: 0,
        },
        {
          reason: "START_STOP_CYCLING",
          event_count: 2,
          total_duration_seconds: 800,
          estimated_wasted_energy_kwh: null,
          unestimated_event_count: 2,
        },
      ];

      render(
        <WastageCategoryDistributionChart
          reasons={mockReasons}
          totalWastedKwh={18.5}
        />
      );

      expect(screen.getByText("Idle Wastage")).toBeInTheDocument();
      expect(screen.getByText("18.50 kWh")).toBeInTheDocument();
      expect(screen.getByText("3 episodes")).toBeInTheDocument();

      expect(screen.getByText("Start/Stop Cycling")).toBeInTheDocument();
      expect(screen.getByText(/Unquantified \(Inrush stress\)/)).toBeInTheDocument();
      expect(screen.getByText(/2 candidate events preserved/)).toBeInTheDocument();
    });

    it("renders reassuring empty state when zero wastage was detected", () => {
      render(
        <WastageCategoryDistributionChart
          reasons={[]}
          fallbackEvents={[]}
          totalWastedKwh={0}
        />
      );

      expect(screen.getByText("Zero Avoidable Wastage Detected")).toBeInTheDocument();
    });
  });

  describe("MachineTable Search, Filtering and Stale vs Stopped Distinction", () => {
    const mockMachines: MachineSummaryResponse[] = [
      {
        id: "m-1",
        site_id: "s-1",
        machine_identifier: "CONV-01",
        name: "Primary Conveyor",
        machine_type: "conveyor",
        rated_power_kw: 132.0,
        status: "active",
        telemetry_freshness: "fresh",
        latest_telemetry_timestamp: "2026-11-04T06:00:00Z",
        latest_operating_state: "operating",
        latest_active_power: 95.0,
        latest_power_factor: 0.92,
        latest_temperature: 64.0,
        latest_load_percent: 72.0,
      },
      {
        id: "m-2",
        site_id: "s-1",
        machine_identifier: "PUMP-02",
        name: "Slurry Pump",
        machine_type: "pump",
        rated_power_kw: 75.0,
        status: "active",
        telemetry_freshness: "fresh",
        latest_telemetry_timestamp: "2026-11-04T06:00:00Z",
        latest_operating_state: "stopped",
        latest_active_power: 0.0,
        latest_power_factor: 0.0,
        latest_temperature: 45.0,
        latest_load_percent: 0.0,
      },
      {
        id: "m-3",
        site_id: "s-1",
        machine_identifier: "FAN-03",
        name: "Ventilation Fan",
        machine_type: "fan",
        rated_power_kw: 55.0,
        status: "active",
        telemetry_freshness: "stale",
        latest_telemetry_timestamp: "2026-11-04T04:00:00Z",
        latest_operating_state: "operating",
        latest_active_power: 48.0,
        latest_power_factor: 0.9,
        latest_temperature: 52.0,
        latest_load_percent: 87.0,
      },
    ];

    it("clearly distinguishes stale telemetry from stopped equipment with live signal", () => {
      render(
        <MachineTable
          machines={mockMachines}
          onSelectMachine={vi.fn()}
        />
      );

      // Stale signal badge on FAN-03
      expect(screen.getByText("STALE SIGNAL")).toBeInTheDocument();

      // Stopped equipment with live telemetry signal on PUMP-02
      expect(screen.getByText("SIGNAL LIVE (OFF)")).toBeInTheDocument();

      // Streaming active telemetry on CONV-01
      expect(screen.getByText("STREAMING")).toBeInTheDocument();
    });

    it("filters machines by search text", () => {
      render(
        <MachineTable
          machines={mockMachines}
          onSelectMachine={vi.fn()}
        />
      );

      const searchInput = screen.getByPlaceholderText(/Search machines by name/i);
      fireEvent.change(searchInput, { target: { value: "Ventilation" } });

      expect(screen.getByText("Ventilation Fan")).toBeInTheDocument();
      expect(screen.queryByText("Primary Conveyor")).not.toBeInTheDocument();
      expect(screen.queryByText("Slurry Pump")).not.toBeInTheDocument();
    });
  });

  describe("AttentionRequiredPanel", () => {
    it("aggregates high-severity alerts and health warnings into prioritized triage", () => {
      const mockAlerts: AlertRecord[] = [
        {
          id: "alt-1",
          machine_id: "m-1",
          machine_identifier: "CONV-01",
          machine_name: "Primary Conveyor",
          event_id: "ev-1",
          alert_type: "ENERGY_WASTAGE",
          severity: "high",
          title: "Sustained Idle Wastage",
          description: "Conveyor idling for 18 minutes drawing 22kW unladen.",
          recommendation: "Interlock drive to auto-idle.",
          status: "open",
          occurred_at: "2026-11-04T05:30:00Z",
          resolved_at: null,
          created_at: "2026-11-04T05:30:00Z",
        },
      ];

      const mockHealthWarnings: MachineHealthWarning[] = [
        {
          id: "hw-1",
          machine_id: "m-1",
          machine_name: "Primary Conveyor",
          warning_type: "RPM_FLUCTUATION_OR_SLIP",
          severity: "CRITICAL",
          status: "open",
          detected_at: "2026-11-04T05:40:00Z",
          window_start: "2026-11-04T05:00:00Z",
          window_end: "2026-11-04T05:40:00Z",
          observed_value: 0.39,
          baseline_value: 0.015,
          threshold_value: 0.15,
          unit: "CV",
          severity_rationale: "RPM fluctuation (CV=0.39) exceeds critical stability threshold.",
          telemetry_evidence: {},
          confidence_score: 0.88,
          data_quality: "GOOD",
          recommended_action: "Inspect drive belt tension.",
          created_at: "2026-11-04T05:40:00Z",
        },
      ];

      const onSelect = vi.fn();
      render(
        <AttentionRequiredPanel
          alerts={mockAlerts}
          healthWarnings={mockHealthWarnings}
          machines={[]}
          onSelectMachine={onSelect}
        />
      );

      // Verify items render
      expect(screen.getByText("Sustained Idle Wastage")).toBeInTheDocument();
      expect(screen.getByText("RPM FLUCTUATION OR SLIP")).toBeInTheDocument();
      expect(screen.getByText("CRITICAL")).toBeInTheDocument();
      expect(screen.getByText("WARNING")).toBeInTheDocument();

      // Click inspect asset
      const inspectButtons = screen.getAllByRole("button", { name: /Inspect Asset/i });
      fireEvent.click(inspectButtons[0]);
      expect(onSelect).toHaveBeenCalledWith("m-1");
    });

    it("displays reassuring empty state when no equipment needs attention", () => {
      render(
        <AttentionRequiredPanel
          alerts={[]}
          healthWarnings={[]}
          machines={[]}
          onSelectMachine={vi.fn()}
        />
      );

      expect(screen.getByText("Fleet Operating Nominally")).toBeInTheDocument();
    });
  });

  describe("OperationalActivityStream", () => {
    it("renders chronological feed of wastage and alert events", () => {
      const mockWastage: WastageEventResponse[] = [
        {
          id: "w-1",
          machine_id: "m-1",
          start_time: "2026-11-04T05:00:00Z",
          end_time: "2026-11-04T05:15:00Z",
          duration_seconds: 900,
          detection_reason: "IDLE_WASTAGE",
          severity: "warning",
          estimated_energy_kwh: 12.0,
          estimated_wasted_energy_kwh: 12.0,
          confidence_score: 0.95,
          quality_score: 1.0,
          status: "detected",
          evidence_metadata: {},
          created_at: "2026-11-04T05:15:00Z",
        },
      ];

      render(
        <OperationalActivityStream
          wastageEvents={mockWastage}
          alerts={[]}
          healthWarnings={[]}
          machines={[{ id: "m-1", name: "Primary Conveyor" } as MachineSummaryResponse]}
        />
      );

      expect(screen.getByText("Idle Wastage Detected")).toBeInTheDocument();
      expect(screen.getByText("Primary Conveyor")).toBeInTheDocument();
      expect(screen.getByText("12.0 kWh lost")).toBeInTheDocument();
    });

    it("renders empty state when no activity has occurred", () => {
      render(
        <OperationalActivityStream
          wastageEvents={[]}
          alerts={[]}
          healthWarnings={[]}
          machines={[]}
        />
      );

      expect(screen.getByText("No Operational Activity")).toBeInTheDocument();
    });
  });
});
