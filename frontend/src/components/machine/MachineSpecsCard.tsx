import React from "react";
import { Gauge, Info, Thermometer, Zap } from "lucide-react";
import type { MachineSummaryResponse } from "../../api/types";
import {
  formatPercent,
  formatPower,
  formatRelativeTime,
  formatTimestamp,
} from "../../utils/formatters";

interface MachineSpecsCardProps {
  machine: MachineSummaryResponse;
}

export const MachineSpecsCard: React.FC<MachineSpecsCardProps> = ({ machine }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Specifications */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-5 shadow-sm">
        <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-800/80">
          <Info className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white tracking-wide">
            Equipment Identity & Parameters
          </h3>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <div>
            <dt className="text-slate-500 uppercase tracking-wider text-[10px]">Asset Name</dt>
            <dd className="font-sans text-white font-medium mt-0.5">
              {machine.name}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 uppercase tracking-wider text-[10px]">Machine Identifier</dt>
            <dd className="font-mono text-slate-200 font-medium mt-0.5">
              {machine.machine_identifier}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 uppercase tracking-wider text-[10px]">Asset Type</dt>
            <dd className="capitalize text-slate-200 font-medium mt-0.5">
              {machine.machine_type}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 uppercase tracking-wider text-[10px]">Nameplate Rated Power</dt>
            <dd className="font-mono text-sky-400 font-medium mt-0.5">
              {formatPower(machine.rated_power_kw)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 uppercase tracking-wider text-[10px]">Registry Status</dt>
            <dd className="capitalize text-emerald-400 font-medium mt-0.5">
              {machine.status}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-slate-500 uppercase tracking-wider text-[10px]">Asset UUID</dt>
            <dd className="font-mono text-slate-400 text-[11px] mt-0.5 truncate select-all">
              {machine.id}
            </dd>
          </div>
        </dl>
      </div>

      {/* Latest Telemetry Snapshot */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white tracking-wide">
              Latest Live Measurements
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            {formatRelativeTime(machine.latest_telemetry_timestamp)}
          </span>
        </div>

        {machine.latest_telemetry_timestamp ? (
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {/* Active Power */}
            <div className="bg-slate-950/60 p-3 rounded border border-slate-800/60">
              <dt className="text-slate-500 text-[10px] uppercase tracking-wider">Active Power</dt>
              <dd className="text-base font-bold font-mono text-emerald-400 mt-1">
                {formatPower(machine.latest_active_power)}
              </dd>
            </div>

            {/* Load Percent */}
            <div className="bg-slate-950/60 p-3 rounded border border-slate-800/60">
              <dt className="text-slate-500 text-[10px] uppercase tracking-wider flex items-center gap-1">
                <Gauge className="w-3 h-3 text-sky-400" />
                <span>Load Ratio</span>
              </dt>
              <dd className="text-base font-bold font-mono text-sky-400 mt-1">
                {formatPercent(machine.latest_load_percent)}
              </dd>
            </div>

            {/* Temperature */}
            <div className="bg-slate-950/60 p-3 rounded border border-slate-800/60">
              <dt className="text-slate-500 text-[10px] uppercase tracking-wider flex items-center gap-1">
                <Thermometer className="w-3 h-3 text-amber-400" />
                <span>Temperature</span>
              </dt>
              <dd className="text-base font-bold font-mono text-amber-400 mt-1">
                {machine.latest_temperature !== null
                  ? `${machine.latest_temperature.toFixed(1)} °C`
                  : "—"}
              </dd>
            </div>

            {/* Power Factor */}
            <div className="bg-slate-950/60 p-3 rounded border border-slate-800/60">
              <dt className="text-slate-500 text-[10px] uppercase tracking-wider">Power Factor</dt>
              <dd className="text-base font-bold font-mono text-slate-200 mt-1">
                {machine.latest_power_factor !== null
                  ? machine.latest_power_factor.toFixed(2)
                  : "—"}
              </dd>
            </div>

            <div className="col-span-2 sm:col-span-4 text-[11px] text-slate-500 font-mono mt-1">
              Sample Timestamp: {formatTimestamp(machine.latest_telemetry_timestamp)}
            </div>
          </dl>
        ) : (
          <div className="py-6 text-center text-slate-500 text-xs">
            No telemetry records have been logged for this machine yet.
          </div>
        )}
      </div>
    </div>
  );
};
