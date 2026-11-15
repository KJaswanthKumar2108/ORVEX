import React, { useState } from "react";
import { ArrowLeft, HardHat } from "lucide-react";
import { ErrorAlert } from "../components/common/ErrorAlert";
import { EmptyState } from "../components/common/EmptyState";
import { CardSkeleton, ChartSkeleton, TableSkeleton } from "../components/common/LoadingSkeleton";
import { MachineDetailHeader } from "../components/machine/MachineDetailHeader";
import { LiveOperatingOverview } from "../components/machine/LiveOperatingOverview";
import { ElectricalPerformanceCharts } from "../components/machine/ElectricalPerformanceCharts";
import { OperationalPerformanceCharts } from "../components/machine/OperationalPerformanceCharts";
import { WastageInvestigationSection } from "../components/machine/WastageInvestigationSection";
import { MachineHealthInvestigationSection } from "../components/machine/MachineHealthInvestigationSection";
import { HistoricalActivityTimeline } from "../components/machine/HistoricalActivityTimeline";
import { MachineTelemetryTable } from "../components/machine/MachineTelemetryTable";
import { useMachineDetail } from "../hooks/useMachineDetail";
import { TIME_RANGE_OPTIONS, type TimeRangeKey } from "../utils/timeRanges";

interface MachineDetailViewProps {
  machineId: string;
  onBack: () => void;
}

export const MachineDetailView: React.FC<MachineDetailViewProps> = ({ machineId, onBack }) => {
  const [timeRangeKey, setTimeRangeKey] = useState<TimeRangeKey>("24h");
  const selectedOption =
    TIME_RANGE_OPTIONS.find((opt) => opt.key === timeRangeKey) || TIME_RANGE_OPTIONS[1];

  const {
    machine,
    machineMeta,
    energySummary,
    chartTelemetry,
    events,
    alerts,
    healthDetail,
    healthWarnings,
    rawTelemetry,
    telemetryTotal,
    telemetryOffset,
    telemetryLimit,
    isLoading,
    isRefreshing,
    isTelemetryLoading,
    error,
    notFound,
    lastRefreshed,
    autoRefreshInterval,
    setAutoRefreshInterval,
    refresh,
    acknowledgeAlert,
    acknowledgeWarning,
    createObservation,
    onPageChange,
  } = useMachineDetail(machineId, timeRangeKey);

  // Initial loading state
  if (isLoading && !machine && !notFound) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Fleet Command Center</span>
        </button>
        <CardSkeleton count={2} />
        <ChartSkeleton />
        <TableSkeleton rows={4} />
      </div>
    );
  }

  // Not Found / 404 state
  if (notFound || (!isLoading && !machine)) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Fleet Command Center</span>
        </button>

        <EmptyState
          icon={<HardHat className="w-7 h-7 text-amber-500" />}
          title={`Machine Not Found (ID: ${machineId})`}
          description="The requested equipment identifier was not found in the fleet registry, is decommissioned, or backend services are unavailable."
          action={{
            label: "Return to Fleet Command Center",
            onClick: onBack,
            icon: <ArrowLeft className="w-3.5 h-3.5 mr-1" />,
          }}
        />
      </div>
    );
  }

  // Critical error before machine loaded
  if (error && !machine) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Fleet Command Center</span>
        </button>
        <ErrorAlert
          title="Telemetry Ingestion Failure"
          message={error}
          onRetry={refresh}
        />
      </div>
    );
  }

  // If machine summary is present, render full diagnostic experience
  const latestTelemetryRecord = chartTelemetry.length > 0 ? chartTelemetry[chartTelemetry.length - 1] : null;

  return (
    <div className="space-y-6">
      {/* 1. Machine Identity Header */}
      {machine && (
        <MachineDetailHeader
          machine={machine}
          machineMeta={machineMeta}
          healthStatus={healthDetail?.health_status}
          selectedRange={timeRangeKey}
          onRangeChange={setTimeRangeKey}
          onBack={onBack}
          onRefresh={refresh}
          isRefreshing={isRefreshing}
          lastRefreshed={lastRefreshed}
          autoRefreshInterval={autoRefreshInterval}
          onAutoRefreshChange={setAutoRefreshInterval}
        />
      )}

      {/* Partial error notice if any sub-resource failed */}
      {error && (
        <ErrorAlert
          title="Telemetry Synchronization Issue"
          message={error}
          onRetry={refresh}
        />
      )}

      {/* 2. Live Operating Overview */}
      {machine && (
        <LiveOperatingOverview
          machine={machine}
          latestRecord={latestTelemetryRecord}
          energySummary={energySummary}
        />
      )}

      {/* 3. Electrical Performance Analysis */}
      <ElectricalPerformanceCharts
        telemetry={chartTelemetry}
        ratedPowerKw={machine?.rated_power_kw}
        timeRangeLabel={selectedOption.label}
        isLoading={isLoading}
      />

      {/* 4. Operational Performance Visualizations */}
      <OperationalPerformanceCharts
        telemetry={chartTelemetry}
        energySummary={energySummary}
        timeRangeLabel={selectedOption.label}
        isLoading={isLoading}
      />

      {/* 5. Energy-Wastage Investigation Section */}
      <WastageInvestigationSection
        events={events}
        machineName={machine?.name || "Equipment"}
        isLoading={isLoading}
      />

      {/* 6. Machine-Health Investigation Section */}
      {machine && (
        <MachineHealthInvestigationSection
          machineId={machine.id}
          healthDetail={healthDetail}
          healthWarnings={healthWarnings}
          onAcknowledgeWarning={acknowledgeWarning}
          onCreateObservation={createObservation}
        />
      )}

      {/* 7. Historical Activity Timeline */}
      <HistoricalActivityTimeline
        telemetry={chartTelemetry}
        wastageEvents={events}
        alerts={alerts}
        healthWarnings={healthWarnings}
        observations={healthDetail?.recent_observations}
        onAcknowledgeAlert={acknowledgeAlert}
        isLoading={isLoading}
      />

      {/* 8. Paginated Raw Telemetry Log */}
      <MachineTelemetryTable
        telemetry={rawTelemetry}
        total={telemetryTotal}
        limit={telemetryLimit}
        offset={telemetryOffset}
        onPageChange={onPageChange}
        isLoading={isTelemetryLoading}
      />
    </div>
  );
};
