import React, { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Filter,
  ShieldAlert,
  X,
} from "lucide-react";
import type { HealthSeverity, MachineHealthWarning } from "../../api/types";
import { formatTimestamp } from "../../utils/formatters";

interface WarningInvestigationListProps {
  warnings: MachineHealthWarning[];
  onAcknowledge: (warningId: string, technician: string, notes?: string) => Promise<void>;
  isLoading?: boolean;
}

export const WarningInvestigationList: React.FC<WarningInvestigationListProps> = ({
  warnings,
  onAcknowledge,
  isLoading = false,
}) => {
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [expandedWarningId, setExpandedWarningId] = useState<string | null>(null);

  // Acknowledgment Modal State
  const [ackWarning, setAckWarning] = useState<MachineHealthWarning | null>(null);
  const [technicianName, setTechnicianName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const filteredWarnings = warnings.filter((w) => {
    if (severityFilter === "ALL") return true;
    return w.severity === severityFilter;
  });

  const getSeverityBadge = (severity: HealthSeverity) => {
    switch (severity) {
      case "CRITICAL":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40">
            Critical
          </span>
        );
      case "WARNING":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider bg-orange-500/20 text-orange-300 border border-orange-500/40">
            Warning
          </span>
        );
      case "WATCH":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
            Watch
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider bg-slate-500/20 text-slate-300 border border-slate-500/40">
            Normal
          </span>
        );
    }
  };

  const handleOpenAckModal = (warning: MachineHealthWarning) => {
    setAckWarning(warning);
    setTechnicianName("");
    setNotes("");
  };

  const handleCloseAckModal = () => {
    setAckWarning(null);
    setTechnicianName("");
    setNotes("");
  };

  const handleSubmitAck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ackWarning || !technicianName.trim()) return;

    setIsSubmitting(true);
    try {
      await onAcknowledge(ackWarning.id, technicianName.trim(), notes.trim() || undefined);
      handleCloseAckModal();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to acknowledge warning.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-[#0d1424] border border-slate-800/80 rounded-xl p-5 shadow-lg space-y-4">
      {/* Header & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white font-mono">
              Active Condition Warnings
            </h2>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Evidence-based operational alerts evaluated against historical baseline and engineering thresholds
            </p>
          </div>
        </div>

        {/* Severity Filter Tabs */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
          <Filter className="w-3 h-3 text-slate-500 ml-1.5 mr-0.5" />
          {(["ALL", "CRITICAL", "WARNING", "WATCH"] as const).map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverityFilter(sev)}
              className={`px-2.5 py-1 rounded transition-colors text-[11px] cursor-pointer ${
                severityFilter === sev
                  ? "bg-slate-800 text-cyan-400 font-bold shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      {/* Warnings List */}
      {isLoading ? (
        <div className="py-12 text-center text-slate-500 text-xs font-mono">
          Loading active condition warnings...
        </div>
      ) : filteredWarnings.length === 0 ? (
        <div className="text-center py-10 bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-slate-400 space-y-1">
          <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
          <p className="text-xs font-medium text-slate-300 font-mono">No Active Condition Warnings</p>
          <p className="text-[11px] text-slate-500 font-sans">
            Operating parameters are within normal baseline tolerances for the selected filter.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredWarnings.map((w) => {
            const isExpanded = expandedWarningId === w.id;
            return (
              <div
                key={w.id}
                className="bg-slate-950/70 rounded-xl border border-slate-800/80 overflow-hidden hover:border-slate-700/80 transition"
              >
                {/* Warning Summary Row */}
                <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => setExpandedWarningId(isExpanded ? null : w.id)}
                      className="mt-0.5 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                      title={isExpanded ? "Collapse dossier" : "Expand telemetry evidence"}
                      aria-label="Toggle warning details"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-white text-xs">
                          {w.warning_type}
                        </span>
                        {getSeverityBadge(w.severity)}
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                          {w.status.toUpperCase()}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {formatTimestamp(w.detected_at)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed font-sans">
                        {w.severity_rationale}
                      </p>
                    </div>
                  </div>

                  {/* Actions & Metrics */}
                  <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
                    <div className="flex items-center gap-3 text-right font-mono text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Observed</span>
                        <span className="font-bold text-amber-300">
                          {w.observed_value.toFixed(2)} {w.unit}
                        </span>
                      </div>
                      <div className="hidden sm:block text-slate-700">|</div>
                      <div className="hidden sm:block">
                        <span className="text-[10px] text-slate-500 block uppercase">Baseline</span>
                        <span className="text-slate-300">
                          {w.baseline_value != null ? `${w.baseline_value.toFixed(2)} ${w.unit}` : "—"}
                        </span>
                      </div>
                      <div className="hidden sm:block text-slate-700">|</div>
                      <div className="hidden sm:block">
                        <span className="text-[10px] text-slate-500 block uppercase">Threshold</span>
                        <span className="text-rose-400">
                          {w.threshold_value != null ? `${w.threshold_value.toFixed(2)} ${w.unit}` : "—"}
                        </span>
                      </div>
                    </div>

                    {w.status === "open" ? (
                      <button
                        type="button"
                        onClick={() => handleOpenAckModal(w)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 text-xs font-mono font-medium rounded-lg border border-slate-700 transition cursor-pointer flex items-center gap-1.5"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        <span>Acknowledge</span>
                      </button>
                    ) : (
                      <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" /> Acknowledged
                      </span>
                    )}
                  </div>
                </div>

                {/* Recommended Action Bar */}
                <div className="px-4 py-2.5 bg-slate-900/60 border-t border-slate-800/80 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-start sm:items-center gap-2">
                    <span className="text-cyan-400 font-mono font-bold text-[11px] uppercase tracking-wider shrink-0">
                      Standard Operating Procedure:
                    </span>
                    <span className="text-slate-300 font-sans leading-relaxed">
                      {w.recommended_action}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono shrink-0">
                    Confidence: {(w.confidence_score * 100).toFixed(0)}% ({w.data_quality})
                  </span>
                </div>

                {/* Expandable Telemetry Evidence Drawer */}
                {isExpanded && (
                  <div className="p-4 bg-slate-950 border-t border-slate-800/90 text-xs space-y-3">
                    <div className="font-mono text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-cyan-400" />
                      Detailed Telemetry Evidence Context
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
                      {Object.entries(w.telemetry_evidence || {}).map(([key, val]) => (
                        <div key={key} className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                          <span className="text-[10px] text-slate-500 uppercase block truncate">
                            {key.replace(/_/g, " ")}
                          </span>
                          <span className="font-bold text-slate-200 mt-0.5 block">
                            {typeof val === "number" ? val.toFixed(2) : String(val)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="text-[11px] text-slate-400 font-mono pt-1">
                      Evaluation Window: {formatTimestamp(w.window_start)} → {formatTimestamp(w.window_end)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Acknowledge Warning Modal */}
      {ackWarning && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d1424] border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white font-mono">
                  Acknowledge Condition Warning
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseAckModal}
                className="text-slate-400 hover:text-white transition cursor-pointer"
                aria-label="Close acknowledge modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono space-y-1">
              <div className="text-slate-400">
                Warning: <span className="text-white font-bold">{ackWarning.warning_type}</span>
              </div>
              <div className="text-slate-400">
                Machine: <span className="text-cyan-300">{ackWarning.machine_name}</span>
              </div>
              <div className="text-slate-500 text-[11px] pt-1">
                {ackWarning.severity_rationale}
              </div>
            </div>

            <form onSubmit={handleSubmitAck} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-mono mb-1">
                  Technician / Engineer Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Morgan (Electrical Tech)"
                  value={technicianName}
                  onChange={(e) => setTechnicianName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-mono mb-1">
                  Acknowledgment Notes / Actions Taken
                </label>
                <textarea
                  rows={3}
                  placeholder="Document immediate checks, dispatch tickets, or verification findings..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseAckModal}
                  className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !technicianName.trim()}
                  className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? "Confirming..." : "Confirm Acknowledgment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
