import React from "react";
import type { EnergyDataQuality, TelemetryFreshness } from "../../api/types";

interface FreshnessBadgeProps {
  freshness: TelemetryFreshness;
}

export const FreshnessBadge: React.FC<FreshnessBadgeProps> = ({ freshness }) => {
  switch (freshness) {
    case "fresh":
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/60"
          title="Telemetry received within the last 60 seconds"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Fresh
        </span>
      );
    case "stale":
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-950/80 text-amber-400 border border-amber-800/60"
          title="Telemetry received more than 60 seconds ago"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          Stale
        </span>
      );
    case "missing":
    default:
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-900 text-slate-400 border border-slate-800"
          title="No telemetry records recorded for this machine"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
          No Telemetry
        </span>
      );
  }
};

interface OperatingStateBadgeProps {
  state: string | null | undefined;
}

export const OperatingStateBadge: React.FC<OperatingStateBadgeProps> = ({ state }) => {
  if (!state) {
    return <span className="text-slate-500 text-xs">—</span>;
  }
  const normalized = state.toLowerCase();
  switch (normalized) {
    case "operating":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-sky-950/80 text-sky-400 border border-sky-800/60 uppercase tracking-wide">
          Operating
        </span>
      );
    case "idle":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-950/80 text-amber-300 border border-amber-800/60 uppercase tracking-wide">
          Idle
        </span>
      );
    case "low_load":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-950/80 text-orange-400 border border-orange-800/60 uppercase tracking-wide">
          Low Load
        </span>
      );
    case "stopped":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800/80 text-slate-300 border border-slate-700 uppercase tracking-wide">
          Stopped
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 uppercase tracking-wide">
          {state}
        </span>
      );
  }
};

interface EventStatusBadgeProps {
  status: string;
}

export const EventStatusBadge: React.FC<EventStatusBadgeProps> = ({ status }) => {
  const normalized = status.toLowerCase();
  switch (normalized) {
    case "detected":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-950/80 text-rose-300 border border-rose-800/60 uppercase tracking-wider">
          Detected
        </span>
      );
    case "confirmed":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-950/80 text-amber-300 border border-amber-800/60 uppercase tracking-wider">
          Confirmed
        </span>
      );
    case "resolved":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 uppercase tracking-wider">
          Resolved
        </span>
      );
    case "dismissed":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700 uppercase tracking-wider">
          Dismissed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 uppercase tracking-wider">
          {status}
        </span>
      );
  }
};

interface QualityBadgeProps {
  quality: EnergyDataQuality;
  coverageRatio?: number;
}

export const QualityBadge: React.FC<QualityBadgeProps> = ({ quality, coverageRatio }) => {
  const coveragePct = coverageRatio !== undefined ? ` (${Math.round(coverageRatio * 100)}%)` : "";
  switch (quality) {
    case "GOOD":
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/60"
          title={`Coverage is continuous and reliable${coveragePct}`}
        >
          High Quality{coveragePct}
        </span>
      );
    case "PARTIAL":
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-950/80 text-amber-400 border border-amber-800/60"
          title={`Telemetry has sample dropouts${coveragePct}`}
        >
          Partial Data{coveragePct}
        </span>
      );
    case "INSUFFICIENT_DATA":
    default:
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-rose-950/80 text-rose-400 border border-rose-800/60"
          title={`Coverage is below reliable calculation threshold${coveragePct}`}
        >
          Insufficient Data{coveragePct}
        </span>
      );
  }
};

interface SeverityBadgeProps {
  severity: string;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity }) => {
  const normalized = severity.toLowerCase();
  switch (normalized) {
    case "critical":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-rose-950/90 text-rose-300 border border-rose-700 uppercase tracking-wider">
          Critical
        </span>
      );
    case "high":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-950/90 text-amber-300 border border-amber-700 uppercase tracking-wider">
          High
        </span>
      );
    case "medium":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-950/80 text-yellow-300 border border-yellow-700/80 uppercase tracking-wider">
          Medium
        </span>
      );
    case "low":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-sky-950/80 text-sky-300 border border-sky-800/60 uppercase tracking-wider">
          Low
        </span>
      );
    case "info":
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 uppercase tracking-wider">
          {severity}
        </span>
      );
  }
};

interface AlertStatusBadgeProps {
  status: string;
}

export const AlertStatusBadge: React.FC<AlertStatusBadgeProps> = ({ status }) => {
  const normalized = status.toLowerCase();
  switch (normalized) {
    case "open":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-rose-950/80 text-rose-300 border border-rose-800/60 uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
          Open
        </span>
      );
    case "acknowledged":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-950/80 text-amber-300 border border-amber-800/60 uppercase tracking-wider">
          Acknowledged
        </span>
      );
    case "resolved":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 uppercase tracking-wider">
          Resolved
        </span>
      );
    case "dismissed":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700 uppercase tracking-wider">
          Dismissed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 uppercase tracking-wider">
          {status}
        </span>
      );
  }
};
