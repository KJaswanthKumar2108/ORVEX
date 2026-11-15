export type TimeRangeKey = "1h" | "24h" | "7d";

export interface TimeRangeOption {
  key: TimeRangeKey;
  label: string;
  durationSeconds: number;
}

export const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { key: "1h", label: "Last hour", durationSeconds: 3600 },
  { key: "24h", label: "Last 24 hours", durationSeconds: 86400 },
  { key: "7d", label: "Last 7 days", durationSeconds: 604800 },
];

export function getTimeRangeBounds(rangeKey: TimeRangeKey, referenceDate: Date = new Date()): {
  startTime: string;
  endTime: string;
} {
  const option = TIME_RANGE_OPTIONS.find((opt) => opt.key === rangeKey) || TIME_RANGE_OPTIONS[0];
  const end = referenceDate;
  const start = new Date(end.getTime() - option.durationSeconds * 1000);

  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}
