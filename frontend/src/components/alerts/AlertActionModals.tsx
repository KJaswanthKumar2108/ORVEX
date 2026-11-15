import React, { useState } from "react";
import { AlertCircle, CheckCircle, Info, ShieldAlert, X } from "lucide-react";
import type { AlertRecord } from "../../api/types";
import { SeverityBadge } from "../common/StatusBadge";

interface AcknowledgeModalProps {
  alert: AlertRecord | null;
  isOpen: boolean;
  isLoading: boolean;
  onConfirm: (alertId: string, comment?: string) => Promise<void>;
  onClose: () => void;
}

export const AcknowledgeModal: React.FC<AcknowledgeModalProps> = ({
  alert,
  isOpen,
  isLoading,
  onConfirm,
  onClose,
}) => {
  const [comment, setComment] = useState("");

  if (!isOpen || !alert) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm(alert.id, comment.trim() || undefined);
    setComment("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-amber-400">
            <Info className="w-5 h-5" />
            <h3 className="text-base font-semibold text-white">Acknowledge Alert</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 space-y-1.5">
            <div className="flex items-center gap-2">
              <SeverityBadge severity={alert.severity} />
              <span className="font-semibold text-slate-200">{alert.title}</span>
            </div>
            <div className="text-slate-400 text-[11px]">
              Asset: <span className="text-slate-300 font-mono">{alert.machine_name || alert.machine_identifier || alert.machine_id}</span>
            </div>
          </div>

          <p className="text-slate-300">
            Acknowledging signals to shift operators and dispatchers that this condition is being reviewed.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3 pt-2">
            <div>
              <label htmlFor="ack-comment" className="block text-[11px] font-medium text-slate-400 mb-1">
                Triage Notes or Assigned Operator (Optional)
              </label>
              <input
                id="ack-comment"
                type="text"
                placeholder="e.g. Assigned to John Doe for electrical inspection..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                disabled={isLoading}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-3.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-3.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                {isLoading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>Acknowledging...</span>
                  </>
                ) : (
                  <span>Confirm Acknowledge</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

interface ResolveModalProps {
  alert: AlertRecord | null;
  isOpen: boolean;
  isLoading: boolean;
  onConfirm: (alertId: string, notes?: string) => Promise<void>;
  onClose: () => void;
}

export const ResolveModal: React.FC<ResolveModalProps> = ({
  alert,
  isOpen,
  isLoading,
  onConfirm,
  onClose,
}) => {
  const [notes, setNotes] = useState("");

  if (!isOpen || !alert) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm(alert.id, notes.trim() || undefined);
    setNotes("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle className="w-5 h-5" />
            <h3 className="text-base font-semibold text-white">Resolve Alert</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 space-y-1.5">
            <div className="flex items-center gap-2">
              <SeverityBadge severity={alert.severity} />
              <span className="font-semibold text-slate-200">{alert.title}</span>
            </div>
            <div className="text-slate-400 text-[11px]">
              Asset: <span className="text-slate-300 font-mono">{alert.machine_name || alert.machine_identifier || alert.machine_id}</span>
            </div>
          </div>

          <p className="text-slate-300">
            Record the corrective maintenance or operational protocol applied to eliminate this wastage episode.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3 pt-2">
            <div>
              <label htmlFor="resolve-notes" className="block text-[11px] font-medium text-slate-400 mb-1">
                Resolution & Corrective Action Summary
              </label>
              <textarea
                id="resolve-notes"
                placeholder="e.g. Idle protocol enforced; primary feeder shut down after conveyor cleared."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isLoading}
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-md p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-3.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                {isLoading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>Resolving...</span>
                  </>
                ) : (
                  <span>Mark Resolved</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

interface DismissModalProps {
  alert: AlertRecord | null;
  isOpen: boolean;
  isLoading: boolean;
  onConfirm: (alertId: string) => Promise<void>;
  onClose: () => void;
}

export const DismissModal: React.FC<DismissModalProps> = ({
  alert,
  isOpen,
  isLoading,
  onConfirm,
  onClose,
}) => {
  if (!isOpen || !alert) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm(alert.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-rose-400">
            <AlertCircle className="w-5 h-5" />
            <h3 className="text-base font-semibold text-white">Dismiss Alert</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 space-y-1.5">
            <div className="flex items-center gap-2">
              <SeverityBadge severity={alert.severity} />
              <span className="font-semibold text-slate-200">{alert.title}</span>
            </div>
            <div className="text-slate-400 text-[11px]">
              Asset: <span className="text-slate-300 font-mono">{alert.machine_name || alert.machine_identifier || alert.machine_id}</span>
            </div>
          </div>

          <div className="bg-amber-950/20 border border-amber-800/40 rounded-lg p-3 text-amber-300 text-xs">
            <div className="font-semibold flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Dismissal Confirmation</span>
            </div>
            <p className="mt-1 text-[11px] text-amber-300/90 leading-relaxed">
              Dismissing marks this alert as non-actionable or intentional operation without recording an equipment fix. This will be preserved in the audit log.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-3.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-3.5 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer shadow-sm flex items-center gap-1.5"
            >
              {isLoading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Dismissing...</span>
                </>
              ) : (
                <span>Confirm Dismiss</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

