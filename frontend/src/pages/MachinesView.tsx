import React, { useState, useMemo } from "react";
import {
  HardHat,
  Search,
  Filter,
  ArrowRight,
  Zap,
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import type { MachineSummaryResponse } from "../api/types";
import { PageHeader } from "../components/common/PageHeader";
import { MetricCard } from "../components/common/MetricCard";
import { StatusPill } from "../components/common/StatusPill";
import { EmptyState } from "../components/common/EmptyState";
import { THEME } from "../theme/tokens";
import { formatPower, formatRelativeTime } from "../utils/formatters";

interface MachinesViewProps {
  machines: MachineSummaryResponse[];
  isLoading?: boolean;
  onSelectMachine: (machineId: string) => void;
  onRefresh?: () => void;
}

export const MachinesView: React.FC<MachinesViewProps> = ({
  machines,
  isLoading = false,
  onSelectMachine,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // Distinct types available in fleet
  const machineTypes = useMemo(() => {
    const types = new Set<string>();
    machines.forEach((m) => {
      if (m.machine_type) types.add(m.machine_type);
    });
    return Array.from(types).sort();
  }, [machines]);

  // Filtered machines
  const filteredMachines = useMemo(() => {
    return machines.filter((m) => {
      const matchesSearch =
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.machine_identifier.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = selectedType === "all" || m.machine_type === selectedType;
      const matchesStatus =
        selectedStatus === "all" || m.status.toLowerCase() === selectedStatus.toLowerCase();
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [machines, searchTerm, selectedType, selectedStatus]);

  // Aggregate stats
  const totalFleetPower = useMemo(() => {
    return machines.reduce((acc, m) => acc + (m.rated_power_kw ? Number(m.rated_power_kw) : 0), 0);
  }, [machines]);

  const activeCount = machines.filter((m) => m.status.toLowerCase() === "active").length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Fleet Equipment Directory"
        subtitle="Operational inventory of monitored mining equipment, retrofit power sensors, and telemetry status"
        icon={<HardHat className="w-5 h-5 text-emerald-400" />}
        actions={
          onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className={THEME.buttons.secondary}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
              <span>Refresh Fleet</span>
            </button>
          )
        }
      />

      {/* Quick Fleet KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title="Total Assets"
          value={machines.length}
          unit="units"
          subtitle="Monitored in pit"
          icon={<HardHat className="w-4 h-4" />}
          indicatorColor="emerald"
        />
        <MetricCard
          title="Active Status"
          value={activeCount}
          unit="active"
          subtitle={`${machines.length - activeCount} standby/service`}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          indicatorColor="emerald"
        />
        <MetricCard
          title="Total Nameplate"
          value={formatPower(totalFleetPower)}
          subtitle="Combined rated capacity"
          icon={<Zap className="w-4 h-4 text-amber-400" />}
          indicatorColor="amber"
        />
        <MetricCard
          title="Equipment Types"
          value={machineTypes.length}
          unit="classes"
          subtitle="Crusher, Conveyor, Pump, Fan..."
          icon={<Activity className="w-4 h-4 text-cyan-400" />}
          indicatorColor="cyan"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl bg-[#0d1424] border border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label="Search equipment by name or identifier"
            placeholder="Search by equipment name or code (e.g. CONV-01, Crusher)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#080d18] border border-slate-700/60 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 focus-visible:ring-1 focus-visible:ring-emerald-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 shrink-0 text-xs text-slate-400 font-medium">
            <Filter className="w-3.5 h-3.5" />
            <span>Type:</span>
          </div>
          <select
            aria-label="Filter equipment by type"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-[#080d18] border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/80 cursor-pointer"
          >
            <option value="all">All Types ({machines.length})</option>
            {machineTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter equipment by status"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-[#080d18] border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/80 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
      </div>

      {/* Equipment Table */}
      {filteredMachines.length === 0 ? (
        <EmptyState
          icon={<AlertCircle className="w-6 h-6 text-slate-500" />}
          title="No machinery matches your criteria"
          description="Try broadening your search term or resetting the equipment type and status filters."
          action={{
            label: "Reset Filters",
            onClick: () => {
              setSearchTerm("");
              setSelectedType("all");
              setSelectedStatus("all");
            },
          }}
        />
      ) : (
        <div className="rounded-xl border border-slate-800/80 overflow-hidden bg-[#0d1424] shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#080d18] border-b border-slate-800 text-[11px] font-mono font-semibold uppercase text-slate-400 tracking-wider">
                  <th className="py-3 px-4">Equipment</th>
                  <th className="py-3 px-4">Identifier</th>
                  <th className="py-3 px-4">Class</th>
                  <th className="py-3 px-4 text-right">Rated Power</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Telemetry Freshness</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredMachines.map((machine) => (
                  <tr
                    key={machine.id}
                    onClick={() => onSelectMachine(machine.id)}
                    className="hover:bg-[#121b30] transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4 font-semibold text-white group-hover:text-emerald-400 transition-colors">
                      {machine.name}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-300">
                      {machine.machine_identifier}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-[11px] font-medium">
                        {machine.machine_type}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-200 text-right">
                      {machine.rated_power_kw ? `${Number(machine.rated_power_kw).toFixed(1)} kW` : "—"}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusPill status={machine.status} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400 text-xs">
                      {machine.latest_telemetry_timestamp
                        ? formatRelativeTime(machine.latest_telemetry_timestamp)
                        : "No Telemetry"}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        aria-label={`View diagnostics for ${machine.name} (${machine.machine_identifier})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectMachine(machine.id);
                        }}
                        className="inline-flex items-center gap-1 text-xs text-emerald-400 group-hover:text-emerald-300 font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:underline"
                      >
                        <span>Deep Dive</span>
                        <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
