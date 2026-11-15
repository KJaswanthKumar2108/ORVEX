import React, { useState, useEffect, useMemo } from "react";
import {
  Clock,
  RefreshCw,
} from "lucide-react";
import { ErrorAlert } from "../components/common/ErrorAlert";
import { CardSkeleton, ChartSkeleton, TableSkeleton } from "../components/common/LoadingSkeleton";
import { TimeRangeSelector } from "../components/common/TimeRangeSelector";
import { FleetKpiGrid } from "../components/dashboard/FleetKpiGrid";
import { FleetEnergyOverTimeChart } from "../components/dashboard/FleetEnergyOverTimeChart";
import { FleetEnergyByMachineChart } from "../components/dashboard/FleetEnergyByMachineChart";
import { WastageCategoryDistributionChart } from "../components/dashboard/WastageCategoryDistributionChart";
import { MachineTable } from "../components/dashboard/MachineTable";
import { AttentionRequiredPanel } from "../components/dashboard/AttentionRequiredPanel";
import { OperationalActivityStream } from "../components/dashboard/OperationalActivityStream";
import type { DashboardData } from "../hooks/useDashboardData";
import type { AlertRecord } from "../api/types";
import { TIME_RANGE_OPTIONS, type TimeRangeKey } from "../utils/timeRanges";

