import React, { useState } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Eye,
  FilePlus,
  Gauge,
  HeartPulse,
  Info,
  ShieldAlert,
  Thermometer,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import type {
  HealthSeverity,
  HealthStatus,
  MachineHealthDetailResponse,
  MachineHealthWarning,
  MaintenanceObservationCreate,
} from "../../api/types";
import { formatTimestamp } from "../../utils/formatters";

interface MachineHealthInvestigationSectionProps {
  machineId: string;
  healthDetail: MachineHealthDetailResponse | null;
  healthWarnings: MachineHealthWarning[];
  onAcknowledgeWarning: (
    warningId: string,
    payload: { acknowledged_by: string; notes?: string }
  ) => Promise<void>;
  onCreateObservation: (payload: MaintenanceObservationCreate) => Promise<void>;
}

export const MachineHealthInvestigationSection: React.FC<
  MachineHealthInvestigationSectionProps
> = ({
  machineId,
  healthDetail,
  healthWarnings,
  onAcknowledgeWarning,
  onCreateObservation,
}) => {
  // Acknowledge Warning Modal
  const [ackWarning, setAckWarning] = useState<MachineHealthWarning | null>(null);
  const [ackTechnician, setAckTechnician] = useState("");
  const [ackNotes, setAckNotes] = useState("");
  const [isAckSubmitting, setIsAckSubmitting] = useState(false);

  // New Observation Modal
  const [isObsModalOpen, setIsObsModalOpen] = useState(false);
  const [obsInspector, setObsInspector] = useState("");
  const [obsIssue, setObsIssue] = useState("");
  const [obsAction, setObsAction] = useState("");
  const [obsStatus, setObsStatus] = useState<"open" | "acknowledged" | "resolved">("resolved");
  const [obsNotes, setObsNotes] = useState("");
  const [isObsSubmitting, setIsObsSubmitting] = useState(false);

  // Expanded Warning Evidence Drawer
  const [expandedWarningId, setExpandedWarningId] = useState<string | null>(null);

  // Handle acknowledge submission
  const handleAcknowledgeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ackWarning || !ackTechnician.trim()) return;

    setIsAckSubmitting(true);
    try {
      await onAcknowledgeWarning(ackWarning.id, {
        acknowledged_by: ackTechnician.trim(),
        notes: ackNotes.trim() || undefined,
      });
      setAckWarning(null);
      setAckTechnician("");
      setAckNotes("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to acknowledge warning.");
    } finally {
      setIsAckSubmitting(false);
    }
  };

  // Handle observation creation submission
  const handleObservationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!obsInspector.trim() || !obsIssue.trim()) return;

    setIsObsSubmitting(true);
    try {
      const payload: MaintenanceObservationCreate = {
        machine_id: machineId,
        inspector_name: obsInspector.trim(),
        inspection_date: new Date().toISOString(),
        suspected_issue: obsIssue.trim(),
        corrective_action: obsAction.trim() || null,
        status: obsStatus,
        notes: obsNotes.trim() || null,
      };
      await onCreateObservation(payload);
      setIsObsModalOpen(false);
      setObsInspector("");
      setObsIssue("");
      setObsAction("");
      setObsNotes("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save observation.");
    } finally {
      setIsObsSubmitting(false);
    }
  };

  const getStatusBadge = (status?: HealthStatus) => {
    switch (status) {
      case "HEALTHY":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" /> Healthy Condition
          </span>
        );
      case "WATCH":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Eye className="w-3.5 h-3.5" /> Watch State
          </span>
        );
      case "WARNING":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/30">
            <AlertTriangle className="w-3.5 h-3.5" /> Warning State
          </span>
        );
      case "CRITICAL":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <AlertOctagon className="w-3.5 h-3.5" /> Critical Condition
          </span>
        );
      case "INSUFFICIENT_DATA":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <Info className="w-3.5 h-3.5" /> Insufficient Telemetry History
          </span>
        );
    }
  };

  const getSeverityBadge = (severity: HealthSeverity) => {
    switch (severity) {
      case "CRITICAL":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40">
            Critical
          </span>
        );
      case "WARNING":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-orange-500/20 text-orange-300 border border-orange-500/40">
            Warning
          </span>
        );
      case "WATCH":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
            Watch
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            Normal
          </span>
        );
    }
  };

  const healthScore = healthDetail?.health_score ?? null;
  const subScores = healthDetail?.sub_scores;

  return (
    <div className="bg-[#0d1424] border border-slate-800/80 rounded-xl p-5 shadow-lg space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <HeartPulse className="w-4 h-4 text-cyan-400" />
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white font-mono">
              Machine Health & Condition Diagnostics
            </h2>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Deterministic electrical volatility, thermal margin, and degradation tracking
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {getStatusBadge(healthDetail?.health_status)}
        </div>
      </div>

      {/* Transparent Sensor Channel Coverage Disclosure */}
      <div className="bg-slate-950/80 border border-cyan-500/30 rounded-lg p-3.5 text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-white">
              Vibration Channel Disclosure (ISO 10816-3):
            </span>{" "}
            <span className="text-slate-300">
              Bearing mechanical vibration velocity is currently <strong>UNMEASURED</strong>. High-frequency acoustic and vibration diagnostics require an external industrial piezo accelerometer retrofit.
            </span>
          </div>
        </div>
        <span className="text-[10px] font-mono text-amber-400 bg-amber-950/40 border border-amber-800/60 px-2.5 py-1 rounded shrink-0">
          Retrofit Required
        </span>
      </div>

      {/* Health Score & Sub-scores Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Overall Health Score Card */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-5 flex flex-col items-center justify-center text-center">
          <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
            Overall Health Score
          </span>
          <div className="my-3">
            <span
              className={`text-4xl font-extrabold font-mono ${
                healthScore !== null && healthScore >= 80
                  ? "text-emerald-400"
                  : healthScore !== null && healthScore >= 60
                  ? "text-amber-400"
                  : healthScore !== null
                  ? "text-rose-400"
                  : "text-slate-500"
              }`}
            >
              {healthScore !== null ? `${healthScore.toFixed(0)}` : "—"}
            </span>
            <span className="text-xs text-slate-500 font-mono"> / 100</span>
          </div>
          <p className="text-[11px] text-slate-400 max-w-xs">
            Synthesized across electrical stability, thermal limits, and state consistency weights.
          </p>
        </div>

        {/* Sub-Scores Breakdown */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 lg:col-span-2 space-y-3">
          <span className="text-xs font-mono uppercase tracking-wider text-slate-400 block">
            Health Sub-Score Dimensions
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Electrical Stability */}
            <div className="bg-slate-900/80 p-3 rounded border border-slate-800">
              <div className="flex justify-between items-center text-slate-400">
                <span className="flex items-center gap-1.5 font-medium text-slate-200">
                  <Zap className="w-3.5 h-3.5 text-sky-400" /> Electrical Stability
                </span>
                <span className="font-mono font-bold text-sky-400">
                  {subScores?.electrical_stability !== null && subScores?.electrical_stability !== undefined
                    ? `${subScores.electrical_stability.toFixed(0)}%`
                    : "—"}
                </span>
              </div>
              <div className="w-full bg-slate-950 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  style={{ width: `${subScores?.electrical_stability ?? 0}%` }}
                  className="h-full bg-sky-400 rounded-full"
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Harmonic noise, unbalance & current volatility
              </span>
            </div>

            {/* Thermal Margin */}
            <div className="bg-slate-900/80 p-3 rounded border border-slate-800">
              <div className="flex justify-between items-center text-slate-400">
                <span className="flex items-center gap-1.5 font-medium text-slate-200">
                  <Thermometer className="w-3.5 h-3.5 text-amber-400" /> Thermal Margin
                </span>
                <span className="font-mono font-bold text-amber-400">
                  {subScores?.thermal_margin !== null && subScores?.thermal_margin !== undefined
                    ? `${subScores.thermal_margin.toFixed(0)}%`
                    : "—"}
                </span>
              </div>
              <div className="w-full bg-slate-950 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  style={{ width: `${subScores?.thermal_margin ?? 0}%` }}
                  className="h-full bg-amber-400 rounded-full"
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Clearance below 70.0°C maximum thermal trip boundary
              </span>
            </div>

            {/* Operational Consistency */}
            <div className="bg-slate-900/80 p-3 rounded border border-slate-800">
              <div className="flex justify-between items-center text-slate-400">
                <span className="flex items-center gap-1.5 font-medium text-slate-200">
                  <Gauge className="w-3.5 h-3.5 text-emerald-400" /> Operational Consistency
                </span>
                <span className="font-mono font-bold text-emerald-400">
                  {subScores?.operational_consistency !== null && subScores?.operational_consistency !== undefined
                    ? `${subScores.operational_consistency.toFixed(0)}%`
                    : "—"}
                </span>
              </div>
              <div className="w-full bg-slate-950 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  style={{ width: `${subScores?.operational_consistency ?? 0}%` }}
                  className="h-full bg-emerald-400 rounded-full"
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Load adherence vs expected baseline envelope
              </span>
            </div>

            {/* State Stability */}
            <div className="bg-slate-900/80 p-3 rounded border border-slate-800">
              <div className="flex justify-between items-center text-slate-400">
                <span className="flex items-center gap-1.5 font-medium text-slate-200">
                  <Activity className="w-3.5 h-3.5 text-purple-400" /> State Stability
                </span>
                <span className="font-mono font-bold text-purple-400">
                  {subScores?.state_stability !== null && subScores?.state_stability !== undefined
                    ? `${subScores.state_stability.toFixed(0)}%`
                    : "—"}
                </span>
              </div>
              <div className="w-full bg-slate-950 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  style={{ width: `${subScores?.state_stability ?? 0}%` }}
                  className="h-full bg-purple-400 rounded-full"
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Absence of rapid start-stop contactor chatter
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Health Warnings */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Active Health Warnings ({healthWarnings.length})</span>
          </span>
        </div>

        {healthWarnings.length === 0 ? (
          <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Zero active condition monitoring warnings. All indicators within safe thresholds.</span>
          </div>
        ) : (
          <div className="space-y-2.5">
            {healthWarnings.map((warning) => (
              <div
                key={warning.id}
                className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 text-xs space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getSeverityBadge(warning.severity)}
                    <span className="font-semibold text-white capitalize">
                      {warning.warning_type.replace(/_/g, " ")}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400 font-mono">
                      Observed: {formatTimestamp(warning.detected_at)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {warning.status === "open" ? (
                      <button
                        type="button"
                        onClick={() => setAckWarning(warning)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                      >
                        Acknowledge
                      </button>
                    ) : (
                      <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                        Acknowledged by {warning.acknowledged_by || "Technician"}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedWarningId(
                          expandedWarningId === warning.id ? null : warning.id
                        )
                      }
                      className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
                    >
                      {expandedWarningId === warning.id ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Evidence Metrics Comparison */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono bg-slate-900/60 p-2.5 rounded border border-slate-800/60">
                  <div>
                    <span className="text-slate-500">Observed Value:</span>
                    <div className="text-rose-400 font-bold">
                      {warning.observed_value} {warning.unit}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Baseline Value:</span>
                    <div className="text-slate-300">
                      {warning.baseline_value !== null ? `${warning.baseline_value} ${warning.unit}` : "—"}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Threshold Limit:</span>
                    <div className="text-amber-400">
                      {warning.threshold_value !== null ? `${warning.threshold_value} ${warning.unit}` : "—"}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Confidence:</span>
                    <div className="text-emerald-400">
                      {Math.round(warning.confidence_score * 100)}%
                    </div>
                  </div>
                </div>

                <p className="text-slate-300 leading-relaxed">{warning.severity_rationale}</p>

                {/* Recommended Action */}
                <div className="text-[11px] text-emerald-300 bg-emerald-950/20 border border-emerald-900/40 rounded p-2 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                  <span>
                    <strong>Recommended Countermeasure: </strong>
                    {warning.recommended_action}
                  </span>
                </div>

                {/* Expanded Telemetry Evidence Drawer */}
                {expandedWarningId === warning.id && warning.telemetry_evidence && (
                  <div className="mt-2 p-3 bg-slate-900 rounded border border-slate-800 text-[11px] font-mono space-y-1">
                    <div className="text-slate-400 font-sans font-semibold mb-1">
                      Raw Telemetry Evidence Context:
                    </div>
                    {Object.entries(warning.telemetry_evidence).map(([k, v]) => (
                      <div key={k} className="flex justify-between border-b border-slate-800/40 py-0.5">
                        <span className="text-slate-500">{k}:</span>
                        <span className="text-sky-300">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Maintenance Observations Log */}
      <div className="space-y-3 pt-2 border-t border-slate-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <ClipboardList className="w-3.5 h-3.5 text-sky-400" />
            <span>Technician Maintenance Observations</span>
          </span>

          <button
            type="button"
            onClick={() => setIsObsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/40 text-xs font-medium cursor-pointer"
          >
            <FilePlus className="w-3.5 h-3.5" />
            <span>Log Observation</span>
          </button>
        </div>

        {healthDetail?.recent_observations && healthDetail.recent_observations.length > 0 ? (
          <div className="divide-y divide-slate-800/60 bg-slate-950/60 rounded-lg border border-slate-800">
            {healthDetail.recent_observations.map((obs) => (
              <div key={obs.id} className="p-3.5 text-xs space-y-1 font-sans">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-semibold text-white">
                    {obs.inspector_name} • <span className="font-mono text-[11px]">{formatTimestamp(obs.inspection_date)}</span>
                  </span>
                  <span className="capitalize px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                    {obs.status}
                  </span>
                </div>
                <div className="text-slate-200">
                  <strong>Suspected Issue: </strong>
                  {obs.suspected_issue}
                </div>
                {obs.corrective_action && (
                  <div className="text-emerald-300 text-[11px]">
                    <strong>Action Taken: </strong>
                    {obs.corrective_action}
                  </div>
                )}
                {obs.notes && (
                  <div className="text-slate-400 text-[11px]">
                    <strong>Notes: </strong>
                    {obs.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-slate-500 text-xs bg-slate-950/40 rounded-lg border border-slate-800/60">
            No technician observations logged yet for this asset.
          </div>
        )}
      </div>

      {/* Acknowledge Warning Modal */}
      {ackWarning && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[#0d1424] border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-start pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white font-mono uppercase">
                Acknowledge Condition Warning
              </h3>
              <button
                type="button"
                onClick={() => setAckWarning(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Confirm operational awareness of <strong>{ackWarning.warning_type.replace(/_/g, " ")}</strong>.
            </p>

            <form onSubmit={handleAcknowledgeSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Technician / Inspector Name *</label>
                <input
                  type="text"
                  required
                  value={ackTechnician}
                  onChange={(e) => setAckTechnician(e.target.value)}
                  placeholder="e.g. John Doe, Lead Tech"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Operational Notes (Optional)</label>
                <textarea
                  value={ackNotes}
                  onChange={(e) => setAckNotes(e.target.value)}
                  placeholder="Add inspection notes or work order reference..."
                  rows={3}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAckWarning(null)}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAckSubmitting || !ackTechnician.trim()}
                  className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium cursor-pointer disabled:opacity-50"
                >
                  {isAckSubmitting ? "Saving..." : "Confirm Acknowledge"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Maintenance Observation Modal */}
      {isObsModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[#0d1424] border border-slate-700 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-start pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white font-mono uppercase">
                Record Maintenance Observation
              </h3>
              <button
                type="button"
                onClick={() => setIsObsModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleObservationSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Inspector / Technician Name *</label>
                <input
                  type="text"
                  required
                  value={obsInspector}
                  onChange={(e) => setObsInspector(e.target.value)}
                  placeholder="e.g. M. Patel (Electrical Eng)"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Suspected Issue / Condition *</label>
                <input
                  type="text"
                  required
                  value={obsIssue}
                  onChange={(e) => setObsIssue(e.target.value)}
                  placeholder="e.g. Bearing grease degradation, high winding friction"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Corrective Action Taken</label>
                <input
                  type="text"
                  value={obsAction}
                  onChange={(e) => setObsAction(e.target.value)}
                  placeholder="e.g. Relubricated bearing, tightened terminal connections"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Status</label>
                <select
                  value={obsStatus}
                  onChange={(e) => setObsStatus(e.target.value as "open" | "acknowledged" | "resolved")}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs focus:outline-none focus:border-sky-500"
                >
                  <option value="resolved">Resolved</option>
                  <option value="acknowledged">Acknowledged (Pending parts)</option>
                  <option value="open">Open (Requires follow-up)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Additional Observations / Notes</label>
                <textarea
                  value={obsNotes}
                  onChange={(e) => setObsNotes(e.target.value)}
                  placeholder="Additional context or inspection details..."
                  rows={3}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsObsModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isObsSubmitting || !obsInspector.trim() || !obsIssue.trim()}
                  className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium cursor-pointer disabled:opacity-50"
                >
                  {isObsSubmitting ? "Saving..." : "Log Observation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
