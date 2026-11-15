import React from "react";
import { THEME } from "../../theme/tokens";

export type StatusPillType =
  | "operational"
  | "optimal"
  | "running"
  | "idle"
  | "low_load"
  | "lowLoad"
  | "stopped"
  | "fault"
  | "healthy"
  | "watch"
  | "warning"
  | "critical"
  | "insufficient_data"
  | "insufficientData"
  | "active"
  | "inactive"
  | "maintenance";

interface StatusPillProps {
  status: string;
  size?: "sm" | "md";
  showDot?: boolean;
  className?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({
  status,
  size = "md",
  showDot = true,
  className = "",
}) => {
  const norm = (status || "").toLowerCase().replace(/[\s-]/g, "_");

  let style: { bg: string; border: string; text: string; dot: string; label?: string } = THEME.status.stopped;
  let label = status;

  if (norm === "operational" || norm === "optimal" || norm === "running" || norm === "active") {
    style = THEME.status.operational;
    label = status.toUpperCase() === "OPTIMAL" ? "Optimal" : norm === "active" ? "Active" : "Operational";
  } else if (norm === "idle") {
    style = THEME.status.idle;
    label = "Idle";
  } else if (norm === "low_load" || norm === "lowload") {
    style = THEME.status.lowLoad;
    label = "Low Load";
  } else if (norm === "stopped" || norm === "inactive") {
    style = THEME.status.stopped;
    label = norm === "inactive" ? "Inactive" : "Stopped";
  } else if (norm === "fault" || norm === "decommissioned") {
    style = THEME.status.fault;
    label = norm === "decommissioned" ? "Decommissioned" : "Fault";
  } else if (norm === "healthy") {
    style = THEME.status.healthy;
    label = "Healthy";
  } else if (norm === "watch") {
    style = THEME.status.watch;
    label = "Watch";
  } else if (norm === "warning" || norm === "maintenance") {
    style = THEME.status.warning;
    label = norm === "maintenance" ? "Maintenance" : "Warning";
  } else if (norm === "critical") {
    style = THEME.status.critical;
    label = "Critical";
  } else if (norm === "insufficient_data" || norm === "insufficientdata") {
    style = THEME.status.insufficientData;
    label = "Insufficient Data";
  }

  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium font-sans border ${style.bg} ${style.border} ${style.text} ${sizeClasses} ${className}`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${style.dot} animate-pulse`} />}
      <span>{label}</span>
    </span>
  );
};
