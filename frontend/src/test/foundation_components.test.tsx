import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatusPill } from "../components/common/StatusPill";
import { PageHeader } from "../components/common/PageHeader";
import { MetricCard } from "../components/common/MetricCard";
import { EmptyState } from "../components/common/EmptyState";
import { Header } from "../components/common/Header";
import { Zap } from "lucide-react";

describe("Foundation Design System Components", () => {
  describe("StatusPill", () => {
    it("renders operational status pill with glowing dot", () => {
      render(<StatusPill status="operational" />);
      expect(screen.getByText("Operational")).toBeInTheDocument();
    });

    it("renders idle and warning states correctly", () => {
      const { rerender } = render(<StatusPill status="idle" />);
      expect(screen.getByText("Idle")).toBeInTheDocument();

      rerender(<StatusPill status="warning" />);
      expect(screen.getByText("Warning")).toBeInTheDocument();
    });

    it("renders critical and insufficient data states", () => {
      const { rerender } = render(<StatusPill status="critical" />);
      expect(screen.getByText("Critical")).toBeInTheDocument();

      rerender(<StatusPill status="insufficient_data" />);
      expect(screen.getByText("Insufficient Data")).toBeInTheDocument();
    });
  });

  describe("PageHeader", () => {
    it("renders title, subtitle, icon, and badges", () => {
      render(
        <PageHeader
          title="Fleet Equipment Directory"
          subtitle="Real-time condition monitoring of mining assets"
          icon={<Zap data-testid="header-icon" />}
          badge={<span data-testid="header-badge">Live</span>}
          actions={<button type="button">Add Asset</button>}
        />
      );

      expect(screen.getByText("Fleet Equipment Directory")).toBeInTheDocument();
      expect(
        screen.getByText("Real-time condition monitoring of mining assets")
      ).toBeInTheDocument();
      expect(screen.getByTestId("header-icon")).toBeInTheDocument();
      expect(screen.getByTestId("header-badge")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add Asset" })).toBeInTheDocument();
    });
  });

  describe("MetricCard", () => {
    it("renders metric card with value, unit, and subtitle", () => {
      render(
        <MetricCard
          title="Active Power"
          value="142.5"
          unit="kW"
          subtitle="Within nominal envelope"
          indicatorColor="emerald"
        />
      );

      expect(screen.getByText("Active Power")).toBeInTheDocument();
      expect(screen.getByText("142.5")).toBeInTheDocument();
      expect(screen.getByText("kW")).toBeInTheDocument();
      expect(screen.getByText("Within nominal envelope")).toBeInTheDocument();
    });
  });

  describe("EmptyState", () => {
    it("renders empty state with title, description, and action button", () => {
      const onAction = vi.fn();
      render(
        <EmptyState
          title="No Equipment Found"
          description="Try adjusting your search query or filter settings."
          action={{
            label: "Clear Filters",
            onClick: onAction,
          }}
        />
      );

      expect(screen.getByText("No Equipment Found")).toBeInTheDocument();
      expect(
        screen.getByText("Try adjusting your search query or filter settings.")
      ).toBeInTheDocument();

      const btn = screen.getByRole("button", { name: "Clear Filters" });
      fireEvent.click(btn);
      expect(onAction).toHaveBeenCalledTimes(1);
    });
  });

  describe("Application Navigation Header (8 Standardized Sections)", () => {
    it("renders all 8 navigation tabs and responds to tab selection", () => {
      const onTabChange = vi.fn();
      const onRefresh = vi.fn();

      render(
        <Header
          activeTab="fleet"
          onTabChange={onTabChange}
          openAlertsCount={3}
          isHealthy={true}
          healthChecking={false}
          lastRefreshed="2026-11-04T05:00:00Z"
          onRefresh={onRefresh}
          isRefreshing={false}
        />
      );

      // Verify all 8 tab labels exist
      expect(screen.getByRole("button", { name: /Fleet/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Machines/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Intelligence/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Health/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Alerts/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Reports/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Demo Center/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /System/i })).toBeInTheDocument();

      // Verify Alert count badge
      expect(screen.getByText("3")).toBeInTheDocument();

      // Verify Backend status indicator
      expect(screen.getByText("ONLINE")).toBeInTheDocument();

      // Click on Machines tab
      fireEvent.click(screen.getByRole("button", { name: /Machines/i }));
      expect(onTabChange).toHaveBeenCalledWith("machines");

      // Click on Demo tab
      fireEvent.click(screen.getByRole("button", { name: /Demo Center/i }));
      expect(onTabChange).toHaveBeenCalledWith("demo");

      // Click on System tab
      fireEvent.click(screen.getByRole("button", { name: /System/i }));
      expect(onTabChange).toHaveBeenCalledWith("system");

      // Click on Refresh
      fireEvent.click(screen.getByRole("button", { name: /Refresh dashboard data/i }));
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
  });
});
