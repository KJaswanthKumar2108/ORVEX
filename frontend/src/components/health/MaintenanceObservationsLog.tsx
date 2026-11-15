import React, { useState } from "react";
import {
  ClipboardList,
  FilePlus,
  Plus,
  User,
  Wrench,
  X,
} from "lucide-react";
import type {
  MachineHealthWarning,
  MaintenanceObservation,
  MaintenanceObservationCreate,
} from "../../api/types";
import { formatTimestamp } from "../../utils/formatters";

interface MaintenanceObservationsLogProps {
  observations: MaintenanceObservation[];
  machineId: string;
  activeWarnings?: MachineHealthWarning[];
  onCreateObservation: (payload: MaintenanceObservationCreate) => Promise<void>;
  isLoading?: boolean;
}

export const MaintenanceObservationsLog: React.FC<MaintenanceObservationsLogProps> = ({
  observations,
  machineId,
  activeWarnings = [],
  onCreateObservation,
  isLoading = false,
}) => {
  const [showModal, setShowModal] = useState<boolean>(false);
  const [inspectorName, setInspectorName] = useState<string>("");
  const [suspectedIssue, setSuspectedIssue] = useState<string>("");
  const [correctiveAction, setCorrectiveAction] = useState<string>("");
  const [status, setStatus] = useState<"open" | "acknowledged" | "resolved">("resolved");
  const [notes, setNotes] = useState<string>("");
  const [linkedWarningId, setLinkedWarningId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleOpenModal = () => {
    setShowModal(true);
    setInspectorName("");
    setSuspectedIssue("");
    setCorrectiveAction("");
    setStatus("resolved");
    setNotes("");
    setLinkedWarningId("");
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!machineId || !inspectorName.trim() || !suspectedIssue.trim()) return;

    setIsSubmitting(true);
    try {
      const payload: MaintenanceObservationCreate = {
        machine_id: machineId,
        inspector_name: inspectorName.trim(),
        inspection_date: new Date().toISOString(),
        suspected_issue: suspectedIssue.trim(),
        corrective_action: correctiveAction.trim() || null,
        status: status,
        notes: notes.trim() || null,
        warning_id: linkedWarningId || null,
      };

      await onCreateObservation(payload);
      handleCloseModal();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to record maintenance observation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case "resolved":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            Resolved
          </span>
        );
      case "acknowledged":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/10 text-sky-400 border border-sky-500/30">
            Acknowledged
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            Open
          </span>
        );
    }
  };

  return (
    <div className="bg-[#0d1424] border border-slate-800/80 rounded-xl p-5 shadow-lg space-y-4">
      {/* Header & Log Action Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <ClipboardList className="w-4 h-4 text-cyan-400" />
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white font-mono">
              Maintenance Observations & Inspection History
            </h2>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Empirical technician findings verifying electrical and mechanical operating conditions
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenModal}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold rounded-lg transition shadow cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Log Inspection Observation</span>
        </button>
      </div>

      {/* Observations Ledger */}
      {isLoading ? (
        <div className="py-12 text-center text-slate-500 text-xs font-mono">
          Loading maintenance inspection ledger...
        </div>
      ) : observations.length === 0 ? (
        <div className="text-center py-10 bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-slate-400 space-y-1">
          <Wrench className="w-6 h-6 text-slate-500 mx-auto mb-1" />
          <p className="text-xs font-medium text-slate-300 font-mono">No Inspection Records Logged</p>
          <p className="text-[11px] text-slate-500 font-sans">
            Use the "Log Inspection Observation" button above to document physical checks, bearing greasing, or bolt torquing.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {observations.map((obs) => (
            <div
              key={obs.id}
              className="bg-slate-950/70 p-4 rounded-xl border border-slate-800/80 hover:border-slate-700/80 transition space-y-2.5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-white font-mono flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-cyan-400" />
                    {obs.inspector_name}
                  </span>
                  {getStatusBadge(obs.status)}
                  <span className="text-[11px] text-slate-500 font-mono">
                    {formatTimestamp(obs.inspection_date)}
                  </span>
                </div>
                {obs.warning_id && (
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/60 self-start sm:self-auto">
                    Linked: {obs.warning_id}
                  </span>
                )}
              </div>

              <div className="space-y-1 text-xs">
                <div>
                  <span className="text-slate-500 font-mono text-[11px] block">Suspected Issue:</span>
                  <span className="text-slate-200 font-medium font-sans">
                    {obs.suspected_issue}
                  </span>
                </div>

                {obs.corrective_action && (
                  <div>
                    <span className="text-slate-500 font-mono text-[11px] block">Corrective Action Taken:</span>
                    <span className="text-emerald-300 font-sans">
                      {obs.corrective_action}
                    </span>
                  </div>
                )}

                {obs.notes && (
                  <p className="text-[11px] text-slate-400 italic bg-slate-900/80 p-2 rounded border border-slate-800/60 mt-1 font-sans">
                    {obs.notes}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Observation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d1424] border border-slate-700 rounded-xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FilePlus className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white font-mono">
                  Log Equipment Maintenance Observation
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-white transition cursor-pointer"
                aria-label="Close observation modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-mono mb-1">
                  Inspector Name / Title <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sarah Miller (Reliability Tech)"
                  value={inspectorName}
                  onChange={(e) => setInspectorName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-mono mb-1">
                  Suspected Issue / Anomaly <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Belt slip and elevated drive friction"
                  value={suspectedIssue}
                  onChange={(e) => setSuspectedIssue(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-mono mb-1">
                  Corrective Action Executed
                </label>
                <input
                  type="text"
                  placeholder="e.g. Retensioned V-belts"
                  value={correctiveAction}
                  onChange={(e) => setCorrectiveAction(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-mono mb-1">Resolution Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as "open" | "acknowledged" | "resolved")}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-white focus:outline-none focus:border-cyan-500 font-mono"
                  >
                    <option value="resolved">Resolved</option>
                    <option value="acknowledged">Acknowledged</option>
                    <option value="open">Open</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-mono mb-1">Link Active Warning</label>
                  <select
                    value={linkedWarningId}
                    onChange={(e) => setLinkedWarningId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-white focus:outline-none focus:border-cyan-500 font-mono"
                  >
                    <option value="">None (General Inspection)</option>
                    {activeWarnings.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.warning_type} ({w.severity})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-mono mb-1">Inspection Notes / Measurement Findings</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Belt temperature cooled from 68°C to 44°C after retensioning..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !inspectorName.trim() || !suspectedIssue.trim()}
                  className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : "Save Observation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
