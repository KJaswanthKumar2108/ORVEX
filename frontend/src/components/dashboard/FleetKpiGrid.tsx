import React from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Cpu,
  TrendingDown,
  Zap,
} from "lucide-react";
import { MetricCard } from "../common/MetricCard";
import type { FleetKpiMetrics } from "../../hooks/useFleetCommandCenter";
import { formatPercent } from "../../utils/formatters";

interface FleetKpiGridProps {
  kpis: FleetKpiMetrics;
  selectedRangeLabel: string;
  isLoading?: boolean;
}

export const FleetKpiGrid: React.FC<FleetKpiGridProps> = ({
  kpis,
  selectedRangeLabel,
  isLoading = false,
}) => {
  const {
    totalMonitoredMachines,
    currentlyOperatingMachines,
    estimatedEnergyWastageKwh,
    totalEnergyConsumptionKwh,
    activeAlertsCount,
    machinesRequiringAttentionCount,
  } = kpis;

  // Operating ratio
  const operatingPercent =
    totalMonitoredMachines > 0
      ? (currentlyOperatingMachines / totalMonitoredMachines) * 100
      : 0;

  // Wastage percentage of total consumption (pure electrical ratio, never monetary)
  const wastageRatio =
    totalEnergyConsumptionKwh !== null &&
    totalEnergyConsumptionKwh > 0 &&
    estimatedEnergyWastageKwh !== null
      ? (estimatedEnergyWastageKwh / totalEnergyConsumptionKwh) * 100
      : null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
      {/* 1. Total Monitored Machines */}
      <MetricCard
        title="Monitored Fleet"
        value={isLoading && totalMonitoredMachines === 0 ? "—" : `${totalMonitoredMachines}`}
        unit="units"
        subtitle="Active registered assets"
        icon={<Cpu className="w-4 h-4 text-slate-400" />}
        indicatorColor="cyan"
      />

      {/* 2. Currently Operating Machines */}
      <MetricCard
        title="Operating Now"
        value={isLoading && totalMonitoredMachines === 0 ? "—" : `${currentlyOperatingMachines}`}
        unit="active"
        subtitle={
          totalMonitoredMachines > 0
            ? `${formatPercent(operatingPercent)} of fleet energized`
            : "No machines monitored"
        }
        icon={<Activity className="w-4 h-4 text-emerald-400" />}
        indicatorColor="emerald"
      />

      {/* 3. Total Energy Consumption */}
      <MetricCard
        title="Energy Consumption"
        value={
          totalEnergyConsumptionKwh !== null
            ? totalEnergyConsumptionKwh.toFixed(1)
            : "—"
        }
        unit="kWh"
        subtitle={selectedRangeLabel}
        icon={<Zap className="w-4 h-4 text-blue-400" />}
        indicatorColor="blue"
      />

      {/* 4. Estimated Energy Wastage */}
      <MetricCard
        title="Estimated Wastage"
        value={
          estimatedEnergyWastageKwh !== null
            ? estimatedEnergyWastageKwh.toFixed(1)
            : "—"
        }
        unit="kWh"
        subtitle={
          wastageRatio !== null
            ? `${formatPercent(wastageRatio)} of total power`
            : selectedRangeLabel
        }
        icon={<TrendingDown className="w-4 h-4 text-amber-400" />}
        indicatorColor={
          estimatedEnergyWastageKwh && estimatedEnergyWastageKwh > 0 ? "amber" : "slate"
        }
      />

      {/* 5. Active Alerts */}
      <MetricCard
        title="Active Alerts"
        value={isLoading ? "—" : `${activeAlertsCount}`}
        unit="open"
        subtitle="Unresolved anomalies"
        icon={<Bell className="w-4 h-4 text-rose-400" />}
        indicatorColor={activeAlertsCount > 0 ? "rose" : "slate"}
      />

      {/* 6. Machines Requiring Attention */}
      <MetricCard
        title="Attention Needed"
        value={isLoading ? "—" : `${machinesRequiringAttentionCount}`}
        unit="assets"
        subtitle="Stale signal or faults"
        icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
        indicatorColor={machinesRequiringAttentionCount > 0 ? "rose" : "emerald"}
      />
    </div>
  );
};
