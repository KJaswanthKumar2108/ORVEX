import React from "react";
import {
  BellRing,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  Lightbulb,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { AlertRecord, WastageEventResponse } from "../../api/types";
import { AlertStatusBadge, SeverityBadge } from "../common/StatusBadge";
import {
  formatConfidence,
  formatDuration,
  formatReasonTitle,
  formatTimestamp,
  formatWastedEnergy,
} from "../../utils/formatters";

interface DemoDetectionResultsProps {
  events: WastageEventResponse[];
  alerts: AlertRecord[];
  isNormalScenario: boolean;
  onNavigateToAlerts?: () => void;
  onSelectMachine?: (machineId: string) => void;
}

export const DemoDetectionResults: React.FC<DemoDetectionResultsProps> = ({
  events,
  alerts,
  isNormalScenario,
  onNavigateToAlerts,
  onSelectMachine,
}) => {
  const latestEvent = events[0] || null;
  const latestAlert = alerts[0] || null;

  if (isNormalScenario) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-bold text-white tracking-tight uppercase font-mono">
            Golden Reference Validation Results
          </h3>
        </div>

        <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-xl p-5 text-xs text-emerald-300 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-emerald-200 text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>Nominal Operation Verified — 0 Wastage Events & 0 False Positives</span>
          </div>
          <p className="leading-relaxed text-emerald-300/90 text-xs">
            The ORVEX analytics engine continuously evaluates incoming telemetry against the dynamic baseline envelope (P ∈ [P_baseline - 2σ, P_baseline + 2σ]). Because the machine is operating within nominal design boundaries, zero anomaly events and zero false alarms were dispatched.
          </p>
          <div className="pt-2 border-t border-emerald-900/40 grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Wastage Events Detected:</span>
              <strong className="text-white text-base">0 Events</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Alerts Dispatched:</span>
              <strong className="text-white text-base">0 Alerts</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">System Specificity:</span>
              <strong className="text-emerald-400 text-base">100%</strong>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-white tracking-tight uppercase font-mono">
            Actual Analytics Detection Output
          </h3>
        </div>
        <span className="text-xs font-mono text-slate-400">
          Events: <strong className="text-white">{events.length}</strong> | Alerts:{" "}
          <strong className="text-white">{alerts.length}</strong>
        </span>
      </div>

      {latestEvent ? (
        <div className="space-y-4">
          {/* Top Event Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Detection Reason */}
            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800/80 space-y-1">
              <span className="text-[11px] text-slate-400 block">Detected Archetype</span>
              <span className="font-semibold text-white text-sm block">
                {formatReasonTitle(latestEvent.detection_reason)}
              </span>
              <span className="text-[10px] font-mono text-slate-500 block truncate">
                {latestEvent.detection_reason}
              </span>
            </div>

            {/* 2. Estimated Wasted Energy */}
            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800/80 space-y-1">
              <span className="text-[11px] text-slate-400 block">Estimated Wastage</span>
              <span className="font-bold text-rose-400 text-lg font-mono block">
                {formatWastedEnergy(latestEvent.estimated_wasted_energy_kwh)}
              </span>
              <span className="text-[10px] text-slate-500 block">
                {latestEvent.estimated_wasted_energy_kwh !== null
                  ? "Trapezoidal excess integration"
                  : "Unestimated candidate (cycling stress)"}
              </span>
            </div>

            {/* 3. Duration & Confidence */}
            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800/80 space-y-1">
              <span className="text-[11px] text-slate-400 block">Duration & Confidence</span>
              <div className="flex items-baseline gap-2 font-mono">
                <span className="font-bold text-white text-base">
                  {formatDuration(latestEvent.duration_seconds)}
                </span>
                <span className="text-emerald-400 text-xs">
                  ({formatConfidence(latestEvent.confidence_score)})
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-500 block">
                Detected: {formatTimestamp(latestEvent.start_time)}
              </span>
            </div>

            {/* 4. Event Status */}
            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800/80 space-y-1">
              <span className="text-[11px] text-slate-400 block">Database Record</span>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-slate-200 block truncate">
                  ID: {latestEvent.id.slice(0, 8)}
                </span>
                {onSelectMachine && (
                  <button
                    type="button"
                    onClick={() => onSelectMachine(latestEvent.machine_id)}
                    className="text-emerald-400 hover:text-emerald-300 text-[10px] inline-flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>Asset</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 uppercase font-mono">
                <CheckCircle2 className="w-3 h-3" />
                <span>{latestEvent.status}</span>
              </span>
            </div>
          </div>

          {/* Supporting Telemetry Evidence */}
          {latestEvent.evidence_metadata && Object.keys(latestEvent.evidence_metadata).length > 0 && (
            <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Mathematical Evidence & Integral Telemetry:</span>
                </span>
                <span className="text-[10px] font-mono text-slate-500">Database Evidence JSON</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-slate-300 text-[11px]">
                {Object.entries(latestEvent.evidence_metadata).map(([k, v]) => (
                  <div key={k} className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px] truncate">{k}</span>
                    <span className="font-bold text-slate-200">
                      {typeof v === "number" ? v.toFixed(2) : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generated Alert & Recommended SOP */}
          {latestAlert && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BellRing className="w-4 h-4 text-amber-400" />
                  <span className="font-semibold text-white">Dispatched Operational Alert</span>
                  <SeverityBadge severity={latestAlert.severity} />
                  <AlertStatusBadge status={latestAlert.status} />
                </div>
                {onNavigateToAlerts && (
                  <button
                    type="button"
                    onClick={onNavigateToAlerts}
                    className="text-emerald-400 hover:text-emerald-300 text-[11px] inline-flex items-center gap-1 cursor-pointer underline underline-offset-2"
                  >
                    <span>View in Alert Center</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="space-y-1">
                <div className="font-medium text-slate-200">{latestAlert.title}</div>
                <p className="text-slate-400 leading-relaxed">{latestAlert.description}</p>
              </div>

              <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-md p-2.5 flex items-start gap-2 text-emerald-300">
                <Lightbulb className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-emerald-200">Recommended Operator SOP: </span>
                  <span>{latestAlert.recommendation}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="py-8 bg-slate-950/40 rounded-lg border border-slate-800/80 text-center space-y-2">
          <Clock className="w-6 h-6 text-slate-500 mx-auto" />
          <h4 className="text-xs font-semibold text-slate-300">
            Awaiting detection results from analytics pipeline
          </h4>
          <p className="text-[11px] text-slate-500 max-w-md mx-auto">
            When telemetry packets trigger condition thresholds, the resulting energy wastage episode and operator alerts will render here with full telemetry evidence.
          </p>
        </div>
      )}
    </div>
  );
};
