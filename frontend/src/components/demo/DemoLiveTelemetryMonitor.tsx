import React from "react";
import {
  Activity,
  Clock,
  Gauge,
  Layers,
  Radio,
  RefreshCw,
  Thermometer,
  Zap,
} from "lucide-react";
import type { TelemetryRecordResponse } from "../../api/types";
import { OperatingStateBadge } from "../common/StatusBadge";
import {
  formatPower,
  formatRelativeTime,
  formatTimestamp,
} from "../../utils/formatters";

interface DemoLiveTelemetryMonitorProps {
  latestTelemetry: TelemetryRecordResponse | null;
  ratedPowerKw: number | null;
  isLoading: boolean;
  isPolling: boolean;
  totalSamplesReceived: number;
  lastPolledAt: Date | null;
  onRefreshTelemetry: () => void;
}

export const DemoLiveTelemetryMonitor: React.FC<DemoLiveTelemetryMonitorProps> = ({
  latestTelemetry,
  ratedPowerKw,
  isLoading,
  isPolling,
  totalSamplesReceived,
  lastPolledAt,
  onRefreshTelemetry,
}) => {
  const isStale =
    latestTelemetry?.timestamp
      ? new Date().getTime() - new Date(latestTelemetry.timestamp).getTime() > 120000
      : true;

  const powerRatio =
    latestTelemetry?.active_power && ratedPowerKw && ratedPowerKw > 0
      ? (latestTelemetry.active_power / ratedPowerKw) * 100
      : null;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
      {/* Header with Connection & Freshness Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <Radio className={`w-4 h-4 ${isPolling ? "text-emerald-400 animate-pulse" : "text-slate-500"}`} />
          <h3 className="text-sm font-bold text-white tracking-tight uppercase font-mono">
            Live Telemetry Ingestion Monitor
          </h3>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            SIMULATED SOURCE
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                !latestTelemetry
                  ? "bg-slate-500"
                  : isStale
                  ? "bg-amber-400 animate-pulse"
                  : "bg-emerald-400"
              }`}
            />
            <span className="text-slate-300">
              {!latestTelemetry
                ? "Awaiting Signal"
                : isStale
                ? "Telemetry Stale"
                : "Live Packet Signal"}
            </span>
          </div>

          <span className="text-slate-600">•</span>
          <span className="text-slate-400">
            Samples: <strong className="text-white font-mono">{totalSamplesReceived}</strong>
          </span>

          <button
            type="button"
            onClick={onRefreshTelemetry}
            disabled={isLoading}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
            title="Poll telemetry manually"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Main Telemetry Grid */}
      {latestTelemetry ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {/* 1. Active Power */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-medium">Active Power</span>
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-lg font-bold font-mono text-emerald-400">
              {formatPower(latestTelemetry.active_power)}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              Rated: {ratedPowerKw ? `${ratedPowerKw.toFixed(1)} kW` : "—"}
            </div>
          </div>

          {/* 2. Operating State */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-medium">State</span>
              <Activity className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="pt-0.5">
              <OperatingStateBadge state={latestTelemetry.operating_state as any} />
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              Speed: {latestTelemetry.rpm != null ? `${latestTelemetry.rpm.toFixed(0)} RPM` : "—"}
            </div>
          </div>

          {/* 3. Load Percentage */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-medium">Mechanical Load</span>
              <Gauge className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-lg font-bold font-mono text-white">
              {latestTelemetry.load_percent != null
                ? `${latestTelemetry.load_percent.toFixed(1)}%`
                : "—"}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              Draw: {powerRatio != null ? `${powerRatio.toFixed(0)}% rated` : "—"}
            </div>
          </div>

          {/* 4. Temperature */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-medium">Temperature</span>
              <Thermometer className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="text-lg font-bold font-mono text-white">
              {latestTelemetry.temperature != null
                ? `${latestTelemetry.temperature.toFixed(1)} °C`
                : "—"}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">Motor housing</div>
          </div>

          {/* 5. Power Factor */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-medium">Power Factor</span>
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="text-lg font-bold font-mono text-white">
              {latestTelemetry.power_factor != null
                ? latestTelemetry.power_factor.toFixed(2)
                : "—"}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">cos φ efficiency</div>
          </div>

          {/* 6. Voltage & Current */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-medium">V / I Profile</span>
              <Activity className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="text-xs font-bold font-mono text-slate-200">
              {latestTelemetry.voltage != null ? `${latestTelemetry.voltage.toFixed(0)} V` : "—"}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              {latestTelemetry.current != null ? `${latestTelemetry.current.toFixed(1)} A` : "—"}
            </div>
          </div>

          {/* 7. Vibration Channel Note */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-medium">Vibration</span>
              <Activity className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <div className="text-lg font-bold font-mono text-slate-500">—</div>
            <div className="text-[9px] text-slate-500 leading-tight">
              Uninstrumented on standard gateway
            </div>
          </div>
        </div>
      ) : (
        <div className="py-8 bg-slate-950/60 rounded-lg border border-slate-800/80 text-center space-y-2">
          <Clock className="w-6 h-6 text-slate-500 mx-auto" />
          <h4 className="text-xs font-semibold text-slate-300">
            No telemetry received yet for this machine
          </h4>
          <p className="text-[11px] text-slate-500 max-w-md mx-auto">
            Click &ldquo;Initiate Verification Session&rdquo; or execute the scenario driver CLI to start streaming telemetry into the backend.
          </p>
        </div>
      )}

      {/* Telemetry Timing Footnote */}
      {latestTelemetry && (
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-1">
          <span>
            Packet Timestamp:{" "}
            <strong className="text-slate-300 font-normal">
              {formatTimestamp(latestTelemetry.timestamp)}
            </strong>{" "}
            ({formatRelativeTime(latestTelemetry.timestamp)})
          </span>
          {lastPolledAt && (
            <span>
              Last Checked: {lastPolledAt.toLocaleTimeString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
