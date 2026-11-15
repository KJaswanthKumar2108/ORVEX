import React, { useState } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  ShieldAlert,
  UserCheck,
  X,
} from "lucide-react";
import type { MachineHealthWarning } from "../../api/types";
import {
  formatRelativeTime,
  formatTimestamp,
} from "../../utils/formatters";

interface MachineHealthWarningsSectionProps {
  warnings: MachineHealthWarning[];
  isLoading: boolean;
  onSelectMachine: (machineId: string) => void;
  onAcknowledgeWarning: (warningId: string, acknowledgedBy: string, notes?: string) => Promise<void>;
  actionInProgressId: string | null;
}

export const MachineHealthWarningsSection: React.FC<MachineHealthWarningsSectionProps> = ({
  warnings,
  isLoading,
  onSelectMachine,
  onAcknowledgeWarning,
  actionInProgressId,
}) => {
  const [selectedWarning, setSelectedWarning] = useState<MachineHealthWarning | null>(null);
  const [showAckModal, setShowAckModal] = useState(false);
  const [ackOperator, setAckOperator] = useState("");
  const [ackNotes, setAckNotes] = useState("");

  const openWarnings = warnings.filter((w) => w.status === "open");
  const ackWarnings = warnings.filter((w) => w.status === "acknowledged");
  const resolvedWarnings = warnings.filter((w) => w.status === "resolved");

  const handleOpenAckModal = (w: MachineHealthWarning) => {
    setSelectedWarning(w);
    setAckOperator("");
    setAckNotes("");
    setShowAckModal(true);
  };

  const handleConfirmAck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWarning || !ackOperator.trim()) return;

    await onAcknowledgeWarning(
      selectedWarning.id,
      ackOperator.trim(),
      ackNotes.trim() || undefined
    );
    setShowAckModal(false);
    setSelectedWarning(null);
  };

  const getSeverityBadge = (severity: string) => {
    const s = severity.toUpperCase();
    if (s === "CRITICAL") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-red-950/60 text-red-300 border border-red-800/80">
          <AlertOctagon className="w-3 h-3 text-red-400" />
          <span>CRITICAL</span>
        </span>
      );
    }
    if (s === "WARNING") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-950/60 text-amber-300 border border-amber-800/80">
          <AlertTriangle className="w-3 h-3 text-amber-400" />
          <span>WARNING</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-sky-950/60 text-sky-300 border border-sky-800/80">
        <Eye className="w-3 h-3 text-sky-400" />
        <span>WATCH</span>
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    if (status === "open") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/30">
          Open
        </span>
      );
    }
    if (status === "acknowledged") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
          Acknowledged
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
        Resolved
      </span>
    );
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm space-y-0">
      {/* Section Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">
              Machine-Health Condition Monitoring Warnings
            </h3>
            {openWarnings.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                {openWarnings.length} Active
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Distinct mechanical degradation and operating anomaly indicators (separate from energy wastage episodes)
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>{openWarnings.length} Open</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>{ackWarnings.length} Acknowledged</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>{resolvedWarnings.length} Resolved</span>
          </span>
        </div>
      </div>

      {/* Warnings Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/80 text-slate-400 font-mono text-[11px] border-b border-slate-800">
            <tr>
              <th className="px-5 py-3.5">Severity & Status</th>
              <th className="px-5 py-3.5">Warning Type & Rationale</th>
              <th className="px-5 py-3.5">Equipment</th>
              <th className="px-5 py-3.5 text-right">Telemetry Variance</th>
              <th className="px-5 py-3.5">Detected Time</th>
              <th className="px-5 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {isLoading && warnings.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-500 font-mono">
                  Loading condition-monitoring health warnings...
                </td>
              </tr>
            ) : warnings.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto mb-2">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <h4 className="text-xs font-semibold text-white">All machine health vectors nominal</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    No vibration, thermal, or electrical stability threshold violations active across the fleet.
                  </p>
                </td>
              </tr>
            ) : (
              warnings.map((w) => (
                <tr key={w.id} className="hover:bg-slate-800/30 transition-colors">
                  {/* Severity & Status */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {getSeverityBadge(w.severity)}
                      {getStatusBadge(w.status)}
                    </div>
                  </td>

                  {/* Warning Type & Rationale */}
                  <td className="px-5 py-3.5">
                    <span className="font-semibold text-slate-200 block">
                      {w.warning_type.replace(/_/g, " ")}
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5 leading-snug line-clamp-2">
                      {w.severity_rationale || w.recommended_action}
                    </span>
                  </td>

                  {/* Machine Link */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onSelectMachine(w.machine_id)}
                      className="text-left group cursor-pointer"
                    >
                      <div className="font-medium text-slate-200 group-hover:text-emerald-400 flex items-center gap-1">
                        <span>{w.machine_id.slice(0, 12)}</span>
                        <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-emerald-400" />
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 block">
                        Conf: {(w.confidence_score * 100).toFixed(0)}%
                      </span>
                    </button>
                  </td>

                  {/* Variance Metrics */}
                  <td className="px-5 py-3.5 text-right whitespace-nowrap font-mono">
                    <div className="text-slate-200 font-semibold">
                      {w.observed_value.toFixed(2)} {w.unit}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      base: {w.baseline_value != null ? w.baseline_value.toFixed(2) : "—"} | thresh:{" "}
                      {w.threshold_value != null ? w.threshold_value.toFixed(2) : "—"}
                    </div>
                  </td>

                  {/* Detected Time */}
                  <td className="px-5 py-3.5 whitespace-nowrap font-mono text-[11px]">
                    <span className="text-slate-300 block">{formatTimestamp(w.detected_at)}</span>
                    <span className="text-[10px] text-slate-500 block">
                      {formatRelativeTime(w.detected_at)}
                    </span>
                  </td>

                  {/* Action */}
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    {w.status === "open" ? (
                      <button
                        type="button"
                        onClick={() => handleOpenAckModal(w)}
                        disabled={actionInProgressId === w.id}
                        className="px-2.5 py-1 rounded bg-amber-600/90 hover:bg-amber-500 text-white text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer shadow-sm inline-flex items-center gap-1"
                      >
                        <UserCheck className="w-3 h-3" />
                        <span>{actionInProgressId === w.id ? "..." : "Acknowledge"}</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-500 font-mono">
                        {w.acknowledged_by ? `Ack: ${w.acknowledged_by}` : w.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Acknowledge Health Warning Modal */}
      {showAckModal && selectedWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-amber-400">
                <ShieldAlert className="w-5 h-5" />
                <h3 className="text-base font-semibold text-white">Acknowledge Health Warning</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAckModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 space-y-1">
                <div className="flex items-center gap-2">
                  {getSeverityBadge(selectedWarning.severity)}
                  <span className="font-semibold text-slate-200">
                    {selectedWarning.warning_type.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="text-slate-400 text-[11px]">
                  Observed: <span className="font-mono text-slate-200">{selectedWarning.observed_value.toFixed(2)} {selectedWarning.unit}</span>
                </div>
              </div>

              <form onSubmit={handleConfirmAck} className="space-y-3 pt-1">
                <div>
                  <label htmlFor="inspector-name" className="block text-[11px] font-medium text-slate-400 mb-1">
                    Acknowledging Inspector / Reliability Engineer <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="inspector-name"
                    type="text"
                    required
                    placeholder="e.g. Chief Inspector Smith"
                    value={ackOperator}
                    onChange={(e) => setAckOperator(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label htmlFor="warning-notes" className="block text-[11px] font-medium text-slate-400 mb-1">
                    Operational or Diagnostic Notes (Optional)
                  </label>
                  <textarea
                    id="warning-notes"
                    placeholder="e.g. Scheduled vibration re-measurement during shift change..."
                    value={ackNotes}
                    onChange={(e) => setAckNotes(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-950 border border-slate-800 rounded-md p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAckModal(false)}
                    className="px-3.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!ackOperator.trim() || actionInProgressId === selectedWarning.id}
                    className="px-3.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    {actionInProgressId === selectedWarning.id ? "Acknowledging..." : "Confirm Acknowledge"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
