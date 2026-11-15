import React, { useState, useMemo } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  Cpu,
  Filter,
  HardHat,
  Search,
} from "lucide-react";
import type { MachineSummaryResponse } from "../../api/types";
import { OperatingStateBadge } from "../common/StatusBadge";
import { StatusPill } from "../common/StatusPill";
import { formatEnergy, formatPower, formatRelativeTime } from "../../utils/formatters";

type SortKey = "name" | "type" | "state" | "power" | "rated" | "energy" | "health" | "telemetry";
type SortDirection = "asc" | "desc";

interface MachineTableProps {
  machines: MachineSummaryResponse[];
  onSelectMachine: (machineId: string) => void;
  isLoading?: boolean;
  healthMap?: Record<string, { status: string; warningsCount: number }>;
  energyMap?: Record<string, number | null>;
}

export const MachineTable: React.FC<MachineTableProps> = ({
  machines,
  onSelectMachine,
  isLoading = false,
  healthMap = {},
  energyMap = {},
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // Distinct types for stats
  const filteredMachines = useMemo(() => {
    return machines.filter((m) => {
      const matchSearch =
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.machine_identifier.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.machine_type || "").toLowerCase().includes(searchTerm.toLowerCase());

      const stateNorm = (m.latest_operating_state || "stopped").toLowerCase();
      const matchState =
        stateFilter === "all" ||
        stateNorm === stateFilter ||
        (stateFilter === "operating" && (stateNorm === "running" || stateNorm === "active"));

      const healthInfo = healthMap[m.id]?.status?.toLowerCase() || "healthy";
      const matchHealth = healthFilter === "all" || healthInfo === healthFilter;

      return matchSearch && matchState && matchHealth;
    });
  }, [machines, searchTerm, stateFilter, healthFilter, healthMap]);

  // Sort filtered machines
  const sortedMachines = useMemo(() => {
    return [...filteredMachines].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === "type") {
        cmp = (a.machine_type || "").localeCompare(b.machine_type || "");
      } else if (sortKey === "state") {
        cmp = (a.latest_operating_state || "").localeCompare(b.latest_operating_state || "");
      } else if (sortKey === "power") {
        cmp = (a.latest_active_power || 0) - (b.latest_active_power || 0);
      } else if (sortKey === "rated") {
        cmp = (a.rated_power_kw || 0) - (b.rated_power_kw || 0);
      } else if (sortKey === "energy") {
        cmp = (energyMap[a.id] || 0) - (energyMap[b.id] || 0);
      } else if (sortKey === "health") {
        const hA = healthMap[a.id]?.status || "HEALTHY";
        const hB = healthMap[b.id]?.status || "HEALTHY";
        cmp = hA.localeCompare(hB);
      } else if (sortKey === "telemetry") {
        const tA = a.latest_telemetry_timestamp ? new Date(a.latest_telemetry_timestamp).getTime() : 0;
        const tB = b.latest_telemetry_timestamp ? new Date(b.latest_telemetry_timestamp).getTime() : 0;
        cmp = tA - tB;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredMachines, sortKey, sortDir, healthMap, energyMap]);

  const renderSortIndicator = (key: SortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="w-3 h-3 text-slate-600 inline ml-1 opacity-0 group-hover/col:opacity-100 transition-opacity" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="w-3 h-3 text-emerald-400 inline ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 text-emerald-400 inline ml-1" />
    );
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl shadow-sm overflow-hidden space-y-3">
      {/* Panel Header & Controls */}
      <div className="p-4 sm:p-5 border-b border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white tracking-wide">
              Monitored Mining Fleet
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              {machines.length}
            </span>
          </div>

          <p className="text-xs text-slate-400 hidden lg:block">
            Select any machine for detailed analytics & history
          </p>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-1">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search machines by name, ID or type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>

          {/* Filter Dropdowns */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-400 text-[11px]">State:</span>
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-900">All States</option>
                <option value="operating" className="bg-slate-900">Operating</option>
                <option value="idle" className="bg-slate-900">Idle</option>
                <option value="low_load" className="bg-slate-900">Low Load</option>
                <option value="stopped" className="bg-slate-900">Stopped</option>
                <option value="fault" className="bg-slate-900">Fault</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
              <span className="text-slate-400 text-[11px]">Health:</span>
              <select
                value={healthFilter}
                onChange={(e) => setHealthFilter(e.target.value)}
                className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-900">All Health</option>
                <option value="healthy" className="bg-slate-900">Healthy</option>
                <option value="watch" className="bg-slate-900">Watch</option>
                <option value="warning" className="bg-slate-900">Warning</option>
                <option value="critical" className="bg-slate-900">Critical</option>
              </select>
            </div>

            {(searchTerm || stateFilter !== "all" || healthFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setStateFilter("all");
                  setHealthFilter("all");
                }}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 underline cursor-pointer ml-1"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800/80 bg-slate-950/40 text-slate-400 font-mono text-[11px] uppercase tracking-wider select-none">
              <th
                onClick={() => handleSort("name")}
                className="py-3 px-4 sm:px-6 cursor-pointer hover:text-white group/col"
              >
                <span>Machine</span>
                {renderSortIndicator("name")}
              </th>
              <th
                onClick={() => handleSort("type")}
                className="py-3 px-3 cursor-pointer hover:text-white group/col"
              >
                <span>Type</span>
                {renderSortIndicator("type")}
              </th>
              <th
                onClick={() => handleSort("state")}
                className="py-3 px-3 cursor-pointer hover:text-white group/col"
              >
                <span>Operating State</span>
                {renderSortIndicator("state")}
              </th>
              <th
                onClick={() => handleSort("power")}
                className="py-3 px-3 text-right cursor-pointer hover:text-white group/col"
              >
                <span>Active Power</span>
                {renderSortIndicator("power")}
              </th>
              <th
                onClick={() => handleSort("rated")}
                className="py-3 px-3 text-right cursor-pointer hover:text-white group/col"
              >
                <span>Rated Power</span>
                {renderSortIndicator("rated")}
              </th>
              <th
                onClick={() => handleSort("energy")}
                className="py-3 px-3 text-right cursor-pointer hover:text-white group/col"
              >
                <span>Energy</span>
                {renderSortIndicator("energy")}
              </th>
              <th
                onClick={() => handleSort("health")}
                className="py-3 px-3 cursor-pointer hover:text-white group/col"
              >
                <span>Health Rating</span>
                {renderSortIndicator("health")}
              </th>
              <th className="py-3 px-3">
                <span>Signal Status</span>
              </th>
              <th
                onClick={() => handleSort("telemetry")}
                className="py-3 px-3 cursor-pointer hover:text-white group/col"
              >
                <span>Last Telemetry</span>
                {renderSortIndicator("telemetry")}
              </th>
              <th className="py-3 px-4 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans">
            {isLoading ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-slate-500 font-mono">
                  Loading machines...
                </td>
              </tr>
            ) : machines.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-slate-400">
                  <HardHat className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-300">No mining machines registered</p>
                  <p className="text-xs text-slate-500 mt-1">
                    No machine profiles exist in the database.
                  </p>
                </td>
              </tr>
            ) : sortedMachines.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-10 text-center text-slate-400">
                  <p className="text-sm font-medium text-slate-300">No matching machines found</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Try adjusting your search criteria or filter options.
                  </p>
                </td>
              </tr>
            ) : (
              sortedMachines.map((machine) => {
                const health = healthMap[machine.id];
                const healthStatus = health?.status || "HEALTHY";
                const isStale = machine.telemetry_freshness === "stale";
                const isMissing = machine.telemetry_freshness === "missing";
                const isStopped =
                  (machine.latest_operating_state || "").toLowerCase() === "stopped" ||
                  (machine.latest_active_power === 0 && !isStale && !isMissing);

                return (
                  <tr
                    key={machine.id}
                    onClick={() => onSelectMachine(machine.id)}
                    className="hover:bg-slate-800/50 transition-colors cursor-pointer group"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectMachine(machine.id);
                      }
                    }}
                    role="button"
                    aria-label={`View details for ${machine.name}`}
                  >
                    {/* Name and identifier */}
                    <td className="py-3.5 px-4 sm:px-6">
                      <div className="font-semibold text-white group-hover:text-emerald-400 transition-colors">
                        {machine.name}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {machine.machine_identifier}
                      </div>
                    </td>

                    {/* Machine Type */}
                    <td className="py-3.5 px-3">
                      <span className="capitalize text-slate-300">{machine.machine_type}</span>
                    </td>

                    {/* Operating State */}
                    <td className="py-3.5 px-3">
                      <OperatingStateBadge state={machine.latest_operating_state} />
                    </td>

                    {/* Active Power */}
                    <td className="py-3.5 px-3 text-right font-mono">
                      <span
                        className={
                          machine.latest_active_power !== null && machine.latest_active_power > 0
                            ? "text-emerald-400 font-medium"
                            : "text-slate-400"
                        }
                      >
                        {formatPower(machine.latest_active_power)}
                      </span>
                    </td>

                    {/* Rated Power */}
                    <td className="py-3.5 px-3 text-right font-mono text-slate-400">
                      {formatPower(machine.rated_power_kw)}
                    </td>

                    {/* Energy Consumption */}
                    <td className="py-3.5 px-3 text-right font-mono text-slate-300">
                      {energyMap[machine.id] !== null && energyMap[machine.id] !== undefined
                        ? `${formatEnergy(energyMap[machine.id])} kWh`
                        : "—"}
                    </td>

                    {/* Health Status */}
                    <td className="py-3.5 px-3">
                      <StatusPill status={healthStatus} size="sm" />
                      {health && health.warningsCount > 0 && (
                        <span className="ml-1.5 text-[10px] font-mono text-rose-400 font-bold">
                          ({health.warningsCount})
                        </span>
                      )}
                    </td>

                    {/* Telemetry Freshness vs Stopped distinction */}
                    <td className="py-3.5 px-3">
                      {isStale ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                          <span>STALE SIGNAL</span>
                        </span>
                      ) : isMissing ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-800 text-slate-400 border border-slate-700">
                          <span>NO TELEMETRY</span>
                        </span>
                      ) : isStopped ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-800/80 text-slate-300 border border-slate-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          <span>SIGNAL LIVE (OFF)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>STREAMING</span>
                        </span>
                      )}
                    </td>

                    {/* Last Telemetry Timestamp */}
                    <td className="py-3.5 px-3 font-mono text-slate-400 text-xs">
                      {formatRelativeTime(machine.latest_telemetry_timestamp)}
                    </td>

                    {/* Action Link */}
                    <td className="py-3.5 px-4 text-right">
                      <span className="inline-flex items-center text-slate-400 group-hover:text-emerald-400 transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
