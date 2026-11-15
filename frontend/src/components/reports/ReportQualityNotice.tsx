import React from "react";
import { AlertTriangle, Info } from "lucide-react";
import type { EnergyWastageReportResponse } from "../../api/types";

interface ReportQualityNoticeProps {
  report: EnergyWastageReportResponse | null;
}

export const ReportQualityNotice: React.FC<ReportQualityNoticeProps> = ({ report }) => {
  const coverage = report?.data_coverage_ratio ?? null;
  const isCoverageLow = coverage !== null && coverage < 0.9;

  return (
    <div className="space-y-4">
      {/* Low Coverage Warning Banner if applicable */}
      {isCoverageLow && (
        <div className="bg-amber-950/20 border border-amber-800/60 rounded-xl p-4 text-xs text-amber-300 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold text-amber-200">
              Telemetry Coverage Notice: {Math.round(coverage * 100)}% Data Completeness
            </span>
            <p className="text-amber-300/90 leading-relaxed text-[11px]">
              Gaps exceeding 30 seconds were detected during this evaluation window. In accordance with ORVEX conservative accounting rules, missing segments are excluded from baseline calculations to prevent artificial baseline drift.
            </p>
          </div>
        </div>
      )}

      {/* Methodology & Regulatory Compliance Box */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 text-xs text-slate-400 space-y-3 shadow-xs">
        <div className="flex items-center gap-2 font-semibold text-slate-200 border-b border-slate-800 pb-2">
          <Info className="w-4 h-4 text-emerald-400" />
          <span>ORVEX Energy Reporting Methodology & Technical Disclaimers</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div className="space-y-1.5">
            <div className="font-semibold text-slate-300 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>1. Energy Accounting</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Total consumed energy is calculated using trapezoidal numerical integration of active power measurements ($P = \int p(t)dt$). Dropouts &gt; 30 seconds trigger interval segmentation.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="font-semibold text-slate-300 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>2. Conservative Baseline</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Estimated wastage represents avoidable consumption in excess of the dynamic baseline. Overlapping event intervals are strictly deduplicated so no kilowatt-hour is counted twice.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="font-semibold text-slate-300 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span>3. Unestimated Cycling</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Rapid start/stop cycling episodes indicate severe mechanical and electrical strain. Because surge losses vary per electrical network, energy waste is reported as unestimated (<span className="font-mono text-slate-300">NULL</span>) rather than fabricating speculative numbers.
            </p>
          </div>
        </div>

        <div className="border-t border-slate-800/80 pt-3 text-[11px] text-slate-500 flex items-center justify-between">
          <span>
            Tariff baseline reference: <strong>$0.12/kWh</strong> (indicative average industrial rate; estimates do not constitute verified utility billing refunds).
          </span>
          <span className="font-mono">
            {report?.generated_at ? `Generated: ${new Date(report.generated_at).toLocaleTimeString()}` : "Ready"}
          </span>
        </div>
      </div>
    </div>
  );
};
