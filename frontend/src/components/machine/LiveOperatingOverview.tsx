import React from "react";
import {
  Activity,
  AlertTriangle,
  Clock,
  Gauge,
  Info,
  Radio,
  RotateCw,
  Thermometer,
  Zap,
} from "lucide-react";
import type {
  EnergySummaryResponse,
  MachineSummaryResponse,
  TelemetryRecordResponse,
} from "../../api/types";
import {
  formatEnergy,
  formatPercent,
  formatPower,
  formatRelativeTime,
  formatTimestamp,
} from "../../utils/formatters";
import { OperatingStateBadge } from "../common/StatusBadge";

interface LiveOperatingOverviewProps {
  machine: MachineSummaryResponse;
  latestRecord?: TelemetryRecordResponse | null;
  energySummary?: EnergySummaryResponse | null;
}

export const LiveOperatingOverview: React.FC<LiveOperatingOverviewProps> = ({
  machine,
  latestRecord,
  energySummary,
}) => {
  const isStopped = machine.latest_operating_state?.toLowerCase() === "stopped";
  const isStale = machine.telemetry_freshness === "stale";
  const isMissing = machine.telemetry_freshness === "missing";

  // Derive latest values from machine summary or latest telemetry record
  const activePower = machine.latest_active_power ?? latestRecord?.active_power ?? null;
  const powerFactor = machine.latest_power_factor ?? latestRecord?.power_factor ?? null;
  const temperature = machine.latest_temperature ?? latestRecord?.temperature ?? null;
  const loadPercent = machine.latest_load_percent ?? latestRecord?.load_percent ?? null;
  const voltage = latestRecord?.voltage ?? null;
  const current = latestRecord?.current ?? null;
  const rpm = latestRecord?.rpm ?? null;
  const cumulativeEnergy = energySummary?.actual_energy_kwh ?? latestRecord?.cumulative_energy ?? null;
  const timestamp = machine.latest_telemetry_timestamp || latestRecord?.timestamp || null;

  return (
    <div className="bg-[#0d1424] border border-slate-800/80 rounded-xl p-5 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-800/80 gap-2">
        <div className="flex items-center gap-2.5">
          <Activity className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white font-mono">
            Live Operating Overview & Instrumentation
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span>Observed: {formatTimestamp(timestamp)}</span>
          <span className="text-slate-600">({formatRelativeTime(timestamp)})</span>
        </div>
      </div>

      {/* Stale / Stopped Equipment Status Banner */}
      {(isStale || isMissing || (isStopped && !isStale)) && (
        <div
          className={`px-4 py-2.5 rounded-lg border text-xs flex items-center justify-between gap-3 ${
            isStale || isMissing
              ? "bg-amber-950/20 border-amber-500/30 text-amber-300"
              : "bg-slate-900/90 border-slate-700/60 text-slate-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {isStale || isMissing ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-sky-400 shrink-0" />
            )}
            <div>
              {isStale ? (
                <span>
                  <strong>Stale Telemetry Notice:</strong> Sensor readings have ceased updating. Equipment may be unpowered or gateway offline.
                </span>
              ) : isMissing ? (
                <span>
                  <strong>No Telemetry Stream:</strong> No telemetry records received for this asset.
                </span>
              ) : (
                <span>
                  <strong>Equipment Intentionally Stopped:</strong> Sensor gateway is active and streaming baseline heartbeat (0.0 kW).
                </span>
              )}
            </div>
          </div>
          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-950/80 border border-slate-800 shrink-0">
            {isStale ? "Gateway Stale" : isMissing ? "No Stream" : "0 kW Standby"}
          </span>
        </div>
      )}

      {/* 9-Metric Industrial Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
        {/* 1. Active Power */}
        <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800/80 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
              Active Power
            </span>
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
            {formatPower(activePower)}
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
            <span>Nameplate: {machine.rated_power_kw ? `${machine.rated_power_kw} kW` : "—"}</span>
            <span className="text-emerald-400 font-medium">Physical CT Meter</span>
          </div>
        </div>

        {/* 2. Three-Phase Voltage */}
        <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800/80 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
              Line Voltage
            </span>
            <Zap className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-1">
            {voltage !== null && !isNaN(voltage) ? (
              <span>
                {voltage.toFixed(1)} <span className="text-xs text-slate-400 font-normal">V</span>
              </span>
            ) : (
              <span className="text-slate-500">—</span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
            <span>Nominal: 415 V</span>
            <span className="text-sky-400 font-medium">
              {voltage !== null ? "Physical PT Meter" : "Unmeasured"}
            </span>
          </div>
        </div>

        {/* 3. Phase Current */}
        <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800/80 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
              Phase Current
            </span>
            <Activity className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-1">
            {current !== null && !isNaN(current) ? (
              <span>
                {current.toFixed(1)} <span className="text-xs text-slate-400 font-normal">A</span>
              </span>
            ) : (
              <span className="text-slate-500">—</span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
            <span>Balanced RMS</span>
            <span className="text-sky-400 font-medium">
              {current !== null ? "Physical CT Clamp" : "Unmeasured"}
            </span>
          </div>
        </div>

        {/* 4. Power Factor */}
        <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800/80 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
              Power Factor (cos φ)
            </span>
            <Gauge className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-1">
            {powerFactor !== null && !isNaN(powerFactor) ? (
              <span>{powerFactor.toFixed(2)}</span>
            ) : (
              <span className="text-slate-500">—</span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
            <span>Target: &gt; 0.85</span>
            <span className={powerFactor && powerFactor < 0.8 ? "text-amber-400" : "text-emerald-400"}>
              {powerFactor !== null ? (powerFactor < 0.8 ? "Lagging" : "Optimal") : "Unmeasured"}
            </span>
          </div>
        </div>

        {/* 5. Cumulative Energy */}
        <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800/80 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
              Cumulative Energy
            </span>
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
            {formatEnergy(cumulativeEnergy)}
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
            <span>Integration Interval</span>
            <span className="text-amber-400 font-medium">Continuous trapezoidal</span>
          </div>
        </div>

        {/* 6. Machine Speed (RPM) */}
        <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800/80 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
              Shaft Speed
            </span>
            <RotateCw className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-1">
            {rpm !== null && !isNaN(rpm) ? (
              <span>
                {Math.round(rpm)}{" "}
                <span className="text-xs text-slate-400 font-normal">RPM</span>
              </span>
            ) : (
              <span className="text-slate-500 font-sans text-lg">Unmeasured</span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
            <span>Drive Shaft</span>
            <span className="text-purple-400 font-medium">
              {rpm !== null ? "Optical Encoder" : "Retrofit Sensor Required"}
            </span>
          </div>
        </div>

        {/* 7. Temperature */}
        <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800/80 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
              Housing Temperature
            </span>
            <Thermometer className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-1">
            {temperature !== null && !isNaN(temperature) ? (
              <span className={temperature > 75 ? "text-rose-400" : temperature > 60 ? "text-amber-400" : "text-white"}>
                {temperature.toFixed(1)}{" "}
                <span className="text-xs text-slate-400 font-normal">°C</span>
              </span>
            ) : (
              <span className="text-slate-500 font-sans text-lg">Unmeasured</span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
            <span>Warning: 70.0 °C</span>
            <span className="text-amber-400 font-medium">
              {temperature !== null ? "Auxiliary PT100 RTD" : "Unmeasured"}
            </span>
          </div>
        </div>

        {/* 8. Load Ratio */}
        <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800/80 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
              Load Factor
            </span>
            <Gauge className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-sky-400 mt-1">
            {formatPercent(loadPercent)}
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
            <span>Optimal: 60-90%</span>
            <span className="text-sky-400 font-medium">Normalized</span>
          </div>
        </div>

        {/* 9. Operating State */}
        <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800/80 hover:border-slate-700 transition-colors sm:col-span-2 lg:col-span-1 xl:col-span-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
              Equipment Operating State
            </span>
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <OperatingStateBadge state={machine.latest_operating_state} />
            <span className="text-xs text-slate-400">
              Classified by deterministic power and load hysteresis engine.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
