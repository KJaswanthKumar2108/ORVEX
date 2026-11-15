import React, { useState } from "react";
import {
  BrainCircuit,
  Calculator,
  CheckCircle2,
  ExternalLink,
  Info,
  Lightbulb,
  Sliders,
  Wrench,
} from "lucide-react";
import type { ExplainableInsight } from "../../api/types";
import { formatTimestamp } from "../../utils/formatters";

interface ExplainableIntelligencePanelProps {
  insights: ExplainableInsight[];
  onSelectMachineDetail?: (machineId: string) => void;
  isLoading?: boolean;
}

export const ExplainableIntelligencePanel: React.FC<ExplainableIntelligencePanelProps> = ({
  insights = [],
  onSelectMachineDetail,
  isLoading = false,
}) => {
  const [selectedInsightId, setSelectedInsightId] = useState<string>(
    insights && insights.length > 0 ? insights[0].insight_id : ""
  );

  const activeInsight =
    (insights && insights.find((i) => i.insight_id === selectedInsightId)) ||
    (insights && insights.length > 0 ? insights[0] : null);

  if (isLoading) {
    return (
      <div className="bg-[#0d1424] border border-slate-800/80 rounded-xl p-5 shadow-lg space-y-4">
        <div className="h-6 bg-slate-800 rounded w-1/4 animate-pulse" />
        <div className="h-32 bg-slate-900 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div className="bg-[#0d1424] border border-slate-800/80 rounded-xl p-6 shadow-lg text-center space-y-2">
        <Lightbulb className="w-8 h-8 text-slate-600 mx-auto" />
        <h3 className="text-sm font-semibold text-slate-300">No High-Priority Wastage Insights</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          No actionable wastage anomalies or sustained threshold breaches exceed the high-priority confidence threshold in this observation window.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#0d1424] border border-slate-800/80 rounded-xl p-5 shadow-lg space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <BrainCircuit className="w-4 h-4 text-emerald-400" />
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white font-mono">
              Explainable Energy Intelligence Insights
            </h2>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Transparent causal chains connecting physical measurements to quantified energy loss
            </p>
          </div>
        </div>

        {/* Measured vs Calculated Legend */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
            <span>Measured Sensor Value</span>
          </span>
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-dashed border-amber-300" />
            <span>Calculated Estimate</span>
          </span>
        </div>
      </div>

      {/* Insight Selector Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {insights.map((ins, idx) => (
          <button
            key={ins.insight_id || idx}
            type="button"
            onClick={() => setSelectedInsightId(ins.insight_id)}
            className={`px-3 py-1.5 rounded-lg border font-medium whitespace-nowrap transition cursor-pointer ${
              activeInsight?.insight_id === ins.insight_id
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                : "bg-slate-950/80 text-slate-400 border-slate-800 hover:text-white"
            }`}
          >
            <span>Insight #{idx + 1}: {ins.machine_name}</span>
          </button>
        ))}
      </div>

      {/* Active Insight Deep Dive Card */}
      {activeInsight && (
        <div className="bg-slate-950/80 rounded-xl border border-slate-800/80 p-5 space-y-4">
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-white uppercase tracking-wide">
                  {activeInsight.title}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold uppercase">
                  {activeInsight.severity}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  Confidence: {activeInsight.confidence}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5 font-mono">
                Asset: <strong className="text-slate-200">{activeInsight.machine_name}</strong> • Observed:{" "}
                {formatTimestamp(activeInsight.start_time)} → {formatTimestamp(activeInsight.end_time)}
              </div>
            </div>

            {onSelectMachineDetail && (
              <button
                type="button"
                onClick={() => onSelectMachineDetail(activeInsight.machine_id)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition cursor-pointer self-start sm:self-auto"
              >
                <span>Machine Detail</span>
                <ExternalLink className="w-3 h-3 text-sky-400" />
              </button>
            )}
          </div>

          {/* 6 Key Analytical Explanations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* 1. What Happened */}
            <div className="bg-slate-900/80 p-3.5 rounded-lg border border-slate-800 space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
                <Info className="w-3.5 h-3.5 text-sky-400" />
                <span>1. What Happened</span>
              </span>
              <p className="text-slate-200 leading-relaxed font-sans">{activeInsight.observation_window_description}</p>
            </div>

            {/* 2. Why ORVEX Detected It */}
            <div className="bg-slate-900/80 p-3.5 rounded-lg border border-slate-800 space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span>2. Why ORVEX Detected It</span>
              </span>
              <p className="text-slate-200 leading-relaxed font-sans">{activeInsight.explanation}</p>
            </div>

            {/* 3. Supporting Measurements (Measured vs Thresholds) */}
            <div className="bg-slate-900/80 p-3.5 rounded-lg border border-slate-800 space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>3. Supporting Physical Measurements</span>
              </span>
              <div className="space-y-1 text-[11px] font-mono">
                {Object.entries(activeInsight.measured_values || {}).map(([key, val]) => (
                  <div key={key} className="flex justify-between items-center py-0.5 border-b border-slate-800/60">
                    <span className="text-slate-400 capitalize">{key.replace(/_/g, " ")}:</span>
                    <span className="text-sky-300 font-bold px-1.5 py-0.5 rounded bg-sky-950/40 border border-sky-800/40">
                      {val !== null ? `${val}` : "—"} (Measured)
                    </span>
                  </div>
                ))}
                {Object.entries(activeInsight.applicable_thresholds || {}).map(([key, val]) => (
                  <div key={key} className="flex justify-between items-center py-0.5 border-b border-slate-800/60">
                    <span className="text-slate-400 capitalize">{key.replace(/_/g, " ")} Threshold:</span>
                    <span className="text-amber-300 font-semibold px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-800/40">
                      {val !== null ? `${val}` : "—"} (Limit)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Quantified Loss & Energy Impact */}
            <div className="bg-slate-900/80 p-3.5 rounded-lg border border-slate-800 space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
                <Calculator className="w-3.5 h-3.5 text-rose-400" />
                <span>4. Quantified Energy Loss</span>
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-amber-400">
                  {activeInsight.estimated_wasted_energy_kwh !== null
                    ? `${activeInsight.estimated_wasted_energy_kwh.toFixed(1)} kWh`
                    : "Not directly quantified"}
                </span>
                <span className="text-[10px] font-mono text-slate-500 uppercase">
                  (Calculated Estimate)
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                {activeInsight.confidence_definition}
              </p>
            </div>

            {/* 5. Recommended Operator Action SOP */}
            <div className="bg-emerald-950/20 border border-emerald-500/30 p-3.5 rounded-lg space-y-1 md:col-span-2">
              <span className="text-xs font-mono font-bold text-emerald-300 uppercase tracking-wide flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-emerald-400" />
                <span>5. Recommended Operator Countermeasure (SOP)</span>
              </span>
              <p className="text-slate-200 leading-relaxed text-xs font-sans">
                {activeInsight.recommended_action}
              </p>
            </div>

            {/* 6. Analytical Limitations & Disclaimers */}
            <div className="text-[11px] text-slate-500 italic bg-slate-950/60 p-2.5 rounded border border-slate-900 md:col-span-2">
              <strong>Limitations:</strong> {activeInsight.limitations}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
