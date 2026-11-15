import React from "react";
import { BarChart3, PieChart } from "lucide-react";
import type { EnergyWastageReportResponse } from "../../api/types";
import { formatEnergy, formatReasonTitle } from "../../utils/formatters";

interface ReportHistoricalChartsProps {
  report: EnergyWastageReportResponse | null;
}

export const ReportHistoricalCharts: React.FC<ReportHistoricalChartsProps> = ({ report }) => {
  if (!report || report.by_machine.length === 0) return null;

  const maxEnergy = Math.max(
    ...report.by_machine.map((m) => Math.max(m.actual_energy_kwh || 0, m.estimated_wasted_energy_kwh || 0)),
    1
  );

  const colors = ["#10b981", "#f59e0b", "#ef4444", "#38bdf8", "#8b5cf6", "#ec4899"];

  const totalWasted = report.estimated_wasted_energy_kwh || 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Chart 1: Equipment Consumption vs Wastage Comparison */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white tracking-tight uppercase">
              Actual Consumption vs. Estimated Wastage
            </h3>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
              <span className="text-slate-400">Actual kWh</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
              <span className="text-slate-400">Wasted kWh</span>
            </span>
          </div>
        </div>

        <div className="space-y-3.5 pt-1">
          {report.by_machine.map((m) => {
            const actualVal = m.actual_energy_kwh || 0;
            const wastedVal = m.estimated_wasted_energy_kwh || 0;
            const actualPct = Math.min((actualVal / maxEnergy) * 100, 100);
            const wastedPct = Math.min((wastedVal / maxEnergy) * 100, 100);

            return (
              <div key={m.machine_id} className="space-y-1 text-xs">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="font-semibold text-slate-200">
                    {m.machine_name} <span className="font-mono text-slate-500 font-normal">({m.machine_identifier})</span>
                  </span>
                  <div className="font-mono text-[11px] space-x-2">
                    <span className="text-emerald-400">{formatEnergy(actualVal)}</span>
                    {wastedVal > 0 && (
                      <span className="text-rose-400">({wastedVal.toFixed(1)} kWh waste)</span>
                    )}
                  </div>
                </div>

                {/* Progress bars */}
                <div className="space-y-1">
                  {/* Actual bar */}
                  <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden flex">
                    <div
                      className="bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${actualPct}%` }}
                    />
                  </div>
                  {/* Wastage bar */}
                  {wastedVal > 0 && (
                    <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden flex">
                      <div
                        className="bg-rose-500 rounded-full transition-all duration-300"
                        style={{ width: `${wastedPct}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chart 2: Wastage Distribution by Detection Archetype */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-white tracking-tight uppercase">
              Wastage Share by Detection Archetype
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {report.by_reason.length} Archetypes
          </span>
        </div>

        {report.by_reason.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No wastage detected in the selected timeframe.
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            {report.by_reason.map((r, idx) => {
              const wastedVal = r.estimated_wasted_energy_kwh || 0;
              const share = totalWasted > 0 ? (wastedVal / totalWasted) * 100 : 0;
              const color = colors[idx % colors.length];

              return (
                <div key={r.reason} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="font-semibold text-slate-200 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                      <span>{formatReasonTitle(r.reason)}</span>
                    </span>
                    <div className="font-mono text-[11px] space-x-2">
                      <span className="text-white">{r.event_count} eps</span>
                      <span className="text-slate-400">
                        {r.estimated_wasted_energy_kwh !== null
                          ? `${r.estimated_wasted_energy_kwh.toFixed(1)} kWh (${share.toFixed(0)}%)`
                          : "Unestimated"}
                      </span>
                    </div>
                  </div>

                  <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden flex">
                    <div
                      className="rounded-full transition-all duration-300"
                      style={{
                        width: r.estimated_wasted_energy_kwh !== null ? `${Math.max(share, 3)}%` : "100%",
                        backgroundColor: r.estimated_wasted_energy_kwh !== null ? color : "#64748b",
                        opacity: r.estimated_wasted_energy_kwh !== null ? 1 : 0.4,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

