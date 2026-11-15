import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  ExternalLink,
  Layers,
  RefreshCw,
  Repeat,
} from "lucide-react";
import { endpoints } from "../api/endpoints";
import type {
  ActionImpactResponse,
  CorrectiveActionCreate,
  CorrectiveActionResponse,
  FleetIntelligenceSummary,
  MachineBaselineResponse,
  MachineSummaryResponse,
  PatternAnalysisResponse,
  WastageEventResponse,
} from "../api/types";
import { QualityBadge } from "../components/common/StatusBadge";
import { formatWastedEnergy } from "../utils/formatters";

// Modular Stage 9D Subcomponents
import { EnergyPerformanceOverview } from "../components/intelligence/EnergyPerformanceOverview";
import { EnergyConsumptionAnalysis } from "../components/intelligence/EnergyConsumptionAnalysis";
import { WastageInvestigationTable } from "../components/intelligence/WastageInvestigationTable";
import { ExplainableIntelligencePanel } from "../components/intelligence/ExplainableIntelligencePanel";
import { BaselineAndActionImpact } from "../components/intelligence/BaselineAndActionImpact";

interface EnergyIntelligenceViewProps {
  machines: MachineSummaryResponse[];
  onSelectMachine: (machineId: string) => void;
}

export const EnergyIntelligenceView: React.FC<EnergyIntelligenceViewProps> = ({
  machines,
  onSelectMachine,
}) => {
  const [fleetSummary, setFleetSummary] = useState<FleetIntelligenceSummary | null>(null);
  const [patternData, setPatternData] = useState<PatternAnalysisResponse | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState<string>(
    machines.length > 0 ? machines[0].id : ""
  );
  const [machineBaseline, setMachineBaseline] = useState<MachineBaselineResponse | null>(null);
  const [correctiveActions, setCorrectiveActions] = useState<CorrectiveActionResponse[]>([]);
  const [selectedActionId, setSelectedActionId] = useState<string>("");
  const [actionImpact, setActionImpact] = useState<ActionImpactResponse | null>(null);

  // Multi-Criteria Filters
  const [filterMachineId, setFilterMachineId] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d">("24h");

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const machineNamesMap = useMemo(() => {
    return machines.reduce<Record<string, string>>((acc, m) => {
      acc[m.id] = m.name;
      return acc;
    }, {});
  }, [machines]);

  // Compute ISO time range
  const getRangeTimestamps = useCallback(() => {
    const end = new Date();
    const start = new Date();
    if (timeRange === "24h") start.setHours(start.getHours() - 24);
    else if (timeRange === "7d") start.setDate(start.getDate() - 7);
    else if (timeRange === "30d") start.setDate(start.getDate() - 30);
    return {
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    };
  }, [timeRange]);

  // Load Fleet Intelligence, Patterns, and Actions
  const loadIntelligence = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { start_time, end_time } = getRangeTimestamps();
      const [summaryRes, patternsRes, actionsRes] = await Promise.all([
        endpoints.getFleetIntelligence({ start_time, end_time }),
        endpoints.getWastagePatterns({ start_time, end_time }),
        endpoints.getCorrectiveActions(),
      ]);

      setFleetSummary(summaryRes);
      setPatternData(patternsRes);
      setCorrectiveActions(actionsRes);
      if (actionsRes.length > 0 && !selectedActionId) {
        setSelectedActionId(actionsRes[0].id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load energy intelligence data.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [getRangeTimestamps, selectedActionId]);

  // Derived evidence episodes from identified patterns
  const episodes: WastageEventResponse[] = useMemo(() => {
    if (!patternData?.patterns) return [];
    return patternData.patterns.flatMap((p) => {
      const isCycling =
        p.pattern_type === "START_STOP_CYCLING" || p.estimated_wasted_energy_kwh === null;
      return (p.representative_event_ids || ["ev-repr"]).map((evId, idx) => ({
        id: evId || `ev-${p.pattern_type.toLowerCase()}-${idx}`,
        machine_id: selectedMachineId || (machines.length > 0 ? machines[0].id : "m-1"),
        start_time: patternData.start_time,
        end_time: patternData.end_time,
        duration_seconds: Math.round(p.total_duration_hours * 3600),
        detection_reason: p.pattern_type.toLowerCase(),
        severity: isCycling ? "critical" : "high",
        estimated_energy_kwh: p.estimated_wasted_energy_kwh,
        estimated_wasted_energy_kwh: p.estimated_wasted_energy_kwh,
        confidence_score: 0.95,
        quality_score: 1.0,
        status: "open",
        evidence_metadata: {
          conditions: p.typical_operating_conditions,
          countermeasure: p.recommended_countermeasure,
          duration_hours: p.total_duration_hours,
        },
        created_at: patternData.generated_at,
      }));
    });
  }, [patternData, selectedMachineId, machines]);

  // Load Baseline for Selected Machine
  const loadBaseline = useCallback(async (mId: string) => {
    if (!mId) return;
    try {
      const { start_time, end_time } = getRangeTimestamps();
      const baselineRes = await endpoints.getMachineBaseline(mId, { start_time, end_time });
      setMachineBaseline(baselineRes);
    } catch {
      setMachineBaseline(null);
    }
  }, [getRangeTimestamps]);

  // Load Action Impact for Selected Action
  const loadActionImpact = useCallback(async (actionId: string) => {
    if (!actionId) {
      setActionImpact(null);
      return;
    }
    try {
      const impactRes = await endpoints.getActionImpact(actionId, 24.0);
      setActionImpact(impactRes);
    } catch {
      setActionImpact(null);
    }
  }, []);

  useEffect(() => {
    loadIntelligence();
  }, [loadIntelligence]);

  useEffect(() => {
    if (selectedMachineId) {
      loadBaseline(selectedMachineId);
    } else if (machines.length > 0) {
      setSelectedMachineId(machines[0].id);
      loadBaseline(machines[0].id);
    }
  }, [selectedMachineId, machines, loadBaseline]);

  useEffect(() => {
    if (selectedActionId) {
      loadActionImpact(selectedActionId);
    }
  }, [selectedActionId, loadActionImpact]);

  // Handle logging a new action
  const handleCreateAction = async (payload: CorrectiveActionCreate) => {
    const created = await endpoints.createCorrectiveAction(payload);
    setCorrectiveActions((prev) => [created, ...prev]);
    setSelectedActionId(created.id);
    loadActionImpact(created.id);
  };

  const handleResetFilters = () => {
    setFilterMachineId("");
    setFilterCategory("");
    setTimeRange("24h");
  };

  const timeRangeLabel = timeRange === "24h" ? "Trailing 24 Hours" : timeRange === "7d" ? "Trailing 7 Days" : "Trailing 30 Days";

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-4">
      {/* Top Banner & Time Range Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-emerald-400" />
            <h1 className="text-xl font-bold tracking-tight text-white font-mono">
              Explainable Energy Intelligence
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono font-semibold">
              Deterministic Analytics
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Quantified energy wastage, transparent machine prioritization, pattern recognition, and before-and-after assessment.
          </p>
        </div>

        {/* Time Range Selector & Refresh */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs font-mono">
            {(["24h", "7d", "30d"] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setTimeRange(preset)}
                className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                  timeRange === preset
                    ? "bg-slate-800 text-emerald-400 font-semibold shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {preset === "24h" ? "24h" : preset === "7d" ? "7 Days" : "30 Days"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={loadIntelligence}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded-lg border border-slate-700 transition cursor-pointer disabled:opacity-50"
            title="Refresh Intelligence Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 font-mono">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* 1. Executive Performance Overview & KPIs */}
      <EnergyPerformanceOverview
        summary={fleetSummary}
        timeRangeLabel={timeRangeLabel}
        isLoading={isLoading}
      />

      {/* 2. Machine Attention Prioritization Ranking Matrix */}
      <div className="bg-[#0d1424] rounded-xl border border-slate-800/80 overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-white font-mono uppercase tracking-wider">
                Machine Attention Prioritization
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Ranked by deterministic composite score (0-100) combining wasted kWh, event recurrence, duration, and data quality.
            </p>
          </div>

          <div className="text-[11px] font-mono text-slate-400 bg-slate-950/80 px-2.5 py-1 rounded border border-slate-800 self-start sm:self-auto">
            Formula: (Wastage[45] + Recurrence[25] + Duration[20]) × Quality[0.5-1.0]
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 font-mono border-b border-slate-800">
              <tr>
                <th className="px-4 py-2.5">Rank</th>
                <th className="px-4 py-2.5">Machine</th>
                <th className="px-4 py-2.5">Priority Score</th>
                <th className="px-4 py-2.5">Level</th>
                <th className="px-4 py-2.5">Wasted kWh</th>
                <th className="px-4 py-2.5">Events</th>
                <th className="px-4 py-2.5">Wasted Hours</th>
                <th className="px-4 py-2.5">Data Quality</th>
                <th className="px-4 py-2.5">Key Contributing Factor</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {fleetSummary && fleetSummary.priority_rankings.length > 0 ? (
                fleetSummary.priority_rankings.map((p) => {
                  const levelColors: Record<string, string> = {
                    CRITICAL: "bg-rose-500/10 text-rose-400 border-rose-500/30",
                    HIGH: "bg-amber-500/10 text-amber-400 border-amber-500/30",
                    MEDIUM: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
                    LOW: "bg-slate-800 text-slate-300 border-slate-700",
                  };
                  return (
                    <tr
                      key={p.machine_id}
                      className={`hover:bg-slate-800/30 transition-colors ${
                        selectedMachineId === p.machine_id ? "bg-emerald-500/5" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-mono font-bold text-slate-300">
                        #{p.priority_rank}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-100">{p.machine_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {p.machine_identifier} • {p.machine_type}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-100">
                        {p.priority_score.toFixed(1)} / 100
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                            levelColors[p.priority_level] || "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {p.priority_level}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-amber-300">
                        {p.estimated_wasted_energy_kwh !== null
                          ? formatWastedEnergy(p.estimated_wasted_energy_kwh)
                          : "Unquantified"}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-200">
                        {p.wastage_events_count}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-300">
                        {p.wasted_duration_hours.toFixed(1)} h
                      </td>
                      <td className="px-4 py-3">
                        <QualityBadge quality={p.data_quality} />
                      </td>
                      <td className="px-4 py-3 text-slate-300 max-w-xs truncate">
                        {p.key_contributing_factor}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMachineId(p.machine_id);
                            loadBaseline(p.machine_id);
                          }}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 font-medium transition cursor-pointer text-xs font-mono"
                        >
                          Select
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectMachine(p.machine_id)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 font-medium transition cursor-pointer text-xs inline-flex items-center gap-1 font-mono"
                        >
                          <span>Inspect</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500 font-mono">
                    No machine priority rankings calculated for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Recurring Wastage Patterns Grid */}
      <div className="bg-[#0d1424] rounded-xl border border-slate-800/80 p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-2">
          <div className="flex items-center gap-2">
            <Repeat className="w-4 h-4 text-amber-400" />
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white font-mono">
                Recurring Wastage Patterns
              </h2>
              <p className="text-xs text-slate-400 font-sans mt-0.5">
                Cluster analysis identifying systematic operational inefficiencies across shifts
              </p>
            </div>
          </div>

          <div className="text-[11px] font-mono text-slate-400 bg-slate-950/80 px-2.5 py-1 rounded border border-slate-800 self-start sm:self-auto">
            Total Quantified: {patternData?.total_quantified_wasted_kwh?.toFixed(1) ?? "0.0"} kWh (
            {patternData?.unquantified_pattern_count ?? 0} unquantified stress patterns)
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {patternData && patternData.patterns.length > 0 ? (
            patternData.patterns.map((pat) => {
              const isCycling =
                pat.pattern_type === "START_STOP_CYCLING" || pat.estimated_wasted_energy_kwh === null;
              return (
                <div
                  key={pat.pattern_type}
                  className="bg-slate-950/70 p-4 rounded-xl border border-slate-800/80 flex flex-col justify-between hover:border-slate-700/80 transition"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-mono font-bold text-white text-xs leading-snug">
                        {pat.pattern_name}
                      </h3>
                      {isCycling ? (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 whitespace-nowrap">
                          Equipment Stress
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 whitespace-nowrap">
                          Energy Wastage
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-400 mb-3 font-sans">{pat.description}</p>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/60 mb-3 font-mono">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Occurrences</span>
                        <span className="font-bold text-slate-200">{pat.total_event_count}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Duration</span>
                        <span className="font-bold text-slate-200">{pat.total_duration_hours.toFixed(1)} h</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[10px] text-slate-500 block uppercase">Wasted Energy</span>
                        <span className="font-bold text-amber-300">
                          {isCycling
                            ? "Unquantified (stress)"
                            : pat.estimated_wasted_energy_kwh !== null
                            ? formatWastedEnergy(pat.estimated_wasted_energy_kwh)
                            : "0.00 kWh"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-300 space-y-1.5 pt-2 border-t border-slate-900 font-sans">
                    <div>
                      <span className="text-slate-500 font-semibold block text-[10px] uppercase font-mono">
                        Conditions:
                      </span>
                      <span>{pat.typical_operating_conditions}</span>
                    </div>
                    <div>
                      <span className="text-emerald-400 font-semibold block text-[10px] uppercase font-mono">
                        Standard Countermeasure:
                      </span>
                      <span>{pat.recommended_countermeasure}</span>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-3 py-8 text-center text-slate-500 text-xs font-mono">
              No recurrent energy wastage patterns identified in this observation window.
            </div>
          )}
        </div>
      </div>

      {/* 4. Energy Consumption Profile & Trend Analysis */}
      <EnergyConsumptionAnalysis
        machines={machines}
        selectedMachineId={filterMachineId}
        onMachineChange={setFilterMachineId}
        selectedCategory={filterCategory}
        onCategoryChange={setFilterCategory}
        selectedRange={timeRange}
        onRangeChange={setTimeRange}
        onResetFilters={handleResetFilters}
        patterns={patternData?.patterns || []}
        prioritizations={fleetSummary?.priority_rankings || []}
      />

      {/* 5. Wastage Investigation Episodes Table */}
      <WastageInvestigationTable
        events={episodes}
        machineNamesMap={machineNamesMap}
        onSelectMachineDetail={onSelectMachine}
        isLoading={isLoading}
      />

      {/* 6. Explainable Intelligence Analytical Panel */}
      <ExplainableIntelligencePanel
        insights={fleetSummary?.top_insights || []}
        onSelectMachineDetail={onSelectMachine}
        isLoading={isLoading}
      />

      {/* 7. Historical Baseline & Corrective Action Assessment */}
      <BaselineAndActionImpact
        baseline={machineBaseline}
        selectedMachineId={selectedMachineId}
        onSelectMachine={(mId) => {
          setSelectedMachineId(mId);
          loadBaseline(mId);
        }}
        machines={machines}
        correctiveActions={correctiveActions}
        selectedActionId={selectedActionId}
        onSelectAction={(aId) => {
          setSelectedActionId(aId);
          loadActionImpact(aId);
        }}
        actionImpact={actionImpact}
        onCreateAction={handleCreateAction}
        isLoading={isLoading}
      />
    </div>
  );
};
