from __future__ import annotations

import csv
from datetime import datetime, timezone
import io
from uuid import UUID

from app.db.models import EnergyWastageEvent, Machine
from app.repositories.machine_repository import MachineRepository
from app.repositories.wastage_event_repository import WastageEventRepository
from app.schemas.report import (
    EnergyWastageReportResponse,
    ReportEventDetail,
    ReportMachineBreakdown,
    ReportReasonBreakdown,
)
from app.services.energy_analytics_service import EnergyAnalyticsService
from app.services.machine_service import MachineNotFoundError
from app.services.telemetry_query_service import InvalidTimeRangeError


class ReportService:
    def __init__(
        self,
        machine_repository: MachineRepository,
        wastage_event_repository: WastageEventRepository,
        energy_analytics_service: EnergyAnalyticsService,
    ) -> None:
        self._machine_repo = machine_repository
        self._event_repo = wastage_event_repository
        self._energy_service = energy_analytics_service

    def generate_energy_wastage_report(
        self,
        *,
        start_time: datetime,
        end_time: datetime,
        machine_id: UUID | None = None,
    ) -> EnergyWastageReportResponse:
        # 1. Normalize timestamps
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
        if end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)

        if start_time >= end_time:
            raise InvalidTimeRangeError("start_time must be strictly before end_time.")

        # 2. Identify target machines
        target_machines: list[Machine] = []
        target_machine_name: str | None = None

        if machine_id is not None:
            machine = self._machine_repo.get_by_id(machine_id)
            if machine is None:
                raise MachineNotFoundError(f"Machine {machine_id} not found.")
            target_machines = [machine]
            target_machine_name = machine.name
        else:
            target_machines, _ = self._machine_repo.list_machines(limit=1000)

        # 3. Aggregate per-machine metrics & events
        by_machine_list: list[ReportMachineBreakdown] = []
        all_events_detail: list[ReportEventDetail] = []
        raw_events_for_reasons: list[EnergyWastageEvent] = []

        total_actual_energy = 0.0
        total_wasted_energy = 0.0
        has_actual_energy = False
        has_wasted_energy = False
        total_events_count = 0
        unestimated_events_count = 0
        total_event_duration_sec = 0.0
        coverage_sum = 0.0

        for m in target_machines:
            try:
                summary = self._energy_service.get_energy_summary(m.id, start_time, end_time)
            except Exception:
                continue

            events = self._event_repo.get_events_intersecting_range(m.id, start_time, end_time)

            m_unestimated = sum(1 for e in events if e.estimated_wasted_energy_kwh is None)
            m_duration = sum(e.duration_seconds or 0.0 for e in events)

            if summary.actual_energy_kwh is not None:
                total_actual_energy += summary.actual_energy_kwh
                has_actual_energy = True

            if summary.estimated_wasted_energy_kwh is not None:
                total_wasted_energy += summary.estimated_wasted_energy_kwh
                has_wasted_energy = True

            total_events_count += len(events)
            unestimated_events_count += m_unestimated
            total_event_duration_sec += m_duration
            coverage_sum += summary.data_coverage_ratio

            by_machine_list.append(
                ReportMachineBreakdown(
                    machine_id=m.id,
                    machine_identifier=m.machine_identifier,
                    machine_name=m.name,
                    machine_type=m.machine_type,
                    actual_energy_kwh=summary.actual_energy_kwh,
                    estimated_wasted_energy_kwh=summary.estimated_wasted_energy_kwh,
                    total_wastage_events=len(events),
                    unestimated_wastage_events=m_unestimated,
                    total_event_duration_seconds=round(m_duration, 1),
                    data_coverage_ratio=summary.data_coverage_ratio,
                    quality=summary.quality.value if hasattr(summary.quality, "value") else str(summary.quality),
                )
            )

            for e in events:
                raw_events_for_reasons.append(e)
                wasted_float = (
                    float(e.estimated_wasted_energy_kwh)
                    if e.estimated_wasted_energy_kwh is not None
                    else None
                )
                all_events_detail.append(
                    ReportEventDetail(
                        event_id=e.id,
                        machine_id=m.id,
                        machine_identifier=m.machine_identifier,
                        machine_name=m.name,
                        start_time=e.start_time,
                        end_time=e.end_time,
                        duration_seconds=e.duration_seconds,
                        detection_reason=e.detection_reason,
                        estimated_wasted_energy_kwh=wasted_float,
                        confidence_score=e.confidence_score,
                        status=e.status,
                    )
                )

        # 4. Reason breakdown
        reason_groups: dict[str, list[EnergyWastageEvent]] = {}
        for ev in raw_events_for_reasons:
            primary = ev.detection_reason.split(";")[0].strip().upper()
            reason_groups.setdefault(primary, []).append(ev)

        by_reason_list: list[ReportReasonBreakdown] = []
        for reason_name, revs in sorted(reason_groups.items(), key=lambda x: x[0]):
            rev_count = len(revs)
            rev_dur = sum(e.duration_seconds or 0.0 for e in revs)
            unest_count = sum(1 for e in revs if e.estimated_wasted_energy_kwh is None)
            wasted_vals = [
                float(e.estimated_wasted_energy_kwh)
                for e in revs
                if e.estimated_wasted_energy_kwh is not None
            ]
            reason_wasted = round(sum(wasted_vals), 4) if wasted_vals else None

            by_reason_list.append(
                ReportReasonBreakdown(
                    reason=reason_name,
                    event_count=rev_count,
                    total_duration_seconds=round(rev_dur, 1),
                    estimated_wasted_energy_kwh=reason_wasted,
                    unestimated_event_count=unest_count,
                )
            )

        # Sort event details newest first
        all_events_detail.sort(key=lambda item: item.start_time, reverse=True)

        avg_coverage = (coverage_sum / len(target_machines)) if target_machines else 0.0
        if avg_coverage >= 0.85:
            overall_quality = "GOOD"
        elif avg_coverage >= 0.30:
            overall_quality = "PARTIAL"
        else:
            overall_quality = "INSUFFICIENT_DATA"

        return EnergyWastageReportResponse(
            start_time=start_time,
            end_time=end_time,
            machine_id=machine_id,
            machine_name=target_machine_name,
            actual_energy_kwh=round(total_actual_energy, 4) if has_actual_energy else None,
            estimated_wasted_energy_kwh=round(total_wasted_energy, 4) if has_wasted_energy else None,
            total_wastage_events=total_events_count,
            unestimated_wastage_events=unestimated_events_count,
            total_event_duration_seconds=round(total_event_duration_sec, 1),
            data_coverage_ratio=round(avg_coverage, 4) if target_machines else None,
            overall_quality=overall_quality,
            by_reason=by_reason_list,
            by_machine=by_machine_list,
            events_detail=all_events_detail,
            generated_at=datetime.now(timezone.utc),
        )

    def generate_csv(self, report: EnergyWastageReportResponse) -> str:
        """Export the report into standard RFC 4180 CSV."""
        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")

        # Header metadata comments
        writer.writerow(["# ORVEX Energy Wastage Report"])
        writer.writerow(["# Generated At (UTC)", report.generated_at.strftime("%Y-%m-%d %H:%M:%SZ")])
        writer.writerow([
            "# Period (UTC)",
            f"{report.start_time.strftime('%Y-%m-%d %H:%M:%SZ')} to {report.end_time.strftime('%Y-%m-%d %H:%M:%SZ')}",
        ])
        if report.machine_name:
            writer.writerow(["# Target Machine", f"{report.machine_name} ({report.machine_id})"])
        else:
            writer.writerow(["# Target Scope", "All Monitored Equipment (Fleet-Wide)"])
        writer.writerow([
            "# Measured Actual Energy (kWh)",
            f"{report.actual_energy_kwh:.4f}" if report.actual_energy_kwh is not None else "N/A",
        ])
        writer.writerow([
            "# Estimated Potential Wastage (kWh)",
            f"{report.estimated_wasted_energy_kwh:.4f}" if report.estimated_wasted_energy_kwh is not None else "N/A",
        ])
        writer.writerow(["# Total Wastage Events", report.total_wastage_events])
        writer.writerow(["# Unestimated Wastage Events", report.unestimated_wastage_events])
        writer.writerow([
            "# Data Quality Indicator",
            f"{report.overall_quality} (coverage: {report.data_coverage_ratio:.1%})"
            if report.data_coverage_ratio is not None
            else report.overall_quality,
        ])
        writer.writerow(["# Note", "Estimated wasted energy is a conservative model estimate, not guaranteed savings."])
        writer.writerow([])

        # Section 1: Summary By Detection Reason
        writer.writerow(["--- SUMMARY BY DETECTION REASON ---"])
        writer.writerow([
            "Reason",
            "Event Count",
            "Total Duration (s)",
            "Estimated Wasted Energy (kWh)",
            "Unestimated Events",
        ])
        for r in report.by_reason:
            writer.writerow([
                r.reason,
                r.event_count,
                f"{r.total_duration_seconds:.1f}",
                f"{r.estimated_wasted_energy_kwh:.4f}" if r.estimated_wasted_energy_kwh is not None else "N/A (unquantified)",
                r.unestimated_event_count,
            ])
        writer.writerow([])

        # Section 2: Summary By Machine
        writer.writerow(["--- SUMMARY BY EQUIPMENT ---"])
        writer.writerow([
            "Machine Identifier",
            "Machine Name",
            "Type",
            "Actual Energy (kWh)",
            "Estimated Wasted (kWh)",
            "Wastage Events",
            "Unestimated Events",
            "Total Event Duration (s)",
            "Data Quality",
        ])
        for m in report.by_machine:
            writer.writerow([
                m.machine_identifier,
                m.machine_name,
                m.machine_type,
                f"{m.actual_energy_kwh:.4f}" if m.actual_energy_kwh is not None else "N/A",
                f"{m.estimated_wasted_energy_kwh:.4f}" if m.estimated_wasted_energy_kwh is not None else "N/A",
                m.total_wastage_events,
                m.unestimated_wastage_events,
                f"{m.total_event_duration_seconds:.1f}",
                f"{m.quality} ({m.data_coverage_ratio:.1%})",
            ])
        writer.writerow([])

        # Section 3: Event Detail Log
        writer.writerow(["--- DETAILED WASTAGE EVENT LOG ---"])
        writer.writerow([
            "Machine Identifier",
            "Machine Name",
            "Event ID",
            "Start Time (UTC)",
            "End Time (UTC)",
            "Duration (seconds)",
            "Detection Reason",
            "Estimated Wasted Energy (kWh)",
            "Confidence Score",
            "Status",
        ])
        for ev in report.events_detail:
            start_str = ev.start_time.strftime("%Y-%m-%d %H:%M:%SZ") if ev.start_time else ""
            end_str = ev.end_time.strftime("%Y-%m-%d %H:%M:%SZ") if ev.end_time else "Ongoing"
            dur_str = f"{ev.duration_seconds:.1f}" if ev.duration_seconds is not None else ""
            wasted_str = (
                f"{ev.estimated_wasted_energy_kwh:.4f}"
                if ev.estimated_wasted_energy_kwh is not None
                else "N/A (unquantified)"
            )
            conf_str = f"{ev.confidence_score:.2f}" if ev.confidence_score is not None else "N/A"
            writer.writerow([
                ev.machine_identifier,
                ev.machine_name,
                str(ev.event_id),
                start_str,
                end_str,
                dur_str,
                ev.detection_reason,
                wasted_str,
                conf_str,
                ev.status,
            ])

        return output.getvalue()
