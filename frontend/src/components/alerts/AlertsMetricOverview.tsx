import React from "react";
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  Clock,
  Flame,
  Info,
} from "lucide-react";
import type { AlertRecord } from "../../api/types";

interface AlertsMetricOverviewProps {
  alerts: AlertRecord[];
  onFilterStatus?: (status: string) => void;
  onFilterSeverity?: (severity: string) => void;
  currentStatusFilter?: string;
  currentSeverityFilter?: string;
}

export const AlertsMetricOverview: React.FC<AlertsMetricOverviewProps> = ({
  alerts,
  onFilterStatus,
  onFilterSeverity,
  currentStatusFilter = "all",
  currentSeverityFilter = "all",
}) => {
  const totalCount = alerts.length;
  const openCount = alerts.filter((a) => a.status === "open").length;
  const acknowledgedCount = alerts.filter((a) => a.status === "acknowledged").length;
  const resolvedCount = alerts.filter((a) => a.status === "resolved").length;

  const criticalCount = alerts.filter(
    (a) => (a.severity === "critical" || a.severity === "high") && a.status !== "resolved" && a.status !== "dismissed"
  ).length;

  const mediumCount = alerts.filter(
    (a) => a.severity === "medium" && a.status !== "resolved" && a.status !== "dismissed"
  ).length;

  const lowInfoCount = alerts.filter(
    (a) => (a.severity === "low" || a.severity === "info") && a.status !== "resolved" && a.status !== "dismissed"
  ).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {/* 1. Active Alerts */}
      <button
        type="button"
        onClick={() => onFilterStatus && onFilterStatus(currentStatusFilter === "open" ? "all" : "open")}
        className={`text-left p-3.5 rounded-lg border transition-all cursor-pointer ${
          currentStatusFilter === "open"
            ? "bg-rose-950/40 border-rose-500/80 shadow-md ring-1 ring-rose-500/40"
            : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
        }`}
      >
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-[11px] font-medium uppercase tracking-wider">Active Open</span>
          <BellRing className="w-4 h-4 text-rose-400" />
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold font-mono text-white">{openCount}</span>
          <span className="text-[11px] text-slate-500">/ {totalCount} total</span>
        </div>
        <div className="mt-1 text-[11px] text-rose-400 font-medium">
          Requires immediate triage
        </div>
      </button>

      {/* 2. Critical & High */}
      <button
        type="button"
        onClick={() => onFilterSeverity && onFilterSeverity(currentSeverityFilter === "critical" ? "all" : "critical")}
        className={`text-left p-3.5 rounded-lg border transition-all cursor-pointer ${
          currentSeverityFilter === "critical" || currentSeverityFilter === "high"
            ? "bg-red-950/40 border-red-500/80 shadow-md ring-1 ring-red-500/40"
            : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
        }`}
      >
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-[11px] font-medium uppercase tracking-wider">High / Critical</span>
          <Flame className="w-4 h-4 text-red-400" />
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold font-mono text-red-400">{criticalCount}</span>
          <span className="text-[11px] text-slate-500">active</span>
        </div>
        <div className="mt-1 text-[11px] text-red-400 font-medium">
          Severe excess wastage
        </div>
      </button>

      {/* 3. Medium Severity */}
      <button
        type="button"
        onClick={() => onFilterSeverity && onFilterSeverity(currentSeverityFilter === "medium" ? "all" : "medium")}
        className={`text-left p-3.5 rounded-lg border transition-all cursor-pointer ${
          currentSeverityFilter === "medium"
            ? "bg-amber-950/40 border-amber-500/80 shadow-md ring-1 ring-amber-500/40"
            : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
        }`}
      >
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-[11px] font-medium uppercase tracking-wider">Medium</span>
          <AlertCircle className="w-4 h-4 text-amber-400" />
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold font-mono text-amber-300">{mediumCount}</span>
          <span className="text-[11px] text-slate-500">active</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-500 font-medium">
          Idling & sub-optimal load
        </div>
      </button>

      {/* 4. Low & Info */}
      <button
        type="button"
        onClick={() => onFilterSeverity && onFilterSeverity(currentSeverityFilter === "low" ? "all" : "low")}
        className={`text-left p-3.5 rounded-lg border transition-all cursor-pointer ${
          currentSeverityFilter === "low" || currentSeverityFilter === "info"
            ? "bg-sky-950/40 border-sky-500/80 shadow-md ring-1 ring-sky-500/40"
            : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
        }`}
      >
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-[11px] font-medium uppercase tracking-wider">Low / Info</span>
          <Info className="w-4 h-4 text-sky-400" />
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold font-mono text-sky-300">{lowInfoCount}</span>
          <span className="text-[11px] text-slate-500">active</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-500 font-medium">
          Advisory & minor drift
        </div>
      </button>

      {/* 5. Acknowledged */}
      <button
        type="button"
        onClick={() => onFilterStatus && onFilterStatus(currentStatusFilter === "acknowledged" ? "all" : "acknowledged")}
        className={`text-left p-3.5 rounded-lg border transition-all cursor-pointer ${
          currentStatusFilter === "acknowledged"
            ? "bg-amber-950/40 border-amber-500/80 shadow-md ring-1 ring-amber-500/40"
            : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
        }`}
      >
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-[11px] font-medium uppercase tracking-wider">Acknowledged</span>
          <Clock className="w-4 h-4 text-amber-400" />
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold font-mono text-amber-400">{acknowledgedCount}</span>
          <span className="text-[11px] text-slate-500">in triage</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-500 font-medium">
          Assigned to field staff
        </div>
      </button>

      {/* 6. Resolved */}
      <button
        type="button"
        onClick={() => onFilterStatus && onFilterStatus(currentStatusFilter === "resolved" ? "all" : "resolved")}
        className={`text-left p-3.5 rounded-lg border transition-all cursor-pointer ${
          currentStatusFilter === "resolved"
            ? "bg-emerald-950/40 border-emerald-500/80 shadow-md ring-1 ring-emerald-500/40"
            : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
        }`}
      >
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-[11px] font-medium uppercase tracking-wider">Resolved</span>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold font-mono text-emerald-400">{resolvedCount}</span>
          <span className="text-[11px] text-slate-500">closed</span>
        </div>
        <div className="mt-1 text-[11px] text-emerald-400/80 font-medium">
          Mitigation documented
        </div>
      </button>
    </div>
  );
};
