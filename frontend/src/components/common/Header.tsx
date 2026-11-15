import React from "react";
import {
  Activity,
  Bell,
  BrainCircuit,
  Cpu,
  FileSpreadsheet,
  HeartPulse,
  LayoutDashboard,
  RefreshCw,
  Server,
  Terminal,
  Zap,
} from "lucide-react";
import { formatShortTime } from "../../utils/formatters";

export type NavTab =
  | "fleet"
  | "machines"
  | "intelligence"
  | "health"
  | "alerts"
  | "reports"
  | "demo"
  | "system";

interface HeaderProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  openAlertsCount?: number;
  isHealthy: boolean | null; // null = checking, true = ok, false = offline
  healthChecking: boolean;
  lastRefreshed: string | null;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  openAlertsCount = 0,
  isHealthy,
  healthChecking,
  lastRefreshed,
  onRefresh,
  isRefreshing,
}) => {
  return (
    <header className="bg-slate-900/90 border-b border-slate-800/80 sticky top-0 z-30 backdrop-blur-md px-3 sm:px-6 py-2.5 shadow-sm">
      <div className="max-w-7xl mx-auto flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
        {/* Brand identity & Navigation */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-5 overflow-x-auto">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
              <Zap className="w-4 h-4 fill-emerald-400/20" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold tracking-tight text-white font-mono">ORVEX</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-mono border border-emerald-500/30">
                  FINALIST
                </span>
              </div>
              <p className="text-[11px] text-slate-400 tracking-normal font-sans hidden sm:block">
                Industrial Energy Intelligence
              </p>
            </div>
          </div>

          {/* Navigation Tabs - 8 Standardized Sections */}
          <nav
            aria-label="ORVEX platform sections"
            className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800 text-xs font-medium overflow-x-auto no-scrollbar"
          >
            <button
              type="button"
              onClick={() => onTabChange("fleet")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 ${
                activeTab === "fleet"
                  ? "bg-slate-800 text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Fleet</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange("machines")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 ${
                activeTab === "machines"
                  ? "bg-slate-800 text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              <span>Machines</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange("intelligence")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 ${
                activeTab === "intelligence"
                  ? "bg-slate-800 text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <BrainCircuit className="w-3.5 h-3.5 text-emerald-400" />
              <span>Intelligence</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange("health")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 ${
                activeTab === "health"
                  ? "bg-slate-800 text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <HeartPulse className="w-3.5 h-3.5 text-cyan-400" />
              <span>Health</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange("alerts")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 ${
                activeTab === "alerts"
                  ? "bg-slate-800 text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Bell className="w-3.5 h-3.5 text-amber-400" />
              <span>Alerts</span>
              {openAlertsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-rose-500 text-white leading-none">
                  {openAlertsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onTabChange("reports")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 ${
                activeTab === "reports"
                  ? "bg-slate-800 text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-400" />
              <span>Reports</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange("demo")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 ${
                activeTab === "demo"
                  ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 shadow-sm font-semibold"
                  : "text-emerald-400/80 hover:text-emerald-300"
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span>Demo Center</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange("system")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 ${
                activeTab === "system"
                  ? "bg-slate-800 text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Server className="w-3.5 h-3.5 text-slate-400" />
              <span>System</span>
            </button>
          </nav>
        </div>

        {/* Status and Actions */}
        <div className="flex items-center justify-between sm:justify-end gap-3 text-xs shrink-0">
          {/* Backend Health Indicator */}
          <div
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-800/70 border border-slate-700/60"
            title={
              isHealthy === true
                ? "FastAPI telemetry and analytics service connected"
                : isHealthy === false
                ? "Cannot reach ORVEX API service"
                : "Checking backend connectivity..."
            }
          >
            <Activity className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 hidden sm:inline">Backend:</span>
            {healthChecking ? (
              <span className="inline-flex items-center gap-1.5 text-slate-400 font-medium font-mono text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-ping" />
                CHECK
              </span>
            ) : isHealthy === true ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium font-mono text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ONLINE
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-rose-400 font-medium font-mono text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                OFFLINE
              </span>
            )}
          </div>

          {/* Last refreshed time */}
          <div className="text-slate-400 hidden 2xl:block text-[11px]">
            Updated:{" "}
            <span className="font-mono text-slate-300">
              {lastRefreshed ? formatShortTime(lastRefreshed) : "—"}
            </span>
          </div>

          {/* Refresh button */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Refresh dashboard data"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400/50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>
    </header>
  );
};
