import React from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  HeartPulse,
  Radio,
  Repeat,
  ShieldCheck,
} from "lucide-react";
import type {
  AlertRecord,
  MachineHealthWarning,
  MachineSummaryResponse,
  PatternAnalysisResponse,
} from "../../api/types";
import { formatRelativeTime } from "../../utils/formatters";

interface AttentionItem {
  id: string;
  machineId: string;
  machineName: string;
  machineIdentifier: string;
  issueType: "ALERT" | "CONDITION_WARNING" | "RECURRING_PATTERN" | "TELEMETRY_LOSS";
  severity: "critical" | "warning" | "watch" | "stale";
  detectedAt: string;
  title: string;
  evidence: string;
  recommendedAction?: string;
  navigationTarget: "machine" | "alerts" | "health";
}

interface AttentionRequiredPanelProps {
  alerts: AlertRecord[];
  healthWarnings: MachineHealthWarning[];
  machines: MachineSummaryResponse[];
  patterns?: PatternAnalysisResponse | null;
  onSelectMachine: (machineId: string) => void;
  onNavigateToAlerts?: () => void;
  onAcknowledgeAlert?: (alertId: string) => Promise<void>;
  isLoading?: boolean;
}

export const AttentionRequiredPanel: React.FC<AttentionRequiredPanelProps> = ({
  alerts,
  healthWarnings,
  machines,
  patterns,
  onSelectMachine,
  onNavigateToAlerts,
  onAcknowledgeAlert,
  isLoading = false,
}) => {
  // Machine names map for quick resolution
  const machineMap = React.useMemo(() => {
    const map = new Map<string, { name: string; identifier: string }>();
    machines.forEach((m) => {
      map.set(m.id, { name: m.name, identifier: m.machine_identifier });
    });
    return map;
  }, [machines]);

  // Aggregate prioritized attention items
  const attentionItems: AttentionItem[] = React.useMemo(() => {
    const items: AttentionItem[] = [];
    const seenKeys = new Set<string>();

    // 1. High-severity energy alerts (critical / high)
    alerts
      .filter((a) => a.status === "open" && (a.severity === "critical" || a.severity === "high"))
      .forEach((a) => {
        const mInfo = a.machine_id ? machineMap.get(a.machine_id) : undefined;
        const key = `alert-${a.id}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          items.push({
            id: a.id,
            machineId: a.machine_id || "",
            machineName: mInfo?.name || a.machine_name || "Unknown Asset",
            machineIdentifier: mInfo?.identifier || a.machine_identifier || "—",
            issueType: "ALERT",
            severity: a.severity === "critical" ? "critical" : "warning",
            detectedAt: a.occurred_at,
            title: a.title,
            evidence: a.description,
            recommendedAction: a.recommendation,
            navigationTarget: "alerts",
          });
        }
      });

    // 2. Machine health warnings (CRITICAL / WARNING)
    healthWarnings
      .filter((w) => w.status === "open" && (w.severity === "CRITICAL" || w.severity === "WARNING"))
      .forEach((w) => {
        const mInfo = machineMap.get(w.machine_id);
        const key = `health-${w.id}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          items.push({
            id: w.id,
            machineId: w.machine_id,
            machineName: mInfo?.name || w.machine_name || "Unknown Asset",
            machineIdentifier: mInfo?.identifier || "—",
            issueType: "CONDITION_WARNING",
            severity: w.severity.toLowerCase() as "critical" | "warning",
            detectedAt: w.detected_at,
            title: w.warning_type.replace(/_/g, " "),
            evidence: w.severity_rationale,
            recommendedAction: w.recommended_action,
            navigationTarget: "machine",
          });
        }
      });

    // 3. Stale or missing telemetry streams
    machines
      .filter((m) => m.telemetry_freshness === "stale" || m.telemetry_freshness === "missing")
      .forEach((m) => {
        const key = `telemetry-${m.id}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          const isStale = m.telemetry_freshness === "stale";
          items.push({
            id: m.id,
            machineId: m.id,
            machineName: m.name,
            machineIdentifier: m.machine_identifier,
            issueType: "TELEMETRY_LOSS",
            severity: isStale ? "warning" : "stale",
            detectedAt: m.latest_telemetry_timestamp || new Date().toISOString(),
            title: isStale ? "Stale Telemetry Stream" : "No Telemetry Ingestion",
            evidence: isStale
              ? `Telemetry stream stalled. Last sample received ${formatRelativeTime(m.latest_telemetry_timestamp)}.`
              : "No telemetry records ingested from sensor gateway.",
            recommendedAction: "Inspect MQTT gateway broker, CT clamp power meter wiring, and WiFi/Ethernet gateway.",
            navigationTarget: "machine",
          });
        }
      });

    // 4. Repeated wastage patterns (if available)
    if (patterns?.patterns) {
      patterns.patterns.forEach((p, idx) => {
        if (p.affected_machine_names.length > 0 && p.total_event_count >= 2) {
          const key = `pattern-${p.pattern_type}-${idx}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            items.push({
              id: `pattern-${idx}`,
              machineId: "",
              machineName: p.affected_machine_names.join(", "),
              machineIdentifier: p.pattern_type,
              issueType: "RECURRING_PATTERN",
              severity: "watch",
              detectedAt: patterns.generated_at,
              title: p.pattern_name,
              evidence: `${p.total_event_count} recurrence episodes (${p.recurrence_rate_events_per_day.toFixed(1)}/day). ${p.description}`,
              recommendedAction: p.recommended_countermeasure,
              navigationTarget: "alerts",
            });
          }
        }
      });
    }

    // Sort order: critical first, then warning, then stale, then watch
    const priorityWeight: Record<string, number> = {
      critical: 4,
      warning: 3,
      stale: 2,
      watch: 1,
    };

    return items.sort((a, b) => {
      const weightA = priorityWeight[a.severity] || 0;
      const weightB = priorityWeight[b.severity] || 0;
      if (weightA !== weightB) {
        return weightB - weightA;
      }
      return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
    });
  }, [alerts, healthWarnings, machines, patterns, machineMap]);

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-white tracking-wide">
              Attention Required
            </h3>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-mono font-bold ${
                attentionItems.length > 0
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
              }`}
            >
              {attentionItems.length}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Prioritized industrial triage: unresolved anomalies, health warnings, and signal faults
          </p>
        </div>

        {onNavigateToAlerts && (
          <button
            type="button"
            onClick={onNavigateToAlerts}
            className="text-xs text-emerald-400 hover:text-emerald-300 underline cursor-pointer hidden sm:block"
          >
            View All In-App Alerts →
          </button>
        )}
      </div>

      {/* Triage List */}
      {isLoading && attentionItems.length === 0 ? (
        <div className="py-8 text-center text-xs font-mono text-slate-500">
          Evaluating fleet condition and alert queue...
        </div>
      ) : attentionItems.length === 0 ? (
        <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-lg">
          <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-200">
            Fleet Operating Nominally
          </p>
          <p className="text-slate-500 text-xs mt-1 max-w-md mx-auto">
            Zero high-severity alerts, thermal warnings, or telemetry losses detected across monitored assets.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {attentionItems.map((item) => {
            const isCritical = item.severity === "critical";
            const isWarning = item.severity === "warning";
            const isStale = item.severity === "stale";

            const severityBadge = isCritical ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 uppercase">
                CRITICAL
              </span>
            ) : isWarning ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase">
                WARNING
              </span>
            ) : isStale ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700 uppercase">
                STALE SIGNAL
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 uppercase">
                WATCH
              </span>
            );

            const icon =
              item.issueType === "ALERT" ? (
                <Bell className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              ) : item.issueType === "CONDITION_WARNING" ? (
                <HeartPulse className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              ) : item.issueType === "TELEMETRY_LOSS" ? (
                <Radio className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              ) : (
                <Repeat className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              );

            return (
              <div
                key={item.id}
                className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800/90 hover:border-slate-700 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-3"
              >
                {/* Info */}
                <div className="flex items-start gap-3">
                  {icon}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-xs text-white">
                        {item.title}
                      </span>
                      {severityBadge}
                      <span className="text-[11px] font-mono text-slate-400">
                        {formatRelativeTime(item.detectedAt)}
                      </span>
                    </div>

                    <div className="text-xs text-slate-300 font-mono">
                      Asset: <span className="text-emerald-400 font-bold">{item.machineName}</span>
                      {item.machineIdentifier && item.machineIdentifier !== "—" && (
                        <span className="text-slate-500 ml-1">({item.machineIdentifier})</span>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                      {item.evidence}
                    </p>

                    {item.recommendedAction && (
                      <p className="text-[11px] text-slate-500 italic">
                        Action: {item.recommendedAction}
                      </p>
                    )}
                  </div>
                </div>

                {/* Direct CTA Button */}
                <div className="shrink-0 self-end sm:self-center flex items-center gap-2">
                  {item.issueType === "ALERT" && onAcknowledgeAlert && (
                    <button
                      type="button"
                      onClick={() => onAcknowledgeAlert(item.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-medium transition-colors cursor-pointer shadow-sm"
                    >
                      <span>Acknowledge</span>
                    </button>
                  )}
                  {item.machineId ? (
                    <button
                      type="button"
                      onClick={() => onSelectMachine(item.machineId)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-colors cursor-pointer border border-slate-700"
                    >
                      <span>Inspect Asset</span>
                      <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                    </button>
                  ) : onNavigateToAlerts ? (
                    <button
                      type="button"
                      onClick={onNavigateToAlerts}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-colors cursor-pointer border border-slate-700"
                    >
                      <span>Review Details</span>
                      <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