interface DashboardViewProps {
  data: DashboardData;
  alerts?: AlertRecord[];
  isLoading: boolean;
  error: string | null;
  timeRangeKey: TimeRangeKey;
  onTimeRangeChange: (range: TimeRangeKey) => void;
  onSelectMachine: (machineId: string) => void;
  onRetry: () => void;
  onAcknowledgeAlert?: (alertId: string) => Promise<void>;
  onViewAllAlerts?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  data,
  alerts = [],
  isLoading,
  error,
  timeRangeKey,
  onTimeRangeChange,
  onSelectMachine,
  onRetry,
  onAcknowledgeAlert,
  onViewAllAlerts,
}) => {
  const selectedOption =
    TIME_RANGE_OPTIONS.find((opt) => opt.key === timeRangeKey) || TIME_RANGE_OPTIONS[0];

  // Live wall-clock time
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute machine energy and health maps for table
  const energyMap = useMemo(() => {
    const map: Record<string, number | null> = {};
    if (data.energyReport?.by_machine) {
      data.energyReport.by_machine.forEach((m) => {
        map[m.machine_id] = m.actual_energy_kwh;
      });
    }
    return map;
  }, [data.energyReport]);

  const healthMap = useMemo(() => {
    const map: Record<string, { status: string; warningsCount: number }> = {};
    const warningCounts: Record<string, number> = {};

    (data.healthWarnings || []).forEach((w) => {
      if (w.status === "open") {
        warningCounts[w.machine_id] = (warningCounts[w.machine_id] || 0) + 1;
      }
    });

    data.machines.forEach((m) => {
      const count = warningCounts[m.id] || 0;
      let status = "HEALTHY";
      if (count > 2) {
        status = "CRITICAL";
      } else if (count > 0) {
        status = "WARNING";
      } else if (m.telemetry_freshness === "stale") {
        status = "WATCH";
      } else if (m.telemetry_freshness === "missing") {
        status = "INSUFFICIENT_DATA";
      }
      map[m.id] = { status, warningsCount: count };
    });

    return map;
  }, [data.machines, data.healthWarnings]);

  // Derived KPI object
  const kpiMetrics = useMemo(() => {
    return {
      totalMonitoredMachines: data.totalMachines,
      currentlyOperatingMachines:
        data.currentlyOperatingMachines ??
        data.machines.filter((m) => {
          const s = (m.latest_operating_state || "").toLowerCase();
          return (
            (s === "operating" || s === "running" || s === "active" || (m.latest_active_power ?? 0) > 0) &&
            m.telemetry_freshness !== "missing"
          );
        }).length,
      estimatedEnergyWastageKwh: data.totalWastedEnergyKwh,
      totalEnergyConsumptionKwh: data.totalActualEnergyKwh,
      activeAlertsCount: alerts.filter((a) => a.status === "open").length,
      machinesRequiringAttentionCount:
        data.machinesRequiringAttentionCount ??
        data.machines.filter((m) => m.telemetry_freshness !== "fresh").length,
    };
  }, [data, alerts]);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* ======================================================== */}
      {/* SECTION A: COMMAND CENTER HEADER & CONTROLS              */}
      {/* ======================================================== */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Title and Purpose */}
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-mono">
                Fleet Command Center
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold">
                LIVE TELEMETRY
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400">
              Centralized real-time overview of monitored mining equipment, energy performance, wastage events and condition health.
            </p>
          </div>

          {/* Real-time Status, Wall-Clock & Controls */}
          <div className="flex flex-wrap items-center gap-3 text-xs self-start lg:self-center">
            {/* Live Clock */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-slate-300">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>{currentTime.toLocaleDateString()}</span>
              <span className="text-slate-500">•</span>
              <span className="text-emerald-400 font-bold">{currentTime.toLocaleTimeString()}</span>
            </div>

            {/* Time-Range Selector */}
            <div className="flex items-center gap-1.5">
              <TimeRangeSelector
                selectedRange={timeRangeKey}
                onRangeChange={onTimeRangeChange}
                disabled={isLoading}
              />
            </div>

            {/* Manual Refresh Control */}
            <button
              type="button"
              onClick={onRetry}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors cursor-pointer border border-slate-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950"
              title="Refresh telemetry, energy reports, alerts, and machine health"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
              <span className="hidden sm:inline">Sync</span>
            </button>
          </div>
        </div>
      </div>

      {/* Global Sync Error Alert */}
      {error && (
        <ErrorAlert
          title="Telemetry & Fleet Sync Issue"
          message={error}
          onRetry={onRetry}
        />
      )}

      {/* ======================================================== */}
      {/* SECTION B: FLEET KPI METRICS                             */}
      {/* ======================================================== */}
      {isLoading && data.machines.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <CardSkeleton count={6} />
        </div>
      ) : (
        <FleetKpiGrid
          kpis={kpiMetrics}
          selectedRangeLabel={selectedOption.label}
          isLoading={isLoading}
        />
      )}

      {/* ======================================================== */}
      {/* SECTION C: FLEET ENERGY PERFORMANCE VISUALIZATIONS       */}
      {/* ======================================================== */}
      <div className="space-y-4">
        {/* Main Dual-Series Over-Time Chart */}
        {isLoading && data.chartTelemetry.length === 0 ? (
          <ChartSkeleton />
        ) : (
          <FleetEnergyOverTimeChart
            telemetry={data.chartTelemetry}
            wastageEvents={data.wastageEvents}
            timeRangeLabel={selectedOption.label}
            machineName={data.chartMachineName}
            ratedPowerKw={data.chartRatedPower}
            totalEnergyKwh={data.totalActualEnergyKwh}
            wastedEnergyKwh={data.totalWastedEnergyKwh}
            isLoading={isLoading}
          />
        )}

        {/* 2-Column Comparative Performance Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <FleetEnergyByMachineChart
            machineBreakdown={data.energyReport?.by_machine || []}
            onSelectMachine={onSelectMachine}
            isLoading={isLoading}
          />
          <WastageCategoryDistributionChart
            reasons={data.energyReport?.by_reason || []}
            fallbackEvents={data.wastageEvents}
            totalWastedKwh={data.totalWastedEnergyKwh}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* ======================================================== */}
      {/* SECTION D: MACHINE FLEET OVERVIEW                        */}
      {/* ======================================================== */}
      {isLoading && data.machines.length === 0 ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <TableSkeleton rows={4} />
        </div>
      ) : (
        <MachineTable
          machines={data.machines}
          onSelectMachine={onSelectMachine}
          isLoading={isLoading}
          healthMap={healthMap}
          energyMap={energyMap}
        />
      )}

      {/* ======================================================== */}
      {/* SECTIONS E & F: ATTENTION REQUIRED & OPERATIONAL FEED    */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Attention Required Panel */}
        <AttentionRequiredPanel
          alerts={alerts}
          healthWarnings={data.healthWarnings || []}
          machines={data.machines}
          patterns={data.patterns}
          onSelectMachine={onSelectMachine}
          onNavigateToAlerts={onViewAllAlerts}
          onAcknowledgeAlert={onAcknowledgeAlert}
          isLoading={isLoading}
        />

        {/* Operational Activity Stream */}
        <OperationalActivityStream
          wastageEvents={data.wastageEvents}
          alerts={alerts}
          healthWarnings={data.healthWarnings || []}
          machines={data.machines}
          onSelectMachine={onSelectMachine}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};
