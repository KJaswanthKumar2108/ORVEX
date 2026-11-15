import React from "react";

export interface DemoScenarioDefinition {
  id: string;
  name: string;
  category: "wastage" | "operational" | "baseline";
  severity: "critical" | "warning" | "watch" | "normal";
  defaultMachineIdentifier: string;
  defaultMachineName: string;
  defaultMachineType: string;
  defaultRatedPowerKw: number;
  conditionDescription: string;
  detectionMechanism: string;
  telemetryParameters: {
    param: string;
    condition: string;
  }[];
  expectedOutcome: string;
  quantifiedImpact: string;
  operatorSop: string;
  cliCommand: string;
}

export const DEMO_SCENARIOS: DemoScenarioDefinition[] = [
  {
    id: "idle_wastage",
    name: "Sustained Idle Wastage",
    category: "wastage",
    severity: "warning",
    defaultMachineIdentifier: "DEMO-CONV-01",
    defaultMachineName: "Primary Overland Conveyor",
    defaultMachineType: "conveyor",
    defaultRatedPowerKw: 132.0,
    conditionDescription:
      "Conveyor motor left continuously energized while unladen between shift handovers or batch transfers, drawing unnecessary active baseline power.",
    detectionMechanism:
      "Deterministic state classifier detects IDLE operating state (speed nominal, load <15%) lasting beyond threshold where active power exceeds calibrated P_idle baseline.",
    telemetryParameters: [
      { param: "Operating State", condition: "IDLE (speed nominal, unladen belt)" },
      { param: "Load Percentage", condition: "< 15.0% mechanical load" },
      { param: "Active Power", condition: "> 15 kW baseline threshold (actual ~39 kW)" },
      { param: "Duration", condition: "> 5s (demo fast mode) / > 300s (production)" },
    ],
    expectedOutcome:
      "IDLE_WASTAGE episode detected, avoidable energy loss quantified via trapezoidal integration, operator alert dispatched.",
    quantifiedImpact: "Quantified avoidable kWh (~145 kWh / shift equivalent)",
    operatorSop:
      "Issue automated interlock signal or operator advisory to shut down conveyor or activate standby mode after 5 minutes of empty belt running.",
    cliCommand: "python scripts/demo_runner.py --scenario idle_wastage",
  },
  {
    id: "low_load_wastage",
    name: "Low-Load Operating Inefficiency",
    category: "wastage",
    severity: "warning",
    defaultMachineIdentifier: "DEMO-CRUSH-03",
    defaultMachineName: "Primary Jaw Crusher",
    defaultMachineType: "crusher",
    defaultRatedPowerKw: 160.0,
    conditionDescription:
      "Crusher operates in under-loaded state (<25% capacity) with disproportionate active power demand and poor inductive power factor.",
    detectionMechanism:
      "Calculates piecewise baseline curve. Identifies low mechanical throughput coupled with active power exceeding optimal efficiency boundary by >15 kW.",
    telemetryParameters: [
      { param: "Operating State", condition: "LOW_LOAD (continuous trickle feed)" },
      { param: "Load Percentage", condition: "15% - 25% throughput capacity" },
      { param: "Active Power", condition: "1.9x optimal baseline multiplier" },
      { param: "Power Factor", condition: "Lagging (< 0.75 cos φ inductive)" },
    ],
    expectedOutcome:
      "LOW_LOAD_WASTAGE episode detected, parasitic losses separated from productive work, batching recommendation issued.",
    quantifiedImpact: "Quantified efficiency loss (~210 kWh / day equivalent)",
    operatorSop:
      "Optimize feed bin surge capacity and batch feed ore in concentrated intervals rather than continuous trickle feeding.",
    cliCommand: "python scripts/demo_runner.py --scenario low_load_wastage",
  },
  {
    id: "abnormal_power",
    name: "Abnormal Power Consumption",
    category: "operational",
    severity: "critical",
    defaultMachineIdentifier: "DEMO-HOIST-05",
    defaultMachineName: "Mine Production Hoist",
    defaultMachineType: "hoist",
    defaultRatedPowerKw: 200.0,
    conditionDescription:
      "Hoist consumes 1.5x expected power for its current payload weight, indicating mechanical guide friction, cable drag, or brake misalignment.",
    detectionMechanism:
      "Continuously computes vector power ratio and dynamic baseline for active load. Flags deviation when active power exceeds expected torque curve by >15%.",
    telemetryParameters: [
      { param: "Operating State", condition: "RUNNING under payload" },
      { param: "Load Percentage", condition: "~62% mechanical payload" },
      { param: "Active Power", condition: "1.5x expected torque curve" },
      { param: "FLA Protection", condition: "Below 115% trip limit (undetected by SCADA)" },
    ],
    expectedOutcome:
      "ABNORMAL_POWER episode detected, critical alert dispatched warning of mechanical guide binding or brake drag before equipment seizure.",
    quantifiedImpact: "Severe drag losses (~380 kWh / day) + catastrophic downtime risk",
    operatorSop:
      "Inspect hoist counterweight track guides, lubrication status, and emergency drum brake air clearance for mechanical binding.",
    cliCommand: "python scripts/demo_runner.py --scenario abnormal_power",
  },
  {
    id: "start_stop_cycling",
    name: "Rapid Start-Stop Cycling",
    category: "operational",
    severity: "watch",
    defaultMachineIdentifier: "DEMO-PUMP-02",
    defaultMachineName: "Slurry Transfer Pump",
    defaultMachineType: "pump",
    defaultRatedPowerKw: 75.0,
    conditionDescription:
      "Slurry pump restarts 6-12 times per hour due to an uncalibrated float switch or small sump volume, creating recurring peak inrush current events.",
    detectionMechanism:
      "Rolling-window transition frequency detector registers >4 starts within 15 minutes. Identifies severe inrush thermal stress on motor windings.",
    telemetryParameters: [
      { param: "Operating State", condition: "Rapid transitions: STOPPED -> STARTING -> RUNNING" },
      { param: "Transition Frequency", condition: "> 4 starts within 15-minute rolling window" },
      { param: "Current Profile", condition: "Recurring inrush current spikes (5-7x FLA)" },
      { param: "Wasted Energy", condition: "Reported as NULL (unestimated) by design" },
    ],
    expectedOutcome:
      "START_STOP_CYCLING episode detected with cycle frequency. Wasted energy is strictly reported as NULL / Not estimated rather than fabricating speculative savings.",
    quantifiedImpact: "Peak demand charges + severe motor winding thermal stress",
    operatorSop:
      "Adjust level switch hysteresis band or introduce variable-speed drive (VSD) control to allow continuous modulated pumping.",
    cliCommand: "python scripts/demo_runner.py --scenario start_stop_cycling",
  },
  {
    id: "normal",
    name: "Normal Operation (Golden Reference)",
    category: "baseline",
    severity: "normal",
    defaultMachineIdentifier: "DEMO-FAN-04",
    defaultMachineName: "Shaft Ventilation Fan 4",
    defaultMachineType: "fan",
    defaultRatedPowerKw: 55.0,
    conditionDescription:
      "Equipment operates smoothly under design load with high power factor (>0.92), stable temperature (52°C), and negligible parasitic loss.",
    detectionMechanism:
      "Engine validates that power, temperature, and harmonics remain inside nominal 95% confidence envelope. Confirms zero false positive alerts.",
    telemetryParameters: [
      { param: "Operating State", condition: "RUNNING nominal baseline" },
      { param: "Power Factor", condition: "> 0.90 (high efficiency)" },
      { param: "Active Power", condition: "Within ±2σ dynamic baseline envelope" },
      { param: "Alert Output", condition: "0 alerts dispatched (100% specificity)" },
    ],
    expectedOutcome:
      "Confirms nominal healthy operation. Zero wastage events detected; zero false positive alerts generated.",
    quantifiedImpact: "0 kWh wasted (Optimal operational efficiency)",
    operatorSop: "No action required. Routine continuous monitoring.",
    cliCommand: "python scripts/demo_runner.py --scenario normal",
  },
];

