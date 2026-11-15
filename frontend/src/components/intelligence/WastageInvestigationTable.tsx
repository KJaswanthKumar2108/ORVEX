import React, { useState } from "react";
import {
  BookOpen,
  Calculator,
  Flame,
  Sliders,
  X,
} from "lucide-react";
import type { WastageEventResponse } from "../../api/types";
import {
  formatDuration,
  formatRelativeTime,
  formatTimestamp,
} from "../../utils/formatters";
import { EventStatusBadge, SeverityBadge } from "../common/StatusBadge";

interface WastageInvestigationTableProps {
  events: WastageEventResponse[];
  machineNamesMap?: Record<string, string>;
  onSelectMachineDetail?: (machineId: string) => void;
  isLoading?: boolean;
}

export const WastageInvestigationTable: React.FC<WastageInvestigationTableProps> = ({
  events,
  machineNamesMap = {},
  onSelectMachineDetail,
  isLoading = false,
}) => {
  const [selectedEvent, setSelectedEvent] = useState<WastageEventResponse | null>(null);

  return (
    <div className="bg-[#0d1424] border border-slate-800/80 rounded-xl p-5 shadow-lg space-y-4">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <Flame className="w-4 h-4 text-rose-400" />
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white font-mono">
              Wastage Episodes & Engineering Evidence Investigation
            </h2>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Inspect triggering sensor readings, numerical integrals, and physical threshold violations
            </p>
          </div>
        </div>

        <div className="text-xs font-mono text-slate-400 bg-slate-950/80 px-2.5 py-1 rounded border border-slate-800">
          {events.length} Detected Episodes In Filter
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-slate-500 text-xs">
          Loading detected wastage episodes...
        </div>
      ) : events.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
          <Flame className="w-8 h-8 text-slate-600 mb-1" />
          <span className="font-semibold text-slate-400 text-sm">No Wastage Episodes In Filter Window</span>
          <p className="text-slate-500 max-w-sm">
            All machinery in the filtered scope are currently operating within established baseline load envelopes.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-950/60 text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4">Wastage Category</th>
                <th className="py-3 px-3">Affected Asset</th>
                <th className="py-3 px-3">Start Time</th>
                <th className="py-3 px-3">Duration</th>
                <th className="py-3 px-3 text-right">Wasted Energy</th>
                <th className="py-3 px-3 text-right">Confidence</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {events.map((ev) => {
                const machineName = machineNamesMap[ev.machine_id] || ev.machine_id;
                return (
                  <tr key={ev.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Wastage Category */}
                    <td className="py-3 px-4 font-medium text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
                      <span className="capitalize">{ev.detection_reason.replace(/_/g, " ")}</span>
                    </td>

                    {/* Machine */}
                    <td className="py-3 px-3">
                      <div className="font-medium text-slate-200">Asset: {machineName}</div>
                      {onSelectMachineDetail && (
                        <button
                          type="button"
                          onClick={() => onSelectMachineDetail(ev.machine_id)}
                          className="text-[11px] text-sky-400 hover:text-sky-300 underline font-mono cursor-pointer"
                        >
                          View Detail
                        </button>
                      )}
                    </td>

                    {/* Start Time */}
                    <td className="py-3 px-3 font-mono text-slate-300">
                      <div>{formatTimestamp(ev.start_time)}</div>
                      <div className="text-[10px] text-slate-500 font-sans">
                        {formatRelativeTime(ev.start_time)}
                      </div>
                    </td>

                    {/* Duration */}
                    <td className="py-3 px-3 font-mono text-slate-300">
                      {formatDuration(ev.duration_seconds)}
                    </td>

                    {/* Estimated Wasted Energy */}
                    <td className="py-3 px-3 text-right font-mono font-semibold">
                      {ev.estimated_wasted_energy_kwh !== null ? (
                        <span className="text-amber-400">
                          {ev.estimated_wasted_energy_kwh.toFixed(2)} kWh
                        </span>
                      ) : (
                        <span className="text-slate-500 font-normal italic text-[11px]">
                          Not quantified (cycling stress)
                        </span>
                      )}
                    </td>

                    {/* Confidence */}
                    <td className="py-3 px-3 text-right font-mono text-slate-300">
                      {ev.confidence_score !== null ? `${Math.round(ev.confidence_score * 100)}%` : "—"}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 text-center">
                      <EventStatusBadge status={ev.status} />
                    </td>

                    {/* Investigate Evidence CTA */}
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedEvent(ev)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-sky-400" />
                        <span>Evidence</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Expandable Evidence Dossier Modal */}
      {selectedEvent && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-[#0d1424] border border-slate-700 rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white tracking-tight">
                      Evidence Dossier: {selectedEvent.detection_reason.replace(/_/g, " ").toUpperCase()}
                    </h3>
                    <SeverityBadge severity={selectedEvent.severity} />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    Episode UUID: {selectedEvent.id}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase">Wasted Energy</span>
                <div className="text-lg font-bold text-amber-400 mt-1">
                  {selectedEvent.estimated_wasted_energy_kwh !== null
                    ? `${selectedEvent.estimated_wasted_energy_kwh.toFixed(2)} kWh`
                    : "Not quantified"}
                </div>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase">Window Duration</span>
                <div className="text-lg font-bold text-white mt-1">
                  {formatDuration(selectedEvent.duration_seconds)}
                </div>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase">Detection Confidence</span>
                <div className="text-lg font-bold text-emerald-400 mt-1">
                  {selectedEvent.confidence_score !== null
                    ? `${Math.round(selectedEvent.confidence_score * 100)}%`
                    : "—"}
                </div>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase">Status</span>
                <div className="mt-1">
                  <EventStatusBadge status={selectedEvent.status} />
                </div>
              </div>
            </div>

            {/* Numerical Integral Formula */}
            <div className="bg-slate-950/90 rounded-lg p-4 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono text-sky-400 font-semibold uppercase">
                <Calculator className="w-4 h-4" />
                <span>Deterministic Quantification Formula</span>
              </div>
              <div className="bg-slate-900/90 p-3 rounded font-mono text-xs text-emerald-300 border border-slate-800 overflow-x-auto">
                {selectedEvent.detection_reason === "idle_running" && (
                  <code>E_wasted = ∫ [t_start → t_end] (P_active(t) - P_idle_allowance) dt</code>
                )}
                {selectedEvent.detection_reason === "low_load_unloader" && (
                  <code>E_wasted = ∫ [t_start → t_end] (P_observed(t) - 0.20 × P_rated) dt</code>
                )}
                {selectedEvent.detection_reason === "off_hours_operation" && (
                  <code>E_wasted = ∫ [t_start → t_end] P_active(t) dt (Off-Shift Violation)</code>
                )}
                {selectedEvent.detection_reason === "rapid_cycling" && (
                  <code>Wastage: Thermal Contactor Fatigue & Inrush Inefficiency (Energy Integral Withheld)</code>
                )}
                {!["idle_running", "low_load_unloader", "off_hours_operation", "rapid_cycling"].includes(
                  selectedEvent.detection_reason
                ) && (
                  <code>E_wasted = ∫ [t_start → t_end] (P_observed(t) - P_baseline(t)) dt</code>
                )}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                Continuous numerical integration evaluated across Modbus RTU telemetry samples. Gaps greater than 30 seconds are segmented to avoid linear interpolation artifacts.
              </p>
            </div>

            {/* Telemetry Evidence Details */}
            {selectedEvent.evidence_metadata && (
              <div className="space-y-2">
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Triggering Telemetry Evidence</span>
                </span>
                <div className="bg-slate-950/80 p-3.5 rounded-lg border border-slate-800 text-xs font-mono space-y-1.5 text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Window:</span>
                    <span>{formatTimestamp(selectedEvent.start_time)} → {formatTimestamp(selectedEvent.end_time)}</span>
                  </div>
                  {Object.entries(selectedEvent.evidence_metadata).map(([k, v]) => (
                    <div key={k} className="flex justify-between border-t border-slate-900 pt-1">
                      <span className="text-slate-400 capitalize">{k.replace(/_/g, " ")}:</span>
                      <span className="text-emerald-400">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Operator Recommended Action SOP */}
            <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-lg p-3.5 text-xs space-y-1">
              <span className="font-semibold text-emerald-300 flex items-center gap-1.5 font-mono">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Operator Standard Operating Procedure (SOP)</span>
              </span>
              <p className="text-slate-300 leading-relaxed font-sans">
                {selectedEvent.detection_reason === "idle_running"
                  ? "Verify feeder bin sensor logic and configure automatic conveyor drive shutdown after 5 minutes of dry running."
                  : selectedEvent.detection_reason === "low_load_unloader"
                  ? "Inspect unloader valve seals and calibrate differential pressure sensors to eliminate unloader leakage."
                  : selectedEvent.detection_reason === "rapid_cycling"
                  ? "Inspect pressure accumulator bladder charge and increase deadband to reduce motor thermal inrush stress."
                  : "Verify shift work orders and engage electrical interlocks to ensure unpowered state during planned stoppages."}
              </p>
            </div>

            {/* Close Button */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer"
              >
                Close Evidence Dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
