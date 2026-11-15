from datetime import datetime, timezone
from math import isfinite
from uuid import UUID

from analytics.features.energy import calculate_energy_increment_kwh
from app.db.models import EnergyWastageEvent, Telemetry
from app.repositories.machine_repository import MachineRepository
from app.repositories.telemetry_repository import TelemetryRepository
from app.repositories.wastage_event_repository import WastageEventRepository
from app.schemas.energy import EnergyDataQuality, EnergySummaryResponse
from app.services.machine_service import MachineNotFoundError
from app.services.telemetry_query_service import InvalidTimeRangeError


def _merge_intervals(intervals: list[tuple[datetime, datetime]]) -> list[tuple[datetime, datetime]]:
    """Merge overlapping datetime intervals into disjoint continuous intervals."""
    if not intervals:
        return []
    sorted_intervals = sorted(intervals, key=lambda x: x[0])
    merged = [sorted_intervals[0]]
    for current_start, current_end in sorted_intervals[1:]:
        last_start, last_end = merged[-1]
        if current_start <= last_end:
            # Overlapping intervals, merge by extending end
            merged[-1] = (last_start, max(last_end, current_end))
        else:
            merged.append((current_start, current_end))
    return merged


class EnergyAnalyticsService:
    def __init__(
        self,
        machine_repository: MachineRepository,
        telemetry_repository: TelemetryRepository,
        wastage_event_repository: WastageEventRepository,
        maximum_sample_gap_seconds: float = 30.0,
    ) -> None:
        self._machine_repo = machine_repository
        self._telemetry_repo = telemetry_repository
        self._event_repo = wastage_event_repository
        self._maximum_sample_gap_seconds = maximum_sample_gap_seconds

    def get_energy_summary(
        self,
        machine_id: UUID,
        start_time: datetime,
        end_time: datetime,
    ) -> EnergySummaryResponse:
        # 1. Validate machine exists
        if self._machine_repo.get_by_id(machine_id) is None:
            raise MachineNotFoundError(f"Machine {machine_id} not found.")

        # 2. Normalize and validate time range
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
        if end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)

        if start_time >= end_time:
            raise InvalidTimeRangeError("start_time must be strictly before end_time.")

        window_seconds = (end_time - start_time).total_seconds()

        # 3. Retrieve telemetry records in window
        records = self._telemetry_repo.get_all_in_range(machine_id, start_time, end_time)

        # 4. Compute actual energy consumption and state durations
        actual_energy_kwh: float | None = None
        covered_seconds = 0.0
        operating_seconds = 0.0
        idle_seconds = 0.0
        low_load_seconds = 0.0
        integrated_any = False
        accumulated_energy = 0.0

        if len(records) >= 2:
            for prev, curr in zip(records, records[1:]):
                prev_ts = prev.timestamp if prev.timestamp.tzinfo is not None else prev.timestamp.replace(tzinfo=timezone.utc)
                curr_ts = curr.timestamp if curr.timestamp.tzinfo is not None else curr.timestamp.replace(tzinfo=timezone.utc)
                elapsed = (curr_ts - prev_ts).total_seconds()

                # Ignore out-of-order, duplicate, or samples separated by gaps exceeding threshold
                if elapsed <= 0 or elapsed > self._maximum_sample_gap_seconds:
                    continue

                covered_seconds += elapsed

                # State duration tracking based on previous sample state
                state = (prev.operating_state or "").upper()
                if state and state != "STOPPED":
                    operating_seconds += elapsed
                if state == "IDLE":
                    idle_seconds += elapsed
                elif state == "LOW_LOAD":
                    low_load_seconds += elapsed

                # Trapezoidal active power integration
                if prev.active_power is not None and curr.active_power is not None:
                    increment = calculate_energy_increment_kwh(
                        prev.active_power, curr.active_power, elapsed
                    )
                    if increment is not None and isfinite(increment):
                        accumulated_energy += increment
                        integrated_any = True

        if integrated_any:
            actual_energy_kwh = round(accumulated_energy, 4)

        # 5. Query and compute wasted energy from persisted events
        events = self._event_repo.get_events_intersecting_range(machine_id, start_time, end_time)
        wastage_event_count = len(events)

        # Prevent double-counting overlapping wastage events:
        # Group events by intervals and compute non-overlapping wasted energy
        estimated_wasted_energy_kwh: float | None = None
        abnormal_intervals: list[tuple[datetime, datetime]] = []

        if events:
            total_wasted = 0.0
            has_wasted = False

            # Clip event intervals to query window and check for overlaps
            event_intervals: list[tuple[datetime, datetime, float]] = []
            for ev in events:
                ev_start = ev.start_time if ev.start_time.tzinfo is not None else ev.start_time.replace(tzinfo=timezone.utc)
                ev_end = (ev.end_time if ev.end_time.tzinfo is not None else ev.end_time.replace(tzinfo=timezone.utc)) if ev.end_time else end_time

                c_start = max(ev_start, start_time)
                c_end = min(ev_end, end_time)

                if "ABNORMAL_POWER" in ev.detection_reason:
                    abnormal_intervals.append((c_start, c_end))

                if ev.estimated_wasted_energy_kwh is not None:
                    has_wasted = True
                    full_duration = max(1.0, (ev_end - ev_start).total_seconds())
                    clipped_duration = max(0.0, (c_end - c_start).total_seconds())
                    # Prorate wasted energy if event extends outside query window
                    prorated = float(ev.estimated_wasted_energy_kwh) * (clipped_duration / full_duration)
                    event_intervals.append((c_start, c_end, prorated))

            if has_wasted:
                # Merge overlapping intervals to avoid double counting
                # If intervals overlap, distribute rate across union
                sorted_events = sorted(event_intervals, key=lambda x: x[0])
                merged_energy = 0.0
                i = 0
                while i < len(sorted_events):
                    s, e, energy = sorted_events[i]
                    dur = max(1.0, (e - s).total_seconds())
                    rate = energy / dur

                    # Check for overlaps with subsequent events
                    j = i + 1
                    overlap_end = e
                    max_rate = rate
                    while j < len(sorted_events) and sorted_events[j][0] < overlap_end:
                        sub_s, sub_e, sub_energy = sorted_events[j]
                        sub_dur = max(1.0, (sub_e - sub_s).total_seconds())
                        sub_rate = sub_energy / sub_dur
                        max_rate = max(max_rate, sub_rate)
                        overlap_end = max(overlap_end, sub_e)
                        j += 1

                    if j == i + 1:
                        # Non-overlapping event
                        merged_energy += energy
                        i += 1
                    else:
                        # Overlapping events: integrate at maximum rate over union
                        union_duration = (overlap_end - s).total_seconds()
                        merged_energy += max_rate * union_duration
                        i = j

                estimated_wasted_energy_kwh = round(merged_energy, 4)

        # 6. Compute abnormal power duration over merged non-overlapping intervals
        merged_abnormal = _merge_intervals(abnormal_intervals)
        abnormal_power_seconds = sum((e - s).total_seconds() for s, e in merged_abnormal)

        # 7. Coverage and quality assessment
        data_coverage_ratio = min(1.0, max(0.0, covered_seconds / window_seconds))

        if len(records) == 0 or covered_seconds == 0:
            quality = EnergyDataQuality.INSUFFICIENT_DATA
        elif data_coverage_ratio >= 0.85:
            quality = EnergyDataQuality.GOOD
        else:
            quality = EnergyDataQuality.PARTIAL

        return EnergySummaryResponse(
            machine_id=machine_id,
            start_time=start_time,
            end_time=end_time,
            actual_energy_kwh=actual_energy_kwh,
            estimated_wasted_energy_kwh=estimated_wasted_energy_kwh,
            wastage_event_count=wastage_event_count,
            operating_duration_seconds=round(operating_seconds, 2),
            idle_duration_seconds=round(idle_seconds, 2),
            low_load_duration_seconds=round(low_load_seconds, 2),
            abnormal_power_duration_seconds=round(abnormal_power_seconds, 2),
            data_coverage_ratio=round(data_coverage_ratio, 4),
            quality=quality,
            telemetry_sample_count=len(records),
        )
