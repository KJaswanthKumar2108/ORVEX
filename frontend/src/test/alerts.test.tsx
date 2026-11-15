import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AlertsPanel } from "../components/dashboard/AlertsPanel";
import { AlertStatusBadge, SeverityBadge } from "../components/common/StatusBadge";
import type { AlertRecord } from "../api/types";

const mockAlerts: AlertRecord[] = [
  {
    id: "alert-1",
    machine_id: "m-1",
    machine_identifier: "EX-01",
    machine_name: "Excavator Primary",
    event_id: "evt-1",
    alert_type: "IDLE_WASTAGE",
    severity: "medium",
    title: "Excessive Idle Operation Detected",
    description: "Excavator Primary has been operating in an idle state for 42 minutes, consuming 18.5 kWh without performing productive work.",
    recommendation: "Review operator idling protocol and shut down auxiliary systems during standby.",
    status: "open",
    occurred_at: "2026-03-30T10:00:00Z",
    resolved_at: null,
    created_at: "2026-03-30T10:05:00Z",
  },
  {
    id: "alert-2",
    machine_id: "m-2",
    machine_identifier: "CR-01",
    machine_name: "Jaw Crusher A",
    event_id: "evt-2",
    alert_type: "START_STOP_CYCLING",
    severity: "high",
    title: "Start/Stop Cycling Anomaly Detected",
    description: "Jaw Crusher A experienced 6 starts/stops within 15 minutes.",
    recommendation: "Review operating schedules, control logic, and repeated start/stop behavior.",
    status: "acknowledged",
    occurred_at: "2026-03-30T09:30:00Z",
    resolved_at: null,
    created_at: "2026-03-30T09:35:00Z",
  },
];

describe("Alerts components", () => {
  describe("SeverityBadge", () => {
    it("renders critical severity badge", () => {
      render(<SeverityBadge severity="critical" />);
      expect(screen.getByText("Critical")).toBeInTheDocument();
    });

    it("renders high severity badge", () => {
      render(<SeverityBadge severity="high" />);
      expect(screen.getByText("High")).toBeInTheDocument();
    });

    it("renders medium severity badge", () => {
      render(<SeverityBadge severity="medium" />);
      expect(screen.getByText("Medium")).toBeInTheDocument();
    });

    it("renders low severity badge", () => {
      render(<SeverityBadge severity="low" />);
      expect(screen.getByText("Low")).toBeInTheDocument();
    });
  });

  describe("AlertStatusBadge", () => {
    it("renders open status", () => {
      render(<AlertStatusBadge status="open" />);
      expect(screen.getByText("Open")).toBeInTheDocument();
    });

    it("renders acknowledged status", () => {
      render(<AlertStatusBadge status="acknowledged" />);
      expect(screen.getByText("Acknowledged")).toBeInTheDocument();
    });

    it("renders resolved status", () => {
      render(<AlertStatusBadge status="resolved" />);
      expect(screen.getByText("Resolved")).toBeInTheDocument();
    });
  });

  describe("AlertsPanel", () => {
    it("renders list of alerts correctly", () => {
      render(<AlertsPanel alerts={mockAlerts} />);

      expect(screen.getByText("Active Alerts")).toBeInTheDocument();
      expect(screen.getByText("1 open")).toBeInTheDocument();
      expect(screen.getByText("Excessive Idle Operation Detected")).toBeInTheDocument();
      expect(screen.getByText("Start/Stop Cycling Anomaly Detected")).toBeInTheDocument();
      expect(screen.getByText("Excavator Primary")).toBeInTheDocument();
    });

    it("shows empty state when no alerts exist", () => {
      render(<AlertsPanel alerts={[]} />);
      expect(screen.getByText("All equipment nominal")).toBeInTheDocument();
    });

    it("fires acknowledge callback on click", async () => {
      const handleAck = vi.fn().mockResolvedValue(undefined);
      render(<AlertsPanel alerts={mockAlerts} onAcknowledgeAlert={handleAck} />);

      const ackBtn = screen.getByRole("button", { name: /acknowledge/i });
      await act(async () => {
        fireEvent.click(ackBtn);
      });
      expect(handleAck).toHaveBeenCalledWith("alert-1");
    });
  });
});
