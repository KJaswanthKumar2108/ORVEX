import React from "react";
import { CheckCircle, ShieldAlert } from "lucide-react";
import type { WastageEventResponse } from "../../api/types";
import { EventStatusBadge } from "../common/StatusBadge";
import {
  formatConfidence,
  formatDuration,
  formatReasonTitle,
  formatTimestamp,
  formatWastedEnergy,
} from "../../utils/formatters";

interface WastageEventsTableProps {
  events: WastageEventResponse[];
  machineNamesMap?: Record<string, string>;
  onSelectMachine?: (machineId: string) => void;
  isLoading?: boolean;
}

export const WastageEventsTable: React.FC<WastageEventsTableProps> = ({
  events,
  machineNamesMap = {},
  onSelectMachine,
  isLoading = false,
}) => {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-lg shadow-sm overflow-hidden">
      {/* Panel Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-white tracking-wide">
            Detected Energy Wastage Episodes
          </h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
            {events.length}
          </span>
        </div>
        <p className="text-xs text-slate-400 hidden sm:block">
          Deterministic detections with explainable evidence
        </p>
      </div>

      {/* Events Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800/80 bg-slate-950/40 text-slate-400 font-medium uppercase tracking-wider">
              <th className="py-3 px-4 sm:px-6">Machine</th>
              <th className="py-3 px-3">Detection Reason</th>
              <th className="py-3 px-3">Interval / Duration</th>
              <th className="py-3 px-3 text-right">Est. Wasted Energy</th>
              <th className="py-3 px-3 text-center">Confidence</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-4">Detected At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  Loading wastage events...
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-400">
                  <CheckCircle className="w-8 h-8 text-emerald-500/60 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-300">No wastage episodes detected</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Equipment operation is operating within standard efficiency envelopes.
                  </p>
                </td>
              </tr>
            ) : (
              events.map((event) => {
                const machineName = machineNamesMap[event.machine_id] || event.machine_id.slice(0, 8);
                const isCycling = event.detection_reason.includes("CYCLING");

                return (
                  <tr key={event.id} className="hover:bg-slate-800/40 transition-colors">
                    {/* Machine link */}
                    <td className="py-3 px-4 sm:px-6">
                      {onSelectMachine ? (
                        <button
                          type="button"
                          onClick={() => onSelectMachine(event.machine_id)}
                          className="font-medium text-emerald-400 hover:underline text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded"
                        >
                          {machineName}
                        </button>
                      ) : (
                        <span className="font-medium text-slate-200">{machineName}</span>
                      )}
                    </td>

                    {/* Detection reason */}
                    <td className="py-3 px-3">
                      <div className="font-medium text-slate-200">
                        {formatReasonTitle(event.detection_reason)}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 truncate max-w-xs">
                        {event.detection_reason}
                      </div>
                    </td>

                    {/* Duration */}
                    <td className="py-3 px-3 font-mono text-slate-300">
                      <div>{formatDuration(event.duration_seconds)}</div>
                      <div className="text-[10px] text-slate-500">
                        {event.end_time ? "Completed episode" : "Active episode"}
                      </div>
                    </td>

                    {/* Estimated Wasted Energy (preserve null for cycling!) */}
                    <td className="py-3 px-3 text-right font-mono">
                      {isCycling && event.estimated_wasted_energy_kwh === null ? (
                        <span
                          className="text-slate-500 italic text-[11px]"
                          title="Start/stop cycling creates mechanical stress; baseline power excess is not quantified"
                        >
                          Not estimated
                        </span>
                      ) : (
                        <span
                          className={
                            event.estimated_wasted_energy_kwh && event.estimated_wasted_energy_kwh > 0
                              ? "text-amber-400 font-semibold"
                              : "text-slate-400"
                          }
                        >
                          {formatWastedEnergy(event.estimated_wasted_energy_kwh)}
                        </span>
                      )}
                    </td>

                    {/* Confidence */}
                    <td className="py-3 px-3 text-center font-mono text-slate-300">
                      {formatConfidence(event.confidence_score)}
                    </td>

                    {/* Status badge */}
                    <td className="py-3 px-3">
                      <EventStatusBadge status={event.status} />
                    </td>

                    {/* Start timestamp */}
                    <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                      {formatTimestamp(event.start_time)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
