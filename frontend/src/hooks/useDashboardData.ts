import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/endpoints";
import type {
  EnergySummaryResponse,
  EnergyWastageReportResponse,
  FleetHealthSummaryResponse,
  MachineHealthWarning,
  MachineSummaryResponse,
  PatternAnalysisResponse,
  TelemetryRecordResponse,
  WastageEventResponse,
} from "../api/types";
import { getTimeRangeBounds, type TimeRangeKey } from "../utils/timeRanges";

export interface DashboardData {
  machines: MachineSummaryResponse[];
  wastageEvents: WastageEventResponse[];
  totalMachines: number;
  freshMachinesCount: number;
  staleMachinesCount: number;
  missingMachinesCount: number;
  totalActualEnergyKwh: number | null;
  totalWastedEnergyKwh: number | null;
  totalEventsCount: number;
  chartTelemetry: TelemetryRecordResponse[];
  chartMachineName?: string;
  chartRatedPower?: number | null;
  // Stage 9B Fleet Command Center additions
  energyReport?: EnergyWastageReportResponse | null;
  fleetHealth?: FleetHealthSummaryResponse | null;
  healthWarnings?: MachineHealthWarning[];
  patterns?: PatternAnalysisResponse | null;
  currentlyOperatingMachines?: number;
  machinesRequiringAttentionCount?: number;
}

