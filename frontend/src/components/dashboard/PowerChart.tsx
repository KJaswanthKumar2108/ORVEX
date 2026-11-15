import React, { useMemo, useState } from "react";
import { Activity, Clock, Zap } from "lucide-react";
import type { TelemetryRecordResponse } from "../../api/types";
import { formatPower, formatShortTime, formatTimestamp } from "../../utils/formatters";

interface PowerChartProps {
  telemetry: TelemetryRecordResponse[];
  timeRangeLabel: string;
  ratedPowerKw?: number | null;
  title?: string;
  machineName?: string;
  isLoading?: boolean;
}

export const PowerChart: React.FC<PowerChartProps> = ({
  telemetry,
  timeRangeLabel,
  ratedPowerKw,
  title = "Active Power Profile (kW)",
  machineName,
  isLoading = false,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Filter out records without valid timestamps or power values, sort ascending
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

  // Calculate scaling & gap paths
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

    // Convert data to segmented paths breaking at sample gaps > 30 seconds
    const GAP_THRESHOLD_MS = 30 * 1000;
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

    // Build SVG path strings
    const pathStrings = segments.map((seg) => {
      if (seg.length === 0) return "";
      if (seg.length === 1) {
        return `M ${seg[0].x - 1} ${seg[0].y} L ${seg[0].x + 1} ${seg[0].y}`;
      }
      return seg.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" ");
    });

    // Rated power horizontal line Y position
    const ratedY =
      ratedPowerKw && ratedPowerKw <= maxScalePower
        ? padTop + chartH - (ratedPowerKw / maxScalePower) * chartH
        : null;

    return {
      minTime,
      maxTime,
      maxScalePower,
      avgPower,
      peakPower,
      segments,
      pathStrings,
      ratedY,
    };
  }, [sortedData, ratedPowerKw, chartW, chartH, padLeft, padTop]);

  const activeRecord = hoverIndex !== null && sortedData[hoverIndex] ? sortedData[hoverIndex] : null;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 sm:p-5 shadow-sm">
      {/* Chart Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 mb-2 border-b border-slate-800/80 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white tracking-wide">{title}</h3>
            {machineName && (
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                {machineName}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            <span>Time Range: {timeRangeLabel}</span>
            {chartMetrics && (
              <>
                <span>•</span>
                <span>{sortedData.length.toLocaleString()} measurements</span>
              </>
            )}
          </div>
        </div>

        {/* Quick telemetry aggregates */}
        {chartMetrics && (
          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-slate-500">AVG: </span>
              <span className="text-slate-200 font-medium">{formatPower(chartMetrics.avgPower)}</span>
            </div>
            <div>
              <span className="text-slate-500">PEAK: </span>
              <span className="text-emerald-400 font-medium">{formatPower(chartMetrics.peakPower)}</span>
            </div>
            {ratedPowerKw && (
              <div className="hidden sm:block">
                <span className="text-slate-500">RATED: </span>
                <span className="text-sky-400 font-medium">{formatPower(ratedPowerKw)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chart Area */}
      {isLoading ? (
        <div className="h-64 flex items-center justify-center text-slate-400">
          <div className="flex items-center gap-2 text-xs">
            <Activity className="w-4 h-4 animate-spin text-emerald-400" />
            <span>Loading telemetry stream...</span>
          </div>
        </div>
      ) : sortedData.length === 0 || !chartMetrics ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-md">
          <Activity className="w-8 h-8 stroke-1 text-slate-600 mb-2" />
          <p className="text-sm text-slate-400 font-medium">No telemetry measurements recorded</p>
          <p className="text-xs text-slate-500 mt-1">
            No continuous telemetry data matches the selected time range ({timeRangeLabel}).
          </p>
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-64 overflow-visible select-none"
            onMouseLeave={() => setHoverIndex(null)}
          >
            {/* Background Grid Lines & Y-axis labels */}
            {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
              const yVal = padTop + chartH - ratio * chartH;
              const powerVal = ratio * chartMetrics.maxScalePower;
              return (
                <g key={ratio}>
                  <line
                    x1={padLeft}
                    y1={yVal}
                    x2={width - padRight}
                    y2={yVal}
                    stroke="#1e293b"
                    strokeWidth="1"
                    strokeDasharray={ratio === 0 ? "none" : "3,3"}
                  />
                  <text
                    x={padLeft - 8}
                    y={yVal + 3}
                    textAnchor="end"
                    className="text-[10px] fill-slate-500 font-mono"
                  >
                    {powerVal.toFixed(0)} kW
                  </text>
                </g>
              );
            })}

            {/* Rated Power Guideline */}
            {chartMetrics.ratedY !== null && (
              <g>
                <line
                  x1={padLeft}
                  y1={chartMetrics.ratedY}
                  x2={width - padRight}
                  y2={chartMetrics.ratedY}
                  stroke="#38bdf8"
                  strokeWidth="1.2"
                  strokeDasharray="4,4"
                  opacity="0.8"
                />
                <text
                  x={width - padRight + 4}
                  y={chartMetrics.ratedY + 3}
                  textAnchor="start"
                  className="text-[9px] fill-sky-400 font-mono"
                >
                  Rated ({ratedPowerKw} kW)
                </text>
              </g>
            )}

            {/* Continuous Line Segments (Gap-Aware) */}
            {chartMetrics.pathStrings.map((dStr, idx) => (
              <path
                key={idx}
                d={dStr}
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {/* Time labels on X-axis */}
            <text
              x={padLeft}
              y={height - 12}
              textAnchor="start"
              className="text-[10px] fill-slate-500 font-mono"
            >
              {formatShortTime(new Date(chartMetrics.minTime).toISOString())}
            </text>
            <text
              x={width - padRight}
              y={height - 12}
              textAnchor="end"
              className="text-[10px] fill-slate-500 font-mono"
            >
              {formatShortTime(new Date(chartMetrics.maxTime).toISOString())}
            </text>

            {/* Interactive hover overlay column segments */}
            {sortedData.map((d, idx) => {
              const t = new Date(d.timestamp).getTime();
              const timeSpan = Math.max(1000, chartMetrics.maxTime - chartMetrics.minTime);
              const x = padLeft + ((t - chartMetrics.minTime) / timeSpan) * chartW;
              const p = d.active_power || 0;
              const y = padTop + chartH - (p / chartMetrics.maxScalePower) * chartH;
              const isHovered = hoverIndex === idx;

              return (
                <g key={idx}>
                  {/* Invisible broad hit box */}
                  <rect
                    x={x - 6}
                    y={padTop}
                    width={12}
                    height={chartH}
                    fill="transparent"
                    className="cursor-crosshair"
                    onMouseEnter={() => setHoverIndex(idx)}
                  />
                  {isHovered && (
                    <g>
                      {/* Vertical tracker */}
                      <line
                        x1={x}
                        y1={padTop}
                        x2={x}
                        y2={padTop + chartH}
                        stroke="#64748b"
                        strokeWidth="1"
                        strokeDasharray="2,2"
                      />
                      {/* Highlight circle */}
                      <circle
                        cx={x}
                        cy={y}
                        r="4"
                        fill="#10b981"
                        stroke="#0f172a"
                        strokeWidth="2"
                      />
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Interactive Tooltip Callout */}
          {activeRecord && (
            <div className="mt-2 p-2.5 rounded bg-slate-950/90 border border-slate-700/80 text-xs font-mono flex flex-wrap items-center justify-between gap-3 text-slate-300">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">TIME:</span>
                <span className="text-white font-medium">
                  {formatTimestamp(activeRecord.timestamp)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">ACTIVE POWER:</span>
                <span className="text-emerald-400 font-bold">
                  {formatPower(activeRecord.active_power)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">STATE:</span>
                <span className="text-sky-300 uppercase font-semibold">
                  {activeRecord.operating_state || "—"}
                </span>
              </div>
              {activeRecord.temperature !== null && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">TEMP:</span>
                  <span>{activeRecord.temperature.toFixed(1)} °C</span>
                </div>
              )}
              {activeRecord.power_factor !== null && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">PF:</span>
                  <span>{activeRecord.power_factor.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
