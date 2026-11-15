import React from "react";
import { AlertCircle, Clock, Flame, ShieldCheck, Zap } from "lucide-react";
import type { EnergySummaryResponse } from "../../api/types";
import { QualityBadge } from "../common/StatusBadge";
import {
  formatDuration,
  formatEnergy,
  formatWastedEnergy,
} from "../../utils/formatters";

interface MachineEnergySummaryCardProps {
  summary: EnergySummaryResponse | null;
  timeRangeLabel: string;
  isLoading?: boolean;
}

export const MachineEnergySummaryCard: React.FC<MachineEnergySummaryCardProps> = ({
  summary,
  timeRangeLabel,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-5 animate-pulse">
        <div className="h-4 bg-slate-800 rounded w-1/4 mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="h-16 bg-slate-800 rounded" />
          <div className="h-16 bg-slate-800 rounded" />
          <div className="h-16 bg-slate-800 rounded" />
          <div className="h-16 bg-slate-800 rounded" />
        </div>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 mb-4 border-b border-slate-800/80 gap-2">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white tracking-wide">
            Energy Analytics & State Durations ({timeRangeLabel})
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Data Reliability:</span>
          <QualityBadge quality={summary.quality} coverageRatio={summary.data_coverage_ratio} />
        </div>
      </div>

      {/* Main energy numbers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {/* Actual Energy Consumption */}
        <div className="bg-slate-950/70 p-4 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium">Actual Consumption</span>
            <Zap className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-sky-400">
            {summary.actual_energy_kwh !== null
              ? formatEnergy(summary.actual_energy_kwh)
              : "—"}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Trapezoidal continuous integration (excluding sensor dropouts &gt; 30s)
          </p>
        </div>

        {/* Estimated Wasted Energy */}
        <div className="bg-slate-950/70 p-4 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium">Estimated Wasted Energy</span>
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-amber-400">
            {summary.estimated_wasted_energy_kwh !== null
              ? formatWastedEnergy(summary.estimated_wasted_energy_kwh)
              : "0.00 kWh (est.)"}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Non-overlapping excess during detected idle/low-load/abnormal episodes
          </p>
        </div>

        {/* Wastage Events Count */}
        <div className="bg-slate-950/70 p-4 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium">Detected Episodes</span>
            <Flame className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-rose-400">
            {summary.wastage_event_count}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Persisted explainable detection windows in this interval
          </p>
        </div>

        {/* Telemetry coverage */}
        <div className="bg-slate-950/70 p-4 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium">Data Coverage</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-emerald-400">
            {Math.round(summary.data_coverage_ratio * 100)}%
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {summary.telemetry_sample_count.toLocaleString()} valid samples collected
          </p>
        </div>
      </div>

      {/* Operating State Durations Breakdown */}
      <div>
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          <span>Operating State Durations</span>
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded bg-slate-950/40 border border-slate-800/60">
            <span className="text-slate-500 block text-[11px]">Normal Operating</span>
            <span className="font-mono text-slate-200 font-semibold text-sm mt-0.5 block">
              {formatDuration(summary.operating_duration_seconds)}
            </span>
          </div>

          <div className="p-3 rounded bg-slate-950/40 border border-slate-800/60">
            <span className="text-amber-400/90 block text-[11px]">Idle Wastage</span>
            <span className="font-mono text-amber-300 font-semibold text-sm mt-0.5 block">
              {formatDuration(summary.idle_duration_seconds)}
            </span>
          </div>

          <div className="p-3 rounded bg-slate-950/40 border border-slate-800/60">
            <span className="text-orange-400/90 block text-[11px]">Low-Load Wastage</span>
            <span className="font-mono text-orange-300 font-semibold text-sm mt-0.5 block">
              {formatDuration(summary.low_load_duration_seconds)}
            </span>
          </div>

          <div className="p-3 rounded bg-slate-950/40 border border-slate-800/60">
            <span className="text-rose-400/90 block text-[11px]">Abnormal Power</span>
            <span className="font-mono text-rose-300 font-semibold text-sm mt-0.5 block">
              {formatDuration(summary.abnormal_power_duration_seconds)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
