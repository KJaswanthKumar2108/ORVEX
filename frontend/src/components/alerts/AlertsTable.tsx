import React, { useMemo, useState } from "react";
import {
  ArrowUpDown,
  CheckCircle2,
  ExternalLink,
  Search,
  X,
} from "lucide-react";
import type { AlertRecord, MachineSummaryResponse } from "../../api/types";
import { AlertStatusBadge, SeverityBadge } from "../common/StatusBadge";
import {
  formatRelativeTime,
  formatTimestamp,
} from "../../utils/formatters";

interface AlertsTableProps {
  alerts: AlertRecord[];
  machines: MachineSummaryResponse[];
  isLoading: boolean;
  onSelectAlert: (alert: AlertRecord) => void;
  onSelectMachine: (machineId: string) => void;
  onAcknowledgeAlert: (alert: AlertRecord) => void;
  onResolveAlert: (alert: AlertRecord) => void;
  onDismissAlert: (alert: AlertRecord) => void;
  actionInProgressId: string | null;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  severityFilter: string;
  onSeverityFilterChange: (severity: string) => void;
  machineFilter: string;
  onMachineFilterChange: (machineId: string) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}

export const AlertsTable: React.FC<AlertsTableProps> = ({
  alerts,
  machines,
  isLoading,
  onSelectAlert,
  onSelectMachine,
  onAcknowledgeAlert,
  onResolveAlert,
  onDismissAlert,
  actionInProgressId,
  statusFilter,
  onStatusFilterChange,
  severityFilter,
  onSeverityFilterChange,
  machineFilter,
  onMachineFilterChange,
  searchQuery,
  onSearchQueryChange,
}) => {
  const [timeRangeFilter, setTimeRangeFilter] = useState<"all" | "24h" | "7d" | "30d">("all");
  const [sortBy, setSortBy] = useState<"occurred_desc" | "occurred_asc" | "severity">("occurred_desc");

  // Severity rank mapping for sorting
  const severityRank: Record<string, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    info: 1,
  };

  // Filter & Sort Pipeline
  const processedAlerts = useMemo(() => {
    let result = [...alerts];

    // 1. Text Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          (a.machine_name && a.machine_name.toLowerCase().includes(q)) ||
          (a.machine_identifier && a.machine_identifier.toLowerCase().includes(q)) ||
          a.alert_type.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q)
      );
    }

    // 2. Status Filter
    if (statusFilter !== "all") {
      result = result.filter((a) => a.status === statusFilter);
    }

    // 3. Severity Filter
    if (severityFilter !== "all") {
      result = result.filter((a) => a.severity === severityFilter);
    }

    // 4. Machine Filter
    if (machineFilter !== "all") {
      result = result.filter((a) => a.machine_id === machineFilter);
    }

    // 5. Time Range Filter (client-side timestamp check)
    if (timeRangeFilter !== "all") {
      const now = new Date().getTime();
      const hoursMap: Record<string, number> = {
        "24h": 24,
        "7d": 24 * 7,
        "30d": 24 * 30,
      };
      const cutoff = now - hoursMap[timeRangeFilter] * 3600 * 1000;
      result = result.filter((a) => new Date(a.occurred_at).getTime() >= cutoff);
    }

    // 6. Sorting
    result.sort((a, b) => {
      if (sortBy === "occurred_desc") {
        return new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
      } else if (sortBy === "occurred_asc") {
        return new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime();
      } else if (sortBy === "severity") {
        const diff = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
        if (diff !== 0) return diff;
        return new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
      }
      return 0;
    });

    return result;
  }, [
    alerts,
    searchQuery,
    statusFilter,
    severityFilter,
    machineFilter,
    timeRangeFilter,
    sortBy,
  ]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    statusFilter !== "all" ||
    severityFilter !== "all" ||
    machineFilter !== "all" ||
    timeRangeFilter !== "all";

  const handleResetFilters = () => {
    onSearchQueryChange("");
    onStatusFilterChange("all");
    onSeverityFilterChange("all");
    onMachineFilterChange("all");
    setTimeRangeFilter("all");
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm space-y-0">
      {/* Control / Filter Bar */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search alerts, machines, keywords, IDs..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-8 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchQueryChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          {/* Status */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 text-[11px]">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>

          {/* Severity */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 text-[11px]">Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => onSeverityFilterChange(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
          </div>

          {/* Equipment */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 text-[11px]">Equipment:</span>
            <select
              value={machineFilter}
              onChange={(e) => onMachineFilterChange(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none max-w-[140px] truncate cursor-pointer"
            >
              <option value="all">All Equipment</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.machine_identifier})
                </option>
              ))}
            </select>
          </div>

          {/* Time Window */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 text-[11px]">Time:</span>
            <select
              value={timeRangeFilter}
              onChange={(e) => setTimeRangeFilter(e.target.value as any)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all">All Time</option>
              <option value="24h">Past 24 Hours</option>
              <option value="7d">Past 7 Days</option>
              <option value="30d">Past 30 Days</option>
            </select>
          </div>

          {/* Sorting */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <ArrowUpDown className="w-3 h-3 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="occurred_desc">Newest First</option>
              <option value="occurred_asc">Oldest First</option>
              <option value="severity">Highest Severity</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors text-xs flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Alerts Count Subheader */}
      <div className="px-5 py-2.5 bg-slate-950/40 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <span>
          Showing <strong className="text-white font-mono">{processedAlerts.length}</strong> of{" "}
          <span className="font-mono">{alerts.length}</span> alerts
        </span>
        {hasActiveFilters && (
          <span className="text-[11px] text-emerald-400 font-medium">
            Filtered view active
          </span>
        )}
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/80 text-slate-400 font-mono text-[11px] border-b border-slate-800">
            <tr>
              <th className="px-5 py-3.5">Severity & Status</th>
              <th className="px-5 py-3.5">Alert Title & Archetype</th>
              <th className="px-5 py-3.5">Monitored Equipment</th>
              <th className="px-5 py-3.5">Detected Timestamp</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {isLoading && alerts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-slate-500 font-mono">
                  Loading verified alert telemetry from ORVEX backend...
                </td>
              </tr>
            ) : processedAlerts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto mb-3">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-white">No alerts match criteria</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    {hasActiveFilters
                      ? "Try clearing or adjusting search queries and filter parameters."
                      : "No operational energy alerts recorded. Fleet is operating within normal boundaries."}
                  </p>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="mt-3 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md text-xs cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Reset Filters</span>
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              processedAlerts.map((alert) => (
                <tr
                  key={alert.id}
                  className="hover:bg-slate-800/30 transition-colors group"
                >
                  {/* Severity & Status */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={alert.severity} />
                      <AlertStatusBadge status={alert.status} />
                    </div>
                  </td>

                  {/* Title & Archetype */}
                  <td className="px-5 py-3.5">
                    <button
                      type="button"
                      onClick={() => onSelectAlert(alert)}
                      className="text-left group-hover:text-emerald-400 transition-colors font-medium text-slate-200 block max-w-md truncate cursor-pointer"
                    >
                      {alert.title}
                    </button>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 font-mono">
                      <span>{alert.alert_type}</span>
                      {alert.event_id && (
                        <>
                          <span>•</span>
                          <span className="text-slate-400">evt:{alert.event_id.slice(0, 6)}</span>
                        </>
                      )}
                    </div>
                  </td>

                  {/* Monitored Equipment */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onSelectMachine(alert.machine_id)}
                      className="text-left hover:text-emerald-400 transition-colors cursor-pointer group/mach"
                    >
                      <div className="font-semibold text-slate-200 group-hover/mach:text-emerald-400 flex items-center gap-1">
                        <span>{alert.machine_name || alert.machine_identifier || "Machine"}</span>
                        <ExternalLink className="w-3 h-3 text-slate-500 group-hover/mach:text-emerald-400" />
                      </div>
                      <span className="font-mono text-[11px] text-slate-500 block">
                        {alert.machine_identifier || alert.machine_id.slice(0, 8)}
                      </span>
                    </button>
                  </td>

                  {/* Detected Timestamp */}
                  <td className="px-5 py-3.5 whitespace-nowrap font-mono">
                    <span className="text-slate-300 block">{formatTimestamp(alert.occurred_at)}</span>
                    <span className="text-[11px] text-slate-500 block">
                      {formatRelativeTime(alert.occurred_at)}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      {/* Investigate Details */}
                      <button
                        type="button"
                        onClick={() => onSelectAlert(alert)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                      >
                        Investigate
                      </button>

                      {/* Acknowledge */}
                      {alert.status === "open" && (
                        <button
                          type="button"
                          onClick={() => onAcknowledgeAlert(alert)}
                          disabled={actionInProgressId === alert.id}
                          className="px-2.5 py-1 rounded bg-amber-600/90 hover:bg-amber-500 text-white text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                        >
                          {actionInProgressId === alert.id ? "..." : "Acknowledge"}
                        </button>
                      )}

                      {/* Resolve */}
                      {(alert.status === "open" || alert.status === "acknowledged") && (
                        <button
                          type="button"
                          onClick={() => onResolveAlert(alert)}
                          disabled={actionInProgressId === alert.id}
                          className="px-2.5 py-1 rounded bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                        >
                          {actionInProgressId === alert.id ? "..." : "Resolve"}
                        </button>
                      )}

                      {/* Dismiss */}
                      {alert.status !== "dismissed" && alert.status !== "resolved" && (
                        <button
                          type="button"
                          onClick={() => onDismissAlert(alert)}
                          disabled={actionInProgressId === alert.id}
                          className="px-2 py-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
