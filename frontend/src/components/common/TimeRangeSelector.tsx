import React from "react";
import { TIME_RANGE_OPTIONS, type TimeRangeKey } from "../../utils/timeRanges";

interface TimeRangeSelectorProps {
  selectedRange: TimeRangeKey;
  onRangeChange: (range: TimeRangeKey) => void;
  disabled?: boolean;
}

export const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({
  selectedRange,
  onRangeChange,
  disabled = false,
}) => {
  return (
    <div
      role="group"
      aria-label="Time range selector"
      className="inline-flex rounded-lg bg-slate-900/80 p-0.5 border border-slate-800 shadow-inner"
    >
      {TIME_RANGE_OPTIONS.map((option) => {
        const isSelected = selectedRange === option.key;
        return (
          <button
            key={option.key}
            type="button"
            disabled={disabled}
            aria-pressed={isSelected}
            onClick={() => onRangeChange(option.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
              isSelected
                ? "bg-slate-800 text-emerald-400 shadow-sm border border-slate-700/80"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-850"
            } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};
