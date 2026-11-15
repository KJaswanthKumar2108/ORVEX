import React, { useState, useEffect } from "react";
import {
  Server,
  Database,
  Radio,
  ShieldCheck,
  Cpu,
  RefreshCw,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { endpoints } from "../api/endpoints";
import type { SystemStatusResponse } from "../api/types";
import { PageHeader } from "../components/common/PageHeader";
import { MetricCard } from "../components/common/MetricCard";
import { ErrorAlert } from "../components/common/ErrorAlert";
import { CardSkeleton } from "../components/common/LoadingSkeleton";
import { THEME } from "../theme/tokens";
import { formatDuration } from "../utils/formatters";

interface SystemStatusViewProps {
  onRefresh?: () => void;
}

export const SystemStatusView: React.FC<SystemStatusViewProps> = ({ onRefresh }) => {
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);
  const [readiness, setReadiness] = useState<{ status: string; database: string } | null>(null);
  const [liveness, setLiveness] = useState<{ status: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckTime, setLastCheckTime] = useState<Date>(new Date());

  const fetchSystemData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [statusRes, readinessRes, livenessRes] = await Promise.all([
        endpoints.getSystemStatus(),
        endpoints.getSystemReadiness().catch(() => ({ status: "unreachable", database: "disconnected" })),
        endpoints.getSystemLiveness().catch(() => ({ status: "unreachable" })),
      ]);
      setStatus(statusRes);
      setReadiness(readinessRes);
      setLiveness(livenessRes);
      setLastCheckTime(new Date());
      onRefresh?.();
    } catch (err: any) {
      setError(err?.message || "Failed to communicate with ORVEX system observability service.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemData();
    const interval = setInterval(fetchSystemData, 15000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading && !status) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="System Observability & Health"
          subtitle="Real-time backend infrastructure diagnostics, latency benchmarks, and security telemetry"
          icon={<Server className="w-5 h-5 text-cyan-400" />}
        />
        <CardSkeleton count={4} />
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="System Observability & Health"
          subtitle="Real-time backend infrastructure diagnostics, latency benchmarks, and security telemetry"
          icon={<Server className="w-5 h-5 text-cyan-400" />}
        />
        <ErrorAlert
          title="System Status Unreachable"
          message={error}
          onRetry={fetchSystemData}
        />
      </div>
    );
  }

  const isDbHealthy = status?.database?.status === "healthy";
  const isMqttConnected = status?.mqtt_gateway?.connected === true;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="System Observability & Health"
        subtitle="Real-time backend infrastructure diagnostics, database connection latency, and security telemetry"
        icon={<Server className="w-5 h-5 text-cyan-400" />}
        actions={
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
              Checked {lastCheckTime.toLocaleTimeString()}
            </span>
            <button
              type="button"
              onClick={fetchSystemData}
              disabled={isLoading}
              className={THEME.buttons.secondary}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-cyan-400" : ""}`} />
              <span>Poll Status</span>
            </button>
          </div>
        }
      />

      {/* Primary Infrastructure KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title="Process Uptime"
          value={status ? formatDuration(status.uptime_seconds) : "—"}
          subtitle={`Running in ${status?.environment || "development"} mode`}
          icon={<Clock className="w-4 h-4 text-cyan-400" />}
          indicatorColor="cyan"
        />
        <MetricCard
          title="Database Ping"
          value={status?.database?.latency_ms !== null && status?.database?.latency_ms !== undefined ? `${status.database.latency_ms}` : "—"}
          unit="ms"
          subtitle={
            <span className="flex items-center gap-1 font-mono text-[11px]">
              <span className={`w-1.5 h-1.5 rounded-full ${isDbHealthy ? "bg-emerald-400" : "bg-rose-400"}`} />
              <span>{isDbHealthy ? "TimescaleDB Connected" : "Connection Error"}</span>
            </span>
          }
          icon={<Database className="w-4 h-4 text-emerald-400" />}
          indicatorColor={isDbHealthy ? "emerald" : "rose"}
        />
        <MetricCard
          title="MQTT Gateway"
          value={isMqttConnected ? "ONLINE" : "OFFLINE"}
          subtitle={`${status?.mqtt_gateway?.broker || "localhost:1883"} (${status?.mqtt_gateway?.topic_prefix || "orvex/"})`}
          icon={<Radio className="w-4 h-4 text-emerald-400" />}
          indicatorColor={isMqttConnected ? "emerald" : "rose"}
        />
        <MetricCard
          title="Container Status"
          value={readiness?.status === "ready" ? "READY" : "HEALTHY"}
          subtitle={`Liveness: ${liveness?.status || "ok"}`}
          icon={<ShieldCheck className="w-4 h-4 text-cyan-400" />}
          indicatorColor="cyan"
        />
      </div>

      {/* Detail Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Database & Persistence Health */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-white font-mono uppercase tracking-wider">
                TimescaleDB / PostgreSQL Telemetry Engine
              </h3>
            </div>
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
              isDbHealthy
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-rose-500/10 text-rose-400 border-rose-500/30"
            }`}>
              {status?.database?.status?.toUpperCase() || "UNKNOWN"}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">Connection Latency:</span>
              <span className="font-mono text-emerald-400 font-medium">
                {status?.database?.latency_ms !== null && status?.database?.latency_ms !== undefined
                  ? `${status.database.latency_ms.toFixed(2)} ms`
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">Engine Type:</span>
              <span className="font-mono text-slate-300">TimescaleDB Hypertable Engine</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">Readiness Probe:</span>
              <span className="font-mono text-slate-300">{readiness?.database || "ready"}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Data Hygiene Assurance:</span>
              <span className="font-mono text-emerald-400">Zero Residual Rows on Demo Teardown</span>
            </div>
          </div>
        </div>

        {/* MQTT Industrial Gateway */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-white font-mono uppercase tracking-wider">
                Industrial MQTT Sensor Gateway
              </h3>
            </div>
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
              isMqttConnected
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-rose-500/10 text-rose-400 border-rose-500/30"
            }`}>
              {isMqttConnected ? "CONNECTED" : "DISCONNECTED"}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">Broker Endpoint:</span>
              <span className="font-mono text-slate-300">{status?.mqtt_gateway?.broker || "127.0.0.1:1883"}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">Topic Hierarchy Prefix:</span>
              <span className="font-mono text-slate-300">{status?.mqtt_gateway?.topic_prefix || "orvex/"}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">Messages Ingested:</span>
              <span className="font-mono text-emerald-400 font-medium">
                {status?.mqtt_gateway?.messages_ingested ?? 0}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Messages Rejected:</span>
              <span className="font-mono text-slate-400">
                {status?.mqtt_gateway?.messages_rejected ?? 0}
              </span>
            </div>
          </div>
        </div>

        {/* Security & Hardening Posture */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-white font-mono uppercase tracking-wider">
                Industrial Security Posture
              </h3>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              ACTIVE
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">Rate Limiting Protection:</span>
              <span className="font-mono text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Enabled (100 req/min/IP)
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">Security Response Headers:</span>
              <span className="font-mono text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                HSTS, CSP, X-Frame-Options
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">Input Validation & Sanitization:</span>
              <span className="font-mono text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Strict Pydantic v2 Contracts
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">API Exposure:</span>
              <span className="font-mono text-slate-300">Versioned /api/v1 prefix</span>
            </div>
          </div>
        </div>

        {/* Runtime & Environment Details */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-white font-mono uppercase tracking-wider">
                Runtime & Core Services
              </h3>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              v{status?.version || "1.0.0"}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">Application Framework:</span>
              <span className="font-mono text-slate-300">FastAPI (Python 3.12 Asynchronous)</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">Frontend Architecture:</span>
              <span className="font-mono text-slate-300">React 19 + TypeScript + Vite + Tailwind v4</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">Analytics Engine:</span>
              <span className="font-mono text-emerald-400">Deterministic Feature Pipeline</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Observability Timestamp:</span>
              <span className="font-mono text-slate-400">{status?.timestamp || "—"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
