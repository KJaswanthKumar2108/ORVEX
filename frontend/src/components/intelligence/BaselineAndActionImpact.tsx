import React, { useState } from "react";
import {
  AlertCircle,
  History,
  Info,
  Plus,
  Wrench,
  X,
} from "lucide-react";
import type {
  ActionImpactResponse,
  CorrectiveActionCreate,
  CorrectiveActionResponse,
  MachineBaselineResponse,
  MachineSummaryResponse,
} from "../../api/types";
import { formatTimestamp } from "../../utils/formatters";

interface BaselineAndActionImpactProps {
  baseline: MachineBaselineResponse | null;
  selectedMachineId: string;
  onSelectMachine: (machineId: string) => void;
  machines: MachineSummaryResponse[];
  correctiveActions: CorrectiveActionResponse[];
  selectedActionId: string;
  onSelectAction: (actionId: string) => void;
  actionImpact: ActionImpactResponse | null;
  onCreateAction: (payload: CorrectiveActionCreate) => Promise<void>;
  isLoading?: boolean;
}

export const BaselineAndActionImpact: React.FC<BaselineAndActionImpactProps> = ({
  baseline,
  selectedMachineId,
  onSelectMachine,
  machines,
  correctiveActions,
  selectedActionId,
  onSelectAction,
  actionImpact,
  onCreateAction,
  isLoading = false,
}) => {
  // Modal State
  const [showModal, setShowModal] = useState<boolean>(false);
  const [actionType, setActionType] = useState<string>("operational_change");
  const [actionTitle, setActionTitle] = useState<string>("");
  const [actionDesc, setActionDesc] = useState<string>("");
  const [operatorName, setOperatorName] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMachineId || !actionTitle.trim()) return;

    setIsSubmitting(true);
    try {
      await onCreateAction({
        machine_id: selectedMachineId,
        action_type: actionType,
        title: actionTitle.trim(),
        description: actionDesc.trim() || null,
        performed_at: new Date().toISOString(),
        operator_name: operatorName.trim() || null,
      });
      setShowModal(false);
      setActionTitle("");
      setActionDesc("");
      setOperatorName("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to record corrective action.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Historical Energy Baseline Comparison Card */}
      <div className="bg-[#0d1424] border border-slate-800/80 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-3">
          <div className="flex items-center gap-2.5">
            <History className="w-4 h-4 text-emerald-400" />
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white font-mono">
                Historical Energy Baseline Evaluation
              </h2>
              <p className="text-xs text-slate-400 font-sans mt-0.5">
                Compares current operation against this machine's own historical reference profile
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Target Asset:</label>
            <select
              value={selectedMachineId}
              onChange={(e) => onSelectMachine(e.target.value)}
              aria-label="Select machine for baseline"
              className="bg-slate-950 text-slate-200 border border-slate-800 rounded px-2.5 py-1 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.machine_identifier})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Baseline Content */}
        {isLoading ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            Evaluating historical energy baseline...
          </div>
        ) : baseline ? (
          baseline.is_baseline_valid ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-950/70 p-3 rounded-lg border border-slate-800 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Baseline Status:</span>
                  <span
                    className={`font-mono font-bold px-2 py-0.5 rounded border ${
                      baseline.baseline_status === "DEVIATION_DETECTED"
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    }`}
                  >
                    {baseline.baseline_status}
                  </span>
                </div>
                <div className="text-slate-400 font-mono text-[11px]">
                  Samples: {baseline.telemetry_samples_evaluated} evaluated across {baseline.available_history_hours} hrs
                </div>
              </div>

              {/* Baseline Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">
                    Idle Power Baseline vs Current
                  </span>
                  <div className="flex justify-between items-baseline pt-1">
                    <span className="text-slate-400 font-mono">
                      Ref: {baseline.baseline_metrics.baseline_idle_power_kw?.toFixed(1) ?? "--"} kW
                    </span>
                    <span className="text-base font-mono font-bold text-amber-300">
                      Curr: {baseline.current_metrics.current_idle_power_kw?.toFixed(1) ?? "--"} kW
                    </span>
                  </div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">
                    Running Power Baseline vs Current
                  </span>
                  <div className="flex justify-between items-baseline pt-1">
                    <span className="text-slate-400 font-mono">
                      Ref: {baseline.baseline_metrics.baseline_running_power_kw?.toFixed(1) ?? "--"} kW
                    </span>
                    <span className="text-base font-mono font-bold text-white">
                      Curr: {baseline.current_metrics.current_average_power_kw?.toFixed(1) ?? "--"} kW
                    </span>
                  </div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">
                    Power Deviation Rate
                  </span>
                  <div className="flex justify-between items-baseline pt-1">
                    <span className="text-slate-400">Deviation:</span>
                    <span
                      className={`text-base font-mono font-bold ${
                        (baseline.deviation_percentage ?? 0) > 15 ? "text-rose-400" : "text-emerald-400"
                      }`}
                    >
                      {baseline.deviation_percentage !== null
                        ? `${baseline.deviation_percentage > 0 ? "+" : ""}${baseline.deviation_percentage.toFixed(1)}%`
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-300 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 leading-relaxed font-sans">
                {baseline.explanation}
              </p>
            </div>
          ) : (
            /* Insufficient Data State */
            <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-lg flex items-start gap-3 text-xs">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-amber-300">
                  Baseline Withheld — Insufficient Telemetry History
                </h4>
                <p className="text-amber-200/80 mt-1 leading-relaxed">
                  {baseline.insufficient_data_reason ||
                    "Insufficient historical telemetry. Minimum 1.0 hour of valid historical data is required to establish a trustworthy baseline."}
                </p>
                <p className="text-[11px] text-slate-400 mt-2 font-mono">
                  ORVEX strictly refuses to fabricate an uncalibrated baseline. Telemetry must accumulate under steady operating conditions before deviation metrics can be trusted.
                </p>
              </div>
            </div>
          )
        ) : (
          <div className="py-6 text-center text-slate-500 text-xs">
            Select a machine above to inspect historical baseline metrics.
          </div>
        )}
      </div>

      {/* 2. Before-and-After Corrective Action Assessment Card */}
      <div className="bg-[#0d1424] border border-slate-800/80 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-3">
          <div className="flex items-center gap-2.5">
            <Wrench className="w-4 h-4 text-sky-400" />
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white font-mono">
                Corrective Action Assessment (Before vs After)
              </h2>
              <p className="text-xs text-slate-400 font-sans mt-0.5">
                Empirically evaluates energy performance changes following operator intervention or maintenance
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition cursor-pointer shadow-sm self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Log Action</span>
          </button>
        </div>

        {correctiveActions.length > 0 ? (
          <div className="space-y-4">
            {/* Action Selector */}
            <div className="flex items-center gap-3 text-xs">
              <label className="text-slate-400">Select Evaluated Action:</label>
              <select
                value={selectedActionId}
                onChange={(e) => onSelectAction(e.target.value)}
                aria-label="Select evaluated action"
                className="bg-slate-950 text-slate-200 border border-slate-800 rounded px-2.5 py-1 text-xs focus:outline-none focus:border-emerald-500 flex-1 max-w-md cursor-pointer"
              >
                {correctiveActions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title} ({formatTimestamp(a.performed_at)})
                  </option>
                ))}
              </select>
            </div>

            {/* Impact Details Grid */}
            {actionImpact && (
              <div className="space-y-3 bg-slate-950/70 p-4 rounded-xl border border-slate-800 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-2">
                  <div>
                    <span className="font-bold text-white text-sm">{actionImpact.action.title}</span>
                    <div className="text-slate-400 text-xs font-mono mt-0.5">
                      Type: {actionImpact.action.action_type.replace(/_/g, " ")} • Performed:{" "}
                      {formatTimestamp(actionImpact.action.performed_at)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Outcome:</span>
                    <span
                      className={`font-mono font-bold px-2 py-0.5 rounded border ${
                        actionImpact.impact_status === "IMPROVED"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : actionImpact.impact_status === "REGRESSED"
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                          : "bg-slate-800 text-slate-300 border-slate-700"
                      }`}
                    >
                      {actionImpact.impact_status}
                    </span>
                  </div>
                </div>

                {/* Pre vs Post Comparison Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Pre-Action */}
                  <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-1.5 font-mono">
                    <span className="text-slate-400 font-semibold block font-sans">Pre-Action Period (24h)</span>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Wasted Energy:</span>
                      <span className="text-amber-400">
                        {actionImpact.pre_action_period.estimated_wasted_energy_kwh !== null
                          ? `${actionImpact.pre_action_period.estimated_wasted_energy_kwh.toFixed(1)} kWh`
                          : "--"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Wastage Events:</span>
                      <span className="text-white">{actionImpact.pre_action_period.wastage_event_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Idle Duration:</span>
                      <span className="text-white">
                        {actionImpact.pre_action_period.idle_duration_hours.toFixed(1)} h
                      </span>
                    </div>
                  </div>

                  {/* Post-Action */}
                  <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-1.5 font-mono">
                    <span className="text-slate-400 font-semibold block font-sans">Post-Action Period (24h)</span>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Wasted Energy:</span>
                      <span className="text-amber-400">
                        {actionImpact.post_action_period.estimated_wasted_energy_kwh !== null
                          ? `${actionImpact.post_action_period.estimated_wasted_energy_kwh.toFixed(1)} kWh`
                          : "--"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Wastage Events:</span>
                      <span className="text-white">{actionImpact.post_action_period.wastage_event_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Idle Duration:</span>
                      <span className="text-white">
                        {actionImpact.post_action_period.idle_duration_hours.toFixed(1)} h
                      </span>
                    </div>
                  </div>

                  {/* Observed Change Delta */}
                  <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-1.5 font-mono flex flex-col justify-between">
                    <div>
                      <span className="text-slate-400 font-semibold block font-sans">Observed Change (Delta)</span>
                      <div className="flex justify-between mt-1">
                        <span className="text-slate-500">Energy Delta:</span>
                        <span
                          className={`font-bold ${
                            (actionImpact.absolute_wasted_energy_delta_kwh ?? 0) <= 0
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }`}
                        >
                          {actionImpact.absolute_wasted_energy_delta_kwh !== null
                            ? `${actionImpact.absolute_wasted_energy_delta_kwh > 0 ? "+" : ""}${actionImpact.absolute_wasted_energy_delta_kwh.toFixed(1)} kWh (${actionImpact.percentage_wasted_energy_delta ?? 0}%)`
                            : "--"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Events Delta:</span>
                        <span className="text-white">
                          {actionImpact.event_count_delta > 0 ? "+" : ""}
                          {actionImpact.event_count_delta}
                        </span>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400 italic pt-1 font-sans">
                      {actionImpact.summary_explanation}
                    </div>
                  </div>
                </div>

                {/* Mandatory Causality Disclaimer */}
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">
                    <strong>Causality Disclaimer:</strong> {actionImpact.causality_disclaimer}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-slate-500 py-6 text-center bg-slate-950/40 rounded-lg border border-dashed border-slate-800">
            No corrective actions logged yet. Use the "Log Action" button above to record maintenance, tuning, or operational changes and assess their before-and-after impact.
          </div>
        )}
      </div>

      {/* Log Action Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d1424] border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Wrench className="w-4 h-4 text-emerald-400" />
                <span>Log Corrective Action</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Target Asset *</label>
                <select
                  value={selectedMachineId}
                  onChange={(e) => onSelectMachine(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.machine_identifier})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Action Type *</label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="operational_change">Operational Change (e.g. auto-off timer)</option>
                  <option value="maintenance_repair">Maintenance Repair (e.g. bearing greasing)</option>
                  <option value="parameter_tuning">Parameter Tuning (e.g. VFD frequency)</option>
                  <option value="equipment_replacement">Equipment Replacement (e.g. motor retrofit)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Action Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Programmed 5-min auto-shutoff timer"
                  value={actionTitle}
                  onChange={(e) => setActionTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Describe technical changes made..."
                  value={actionDesc}
                  onChange={(e) => setActionDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Operator / Technician Name</label>
                <input
                  type="text"
                  placeholder="e.g. Alex Chen (Shift Engineer)"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !actionTitle.trim()}
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? "Recording..." : "Save Action"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
