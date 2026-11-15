import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { endpoints } from "../api/endpoints";
import type {
  AlertRecord,
  MachineSummaryResponse,
  TelemetryRecordResponse,
  WastageEventResponse,
} from "../api/types";
import {
  DEMO_SCENARIOS,
  type DemoScenarioDefinition,
  DemoScenarioSelector,
} from "../components/demo/DemoScenarioSelector";
import {
  DemoSimulationControls,
  type SimulationStatus,
} from "../components/demo/DemoSimulationControls";
import { DemoLiveTelemetryMonitor } from "../components/demo/DemoLiveTelemetryMonitor";
import { DemoPipelineVisualizer } from "../components/demo/DemoPipelineVisualizer";
import { DemoDetectionResults } from "../components/demo/DemoDetectionResults";
import { DemoSessionSummary } from "../components/demo/DemoSessionSummary";

interface DemonstrationCenterViewProps {
  machines?: MachineSummaryResponse[];
  onSelectMachine?: (machineId: string) => void;
  onNavigateToAlerts?: () => void;
  onNavigateToFleet?: () => void;
  onNavigateToSystem?: () => void;
}

export const DemonstrationCenterView: React.FC<DemonstrationCenterViewProps> = ({
  machines: propMachines,
  onSelectMachine,
  onNavigateToAlerts,
  onNavigateToFleet,
  onNavigateToSystem,
}) => {
  // Machine fleet state
  const [fleetMachines, setFleetMachines] = useState<MachineSummaryResponse[]>(propMachines || []);

  // Scenario selection
  const [selectedScenario, setSelectedScenario] = useState<DemoScenarioDefinition>(
    DEMO_SCENARIOS[0] // Default: idle_wastage
  );

  // Target machine selection
  const [selectedMachineId, setSelectedMachineId] = useState<string>("");

  // Verification session execution status
  const [status, setStatus] = useState<SimulationStatus>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Live telemetry & detection records
  const [latestTelemetry, setLatestTelemetry] = useState<TelemetryRecordResponse | null>(null);
  const [totalSamplesReceived, setTotalSamplesReceived] = useState<number>(0);
  const [events, setEvents] = useState<WastageEventResponse[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);

  // Polling & network state
  const [isLoadingTelemetry, setIsLoadingTelemetry] = useState<boolean>(false);
  const [lastPolledAt, setLastPolledAt] = useState<Date | null>(null);

  const timerRef = useRef<number | null>(null);
  const pollingRef = useRef<number | null>(null);

  // 1. Fetch machines if not provided via props
  useEffect(() => {
    if (propMachines && propMachines.length > 0) {
      setFleetMachines(propMachines);
    } else {
      endpoints
        .getMachines({ limit: 50 })
        .then((res) => {
          const mapped: MachineSummaryResponse[] = res.items.map((m) => ({
            id: m.id,
            site_id: m.site_id,
            machine_identifier: m.machine_identifier,
            name: m.name,
            machine_type: m.machine_type,
            rated_power_kw: m.rated_power_kw,
            status: m.status,
            telemetry_freshness: "missing",
            latest_telemetry_timestamp: null,
            latest_operating_state: null,
            latest_active_power: null,
            latest_power_factor: null,
            latest_temperature: null,
            latest_load_percent: null,
          }));
          setFleetMachines(mapped);
        })
        .catch((err) => {
          console.warn("Could not fetch machines for demo center:", err);
        });
    }
  }, [propMachines]);

  // 2. Synchronize selectedMachineId to match selectedScenario's default machine
  useEffect(() => {
    const match = fleetMachines.find(
      (m) =>
        m.machine_identifier === selectedScenario.defaultMachineIdentifier ||
        m.name.toLowerCase().includes(selectedScenario.defaultMachineName.toLowerCase())
    );

    if (match) {
      setSelectedMachineId(match.id);
    } else if (fleetMachines.length > 0) {
      setSelectedMachineId(fleetMachines[0].id);
    } else {
      setSelectedMachineId(selectedScenario.defaultMachineIdentifier);
    }
  }, [selectedScenario, fleetMachines]);

  // 3. Telemetry & Analytics Poller
  const pollData = async (mId: string) => {
    if (!mId) return;
    setIsLoadingTelemetry(true);
    try {
      // 1. Fetch latest telemetry
      const telRes = await endpoints.getMachineTelemetry(mId, { limit: 10 });
      if (telRes.items && telRes.items.length > 0) {
        setLatestTelemetry(telRes.items[0]);
        setTotalSamplesReceived(telRes.total || telRes.items.length);
      }

      // 2. Fetch detected wastage events
      const evtRes = await endpoints.getMachineWastageEvents(mId, { limit: 10 });
      setEvents(evtRes.items);

      // 3. Fetch generated alerts
      const altRes = await endpoints.getMachineAlerts(mId, { limit: 10 });
      setAlerts(altRes.items);

      // 4. Check for state transition to 'detected' if we find an event (or golden reference confirmed)
      if (status === "monitoring") {
        if (selectedScenario.id === "normal") {
          // Normal scenario: confirmed after receiving at least 5 samples with 0 wastage
          if (telRes.total >= 5 && evtRes.items.length === 0) {
            setStatus("detected");
          }
        } else if (evtRes.items.length > 0) {
          setStatus("detected");
        }
      }

      setLastPolledAt(new Date());
    } catch (err) {
      console.warn("Telemetry polling issue in DemonstrationCenter:", err);
    } finally {
      setIsLoadingTelemetry(false);
    }
  };

  // Poll immediately when machine changes
  useEffect(() => {
    if (selectedMachineId) {
      pollData(selectedMachineId);
    }
  }, [selectedMachineId]);

  // 4. Session Elapsed Timer & Background Polling Loop
  useEffect(() => {
    if (status === "monitoring") {
      // Timer tick every 1s
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);

      // Polling tick every 2.5s
      pollingRef.current = window.setInterval(() => {
        if (selectedMachineId) {
          pollData(selectedMachineId);
        }
      }, 2500);
    } else {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      if (pollingRef.current !== null) window.clearInterval(pollingRef.current);
    }

    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      if (pollingRef.current !== null) window.clearInterval(pollingRef.current);
    };
  }, [status, selectedMachineId, selectedScenario.id]);

  // Session Handlers
  const handleStartSession = () => {
    setStatus("monitoring");
    setElapsedSeconds(0);
    if (selectedMachineId) {
      pollData(selectedMachineId);
    }
  };

  const handleStopSession = () => {
    setStatus("completed");
  };

  const handleResetSession = () => {
    setStatus("idle");
    setElapsedSeconds(0);
    if (selectedMachineId) {
      pollData(selectedMachineId);
    }
  };

  const currentMachine = fleetMachines.find((m) => m.id === selectedMachineId);
  const ratedPower = currentMachine?.rated_power_kw ?? selectedScenario.defaultRatedPowerKw;

  return (
    <div className="space-y-8 animate-fade-in pb-16">
      {/* Top Page Header */}
      <PageHeader
        title="Interactive Demonstration Center"
        subtitle="National innovation showcase verifying deterministic energy wastage and machine-health condition monitoring across real telemetry and analytics pipelines."
        icon={<Terminal className="w-5 h-5 text-emerald-400" />}
        badge={
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Deterministic Analytics
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              Zero Synthetic Data
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
              [SIMULATED - DEMO PIT]
            </span>
          </div>
        }
      />

      {/* 1. Scenario Selection Grid */}
      <DemoScenarioSelector
        selectedScenarioId={selectedScenario.id}
        onSelectScenario={(scen) => {
          setSelectedScenario(scen);
          if (status !== "idle") {
            handleResetSession();
          }
        }}
        disabled={status === "monitoring"}
      />

      {/* 2. Simulation & Verification Controls */}
      <DemoSimulationControls
        scenario={selectedScenario}
        machines={fleetMachines}
        selectedMachineId={selectedMachineId}
        onSelectMachineId={(mId) => setSelectedMachineId(mId)}
        status={status}
        elapsedSeconds={elapsedSeconds}
        onStartSession={handleStartSession}
        onStopSession={handleStopSession}
        onResetSession={handleResetSession}
      />

      {/* 3. Live Telemetry Ingestion Monitor */}
      <DemoLiveTelemetryMonitor
        latestTelemetry={latestTelemetry}
        ratedPowerKw={ratedPower}
        isLoading={isLoadingTelemetry}
        isPolling={status === "monitoring"}
        totalSamplesReceived={totalSamplesReceived}
        lastPolledAt={lastPolledAt}
        onRefreshTelemetry={() => pollData(selectedMachineId)}
      />

      {/* 4. 9-Stage Detection Pipeline Visualizer */}
      <DemoPipelineVisualizer
        status={status}
        scenarioId={selectedScenario.id}
        hasTelemetry={Boolean(latestTelemetry)}
        telemetrySamplesCount={totalSamplesReceived}
        events={events}
        alerts={alerts}
      />

      {/* 5. Actual Detection Results */}
      <DemoDetectionResults
        events={events}
        alerts={alerts}
        isNormalScenario={selectedScenario.id === "normal"}
        onNavigateToAlerts={onNavigateToAlerts}
        onSelectMachine={onSelectMachine}
      />

      {/* 6. Post-Demonstration Summary */}
      {(status === "completed" || status === "detected") && (
        <DemoSessionSummary
          scenario={selectedScenario}
          machine={currentMachine}
          durationSeconds={elapsedSeconds}
          telemetrySamplesCount={totalSamplesReceived}
          events={events}
          alerts={alerts}
          onSelectMachine={onSelectMachine}
          onNavigateToAlerts={onNavigateToAlerts}
          onNavigateToFleet={onNavigateToFleet}
        />
      )}

      {/* Technical Architecture Differentiation Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider font-mono">
            Technical Architecture Differentiation
          </h3>
          {onNavigateToSystem && (
            <button
              type="button"
              onClick={onNavigateToSystem}
              className="text-xs text-emerald-400 hover:text-emerald-300 underline font-medium cursor-pointer"
            >
              Verify Infrastructure Status & System Health →
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-800 font-mono text-slate-400 uppercase">
                <th className="py-2.5 px-3">Evaluation Dimension</th>
                <th className="py-2.5 px-3">Conventional SCADA / PLC</th>
                <th className="py-2.5 px-3">Generic Generative AI</th>
                <th className="py-2.5 px-3 text-emerald-400 font-bold">ORVEX Deterministic Engine</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              <tr>
                <td className="py-3 px-3 font-medium text-white font-mono">Detection Paradigm</td>
                <td className="py-3 px-3 text-slate-400">Fixed safety trip limits only</td>
                <td className="py-3 px-3 text-slate-400">Stochastic text prediction</td>
                <td className="py-3 px-3 text-emerald-300 font-medium">Piecewise dynamic baseline state machine</td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-medium text-white font-mono">Explainability</td>
                <td className="py-3 px-3 text-slate-400">Binary relay state (Tripped / Normal)</td>
                <td className="py-3 px-3 text-slate-400">Black-box LLM hallucination risk</td>
                <td className="py-3 px-3 text-emerald-300 font-medium">100% auditable mathematical derivation</td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-medium text-white font-mono">Parasitic Wastage</td>
                <td className="py-3 px-3 text-rose-400">Invisible (Draw is below max threshold)</td>
                <td className="py-3 px-3 text-slate-400">Cannot reliably quantify kWh</td>
                <td className="py-3 px-3 text-emerald-300 font-medium">Continuous vector integration & cost mapping</td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-medium text-white font-mono">Edge Readiness</td>
                <td className="py-3 px-3 text-slate-400">Requires expensive PLC controller rewrite</td>
                <td className="py-3 px-3 text-slate-400">Requires high-wattage GPU server</td>
                <td className="py-3 px-3 text-emerald-300 font-medium">Lightweight, runs on edge gateway / Raspberry Pi</td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-medium text-white font-mono">Retrofit Feasibility</td>
                <td className="py-3 px-3 text-slate-400">Difficult on 20+ year legacy equipment</td>
                <td className="py-3 px-3 text-slate-400">N/A (Software only)</td>
                <td className="py-3 px-3 text-emerald-300 font-medium">Non-invasive CT clamps + MQTT telemetry broker</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
