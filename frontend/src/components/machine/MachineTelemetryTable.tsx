import React from "react";
import { ChevronLeft, ChevronRight, Database } from "lucide-react";
import type { TelemetryRecordResponse } from "../../api/types";
import { OperatingStateBadge } from "../common/StatusBadge";
import { formatPower, formatTimestamp } from "../../utils/formatters";

interface MachineTelemetryTableProps {
  telemetry: TelemetryRecordResponse[];
  total: number;
  limit: number;
  offset: number;
  onPageChange: (newOffset: number) => void;
  isLoading?: boolean;
}

export const MachineTelemetryTable: React.FC<MachineTelemetryTableProps> = ({
  telemetry,
  total,
  limit,
  offset,
  onPageChange,
  isLoading = false,
}) => {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white tracking-wide">
            Raw Telemetry Log
          </h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
            {total.toLocaleString()} records
          </span>
        </div>

        {/* Pagination buttons */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 font-mono">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            disabled={!hasPrev || isLoading}
            onClick={() => onPageChange(Math.max(0, offset - limit))}
            aria-label="Previous page of telemetry"
            className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus:outline-none"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={!hasNext || isLoading}
            onClick={() => onPageChange(offset + limit)}
            aria-label="Next page of telemetry"
            className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus:outline-none"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800/80 bg-slate-950/40 text-slate-400 font-medium uppercase tracking-wider">
              <th className="py-2.5 px-4 sm:px-6">Timestamp (UTC)</th>
              <th className="py-2.5 px-3">State</th>
              <th className="py-2.5 px-3 text-right">Active Power</th>
              <th className="py-2.5 px-3 text-right">Voltage</th>
              <th className="py-2.5 px-3 text-right">Current</th>
              <th className="py-2.5 px-3 text-right">PF</th>
              <th className="py-2.5 px-3 text-right">Load %</th>
              <th className="py-2.5 px-4 text-right">Temperature</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  Loading telemetry page...
                </td>
              </tr>
            ) : telemetry.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  No telemetry logged in this interval.
                </td>
              </tr>
            ) : (
              telemetry.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30 transition-colors font-mono">
                  {/* Timestamp */}
                  <td className="py-2.5 px-4 sm:px-6 text-slate-300">
                    {formatTimestamp(row.timestamp)}
                  </td>

                  {/* State */}
                  <td className="py-2.5 px-3 font-sans">
                    <OperatingStateBadge state={row.operating_state} />
                  </td>

                  {/* Active Power */}
                  <td className="py-2.5 px-3 text-right text-emerald-400 font-medium">
                    {formatPower(row.active_power)}
                  </td>

                  {/* Voltage */}
                  <td className="py-2.5 px-3 text-right text-slate-400">
                    {row.voltage !== null ? `${row.voltage.toFixed(1)} V` : "—"}
                  </td>

                  {/* Current */}
                  <td className="py-2.5 px-3 text-right text-slate-400">
                    {row.current !== null ? `${row.current.toFixed(1)} A` : "—"}
                  </td>

                  {/* Power Factor */}
                  <td className="py-2.5 px-3 text-right text-slate-400">
                    {row.power_factor !== null ? row.power_factor.toFixed(2) : "—"}
                  </td>

                  {/* Load Percent */}
                  <td className="py-2.5 px-3 text-right text-sky-400">
                    {row.load_percent !== null ? `${row.load_percent.toFixed(1)}%` : "—"}
                  </td>

                  {/* Temperature */}
                  <td className="py-2.5 px-4 text-right text-amber-400">
                    {row.temperature !== null ? `${row.temperature.toFixed(1)} °C` : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
