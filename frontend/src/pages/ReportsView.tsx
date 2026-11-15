import React, { useState, useEffect } from "react";
import { endpoints } from "../api/endpoints";
import type { EnergyWastageReportResponse, MachineSummaryResponse } from "../api/types";
import { ReportHeaderAndControls } from "../components/reports/ReportHeaderAndControls";
import { ReportEnergyOverview } from "../components/reports/ReportEnergyOverview";
import { ReportHistoricalCharts } from "../components/reports/ReportBreakdownCharts";
import { ReportBreakdownTables } from "../components/reports/ReportBreakdownTables";
import { ReportQualityNotice } from "../components/reports/ReportQualityNotice";

interface ReportsViewProps {
  machines: MachineSummaryResponse[];
  onSelectMachine: (machineId: string) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ machines, onSelectMachine }) => {
  const [report, setReport] = useState<EnergyWastageReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [rangePreset, setRangePreset] = useState<"24h" | "7d" | "30d" | "custom">("24h");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [selectedMachineId, setSelectedMachineId] = useState<string>("all");

  const computeRangeTimestamps = (): { start_time?: string; end_time?: string } => {
    if (rangePreset === "custom") {
      return {
        start_time: customStart ? new Date(customStart).toISOString() : undefined,
        end_time: customEnd ? new Date(customEnd).toISOString() : undefined,
      };
    }

    const end = new Date();
    const start = new Date();
    if (rangePreset === "24h") {
      start.setHours(start.getHours() - 24);
    } else if (rangePreset === "7d") {
      start.setDate(start.getDate() - 7);
    } else if (rangePreset === "30d") {
      start.setDate(start.getDate() - 30);
    }

    return {
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    };
  };

  const fetchReport = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { start_time, end_time } = computeRangeTimestamps();
      const params: {
        start_time?: string;
        end_time?: string;
        machine_id?: string;
      } = {
        start_time,
        end_time,
      };

      if (selectedMachineId !== "all") {
        params.machine_id = selectedMachineId;
      }

      const res = await endpoints.getEnergyWastageReport(params);
      setReport(res);
    } catch (err: any) {
      setError(err?.message || "Failed to generate energy wastage report");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [rangePreset, selectedMachineId]);

  return (
    <div className="space-y-6">
      {/* 1. Header, Scope, Timeframe & Export Controls */}
      <ReportHeaderAndControls
        rangePreset={rangePreset}
        onRangePresetChange={setRangePreset}
        customStart={customStart}
        onCustomStartChange={setCustomStart}
        customEnd={customEnd}
        onCustomEndChange={setCustomEnd}
        selectedMachineId={selectedMachineId}
        onSelectedMachineIdChange={setSelectedMachineId}
        machines={machines}
        isLoading={isLoading}
        onRefresh={fetchReport}
        onApplyCustomRange={fetchReport}
      />

      {/* Error View */}
      {error && (
        <div className="bg-rose-950/20 border border-rose-800/60 rounded-lg p-4 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* 2. Executive KPI Cards */}
      <ReportEnergyOverview report={report} />

      {/* 3. Visual Breakdown Charts */}
      <ReportHistoricalCharts report={report} />

      {/* 4. Detailed Breakdown Tables */}
      <ReportBreakdownTables report={report} onSelectMachine={onSelectMachine} />

      {/* 5. Quality & Methodology Footnote */}
      <ReportQualityNotice report={report} />
    </div>
  );
};
