import React from "react";
import { PieChart, ShieldCheck } from "lucide-react";
import type { ReportReasonBreakdown, WastageEventResponse } from "../../api/types";
import { formatDuration, formatEnergy, formatReasonTitle } from "../../utils/formatters";

interface WastageCategoryDistributionChartProps {
  reasons: ReportReasonBreakdown[];
  fallbackEvents?: WastageEventResponse[];
  totalWastedKwh?: number | null;
  isLoading?: boolean;
}

export const WastageCategoryDistributionChart: React.FC<WastageCategoryDistributionChartProps> = ({
  reasons,
  fallbackEvents = [],
  totalWastedKwh,
  isLoading = false,
}) => {
  // If reasons array is empty, derive from fallbackEvents
  const processedReasons: ReportReasonBreakdown[] = React.useMemo(() => {
    if (reasons.length > 0) {
      return [...reasons].sort(
        (a, b) => (b.estimated_wasted_energy_kwh ?? 0) - (a.estimated_wasted_energy_kwh ?? 0)
      );
    }

    if (fallbackEvents.length === 0) {
      return [];
    }

    const map = new Map<string, { count: number; duration: number; wasted: number; unestimated: number }>();
    fallbackEvents.forEach((ev) => {
      const r = ev.detection_reason;
      const prev = map.get(r) || { count: 0, duration: 0, wasted: 0, unestimated: 0 };
      const dur = ev.duration_seconds || 0;
      const w = ev.estimated_wasted_energy_kwh || 0;
      map.set(r, {
        count: prev.count + 1,
        duration: prev.duration + dur,
        wasted: prev.wasted + w,
        unestimated: prev.unestimated + (ev.estimated_wasted_energy_kwh === null ? 1 : 0),
      });
    });

    const list: ReportReasonBreakdown[] = [];
    map.forEach((val, key) => {
      list.push({
        reason: key,
        event_count: val.count,
        total_duration_seconds: val.duration,
        estimated_wasted_energy_kwh: val.wasted > 0 ? val.wasted : null,
        unestimated_event_count: val.unestimated,
      });
    });

    return list.sort((a, b) => (b.estimated_wasted_energy_kwh ?? 0) - (a.estimated_wasted_energy_kwh ?? 0));
  }, [reasons, fallbackEvents]);

  const maxCategoryKwh = Math.max(
    ...processedReasons.map((r) => r.estimated_wasted_energy_kwh || 0),
    1.0
  );

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-white tracking-wide">
              Wastage Category Distribution
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Deterministic breakdown by detection mechanism & energy loss
          </p>
        </div>
        {totalWastedKwh !== null && totalWastedKwh !== undefined && (
          <span className="text-xs font-mono font-bold text-amber-400">
            {formatEnergy(totalWastedKwh)} total
          </span>
        )}
      </div>

      {/* Content */}
      {isLoading && processedReasons.length === 0 ? (
        <div className="py-8 text-center text-xs font-mono text-slate-500">
          Aggregating wastage distributions...
        </div>
      ) : processedReasons.length === 0 ? (
        <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-lg">
          <ShieldCheck className="w-6 h-6 text-emerald-400 mx-auto mb-1.5" />
          <p className="font-medium text-slate-200">Zero Avoidable Wastage Detected</p>
          <p className="text-slate-500 text-[11px] mt-0.5">
            All equipment operating inside nominal energy baseline envelope.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {processedReasons.map((item) => {
            const wastedKwh = item.estimated_wasted_energy_kwh;
            const barWidth =
              wastedKwh !== null
                ? Math.min(100, Math.max(8, (wastedKwh / maxCategoryKwh) * 100))
                : 15;

            return (
              <div
                key={item.reason}
                className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/80 space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-200">
                      {formatReasonTitle(item.reason)}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      {item.event_count} {item.event_count === 1 ? "episode" : "episodes"}
                    </span>
                  </div>

                  <div className="font-mono text-xs text-right">
                    {wastedKwh !== null ? (
                      <span className="font-bold text-amber-400">
                        {formatEnergy(wastedKwh)}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-[11px]">
                        Unquantified (Inrush stress)
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      wastedKwh !== null ? "bg-amber-400" : "bg-cyan-500/60"
                    }`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>

                {/* Duration and Details */}
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                  <span>Cumulative duration: {formatDuration(item.total_duration_seconds)}</span>
                  {item.unestimated_event_count > 0 && (
                    <span className="text-cyan-400 text-[10px]">
                      {item.unestimated_event_count} candidate events preserved
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Disclaimer */}
      <div className="pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-500 flex items-center justify-between">
        <span>Deterministic Rule Classification</span>
        <span>Auditable derivation</span>
      </div>
    </div>
  );
};
