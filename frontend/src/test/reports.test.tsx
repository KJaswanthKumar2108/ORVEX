import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ReportsView } from "../pages/ReportsView";
import { endpoints } from "../api/endpoints";
import type { EnergyWastageReportResponse, MachineSummaryResponse } from "../api/types";

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
];

const mockReport: EnergyWastageReportResponse = {
  start_time: "2026-03-29T10:00:00Z",
  end_time: "2026-03-30T10:00:00Z",
  machine_id: null,
  machine_name: null,
  actual_energy_kwh: 1250.5,
  estimated_wasted_energy_kwh: 145.2,
  total_wastage_events: 3,
  unestimated_wastage_events: 1,
  total_event_duration_seconds: 5400,
  data_coverage_ratio: 0.96,
  overall_quality: "GOOD",
  by_reason: [
    {
      reason: "IDLE_WASTAGE",
      event_count: 2,
      total_duration_seconds: 3600,
      estimated_wasted_energy_kwh: 145.2,
      unestimated_event_count: 0,
    },
    {
      reason: "START_STOP_CYCLING",
      event_count: 1,
      total_duration_seconds: 1800,
      estimated_wasted_energy_kwh: null,
      unestimated_event_count: 1,
    },
  ],
  by_machine: [
    {
      machine_id: "m-1",
      machine_identifier: "EX-01",
      machine_name: "Primary Excavator",
      machine_type: "excavator",
      actual_energy_kwh: 1250.5,
      estimated_wasted_energy_kwh: 145.2,
      total_wastage_events: 3,
      unestimated_wastage_events: 1,
      total_event_duration_seconds: 5400,
      data_coverage_ratio: 0.96,
      quality: "GOOD",
    },
  ],
  events_detail: [
    {
      event_id: "evt-1",
      machine_id: "m-1",
      machine_identifier: "EX-01",
      machine_name: "Primary Excavator",
      start_time: "2026-03-30T08:00:00Z",
      end_time: "2026-03-30T09:00:00Z",
      duration_seconds: 3600,
      detection_reason: "IDLE_WASTAGE",
      estimated_wasted_energy_kwh: 145.2,
      confidence_score: 0.95,
      status: "detected",
    },
    {
      event_id: "evt-2",
      machine_id: "m-1",
      machine_identifier: "EX-01",
      machine_name: "Primary Excavator",
      start_time: "2026-03-30T09:15:00Z",
      end_time: "2026-03-30T09:45:00Z",
      duration_seconds: 1800,
      detection_reason: "START_STOP_CYCLING",
      estimated_wasted_energy_kwh: null,
      confidence_score: 0.85,
      status: "detected",
    },
  ],
  generated_at: "2026-03-30T10:05:00Z",
};

describe("ReportsView", () => {
  beforeEach(() => {
    vi.spyOn(endpoints, "getEnergyWastageReport").mockResolvedValue(mockReport);
  });

  it("renders report KPI cards and breakdowns correctly", async () => {
    render(<ReportsView machines={mockMachines} onSelectMachine={vi.fn()} />);

    expect(screen.getByText("Energy-Wastage Reports")).toBeInTheDocument();

    await waitFor(() => {
      // Summary KPIs and table entries
      expect(screen.getAllByText(/1,250\.50 kWh/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/145\.20 kWh \(est\.\)/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("1 unestimated (cycling)")).toBeInTheDocument();
    });

    // Breakdown by reason and detail tables
    expect(screen.getAllByText("Idle Wastage").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Start/Stop Cycling").length).toBeGreaterThanOrEqual(1);

    // Breakdown by machine
    expect(screen.getAllByText("Primary Excavator").length).toBeGreaterThanOrEqual(1);

    // CSV Download button
    expect(screen.getByRole("button", { name: /download csv/i })).toBeInTheDocument();
  }, 15000);
});
