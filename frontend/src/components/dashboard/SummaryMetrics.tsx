import React from "react";
import { Activity, AlertTriangle, Cpu, Radio, Zap } from "lucide-react";

interface SummaryMetricsProps {
  totalMachines: number;
  freshMachinesCount: number;
  staleMachinesCount: number;
  missingMachinesCount: number;
  totalActualEnergyKwh: number | null;
  totalWastedEnergyKwh: number | null;
  totalEventsCount: number;
  selectedRangeLabel: string;
}

export const SummaryMetrics: React.FC<SummaryMetricsProps> = ({
  totalMachines,
  freshMachinesCount,
  staleMachinesCount,
  missingMachinesCount,
  totalActualEnergyKwh,
  totalWastedEnergyKwh,
  totalEventsCount,
  selectedRangeLabel,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* 1. Registered Machines */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 sm:p-5 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium uppercase tracking-wider">Registered Units</span>
          <Cpu className="w-4 h-4 text-slate-400" />
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold font-mono text-white">
            {totalMachines.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">Monitored mining assets</div>
        </div>
      </div>

      {/* 2. Telemetry Freshness */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 sm:p-5 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium uppercase tracking-wider">Telemetry Freshness</span>
          <Radio className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {freshMachinesCount}
            <span className="text-sm font-normal text-slate-400 ml-1">/ {totalMachines}</span>
          </div>
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
            <span className="text-emerald-400">{freshMachinesCount} fresh</span>
            <span>•</span>
            <span className="text-amber-400">{staleMachinesCount} stale</span>
            <span>•</span>
            <span className="text-slate-500">{missingMachinesCount} no data</span>
          </div>
        </div>
      </div>

      {/* 3. Actual Energy Consumption */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 sm:p-5 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium uppercase tracking-wider">Actual Energy</span>
          <Zap className="w-4 h-4 text-sky-400" />
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold font-mono text-sky-400">
            {totalActualEnergyKwh !== null
              ? totalActualEnergyKwh.toLocaleString(undefined, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })
              : "—"}
            <span className="text-xs font-normal text-slate-400 ml-1">kWh</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Trapezoidal sum ({selectedRangeLabel})
          </div>
        </div>
      </div>

      {/* 4. Estimated Wasted Energy */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 sm:p-5 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium uppercase tracking-wider">Estimated Wastage</span>
          <AlertTriangle className="w-4 h-4 text-amber-400" />
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold font-mono text-amber-400">
            {totalWastedEnergyKwh !== null
              ? totalWastedEnergyKwh.toLocaleString(undefined, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })
              : "0.0"}
            <span className="text-xs font-normal text-slate-400 ml-1">kWh</span>
          </div>
          <div
            className="text-xs text-slate-400 mt-1 truncate"
            title="Estimated potential wastage based on detected excess episodes (not verified savings)"
          >
            Potential excess (est.)
          </div>
        </div>
      </div>

      {/* 5. Detected Wastage Events */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 sm:p-5 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium uppercase tracking-wider">Wastage Episodes</span>
          <Activity className="w-4 h-4 text-rose-400" />
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold font-mono text-rose-400">
            {totalEventsCount.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Detected in {selectedRangeLabel.toLowerCase()}
          </div>
        </div>
      </div>
    </div>
  );
};
