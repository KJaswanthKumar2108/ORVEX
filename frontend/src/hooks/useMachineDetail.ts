import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/endpoints";
import type {
  AlertRecord,
  EnergySummaryResponse,
  MachineBaselineResponse,
  MachineHealthDetailResponse,
  MachineHealthWarning,
  MachineResponse,
  MachineSummaryResponse,
  MaintenanceObservationCreate,
  TelemetryRecordResponse,
  WastageEventResponse,
} from "../api/types";
import { getTimeRangeBounds, type TimeRangeKey } from "../utils/timeRanges";

export function useMachineDetail(machineId: string, timeRangeKey: TimeRangeKey) {
  const [machine, setMachine] = useState<MachineSummaryResponse | null>(null);
  const [machineMeta, setMachineMeta] = useState<MachineResponse | null>(null);
  const [energySummary, setEnergySummary] = useState<EnergySummaryResponse | null>(null);
  const [chartTelemetry, setChartTelemetry] = useState<TelemetryRecordResponse[]>([]);
  const [events, setEvents] = useState<WastageEventResponse[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [healthDetail, setHealthDetail] = useState<MachineHealthDetailResponse | null>(null);
  const [healthWarnings, setHealthWarnings] = useState<MachineHealthWarning[]>([]);
  const [baseline, setBaseline] = useState<MachineBaselineResponse | null>(null);

  // Raw telemetry pagination state
  const [rawTelemetry, setRawTelemetry] = useState<TelemetryRecordResponse[]>([]);
  const [telemetryTotal, setTelemetryTotal] = useState<number>(0);
  const [telemetryOffset, setTelemetryOffset] = useState<number>(0);
  const telemetryLimit = 20;

  // Loading and error states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isTelemetryLoading, setIsTelemetryLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Auto-refresh control (0 = paused, 10, 30, 60 seconds)
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(30);

  // Race-condition guard
  const activeRequestIdRef = useRef<number>(0);
  const isRefreshingRef = useRef<boolean>(false);

  // Load all machine details
  const loadMachineDetails = useCallback(
    async (isBackgroundRefresh = false) => {
      if (isRefreshingRef.current) return;
      isRefreshingRef.current = true;

      const currentRequestId = ++activeRequestIdRef.current;

      if (!isBackgroundRefresh) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);
      setNotFound(false);

      try {
        const { startTime, endTime } = getTimeRangeBounds(timeRangeKey);

        // 1. Fetch machine summary & metadata in parallel
        const [summaryResult, metaResult] = await Promise.allSettled([
          api.getMachineSummary(machineId),
          api.getMachine(machineId),
        ]);

        if (currentRequestId !== activeRequestIdRef.current) return;

        if (summaryResult.status === "rejected" && metaResult.status === "rejected") {
          const reason = summaryResult.reason;
          const msg =
            reason instanceof Error ? reason.message : String(reason || "Machine not found");
          if (
            msg.toLowerCase().includes("not found") ||
            msg.includes("404") ||
            msg.toLowerCase().includes("invalid")
          ) {
            setNotFound(true);
          }
          setError(msg);
          setIsLoading(false);
          setIsRefreshing(false);
          isRefreshingRef.current = false;
          return;
        }

        if (summaryResult.status === "fulfilled") {
          setMachine(summaryResult.value);
        }
        if (metaResult.status === "fulfilled") {
          setMachineMeta(metaResult.value);
        }

        // 2. Fetch parallel auxiliary analytics datasets
        const [
          energyRes,
          telemetryRes,
          wastageRes,
          alertsRes,
          healthRes,
          warningsRes,
          baselineRes,
        ] = await Promise.allSettled([
          api.getMachineEnergySummary(machineId, {
            start_time: startTime,
            end_time: endTime,
          }),
          api.getMachineTelemetry(machineId, {
            start_time: startTime,
            end_time: endTime,
            limit: 500,
          }),
          api.getMachineWastageEvents(machineId, {
            start_time: startTime,
            end_time: endTime,
            limit: 100,
          }),
          api.getMachineAlerts(machineId, { limit: 50 }),
          api.getMachineHealthDetail(machineId, 24.0),
          api.getMachineHealthWarnings(machineId),
          api.getMachineBaseline(machineId, {
            start_time: startTime,
            end_time: endTime,
          }),
        ]);

        if (currentRequestId !== activeRequestIdRef.current) return;

        setEnergySummary(energyRes.status === "fulfilled" ? energyRes.value : null);
        setChartTelemetry(telemetryRes.status === "fulfilled" ? telemetryRes.value.items || [] : []);
        setEvents(wastageRes.status === "fulfilled" ? wastageRes.value.items || [] : []);
        setAlerts(alertsRes.status === "fulfilled" ? alertsRes.value.items || [] : []);
        setHealthDetail(healthRes.status === "fulfilled" ? healthRes.value : null);
        setHealthWarnings(warningsRes.status === "fulfilled" ? warningsRes.value || [] : []);
        setBaseline(baselineRes.status === "fulfilled" ? baselineRes.value : null);

        setLastRefreshed(new Date());
      } catch (err) {
        if (currentRequestId === activeRequestIdRef.current) {
          const msg =
            err instanceof Error ? err.message : `Failed to load details for machine ${machineId}`;
          if (
            msg.toLowerCase().includes("not found") ||
            msg.includes("404") ||
            msg.toLowerCase().includes("invalid")
          ) {
            setNotFound(true);
          }
          setError(msg);
        }
      } finally {
        if (currentRequestId === activeRequestIdRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
          isRefreshingRef.current = false;
        }
      }
    },
    [machineId, timeRangeKey]
  );

  // Paginated raw telemetry load
  const loadPaginatedTelemetry = useCallback(
    async (offset: number) => {
      setIsTelemetryLoading(true);
      try {
        const { startTime, endTime } = getTimeRangeBounds(timeRangeKey);
        const res = await api.getMachineTelemetry(machineId, {
          start_time: startTime,
          end_time: endTime,
          limit: telemetryLimit,
          offset,
        });
        setRawTelemetry(res.items || []);
        setTelemetryTotal(res.total || 0);
        setTelemetryOffset(offset);
      } catch {
        setRawTelemetry([]);
      } finally {
        setIsTelemetryLoading(false);
      }
    },
    [machineId, timeRangeKey, telemetryLimit]
  );

  // Initial and range change load
  useEffect(() => {
    loadMachineDetails(false);
    loadPaginatedTelemetry(0);
  }, [loadMachineDetails, loadPaginatedTelemetry]);

  // Controlled auto-refresh timer
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;

    const timer = setInterval(() => {
      loadMachineDetails(true);
    }, autoRefreshInterval * 1000);

    return () => clearInterval(timer);
  }, [autoRefreshInterval, loadMachineDetails]);

  // Alert acknowledgement action
  const acknowledgeAlert = async (alertId: string, comment?: string) => {
    try {
      const updated = await api.acknowledgeAlert(alertId, comment);
      setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (err) {
      console.error("Failed to acknowledge alert:", err);
      throw err;
    }
  };

  // Health warning acknowledgement action
  const acknowledgeWarning = async (
    warningId: string,
    payload: { acknowledged_by: string; notes?: string }
  ) => {
    try {
      const updated = await api.acknowledgeHealthWarning(warningId, payload);
      setHealthWarnings((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
      if (healthDetail) {
        setHealthDetail({
          ...healthDetail,
          active_warnings: healthDetail.active_warnings.map((w) =>
            w.id === updated.id ? updated : w
          ),
        });
      }
    } catch (err) {
      console.error("Failed to acknowledge health warning:", err);
      throw err;
    }
  };

  // Maintenance observation creation action
  const createObservation = async (payload: MaintenanceObservationCreate) => {
    try {
      const created = await api.createMaintenanceObservation(payload);
      if (healthDetail) {
        setHealthDetail({
          ...healthDetail,
          recent_observations: [created, ...(healthDetail.recent_observations || [])],
        });
      }
    } catch (err) {
      console.error("Failed to create maintenance observation:", err);
      throw err;
    }
  };

  return {
    machine,
    machineMeta,
    energySummary,
    chartTelemetry,
    events,
    alerts,
    healthDetail,
    healthWarnings,
    baseline,
    rawTelemetry,
    telemetryTotal,
    telemetryOffset,
    telemetryLimit,
    isLoading,
    isRefreshing,
    isTelemetryLoading,
    error,
    notFound,
    lastRefreshed,
    autoRefreshInterval,
    setAutoRefreshInterval,
    refresh: () => loadMachineDetails(true),
    acknowledgeAlert,
    acknowledgeWarning,
    createObservation,
    onPageChange: loadPaginatedTelemetry,
  };
}
