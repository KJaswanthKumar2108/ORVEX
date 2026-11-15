/**
 * Strongly-typed API endpoints for ORVEX backend services.
 */

import { API_BASE_URL, apiRequest } from "./client";
import type {
  ActionImpactResponse,
  AlertListResponse,
  AlertQueryParams,
  AlertRecord,
  CorrectiveActionCreate,
  CorrectiveActionResponse,
  EnergySummaryQueryParams,
  EnergySummaryResponse,
  EnergyWastageReportResponse,
  FleetIntelligenceSummary,
  HealthResponse,
  MachineBaselineResponse,
  MachineInsightDetailResponse,
  MachineListResponse,
  MachineQueryParams,
  MachineResponse,
  MachineSummaryResponse,
  PatternAnalysisResponse,
  ReportQueryParams,
  TelemetryListResponse,
  TelemetryQueryParams,
  WastageEventListResponse,
  WastageEventQueryParams,
  WastageEventResponse,
  FleetHealthSummaryResponse,
  MachineHealthDetailResponse,
  MachineHealthWarning,
  MaintenanceObservation,
  MaintenanceObservationCreate,
  SystemStatusResponse,
} from "./types";

export const api = {
  /** Health check endpoint */
  getHealth(): Promise<HealthResponse> {
    return apiRequest<HealthResponse>("/health");
  },

  /** List machines with optional status and pagination */
  getMachines(params?: MachineQueryParams): Promise<MachineListResponse> {
    return apiRequest<MachineListResponse>(
      "/api/v1/machines",
      params as Record<string, string | number | undefined>
    );
  },

  /** Get individual machine details */
  getMachine(machineId: string): Promise<MachineResponse> {
    return apiRequest<MachineResponse>(`/api/v1/machines/${machineId}`);
  },

  /** Get machine current summary and telemetry freshness */
  getMachineSummary(machineId: string): Promise<MachineSummaryResponse> {
    return apiRequest<MachineSummaryResponse>(`/api/v1/machines/${machineId}/summary`);
  },

  /** Get machine telemetry time series within a range */
  getMachineTelemetry(
    machineId: string,
    params?: TelemetryQueryParams
  ): Promise<TelemetryListResponse> {
    return apiRequest<TelemetryListResponse>(
      `/api/v1/machines/${machineId}/telemetry`,
      params as Record<string, string | number | undefined>
    );
  },

  /** Get machine conservative energy metrics and duration breakdown */
  getMachineEnergySummary(
    machineId: string,
    params: EnergySummaryQueryParams
  ): Promise<EnergySummaryResponse> {
    return apiRequest<EnergySummaryResponse>(
      `/api/v1/machines/${machineId}/energy-summary`,
      params as unknown as Record<string, string | number | undefined>
    );
  },

  /** Get wastage events for a specific machine */
  getMachineWastageEvents(
    machineId: string,
    params?: WastageEventQueryParams
  ): Promise<WastageEventListResponse> {
    return apiRequest<WastageEventListResponse>(
      `/api/v1/machines/${machineId}/wastage-events`,
      params as Record<string, string | number | undefined>
    );
  },

  /** List global wastage events with multi-criteria filtering */
  getWastageEvents(params?: WastageEventQueryParams): Promise<WastageEventListResponse> {
    return apiRequest<WastageEventListResponse>(
      "/api/v1/wastage-events",
      params as Record<string, string | number | undefined>
    );
  },

  /** Get individual wastage event details */
  getWastageEvent(eventId: string): Promise<WastageEventResponse> {
    return apiRequest<WastageEventResponse>(`/api/v1/wastage-events/${eventId}`);
  },

  // --- Stage 5A: Alerts ---

  /** List global alerts with filtering */
  getAlerts(params?: AlertQueryParams): Promise<AlertListResponse> {
    return apiRequest<AlertListResponse>(
      "/api/v1/alerts",
      params as Record<string, string | number | undefined>
    );
  },

  /** Get individual alert details */
  getAlert(alertId: string): Promise<AlertRecord> {
    return apiRequest<AlertRecord>(`/api/v1/alerts/${alertId}`);
  },

  /** Get alerts for a specific machine */
  getMachineAlerts(
    machineId: string,
    params?: AlertQueryParams
  ): Promise<AlertListResponse> {
    return apiRequest<AlertListResponse>(
      `/api/v1/machines/${machineId}/alerts`,
      params as Record<string, string | number | undefined>
    );
  },

  /** Acknowledge an alert */
  acknowledgeAlert(alertId: string, comment?: string): Promise<AlertRecord> {
    return apiRequest<AlertRecord>(`/api/v1/alerts/${alertId}/acknowledge`, undefined, {
      method: "POST",
      body: JSON.stringify({ comment }),
    });
  },

  /** Resolve an alert */
  resolveAlert(alertId: string, resolutionNotes?: string): Promise<AlertRecord> {
    return apiRequest<AlertRecord>(`/api/v1/alerts/${alertId}/resolve`, undefined, {
      method: "POST",
      body: JSON.stringify({ resolution_notes: resolutionNotes }),
    });
  },

  /** Dismiss an alert */
  dismissAlert(alertId: string): Promise<AlertRecord> {
    return apiRequest<AlertRecord>(`/api/v1/alerts/${alertId}/dismiss`, undefined, {
      method: "POST",
    });
  },

  // --- Stage 5A: Reports ---

  /** Generate energy wastage report */
  getEnergyWastageReport(params?: ReportQueryParams): Promise<EnergyWastageReportResponse> {
    return apiRequest<EnergyWastageReportResponse>(
      "/api/v1/reports/energy-wastage",
      params as Record<string, string | number | undefined>
    );
  },

  /** Get direct CSV download URL for energy wastage report */
  getEnergyWastageReportCsvUrl(params?: ReportQueryParams): string {
    const searchParams = new URLSearchParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
    }
    const qs = searchParams.toString();
    return `${API_BASE_URL}/api/v1/reports/energy-wastage/csv${qs ? `?${qs}` : ""}`;
  },

  // --- Stage 7A: Energy Intelligence ---

  /** Get fleet intelligence summary, rankings, and high-priority insights */
  getFleetIntelligence(params?: {
    start_time?: string;
    end_time?: string;
  }): Promise<FleetIntelligenceSummary> {
    return apiRequest<FleetIntelligenceSummary>(
      "/api/v1/insights/summary",
      params as Record<string, string | undefined>
    );
  },

  /** Get recurring wastage patterns analysis */
  getWastagePatterns(params?: {
    start_time?: string;
    end_time?: string;
  }): Promise<PatternAnalysisResponse> {
    return apiRequest<PatternAnalysisResponse>(
      "/api/v1/insights/patterns",
      params as Record<string, string | undefined>
    );
  },

  /** Get machine performance baseline evaluation */
  getMachineBaseline(
    machineId: string,
    params?: { start_time?: string; end_time?: string }
  ): Promise<MachineBaselineResponse> {
    return apiRequest<MachineBaselineResponse>(
      "/api/v1/insights/baseline",
      { machine_id: machineId, ...params } as Record<string, string | undefined>
    );
  },

  /** Get detailed machine intelligence view */
  getMachineInsightDetail(
    machineId: string,
    params?: { start_time?: string; end_time?: string }
  ): Promise<MachineInsightDetailResponse> {
    return apiRequest<MachineInsightDetailResponse>(
      `/api/v1/insights/machines/${machineId}`,
      params as Record<string, string | undefined>
    );
  },

  /** Get before-and-after assessment for a corrective action */
  getActionImpact(
    actionId: string,
    windowHours?: number
  ): Promise<ActionImpactResponse> {
    return apiRequest<ActionImpactResponse>(
      "/api/v1/insights/action-impact",
      { action_id: actionId, window_hours: windowHours } as Record<string, string | number | undefined>
    );
  },

  /** List recorded corrective actions */
  getCorrectiveActions(machineId?: string): Promise<CorrectiveActionResponse[]> {
    return apiRequest<CorrectiveActionResponse[]>(
      "/api/v1/insights/actions",
      machineId ? { machine_id: machineId } : undefined
    );
  },

  /** Log a new corrective action */
  createCorrectiveAction(payload: CorrectiveActionCreate): Promise<CorrectiveActionResponse> {
    return apiRequest<CorrectiveActionResponse>(
      "/api/v1/insights/actions",
      undefined,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
  },

  /** Delete a corrective action */
  deleteCorrectiveAction(actionId: string): Promise<{ deleted: boolean }> {
    return apiRequest<{ deleted: boolean }>(
      `/api/v1/insights/actions/${actionId}`,
      undefined,
      { method: "DELETE" }
    );
  },

  /** Get fleet-wide machine health summary */
  getFleetHealthSummary(): Promise<FleetHealthSummaryResponse> {
    return apiRequest<FleetHealthSummaryResponse>("/api/v1/machine-health/summary");
  },

  /** Get detailed machine health diagnostic */
  getMachineHealthDetail(machineId: string, windowHours: number = 24.0): Promise<MachineHealthDetailResponse> {
    return apiRequest<MachineHealthDetailResponse>(
      `/api/v1/machine-health/machines/${machineId}`,
      { window_hours: windowHours }
    );
  },

  /** List fleet machine health warnings */
  getFleetHealthWarnings(params?: { machine_id?: string; severity?: string; status?: string; limit?: number; offset?: number }): Promise<MachineHealthWarning[]> {
    return apiRequest<MachineHealthWarning[]>("/api/v1/machine-health/warnings", params);
  },

  /** List machine health warnings */
  getMachineHealthWarnings(machineId: string, params?: { severity?: string; status?: string; limit?: number; offset?: number }): Promise<MachineHealthWarning[]> {
    return apiRequest<MachineHealthWarning[]>(`/api/v1/machine-health/machines/${machineId}/warnings`, params);
  },

  /** Acknowledge an active condition-monitoring warning */
  acknowledgeHealthWarning(warningId: string, payload: { acknowledged_by: string; notes?: string }): Promise<MachineHealthWarning> {
    return apiRequest<MachineHealthWarning>(
      `/api/v1/machine-health/warnings/${warningId}/acknowledge`,
      undefined,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
  },

  /** Create a maintenance observation */
  createMaintenanceObservation(payload: MaintenanceObservationCreate): Promise<MaintenanceObservation> {
    return apiRequest<MaintenanceObservation>(
      "/api/v1/machine-health/observations",
      undefined,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
  },

  // --- Stage 8B/9A: System Observability ---

  /** Get comprehensive real-time system status and diagnostics */
  getSystemStatus(): Promise<SystemStatusResponse> {
    return apiRequest<SystemStatusResponse>("/api/v1/system/status");
  },

  /** Get system readiness probe */
  getSystemReadiness(): Promise<{ status: string; database: string }> {
    return apiRequest<{ status: string; database: string }>("/api/v1/system/readiness");
  },

  /** Get system liveness probe */
  getSystemLiveness(): Promise<{ status: string }> {
    return apiRequest<{ status: string }>("/api/v1/system/liveness");
  },

  /** Get system validation & benchmark report */
  getValidationReport(): Promise<Record<string, any>> {
    return apiRequest<Record<string, any>>("/api/v1/system/validation-report");
  },
};

export const endpoints = api;
