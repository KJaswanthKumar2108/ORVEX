import React from "react";
import { Cpu, ChevronRight, Zap } from "lucide-react";
import type { ReportMachineBreakdown } from "../../api/types";
import { formatEnergy, formatPercent } from "../../utils/formatters";

interface FleetEnergyByMachineChartProps {
  machineBreakdown: ReportMachineBreakdown[];
  onSelectMachine: (machineId: string) => void;
  isLoading?: boolean;
}

export const FleetEnergyByMachineChart: React.FC<FleetEnergyByMachineChartProps> = ({
  machineBreakdown,
  onSelectMachine,
  isLoading = false,
}) => {
  // Sort descending by actual energy, fallback to wasted energy
  const sorted = [...machineBreakdown]
    .filter((m) => (m.actual_energy_kwh ?? 0) > 0 || (m.estimated_wasted_energy_kwh ?? 0) > 0)
    .sort((a, b) => (b.actual_energy_kwh ?? 0) - (a.actual_energy_kwh ?? 0));

  const maxEnergy = Math.max(
    ...sorted.map((m) => m.actual_energy_kwh || m.estimated_wasted_energy_kwh || 0),
    1.0
  );

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-white tracking-wide">
              Energy Usage & Wastage by Asset
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Comparative energy consumption with avoidable wastage ratio
          </p>
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          {sorted.length} assets active
        </span>
      </div>

      {/* Content */}
      {isLoading && sorted.length === 0 ? (
        <div className="py-8 text-center text-xs font-mono text-slate-500">
          Calculating asset energy breakdown...
        </div>
      ) : sorted.length === 0 ? (
        <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-lg">
          <Cpu className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
          <p className="font-medium text-slate-300">No Asset Energy Recorded</p>
          <p className="text-slate-500 text-[11px] mt-0.5">
            Active energy consumption will appear once telemetry is streamed.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((m) => {
            const actualKwh = m.actual_energy_kwh || 0;
            const wastedKwh = m.estimated_wasted_energy_kwh || 0;
            const barWidthPercent = Math.min(100, Math.max(5, (actualKwh / maxEnergy) * 100));
            const wastageWidthPercent =
              actualKwh > 0 ? Math.min(100, (wastedKwh / actualKwh) * 100) : 0;

            return (
              <button
                key={m.machine_id}
                type="button"
                onClick={() => onSelectMachine(m.machine_id)}
                className="w-full text-left p-2.5 rounded-lg bg-slate-950/50 hover:bg-slate-850/80 border border-slate-800/80 hover:border-slate-700 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className="font-mono text-[11px] font-bold text-slate-300 group-hover:text-emerald-400 transition-colors">
                      {m.machine_identifier}
                    </span>
                    <span className="text-slate-200 truncate">{m.machine_name}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono hidden sm:inline">
                      {m.machine_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[11px] shrink-0">
                    <span className="text-white font-semibold">{formatEnergy(actualKwh)}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                  </div>
                </div>

                {/* Progress Bar with Wastage Overlay */}
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
                  <div
                    className="h-full rounded-full bg-cyan-500/80 transition-all"
                    style={{ width: `${barWidthPercent}%` }}
                  />
                  {wastedKwh > 0 && (
                    <div
                      className="absolute top-0 right-0 h-full bg-amber-400/90 rounded-r-full"
                      style={{
                        width: `${(wastedKwh / maxEnergy) * 100}%`,
                      }}
                      title={`Wasted: ${formatEnergy(wastedKwh)} kWh (${formatPercent(wastageWidthPercent)})`}
                    />
                  )}
                </div>

                {/* Sub-label */}
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1">
                  <span>
                    Coverage: {m.data_coverage_ratio ? `${(m.data_coverage_ratio * 100).toFixed(0)}%` : "—"}
                  </span>
                  {wastedKwh > 0 ? (
                    <span className="text-amber-400">
                      Wasted: {formatEnergy(wastedKwh)} ({formatPercent(wastageWidthPercent)})
                    </span>
                  ) : (
                    <span className="text-emerald-400">0 kWh wasted</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500" />
            <span>Productive Energy</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" />
            <span>Avoidable Wastage</span>
          </div>
        </div>
        <span className="text-slate-500">Sorted by consumption</span>
      </div>
    </div>
  );
};
