import React, { useMemo } from "react";
import {
  Activity,
  Bell,
  CheckCircle,
  Clock,
  HeartPulse,
  TrendingDown,
} from "lucide-react";
import type {
  AlertRecord,
  MachineHealthWarning,
  MachineSummaryResponse,
  WastageEventResponse,
} from "../../api/types";
import {
  formatDuration,
  formatReasonTitle,
  formatRelativeTime,
} from "../../utils/formatters";

interface ActivityEvent {
  id: string;
  timestamp: string;
  type: "WASTAGE" | "ALERT_NEW" | "ALERT_ACK" | "HEALTH_WARNING";
  machineId: string;
  machineName: string;
  title: string;
  description: string;
  metric?: string;
  severity?: "critical" | "warning" | "watch" | "normal";
}

interface OperationalActivityStreamProps {
  wastageEvents: WastageEventResponse[];
  alerts: AlertRecord[];
  healthWarnings: MachineHealthWarning[];
  machines: MachineSummaryResponse[];
  onSelectMachine?: (machineId: string) => void;
  isLoading?: boolean;
}

export const OperationalActivityStream: React.FC<OperationalActivityStreamProps> = ({
  wastageEvents,
  alerts,
  healthWarnings,
  machines,
  onSelectMachine,
  isLoading = false,
}) => {
  const machineMap = useMemo(() => {
    const map = new Map<string, string>();
    machines.forEach((m) => {
      map.set(m.id, m.name);
    });
    return map;
  }, [machines]);

  const activityFeed: ActivityEvent[] = useMemo(() => {
    const list: ActivityEvent[] = [];

    // 1. Wastage events
    wastageEvents.forEach((w) => {
      const mName = machineMap.get(w.machine_id) || "Monitored Asset";
      const wastedKwh = w.estimated_wasted_energy_kwh;
      list.push({
        id: `wastage-${w.id}`,
        timestamp: w.start_time,
        type: "WASTAGE",
        machineId: w.machine_id,
        machineName: mName,
        title: `${formatReasonTitle(w.detection_reason)} Detected`,
        description: `Wastage episode logged lasting ${formatDuration(w.duration_seconds || 0)}.`,
        metric: wastedKwh !== null ? `${wastedKwh.toFixed(1)} kWh lost` : "Inrush cycling",
        severity: "warning",
      });
    });

    // 2. Alerts (new and acknowledged)
    alerts.forEach((a) => {
      const mName =
        (a.machine_id ? machineMap.get(a.machine_id) : undefined) ||
        a.machine_name ||
        "Monitored Asset";

      if (a.status === "acknowledged" && a.resolved_at) {
        list.push({
          id: `alert-ack-${a.id}`,
          timestamp: a.resolved_at,
          type: "ALERT_ACK",
          machineId: a.machine_id || "",
          machineName: mName,
          title: `Alert Acknowledged: ${a.title}`,
          description: a.description,
          severity: "normal",
        });
      } else {
        list.push({
          id: `alert-new-${a.id}`,
          timestamp: a.occurred_at,
          type: "ALERT_NEW",
          machineId: a.machine_id || "",
          machineName: mName,
          title: a.title,
          description: a.description,
          severity: a.severity as "critical" | "warning",
        });
      }
    });

    // 3. Health Warnings
    healthWarnings.forEach((hw) => {
      const mName =
        machineMap.get(hw.machine_id) || hw.machine_name || "Monitored Asset";
      list.push({
        id: `health-${hw.id}`,
        timestamp: hw.detected_at,
        type: "HEALTH_WARNING",
        machineId: hw.machine_id,
        machineName: mName,
        title: `Condition Warning: ${hw.warning_type.replace(/_/g, " ")}`,
        description: hw.severity_rationale,
        metric: `${hw.observed_value.toFixed(3)} ${hw.unit}`,
        severity: hw.severity.toLowerCase() as "critical" | "warning",
      });
    });

    // Sort descending by timestamp
    return list
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20); // Top 20 recent events
  }, [wastageEvents, alerts, healthWarnings, machineMap]);

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white tracking-wide">
              Operational Activity Feed
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time chronological log of wastage detections, alert lifecycle, and health updates
          </p>
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          {activityFeed.length} events logged
        </span>
      </div>

      {/* Feed Content */}
      {isLoading && activityFeed.length === 0 ? (
        <div className="py-8 text-center text-xs font-mono text-slate-500">
          Syncing operational stream...
        </div>
      ) : activityFeed.length === 0 ? (
        <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-lg">
          <Clock className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
          <p className="font-medium text-slate-300">No Operational Activity</p>
          <p className="text-slate-500 text-[11px] mt-0.5">
            Events will be recorded when wastage occurs, alerts trigger, or health warnings update.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
          {activityFeed.map((ev) => {
            const isAck = ev.type === "ALERT_ACK";
            const isWastage = ev.type === "WASTAGE";
            const isHealth = ev.type === "HEALTH_WARNING";

            const icon = isAck ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : isWastage ? (
              <TrendingDown className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            ) : isHealth ? (
              <HeartPulse className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            ) : (
              <Bell className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            );

            return (
              <div
                key={ev.id}
                onClick={() => ev.machineId && onSelectMachine?.(ev.machineId)}
                className={`p-3 rounded-lg border transition-all flex items-start justify-between gap-3 text-xs ${
                  ev.machineId
                    ? "bg-slate-950/50 border-slate-800/80 hover:bg-slate-850/80 hover:border-slate-700 cursor-pointer"
                    : "bg-slate-950/40 border-slate-800/60"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {icon}
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-200">
                        {ev.title}
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400">
                        {ev.machineName}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed line-clamp-2">
                      {ev.description}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0 font-mono text-[11px] space-y-1">
                  <div className="text-slate-400">
                    {formatRelativeTime(ev.timestamp)}
                  </div>
                  {ev.metric && (
                    <div className="text-amber-400 font-bold text-[10px]">
                      {ev.metric}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
