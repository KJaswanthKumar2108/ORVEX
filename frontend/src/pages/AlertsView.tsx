import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Zap,
} from "lucide-react";
import { endpoints } from "../api/endpoints";
import type {
  AlertRecord,
  MachineHealthWarning,
  MachineSummaryResponse,
} from "../api/types";
import { AlertsMetricOverview } from "../components/alerts/AlertsMetricOverview";
import { AlertsTable } from "../components/alerts/AlertsTable";
import { AlertDetailModal } from "../components/alerts/AlertDetailModal";
import {
  AcknowledgeModal,
  DismissModal,
  ResolveModal,
} from "../components/alerts/AlertActionModals";
import { MachineHealthWarningsSection } from "../components/alerts/MachineHealthWarningsSection";

interface AlertsViewProps {
  machines: MachineSummaryResponse[];
  onSelectMachine: (machineId: string) => void;
}

export const AlertsView: React.FC<AlertsViewProps> = ({
  machines,
  onSelectMachine,
}) => {
  const [activeTab, setActiveTab] = useState<"energy" | "health">("energy");

  // Energy Alerts state
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(true);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  // Machine Health Warnings state
  const [healthWarnings, setHealthWarnings] = useState<MachineHealthWarning[]>([]);
  const [isLoadingWarnings, setIsLoadingWarnings] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [machineFilter, setMachineFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modals & Active Alert Selection
  const [selectedAlertForDetail, setSelectedAlertForDetail] = useState<AlertRecord | null>(null);
  const [selectedAlertForAck, setSelectedAlertForAck] = useState<AlertRecord | null>(null);
  const [selectedAlertForResolve, setSelectedAlertForResolve] = useState<AlertRecord | null>(null);
  const [selectedAlertForDismiss, setSelectedAlertForDismiss] = useState<AlertRecord | null>(null);

  // In-flight Action Lock
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // Notification banners (inline feedback)
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const fetchAlerts = async () => {
    setIsLoadingAlerts(true);
    setAlertsError(null);
    try {
      const params: {
        status?: string;
        severity?: string;
        machine_id?: string;
        limit?: number;
      } = { limit: 200 };

      if (statusFilter !== "all") params.status = statusFilter;
      if (severityFilter !== "all") params.severity = severityFilter;
      if (machineFilter !== "all") params.machine_id = machineFilter;

      const response = await endpoints.getAlerts(params);
      setAlerts(response.items);

      // Keep detail modal updated if open
      if (selectedAlertForDetail) {
        const updated = response.items.find((a) => a.id === selectedAlertForDetail.id);
        if (updated) setSelectedAlertForDetail(updated);
      }
    } catch (err: any) {
      setAlertsError(err?.message || "Failed to load alerts from backend");
    } finally {
      setIsLoadingAlerts(false);
    }
  };

  const fetchHealthWarnings = async () => {
    setIsLoadingWarnings(true);
    try {
      const warnings = await endpoints.getFleetHealthWarnings();
      setHealthWarnings(warnings);
    } catch (err: any) {
      // Non-blocking for energy alerts view
      console.warn("Could not load fleet health warnings:", err);
    } finally {
      setIsLoadingWarnings(false);
    }
  };

  const handleRefreshAll = () => {
    fetchAlerts();
    fetchHealthWarnings();
  };

  useEffect(() => {
    fetchAlerts();
  }, [statusFilter, severityFilter, machineFilter]);

  useEffect(() => {
    fetchHealthWarnings();
  }, []);

  // Alert Lifecycle Actions
  const handleAcknowledgeAlert = async (alertId: string, comment?: string) => {
    setActionInProgressId(alertId);
    setNotification(null);
    try {
      const updated = await endpoints.acknowledgeAlert(alertId, comment);
      setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      if (selectedAlertForDetail?.id === updated.id) {
        setSelectedAlertForDetail(updated);
      }
      setSelectedAlertForAck(null);
      setNotification({
        type: "success",
        message: `Alert "${updated.title}" successfully acknowledged.`,
      });
    } catch (err: any) {
      setNotification({
        type: "error",
        message: `Failed to acknowledge alert: ${err?.message || "Network error"}`,
      });
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleResolveAlert = async (alertId: string, notes?: string) => {
    setActionInProgressId(alertId);
    setNotification(null);
    try {
      const updated = await endpoints.resolveAlert(alertId, notes);
      setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      if (selectedAlertForDetail?.id === updated.id) {
        setSelectedAlertForDetail(updated);
      }
      setSelectedAlertForResolve(null);
      setNotification({
        type: "success",
        message: `Alert "${updated.title}" marked as resolved.`,
      });
    } catch (err: any) {
      setNotification({
        type: "error",
        message: `Failed to resolve alert: ${err?.message || "Network error"}`,
      });
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleDismissAlert = async (alertId: string) => {
    setActionInProgressId(alertId);
    setNotification(null);
    try {
      const updated = await endpoints.dismissAlert(alertId);
      setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      if (selectedAlertForDetail?.id === updated.id) {
        setSelectedAlertForDetail(updated);
      }
      setSelectedAlertForDismiss(null);
      setNotification({
        type: "success",
        message: `Alert "${updated.title}" dismissed.`,
      });
    } catch (err: any) {
      setNotification({
        type: "error",
        message: `Failed to dismiss alert: ${err?.message || "Network error"}`,
      });
    } finally {
      setActionInProgressId(null);
    }
  };

  // Health Warning Lifecycle Action
  const handleAcknowledgeHealthWarning = async (
    warningId: string,
    acknowledgedBy: string,
    notes?: string
  ) => {
    setActionInProgressId(warningId);
    setNotification(null);
    try {
      const updated = await endpoints.acknowledgeHealthWarning(warningId, {
        acknowledged_by: acknowledgedBy,
        notes,
      });
      setHealthWarnings((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
      setNotification({
        type: "success",
        message: `Machine health warning successfully acknowledged by ${acknowledgedBy}.`,
      });
    } catch (err: any) {
      setNotification({
        type: "error",
        message: `Failed to acknowledge health warning: ${err?.message || "Network error"}`,
      });
    } finally {
      setActionInProgressId(null);
    }
  };

  const openAlertsCount = alerts.filter((a) => a.status === "open").length;
  const openWarningsCount = healthWarnings.filter((w) => w.status === "open").length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white tracking-tight">Alert & Triage Center</h2>
            {openAlertsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                {openAlertsCount} Open Energy
              </span>
            )}
            {openWarningsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {openWarningsCount} Health Warnings
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Operational triage console for verified energy-wastage episodes and machine-health degradation warnings
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Section Navigation Tabs */}
          <div className="inline-flex rounded-lg bg-slate-900 p-1 border border-slate-800 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("energy")}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                activeTab === "energy"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Energy Alerts ({alerts.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("health")}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                activeTab === "health"
                  ? "bg-sky-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Health Warnings ({healthWarnings.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={isLoadingAlerts || isLoadingWarnings}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                isLoadingAlerts || isLoadingWarnings ? "animate-spin" : ""
              }`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Feedback Notification Banner */}
      {notification && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between animate-in fade-in duration-150 ${
            notification.type === "success"
              ? "bg-emerald-950/40 border-emerald-800/80 text-emerald-200"
              : "bg-rose-950/40 border-rose-800/80 text-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-white ml-2 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Alerts Error Banner */}
      {alertsError && (
        <div className="bg-rose-950/20 border border-rose-800/60 rounded-lg p-4 text-xs text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{alertsError}</span>
          </div>
          <button
            type="button"
            onClick={fetchAlerts}
            className="px-2.5 py-1 rounded bg-rose-900/50 hover:bg-rose-800 text-xs text-rose-200 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Tab 1: Energy Wastage Alerts */}
      {activeTab === "energy" && (
        <div className="space-y-6">
          {/* Executive Metrics Overview Strip */}
          <AlertsMetricOverview
            alerts={alerts}
            onFilterStatus={(s) => setStatusFilter(s)}
            onFilterSeverity={(sev) => setSeverityFilter(sev)}
            currentStatusFilter={statusFilter}
            currentSeverityFilter={severityFilter}
          />

          {/* Master Alerts Table */}
          <AlertsTable
            alerts={alerts}
            machines={machines}
            isLoading={isLoadingAlerts}
            onSelectAlert={(a) => setSelectedAlertForDetail(a)}
            onSelectMachine={onSelectMachine}
            onAcknowledgeAlert={(a) => setSelectedAlertForAck(a)}
            onResolveAlert={(a) => setSelectedAlertForResolve(a)}
            onDismissAlert={(a) => setSelectedAlertForDismiss(a)}
            actionInProgressId={actionInProgressId}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            severityFilter={severityFilter}
            onSeverityFilterChange={setSeverityFilter}
            machineFilter={machineFilter}
            onMachineFilterChange={setMachineFilter}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
          />
        </div>
      )}

      {/* Tab 2: Condition Monitoring Machine Health Warnings */}
      {activeTab === "health" && (
        <div className="space-y-6">
          <MachineHealthWarningsSection
            warnings={healthWarnings}
            isLoading={isLoadingWarnings}
            onSelectMachine={onSelectMachine}
            onAcknowledgeWarning={handleAcknowledgeHealthWarning}
            actionInProgressId={actionInProgressId}
          />
        </div>
      )}

      {/* Investigation / Detail Modal */}
      <AlertDetailModal
        alert={selectedAlertForDetail}
        isOpen={Boolean(selectedAlertForDetail)}
        onClose={() => setSelectedAlertForDetail(null)}
        onSelectMachine={onSelectMachine}
        onAcknowledgeClick={(a) => {
          setSelectedAlertForDetail(null);
          setSelectedAlertForAck(a);
        }}
        onResolveClick={(a) => {
          setSelectedAlertForDetail(null);
          setSelectedAlertForResolve(a);
        }}
        onDismissClick={(a) => {
          setSelectedAlertForDetail(null);
          setSelectedAlertForDismiss(a);
        }}
      />

      {/* Acknowledge Action Modal */}
      <AcknowledgeModal
        alert={selectedAlertForAck}
        isOpen={Boolean(selectedAlertForAck)}
        isLoading={actionInProgressId === selectedAlertForAck?.id}
        onConfirm={handleAcknowledgeAlert}
        onClose={() => setSelectedAlertForAck(null)}
      />

      {/* Resolve Action Modal */}
      <ResolveModal
        alert={selectedAlertForResolve}
        isOpen={Boolean(selectedAlertForResolve)}
        isLoading={actionInProgressId === selectedAlertForResolve?.id}
        onConfirm={handleResolveAlert}
        onClose={() => setSelectedAlertForResolve(null)}
      />

      {/* Dismiss Action Modal */}
      <DismissModal
        alert={selectedAlertForDismiss}
        isOpen={Boolean(selectedAlertForDismiss)}
        isLoading={actionInProgressId === selectedAlertForDismiss?.id}
        onConfirm={handleDismissAlert}
        onClose={() => setSelectedAlertForDismiss(null)}
      />
    </div>
  );
};
