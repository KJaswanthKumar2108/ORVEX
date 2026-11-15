import React from "react";
import { THEME } from "../../theme/tokens";

interface MetricCardProps {
  title: string;
  value: React.ReactNode;
  unit?: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  indicatorColor?: "emerald" | "amber" | "cyan" | "rose" | "blue" | "slate";
  className?: string;
  onClick?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit,
  subtitle,
  icon,
  badge,
  indicatorColor,
  className = "",
  onClick,
}) => {
  const indicatorBorder =
    indicatorColor === "emerald"
      ? "border-l-emerald-500"
      : indicatorColor === "amber"
      ? "border-l-amber-500"
      : indicatorColor === "cyan"
      ? "border-l-cyan-500"
      : indicatorColor === "rose"
      ? "border-l-rose-500"
      : indicatorColor === "blue"
      ? "border-l-blue-500"
      : indicatorColor === "slate"
      ? "border-l-slate-600"
      : "";

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`relative p-4 sm:p-5 rounded-xl bg-[#0d1424] border border-slate-800/80 shadow-sm transition-all duration-150 ${
        indicatorBorder ? `border-l-4 ${indicatorBorder}` : ""
      } ${onClick ? "cursor-pointer hover:border-slate-700 hover:bg-[#121b30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50" : ""} ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={THEME.typography.cardTitle}>{title}</span>
        <div className="flex items-center gap-1.5">
          {badge}
          {icon && (
            <div className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400">
              {icon}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-baseline gap-1 my-1">
        <span className={THEME.typography.metricValue}>{value}</span>
        {unit && <span className={THEME.typography.metricUnit}>{unit}</span>}
      </div>

      {subtitle && (
        <div className="text-xs text-slate-400 font-sans mt-2 flex items-center gap-1.5 flex-wrap">
          {subtitle}
        </div>
      )}
    </div>
  );
};

