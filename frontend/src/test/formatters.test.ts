import { describe, expect, it } from "vitest";
import {
  formatConfidence,
  formatDuration,
  formatEnergy,
  formatPercent,
  formatPower,
  formatReasonTitle,
  formatRelativeTime,
  formatTimestamp,
  formatWastedEnergy,
} from "../utils/formatters";

describe("formatters", () => {
  describe("formatPower", () => {
    it("formats numbers with 1 decimal place and kW unit", () => {
      expect(formatPower(132)).toBe("132.0 kW");
      expect(formatPower(45.678)).toBe("45.7 kW");
      expect(formatPower(0)).toBe("0.0 kW");
    });

    it("returns dash for null, undefined, or NaN", () => {
      expect(formatPower(null)).toBe("—");
      expect(formatPower(undefined)).toBe("—");
      expect(formatPower(NaN)).toBe("—");
    });
  });

  describe("formatEnergy", () => {
    it("formats actual energy with 2 decimals and kWh unit", () => {
      expect(formatEnergy(145.2)).toBe("145.20 kWh");
      expect(formatEnergy(0)).toBe("0.00 kWh");
    });

    it("formats estimated energy with est. indicator", () => {
      expect(formatEnergy(12.345, { isEstimate: true })).toBe("~12.35 kWh (est.)");
    });

    it("returns custom null label or dash", () => {
      expect(formatEnergy(null)).toBe("—");
      expect(formatEnergy(null, { nullLabel: "No data" })).toBe("No data");
    });
  });

  describe("formatWastedEnergy", () => {
    it("formats wasted energy value with est. label", () => {
      expect(formatWastedEnergy(8.42)).toBe("8.42 kWh (est.)");
    });

    it("preserves null wasted energy as Not estimated (e.g. for cycling)", () => {
      expect(formatWastedEnergy(null)).toBe("Not estimated");
      expect(formatWastedEnergy(undefined)).toBe("Not estimated");
    });
  });

  describe("formatPercent", () => {
    it("formats percentage with 1 decimal", () => {
      expect(formatPercent(74.52)).toBe("74.5%");
      expect(formatPercent(0)).toBe("0.0%");
    });

    it("returns dash for null", () => {
      expect(formatPercent(null)).toBe("—");
    });
  });

  describe("formatDuration", () => {
    it("handles sub-second durations", () => {
      expect(formatDuration(0.5)).toBe("< 1s");
    });

    it("handles seconds", () => {
      expect(formatDuration(45)).toBe("45s");
    });

    it("handles minutes and seconds", () => {
      expect(formatDuration(150)).toBe("2m 30s");
      expect(formatDuration(120)).toBe("2m");
    });

    it("handles hours and minutes", () => {
      expect(formatDuration(3660)).toBe("1h 1m");
      expect(formatDuration(7200)).toBe("2h");
    });

    it("handles null", () => {
      expect(formatDuration(null)).toBe("—");
    });
  });

  describe("formatTimestamp", () => {
    it("formats valid ISO timestamp", () => {
      const formatted = formatTimestamp("2026-09-26T14:30:00Z");
      expect(formatted).not.toBe("—");
      expect(formatted).toContain("2026");
    });

    it("returns dash for null or invalid date", () => {
      expect(formatTimestamp(null)).toBe("—");
      expect(formatTimestamp("invalid")).toBe("—");
    });
  });

  describe("formatRelativeTime", () => {
    it("computes relative time differences correctly", () => {
      const now = new Date("2026-09-26T12:00:00Z");
      expect(formatRelativeTime("2026-09-26T11:59:58Z", now)).toBe("just now");
      expect(formatRelativeTime("2026-09-26T11:59:30Z", now)).toBe("30s ago");
      expect(formatRelativeTime("2026-09-26T11:45:00Z", now)).toBe("15m ago");
      expect(formatRelativeTime("2026-09-26T09:00:00Z", now)).toBe("3h ago");
      expect(formatRelativeTime("2026-09-24T12:00:00Z", now)).toBe("2d ago");
    });

    it("handles null", () => {
      expect(formatRelativeTime(null)).toBe("Never");
    });
  });

  describe("formatConfidence", () => {
    it("formats decimal score as percentage", () => {
      expect(formatConfidence(0.95)).toBe("95%");
      expect(formatConfidence(1.0)).toBe("100%");
      expect(formatConfidence(95)).toBe("95%");
    });

    it("handles null", () => {
      expect(formatConfidence(null)).toBe("—");
    });
  });

  describe("formatReasonTitle", () => {
    it("maps detection codes to readable titles", () => {
      expect(formatReasonTitle("IDLE_WASTAGE")).toBe("Idle Wastage");
      expect(formatReasonTitle("LOW_LOAD_WASTAGE")).toBe("Low-Load Wastage");
      expect(formatReasonTitle("ABNORMAL_POWER; contributing=IDLE_WASTAGE")).toBe("Abnormal Power");
      expect(formatReasonTitle("START_STOP_CYCLING")).toBe("Start/Stop Cycling");
    });
  });
});
