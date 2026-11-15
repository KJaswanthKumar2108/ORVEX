import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorAlert } from "../components/common/ErrorAlert";
import { FreshnessBadge, OperatingStateBadge, QualityBadge } from "../components/common/StatusBadge";
import { TimeRangeSelector } from "../components/common/TimeRangeSelector";
import { PowerChart } from "../components/dashboard/PowerChart";

describe("common components", () => {
  describe("FreshnessBadge", () => {
    it("renders fresh status correctly", () => {
      render(<FreshnessBadge freshness="fresh" />);
      expect(screen.getByText("Fresh")).toBeInTheDocument();
    });

    it("renders stale status correctly", () => {
      render(<FreshnessBadge freshness="stale" />);
      expect(screen.getByText("Stale")).toBeInTheDocument();
    });

    it("renders missing telemetry status correctly", () => {
      render(<FreshnessBadge freshness="missing" />);
      expect(screen.getByText("No Telemetry")).toBeInTheDocument();
    });
  });

  describe("OperatingStateBadge", () => {
    it("renders operating state", () => {
      render(<OperatingStateBadge state="operating" />);
      expect(screen.getByText("Operating")).toBeInTheDocument();
    });

    it("renders idle state", () => {
      render(<OperatingStateBadge state="idle" />);
      expect(screen.getByText("Idle")).toBeInTheDocument();
    });

    it("renders stopped state", () => {
      render(<OperatingStateBadge state="stopped" />);
      expect(screen.getByText("Stopped")).toBeInTheDocument();
    });

    it("renders dash for missing state", () => {
      render(<OperatingStateBadge state={null} />);
      expect(screen.getByText("—")).toBeInTheDocument();
    });
  });

  describe("QualityBadge", () => {
    it("renders Good quality with coverage", () => {
      render(<QualityBadge quality="GOOD" coverageRatio={0.98} />);
      expect(screen.getByText(/High Quality \(98%\)/)).toBeInTheDocument();
    });

    it("renders Partial quality", () => {
      render(<QualityBadge quality="PARTIAL" coverageRatio={0.5} />);
      expect(screen.getByText(/Partial Data \(50%\)/)).toBeInTheDocument();
    });

    it("renders Insufficient quality", () => {
      render(<QualityBadge quality="INSUFFICIENT_DATA" coverageRatio={0.1} />);
      expect(screen.getByText(/Insufficient Data \(10%\)/)).toBeInTheDocument();
    });
  });

  describe("TimeRangeSelector", () => {
    it("renders range buttons and highlights active selection", () => {
      const onSelect = vi.fn();
      render(<TimeRangeSelector selectedRange="24h" onRangeChange={onSelect} />);

      const btn1h = screen.getByRole("button", { name: "Last hour" });
      const btn24h = screen.getByRole("button", { name: "Last 24 hours" });

      expect(btn24h).toHaveAttribute("aria-pressed", "true");
      expect(btn1h).toHaveAttribute("aria-pressed", "false");

      fireEvent.click(btn1h);
      expect(onSelect).toHaveBeenCalledWith("1h");
    });
  });

  describe("ErrorAlert", () => {
    it("displays error message and fires retry", () => {
      const onRetry = vi.fn();
      render(<ErrorAlert message="Database operation failed" onRetry={onRetry} />);

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Database operation failed")).toBeInTheDocument();

      const retryBtn = screen.getByRole("button", { name: /retry/i });
      fireEvent.click(retryBtn);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe("PowerChart", () => {
    it("renders empty state when no telemetry records exist", () => {
      render(<PowerChart telemetry={[]} timeRangeLabel="Last 24 hours" />);
      expect(screen.getByText("No telemetry measurements recorded")).toBeInTheDocument();
    });

    it("renders telemetry points and axes when measurements exist", () => {
      const mockTelemetry = [
        {
          timestamp: "2026-09-26T12:00:00Z",
          machine_id: "m-1",
          sensor_id: null,
          voltage: 415.0,
          current: 20.0,
          active_power: 12.5,
          reactive_power: 2.0,
          apparent_power: 12.7,
          power_factor: 0.98,
          cumulative_energy: 100.0,
          rpm: 1500,
          temperature: 65.0,
          load_percent: 75.0,
          operating_state: "operating",
        },
        {
          timestamp: "2026-09-26T12:00:05Z",
          machine_id: "m-1",
          sensor_id: null,
          voltage: 415.0,
          current: 21.0,
          active_power: 13.0,
          reactive_power: 2.1,
          apparent_power: 13.2,
          power_factor: 0.98,
          cumulative_energy: 100.02,
          rpm: 1500,
          temperature: 65.2,
          load_percent: 78.0,
          operating_state: "operating",
        },
      ];

      render(
        <PowerChart
          telemetry={mockTelemetry}
          timeRangeLabel="Last 24 hours"
          machineName="Conveyor 1"
          ratedPowerKw={50.0}
        />
      );

      expect(screen.getByText("Conveyor 1")).toBeInTheDocument();
      expect(screen.getByText("2 measurements")).toBeInTheDocument();
      expect(screen.getByText(/12\.8 kW/)).toBeInTheDocument(); // avg power
    });
  });
});
