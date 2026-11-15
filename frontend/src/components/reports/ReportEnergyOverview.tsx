import React from "react";
import { AlertTriangle, CheckCircle, Layers, TrendingDown, Zap } from "lucide-react";
import type { EnergyWastageReportResponse } from "../../api/types";
import { QualityBadge } from "../common/StatusBadge";
import {
  formatEnergy,
  formatPercent,
  formatWastedEnergy,
} from "../../utils/formatters";

interface ReportEnergyOverviewProps {
  report: EnergyWastageReportResponse | null;
}

export const ReportEnergyOverview: React.FC<ReportEnergyOverviewProps> = ({ report }) => {
  if (!report) return null;

  const wastageRatio =
    report.actual_energy_kwh && report.actual_energy_kwh > 0 && report.estimated_wasted_energy_kwh !== null
      ? (report.estimated_wasted_energy_kwh / report.actual_energy_kwh) * 100
      : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* Card 1: Actual Energy */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium">Actual Consumption</span>
          <Zap className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="mt-2 text-xl font-bold font-mono text-white">
          {formatEnergy(report.actual_energy_kwh)}
        </div>
        <div className="mt-1 text-[11px] text-slate-500">Trapezoidal integration</div>
      </div>

      {/* Card 2: Estimated Wasted Energy */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium">Estimated Wastage</span>
          <TrendingDown className="w-4 h-4 text-rose-400" />
        </div>
        <div className="mt-2 text-xl font-bold font-mono text-rose-400">
          {formatWastedEnergy(report.estimated_wasted_energy_kwh)}
        </div>
        <div className="mt-1 text-[11px] text-slate-500">Conservative non-overlapping</div>
      </div>

      {/* Card 3: Wastage Percentage */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium">Wastage Share</span>
          <Layers className="w-4 h-4 text-amber-400" />
        </div>
        <div className="mt-2 text-xl font-bold font-mono text-amber-300">
          {formatPercent(wastageRatio)}
        </div>
        <div className="mt-1 text-[11px] text-slate-500">Of total consumed energy</div>
      </div>

      {/* Card 4: Wastage Events Count */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium">Wastage Episodes</span>
          <AlertTriangle className="w-4 h-4 text-orange-400" />
        </div>
        <div className="mt-2 text-xl font-bold font-mono text-white">
          {report.total_wastage_events}
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          {report.unestimated_wastage_events > 0
            ? `${report.unestimated_wastage_events} unestimated (cycling)`
            : "All episodes estimated"}
        </div>
      </div>

      {/* Card 5: Telemetry Quality */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium">Data Reliability</span>
          <CheckCircle className="w-4 h-4 text-sky-400" />
        </div>
        <div className="mt-2">
          <QualityBadge
            quality={report.overall_quality as any}
            coverageRatio={report.data_coverage_ratio ?? undefined}
          />
        </div>
        <div className="mt-2 text-[11px] text-slate-500">
          {report.data_coverage_ratio !== null
            ? `${Math.round(report.data_coverage_ratio * 100)}% temporal coverage`
            : "Coverage not evaluated"}
        </div>
      </div>
    </div>
  );
};