export function useDashboardData(timeRangeKey: TimeRangeKey, autoRefreshMs: number = 30000) {
  const [data, setData] = useState<DashboardData>({
    machines: [],
    wastageEvents: [],
    totalMachines: 0,
    freshMachinesCount: 0,
    staleMachinesCount: 0,
    missingMachinesCount: 0,
    totalActualEnergyKwh: null,
    totalWastedEnergyKwh: null,
    totalEventsCount: 0,
    chartTelemetry: [],
    energyReport: null,
    fleetHealth: null,
    healthWarnings: [],
    patterns: null,
    currentlyOperatingMachines: 0,
    machinesRequiringAttentionCount: 0,
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  const activeRequestIdRef = useRef<number>(0);
  const isRequestInProgressRef = useRef<boolean>(false);

  const fetchData = useCallback(async () => {
    if (isRequestInProgressRef.current) return;
    isRequestInProgressRef.current = true;
    const currentRequestId = ++activeRequestIdRef.current;

    setIsLoading(true);
    setError(null);

    try {
      const { startTime, endTime } = getTimeRangeBounds(timeRangeKey);

      // 1. Fetch machines list safely
      const machinesList = await api
        .getMachines({ limit: 100 })
        .catch(() => ({ items: [], total: 0, limit: 100, offset: 0 }));
      const rawMachines = machinesList.items || [];

      // 2. Fetch summary for each machine in parallel
      const summaryPromises = rawMachines.map((m) =>
        api.getMachineSummary(m.id).catch(() => ({
          id: m.id,
          site_id: m.site_id,
          machine_identifier: m.machine_identifier,
          name: m.name,
          machine_type: m.machine_type,
          rated_power_kw: m.rated_power_kw,
          status: m.status,
          telemetry_freshness: "missing" as const,
          latest_telemetry_timestamp: null,
          latest_operating_state: null,
          latest_active_power: null,
          latest_power_factor: null,
          latest_temperature: null,
          latest_load_percent: null,
        }))
      );

      // 3. Parallel fetch across all fleet intelligence and condition services
      const [
        machineSummaries,
        eventsRes,
        energyReportRes,
        fleetHealthRes,
        healthWarningsRes,
        patternsRes,
        alertsRes,
      ] = await Promise.all([
        Promise.all(summaryPromises),
        api
          .getWastageEvents({ start_time: startTime, end_time: endTime, limit: 100 })
          .catch(() => ({ items: [], total: 0, limit: 100, offset: 0 })),
        api
          .getEnergyWastageReport({ start_time: startTime, end_time: endTime })
          .catch(() => null),
        api.getFleetHealthSummary().catch(() => null),
        api.getFleetHealthWarnings({ limit: 50 }).catch(() => []),
        api
          .getWastagePatterns({ start_time: startTime, end_time: endTime })
          .catch(() => null),
        api.getAlerts({ limit: 100 }).catch(() => ({ items: [], total: 0, limit: 100, offset: 0 })),
      ]);

      if (currentRequestId !== activeRequestIdRef.current) return;

      // 4. Energy summary totals: use energyReport if available, else machine energy summaries
      let totalActual: number | null = energyReportRes?.actual_energy_kwh ?? null;
      let totalWasted: number | null = energyReportRes?.estimated_wasted_energy_kwh ?? null;

      if (totalActual === null && rawMachines.length > 0) {
        const energyPromises = rawMachines.map((m) =>
          api
            .getMachineEnergySummary(m.id, { start_time: startTime, end_time: endTime })
            .catch(() => null)
        );
        const energySummaries = (await Promise.all(energyPromises)).filter(
          (e): e is EnergySummaryResponse => e !== null
        );

        for (const es of energySummaries) {
          if (es.actual_energy_kwh !== null) {
            totalActual = (totalActual ?? 0) + es.actual_energy_kwh;
          }
          if (es.estimated_wasted_energy_kwh !== null) {
            totalWasted = (totalWasted ?? 0) + es.estimated_wasted_energy_kwh;
          }
        }
      }

      // 5. Select best machine for fleet power chart
      let chartTelemetry: TelemetryRecordResponse[] = [];
      let chartMachineName: string | undefined = undefined;
      let chartRatedPower: number | null | undefined = undefined;

      const activeMachine =
        machineSummaries.find(
          (m) => m.telemetry_freshness === "fresh" && (m.latest_active_power ?? 0) > 0
        ) ||
        machineSummaries.find((m) => m.telemetry_freshness === "fresh") ||
        machineSummaries.find((m) => m.latest_telemetry_timestamp !== null) ||
        machineSummaries[0];

      if (activeMachine) {
        chartMachineName = activeMachine.name;
        chartRatedPower = activeMachine.rated_power_kw;
        try {
          const telRes = await api.getMachineTelemetry(activeMachine.id, {
            start_time: startTime,
            end_time: endTime,
            limit: 500,
          });
          chartTelemetry = telRes.items || [];
        } catch {
          chartTelemetry = [];
        }
      }

      // 6. Calculate freshness and operating counters
      const freshCount = machineSummaries.filter((m) => m.telemetry_freshness === "fresh").length;
      const staleCount = machineSummaries.filter((m) => m.telemetry_freshness === "stale").length;
      const missingCount = machineSummaries.filter((m) => m.telemetry_freshness === "missing").length;

      const currentlyOperating = machineSummaries.filter((m) => {
        const state = (m.latest_operating_state || "").toLowerCase();
        const isRunning = state === "operating" || state === "running" || state === "active";
        const hasPower = (m.latest_active_power ?? 0) > 0;
        return (isRunning || hasPower) && m.telemetry_freshness !== "missing";
      }).length;

      // Attention needed: distinct count of machines with alerts, health warnings, or stale/missing signals
      const attentionIds = new Set<string>();
      machineSummaries.forEach((m) => {
        if (m.telemetry_freshness === "stale" || m.telemetry_freshness === "missing") {
          attentionIds.add(m.id);
        }
      });
      (alertsRes.items || [])
        .filter((a) => a.status === "open" && (a.severity === "critical" || a.severity === "high"))
        .forEach((a) => a.machine_id && attentionIds.add(a.machine_id));
      healthWarningsRes
        .filter((w) => w.status === "open" && (w.severity === "CRITICAL" || w.severity === "WARNING"))
        .forEach((w) => w.machine_id && attentionIds.add(w.machine_id));

      setData({
        machines: machineSummaries,
        wastageEvents: eventsRes.items || [],
        totalMachines: machinesList.total || machineSummaries.length,
        freshMachinesCount: freshCount,
        staleMachinesCount: staleCount,
        missingMachinesCount: missingCount,
        totalActualEnergyKwh: totalActual,
        totalWastedEnergyKwh: totalWasted,
        totalEventsCount: eventsRes.total || eventsRes.items?.length || 0,
        chartTelemetry,
        chartMachineName,
        chartRatedPower,
        energyReport: energyReportRes,
        fleetHealth: fleetHealthRes,
        healthWarnings: healthWarningsRes,
        patterns: patternsRes,
        currentlyOperatingMachines: currentlyOperating,
        machinesRequiringAttentionCount: attentionIds.size,
      });

      setLastRefreshed(new Date().toISOString());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load ORVEX dashboard data.";
      setError(msg);
    } finally {
      isRequestInProgressRef.current = false;
      setIsLoading(false);
    }
  }, [timeRangeKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefreshMs <= 0) return;
    const interval = setInterval(fetchData, autoRefreshMs);
    return () => clearInterval(interval);
  }, [fetchData, autoRefreshMs]);

  return {
    data,
    isLoading,
    error,
    lastRefreshed,
    refresh: fetchData,
  };
}
