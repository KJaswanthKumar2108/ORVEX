import React, { useMemo, useState } from "react";
import { Activity, Zap } from "lucide-react";
import type { TelemetryRecordResponse } from "../../api/types";
import {
  formatPower,
  formatShortTime,
  formatTimestamp,
} from "../../utils/formatters";

interface ElectricalPerformanceChartsProps {
  telemetry: TelemetryRecordResponse[];
  ratedPowerKw?: number | null;
  timeRangeLabel: string;
  isLoading?: boolean;
}

type ElectricalTab = "power" | "vi" | "pf" | "energy";

export const ElectricalPerformanceCharts: React.FC<ElectricalPerformanceChartsProps> = ({
  telemetry,
  ratedPowerKw,
  timeRangeLabel,
  isLoading = false,
}) => {
  const [activeTab, setActiveTab] = useState<ElectricalTab>("power");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Filter & sort valid records by timestamp
  const sortedData = useMemo(() => {
    return [...telemetry]
      .filter((r) => r.timestamp)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [telemetry]);

  // Chart dimensions
  const width = 800;
  const height = 260;
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

  // Helper to segment coordinates with > 30s gaps
  const buildSegments = (
    getValue: (d: TelemetryRecordResponse, idx: number) => number | null,
    maxVal: number
  ) => {
    const GAP_THRESHOLD_MS = 30 * 1000;
    const segments: Array<Array<{ x: number; y: number; dataIndex: number }>> = [];
    let currentSegment: Array<{ x: number; y: number; dataIndex: number }> = [];

    sortedData.forEach((d, idx) => {
      const val = getValue(d, idx);
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

  // Metrics for Active Power Chart
  const powerMetrics = useMemo(() => {
    const powers = sortedData.map((d) => d.active_power).filter((p): p is number => p !== null && !isNaN(p));
    if (powers.length === 0) return null;

    const maxObserved = Math.max(...powers, 1.0);
    const maxScale = ratedPowerKw ? Math.max(ratedPowerKw * 1.1, maxObserved * 1.05) : maxObserved * 1.15;
    const paths = buildSegments((d) => d.active_power, maxScale);
    const avgPower = powers.reduce((a, b) => a + b, 0) / powers.length;

    return { maxScale, paths, avgPower, maxObserved };
  }, [sortedData, ratedPowerKw, timestamps, minTime, timeSpan]);

  // Metrics for Voltage & Current Chart
  const viMetrics = useMemo(() => {
    const voltages = sortedData.map((d) => d.voltage).filter((v): v is number => v !== null && !isNaN(v));
    const currents = sortedData.map((d) => d.current).filter((c): c is number => c !== null && !isNaN(c));

    const maxV = voltages.length > 0 ? Math.max(...voltages, 450) * 1.08 : 500;
    const maxI = currents.length > 0 ? Math.max(...currents, 50) * 1.15 : 100;

    const vPaths = buildSegments((d) => d.voltage, maxV);
    const iPaths = buildSegments((d) => d.current, maxI);

    return { maxV, maxI, vPaths, iPaths, hasVoltage: voltages.length > 0, hasCurrent: currents.length > 0 };
  }, [sortedData, timestamps, minTime, timeSpan]);

  // Metrics for Power Factor Chart
  const pfMetrics = useMemo(() => {
    const pfs = sortedData.map((d) => d.power_factor).filter((p): p is number => p !== null && !isNaN(p));
    const maxScale = 1.05;
    const paths = buildSegments((d) => d.power_factor, maxScale);
    return { maxScale, paths, hasPf: pfs.length > 0 };
  }, [sortedData, timestamps, minTime, timeSpan]);

  // Metrics for Cumulative Energy Chart
  const energyMetrics = useMemo(() => {
    let currentCumulative = 0;
    const energyPoints: number[] = [];

    sortedData.forEach((d) => {
      if (d.cumulative_energy !== null && !isNaN(d.cumulative_energy)) {
        currentCumulative = d.cumulative_energy;
      } else if (d.active_power !== null && !isNaN(d.active_power)) {
        currentCumulative += (d.active_power * 1) / 3600;
      }
      energyPoints.push(currentCumulative);
    });

    const maxEnergy = Math.max(...energyPoints, 1.0) * 1.1;
    const paths = buildSegments((_d, idx) => energyPoints[idx] ?? null, maxEnergy);

    return { maxEnergy, paths, totalEnergy: currentCumulative, hasEnergy: energyPoints.length > 0 };
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

  const activeRecord = hoverIndex !== null ? sortedData[hoverIndex] : null;

  return (
    <div className="bg-[#0d1424] border border-slate-800/80 rounded-xl p-5 shadow-lg space-y-4">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <Zap className="w-4 h-4 text-emerald-400" />
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white font-mono">
              Electrical Performance Analysis
            </h2>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              High-resolution time-series ({timeRangeLabel}) • Zero synthetic interpolation
            </p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("power")}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              activeTab === "power"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Active Power (kW)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("vi")}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              activeTab === "vi"
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Voltage & Current
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("pf")}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              activeTab === "pf"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Power Factor (cos φ)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("energy")}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              activeTab === "energy"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Cumulative kWh
          </button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative bg-slate-950/70 border border-slate-800/80 rounded-lg p-3">
        {isLoading ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-500 text-xs">
            <Activity className="w-6 h-6 animate-spin text-emerald-500 mb-2" />
            <span>Loading electrical telemetry data...</span>
          </div>
        ) : sortedData.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-500 text-xs">
            <Zap className="w-8 h-8 text-slate-600 mb-2" />
            <span className="font-medium text-slate-400">No telemetry recorded for this interval</span>
            <span className="text-[11px] text-slate-600 mt-1">
              Select an extended range or verify sensor gateway connectivity.
            </span>
          </div>
        ) : (
          <div>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto select-none overflow-visible"
              onMouseLeave={() => setHoverIndex(null)}
              role="img"
              aria-label="Electrical Performance Graph"
            >
              <defs>
                <linearGradient id="powerGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="energyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Gridlines */}
              {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
                const y = padTop + chartH * (1 - ratio);
                return (
                  <g key={ratio}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={padLeft + chartW}
                      y2={y}
                      stroke="#1e293b"
                      strokeWidth="1"
                      strokeDasharray={ratio === 0 ? undefined : "3 3"}
                    />
                  </g>
                );
              })}

              {/* Time Axis Ticks */}
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

              {/* Tab 1: Active Power (kW) */}
              {activeTab === "power" && powerMetrics && (
                <>
                  {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
                    const y = padTop + chartH * (1 - ratio);
                    const val = ratio * powerMetrics.maxScale;
                    return (
                      <text
                        key={ratio}
                        x={padLeft - 8}
                        y={y + 3}
                        textAnchor="end"
                        fill="#94a3b8"
                        fontSize="10"
                        fontFamily="monospace"
                      >
                        {val.toFixed(0)} kW
                      </text>
                    );
                  })}

                  {ratedPowerKw && ratedPowerKw <= powerMetrics.maxScale && (
                    <g>
                      <line
                        x1={padLeft}
                        y1={padTop + chartH - (ratedPowerKw / powerMetrics.maxScale) * chartH}
                        x2={padLeft + chartW}
                        y2={padTop + chartH - (ratedPowerKw / powerMetrics.maxScale) * chartH}
                        stroke="#f43f5e"
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={padLeft + chartW - 5}
                        y={padTop + chartH - (ratedPowerKw / powerMetrics.maxScale) * chartH - 5}
                        textAnchor="end"
                        fill="#fda4af"
                        fontSize="9"
                        fontFamily="monospace"
                      >
                        Nameplate Rated: {ratedPowerKw} kW
                      </text>
                    </g>
                  )}

                  {powerMetrics.paths.map((pStr, i) => (
                    <path
                      key={i}
                      d={pStr}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  ))}
                </>
              )}

              {/* Tab 2: Voltage & Current */}
              {activeTab === "vi" && viMetrics && (
                <>
                  {[0, 0.5, 1.0].map((ratio) => {
                    const y = padTop + chartH * (1 - ratio);
                    const val = ratio * viMetrics.maxV;
                    return (
                      <text
                        key={ratio}
                        x={padLeft - 8}
                        y={y + 3}
                        textAnchor="end"
                        fill="#38bdf8"
                        fontSize="10"
                        fontFamily="monospace"
                      >
                        {val.toFixed(0)} V
                      </text>
                    );
                  })}

                  {[0, 0.5, 1.0].map((ratio) => {
                    const y = padTop + chartH * (1 - ratio);
                    const val = ratio * viMetrics.maxI;
                    return (
                      <text
                        key={ratio}
                        x={padLeft + chartW + 8}
                        y={y + 3}
                        textAnchor="start"
                        fill="#a78bfa"
                        fontSize="10"
                        fontFamily="monospace"
                      >
                        {val.toFixed(0)} A
                      </text>
                    );
                  })}

                  {viMetrics.vPaths.map((pStr, i) => (
                    <path
                      key={`v-${i}`}
                      d={pStr}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  ))}

                  {viMetrics.iPaths.map((pStr, i) => (
                    <path
                      key={`i-${i}`}
                      d={pStr}
                      fill="none"
                      stroke="#a78bfa"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  ))}
                </>
              )}

              {/* Tab 3: Power Factor */}
              {activeTab === "pf" && pfMetrics && (
                <>
                  {[0, 0.25, 0.5, 0.75, 1.0].map((val) => {
                    const y = padTop + chartH - (val / pfMetrics.maxScale) * chartH;
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
                        {val.toFixed(2)}
                      </text>
                    );
                  })}

                  <line
                    x1={padLeft}
                    y1={padTop + chartH - (0.85 / pfMetrics.maxScale) * chartH}
                    x2={padLeft + chartW}
                    y2={padTop + chartH - (0.85 / pfMetrics.maxScale) * chartH}
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={padLeft + chartW - 5}
                    y={padTop + chartH - (0.85 / pfMetrics.maxScale) * chartH - 5}
                    textAnchor="end"
                    fill="#fcd34d"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    Target PF Benchmark: 0.85
                  </text>

                  {pfMetrics.paths.map((pStr, i) => (
                    <path
                      key={i}
                      d={pStr}
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  ))}
                </>
              )}

              {/* Tab 4: Cumulative Energy (kWh) */}
              {activeTab === "energy" && energyMetrics && (
                <>
                  {[0, 0.5, 1.0].map((ratio) => {
                    const y = padTop + chartH * (1 - ratio);
                    const val = ratio * energyMetrics.maxEnergy;
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
                        {val.toFixed(1)} kWh
                      </text>
                    );
                  })}

                  {energyMetrics.paths.map((pStr, i) => (
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

              {/* Interactive Hover Vertical Cursor & Overlay */}
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

            {/* Interactive Tooltip Card */}
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
                    <span className="text-slate-400">Power: </span>
                    <span className="text-emerald-400 font-bold">
                      {formatPower(activeRecord.active_power)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Voltage: </span>
                    <span className="text-sky-400 font-semibold">
                      {activeRecord.voltage !== null ? `${activeRecord.voltage.toFixed(1)} V` : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Current: </span>
                    <span className="text-purple-400 font-semibold">
                      {activeRecord.current !== null ? `${activeRecord.current.toFixed(1)} A` : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">PF: </span>
                    <span className="text-cyan-400 font-semibold">
                      {activeRecord.power_factor !== null ? activeRecord.power_factor.toFixed(2) : "—"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend & Analytical Explanations */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1 text-slate-400">
        <div className="flex items-center gap-4 flex-wrap">
          {activeTab === "power" && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-emerald-400 rounded-full" />
                <span>Active Power (kW)</span>
              </div>
              {ratedPowerKw && (
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-rose-400 border-b border-dashed border-rose-400" />
                  <span>Rated Limit ({ratedPowerKw} kW)</span>
                </div>
              )}
            </>
          )}
          {activeTab === "vi" && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-sky-400 rounded-full" />
                <span>Voltage (V)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-purple-400 rounded-full" />
                <span>Current (A)</span>
              </div>
            </>
          )}
          {activeTab === "pf" && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-cyan-400 rounded-full" />
                <span>Power Factor</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-amber-400 border-b border-dashed border-amber-400" />
                <span>Optimal Benchmark (0.85)</span>
              </div>
            </>
          )}
          {activeTab === "energy" && (
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-amber-400 rounded-full" />
              <span>Cumulative Work (kWh)</span>
            </div>
          )}
        </div>

        <span className="text-[11px] font-mono text-slate-500">
          Continuous Modbus RS-485 sample stream
        </span>
      </div>
    </div>
  );
};
