/**
 * Standard data formatters for industrial metrics.
 * Ensures consistent precision, units, and clear empty/null indicators.
 */

export function formatPower(kw: number | null | undefined): string {
  if (kw === null || kw === undefined || isNaN(kw)) {
    return "—";
  }
  return `${kw.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kW`;
}

export function formatEnergy(
  kwh: number | null | undefined,
  options: { isEstimate?: boolean; nullLabel?: string } = {}
): string {
  if (kwh === null || kwh === undefined || isNaN(kwh)) {
    return options.nullLabel ?? "—";
  }
  const formatted = kwh.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return options.isEstimate ? `~${formatted} kWh (est.)` : `${formatted} kWh`;
}

export function formatWastedEnergy(kwh: number | null | undefined): string {
  if (kwh === null || kwh === undefined || isNaN(kwh)) {
    return "Not estimated";
  }
  return `${kwh.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh (est.)`;
}

export function formatPercent(percent: number | null | undefined): string {
  if (percent === null || percent === undefined || isNaN(percent)) {
    return "—";
  }
  return `${percent.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds)) {
    return "—";
  }
  if (seconds < 1) {
    return "< 1s";
  }
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const remainingMins = Math.floor((seconds % 3600) / 60);
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
}

export function formatTimestamp(isoString: string | null | undefined): string {
  if (!isoString) {
    return "—";
  }
  const dt = new Date(isoString);
  if (isNaN(dt.getTime())) {
    return "—";
  }
  return dt.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatShortTime(isoString: string | null | undefined): string {
  if (!isoString) {
    return "—";
  }
  const dt = new Date(isoString);
  if (isNaN(dt.getTime())) {
    return "—";
  }
  return dt.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatRelativeTime(isoString: string | null | undefined, now: Date = new Date()): string {
  if (!isoString) {
    return "Never";
  }
  const dt = new Date(isoString);
  if (isNaN(dt.getTime())) {
    return "Invalid date";
  }
  const diffSeconds = Math.max(0, Math.floor((now.getTime() - dt.getTime()) / 1000));
  if (diffSeconds < 5) {
    return "just now";
  }
  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }
  if (diffSeconds < 3600) {
    return `${Math.floor(diffSeconds / 60)}m ago`;
  }
  if (diffSeconds < 86400) {
    return `${Math.floor(diffSeconds / 3600)}h ago`;
  }
  return `${Math.floor(diffSeconds / 86400)}d ago`;
}

export function formatConfidence(score: number | null | undefined): string {
  if (score === null || score === undefined || isNaN(score)) {
    return "—";
  }
  const pct = Math.round(score <= 1.0 ? score * 100 : score);
  return `${pct}%`;
}

export function formatReasonTitle(reason: string): string {
  const parts = reason.split(";");
  const primary = parts[0].trim();
  switch (primary) {
    case "IDLE_WASTAGE":
      return "Idle Wastage";
    case "LOW_LOAD_WASTAGE":
      return "Low-Load Wastage";
    case "ABNORMAL_POWER":
      return "Abnormal Power";
    case "START_STOP_CYCLING":
      return "Start/Stop Cycling";
    default:
      return primary.replace(/_/g, " ");
  }
}
