import React from "react";
import {
  Activity,
  BrainCircuit,
  Coins,
  Flame,
  Info,
  Layers,
  Zap,
} from "lucide-react";
import type { FleetIntelligenceSummary } from "../../api/types";
import {
  formatEnergy,
  formatPercent,
  formatWastedEnergy,
} from "../../utils/formatters";

interface EnergyPerformanceOverviewProps {
  summary: FleetIntelligenceSummary | null;
  timeRangeLabel: string;
  isLoading?: boolean;
}

export const EnergyPerformanceOverview: React.FC<EnergyPerformanceOverviewProps> = ({
  summary,
  timeRangeLabel,
  isLoading = false,
}) => {
  // Check mathematical validity of wastage percentage
  // Only valid if actual energy is present and > 0, and wasted energy is present and >= 0
  const actualKwh = summary?.total_actual_energy_kwh ?? null;
  const wastedKwh = summary?.total_wasted_energy_kwh ?? null;
  const isWastagePctValid =
    actualKwh !== null && actualKwh > 0 && wastedKwh !== null && wastedKwh >= 0;
  const computedWastagePct = isWastagePctValid
    ? (wastedKwh! / actualKwh!) * 100
    : summary?.fleet_wastage_percentage ?? null;

  const costImpact = summary?.estimated_fleet_cost_impact ?? null;
  const tariff = summary?.assumed_energy_tariff_per_kwh ?? 0.12;

  return (
    <div className="space-y-4">
      {/* Top Title Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0d1424] p-5 rounded-xl border border-slate-800/80 shadow-lg">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base font-bold tracking-tight text-white font-sans">
                Fleet Energy Consumption & Wastage Overview
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono font-semibold">
                Deterministic Analytics
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
                {timeRangeLabel}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Detects, quantifies, and explains electrical wastage across legacy mining machinery without black-box ML.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-400 self-start md:self-auto">
          <Zap className="w-3.5 h-3.5 text-emerald-400" />
          <span>Continuous Numerical Integration</span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* 1. Total Energy Consumption */}
        <div className="bg-[#0d1424] p-4 rounded-xl border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider">Total Consumption</span>
            <Zap className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-1">
            {isLoading ? (
              <span className="text-slate-500">...</span>
            ) : actualKwh !== null ? (
              formatEnergy(actualKwh)
            ) : (
              "—"
            )}
          </div>
          <span className="text-[11px] text-slate-500 mt-2 font-mono">
            {summary?.monitored_machines_count ?? 0} machines monitored
          </span>
        </div>

        {/* 2. Total Wasted Energy */}
        <div className="bg-[#0d1424] p-4 rounded-xl border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider">Estimated Wastage</span>
            <Flame className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
            {isLoading ? (
              <span className="text-slate-500">...</span>
            ) : wastedKwh !== null ? (
              formatWastedEnergy(wastedKwh)
            ) : (
              "—"
            )}
          </div>
          <span className="text-[11px] text-slate-500 mt-2 font-mono">
            Quantified excess power draw
          </span>
        </div>

        {/* 3. Wastage Share (%) */}
        <div className="bg-[#0d1424] p-4 rounded-xl border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider">Wastage Share</span>
            <Activity className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-400 mt-1">
            {isLoading ? (
              <span className="text-slate-500">...</span>
            ) : computedWastagePct !== null ? (
              formatPercent(computedWastagePct)
            ) : (
              "—"
            )}
          </div>
          <span className="text-[11px] text-slate-500 mt-2 font-mono">
            {isWastagePctValid ? "% of total consumed kWh" : "Awaiting valid power data"}
          </span>
        </div>

        {/* 4. Avoidable Monetary Cost */}
        <div className="bg-[#0d1424] p-4 rounded-xl border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider">Avoidable Spend</span>
            <Coins className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
            {isLoading ? (
              <span className="text-slate-500">...</span>
            ) : costImpact !== null ? (
              `$${costImpact.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`
            ) : (
              "—"
            )}
          </div>
          <span className="text-[11px] text-slate-500 mt-2 font-mono">
            At ${tariff.toFixed(2)}/kWh tariff
          </span>
        </div>

        {/* 5. Detected Episodes & Unquantified Stress */}
        <div className="bg-[#0d1424] p-4 rounded-xl border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider">Wastage Episodes</span>
            <Layers className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-purple-400 mt-1">
            {summary?.priority_rankings.reduce((sum, r) => sum + r.wastage_events_count, 0) ?? 0}
          </div>
          <span className="text-[11px] text-slate-500 mt-2 font-mono">
            {summary?.total_unestimated_events_count ?? 0} unquantified cycling
          </span>
        </div>
      </div>

      {/* Assumptions and Methodology Footnote */}
      <div className="text-xs text-slate-400 bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-semibold text-slate-200">Tariff Assumptions & Scoring:</span>{" "}
          {summary?.tariff_assumptions_note ||
            "Cost impact is modeled using a standard industrial flat tariff of $0.12/kWh. Maximum demand spikes and time-of-use penalty surcharges are excluded."}{" "}
          Wastage percentage is only calculated when actual metered consumption exceeds 0 kWh.
        </div>
      </div>
    </div>
  );
};