interface DemoScenarioSelectorProps {
  selectedScenarioId: string;
  onSelectScenario: (scenario: DemoScenarioDefinition) => void;
  disabled?: boolean;
}

export const DemoScenarioSelector: React.FC<DemoScenarioSelectorProps> = ({
  selectedScenarioId,
  onSelectScenario,
  disabled = false,
}) => {
  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
            CRITICAL
          </span>
        );
      case "warning":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            WARNING
          </span>
        );
      case "watch":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
            WATCH
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            NOMINAL
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white tracking-tight uppercase font-mono">
            Supported Simulator Scenarios (5 Available)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Select a verified physical condition to inspect its operational model, expected detection, and telemetry parameters.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {DEMO_SCENARIOS.map((scenario) => {
          const isSelected = scenario.id === selectedScenarioId;
          return (
            <button
              key={scenario.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelectScenario(scenario)}
              className={`text-left p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? "bg-slate-800/90 border-emerald-500 shadow-md ring-1 ring-emerald-500/40"
                  : "bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:bg-slate-850"
              } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-white tracking-tight">
                    {scenario.name}
                  </span>
                  {getSeverityBadge(scenario.severity)}
                </div>

                <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                  {scenario.conditionDescription}
                </p>

                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 text-[11px] space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>Target Equipment:</span>
                    <span className="text-slate-200 font-medium">{scenario.defaultMachineName}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Power Rating:</span>
                    <span className="font-mono text-emerald-400">{scenario.defaultRatedPowerKw.toFixed(1)} kW</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-500">{scenario.id}</span>
                <span className="text-emerald-400 font-medium">
                  {isSelected ? "Selected for Demo" : "Click to Select"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
