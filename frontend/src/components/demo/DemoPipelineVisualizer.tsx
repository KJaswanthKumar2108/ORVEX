import React from "react";
import {
  CheckCircle2,
  Cpu,
  Loader2,
} from "lucide-react";
import type { SimulationStatus } from "./DemoSimulationControls";
import type { AlertRecord, WastageEventResponse } from "../../api/types";

interface DemoPipelineVisualizerProps {
  status: SimulationStatus;
  scenarioId: string;
  hasTelemetry: boolean;
  telemetrySamplesCount: number;
  events: WastageEventResponse[];
  alerts: AlertRecord[];
}

interface PipelineStep {
  id: number;
  label: string;
  description: string;
  isComplete: boolean;
  isActive: boolean;
  isFailed?: boolean;
}

export const DemoPipelineVisualizer: React.FC<DemoPipelineVisualizerProps> = ({
  status,
  scenarioId,
  hasTelemetry,
  telemetrySamplesCount,
  events,
  alerts,
}) => {
  const isSessionStarted = status !== "idle";
  const isNormalScenario = scenarioId === "normal";

  // Step 1: Scenario Initiated
  const step1Complete = isSessionStarted;

  // Step 2: Telemetry Generated
  const step2Complete = isSessionStarted && telemetrySamplesCount > 0;

  // Step 3: Telemetry Ingested into Database
  const step3Complete = hasTelemetry && telemetrySamplesCount > 0;

  // Step 4: Features Calculated (State classified, load, power factor)
  const step4Complete = step3Complete && telemetrySamplesCount >= 2;

  // Step 5: Analytics Evaluated (Baseline compared)
  const step5Complete = step4Complete && (telemetrySamplesCount >= 5 || events.length > 0);

  // Step 6: Wastage / Anomaly Detected (or clean baseline for 'normal')
  const step6Complete =
    isNormalScenario
      ? step5Complete && events.length === 0
      : events.length > 0;

  // Step 7: Event Persisted in Database
  const step7Complete =
    isNormalScenario
      ? step6Complete
      : events.length > 0 && Boolean(events[0]?.id);

  // Step 8: Operational Alert Dispatched
  const step8Complete =
    isNormalScenario
      ? step7Complete && alerts.length === 0
      : alerts.length > 0;

  // Step 9: Evidence & Insights Available
  const step9Complete =
    isNormalScenario
      ? step8Complete
      : (events.length > 0 && Boolean(events[0]?.evidence_metadata)) ||
        (alerts.length > 0 && Boolean(alerts[0]?.recommendation));

  const steps: PipelineStep[] = [
    {
      id: 1,
      label: "1. Scenario Initiated",
      description: isSessionStarted ? "Demo session active" : "Awaiting session start",
      isComplete: step1Complete,
      isActive: status === "monitoring" && !step2Complete,
    },
    {
      id: 2,
      label: "2. Telemetry Generated",
      description: step2Complete ? `${telemetrySamplesCount} samples emitted` : "Awaiting generator",
      isComplete: step2Complete,
      isActive: step1Complete && !step2Complete,
    },
    {
      id: 3,
      label: "3. Telemetry Ingested",
      description: step3Complete ? "TimescaleDB verified" : "Awaiting ingestion",
      isComplete: step3Complete,
      isActive: step2Complete && !step3Complete,
    },
    {
      id: 4,
      label: "4. Features Calculated",
      description: step4Complete ? "State & load classified" : "Pending features",
      isComplete: step4Complete,
      isActive: step3Complete && !step4Complete,
    },
    {
      id: 5,
      label: "5. Analytics Evaluated",
      description: step5Complete ? "Baseline comparison" : "Evaluating threshold",
      isComplete: step5Complete,
      isActive: step4Complete && !step5Complete,
    },
    {
      id: 6,
      label: "6. Wastage Detected",
      description: isNormalScenario
        ? "0 events (Zero false positives)"
        : step6Complete
        ? `${events.length} episode flagged`
        : "Pending detection",
      isComplete: step6Complete,
      isActive: step5Complete && !step6Complete,
    },
    {
      id: 7,
      label: "7. Event Persisted",
      description: isNormalScenario
        ? "Clean baseline preserved"
        : step7Complete
        ? `Event ID: ${events[0]?.id?.slice(0, 8)}`
        : "Awaiting persistence",
      isComplete: step7Complete,
      isActive: step6Complete && !step7Complete,
    },
    {
      id: 8,
      label: "8. Alert Dispatched",
      description: isNormalScenario
        ? "0 alerts (Verified specificity)"
        : step8Complete
        ? `${alerts.length} alert open`
        : "Awaiting dispatch",
      isComplete: step8Complete,
      isActive: step7Complete && !step8Complete,
    },
    {
      id: 9,
      label: "9. Evidence Available",
      description: isNormalScenario
        ? "Audit benchmark confirmed"
        : step9Complete
        ? "Integral proof & SOP"
        : "Awaiting audit log",
      isComplete: step9Complete,
      isActive: step8Complete && !step9Complete,
    },
  ];

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white tracking-tight uppercase font-mono">
            9-Stage Analytics Detection Pipeline
          </h3>
        </div>
        <span className="text-xs font-mono text-slate-400">
          Status:{" "}
          <strong className="text-emerald-400 font-bold">
            {steps.filter((s) => s.isComplete).length} / {steps.length} Stages Verified
          </strong>
        </span>
      </div>

      {/* Responsive Pipeline Steps Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-9 gap-2">
        {steps.map((step) => {
          return (
            <div
              key={step.id}
              className={`p-3 rounded-lg border transition-all text-xs flex flex-col justify-between ${
                step.isComplete
                  ? "bg-slate-950 border-emerald-500/60 text-slate-200"
                  : step.isActive
                  ? "bg-slate-950 border-amber-500/80 ring-1 ring-amber-500/40 text-amber-200"
                  : "bg-slate-950/40 border-slate-800/80 text-slate-500"
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase font-bold">
                    Stage {step.id}
                  </span>
                  {step.isComplete ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : step.isActive ? (
                    <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-slate-700" />
                  )}
                </div>

                <div className="font-semibold text-xs text-white leading-tight">
                  {step.label.replace(/^\d+\.\s*/, "")}
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-slate-800/60 text-[10px] text-slate-400 font-mono leading-tight">
                {step.description}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
