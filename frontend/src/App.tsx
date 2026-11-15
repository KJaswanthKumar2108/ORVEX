import { useState, useEffect, useCallback } from "react";
import { Header, type NavTab } from "./components/common/Header";
import { useHealth } from "./hooks/useHealth";
import { useDashboardData } from "./hooks/useDashboardData";
import { DashboardView } from "./pages/DashboardView";
import { MachinesView } from "./pages/MachinesView";
import { MachineDetailView } from "./pages/MachineDetailView";
import { AlertsView } from "./pages/AlertsView";
import { ReportsView } from "./pages/ReportsView";
import { EnergyIntelligenceView } from "./pages/EnergyIntelligenceView";
import { MachineHealthView } from "./pages/MachineHealthView";
import { DemonstrationCenterView } from "./pages/DemonstrationCenterView";
import { SystemStatusView } from "./pages/SystemStatusView";
import { API_BASE_URL } from "./api/client";
import { endpoints } from "./api/endpoints";
import type { AlertRecord } from "./api/types";
import type { TimeRangeKey } from "./utils/timeRanges";

const parseLocationHash = (): { tab: NavTab; machineId: string | null } => {
  if (typeof window === "undefined") return { tab: "fleet", machineId: null };
  const raw = window.location.hash.replace(/^#\/?/, "");
  if (raw.startsWith("machine/")) {
    const id = raw.replace("machine/", "").trim();
    return { tab: "fleet", machineId: id || null };
  }
  const validTabs: NavTab[] = [
    "fleet",
    "machines",
    "alerts",
    "reports",
    "intelligence",
    "health",
    "demo",
    "system",
  ];
  if (validTabs.includes(raw as NavTab)) {
    return { tab: raw as NavTab, machineId: null };
  }
  return { tab: "fleet", machineId: null };
};

export function App() {
  const initial = parseLocationHash();
  const [activeTab, setActiveTab] = useState<NavTab>(initial.tab);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(initial.machineId);
  const [timeRangeKey, setTimeRangeKey] = useState<TimeRangeKey>("24h");

  // Sync state when browser Back / Forward buttons are clicked
  useEffect(() => {
    const handleHashChange = () => {
      const parsed = parseLocationHash();
      setActiveTab(parsed.tab);
      setSelectedMachineId(parsed.machineId);
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Alerts state for global navigation badge and dashboard panel
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);

  // Health status check
  const { isHealthy, healthChecking, checkHealth } = useHealth(30000);

  // Main dashboard data
  const {
    data,
    isLoading,
    error,
    lastRefreshed,
    refresh: refreshDashboard,
  } = useDashboardData(timeRangeKey);

  const fetchRecentAlerts = useCallback(async () => {
    try {
      const res = await endpoints.getAlerts({ limit: 50 });
      setAlerts(res.items);
    } catch {
      // Ignore background alerts fetch errors to avoid blocking UI
    }
  }, []);

  useEffect(() => {
    fetchRecentAlerts();
  }, [fetchRecentAlerts]);

  const handleGlobalRefresh = () => {
    checkHealth();
    refreshDashboard();
    fetchRecentAlerts();
  };

  const handleSelectMachine = (machineId: string | null) => {
    setSelectedMachineId(machineId);
    if (machineId) {
      window.location.hash = `#/machine/${machineId}`;
    } else {
      window.location.hash = `#/${activeTab}`;
    }
  };

  const handleTabChange = (tab: NavTab) => {
    setSelectedMachineId(null);
    setActiveTab(tab);
    window.location.hash = `#/${tab}`;
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    const updated = await endpoints.acknowledgeAlert(alertId);
    setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  };

  const openAlertsCount = alerts.filter((a) => a.status === "open").length;

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* Top Application Header */}
      <Header
        activeTab={activeTab}
        onTabChange={handleTabChange}
        openAlertsCount={openAlertsCount}
        isHealthy={isHealthy}
        healthChecking={healthChecking}
        lastRefreshed={lastRefreshed}
        onRefresh={handleGlobalRefresh}
        isRefreshing={isLoading || healthChecking}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {selectedMachineId ? (
          <MachineDetailView
            machineId={selectedMachineId}
            onBack={() => handleSelectMachine(null)}
          />
        ) : activeTab === "machines" ? (
          <MachinesView
            machines={data.machines}
            isLoading={isLoading}
            onSelectMachine={(mId) => handleSelectMachine(mId)}
            onRefresh={handleGlobalRefresh}
          />
        ) : activeTab === "alerts" ? (
          <AlertsView
            machines={data.machines}
            onSelectMachine={(mId) => handleSelectMachine(mId)}
          />
        ) : activeTab === "reports" ? (
          <ReportsView
            machines={data.machines}
            onSelectMachine={(mId) => handleSelectMachine(mId)}
          />
        ) : activeTab === "intelligence" ? (
          <EnergyIntelligenceView
            machines={data.machines}
            onSelectMachine={(mId) => handleSelectMachine(mId)}
          />
        ) : activeTab === "health" ? (
          <MachineHealthView
            machines={data.machines}
            selectedMachineId={selectedMachineId}
            onSelectMachine={(mId) => handleSelectMachine(mId)}
            onRefreshData={handleGlobalRefresh}
          />
        ) : activeTab === "demo" ? (
          <DemonstrationCenterView
            machines={data.machines}
            onSelectMachine={(mId) => handleSelectMachine(mId)}
            onNavigateToAlerts={() => handleTabChange("alerts")}
            onNavigateToFleet={() => handleTabChange("fleet")}
            onNavigateToSystem={() => handleTabChange("system")}
          />
        ) : activeTab === "system" ? (
          <SystemStatusView onRefresh={handleGlobalRefresh} />
        ) : (
          <DashboardView
            data={data}
            alerts={alerts}
            isLoading={isLoading}
            error={error}
            timeRangeKey={timeRangeKey}
            onTimeRangeChange={setTimeRangeKey}
            onSelectMachine={(mId) => handleSelectMachine(mId)}
            onRetry={handleGlobalRefresh}
            onAcknowledgeAlert={handleAcknowledgeAlert}
            onViewAllAlerts={() => handleTabChange("alerts")}
          />
        )}
      </main>

      {/* Industrial Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 px-4 sm:px-6 py-4 mt-auto text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-slate-400">ORVEX</span> — Energy Intelligence Platform
            for Legacy Mining Equipment
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px]">
            <span>API: {API_BASE_URL}</span>
            <span>•</span>
            <span className="text-emerald-400">Deterministic Analytics</span>
            <span>•</span>
            <span>Stage 9 Verified Architecture</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
