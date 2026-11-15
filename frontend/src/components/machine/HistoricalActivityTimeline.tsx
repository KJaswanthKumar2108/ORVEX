import React, { useMemo, useState } from "react";
import { Clock } from "lucide-react";
import type {
  AlertRecord,
  MachineHealthWarning,
  MaintenanceObservation,
  TelemetryRecordResponse,
  WastageEventResponse,
} from "../../api/types";
import { formatRelativeTime, formatTimestamp } from "../../utils/formatters";

interface HistoricalActivityTimelineProps {
  telemetry: TelemetryRecordResponse[];
  wastageEvents: WastageEventResponse[];
  alerts: AlertRecord[];
  healthWarnings: MachineHealthWarning[];
  observations?: MaintenanceObservation[];
  onAcknowledgeAlert?: (alertId: string) => void;
  isLoading?: boolean;
}

type TimelineCategory = "all" | "wastage" | "alert" | "health" | "maintenance" | "state";

interface TimelineItem {
  id: string;
  category: "wastage" | "alert" | "health" | "maintenance" | "state";
  timestamp: string;
  title: string;
  subtitle?: string;
  description: string;
  badgeText: string;
  badgeStyle: string;
  actionText?: string;
  actionCallback?: () => void;
}

export const HistoricalActivityTimeline: React.FC<HistoricalActivityTimelineProps> = ({
  telemetry,
  wastageEvents,
  alerts,
  healthWarnings,
  observations = [],
  onAcknowledgeAlert,
  isLoading = false,
}) => {
  const [filter, setFilter] = useState<TimelineCategory>("all");

  // Compile unified timeline items
  const timelineItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];

    // 1. Wastage events
    wastageEvents.forEach((ev) => {
      items.push({
        id: `wastage-${ev.id}`,
        category: "wastage",
        timestamp: ev.start_time,
        title: `Energy Wastage: ${ev.detection_reason.replace(/_/g, " ").toUpperCase()}`,
        subtitle: ev.duration_seconds ? `Duration: ${Math.round(ev.duration_seconds / 60)} min` : undefined,
        description: ev.estimated_wasted_energy_kwh !== null
          ? `Estimated energy loss: ${ev.estimated_wasted_energy_kwh.toFixed(2)} kWh. Status: ${ev.status}.`
          : `Mechanical cycling stress detected. Status: ${ev.status}.`,
        badgeText: "Wastage",
        badgeStyle: "bg-rose-500/10 text-rose-300 border-rose-500/30",
      });
    });

    // 2. Operational alerts
    alerts.forEach((alt) => {
      items.push({
        id: `alert-${alt.id}`,
        category: "alert",
        timestamp: alt.occurred_at,
        title: `Alert: ${alt.title}`,
        subtitle: `Severity: ${alt.severity.toUpperCase()}`,
        description: alt.description,
        badgeText: alt.status === "open" ? "Alert Open" : "Alert Acknowledged",
        badgeStyle: alt.status === "open"
          ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
          : "bg-slate-800 text-slate-400 border-slate-700",
        actionText: alt.status === "open" && onAcknowledgeAlert ? "Acknowledge" : undefined,
        actionCallback: alt.status === "open" && onAcknowledgeAlert ? () => onAcknowledgeAlert(alt.id) : undefined,
      });
    });

    // 3. Health warnings
    healthWarnings.forEach((hw) => {
      items.push({
        id: `health-${hw.id}`,
        category: "health",
        timestamp: hw.detected_at,
        title: `Condition Warning: ${hw.warning_type.replace(/_/g, " ").toUpperCase()}`,
        subtitle: `Observed: ${hw.observed_value} ${hw.unit} (Baseline: ${hw.baseline_value ?? "—"})`,
        description: hw.severity_rationale,
        badgeText: hw.severity,
        badgeStyle: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
      });
    });

    // 4. Maintenance observations
    observations.forEach((obs) => {
      items.push({
        id: `obs-${obs.id}`,
        category: "maintenance",
        timestamp: obs.inspection_date,
        title: `Maintenance: ${obs.suspected_issue}`,
        subtitle: `Inspector: ${obs.inspector_name}`,
        description: obs.corrective_action ? `Action: ${obs.corrective_action}` : obs.notes || "Inspection recorded.",
        badgeText: obs.status.toUpperCase(),
        badgeStyle: "bg-purple-500/10 text-purple-300 border-purple-500/30",
      });
    });

    // 5. Operating state transitions from telemetry
    let lastState: string | null = null;
    const sortedTelemetry = [...telemetry].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    sortedTelemetry.forEach((t) => {
      if (t.operating_state && t.operating_state !== lastState) {
        items.push({
          id: `state-${t.timestamp}-${t.operating_state}`,
          category: "state",
          timestamp: t.timestamp,
          title: `State Transition: ${t.operating_state.toUpperCase()}`,
          subtitle: `Active Power: ${t.active_power !== null ? `${t.active_power.toFixed(1)} kW` : "—"}`,
          description: `Machine operating state transitioned from ${lastState || "UNKNOWN"} to ${t.operating_state}.`,
          badgeText: t.operating_state.toUpperCase(),
          badgeStyle: t.operating_state === "operating"
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
            : t.operating_state === "idle"
            ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
            : "bg-slate-800 text-slate-400 border-slate-700",
        });
        lastState = t.operating_state;
      }
    });

    // Sort descending (newest first)
    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [telemetry, wastageEvents, alerts, healthWarnings, observations, onAcknowledgeAlert]);

  // Filter items
  const filteredItems = useMemo(() => {
    if (filter === "all") return timelineItems;
    return timelineItems.filter((item) => item.category === filter);
  }, [timelineItems, filter]);

  return (
    <div className="bg-[#0d1424] border border-slate-800/80 rounded-xl p-5 shadow-lg space-y-4">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-sky-400" />
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white font-mono">
              Historical Operational Activity Timeline
            </h2>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Chronological ledger of state transitions, wastage episodes, alerts, and inspections
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800 text-xs font-medium flex-wrap">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
              filter === "all" ? "bg-slate-800 text-white font-semibold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            All ({timelineItems.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("wastage")}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
              filter === "wastage" ? "bg-rose-500/20 text-rose-300 font-semibold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Wastage
          </button>
          <button
            type="button"
            onClick={() => setFilter("alert")}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
              filter === "alert" ? "bg-amber-500/20 text-amber-300 font-semibold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Alerts
          </button>
          <button
            type="button"
            onClick={() => setFilter("health")}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
              filter === "health" ? "bg-cyan-500/20 text-cyan-300 font-semibold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Health
          </button>
          <button
            type="button"
            onClick={() => setFilter("maintenance")}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
              filter === "maintenance" ? "bg-purple-500/20 text-purple-300 font-semibold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Inspections
          </button>
          <button
            type="button"
            onClick={() => setFilter("state")}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
              filter === "state" ? "bg-emerald-500/20 text-emerald-300 font-semibold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            States
          </button>
        </div>
      </div>

      {/* Timeline Stream */}
      {isLoading ? (
        <div className="py-10 text-center text-slate-500 text-xs">
          Loading chronological timeline...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="py-8 text-center text-slate-500 text-xs">
          No activity records found matching this category filter.
        </div>
      ) : (
        <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
          {filteredItems.map((item) => (
            <div key={item.id} className="relative group text-xs">
              {/* Dot icon */}
              <div
                className={`absolute -left-6 top-1 w-3 h-3 rounded-full border-2 border-[#0d1424] ${
                  item.category === "wastage"
                    ? "bg-rose-400"
                    : item.category === "alert"
                    ? "bg-amber-400"
                    : item.category === "health"
                    ? "bg-cyan-400"
                    : item.category === "maintenance"
                    ? "bg-purple-400"
                    : "bg-emerald-400"
                }`}
              />

              {/* Card Container */}
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3.5 hover:border-slate-700 transition-colors space-y-1.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${item.badgeStyle}`}
                    >
                      {item.badgeText}
                    </span>
                    <span className="font-semibold text-white tracking-wide">
                      {item.title}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-slate-400">
                    {formatTimestamp(item.timestamp)} ({formatRelativeTime(item.timestamp)})
                  </span>
                </div>

                {item.subtitle && (
                  <div className="text-[11px] font-mono text-slate-400">
                    {item.subtitle}
                  </div>
                )}

                <p className="text-slate-300 leading-relaxed font-sans">{item.description}</p>

                {item.actionText && item.actionCallback && (
                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={item.actionCallback}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium cursor-pointer"
                    >
                      {item.actionText}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
