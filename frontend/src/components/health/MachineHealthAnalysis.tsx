import React from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Eye,
  Flame,
  Gauge,
  Info,
  Radio,
  Zap,
} from "lucide-react";
import type {
  ChannelCoverageReport,
  HealthStatus,
  MachineHealthDetailResponse,
  MachineSummaryResponse,
} from "../../api/types";

interface MachineHealthAnalysisProps {
  detail: MachineHealthDetailResponse | null;
  machines: MachineSummaryResponse[];
  selectedMachineId: string | null;
  onSelectMachine: (id: string) => void;
  isLoading?: boolean;
}

export const MachineHealthAnalysis: React.FC<MachineHealthAnalysisProps> = ({
  detail,
  machines,
  selectedMachineId,
  onSelectMachine,
  isLoading = false,
}) => {
  const getStatusBadge = (status: HealthStatus) => {
    switch (status) {
      case "HEALTHY":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
            <CheckCircle2 className="w-3.5 h-3.5" /> Healthy
          </span>
        );
      case "WATCH":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono">
            <Eye className="w-3.5 h-3.5" /> Watch
          </span>
        );
      case "WARNING":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/30 font-mono">
            <AlertTriangle className="w-3.5 h-3.5" /> Warning
          </span>
        );
      case "CRITICAL":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30 font-mono">
            <AlertOctagon className="w-3.5 h-3.5" /> Critical
          </span>
        );
      case "INSUFFICIENT_DATA":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/30 font-mono">
            <Info className="w-3.5 h-3.5" /> Insufficient Data
          </span>
        );
    }
  };

  const getChannelBadge = (status: string) => {
    switch (status) {
      case "ACTIVE_HARDWARE":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            Active Hardware
          </span>
        );
      case "AUXILIARY_SIMULATED":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
            Auxiliary / Simulated
          </span>
        );
      case "UNMEASURED_NOT_INSTALLED":
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            Unmeasured (Not Fitted)
          </span>
        );
    }
  };

  const subScores = detail?.sub_scores;

  return (
    <div className="bg-[#0d1424] border border-slate-800/80 rounded-xl p-5 shadow-lg space-y-6">
      {/* Header with Machine Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
              <span>{detail?.machine_name || "Machine Condition Diagnostics"}</span>
              {detail && getStatusBadge(detail.health_status)}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Deterministic 4-vector telemetry condition evaluation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 font-mono">Monitored Asset:</label>
          <select
            value={selectedMachineId || ""}
            onChange={(e) => onSelectMachine(e.target.value)}
            aria-label="Select machine for health analysis"
            className="bg-slate-950 text-slate-200 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.machine_identifier})
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-slate-500 text-xs font-mono">
          Evaluating machine condition telemetry...
        </div>
      ) : detail ? (
        detail.health_status === "INSUFFICIENT_DATA" ? (
          /* Insufficient Data State */
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 text-center space-y-3">
            <Info className="w-8 h-8 text-amber-400 mx-auto" />
            <h3 className="text-sm font-bold text-amber-300 font-mono">
              Machine Health Score Withheld — Insufficient Telemetry History
            </h3>
            <p className="text-xs text-slate-300 max-w-lg mx-auto leading-relaxed">
              {detail.insufficient_data_reason ||
                "Minimum 1.0 hour of active telemetry and 30 discrete samples are required to establish an evidence-based condition score."}
            </p>
            <p className="text-[11px] text-slate-400 font-mono">
              Evaluated: {detail.data_coverage_hours?.toFixed(1) ?? "0"} hrs / {detail.telemetry_sample_count ?? 0} samples
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Primary Health Score & 4 Sub-score Bars */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Overall Score Dial/Box */}
              <div className="lg:col-span-2 bg-slate-950/80 rounded-xl p-5 border border-slate-800 flex flex-col justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider font-mono block">
                    Composite Condition Score
                  </span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-4xl font-extrabold font-mono text-cyan-400">
                      {detail.health_score !== null ? detail.health_score.toFixed(1) : "—"}
                    </span>
                    <span className="text-sm font-mono text-slate-500">/ 100</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Evaluated over trailing <strong>{detail.data_coverage_hours?.toFixed(1) ?? "24.0"}h</strong> window ({detail.telemetry_sample_count} telemetry samples).
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-800/80 mt-4 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                  <span>Operating Status:</span>
                  <span className="text-white font-bold">{detail.health_status}</span>
                </div>
              </div>

              {/* 4 Dimension Sub-Scores */}
              <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Electrical Stability */}
                <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>Electrical Stability</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      {subScores?.electrical_stability != null
                        ? `${subScores.electrical_stability.toFixed(1)}%`
                        : "—"}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-amber-400 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, subScores?.electrical_stability ?? 0))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>Power CV & Surges</span>
                    <span>Weight: 35%</span>
                  </div>
                </div>

                {/* 2. Thermal Margin */}
                <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                      <Flame className="w-3.5 h-3.5 text-rose-400" />
                      <span>Thermal Margin</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-rose-400">
                      {subScores?.thermal_margin != null
                        ? `${subScores.thermal_margin.toFixed(1)}%`
                        : "—"}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-rose-400 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, subScores?.thermal_margin ?? 0))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>Steady-state vs 70°C</span>
                    <span>Weight: 25%</span>
                  </div>
                </div>

                {/* 3. Operational Consistency */}
                <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                      <Activity className="w-3.5 h-3.5 text-sky-400" />
                      <span>Operational Consistency</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-sky-400">
                      {subScores?.operational_consistency != null
                        ? `${subScores.operational_consistency.toFixed(1)}%`
                        : "—"}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-sky-400 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, subScores?.operational_consistency ?? 0))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>Load curve stability</span>
                    <span>Weight: 25%</span>
                  </div>
                </div>

                {/* 4. State Stability */}
                <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                      <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                      <span>State Stability</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {subScores?.state_stability != null
                        ? `${subScores.state_stability.toFixed(1)}%`
                        : "—"}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-emerald-400 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, subScores?.state_stability ?? 0))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>Anti-cycling & chatter</span>
                    <span>Weight: 15%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Channel Coverage Matrix */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-cyan-400" />
                  Sensor Channel Instrumentation Audit
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  Hardware Transparency
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {detail.channels.map((ch: ChannelCoverageReport, idx: number) => (
                  <div
                    key={idx}
                    className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800/80 space-y-2 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-bold text-white font-mono truncate">
                          {ch.channel_name}
                        </span>
                        {getChannelBadge(ch.status)}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                        {ch.description}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-slate-900 text-[10px] font-mono text-slate-500 flex justify-between">
                      <span>Evaluated Samples:</span>
                      <span className="text-slate-300 font-bold">{ch.sample_count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="py-8 text-center text-slate-500 text-xs font-mono">
          Select a machine above to inspect telemetry health condition.
        </div>
      )}
    </div>
  );
};
