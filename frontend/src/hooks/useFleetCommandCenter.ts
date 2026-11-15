import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/endpoints";
import type {
  AlertRecord,
  EnergyWastageReportResponse,
  FleetHealthSummaryResponse,
  MachineHealthWarning,
  MachineSummaryResponse,
  PatternAnalysisResponse,
  TelemetryRecordResponse,
  WastageEventResponse,
} from "../api/types";
import { getTimeRangeBounds, type TimeRangeKey } from "../utils/timeRanges";

export interface FleetKpiMetrics {
  totalMonitoredMachines: number;
  currentlyOperatingMachines: number;
  estimatedEnergyWastageKwh: number | null;
  totalEnergyConsumptionKwh: number | null;
  activeAlertsCount: number;
  machinesRequiringAttentionCount: number;
}

export interface FleetCommandCenterData {
  machines: MachineSummaryResponse[];
  energyReport: EnergyWastageReportResponse | null;
  alerts: AlertRecord[];
  fleetHealth: FleetHealthSummaryResponse | null;
  healthWarnings: MachineHealthWarning[];
  wastageEvents: WastageEventResponse[];
  patterns: PatternAnalysisResponse | null;
  chartTelemetry: TelemetryRecordResponse[];
  chartMachineName?: string;
  chartRatedPower?: number | null;
  kpis: FleetKpiMetrics;
}

