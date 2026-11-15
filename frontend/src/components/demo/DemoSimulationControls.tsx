import React, { useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import type { DemoScenarioDefinition } from "./DemoScenarioSelector";
import type { MachineSummaryResponse } from "../../api/types";

export type SimulationStatus = "idle" | "monitoring" | "detected" | "completed";

interface DemoSimulationControlsProps {
  scenario: DemoScenarioDefinition;
  machines: MachineSummaryResponse[];
  selectedMachineId: string;
  onSelectMachineId: (id: string) => void;
  status: SimulationStatus;
  elapsedSeconds: number;
  onStartSession: () => void;
  onStopSession: () => void;
  onResetSession: () => void;
}

export const DemoSimulationControls: React.FC<DemoSimulationControlsProps> = ({
  scenario,
  machines,
  selectedMachineId,
  onSelectMachineId,
  status,
  elapsedSeconds,
  onStartSession,
  onStopSession,
  onResetSession,
}) => {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  // Filter or identify demo machines
  const demoMachines = machines.filter(
    (m) =>
      m.machine_identifier.startsWith("DEMO-") ||
      m.name.toLowerCase().includes("demo")
  );

  const selectedMachine = machines.find((m) => m.id === selectedMachineId);
  const isTargetDemo =
    selectedMachine?.machine_identifier.startsWith("DEMO-") ||
    selectedMachine?.name.toLowerCase().includes("demo") ||
    demoMachines.length === 0; // If fleet hasn't provisioned yet

  const formatElapsed = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleCopyCli = () => {
    navigator.clipboard.writeText(scenario.cliCommand);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const handleConfirmStart = () => {
    setShowConfirmModal(false);
    onStartSession();
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        {/* Scenario Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-emerald-400 font-bold uppercase tracking-wider">
              Selected Scenario
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-xs font-mono text-slate-400">{scenario.id}</span>
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">{scenario.name}</h2>
          <p className="text-xs text-slate-300 max-w-2xl">{scenario.conditionDescription}</p>
        </div>

        {/* Target Machine Selector */}
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5 min-w-[260px]">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Target Equipment:</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
              isTargetDemo
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
            }`}>
              {isTargetDemo ? "SIMULATED DEMO PIT" : "NON-DEMO ASSET (LOCKED)"}
            </span>
          </div>
          <select
            value={selectedMachineId}
            onChange={(e) => onSelectMachineId(e.target.value)}
            disabled={status === "monitoring"}
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50"
          >
            {demoMachines.length > 0 ? (
              demoMachines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.machine_identifier}) - {m.rated_power_kw ?? 0} kW
                </option>
              ))
            ) : (
              <option value={scenario.defaultMachineIdentifier}>
                {scenario.defaultMachineName} ({scenario.defaultMachineIdentifier}) - {scenario.defaultRatedPowerKw} kW
              </option>
            )}
          </select>
        </div>
      </div>

      {!isTargetDemo && (
        <div className="bg-rose-950/40 border border-rose-800/80 rounded-lg p-3 text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>Safety Lock Active: Selected asset is not a dedicated demo machine. Simulation trigger locked to prevent physical equipment interference.</span>
        </div>
      )}

      {/* Control Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        {/* Status Indicator & Timer */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Session Status:</span>
            {status === "idle" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span>IDLE / READY</span>
              </span>
            )}
            {status === "monitoring" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>MONITORING TELEMETRY</span>
              </span>
            )}
            {status === "detected" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>EPISODE DETECTED</span>
              </span>
            )}
            {status === "completed" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/40">
                <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                <span>SESSION COMPLETED</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-slate-300 bg-slate-950 px-3 py-1 rounded border border-slate-800">
            <span className="text-slate-500 text-[11px]">Elapsed:</span>
            <span className="font-bold text-white text-sm">{formatElapsed(elapsedSeconds)}</span>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          {status === "idle" && (
            <button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Initiate Verification Session</span>
            </button>
          )}

          {status === "monitoring" && (
            <button
              type="button"
              onClick={onStopSession}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer"
            >
              <Square className="w-4 h-4 fill-white" />
              <span>Conclude Session</span>
            </button>
          )}

          {(status === "detected" || status === "completed") && (
            <>
              <button
                type="button"
                onClick={onResetSession}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Demo Session</span>
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Run New Verification</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Safety Notice & Architectural Transparency */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 text-xs text-slate-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong>Isolated Sandbox Environment:</strong> Only virtual telemetry is submitted to the demo fleet. Physical mine machinery cannot be modified or energized.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[11px] text-slate-500">CLI Driver:</span>
          <code className="bg-slate-900 px-2 py-0.5 rounded text-[11px] text-emerald-300 font-mono select-all">
            {scenario.cliCommand}
          </code>
          <button
            type="button"
            onClick={handleCopyCli}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
            title="Copy CLI command"
          >
            {copiedCmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-emerald-400">
                <Play className="w-5 h-5 fill-emerald-400" />
                <h3 className="text-base font-semibold text-white">
                  Confirm Demonstration Session
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Scenario:</span>
                  <span className="font-semibold text-white">{scenario.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Target Asset:</span>
                  <span className="font-mono text-emerald-400 font-medium">
                    {selectedMachine?.name || scenario.defaultMachineName} (
                    {selectedMachine?.machine_identifier || scenario.defaultMachineIdentifier})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Environment:</span>
                  <span className="font-mono text-amber-400 font-medium">[SIMULATED DEMO PIT]</span>
                </div>
              </div>

              <div className="space-y-2 text-slate-300">
                <p>
                  You are about to start a live verification session. The Demonstration Center will actively monitor live telemetry packets received through the backend pipeline, verify feature calculation, trace analytics evaluations, and capture generated alerts.
                </p>
                <div className="bg-slate-950 p-2.5 rounded border border-slate-800 space-y-1">
                  <span className="font-mono text-[11px] text-slate-400 block font-semibold">
                    To trigger incoming telemetry packets from terminal:
                  </span>
                  <div className="flex items-center justify-between bg-slate-900 p-2 rounded font-mono text-[11px] text-emerald-300">
                    <span>{scenario.cliCommand}</span>
                    <button
                      type="button"
                      onClick={handleCopyCli}
                      className="text-slate-400 hover:text-white ml-2 cursor-pointer"
                    >
                      {copiedCmd ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-3.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmStart}
                  className="px-4 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  Confirm & Start Verification
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
