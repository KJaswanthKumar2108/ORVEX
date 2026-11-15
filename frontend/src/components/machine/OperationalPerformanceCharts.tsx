import React, { useMemo, useState } from "react";
import { Gauge, RotateCw } from "lucide-react";
import type { EnergySummaryResponse, TelemetryRecordResponse } from "../../api/types";
import {
  formatDuration,
  formatPercent,
  formatShortTime,
  formatTimestamp,
} from "../../utils/formatters";

interface OperationalPerformanceChartsProps {
  telemetry: TelemetryRecordResponse[];
  energySummary?: EnergySummaryResponse | null;
  timeRangeLabel: string;
  isLoading?: boolean;
}

type OperationalTab = "load" | "temp" | "rpm" | "states";

export const OperationalPerformanceCharts: React.FC<OperationalPerformanceChartsProps> = ({
  telemetry,
  energySummary,
  timeRangeLabel,
  isLoading = false,
}) => {
  const [activeTab, setActiveTab] = useState<OperationalTab>("load");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Filter & sort valid records by timestamp
  const sortedData = useMemo(() => {
    return [...telemetry]
      .filter((r) => r.timestamp)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [telemetry]);

  // Chart dimensions
  const width = 800;
  const height = 240;
  const padLeft = 65;
  const padRight = 35;
  const padTop = 30;
  const padBottom = 40;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const timestamps = useMemo(() => {
    return sortedData.map((d) => new Date(d.timestamp).getTime());
  }, [sortedData]);

  const minTime = timestamps[0] || 0;
  const maxTime = timestamps[timestamps.length - 1] || 0;
  const timeSpan = Math.max(1000, maxTime - minTime);

  // Build segmented paths breaking at > 30s gaps
  const buildSegments = (getValue: (d: TelemetryRecordResponse) => number | null, maxVal: number) => {
    const GAP_THRESHOLD_MS = 30 * 1000;
    const segments: Array<Array<{ x: number; y: number; dataIndex: number }>> = [];
    let currentSegment: Array<{ x: number; y: number; dataIndex: number }> = [];

    sortedData.forEach((d, idx) => {
      const val = getValue(d);
      if (val === null || isNaN(val)) return;

      const t = timestamps[idx];
      const x = padLeft + ((t - minTime) / timeSpan) * chartW;
      const y = padTop + chartH - (Math.max(0, val) / maxVal) * chartH;

      if (currentSegment.length > 0) {
        const prevT = timestamps[currentSegment[currentSegment.length - 1].dataIndex];
        if (t - prevT > GAP_THRESHOLD_MS) {
          segments.push(currentSegment);
          currentSegment = [];
        }
      }
      currentSegment.push({ x, y, dataIndex: idx });
    });

    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    return segments.map((seg) => {
      if (seg.length === 0) return "";
      if (seg.length === 1) {
        return `M ${seg[0].x - 1} ${seg[0].y} L ${seg[0].x + 1} ${seg[0].y}`;
      }
      return seg.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" ");
    });
  };

  // Metrics for Load %
  const loadMetrics = useMemo(() => {
    const loads = sortedData.map((d) => d.load_percent).filter((l): l is number => l !== null && !isNaN(l));
    const maxScale = 110; // 0 - 110%
    const paths = buildSegments((d) => d.load_percent, maxScale);
    return { maxScale, paths, hasLoad: loads.length > 0 };
  }, [sortedData, timestamps, minTime, timeSpan]);

  // Metrics for Temperature (°C)
  const tempMetrics = useMemo(() => {
    const temps = sortedData.map((d) => d.temperature).filter((t): t is number => t !== null && !isNaN(t));
    const maxObserved = temps.length > 0 ? Math.max(...temps, 80) : 100;
    const maxScale = Math.max(90, maxObserved * 1.15);
    const paths = buildSegments((d) => d.temperature, maxScale);
    return { maxScale, paths, hasTemp: temps.length > 0, maxObserved };
  }, [sortedData, timestamps, minTime, timeSpan]);

  // Metrics for RPM
  const rpmMetrics = useMemo(() => {
    const rpms = sortedData.map((d) => d.rpm).filter((r): r is number => r !== null && !isNaN(r));
    const maxObserved = rpms.length > 0 ? Math.max(...rpms, 1000) : 1800;
    const maxScale = maxObserved * 1.15;
    const paths = buildSegments((d) => d.rpm, maxScale);
    return { maxScale, paths, hasRpm: rpms.length > 0, maxObserved };
  }, [sortedData, timestamps, minTime, timeSpan]);

  // Time Axis Ticks (5 intervals)
  const timeTicks = useMemo(() => {
    if (timestamps.length < 2) return [];
    const ticks: Array<{ x: number; label: string }> = [];
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const t = minTime + (timeSpan * i) / steps;
      const x = padLeft + (chartW * i) / steps;
      ticks.push({
        x,
        label: formatShortTime(new Date(t).toISOString()),
      });
    }
    return ticks;
  }, [minTime, timeSpan, timestamps.length, chartW, padLeft]);

  // State duration breakdown calculations
  const stateDurations = useMemo(() => {
    if (!energySummary) return null;
    const operatingSec = energySummary.operating_duration_seconds || 0;
    const idleSec = energySummary.idle_duration_seconds || 0;
    const lowLoadSec = energySummary.low_load_duration_seconds || 0;
    const abnormalSec = energySummary.abnormal_power_duration_seconds || 0;

    const totalTracked = operatingSec + idleSec + lowLoadSec + abnormalSec;
    return {
      operatingSec,
      idleSec,
      lowLoadSec,
      abnormalSec,
      totalTracked,
    };
  }, [energySummary]);

  const activeRecord = hoverIndex !== null ? sortedData[hoverIndex] : null;

  return (
    <div className="bg-[#0d1424] border border-slate-800/80 rounded-xl p-5 shadow-lg space-y-4">
      {/* Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <Gauge className="w-4 h-4 text-sky-400" />
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white font-mono">
              Operational Performance & State Dynamics
            </h2>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Operating load factor, thermal drift, shaft speed, and cycle durations
            </p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("load")}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              activeTab === "load"
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Load Profile (%)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("temp")}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              activeTab === "temp"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Temperature (°C)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("rpm")}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              activeTab === "rpm"
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            RPM Speed
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("states")}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              activeTab === "states"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            State Breakdown
          </button>
        </div>
      </div>

      {/* Main Display Area */}
      {activeTab === "states" ? (
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-300">
              State Durations & Equipment Utilization ({timeRangeLabel})
            </span>
            <span className="text-xs text-slate-500 font-mono">
              Coverage: {energySummary ? `${(energySummary.data_coverage_ratio * 100).toFixed(1)}%` : "—"}
            </span>
          </div>

          {stateDurations && stateDurations.totalTracked > 0 ? (
            <div className="space-y-4">
              {/* Stacked Duration Bar */}
              <div className="w-full h-4 bg-slate-900 rounded-full overflow-hidden flex">
                <div
                  style={{
                    width: `${(stateDurations.operatingSec / stateDurations.totalTracked) * 100}%`,
                  }}
                  className="bg-emerald-500 hover:opacity-90 transition-all"
                  title={`Operating: ${formatDuration(stateDurations.operatingSec)}`}
                />
                <div
                  style={{
                    width: `${(stateDurations.idleSec / stateDurations.totalTracked) * 100}%`,
                  }}
                  className="bg-amber-500 hover:opacity-90 transition-all"
                  title={`Idle: ${formatDuration(stateDurations.idleSec)}`}
                />
                <div
                  style={{
                    width: `${(stateDurations.lowLoadSec / stateDurations.totalTracked) * 100}%`,
                  }}
                  className="bg-orange-500 hover:opacity-90 transition-all"
                  title={`Low Load: ${formatDuration(stateDurations.lowLoadSec)}`}
                />
                <div
                  style={{
                    width: `${(stateDurations.abnormalSec / stateDurations.totalTracked) * 100}%`,
                  }}
                  className="bg-rose-500 hover:opacity-90 transition-all"
                  title={`Abnormal: ${formatDuration(stateDurations.abnormalSec)}`}
                />
              </div>

              {/* Breakdown Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-900/80 p-3 rounded-lg border border-emerald-500/30">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="font-medium text-emerald-300">Operating</span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  </div>
                  <div className="text-lg font-bold font-mono text-white mt-1">
                    {formatDuration(stateDurations.operatingSec)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {((stateDurations.operatingSec / stateDurations.totalTracked) * 100).toFixed(1)}% of tracked time
                  </div>
                </div>

                <div className="bg-slate-900/80 p-3 rounded-lg border border-amber-500/30">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="font-medium text-amber-300">Idle Running</span>
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  </div>
                  <div className="text-lg font-bold font-mono text-amber-400 mt-1">
                    {formatDuration(stateDurations.idleSec)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {((stateDurations.idleSec / stateDurations.totalTracked) * 100).toFixed(1)}% idle loss window
                  </div>
                </div>

                <div className="bg-slate-900/80 p-3 rounded-lg border border-orange-500/30">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="font-medium text-orange-300">Low Load</span>
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-400" />
                  </div>
                  <div className="text-lg font-bold font-mono text-orange-400 mt-1">
                    {formatDuration(stateDurations.lowLoadSec)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {((stateDurations.lowLoadSec / stateDurations.totalTracked) * 100).toFixed(1)}% inefficient run
                  </div>
                </div>

                <div className="bg-slate-900/80 p-3 rounded-lg border border-rose-500/30">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="font-medium text-rose-300">Abnormal Power</span>
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                  </div>
                  <div className="text-lg font-bold font-mono text-rose-400 mt-1">
                    {formatDuration(stateDurations.abnormalSec)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {((stateDurations.abnormalSec / stateDurations.totalTracked) * 100).toFixed(1)}% power anomaly
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-slate-500 text-xs">
              No state duration telemetry accumulated in this observation interval.
            </div>
          )}
        </div>
      ) : (
        <div className="relative bg-slate-950/70 border border-slate-800/80 rounded-lg p-3">
          {isLoading ? (
            <div className="h-56 flex flex-col items-center justify-center text-slate-500 text-xs">
              <RotateCw className="w-6 h-6 animate-spin text-sky-500 mb-2" />
              <span>Loading operational metrics...</span>
            </div>
          ) : sortedData.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-slate-500 text-xs">
              <Gauge className="w-8 h-8 text-slate-600 mb-2" />
              <span className="font-medium text-slate-400">No operational records available</span>
            </div>
          ) : activeTab === "rpm" && !rpmMetrics.hasRpm ? (
            <div className="h-56 flex flex-col items-center justify-center text-slate-400 text-xs p-6 text-center space-y-2">
              <RotateCw className="w-8 h-8 text-purple-400/60 mb-1" />
              <div className="text-white font-semibold text-sm">RPM Sensor Channel Unmeasured</div>
              <p className="text-slate-400 max-w-md">
                Drive shaft RPM is currently unmeasured for this asset. Condition monitoring evaluates electrical volatility and thermal drift. Direct rotational speed tracking requires an optical encoder or magnetic pick-up retrofit.
              </p>
              <span className="text-[11px] font-mono text-purple-400 bg-purple-950/40 px-2.5 py-1 rounded border border-purple-800/50">
                Channel: UNMEASURED_NOT_INSTALLED
              </span>
            </div>
          ) : (
            <div>
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full h-auto select-none overflow-visible"
                onMouseLeave={() => setHoverIndex(null)}
                role="img"
                aria-label="Operational Performance Graph"
              >
                {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
                  const y = padTop + chartH * (1 - ratio);
                  return (
                    <line
                      key={ratio}
                      x1={padLeft}
                      y1={y}
                      x2={padLeft + chartW}
                      y2={y}
                      stroke="#1e293b"
                      strokeWidth="1"
                      strokeDasharray={ratio === 0 ? undefined : "3 3"}
                    />
                  );
                })}

                {timeTicks.map((tick, i) => (
                  <g key={i}>
                    <line
                      x1={tick.x}
                      y1={padTop + chartH}
                      x2={tick.x}
                      y2={padTop + chartH + 5}
                      stroke="#475569"
                      strokeWidth="1"
                    />
                    <text
                      x={tick.x}
                      y={padTop + chartH + 18}
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {tick.label}
                    </text>
                  </g>
                ))}

                {activeTab === "load" && (
                  <>
                    {[0, 25, 50, 75, 100].map((val) => {
                      const y = padTop + chartH - (val / loadMetrics.maxScale) * chartH;
                      return (
                        <text
                          key={val}
                          x={padLeft - 8}
                          y={y + 3}
                          textAnchor="end"
                          fill="#94a3b8"
                          fontSize="10"
                          fontFamily="monospace"
                        >
                          {val}%
                        </text>
                      );
                    })}

                    <line
                      x1={padLeft}
                      y1={padTop + chartH - (100 / loadMetrics.maxScale) * chartH}
                      x2={padLeft + chartW}
                      y2={padTop + chartH - (100 / loadMetrics.maxScale) * chartH}
                      stroke="#38bdf8"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                    />

                    {loadMetrics.paths.map((pStr, i) => (
                      <path
                        key={i}
                        d={pStr}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    ))}
                  </>
                )}

                {activeTab === "temp" && (
                  <>
                    {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
                      const y = padTop + chartH * (1 - ratio);
                      const val = ratio * tempMetrics.maxScale;
                      return (
                        <text
                          key={ratio}
                          x={padLeft - 8}
                          y={y + 3}
                          textAnchor="end"
                          fill="#f59e0b"
                          fontSize="10"
                          fontFamily="monospace"
                        >
                          {val.toFixed(0)} °C
                        </text>
                      );
                    })}

                    <line
                      x1={padLeft}
                      y1={padTop + chartH - (70 / tempMetrics.maxScale) * chartH}
                      x2={padLeft + chartW}
                      y2={padTop + chartH - (70 / tempMetrics.maxScale) * chartH}
                      stroke="#f43f5e"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={padLeft + chartW - 5}
                      y={padTop + chartH - (70 / tempMetrics.maxScale) * chartH - 5}
                      textAnchor="end"
                      fill="#fda4af"
                      fontSize="9"
                      fontFamily="monospace"
                    >
                      Warning Limit: 70.0 °C
                    </text>

                    {tempMetrics.paths.map((pStr, i) => (
                      <path
                        key={i}
                        d={pStr}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    ))}
                  </>
                )}

                {activeTab === "rpm" && (
                  <>
                    {[0, 0.5, 1.0].map((ratio) => {
                      const y = padTop + chartH * (1 - ratio);
                      const val = ratio * rpmMetrics.maxScale;
                      return (
                        <text
                          key={ratio}
                          x={padLeft - 8}
                          y={y + 3}
                          textAnchor="end"
                          fill="#a78bfa"
                          fontSize="10"
                          fontFamily="monospace"
                        >
                          {Math.round(val)} RPM
                        </text>
                      );
                    })}

                    {rpmMetrics.paths.map((pStr, i) => (
                      <path
                        key={i}
                        d={pStr}
                        fill="none"
                        stroke="#a78bfa"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    ))}
                  </>
                )}

                {sortedData.map((_d, idx) => {
                  const t = timestamps[idx];
                  const x = padLeft + ((t - minTime) / timeSpan) * chartW;
                  const hitWidth = Math.max(12, chartW / sortedData.length);
                  return (
                    <rect
                      key={idx}
                      x={x - hitWidth / 2}
                      y={padTop}
                      width={hitWidth}
                      height={chartH}
                      fill="transparent"
                      className="cursor-crosshair"
                      onMouseEnter={() => setHoverIndex(idx)}
                    />
                  );
                })}

                {hoverIndex !== null && (
                  <line
                    x1={padLeft + ((timestamps[hoverIndex] - minTime) / timeSpan) * chartW}
                    y1={padTop}
                    x2={padLeft + ((timestamps[hoverIndex] - minTime) / timeSpan) * chartW}
                    y2={padTop + chartH}
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                    pointerEvents="none"
                  />
                )}
              </svg>

              {activeRecord && (
                <div className="mt-3 bg-slate-900/90 border border-slate-700/80 rounded-lg p-3 text-xs flex flex-wrap items-center justify-between gap-4 font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-sans">Timestamp:</span>
                    <span className="text-white font-semibold">
                      {formatTimestamp(activeRecord.timestamp)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div>
                      <span className="text-slate-400">Load: </span>
                      <span className="text-sky-400 font-bold">
                        {formatPercent(activeRecord.load_percent)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Temp: </span>
                      <span className="text-amber-400 font-semibold">
                        {activeRecord.temperature !== null ? `${activeRecord.temperature.toFixed(1)} °C` : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">RPM: </span>
                      <span className="text-purple-400 font-semibold">
                        {activeRecord.rpm !== null ? `${Math.round(activeRecord.rpm)} RPM` : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">State: </span>
                      <span className="text-slate-200 capitalize font-sans">
                        {activeRecord.operating_state || "—"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