export function useFleetCommandCenter(
  timeRangeKey: TimeRangeKey = "24h",
  autoRefreshMs: number = 30000
) {
  const [data, setData] = useState<FleetCommandCenterData>({
    machines: [],
    energyReport: null,
    alerts: [],
    fleetHealth: null,
    healthWarnings: [],
    wastageEvents: [],
    patterns: null,
    chartTelemetry: [],
    kpis: {
      totalMonitoredMachines: 0,
      currentlyOperatingMachines: 0,
      estimatedEnergyWastageKwh: null,
      totalEnergyConsumptionKwh: null,
      activeAlertsCount: 0,
      machinesRequiringAttentionCount: 0,
    },
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  // Cancellation and in-flight request guard
  const activeRequestIdRef = useRef<number>(0);
  const isRequestInProgressRef = useRef<boolean>(false);

  const fetchData = useCallback(
    async (isManualRefresh = false) => {
      // Prevent overlapping refresh requests
      if (isRequestInProgressRef.current) {
        return;
      }

      isRequestInProgressRef.current = true;
      const currentRequestId = ++activeRequestIdRef.current;

      if (isManualRefresh || data.machines.length > 0) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const { startTime, endTime } = getTimeRangeBounds(timeRangeKey);

        // 1. Fetch machines list safely
        const machinesList = await api
          .getMachines({ limit: 100 })
          .catch(() => ({ items: [], total: 0, limit: 100, offset: 0 }));
        const rawMachines = machinesList.items || [];

        // 2. Fetch machine summaries in parallel with fallback for each
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
          energyReportRes,
          alertsRes,
          fleetHealthRes,
          healthWarningsRes,
          wastageEventsRes,
          patternsRes,
        ] = await Promise.all([
          Promise.all(summaryPromises),
          api
            .getEnergyWastageReport({ start_time: startTime, end_time: endTime })
            .catch(() => null),
          api.getAlerts({ limit: 100 }).catch(() => ({ items: [], total: 0, limit: 100, offset: 0 })),
          api.getFleetHealthSummary().catch(() => null),
          api.getFleetHealthWarnings({ limit: 50 }).catch(() => []),
          api
            .getWastageEvents({ start_time: startTime, end_time: endTime, limit: 100 })
            .catch(() => ({ items: [], total: 0, limit: 100, offset: 0 })),
          api
            .getWastagePatterns({ start_time: startTime, end_time: endTime })
            .catch(() => null),
        ]);

        // If a subsequent request was triggered, discard this stale payload
        if (currentRequestId !== activeRequestIdRef.current) {
          return;
        }

        // 4. Select representative machine for telemetry power chart
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

        // 5. Derive Fleet KPIs
        const totalMonitored = machinesList.total || machineSummaries.length;

        // Currently operating machines: active power > 0 or operating state is running/operating/active
        const currentlyOperating = machineSummaries.filter((m) => {
          const state = (m.latest_operating_state || "").toLowerCase();
          const isStateRunning =
            state === "operating" || state === "running" || state === "active";
          const hasPower = (m.latest_active_power ?? 0) > 0;
          return (isStateRunning || hasPower) && m.telemetry_freshness !== "missing";
        }).length;

        // Energy consumption & wastage: prioritize energyReport, fallback to null
        const totalActualEnergy = energyReportRes?.actual_energy_kwh ?? null;
        const totalWastedEnergy = energyReportRes?.estimated_wasted_energy_kwh ?? null;

        // Active alerts (open status)
        const openAlerts = (alertsRes.items || []).filter((a) => a.status === "open");
        const activeAlertsCount = openAlerts.length;

        // Machines requiring attention:
        // Stale or missing telemetry, OR open critical/warning alerts, OR open health warnings
        const attentionMachineIds = new Set<string>();

        // Check telemetry freshness
        machineSummaries.forEach((m) => {
          if (m.telemetry_freshness === "stale" || m.telemetry_freshness === "missing") {
            attentionMachineIds.add(m.id);
          }
        });

        // Check alerts
        openAlerts.forEach((a) => {
          if (
            (a.severity === "critical" || a.severity === "high") &&
            a.machine_id
          ) {
            attentionMachineIds.add(a.machine_id);
          }
        });

        // Check health warnings
        healthWarningsRes.forEach((w) => {
          if (
            (w.severity === "CRITICAL" || w.severity === "WARNING") &&
            w.status === "open" &&
            w.machine_id
          ) {
            attentionMachineIds.add(w.machine_id);
          }
        });

        // Check active wastage events
        (wastageEventsRes.items || []).forEach((ev) => {
          if (ev.status === "detected" && ev.machine_id) {
            attentionMachineIds.add(ev.machine_id);
          }
        });

        const machinesRequiringAttentionCount = attentionMachineIds.size;

        setData({
          machines: machineSummaries,
          energyReport: energyReportRes,
          alerts: alertsRes.items || [],
          fleetHealth: fleetHealthRes,
          healthWarnings: healthWarningsRes,
          wastageEvents: wastageEventsRes.items || [],
          patterns: patternsRes,
          chartTelemetry,
          chartMachineName,
          chartRatedPower,
          kpis: {
            totalMonitoredMachines: totalMonitored,
            currentlyOperatingMachines: currentlyOperating,
            estimatedEnergyWastageKwh: totalWastedEnergy,
            totalEnergyConsumptionKwh: totalActualEnergy,
            activeAlertsCount,
            machinesRequiringAttentionCount,
          },
        });

        setLastRefreshed(new Date().toISOString());
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to load ORVEX Fleet Command Center data.";
        setError(msg);
      } finally {
        isRequestInProgressRef.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [timeRangeKey, data.machines.length]
  );

  // Initial and range change fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Automatic background refresh interval
  useEffect(() => {
    if (autoRefreshMs <= 0) return;
    const interval = setInterval(() => {
      fetchData(true);
    }, autoRefreshMs);
    return () => clearInterval(interval);
  }, [fetchData, autoRefreshMs]);

  // Alert acknowledgment helper
  const acknowledgeAlert = useCallback(async (alertId: string) => {
    try {
      const updated = await api.acknowledgeAlert(alertId);
      setData((prev) => {
        const updatedAlerts = prev.alerts.map((a) =>
          a.id === updated.id ? updated : a
        );
        const openCount = updatedAlerts.filter((a) => a.status === "open").length;
        return {
          ...prev,
          alerts: updatedAlerts,
          kpis: {
            ...prev.kpis,
            activeAlertsCount: openCount,
          },
        };
      });
    } catch {
      // Re-throw or let caller handle
    }
  }, []);

  return {
    data,
    isLoading,
    isRefreshing,
    error,
    lastRefreshed,
    refresh: () => fetchData(true),
    acknowledgeAlert,
  };
}
