import React, { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import { endpoints } from "../../api/endpoints";
import type { AlertRecord } from "../../api/types";
import { AlertStatusBadge, SeverityBadge } from "../common/StatusBadge";
import { formatRelativeTime } from "../../utils/formatters";

interface MachineAlertsCardProps {
  machineId: string;
}

export const MachineAlertsCard: React.FC<MachineAlertsCardProps> = ({ machineId }) => {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchAlerts = async () => {
    setIsLoading(true);
    try {
      const res = await endpoints.getMachineAlerts(machineId, { limit: 10 });
      setAlerts(res.items);
    } catch {
      // Non-blocking
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [machineId]);

  const handleAcknowledge = async (alertId: string) => {
    setActionInProgress(alertId);
    try {
      const updated = await endpoints.acknowledgeAlert(alertId);
      setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch {
      // Ignore
    } finally {
      setActionInProgress(null);
    }
  };

  if (!isLoading && alerts.length === 0) {
    return null; // Don't take up space if there are no alerts for this machine
  }

  const openCount = alerts.filter((a) => a.status === "open").length;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-lg overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-white tracking-tight">
            Equipment Operational Alerts
          </h3>
          {openCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
              {openCount} Open
            </span>
          )}
        </div>
      </div>

      <div className="divide-y divide-slate-800/60">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <SeverityBadge severity={alert.severity} />
                <span className="font-semibold text-slate-200">{alert.title}</span>
                <span className="text-slate-500">•</span>
                <span className="font-mono text-slate-400">{formatRelativeTime(alert.occurred_at)}</span>
              </div>
              <p className="text-slate-300 text-xs">{alert.description}</p>
              <div className="text-[11px] text-emerald-400 bg-emerald-950/20 border border-emerald-900/40 rounded px-2 py-1 mt-1 inline-block">
                <strong>Action: </strong>
                {alert.recommendation}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <AlertStatusBadge status={alert.status} />
              {alert.status === "open" && (
                <button
                  type="button"
                  onClick={() => handleAcknowledge(alert.id)}
                  disabled={actionInProgress === alert.id}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center gap-1"
                >
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>{actionInProgress === alert.id ? "Saving..." : "Acknowledge"}</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
