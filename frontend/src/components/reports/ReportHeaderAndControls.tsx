import React, { useState } from "react";
import { Download, RefreshCw, AlertCircle } from "lucide-react";
import { endpoints } from "../../api/endpoints";
import type { MachineSummaryResponse, ReportQueryParams } from "../../api/types";

interface ReportHeaderAndControlsProps {
  rangePreset: "24h" | "7d" | "30d" | "custom";
  onRangePresetChange: (preset: "24h" | "7d" | "30d" | "custom") => void;
  customStart: string;
  onCustomStartChange: (val: string) => void;
  customEnd: string;
  onCustomEndChange: (val: string) => void;
  selectedMachineId: string;
  onSelectedMachineIdChange: (val: string) => void;
  machines: MachineSummaryResponse[];
  isLoading: boolean;
  onRefresh: () => void;
  onApplyCustomRange: () => void;
}

export const ReportHeaderAndControls: React.FC<ReportHeaderAndControlsProps> = ({
  rangePreset,
  onRangePresetChange,
  customStart,
  onCustomStartChange,
  customEnd,
  onCustomEndChange,
  selectedMachineId,
  onSelectedMachineIdChange,
  machines,
  isLoading,
  onRefresh,
  onApplyCustomRange,
}) => {
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleDownloadCsv = async () => {
    setIsExportingCsv(true);
    setExportError(null);
    try {
      const params: ReportQueryParams = {
        format: "csv",
      };

      if (rangePreset === "custom") {
        if (customStart) params.start_time = new Date(customStart).toISOString();
        if (customEnd) params.end_time = new Date(customEnd).toISOString();
      } else {
        const end = new Date();
        const start = new Date();
        if (rangePreset === "24h") {
          start.setHours(start.getHours() - 24);
        } else if (rangePreset === "7d") {
          start.setDate(start.getDate() - 7);
        } else if (rangePreset === "30d") {
          start.setDate(start.getDate() - 30);
        }
        params.start_time = start.toISOString();
        params.end_time = end.toISOString();
      }

      if (selectedMachineId !== "all") {
        params.machine_id = selectedMachineId;
      }

      const csvUrl = endpoints.getEnergyWastageReportCsvUrl(params);

      // Attempt direct anchor click for clean attachment trigger
      const link = document.createElement("a");
      link.href = csvUrl;
      link.setAttribute("download", `orvex_energy_report_${rangePreset}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      setExportError(err?.message || "Failed to trigger CSV download");
    } finally {
      setIsExportingCsv(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Top Bar: Title & Export / Refresh Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white tracking-tight">Energy-Wastage Reports</h2>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-800/80">
              Official Audit Ready
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Fleet-wide energy consumption, verified wastage episodes, and exportable engineering audits
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Official CSV Export Button */}
          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={isLoading || isExportingCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
          >
            <Download className={`w-3.5 h-3.5 ${isExportingCsv ? "animate-bounce" : ""}`} />
            <span>{isExportingCsv ? "Exporting CSV..." : "Download CSV"}</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Control Bar: Timeframe & Scope */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        {/* Preset Range Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Period:</span>
          <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs font-medium">
            <button
              type="button"
              onClick={() => onRangePresetChange("24h")}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                rangePreset === "24h"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Last 24h
            </button>
            <button
              type="button"
              onClick={() => onRangePresetChange("7d")}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                rangePreset === "7d"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Last 7d
            </button>
            <button
              type="button"
              onClick={() => onRangePresetChange("30d")}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                rangePreset === "30d"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Last 30d
            </button>
            <button
              type="button"
              onClick={() => onRangePresetChange("custom")}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                rangePreset === "custom"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Custom
            </button>
          </div>
        </div>

        {/* Custom Date Pickers */}
        {rangePreset === "custom" && (
          <div className="flex items-center gap-2 text-xs">
            <input
              type="datetime-local"
              value={customStart}
              onChange={(e) => onCustomStartChange(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            <span className="text-slate-500 text-[11px]">to</span>
            <input
              type="datetime-local"
              value={customEnd}
              onChange={(e) => onCustomEndChange(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={onApplyCustomRange}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-medium cursor-pointer shadow-xs"
            >
              Apply
            </button>
          </div>
        )}

        {/* Equipment Selector */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 font-medium">Equipment Scope:</span>
          <select
            value={selectedMachineId}
            onChange={(e) => onSelectedMachineIdChange(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="all">Entire Monitored Fleet</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.machine_identifier})
              </option>
            ))}
          </select>
        </div>
      </div>

      {exportError && (
        <div className="bg-rose-950/20 border border-rose-800/60 rounded-lg p-3 text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{exportError}</span>
        </div>
      )}
    </div>
  );
};
