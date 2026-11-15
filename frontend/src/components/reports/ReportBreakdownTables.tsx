import React from "react";
import type { EnergyWastageReportResponse } from "../../api/types";
import { QualityBadge } from "../common/StatusBadge";
import {
  formatConfidence,
  formatDuration,
  formatEnergy,
  formatReasonTitle,
  formatTimestamp,
  formatWastedEnergy,
} from "../../utils/formatters";

interface ReportBreakdownTablesProps {
  report: EnergyWastageReportResponse | null;
  onSelectMachine: (machineId: string) => void;
}

export const ReportBreakdownTables: React.FC<ReportBreakdownTablesProps> = ({
  report,
  onSelectMachine,
}) => {
  if (!report) return null;

  return (
    <div className="space-y-6">
      {/* 1. Breakdown by Detection Reason */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white tracking-tight">
            Wastage Breakdown by Detection Reason
          </h3>
          <span className="text-xs font-mono text-slate-400">
            {report.by_reason.length} Reason Types
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 font-mono text-[11px] border-b border-slate-800">
              <tr>
                <th className="px-5 py-3">Detection Reason</th>
                <th className="px-5 py-3 text-right">Episodes</th>
                <th className="px-5 py-3 text-right">Cumulative Duration</th>
                <th className="px-5 py-3 text-right">Estimated Waste (kWh)</th>
                <th className="px-5 py-3 text-right">Unestimated Episodes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {report.by_reason.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-slate-500">
                    No wastage detected in the selected time range.
                  </td>
                </tr>
              ) : (
                report.by_reason.map((r) => (
                  <tr key={r.reason} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-slate-200">
                      {formatReasonTitle(r.reason)}
                      <span className="block font-mono text-[10px] text-slate-500">{r.reason}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-white">
                      {r.event_count}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-300">
                      {formatDuration(r.total_duration_seconds)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold text-rose-400">
                      {r.estimated_wasted_energy_kwh !== null
                        ? `${r.estimated_wasted_energy_kwh.toFixed(2)} kWh`
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-400">
                      {r.unestimated_event_count > 0 ? (
                        <span className="text-amber-400">{r.unestimated_event_count}</span>
                      ) : (
                        "0"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Breakdown by Machine */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white tracking-tight">
            Equipment Energy & Wastage Summary
          </h3>
          <span className="text-xs font-mono text-slate-400">
            {report.by_machine.length} Units Analyzed
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 font-mono text-[11px] border-b border-slate-800">
              <tr>
                <th className="px-5 py-3">Equipment</th>
                <th className="px-5 py-3 text-right">Actual Energy (kWh)</th>
                <th className="px-5 py-3 text-right">Estimated Waste (kWh)</th>
                <th className="px-5 py-3 text-right">Wastage Episodes</th>
                <th className="px-5 py-3 text-right">Data Coverage</th>
                <th className="px-5 py-3 text-center">Quality</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {report.by_machine.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-slate-500">
                    No machines match the selected scope.
                  </td>
                </tr>
              ) : (
                report.by_machine.map((m) => (
                  <tr
                    key={m.machine_id}
                    onClick={() => onSelectMachine(m.machine_id)}
                    className="hover:bg-slate-800/30 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-semibold text-slate-200 hover:text-emerald-400">
                        {m.machine_name}
                      </span>
                      <span className="block font-mono text-[11px] text-slate-500">
                        {m.machine_identifier} • {m.machine_type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-white">
                      {formatEnergy(m.actual_energy_kwh)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold text-rose-400">
                      {formatWastedEnergy(m.estimated_wasted_energy_kwh)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-300">
                      {m.total_wastage_events}
                      {m.unestimated_wastage_events > 0 && (
                        <span className="text-[10px] text-slate-500 block">
                          ({m.unestimated_wastage_events} unestimated)
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-400">
                      {Math.round(m.data_coverage_ratio * 100)}%
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <QualityBadge quality={m.quality as any} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Persisted Wastage Episodes Detail */}
      {report.events_detail && report.events_detail.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white tracking-tight">
              Persisted Wastage Episodes Detail
            </h3>
            <span className="text-xs font-mono text-slate-400">
              {report.events_detail.length} Episodes
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3">Timestamp / Machine</th>
                  <th className="px-5 py-3">Detection Reason</th>
                  <th className="px-5 py-3 text-right">Duration</th>
                  <th className="px-5 py-3 text-right">Estimated Waste</th>
                  <th className="px-5 py-3 text-right">Confidence</th>
                  <th className="px-5 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {report.events_detail.map((e) => (
                  <tr key={e.event_id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-slate-300 block">
                        {formatTimestamp(e.start_time)}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {e.machine_name} ({e.machine_identifier})
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-semibold text-slate-200">
                        {formatReasonTitle(e.detection_reason)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-300">
                      {formatDuration(e.duration_seconds)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold text-rose-400">
                      {e.estimated_wasted_energy_kwh !== null
                        ? `${e.estimated_wasted_energy_kwh.toFixed(2)} kWh`
                        : "Not estimated"}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-300">
                      {formatConfidence(e.confidence_score)}
                    </td>
                    <td className="px-5 py-3.5 text-center font-mono text-[11px] uppercase text-slate-400">
                      {e.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

