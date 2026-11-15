import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const mockCompleteReport: EnergyWastageReportResponse = {
  start_time: "2026-03-29T10:00:00Z",
  end_time: "2026-03-30T10:00:00Z",
  machine_id: null,
  machine_name: null,
  actual_energy_kwh: 3450.75,
  estimated_wasted_energy_kwh: 412.50,
  total_wastage_events: 5,
  unestimated_wastage_events: 2,
  total_event_duration_seconds: 7200,
  data_coverage_ratio: 0.88, // Trigger coverage warning (< 0.90)
  overall_quality: "DEGRADED",
  by_reason: [
    {
      reason: "IDLE_WASTAGE",
      event_count: 3,
      total_duration_seconds: 5400,
      estimated_wasted_energy_kwh: 412.50,
      unestimated_event_count: 0,
    },
    {
      reason: "START_STOP_CYCLING",
      event_count: 2,
      total_duration_seconds: 1800,
      estimated_wasted_energy_kwh: null,
      unestimated_event_count: 2,
    },
  ],
  by_machine: [
    {
      machine_id: "m-1",
      machine_identifier: "EX-01",
      machine_name: "Primary Excavator",
      machine_type: "excavator",
      actual_energy_kwh: 2200.0,
      estimated_wasted_energy_kwh: 280.0,
      total_wastage_events: 3,
      unestimated_wastage_events: 1,
      total_event_duration_seconds: 4800,
      data_coverage_ratio: 0.89,
      quality: "DEGRADED",
    },
    {
      machine_id: "m-2",
      machine_identifier: "CR-01",
      machine_name: "Jaw Crusher A",
      machine_type: "crusher",
      actual_energy_kwh: 1250.75,
      estimated_wasted_energy_kwh: 132.50,
      total_wastage_events: 2,
      unestimated_wastage_events: 1,
      total_event_duration_seconds: 2400,
      data_coverage_ratio: 0.87,
      quality: "DEGRADED",
    },
  ],
  events_detail: [
    {
      event_id: "evt-901",
      machine_id: "m-1",
      machine_identifier: "EX-01",
      machine_name: "Primary Excavator",
      start_time: "2026-03-30T04:00:00Z",
      end_time: "2026-03-30T05:30:00Z",
      duration_seconds: 5400,
      detection_reason: "IDLE_WASTAGE",
      estimated_wasted_energy_kwh: 412.50,
      confidence_score: 0.95,
      status: "detected",
    },
  ],
  generated_at: "2026-03-30T10:05:00Z",
};

describe("Reporting Center & Audit Export (Stage 9E)", () => {
  beforeEach(() => {
    vi.spyOn(endpoints, "getEnergyWastageReport").mockResolvedValue(mockCompleteReport);
  });

  it("renders executive KPI overview, charts, and breakdown tables accurately", async () => {
    render(<ReportsView machines={mockMachines} onSelectMachine={vi.fn()} />);

    expect(screen.getByText("Energy-Wastage Reports")).toBeInTheDocument();

    await waitFor(() => {
      // Formatted metrics
      expect(screen.getByText(/3,450\.75 kWh/i)).toBeInTheDocument();
      expect(screen.getByText(/412\.50 kWh \(est\.\)/i)).toBeInTheDocument();
      expect(screen.getByText("2 unestimated (cycling)")).toBeInTheDocument();
      expect(screen.getByText(/12\.0%/i)).toBeInTheDocument(); // 412.5 / 3450.75 * 100 = 11.95 -> 12.0%
    });

    // Reason breakdowns
    expect(screen.getAllByText("Idle Wastage").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Start/Stop Cycling").length).toBeGreaterThanOrEqual(1);

    // Equipment breakdown
    expect(screen.getAllByText("Primary Excavator").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Jaw Crusher A").length).toBeGreaterThanOrEqual(1);
  });

  it("displays data completeness warning when coverage is under 90%", async () => {
    render(<ReportsView machines={mockMachines} onSelectMachine={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Telemetry Coverage Notice: 88% Data Completeness/i)).toBeInTheDocument();
      expect(screen.getByText(/Gaps exceeding 30 seconds were detected/i)).toBeInTheDocument();
    });
  });

  it("handles official CSV export triggering with correct endpoint params", async () => {
    const csvSpy = vi
      .spyOn(endpoints, "getEnergyWastageReportCsvUrl")
      .mockReturnValue("http://127.0.0.1:8000/api/v1/reports/energy-wastage/csv?format=csv");

    render(<ReportsView machines={mockMachines} onSelectMachine={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/3,450\.75 kWh/i)).toBeInTheDocument();
    });

    const downloadBtn = screen.getByRole("button", { name: /download csv/i });
    expect(downloadBtn).toBeInTheDocument();
    expect(downloadBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(downloadBtn);
    });

    expect(csvSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "csv",
      })
    );
  });

  it("updates report data when equipment scope is changed", async () => {
    const fetchSpy = vi.spyOn(endpoints, "getEnergyWastageReport");

    render(<ReportsView machines={mockMachines} onSelectMachine={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Entire Monitored Fleet")).toBeInTheDocument();
    });

    const scopeSelect = screen.getByDisplayValue("Entire Monitored Fleet");
    await act(async () => {
      fireEvent.change(scopeSelect, { target: { value: "m-1" } });
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          machine_id: "m-1",
        })
      );
    });
  });

  it("displays transparent methodology disclaimers and tariff references", async () => {
    render(<ReportsView machines={mockMachines} onSelectMachine={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/ORVEX Energy Reporting Methodology & Technical Disclaimers/i)).toBeInTheDocument();
      expect(screen.getByText(/Trapezoidal numerical integration/i)).toBeInTheDocument();
      expect(screen.getByText(/Tariff baseline reference:/i)).toBeInTheDocument();
    });
  });
});
