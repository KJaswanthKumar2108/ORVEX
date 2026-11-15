import React, { useMemo, useState } from "react";
import {
  BarChart3,
  Filter,
  RefreshCw,
} from "lucide-react";
import type {
  MachinePrioritization,
  MachineSummaryResponse,
  PatternBreakdown,
  TelemetryRecordResponse,
} from "../../api/types";
import { formatShortTime, formatWastedEnergy } from "../../utils/formatters";

interface EnergyConsumptionAnalysisProps {
  telemetry?: TelemetryRecordResponse[];
  prioritizations?: MachinePrioritization[];
  patterns?: PatternBreakdown[];
  machines: MachineSummaryResponse[];
  selectedRange: "24h" | "7d" | "30d";
  onRangeChange: (range: "24h" | "7d" | "30d") => void;
  selectedMachineId: string;
  onMachineChange: (machineId: string) => void;
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
  onResetFilters: () => void;
  onSelectMachineDetail?: (machineId: string) => void;
  isLoading?: boolean;
}

type AnalysisTab = "fleet_time" | "by_machine" | "patterns" | "distribution";

export const EnergyConsumptionAnalysis: React.FC<EnergyConsumptionAnalysisProps> = ({
  telemetry = [],
  prioritizations = [],
  patterns = [],
  machines,
  selectedRange,
  onRangeChange,
  selectedMachineId,
  onMachineChange,
  selectedCategory,
  onCategoryChange,
  onResetFilters,
  onSelectMachineDetail,
  isLoading = false,
}) => {
  const [activeTab, setActiveTab] = useState<AnalysisTab>("fleet_time");

  // Filter telemetry by machine if selected
  const filteredTelemetry = useMemo(() => {
    const list = Array.isArray(telemetry) ? telemetry : [];
    if (!selectedMachineId) return list;
    return list.filter((t) => t.machine_id === selectedMachineId);
  }, [telemetry, selectedMachineId]);

  // Sort telemetry chronologically
  const sortedTelemetry = useMemo(() => {
    return [...filteredTelemetry]
      .filter((t) => t.timestamp && t.active_power !== null)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [filteredTelemetry]);

  // SVG Chart Metrics
  const width = 800;
  const height = 240;
  const padLeft = 60;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 35;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const timestamps = useMemo(() => {
    return sortedTelemetry.map((t) => new Date(t.timestamp).getTime());
  }, [sortedTelemetry]);

  const minTime = timestamps[0] || 0;
  const maxTime = timestamps[timestamps.length - 1] || 0;
  const timeSpan = Math.max(1000, maxTime - minTime);

  // Time-series Path Generation
  const timeSeriesPaths = useMemo(() => {
    const powers = sortedTelemetry.map((t) => t.active_power || 0);
    if (powers.length === 0) return { maxScale: 100, pathStr: "" };

    const maxObserved = Math.max(...powers, 10);
    const maxScale = maxObserved * 1.15;

    const points = sortedTelemetry.map((t, idx) => {
      const time = timestamps[idx];
      const p = t.active_power || 0;
      const x = padLeft + ((time - minTime) / timeSpan) * chartW;
      const y = padTop + chartH - (p / maxScale) * chartH;
      return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    });

    return { maxScale, pathStr: points.join(" ") };
  }, [sortedTelemetry, timestamps, minTime, timeSpan, chartW, chartH, padLeft, padTop]);

  // Category Distribution calculations
  const categoryDistribution = useMemo(() => {
    const categories: Record<string, { label: string; count: number; wastedKwh: number }> = {
      IDLE_WASTAGE: { label: "Sustained Idle Running", count: 0, wastedKwh: 0 },
      LOW_LOAD_BYPASS: { label: "Low Load & Unloader Bypass", count: 0, wastedKwh: 0 },
      OFF_HOURS_OPERATION: { label: "Off-Hours Power Draw", count: 0, wastedKwh: 0 },
      START_STOP_CYCLING: { label: "Frequent Start/Stop Stress", count: 0, wastedKwh: 0 },
    };

    patterns.forEach((p) => {
      const key = p.pattern_type;
      if (categories[key]) {
        categories[key].count += p.total_event_count;
        categories[key].wastedKwh += p.estimated_wasted_energy_kwh || 0;
      } else {
        categories[key] = {
          label: p.pattern_name,
          count: p.total_event_count,
          wastedKwh: p.estimated_wasted_energy_kwh || 0,
        };
      }
    });

    const totalWasted = Object.values(categories).reduce((sum, c) => sum + c.wastedKwh, 0);

    return { categories, totalWasted };
  }, [patterns]);

  // Filter prioritizations by machine if selected
  const filteredPrioritizations = useMemo(() => {
    if (!selectedMachineId) return prioritizations;
    return prioritizations.filter((p) => p.machine_id === selectedMachineId);
  }, [prioritizations, selectedMachineId]);

  const hasActiveFilters = Boolean(selectedMachineId || selectedCategory);

  return (
    <div className="bg-[#0d1424] border border-slate-800/80 rounded-xl p-5 shadow-lg space-y-4">
      {/* Header & Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-3 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <BarChart3 className="w-4 h-4 text-emerald-400" />
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white font-mono">
              Energy Consumption & Wastage Analysis
            </h2>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Empirical power trends, machine allocations, and pattern distributions
            </p>
          </div>
        </div>

        {/* View Perspective Tabs */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800 text-xs font-medium flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab("fleet_time")}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              activeTab === "fleet_time"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Power Profile
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("by_machine")}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              activeTab === "by_machine"
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Machine Allocations
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("patterns")}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              activeTab === "patterns"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Wastage Patterns
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("distribution")}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              activeTab === "distribution"
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Category Distribution
          </button>
        </div>
      </div>

      {/* Interactive Filter Bar */}
      <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-400 font-mono text-[11px] uppercase flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-emerald-400" />
            <span>Filters:</span>
          </span>

          {/* Time Range Preset */}
          <div className="flex rounded border border-slate-800 bg-slate-900 overflow-hidden font-mono">
            {(["24h", "7d", "30d"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onRangeChange(r)}
                className={`px-2.5 py-1 text-xs cursor-pointer ${
                  selectedRange === r ? "bg-emerald-600 text-white font-semibold" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {r === "24h" ? "24h" : r === "7d" ? "7d" : "30d"}
              </button>
            ))}
          </div>

          {/* Machine Filter Dropdown */}
          <select
            value={selectedMachineId}
            onChange={(e) => onMachineChange(e.target.value)}
            aria-label="Filter by machine"
            className="bg-slate-900 text-slate-200 border border-slate-800 rounded px-2.5 py-1 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="">All Monitored Equipment</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.machine_identifier})
              </option>
            ))}
          </select>

          {/* Wastage Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            aria-label="Filter by wastage category"
            className="bg-slate-900 text-slate-200 border border-slate-800 rounded px-2.5 py-1 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="">All Wastage Categories</option>
            <option value="idle_running">Sustained Idle Running</option>
            <option value="low_load_unloader">Low Load / Unloader Bypass</option>
            <option value="off_hours_operation">Off-Hours Power Draw</option>
            <option value="rapid_cycling">Rapid Start/Stop Cycling</option>
          </select>
        </div>

        {/* Reset Filters CTA */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="text-slate-400 hover:text-white text-xs underline cursor-pointer"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Main Perspective Views */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-4">
        {isLoading ? (
          <div className="h-60 flex flex-col items-center justify-center text-slate-500 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-400 mb-2" />
            <span>Analyzing energy consumption patterns...</span>
          </div>
        ) : activeTab === "fleet_time" ? (
          /* Tab 1: Power Profile Time Series SVG */
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>
                {selectedMachineId
                  ? `Machine Active Power Profile (${selectedRange})`
                  : `Fleet Composite Power Profile (${selectedRange})`}
              </span>
              <span className="text-emerald-400 font-semibold">Continuous Trapezoidal Ingestion</span>
            </div>

            {sortedTelemetry.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-500 text-xs">
                No active power records available in this window.
              </div>
            ) : (
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none overflow-visible">
                {/* Horizontal Gridlines */}
                {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
                  const y = padTop + chartH * (1 - ratio);
                  const val = ratio * timeSeriesPaths.maxScale;
                  return (
                    <g key={ratio}>
                      <line
                        x1={padLeft}
                        y1={y}
                        x2={padLeft + chartW}
                        y2={y}
                        stroke="#1e293b"
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={padLeft - 8}
                        y={y + 3}
                        textAnchor="end"
                        fill="#94a3b8"
                        fontSize="10"
                        fontFamily="monospace"
                      >
                        {val.toFixed(0)} kW
                      </text>
                    </g>
                  );
                })}

                {/* Time Axis Labels */}
                {[0, 0.5, 1.0].map((ratio) => {
                  const t = minTime + timeSpan * ratio;
                  const x = padLeft + chartW * ratio;
                  return (
                    <text
                      key={ratio}
                      x={x}
                      y={padTop + chartH + 18}
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {formatShortTime(new Date(t).toISOString())}
                    </text>
                  );
                })}

                {/* Path line */}
                <path
                  d={timeSeriesPaths.pathStr}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </div>
        ) : activeTab === "by_machine" ? (
          /* Tab 2: Machine Allocations (Actual vs Wasted Energy) */
          <div className="space-y-3">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-300 block">
              Machine-Wise Energy Allocation & Wastage Share
            </span>

            {filteredPrioritizations.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-500 text-xs">
                No machines match the selected filter criteria.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPrioritizations.map((p) => {
                  const wastedKwh = p.estimated_wasted_energy_kwh || 0;
                  return (
                    <div
                      key={p.machine_id}
                      className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{p.machine_name}</span>
                          <span className="font-mono text-slate-500 text-[11px]">{p.machine_identifier}</span>
                        </div>
                        <div className="flex items-center gap-3 font-mono">
                          <span className="text-amber-400">
                            Wasted: {formatWastedEnergy(wastedKwh)}
                          </span>
                          {onSelectMachineDetail && (
                            <button
                              type="button"
                              onClick={() => onSelectMachineDetail(p.machine_id)}
                              className="text-xs text-sky-400 hover:text-sky-300 underline cursor-pointer"
                            >
                              Inspect Machine
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Proportional Wasted Bar */}
                      <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden flex">
                        <div
                          style={{ width: `${Math.min(100, Math.max(5, p.priority_score))}%` }}
                          className="bg-amber-400 h-full rounded-full"
                          title={`Priority Score: ${p.priority_score.toFixed(1)}/100`}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>Contributing Factor: {p.key_contributing_factor}</span>
                        <span className="font-mono">
                          {p.wastage_events_count} episodes • {p.wasted_duration_hours.toFixed(1)} hrs loss
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : activeTab === "patterns" ? (
          /* Tab 3: Recurring Wastage Patterns Cards */
          <div className="space-y-3">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-300 block">
              Deduplicated Recurring Wastage Patterns
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {patterns.map((pat) => {
                const isCycling = pat.pattern_type === "START_STOP_CYCLING";
                return (
                  <div
                    key={pat.pattern_type}
                    className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 flex flex-col justify-between text-xs space-y-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-white text-xs">{pat.pattern_name}</h3>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                            isCycling
                              ? "bg-purple-500/10 text-purple-300 border-purple-500/30"
                              : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                          }`}
                        >
                          {isCycling ? "Cycling Stress" : "Avoidable Loss"}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] mt-1">{pat.description}</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-slate-950/80 p-2.5 rounded font-mono text-[11px] border border-slate-800/80">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Occurrences</span>
                        <span className="text-white font-bold">{pat.total_event_count}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Duration</span>
                        <span className="text-white font-bold">{pat.total_duration_hours.toFixed(1)} h</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Wasted Energy</span>
                        <span className="text-amber-400 font-bold">
                          {isCycling
                            ? "Unquantified"
                            : pat.estimated_wasted_energy_kwh !== null
                            ? `${pat.estimated_wasted_energy_kwh.toFixed(1)} kWh`
                            : "0.0 kWh"}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] space-y-1">
                      <div>
                        <strong className="text-slate-400">Conditions: </strong>
                        <span className="text-slate-300">{pat.typical_operating_conditions}</span>
                      </div>
                      <div>
                        <strong className="text-emerald-400">Countermeasure: </strong>
                        <span className="text-emerald-300">{pat.recommended_countermeasure}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Tab 4: Category Distribution */
          <div className="space-y-3">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-300 block">
              Wastage Category Proportion (% of Avoidable kWh)
            </span>

            <div className="space-y-3">
              {Object.entries(categoryDistribution.categories).map(([catKey, cat]) => {
                const pct =
                  categoryDistribution.totalWasted > 0
                    ? (cat.wastedKwh / categoryDistribution.totalWasted) * 100
                    : 0;
                return (
                  <div key={catKey} className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-white">{cat.label}</span>
                      <span className="font-mono text-amber-400 font-bold">
                        {catKey === "START_STOP_CYCLING"
                          ? `${cat.count} cycling events (unquantified stress)`
                          : `${cat.wastedKwh.toFixed(1)} kWh (${pct.toFixed(1)}%)`}
                      </span>
                    </div>

                    <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${Math.min(100, Math.max(cat.count > 0 ? 5 : 0, pct))}%` }}
                        className={`h-full rounded-full ${
                          catKey === "START_STOP_CYCLING" ? "bg-purple-500" : "bg-amber-400"
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
