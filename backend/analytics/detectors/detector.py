from datetime import datetime
from typing import Iterable
from uuid import UUID

from analytics.config import DetectionConfig
from analytics.detectors.aggregation import DetectionCandidate, aggregate_candidates
from analytics.detectors.rules import evaluate_rules
from analytics.models import (
    DetectionEvent,
    DetectionReason,
    FeatureQuality,
    FeatureRecord,
    OperatingState,
)

_SUSTAINED_REASONS = (
    DetectionReason.IDLE_WASTAGE,
    DetectionReason.LOW_LOAD_WASTAGE,
    DetectionReason.ABNORMAL_POWER,
)
_CYCLE_PATTERN = (
    OperatingState.STOPPED.value,
    OperatingState.STARTING.value,
    OperatingState.RUNNING.value,
)


class DetectionEngine:
    def __init__(self, config: DetectionConfig = DetectionConfig()) -> None:
        self._config = config

    def process(self, features: Iterable[FeatureRecord]) -> tuple[DetectionEvent, ...]:
        ordered_features = tuple(features)
        candidates = self._sustained_candidates(ordered_features)
        candidates.extend(self._cycling_candidates(ordered_features))
        return aggregate_candidates(candidates, self._config)

    def _minimum_duration(self, reason: DetectionReason) -> float:
        return {
            DetectionReason.IDLE_WASTAGE: self._config.minimum_idle_duration_seconds,
            DetectionReason.LOW_LOAD_WASTAGE: self._config.minimum_low_load_duration_seconds,
            DetectionReason.ABNORMAL_POWER: self._config.minimum_abnormal_duration_seconds,
        }[reason]

    def _minimum_excess(self, reason: DetectionReason) -> float:
        return {
            DetectionReason.IDLE_WASTAGE: self._config.minimum_idle_excess_power_kw,
            DetectionReason.LOW_LOAD_WASTAGE: self._config.minimum_low_load_excess_power_kw,
            DetectionReason.ABNORMAL_POWER: self._config.minimum_abnormal_excess_power_kw,
        }[reason]

    def _close_segment(
        self,
        machine_id: UUID,
        reason: DetectionReason,
        segment: list[FeatureRecord],
    ) -> DetectionCandidate | None:
        if len(segment) < self._config.minimum_condition_samples:
            return None
        start = segment[0].timestamp
        end = segment[-1].timestamp
        if start is None or end is None:
            return None
        if (end - start).total_seconds() < self._minimum_duration(reason):
            return None
        return DetectionCandidate(
            machine_id=machine_id,
            start_time=start,
            end_time=end,
            reason=reason,
            features=tuple(segment),
            required_duration_seconds=self._minimum_duration(reason),
            minimum_excess_power_kw=self._minimum_excess(reason),
        )

    def _sustained_candidates(self, features: tuple[FeatureRecord, ...]) -> list[DetectionCandidate]:
        active: dict[tuple[UUID, DetectionReason], list[FeatureRecord]] = {}
        previous: dict[UUID, FeatureRecord] = {}
        candidates: list[DetectionCandidate] = []

        def close_machine(machine_id: UUID) -> None:
            for reason in _SUSTAINED_REASONS:
                segment = active.pop((machine_id, reason), None)
                if segment:
                    candidate = self._close_segment(machine_id, reason, segment)
                    if candidate is not None:
                        candidates.append(candidate)

        for feature in features:
            machine_id = feature.machine_id
            timestamp = feature.timestamp
            prior = previous.get(machine_id)
            if (
                timestamp is None
                or timestamp.tzinfo is None
                or timestamp.utcoffset() is None
                or feature.quality is FeatureQuality.INVALID
            ):
                close_machine(machine_id)
                previous.pop(machine_id, None)
                continue

            continuous = prior is None
            if prior is not None and prior.timestamp is not None:
                elapsed = (timestamp - prior.timestamp).total_seconds()
                if elapsed <= 0:
                    close_machine(machine_id)
                    previous.pop(machine_id, None)
                    continue
                if elapsed > self._config.maximum_sample_gap_seconds:
                    close_machine(machine_id)
                    continuous = False
                else:
                    continuous = True

            matches = set(evaluate_rules(feature, self._config))
            for reason in _SUSTAINED_REASONS:
                key = (machine_id, reason)
                if reason not in matches:
                    segment = active.pop(key, None)
                    if segment:
                        candidate = self._close_segment(machine_id, reason, segment)
                        if candidate is not None:
                            candidates.append(candidate)
                elif key in active and continuous:
                    active[key].append(feature)
                else:
                    segment = active.pop(key, None)
                    if segment:
                        candidate = self._close_segment(machine_id, reason, segment)
                        if candidate is not None:
                            candidates.append(candidate)
                    active[key] = [feature]
            previous[machine_id] = feature

        for (machine_id, reason), segment in tuple(active.items()):
            candidate = self._close_segment(machine_id, reason, segment)
            if candidate is not None:
                candidates.append(candidate)
        return candidates

    def _cycling_candidates(self, features: tuple[FeatureRecord, ...]) -> list[DetectionCandidate]:
        blocks_by_machine: dict[UUID, list[list[FeatureRecord]]] = {}
        active_blocks: dict[UUID, list[FeatureRecord]] = {}
        previous_timestamp: dict[UUID, datetime] = {}

        def close_block(machine_id: UUID) -> None:
            block = active_blocks.pop(machine_id, None)
            if block:
                blocks_by_machine.setdefault(machine_id, []).append(block)

        for feature in features:
            machine_id = feature.machine_id
            timestamp = feature.timestamp
            if (
                timestamp is None
                or timestamp.tzinfo is None
                or timestamp.utcoffset() is None
                or feature.quality is FeatureQuality.INVALID
            ):
                close_block(machine_id)
                previous_timestamp.pop(machine_id, None)
                continue
            prior_timestamp = previous_timestamp.get(machine_id)
            if prior_timestamp is not None:
                elapsed = (timestamp - prior_timestamp).total_seconds()
                if elapsed <= 0:
                    close_block(machine_id)
                    previous_timestamp.pop(machine_id, None)
                    continue
                if elapsed > self._config.maximum_sample_gap_seconds:
                    close_block(machine_id)
            if feature.operating_state not in {state.value for state in OperatingState}:
                close_block(machine_id)
                previous_timestamp.pop(machine_id, None)
                continue
            active_blocks.setdefault(machine_id, []).append(feature)
            previous_timestamp[machine_id] = timestamp

        for machine_id in tuple(active_blocks):
            close_block(machine_id)

        candidates: list[DetectionCandidate] = []
        for machine_id, blocks in blocks_by_machine.items():
            for block in blocks:
                candidates.extend(self._cycling_candidates_for_block(machine_id, block))
        return candidates

    def _cycling_candidates_for_block(
        self,
        machine_id: UUID,
        block: list[FeatureRecord],
    ) -> list[DetectionCandidate]:
        transitions: list[tuple[datetime, str]] = []
        completed_cycles: list[tuple[datetime, datetime]] = []
        active_start: datetime | None = None
        active_features: list[FeatureRecord] = []
        max_cycle_count = 0
        candidates: list[DetectionCandidate] = []
        previous_state: str | None = None

        def close_candidate() -> None:
            nonlocal active_start, active_features, max_cycle_count
            if active_start is not None and active_features:
                end_time = active_features[-1].timestamp
                if end_time is not None:
                    candidates.append(
                        DetectionCandidate(
                            machine_id=machine_id,
                            start_time=active_start,
                            end_time=end_time,
                            reason=DetectionReason.START_STOP_CYCLING,
                            features=tuple(active_features),
                            required_duration_seconds=self._config.cycling_window_seconds,
                            minimum_excess_power_kw=None,
                            cycle_count=max_cycle_count,
                        )
                    )
            active_start = None
            active_features = []
            max_cycle_count = 0

        for feature in block:
            timestamp = feature.timestamp
            state = feature.operating_state
            if timestamp is None or state is None:
                close_candidate()
                transitions.clear()
                completed_cycles.clear()
                previous_state = None
                continue

            if state != previous_state:
                transitions.append((timestamp, state))
                if tuple(value for _, value in transitions[-3:]) == _CYCLE_PATTERN:
                    completed_cycles.append((transitions[-3][0], timestamp))
                previous_state = state

            window_start = timestamp.timestamp() - self._config.cycling_window_seconds
            completed_cycles = [
                cycle for cycle in completed_cycles if cycle[1].timestamp() >= window_start
            ]
            if len(completed_cycles) >= self._config.minimum_cycles:
                if active_start is None:
                    active_start = completed_cycles[-self._config.minimum_cycles][0]
                    active_features = [
                        item
                        for item in block
                        if item.timestamp is not None and active_start <= item.timestamp <= timestamp
                    ]
                elif not active_features or active_features[-1].timestamp != timestamp:
                    active_features.append(feature)
                max_cycle_count = max(max_cycle_count, len(completed_cycles))
            else:
                close_candidate()

        close_candidate()
        return candidates