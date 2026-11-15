import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MachineTable } from "../components/dashboard/MachineTable";
import { SummaryMetrics } from "../components/dashboard/SummaryMetrics";
import { WastageEventsTable } from "../components/dashboard/WastageEventsTable";
import { MachineEnergySummaryCard } from "../components/machine/MachineEnergySummaryCard";
import { MachineSpecsCard } from "../components/machine/MachineSpecsCard";
import type {
  EnergySummaryResponse,
  MachineSummaryResponse,
  WastageEventResponse,
} from "../api/types";

describe("dashboard and machine components", () => {
  describe("SummaryMetrics", () => {
    it("renders all 5 metric cards with proper units and labels", () => {
      render(
        <SummaryMetrics
          totalMachines={5}
          freshMachinesCount={3}
          staleMachinesCount={1}
          missingMachinesCount={1}
          totalActualEnergyKwh={123.45}
          totalWastedEnergyKwh={21.8}
          totalEventsCount={4}
          selectedRangeLabel="Last 24 hours"
        />
      );

      expect(screen.getByText("Registered Units")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();

      expect(screen.getByText("Telemetry Freshness")).toBeInTheDocument();
      expect(screen.getByText("3 fresh")).toBeInTheDocument();

      expect(screen.getByText("Actual Energy")).toBeInTheDocument();
      expect(screen.getByText("123.5")).toBeInTheDocument();

      expect(screen.getByText("Estimated Wastage")).toBeInTheDocument();
      expect(screen.getByText("21.8")).toBeInTheDocument();

      expect(screen.getByText("Wastage Episodes")).toBeInTheDocument();
      expect(screen.getByText("4")).toBeInTheDocument();
    });
  });

  describe("MachineTable", () => {
    const mockMachines: MachineSummaryResponse[] = [
      {
        id: "m-1",
        site_id: "s-1",
        machine_identifier: "CONV-01",
        name: "Main Conveyor",
        machine_type: "conveyor",
        rated_power_kw: 132.0,
        status: "active",
        telemetry_freshness: "fresh",
        latest_telemetry_timestamp: "2026-09-26T12:00:00Z",
        latest_operating_state: "operating",
        latest_active_power: 95.4,
        latest_power_factor: 0.95,
        latest_temperature: 62.0,
        latest_load_percent: 72.3,
      },
    ];

    it("renders machine row and triggers selection on click", () => {
      const onSelect = vi.fn();
      render(<MachineTable machines={mockMachines} onSelectMachine={onSelect} />);

      expect(screen.getByText("Main Conveyor")).toBeInTheDocument();
      expect(screen.getByText("CONV-01")).toBeInTheDocument();
      expect(screen.getByText("95.4 kW")).toBeInTheDocument();
      expect(screen.getByText("132.0 kW")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Main Conveyor"));
      expect(onSelect).toHaveBeenCalledWith("m-1");
    });

    it("renders empty state when no machines are registered", () => {
      render(<MachineTable machines={[]} onSelectMachine={vi.fn()} />);
      expect(screen.getByText("No mining machines registered")).toBeInTheDocument();
    });
  });

  describe("WastageEventsTable", () => {
    it("renders wastage events and preserves null wasted energy for cycling candidate", () => {
      const mockEvents: WastageEventResponse[] = [
        {
          id: "e-1",
          machine_id: "m-1",
          start_time: "2026-09-26T10:00:00Z",
          end_time: "2026-09-26T10:15:00Z",
          duration_seconds: 900.0,
          detection_reason: "IDLE_WASTAGE",
          severity: "medium",
          estimated_energy_kwh: 12.0,
          estimated_wasted_energy_kwh: 12.0,
          confidence_score: 0.95,
          quality_score: 1.0,
          status: "detected",
          evidence_metadata: null,
          created_at: "2026-09-26T10:15:01Z",
        },
        {
          id: "e-2",
          machine_id: "m-2",
          start_time: "2026-09-26T11:00:00Z",
          end_time: "2026-09-26T11:20:00Z",
          duration_seconds: 1200.0,
          detection_reason: "START_STOP_CYCLING",
          severity: "high",
          estimated_energy_kwh: 20.0,
          estimated_wasted_energy_kwh: null, // Cycling preserves null!
          confidence_score: 0.88,
          quality_score: 1.0,
          status: "detected",
          evidence_metadata: null,
          created_at: "2026-09-26T11:20:01Z",
        },
      ];

      render(
        <WastageEventsTable
          events={mockEvents}
          machineNamesMap={{ "m-1": "Primary Crusher", "m-2": "Slurry Pump" }}
        />
      );

      // Verify regular idle wastage energy is shown
      expect(screen.getByText("Primary Crusher")).toBeInTheDocument();
      expect(screen.getByText("12.00 kWh (est.)")).toBeInTheDocument();

      // Verify cycling null wasted energy is explicitly shown as 'Not estimated'
      expect(screen.getByText("Slurry Pump")).toBeInTheDocument();
      expect(screen.getByText("Not estimated")).toBeInTheDocument();
    });

    it("renders empty state when no events exist", () => {
      render(<WastageEventsTable events={[]} />);
      expect(screen.getByText("No wastage episodes detected")).toBeInTheDocument();
    });
  });

  describe("MachineSpecsCard", () => {
    it("renders equipment specifications and latest measurements", () => {
      const machine: MachineSummaryResponse = {
        id: "m-uuid-1234",
        site_id: "site-uuid-5678",
        machine_identifier: "PUMP-04",
        name: "Tailings Pump 4",
        machine_type: "pump",
        rated_power_kw: 75.0,
        status: "active",
        telemetry_freshness: "fresh",
        latest_telemetry_timestamp: "2026-09-26T13:45:00Z",
        latest_operating_state: "operating",
        latest_active_power: 48.2,
        latest_power_factor: 0.92,
        latest_temperature: 58.4,
        latest_load_percent: 64.3,
      };

      render(<MachineSpecsCard machine={machine} />);

      expect(screen.getByText("Tailings Pump 4", { exact: false })).toBeDefined();
      expect(screen.getByText("PUMP-04")).toBeInTheDocument();
      expect(screen.getByText("75.0 kW")).toBeInTheDocument();
      expect(screen.getByText("48.2 kW")).toBeInTheDocument();
      expect(screen.getByText("64.3%")).toBeInTheDocument();
      expect(screen.getByText("58.4 °C")).toBeInTheDocument();
    });
  });

  describe("MachineEnergySummaryCard", () => {
    it("renders actual consumption, wasted energy, and state durations", () => {
      const summary: EnergySummaryResponse = {
        machine_id: "m-1",
        start_time: "2026-09-26T00:00:00Z",
        end_time: "2026-09-26T23:59:59Z",
        actual_energy_kwh: 350.75,
        estimated_wasted_energy_kwh: 45.2,
        wastage_event_count: 3,
        operating_duration_seconds: 54000.0,
        idle_duration_seconds: 7200.0,
        low_load_duration_seconds: 1800.0,
        abnormal_power_duration_seconds: 900.0,
        data_coverage_ratio: 0.94,
        quality: "GOOD",
        telemetry_sample_count: 8600,
      };

      render(<MachineEnergySummaryCard summary={summary} timeRangeLabel="Last 24 hours" />);

      expect(screen.getByText("350.75 kWh")).toBeInTheDocument();
      expect(screen.getByText("45.20 kWh (est.)")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText(/High Quality \(94%\)/)).toBeInTheDocument();

      // State durations
      expect(screen.getByText("15h")).toBeInTheDocument(); // 54000s = 15h
      expect(screen.getByText("2h")).toBeInTheDocument(); // 7200s = 2h
      expect(screen.getByText("30m")).toBeInTheDocument(); // 1800s = 30m
      expect(screen.getByText("15m")).toBeInTheDocument(); // 900s = 15m
    });
  });
});
