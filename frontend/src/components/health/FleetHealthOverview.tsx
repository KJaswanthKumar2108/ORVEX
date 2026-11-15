import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  HeartPulse,
  Info,
  Layers,
  ShieldAlert,
} from "lucide-react";
import type { FleetHealthSummaryResponse } from "../../api/types";

interface FleetHealthOverviewProps {
  summary: FleetHealthSummaryResponse | null;
  isLoading?: boolean;
}

export const FleetHealthOverview: React.FC<FleetHealthOverviewProps> = ({
  summary,
  isLoading = false,
}) => {
  const fleetScore = summary?.fleet_health_score ?? null;
  const breakdown = summary?.status_breakdown || {
    HEALTHY: 0,
    WATCH: 0,
    WARNING: 0,
    CRITICAL: 0,
    INSUFFICIENT_DATA: 0,
  };
  const warningsBySev = summary?.active_warnings_by_severity || {
    WATCH: 0,
    WARNING: 0,
    CRITICAL: 0,
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return "text-slate-500";
    if (score >= 85) return "text-emerald-400";
    if (score >= 70) return "text-amber-400";
    if (score >= 50) return "text-orange-400";
    return "text-rose-400";
  };

  const getScoreBg = (score: number | null) => {
    if (score === null) return "bg-slate-800/40 border-slate-700/60";
    if (score >= 85) return "bg-emerald-500/10 border-emerald-500/30";
    if (score >= 70) return "bg-amber-500/10 border-amber-500/30";
    if (score >= 50) return "bg-orange-500/10 border-orange-500/30";
    return "bg-rose-500/10 border-rose-500/30";
  };

  return (
    <div className="space-y-4">
      {/* Top Banner / Title Header */}
      <div className="bg-[#0d1424] border border-cyan-500/30 rounded-xl p-5 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0 mt-0.5">
            <HeartPulse className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight text-white font-sans">
                Predictive Maintenance & Condition Monitoring
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/80 font-mono font-semibold">
                Telemetry Condition Intelligence
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Multi-channel machine degradation tracking: electrical volatility, thermal margin, load consistency, and state stability.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-400 self-start md:self-auto">
          <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          <span>Deterministic Condition Scoring</span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* 1. Fleet Health Index */}
        <div className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between ${getScoreBg(fleetScore)}`}>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider">Fleet Health Index</span>
            <HeartPulse className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono mt-1">
            {isLoading ? (
              <span className="text-slate-500">...</span>
            ) : fleetScore !== null ? (
              <span className={getScoreColor(fleetScore)}>
                {fleetScore.toFixed(1)} / 100
              </span>
            ) : (
              <span className="text-slate-500">— / 100</span>
            )}
          </div>
          <span className="text-[11px] text-slate-400 mt-2 font-mono">
            Weighted composite stability
          </span>
        </div>

        {/* 2. Monitored Fleet */}
        <div className="bg-[#0d1424] p-4 rounded-xl border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider">Fleet Monitored</span>
            <Layers className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-1">
            {isLoading ? "..." : summary?.total_machines_monitored ?? 0}
          </div>
          <span className="text-[11px] text-slate-400 mt-2 font-mono">
            Fleet Equipment Monitored
          </span>
        </div>

        {/* 3. Active Condition Warnings */}
        <div className="bg-[#0d1424] p-4 rounded-xl border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider">Active Warnings</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
            {isLoading ? "..." : summary?.active_warnings_count ?? 0}
          </div>
          <span className="text-[11px] text-slate-400 mt-2 font-mono flex items-center gap-1.5">
            <span className="text-rose-400 font-bold">{warningsBySev.CRITICAL || 0} crit</span> •{" "}
            <span className="text-orange-400">{warningsBySev.WARNING || 0} warn</span> •{" "}
            <span className="text-amber-400">{warningsBySev.WATCH || 0} watch</span>
          </span>
        </div>

        {/* 4. Equipment Health Breakdown */}
        <div className="bg-[#0d1424] p-4 rounded-xl border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider">Status Distribution</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {breakdown.HEALTHY} Healthy
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {breakdown.WATCH} Watch
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
              {(breakdown.WARNING || 0) + (breakdown.CRITICAL || 0)} Alert
            </span>
          </div>
          <span className="text-[11px] text-slate-400 mt-2 font-mono">
            {breakdown.INSUFFICIENT_DATA || 0} insufficient data
          </span>
        </div>

        {/* 5. Physical Channel Limits */}
        <div className="bg-[#0d1424] p-4 rounded-xl border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider">Channel Status</span>
            <ShieldAlert className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-xs font-mono text-cyan-300 mt-1">
            Electrical & Thermal
          </div>
          <span className="text-[11px] text-amber-300/90 mt-2 font-mono flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Vibration Unmeasured
          </span>
        </div>
      </div>

      {/* Unmeasured Channels & Hardware Disclosure Banner */}
      <div className="bg-slate-900/90 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-semibold text-amber-300 font-mono text-[11px] uppercase tracking-wider">
              Sensor Hardware Scope & Physical Vibration Boundary
            </div>
            <p className="text-slate-300 leading-relaxed">
              {summary?.unmeasured_channels && summary.unmeasured_channels.length > 0
                ? summary.unmeasured_channels[0]
                : "Vibration (ISO 10816-3 RMS velocity) requires retrofitted high-frequency piezo accelerometer hardware. Currently unmeasured."}
            </p>
          </div>
        </div>
        <span className="shrink-0 text-[11px] font-mono px-2.5 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
          Hardware Retrofit Pending
        </span>
      </div>
    </div>
  );
};
