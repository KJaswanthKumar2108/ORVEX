import React, { useEffect, useState } from "react";
import {
  Clock,
  ExternalLink,
  Lightbulb,
  X,
  Zap,
} from "lucide-react";
import { endpoints } from "../../api/endpoints";
import type { AlertRecord, WastageEventResponse } from "../../api/types";
import { AlertStatusBadge, SeverityBadge } from "../common/StatusBadge";
import {
  formatConfidence,
  formatDuration,
  formatReasonTitle,
  formatRelativeTime,
  formatTimestamp,
  formatWastedEnergy,
} from "../../utils/formatters";

interface AlertDetailModalProps {
  alert: AlertRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectMachine: (machineId: string) => void;
  onAcknowledgeClick: (alert: AlertRecord) => void;
  onResolveClick: (alert: AlertRecord) => void;
  onDismissClick: (alert: AlertRecord) => void;
}

export const AlertDetailModal: React.FC<AlertDetailModalProps> = ({
  alert,
  isOpen,
  onClose,
  onSelectMachine,
  onAcknowledgeClick,
  onResolveClick,
  onDismissClick,
}) => {
  const [eventData, setEventData] = useState<WastageEventResponse | null>(null);
  const [isLoadingEvent, setIsLoadingEvent] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !alert) {
      setEventData(null);
      setEventError(null);
      return;
    }

    if (alert.event_id) {
      let isMounted = true;
      setIsLoadingEvent(true);
      setEventError(null);

      endpoints
        .getWastageEvent(alert.event_id)
        .then((res) => {
          if (isMounted) setEventData(res);
        })
        .catch((err) => {
          if (isMounted) {
            setEventError(err?.message || "Failed to load linked event telemetry");
          }
        })
        .finally(() => {
          if (isMounted) setIsLoadingEvent(false);
        });

      return () => {
        isMounted = false;
      };
    } else {
      setEventData(null);
    }
  }, [alert?.id, alert?.event_id, isOpen]);

  if (!isOpen || !alert) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <SeverityBadge severity={alert.severity} />
            <AlertStatusBadge status={alert.status} />
            <span className="font-mono text-xs text-slate-400">ID: {alert.id.slice(0, 8)}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
          {/* Title & Core Overview */}
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">{alert.title}</h3>
            <p className="mt-1.5 text-xs text-slate-300 leading-relaxed">{alert.description}</p>
          </div>

          {/* Machine & Context Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80">
            <div>
              <span className="text-[11px] text-slate-400 block">Monitored Equipment</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-semibold text-slate-100">
                  {alert.machine_name || alert.machine_identifier || "Unknown Machine"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSelectMachine(alert.machine_id);
                  }}
                  className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 font-medium text-[11px] underline underline-offset-2 cursor-pointer"
                >
                  <span>View Machine</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
              <span className="text-[11px] font-mono text-slate-500 block mt-0.5">
                ID: {alert.machine_id}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 block">Detection Archetype</span>
              <span className="font-semibold text-slate-100 mt-1 block">
                {formatReasonTitle(alert.alert_type)}
              </span>
              <span className="text-[11px] font-mono text-slate-500 block mt-0.5">
                Type: {alert.alert_type}
              </span>
            </div>
          </div>

          {/* Recommended SOP Action */}
          <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-lg p-3.5 space-y-1">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <Lightbulb className="w-4 h-4" />
              <span>Recommended Operational Protocol</span>
            </div>
            <p className="text-emerald-200/90 text-xs leading-relaxed pt-1">
              {alert.recommendation}
            </p>
          </div>

          {/* Linked Wastage Episode Evidence */}
          <div className="border border-slate-800 rounded-lg p-4 bg-slate-950/40 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <h4 className="font-semibold text-white">Linked Wastage Episode Evidence</h4>
              </div>
              {alert.event_id ? (
                <span className="font-mono text-[11px] text-slate-400">
                  Event: {alert.event_id.slice(0, 8)}
                </span>
              ) : (
                <span className="text-[11px] text-slate-500 italic">No linked event record</span>
              )}
            </div>

            {isLoadingEvent ? (
              <div className="py-4 text-center text-slate-500 font-mono text-[11px]">
                Loading linked wastage telemetry and integral proof...
              </div>
            ) : eventError ? (
              <div className="py-2 text-rose-400 text-xs">
                {eventError}
              </div>
            ) : eventData ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                      Estimated Wastage
                    </span>
                    <span className="text-sm font-bold font-mono text-rose-400 mt-1 block">
                      {formatWastedEnergy(eventData.estimated_wasted_energy_kwh)}
                    </span>
                  </div>

                  <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                      Duration
                    </span>
                    <span className="text-sm font-bold font-mono text-white mt-1 block">
                      {formatDuration(eventData.duration_seconds)}
                    </span>
                  </div>

                  <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                      Algorithmic Confidence
                    </span>
                    <span className="text-sm font-bold font-mono text-emerald-400 mt-1 block">
                      {formatConfidence(eventData.confidence_score)}
                    </span>
                  </div>
                </div>

                {/* Evidence metadata details */}
                {eventData.evidence_metadata && Object.keys(eventData.evidence_metadata).length > 0 && (
                  <div className="bg-slate-900/60 p-3 rounded border border-slate-800/80 text-[11px]">
                    <span className="font-semibold text-slate-300 block mb-1">
                      Integral Telemetry Measurements:
                    </span>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-slate-400">
                      {Object.entries(eventData.evidence_metadata).map(([k, v]) => (
                        <div key={k} className="flex justify-between py-0.5 border-b border-slate-800/50">
                          <span className="text-slate-500">{k}:</span>
                          <span className="text-slate-200">
                            {typeof v === "number" ? v.toFixed(2) : String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-slate-400 text-xs py-1">
                This alert was dispatched from telemetry threshold monitoring without a persisted trapezoidal episode record.
              </p>
            )}
          </div>

          {/* Audit Lifecycle Timeline */}
          <div className="border border-slate-800 rounded-lg p-4 bg-slate-950/40 space-y-3">
            <div className="flex items-center gap-2 text-slate-200 font-semibold pb-1 border-b border-slate-800/80">
              <Clock className="w-4 h-4 text-sky-400" />
              <span>Lifecycle & Audit Trail</span>
            </div>

            <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
              {/* Event Detected */}
              <div className="relative">
                <div className="absolute -left-[22px] top-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-4 ring-slate-900" />
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-200">Event Detected & Logged</span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {formatTimestamp(alert.occurred_at)}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">
                  {formatRelativeTime(alert.occurred_at)}
                </span>
              </div>

              {/* Alert Dispatched */}
              <div className="relative">
                <div className="absolute -left-[22px] top-1 w-2.5 h-2.5 rounded-full bg-sky-500 ring-4 ring-slate-900" />
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-200">Alert Dispatched to Operators</span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {formatTimestamp(alert.created_at)}
                  </span>
                </div>
              </div>

              {/* Resolved / Closed (if applicable) */}
              {alert.resolved_at && (
                <div className="relative">
                  <div className="absolute -left-[22px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-slate-900" />
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-emerald-300">Resolved & Closed</span>
                    <span className="font-mono text-[11px] text-emerald-400">
                      {formatTimestamp(alert.resolved_at)}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {formatRelativeTime(alert.resolved_at)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2">
            {alert.status === "open" && (
              <button
                type="button"
                onClick={() => onAcknowledgeClick(alert)}
                className="px-3.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors cursor-pointer shadow-sm"
              >
                Acknowledge
              </button>
            )}

            {(alert.status === "open" || alert.status === "acknowledged") && (
              <button
                type="button"
                onClick={() => onResolveClick(alert)}
                className="px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors cursor-pointer shadow-sm"
              >
                Resolve Alert
              </button>
            )}

            {alert.status !== "dismissed" && alert.status !== "resolved" && (
              <button
                type="button"
                onClick={() => onDismissClick(alert)}
                className="px-3.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
              >
                Dismiss
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
