import React, { useMemo, useState } from "react";
import { Activity, Clock, Zap } from "lucide-react";
import type { TelemetryRecordResponse, WastageEventResponse } from "../../api/types";
import { formatPower, formatTimestamp } from "../../utils/formatters";

interface FleetEnergyOverTimeChartProps {
  telemetry: TelemetryRecordResponse[];
  wastageEvents?: WastageEventResponse[];
  timeRangeLabel: string;
  ratedPowerKw?: number | null;
  machineName?: string;
  totalEnergyKwh?: number | null;
  wastedEnergyKwh?: number | null;
  isLoading?: boolean;
}

export const FleetEnergyOverTimeChart: React.FC<FleetEnergyOverTimeChartProps> = ({
  telemetry,
  wastageEvents = [],
  timeRangeLabel,
  ratedPowerKw,
  machineName,
  totalEnergyKwh,
  wastedEnergyKwh,
  isLoading = false,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Filter out invalid records, sort ascending by timestamp
  const sortedData = useMemo(() => {
    return [...telemetry]
      .filter((r) => r.timestamp && r.active_power !== null && !isNaN(r.active_power))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [telemetry]);

  // Dimensions
  const width = 800;
  const height = 260;
  const padLeft = 60;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 40;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Calculate metrics and paths
  const chartMetrics = useMemo(() => {
    if (sortedData.length === 0) {
      return null;
    }

    const timestamps = sortedData.map((d) => new Date(d.timestamp).getTime());
    const powers = sortedData.map((d) => d.active_power || 0);

    const minTime = timestamps[0];
    const maxTime = timestamps[timestamps.length - 1];
    const timeSpan = Math.max(1000, maxTime - minTime);

    const maxObservedPower = Math.max(...powers, 1.0);
    const maxScalePower = ratedPowerKw
      ? Math.max(ratedPowerKw * 1.1, maxObservedPower * 1.05)
      : maxObservedPower * 1.15;

    const avgPower = powers.reduce((a, b) => a + b, 0) / powers.length;
    const peakPower = maxObservedPower;

    // Convert data to segmented paths breaking at sample gaps > 45 seconds
    const GAP_THRESHOLD_MS = 45 * 1000;
    const segments: Array<Array<{ x: number; y: number; dataIndex: number }>> = [];
    let currentSegment: Array<{ x: number; y: number; dataIndex: number }> = [];

    sortedData.forEach((d, idx) => {
      const t = timestamps[idx];
      const p = d.active_power || 0;

      const x = padLeft + ((t - minTime) / timeSpan) * chartW;
      const y = padTop + chartH - (p / maxScalePower) * chartH;

      if (currentSegment.length > 0) {
        const prevT = timestamps[idx - 1];
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

    // Wastage event highlight boxes mapped to x coordinates
    const wastageIntervals: Array<{ xStart: number; width: number; reason: string }> = [];
    wastageEvents.forEach((ev) => {
      const evStart = new Date(ev.start_time).getTime();
      const evEnd = ev.end_time ? new Date(ev.end_time).getTime() : maxTime;

      if (evEnd >= minTime && evStart <= maxTime) {
        const clampedStart = Math.max(minTime, evStart);
        const clampedEnd = Math.min(maxTime, evEnd);

        const x1 = padLeft + ((clampedStart - minTime) / timeSpan) * chartW;
        const x2 = padLeft + ((clampedEnd - minTime) / timeSpan) * chartW;
        const boxWidth = Math.max(2, x2 - x1);

        wastageIntervals.push({
          xStart: x1,
          width: boxWidth,
          reason: ev.detection_reason,
        });
      }
    });

    return {
      minTime,
      maxTime,
      timeSpan,
      maxScalePower,
      avgPower,
      peakPower,
      segments,
      wastageIntervals,
    };
  }, [sortedData, ratedPowerKw, chartW, chartH, wastageEvents]);

  // Selected hover point
  const hoverPoint = useMemo(() => {
    if (hoverIndex === null || !chartMetrics || !sortedData[hoverIndex]) {
      return null;
    }
    const d = sortedData[hoverIndex];
    const t = new Date(d.timestamp).getTime();
    const p = d.active_power || 0;

    const x =
      padLeft + ((t - chartMetrics.minTime) / chartMetrics.timeSpan) * chartW;
    const y =
      padTop + chartH - (p / chartMetrics.maxScalePower) * chartH;

    return {
      x,
      y,
      data: d,
    };
  }, [hoverIndex, chartMetrics, sortedData, chartW, chartH]);

  // Generate SVG path strings for segments
  const pathStrings = useMemo(() => {
    if (!chartMetrics) return { lines: [], areas: [] };

    const lines: string[] = [];
    const areas: string[] = [];
    const baselineY = padTop + chartH;

    chartMetrics.segments.forEach((seg) => {
      if (seg.length === 0) return;

      const lineD = seg.reduce((acc, pt, i) => {
        return i === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      }, "");
      lines.push(lineD);

      const firstX = seg[0].x.toFixed(1);
      const lastX = seg[seg.length - 1].x.toFixed(1);
      const areaD = `${lineD} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;
      areas.push(areaD);
    });

    return { lines, areas };
  }, [chartMetrics, padTop, chartH]);

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-3">
      {/* Header & Stats Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white tracking-wide">
              {machineName ? `Active Power & Wastage Trend (${machineName})` : "Fleet Power & Energy Trend"}
            </h3>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {timeRangeLabel}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Vector active power integration with overlaid deterministic wastage zones
          </p>
        </div>

        {/* Quick KPI pills */}
        <div className="flex items-center gap-3 text-xs font-mono self-start sm:self-auto">
          {chartMetrics && (
            <>
              <div className="text-slate-400">
                Avg: <span className="text-emerald-400 font-bold">{formatPower(chartMetrics.avgPower)}</span>
              </div>
              <div className="text-slate-400">
                Peak: <span className="text-amber-400 font-bold">{formatPower(chartMetrics.peakPower)}</span>
              </div>
            </>
          )}
          {totalEnergyKwh !== null && totalEnergyKwh !== undefined && (
            <div className="text-slate-400 hidden lg:block">
              Energy: <span className="text-cyan-400 font-bold">{totalEnergyKwh.toFixed(1)} kWh</span>
            </div>
          )}
          {wastedEnergyKwh !== null && wastedEnergyKwh !== undefined && wastedEnergyKwh > 0 && (
            <div className="text-slate-400 hidden xl:block">
              Wastage: <span className="text-amber-400 font-bold">{wastedEnergyKwh.toFixed(1)} kWh</span>
            </div>
          )}
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative w-full aspect-[800/260] min-h-[220px]">
        {isLoading && sortedData.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-slate-500 font-mono text-xs">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Streaming telemetry time-series...</span>
            </div>
          </div>
        ) : !chartMetrics ? (
          <div className="w-full h-full flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 p-6 text-center">
            <Zap className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-300">
              Insufficient Telemetry in Selected Window
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Sensor data is continuously monitored. Start hardware gateway or simulator to stream live CT current and power readings.
            </p>
          </div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-full overflow-visible select-none"
              onMouseLeave={() => setHoverIndex(null)}
            >
              <defs>
                <linearGradient id="fleetPowerAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.30" />
                  <stop offset="90%" stopColor="#10b981" stopOpacity="0.01" />
                </linearGradient>
                <pattern id="wastageHatch" width="8" height="8" patternUnits="userSpaceOnUse">
                  <path d="M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4" stroke="#f59e0b" strokeWidth="1" strokeOpacity="0.4" />
                </pattern>
              </defs>

              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
                const y = padTop + chartH * (1 - frac);
                const powerVal = chartMetrics.maxScalePower * frac;
                return (
                  <g key={`y-${frac}`}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={padLeft + chartW}
                      y2={y}
                      stroke="#334155"
                      strokeWidth="1"
                      strokeDasharray={frac === 0 ? "none" : "3 3"}
                      strokeOpacity={frac === 0 ? 0.7 : 0.3}
                    />
                    <text
                      x={padLeft - 8}
                      y={y + 3}
                      fill="#94a3b8"
                      fontSize="10"
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      {powerVal.toFixed(0)} kW
                    </text>
                  </g>
                );
              })}

              {/* Rated Power Threshold Reference */}
              {ratedPowerKw && ratedPowerKw <= chartMetrics.maxScalePower && (
                <g>
                  {(() => {
                    const ratedY =
                      padTop +
                      chartH -
                      (ratedPowerKw / chartMetrics.maxScalePower) * chartH;
                    return (
                      <>
                        <line
                          x1={padLeft}
                          y1={ratedY}
                          x2={padLeft + chartW}
                          y2={ratedY}
                          stroke="#ef4444"
                          strokeWidth="1.5"
                          strokeDasharray="4 4"
                          strokeOpacity={0.8}
                        />
                        <text
                          x={padLeft + chartW - 6}
                          y={ratedY - 4}
                          fill="#f87171"
                          fontSize="9"
                          fontFamily="monospace"
                          textAnchor="end"
                        >
                          Rated Capacity: {ratedPowerKw.toFixed(0)} kW
                        </text>
                      </>
                    );
                  })()}
                </g>
              )}

              {/* Shaded Avoidable Wastage Highlight Zones */}
              {chartMetrics.wastageIntervals.map((w, idx) => (
                <g key={`wastage-zone-${idx}`}>
                  <rect
                    x={w.xStart}
                    y={padTop}
                    width={w.width}
                    height={chartH}
                    fill="#f59e0b"
                    fillOpacity="0.15"
                  />
                  <rect
                    x={w.xStart}
                    y={padTop}
                    width={w.width}
                    height={chartH}
                    fill="url(#wastageHatch)"
                  />
                  <line
                    x1={w.xStart}
                    y1={padTop}
                    x2={w.xStart}
                    y2={padTop + chartH}
                    stroke="#f59e0b"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                    strokeOpacity={0.7}
                  />
                </g>
              ))}

              {/* Area Fills under active curve */}
              {pathStrings.areas.map((d, i) => (
                <path key={`area-${i}`} d={d} fill="url(#fleetPowerAreaGrad)" />
              ))}

              {/* Main Active Power Line */}
              {pathStrings.lines.map((d, i) => (
                <path
                  key={`line-${i}`}
                  d={d}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

              {/* Hover Crosshair & Pointer */}
              {hoverPoint && (
                <g>
                  <line
                    x1={hoverPoint.x}
                    y1={padTop}
                    x2={hoverPoint.x}
                    y2={padTop + chartH}
                    stroke="#38bdf8"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                  <circle
                    cx={hoverPoint.x}
                    cy={hoverPoint.y}
                    r="4.5"
                    fill="#38bdf8"
                    stroke="#0b0f19"
                    strokeWidth="2"
                  />
                </g>
              )}

              {/* Invisible Overlay for Mouse Tracking */}
              {sortedData.map((d, idx) => {
                const t = new Date(d.timestamp).getTime();
                const x =
                  padLeft +
                  ((t - chartMetrics.minTime) / chartMetrics.timeSpan) * chartW;
                const colW = Math.max(6, chartW / sortedData.length);
                return (
                  <rect
                    key={`hit-${idx}`}
                    x={x - colW / 2}
                    y={padTop}
                    width={colW}
                    height={chartH}
                    fill="transparent"
                    onMouseEnter={() => setHoverIndex(idx)}
                  />
                );
              })}
            </svg>

            {/* Floating Cursor Tooltip */}
            {hoverPoint && (
              <div
                className="absolute z-20 pointer-events-none bg-slate-950/95 border border-slate-700/80 rounded-lg p-2.5 shadow-xl text-xs space-y-1 backdrop-blur-sm"
                style={{
                  left: `${Math.min(Math.max(10, (hoverPoint.x / width) * 100), 75)}%`,
                  top: `${Math.min(Math.max(10, (hoverPoint.y / height) * 100), 65)}%`,
                }}
              >
                <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                  <Clock className="w-3 h-3 text-cyan-400" />
                  <span>{formatTimestamp(hoverPoint.data.timestamp)}</span>
                </div>
                <div className="flex items-center justify-between gap-4 font-mono">
                  <span className="text-slate-400">Active Power:</span>
                  <span className="text-emerald-400 font-bold">
                    {formatPower(hoverPoint.data.active_power)}
                  </span>
                </div>
                {hoverPoint.data.operating_state && (
                  <div className="flex items-center justify-between gap-4 text-[11px]">
                    <span className="text-slate-400">State:</span>
                    <span className="font-mono text-slate-200 capitalize">
                      {hoverPoint.data.operating_state}
                    </span>
                  </div>
                )}
                {hoverPoint.data.load_percent !== null && (
                  <div className="flex items-center justify-between gap-4 text-[11px]">
                    <span className="text-slate-400">Load Factor:</span>
                    <span className="font-mono text-cyan-400">
                      {hoverPoint.data.load_percent.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Chart Legend */}
      <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="w-3 h-0.5 bg-emerald-400" />
            <span>Measured Power (kW)</span>
          </div>
          {ratedPowerKw && (
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="w-3 h-0.5 bg-rose-400 stroke-dasharray" />
              <span>Rated Limit</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500/40" />
            <span>Avoidable Wastage Zone</span>
          </div>
        </div>

        <div className="font-mono text-[11px] text-slate-500">
          Deterministic 1Hz integration
        </div>
      </div>
    </div>
  );
};
