import React from "react";
import {
  ArrowLeft,
  Cpu,
  Radio,
  RefreshCw,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Eye,
  Info,
} from "lucide-react";
import type {
  HealthStatus,
  MachineResponse,
  MachineSummaryResponse,
} from "../../api/types";
import { FreshnessBadge, OperatingStateBadge } from "../common/StatusBadge";
import { TimeRangeSelector } from "../common/TimeRangeSelector";
import type { TimeRangeKey } from "../../utils/timeRanges";
import { formatRelativeTime, formatTimestamp } from "../../utils/formatters";

interface MachineDetailHeaderProps {
  machine: MachineSummaryResponse;
  machineMeta?: MachineResponse | null;
  healthStatus?: HealthStatus | null;
  selectedRange: TimeRangeKey;
  onRangeChange: (range: TimeRangeKey) => void;
  onBack: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  lastRefreshed: Date;
  autoRefreshInterval: number;
  onAutoRefreshChange: (interval: number) => void;
}

export const MachineDetailHeader: React.FC<MachineDetailHeaderProps> = ({
  machine,
  machineMeta,
  healthStatus,
  selectedRange,
  onRangeChange,
  onBack,
  onRefresh,
  isRefreshing = false,
  lastRefreshed,
  autoRefreshInterval,
  onAutoRefreshChange,
}) => {
  const isStopped = machine.latest_operating_state?.toLowerCase() === "stopped";
  const isFresh = machine.telemetry_freshness === "fresh";
  const isStale = machine.telemetry_freshness === "stale";
  const isMissing = machine.telemetry_freshness === "missing";

  // Health Status Badge helper
  const renderHealthPill = (status?: HealthStatus | null) => {
    switch (status) {
      case "HEALTHY":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Healthy
          </span>
        );
      case "WATCH":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Eye className="w-3 h-3" /> Watch
          </span>
        );
      case "WARNING":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/30">
            <AlertTriangle className="w-3 h-3" /> Warning
          </span>
        );
      case "CRITICAL":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <AlertOctagon className="w-3 h-3" /> Critical
          </span>
        );
      case "INSUFFICIENT_DATA":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <Info className="w-3 h-3" /> Health: Evaluating
          </span>
        );
    }
  };

  return (
    <div className="bg-[#0d1424] border border-slate-800/80 rounded-xl p-5 shadow-lg space-y-4">
      {/* Top Nav & Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-800/80">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 px-2.5 py-1.5 rounded-lg border border-slate-700/60 transition-colors w-fit cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Fleet Command Center</span>
        </button>

        <div className="flex items-center gap-2.5 flex-wrap self-end sm:self-auto">
          {/* Refresh controls */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 px-2 py-1 rounded-lg text-xs">
            <span className="text-slate-400 text-[11px]">Sync:</span>
            <select
              value={autoRefreshInterval}
              onChange={(e) => onAutoRefreshChange(Number(e.target.value))}
              aria-label="Auto-refresh interval"
              className="bg-transparent text-slate-200 text-xs font-mono focus:outline-none cursor-pointer"
            >
              <option value={10} className="bg-slate-900">10s auto</option>
              <option value={30} className="bg-slate-900">30s auto</option>
              <option value={60} className="bg-slate-900">60s auto</option>
              <option value={0} className="bg-slate-900">Paused</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh machine telemetry now"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-emerald-400" : ""}`} />
            <span>{isRefreshing ? "Syncing..." : "Sync"}</span>
          </button>

          {/* Time range selector */}
          <TimeRangeSelector selectedRange={selectedRange} onRangeChange={onRangeChange} />
        </div>
      </div>

      {/* Main Identity Information */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
            <Cpu className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-sans">
                {machine.name}
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono font-semibold border border-slate-700">
                {machine.machine_identifier}
              </span>
              <OperatingStateBadge state={machine.latest_operating_state} />
              {renderHealthPill(healthStatus)}
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
              <span className="flex items-center gap-1">
                Type: <strong className="text-slate-200 capitalize font-medium">{machine.machine_type.replace(/_/g, " ")}</strong>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 font-mono">
                Rated:{" "}
                <strong className="text-sky-400 font-semibold">
                  {machine.rated_power_kw ? `${machine.rated_power_kw} kW` : "Unspecified"}
                </strong>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                <span>Site: {machineMeta?.site_id || machine.site_id || "Main Mine Pit"}</span>
              </span>
              <span>•</span>
              <span className="text-slate-500 text-[11px] font-mono">
                Synced {lastRefreshed.toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>

        {/* Telemetry Freshness & Sensor Connectivity Badge */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-slate-950/70 p-3 rounded-lg border border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <Radio className={`w-4 h-4 ${isFresh ? "text-emerald-400" : isStale ? "text-amber-400" : "text-rose-400"}`} />
            <div>
              <div className="flex items-center gap-1.5 font-medium">
                <span className="text-slate-300">Sensor Gateway:</span>
                <FreshnessBadge freshness={machine.telemetry_freshness} />
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {isStopped && isFresh ? (
                  <span className="text-sky-400 font-medium">
                    Equipment Stopped • Sensor Online (0 kW)
                  </span>
                ) : isStale ? (
                  <span className="text-amber-400 font-medium">
                    Telemetry Stale • Gateway Delayed
                  </span>
                ) : isMissing ? (
                  <span className="text-rose-400 font-medium">
                    Sensor Offline • No Telemetry
                  </span>
                ) : (
                  <span className="text-emerald-400">
                    Active Modbus RTU / MQTT Feed
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="border-t sm:border-t-0 sm:border-l border-slate-800 pt-2 sm:pt-0 sm:pl-3 text-[11px] text-slate-400 font-mono">
            <div>Last Telemetry:</div>
            <div className="text-slate-200 font-semibold" title={machine.latest_telemetry_timestamp || ""}>
              {formatRelativeTime(machine.latest_telemetry_timestamp)}
            </div>
            <div className="text-[10px] text-slate-500">
              {formatTimestamp(machine.latest_telemetry_timestamp)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
