import React from "react";
import {
  Activity,
  BrainCircuit,
  Flame,
  Gauge,
  Info,
  ShieldCheck,
  Zap,
} from "lucide-react";

export const HealthScoreExplanationPanel: React.FC = () => {
  return (
    <div className="bg-[#0d1424] border border-slate-800/80 rounded-xl p-5 shadow-lg space-y-5">
      {/* Title & Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <BrainCircuit className="w-4 h-4 text-cyan-400" />
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white font-mono">
              Condition Scoring Methodology & Analytical Transparency
            </h2>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Deterministic mathematical formulation derived exclusively from live telemetry channels
            </p>
          </div>
        </div>

        <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 self-start sm:self-auto">
          Deterministic 4-Vector Model
        </span>
      </div>

      {/* 4 Vector Weights Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Electrical Stability */}
        <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-400 font-mono flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> Electrical Variance Vector
            </span>
            <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
              35% Weight
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
            Quantifies power variability using Coefficient of Variation (CV = σ / μ), current surge density above rated FLA, and voltage phase imbalance.
          </p>
          <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-900">
            Source: 3-Phase Modbus Meter
          </div>
        </div>

        {/* Thermal Margin */}
        <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-400 font-mono flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5" /> Thermal Margin
            </span>
            <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/30">
              25% Weight
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
            Measures winding/bearing temperature delta above empirical baseline and safety headroom beneath the 70°C cautionary threshold ceiling.
          </p>
          <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-900">
            Source: RTD / PT100 Adapter
          </div>
        </div>

        {/* Operational Consistency */}
        <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-sky-400 font-mono flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> Operational Consistency
            </span>
            <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/30">
              25% Weight
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
            Compares live load distribution against calibrated operating profile. Detects mechanical jamming, eccentric shaft wear, or excessive no-load operation.
          </p>
          <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-900">
            Source: Telemetry Engine
          </div>
        </div>

        {/* State Stability */}
        <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400 font-mono flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5" /> State Stability
            </span>
            <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              15% Weight
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
            Applies penalties for frequent start/stop cycling and rapid operating state chatter that accelerate contactor wear and motor winding thermal stress.
          </p>
          <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-900">
            Source: State Classifier Engine
          </div>
        </div>
      </div>

      {/* Coverage Prerequisites & Anti-Hallucination Guardrails */}
      <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2.5 text-xs">
        <div className="flex items-center gap-2 text-cyan-300 font-mono font-bold">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <span>Telemetry History Requirements & Integrity Rules</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-300 font-sans leading-relaxed">
          <div className="space-y-1">
            <strong className="text-white font-mono text-[11px] block">
              1. Minimum Telemetry Coverage Requirement
            </strong>
            <p className="text-[11px] text-slate-400">
              Condition scores require a minimum of <strong>1.0 hour</strong> of active telemetry history and at least <strong>30 valid data samples</strong>. Machines lacking sufficient historical depth are marked <code className="text-amber-400 font-mono">INSUFFICIENT_DATA</code>. ORVEX strictly refuses to fabricate default 100% scores without evidence.
            </p>
          </div>
          <div className="space-y-1">
            <strong className="text-white font-mono text-[11px] block">
              2. Sensor Instrumentation Boundaries
            </strong>
            <p className="text-[11px] text-slate-400">
              Health scores evaluate electrical and thermal telemetry only. Mechanical bearing vibration (ISO 10816-3 RMS velocity) remains unmeasured until piezoelectric accelerometer hardware is retrofitted. Unmeasured channels are explicitly flagged rather than assumed healthy.
            </p>
          </div>
        </div>
      </div>

      {/* Condition Monitoring vs Failure Prediction Disclaimer */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex items-start gap-3 text-xs">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed text-slate-300">
          <strong className="text-white font-mono text-[11px] uppercase tracking-wider block">
            Industrial Integrity Notice: Condition Monitoring vs Failure Prediction
          </strong>
          <p className="text-[11px] text-slate-400">
            ORVEX provides deterministic condition monitoring, anomaly detection, and early degradation warnings based strictly on observable electrical and thermal telemetry. The system does not claim to predict mechanical equipment failure or forecast remaining useful life (RUL) without high-frequency vibration instrumentation.
          </p>
        </div>
      </div>
    </div>
  );
};
