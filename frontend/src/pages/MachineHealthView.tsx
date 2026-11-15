import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { endpoints } from "../api/endpoints";
import type {
  FleetHealthSummaryResponse,
  MachineHealthDetailResponse,
  MachineSummaryResponse,
  MaintenanceObservationCreate,
} from "../api/types";
import { FleetHealthOverview } from "../components/health/FleetHealthOverview";
import { MachineHealthAnalysis } from "../components/health/MachineHealthAnalysis";
import { WarningInvestigationList } from "../components/health/WarningInvestigationList";
import { MaintenanceObservationsLog } from "../components/health/MaintenanceObservationsLog";
import { HealthScoreExplanationPanel } from "../components/health/HealthScoreExplanationPanel";

interface MachineHealthViewProps {
  machines: MachineSummaryResponse[];
  selectedMachineId: string | null;
  onSelectMachine: (id: string) => void;
  onRefreshData?: () => void;
}

export const MachineHealthView: React.FC<MachineHealthViewProps> = ({
  machines,
  selectedMachineId,
  onSelectMachine,
}) => {
  const [fleetSummary, setFleetSummary] = useState<FleetHealthSummaryResponse | null>(null);
  const [machineDetail, setMachineDetail] = useState<MachineHealthDetailResponse | null>(null);
  const [activeMachineId, setActiveMachineId] = useState<string | null>(
    selectedMachineId || (machines.length > 0 ? machines[0].id : null)
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFleetSummary = useCallback(async () => {
    try {
      const summary = await endpoints.getFleetHealthSummary();
      setFleetSummary(summary);
    } catch (err) {
      console.error("Failed to load fleet health summary:", err);
    }
  }, []);

  const fetchMachineDetail = useCallback(async (machineId: string) => {
    setDetailLoading(true);
    try {
      const detail = await endpoints.getMachineHealthDetail(machineId, 24.0);
      setMachineDetail(detail);
      setError(null);
    } catch (err: unknown) {
      console.error(`Failed to load machine detail for ${machineId}:`, err);
      setError(err instanceof Error ? err.message : "Failed to load machine health details.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchFleetSummary().finally(() => setLoading(false));
  }, [fetchFleetSummary]);

  useEffect(() => {
    if (activeMachineId) {
      fetchMachineDetail(activeMachineId);
    } else if (machines.length > 0) {
      setActiveMachineId(machines[0].id);
      fetchMachineDetail(machines[0].id);
    }
  }, [activeMachineId, machines, fetchMachineDetail]);

  const handleMachineChange = (id: string) => {
    setActiveMachineId(id);
    onSelectMachine(id);
  };

  const handleAcknowledgeWarning = async (
    warningId: string,
    technician: string,
    notes?: string
  ) => {
    await endpoints.acknowledgeHealthWarning(warningId, {
      acknowledged_by: technician,
      notes: notes,
    });
    if (activeMachineId) {
      await fetchMachineDetail(activeMachineId);
    }
    await fetchFleetSummary();
  };

  const handleCreateObservation = async (payload: MaintenanceObservationCreate) => {
    await endpoints.createMaintenanceObservation(payload);
    if (activeMachineId) {
      await fetchMachineDetail(activeMachineId);
    }
    await fetchFleetSummary();
  };

  const handleManualRefresh = async () => {
    setLoading(true);
    try {
      await fetchFleetSummary();
      if (activeMachineId) {
        await fetchMachineDetail(activeMachineId);
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading && !fleetSummary) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-cyan-500 mb-3" />
        <p className="text-sm font-medium font-mono">Loading condition monitoring telemetry...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-4">
      {/* Top Controls Row (Refresh button) */}
      <div className="flex justify-end items-center gap-2">
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={loading || detailLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-mono rounded-lg border border-slate-800 transition cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading || detailLoading ? "animate-spin" : ""}`} />
          <span>Refresh Telemetry</span>
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 font-mono">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* 1. Fleet Condition Overview */}
      <FleetHealthOverview summary={fleetSummary} isLoading={loading} />

      {/* 2. Machine Condition Diagnostics (Sub-scores & Channel Matrix) */}
      <MachineHealthAnalysis
        detail={machineDetail}
        machines={machines}
        selectedMachineId={activeMachineId}
        onSelectMachine={handleMachineChange}
        isLoading={detailLoading}
      />

      {/* 3. Active Condition Warnings */}
      <WarningInvestigationList
        warnings={machineDetail?.active_warnings || []}
        onAcknowledge={handleAcknowledgeWarning}
        isLoading={detailLoading}
      />

      {/* 4. Maintenance Observations Log */}
      <MaintenanceObservationsLog
        observations={machineDetail?.recent_observations || []}
        machineId={activeMachineId || ""}
        activeWarnings={machineDetail?.active_warnings || []}
        onCreateObservation={handleCreateObservation}
        isLoading={detailLoading}
      />

      {/* 5. Analytical Transparency & Scoring Explanation */}
      <HealthScoreExplanationPanel />
    </div>
  );
};
