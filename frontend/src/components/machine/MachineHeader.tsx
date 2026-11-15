import React from "react";
import { ArrowLeft, Cpu } from "lucide-react";
import type { MachineSummaryResponse } from "../../api/types";
import { FreshnessBadge, OperatingStateBadge } from "../common/StatusBadge";
import { TimeRangeSelector } from "../common/TimeRangeSelector";
import type { TimeRangeKey } from "../../utils/timeRanges";

interface MachineHeaderProps {
  machine: MachineSummaryResponse;
  selectedRange: TimeRangeKey;
  onRangeChange: (range: TimeRangeKey) => void;
  onBack: () => void;
}

export const MachineHeader: React.FC<MachineHeaderProps> = ({
  machine,
  selectedRange,
  onRangeChange,
  onBack,
}) => {
  return (
    <div className="bg-slate-900/90 border-b border-slate-800 px-4 sm:px-6 py-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Back navigation & Title */}
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors mb-2 cursor-pointer focus:outline-none focus:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Fleet Overview</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-white tracking-tight">{machine.name}</h1>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono border border-slate-700">
                  {machine.machine_identifier}
                </span>
                <FreshnessBadge freshness={machine.telemetry_freshness} />
                <OperatingStateBadge state={machine.latest_operating_state} />
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Type: <span className="text-slate-200 capitalize">{machine.machine_type}</span> • Rated:{" "}
                <span className="text-slate-200 font-mono">
                  {machine.rated_power_kw ? `${machine.rated_power_kw} kW` : "Unspecified"}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Time Range Selector */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <span className="text-xs text-slate-400 hidden sm:inline">Analytics Range:</span>
          <TimeRangeSelector selectedRange={selectedRange} onRangeChange={onRangeChange} />
        </div>
      </div>
    </div>
  );
};
