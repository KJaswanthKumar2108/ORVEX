import React, { useState } from "react";
import { Bell, CheckCircle2, ChevronRight, Check } from "lucide-react";
import type { AlertRecord } from "../../api/types";
import { formatRelativeTime } from "../../utils/formatters";
import { AlertStatusBadge, SeverityBadge } from "../common/StatusBadge";

interface AlertsPanelProps {
  alerts: AlertRecord[];
  isLoading?: boolean;
  onAcknowledgeAlert?: (alertId: string) => Promise<void>;
  onViewAllAlerts?: () => void;
  onSelectMachine?: (machineId: string) => void;
}

export const AlertsPanel: React.FC<AlertsPanelProps> = ({
  alerts,
  isLoading = false,
  onAcknowledgeAlert,
  onViewAllAlerts,
  onSelectMachine,
}) => {
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  const openCount = alerts.filter((a) => a.status === "open").length;
  // Show up to 5 most recent alerts
  const displayAlerts = alerts.slice(0, 5);

  const handleAcknowledge = async (e: React.MouseEvent, alertId: string) => {
    e.stopPropagation();
    if (!onAcknowledgeAlert) return;
    try {
      setAcknowledgingId(alertId);
      await onAcknowledgeAlert(alertId);
    } finally {
      setAcknowledgingId(null);
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-lg overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white tracking-tight">Active Alerts</h3>
              {openCount > 0 && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-bold font-mono rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  {openCount} open
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Operational warnings linked to verified wastage episodes
            </p>
          </div>
        </div>

        {onViewAllAlerts && (
          <button
            type="button"
            onClick={onViewAllAlerts}
            className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors cursor-pointer"
          >
            <span>All Alerts</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Body */}
      {isLoading && alerts.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-500 font-mono">Loading alerts...</div>
      ) : displayAlerts.length === 0 ? (
        <div className="p-6 text-center">
          <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto mb-2">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <p className="text-xs font-medium text-slate-300">All equipment nominal</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            No active energy wastage or operational warnings detected.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/60">
          {displayAlerts.map((alert) => (
            <div
              key={alert.id}
              className="p-4 hover:bg-slate-800/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2 flex-wrap">
                  <SeverityBadge severity={alert.severity} />
                  <span className="font-semibold text-slate-200">{alert.title}</span>
                  <span className="text-slate-500">•</span>
                  <button
                    type="button"
                    onClick={() => onSelectMachine && onSelectMachine(alert.machine_id)}
                    className="font-mono text-emerald-400 hover:underline cursor-pointer"
                    title="View machine detail"
                  >
                    {alert.machine_name || alert.machine_identifier || alert.machine_id.slice(0, 8)}
                  </button>
                </div>
                <p className="text-slate-400 text-[11px] line-clamp-1">{alert.description}</p>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                  <span>Occurred: {formatRelativeTime(alert.occurred_at)}</span>
                  <span>Status:</span>
                  <AlertStatusBadge status={alert.status} />
                </div>
              </div>

              {/* Action */}
              <div className="flex items-center gap-2 shrink-0">
                {alert.status === "open" && onAcknowledgeAlert && (
                  <button
                    type="button"
                    onClick={(e) => handleAcknowledge(e, alert.id)}
                    disabled={acknowledgingId === alert.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>{acknowledgingId === alert.id ? "Saving..." : "Acknowledge"}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
