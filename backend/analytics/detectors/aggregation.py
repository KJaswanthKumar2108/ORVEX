from dataclasses import dataclass
from datetime import datetime
from math import isfinite
from typing import Iterable
from uuid import NAMESPACE_URL, UUID, uuid5

from analytics.config import DetectionConfig
from analytics.features.energy import calculate_energy_increment_kwh
from analytics.models import (
    DetectionConfidence,
    DetectionEvent,
    DetectionReason,
    DetectionStatus,
    FeatureQuality,
    FeatureRecord,
)

_REASON_PRIORITY = {
    DetectionReason.IDLE_WASTAGE: 0,
    DetectionReason.LOW_LOAD_WASTAGE: 1,
    DetectionReason.ABNORMAL_POWER: 2,
    DetectionReason.START_STOP_CYCLING: 3,
}


@dataclass(frozen=True, slots=True)
class DetectionCandidate:
    machine_id: UUID
    start_time: datetime
    end_time: datetime
    reason: DetectionReason
    features: tuple[FeatureRecord, ...]
    required_duration_seconds: float
    minimum_excess_power_kw: float | None
    cycle_count: int = 0


def _integrate(
    features: tuple[FeatureRecord, ...],
    field_name: str,
    maximum_gap_seconds: float,
) -> tuple[float | None, float]:
    total = 0.0
    covered_seconds = 0.0
    integrated = False
    for previous, current in zip(features, features[1:]):
        if previous.timestamp is None or current.timestamp is None:
            continue
        elapsed = (current.timestamp - previous.timestamp).total_seconds()
        if elapsed <= 0 or elapsed > maximum_gap_seconds:
            continue
        previous_value = getattr(previous, field_name)
        current_value = getattr(current, field_name)
        if previous_value is None or current_value is None:
            continue
        increment = calculate_energy_increment_kwh(previous_value, current_value, elapsed)
        if increment is None or not isfinite(increment):
            continue
        total += increment
        covered_seconds += elapsed
        integrated = True
    return (total if integrated else None), covered_seconds


def _mean(values: Iterable[float]) -> float | None:
    selected = tuple(value for value in values if isfinite(value))
    if not selected:
        return None
    return sum(selected) / len(selected)


def _candidate_quality(candidate: DetectionCandidate) -> FeatureQuality:
    if any(feature.quality is FeatureQuality.INVALID for feature in candidate.features):
        return FeatureQuality.INVALID
    if any(feature.quality is FeatureQuality.PARTIAL for feature in candidate.features):
        return FeatureQuality.PARTIAL
    return FeatureQuality.GOOD


def _confidence(candidate: DetectionCandidate, config: DetectionConfig) -> DetectionConfidence:
    if _candidate_quality(candidate) is not FeatureQuality.GOOD:
        return DetectionConfidence.LOW

    if candidate.reason is DetectionReason.START_STOP_CYCLING:
        evidence_ratio = candidate.cycle_count / config.minimum_cycles
        if evidence_ratio >= 2.0:
            return DetectionConfidence.HIGH
        if evidence_ratio >= 1.5:
            return DetectionConfidence.MEDIUM
        return DetectionConfidence.LOW

    duration = (candidate.end_time - candidate.start_time).total_seconds()
    duration_ratio = duration / candidate.required_duration_seconds
    excess_values = (
        feature.excess_power_kw
        for feature in candidate.features
        if feature.excess_power_kw is not None
    )
    average_excess = _mean(excess_values)
    strength_ratio = (
        average_excess / candidate.minimum_excess_power_kw
        if average_excess is not None and candidate.minimum_excess_power_kw
        else 0.0
    )
    if duration_ratio >= 3.0 and strength_ratio >= 2.0:
        return DetectionConfidence.HIGH
    if duration_ratio >= 1.5 and strength_ratio >= 1.25:
        return DetectionConfidence.MEDIUM
    return DetectionConfidence.LOW


def _make_event(candidates: tuple[DetectionCandidate, ...], config: DetectionConfig) -> DetectionEvent:
    ordered_candidates = tuple(sorted(candidates, key=lambda item: _REASON_PRIORITY[item.reason]))
    primary = ordered_candidates[0]
    reasons = tuple(dict.fromkeys(candidate.reason for candidate in ordered_candidates))
    start_time = min(candidate.start_time for candidate in candidates)
    end_time = max(candidate.end_time for candidate in candidates)
    duration_seconds = (end_time - start_time).total_seconds()

    unique_features: dict[datetime, FeatureRecord] = {}
    for candidate in candidates:
        for feature in candidate.features:
            if feature.timestamp is not None:
                unique_features.setdefault(feature.timestamp, feature)
    all_features = tuple(unique_features[key] for key in sorted(unique_features))
    quality = (
        FeatureQuality.PARTIAL
        if any(feature.quality is FeatureQuality.PARTIAL for feature in all_features)
        else FeatureQuality.GOOD
    )

    waste_features_by_time: dict[datetime, FeatureRecord] = {}
    for candidate in candidates:
        if candidate.reason is DetectionReason.START_STOP_CYCLING:
            continue
        for feature in candidate.features:
            if feature.timestamp is not None:
                waste_features_by_time.setdefault(feature.timestamp, feature)
    waste_features = tuple(waste_features_by_time[key] for key in sorted(waste_features_by_time))

    actual_energy, actual_coverage_seconds = _integrate(
        all_features, "active_power_kw", config.maximum_sample_gap_seconds
    )
    wasted_energy: float | None = None
    waste_coverage_seconds = 0.0
    if waste_features:
        wasted_energy, waste_coverage_seconds = _integrate(
            waste_features, "excess_power_kw", config.maximum_sample_gap_seconds
        )

    excess_values = tuple(
        feature.excess_power_kw
        for feature in waste_features
        if feature.excess_power_kw is not None
    )
    peak_excess = max(excess_values) if excess_values else None
    average_excess = (
        wasted_energy * 3600.0 / waste_coverage_seconds
        if wasted_energy is not None and waste_coverage_seconds > 0
        else _mean(excess_values)
    )
    average_actual = (
        actual_energy * 3600.0 / actual_coverage_seconds
        if actual_energy is not None and actual_coverage_seconds > 0
        else _mean(
            feature.active_power_kw
            for feature in all_features
            if feature.active_power_kw is not None
        )
    )
    average_expected = _mean(
        feature.expected_power_kw
        for feature in waste_features
        if feature.expected_power_kw is not None
    )
    average_idle_ratio = _mean(
        feature.idle_power_ratio
        for feature in waste_features
        if feature.idle_power_ratio is not None
    )

    rule_evidence: dict[str, object] = {}
    for candidate in ordered_candidates:
        rule_evidence[candidate.reason.value] = {
            "sample_count": len(candidate.features),
            "duration_seconds": (candidate.end_time - candidate.start_time).total_seconds(),
            "required_duration_seconds": candidate.required_duration_seconds,
            "minimum_excess_power_kw": candidate.minimum_excess_power_kw,
            "cycle_count": candidate.cycle_count if candidate.cycle_count else None,
        }

    evidence: dict[str, object] = {
        "operating_states": sorted(
            {feature.operating_state for feature in all_features if feature.operating_state is not None}
        ),
        "sample_count": len(all_features),
        "expected_power_kw": average_expected,
        "average_actual_power_kw": average_actual,
        "average_excess_power_kw": average_excess,
        "idle_power_ratio": average_idle_ratio,
        "duration_seconds": duration_seconds,
        "actual_energy_coverage_seconds": actual_coverage_seconds,
        "excess_energy_coverage_seconds": waste_coverage_seconds,
        "rules": rule_evidence,
    }

    event_key = ":".join(
        (str(primary.machine_id), start_time.isoformat(), end_time.isoformat(), ",".join(reason.value for reason in reasons))
    )
    event_id = uuid5(NAMESPACE_URL, f"orvex:detection:{event_key}")
    return DetectionEvent(
        event_id=event_id,
        machine_id=primary.machine_id,
        start_time=start_time,
        end_time=end_time,
        duration_seconds=duration_seconds,
        primary_reason=primary.reason,
        contributing_reasons=tuple(reason for reason in reasons if reason is not primary.reason),
        peak_excess_power_kw=peak_excess,
        average_excess_power_kw=average_excess,
        actual_energy_consumed_kwh=actual_energy,
        estimated_wasted_energy_kwh=wasted_energy,
        confidence=_confidence(primary, config),
        quality=quality,
        status=DetectionStatus.CANDIDATE,
        evidence=evidence,
    )


def aggregate_candidates(
    candidates: Iterable[DetectionCandidate],
    config: DetectionConfig,
) -> tuple[DetectionEvent, ...]:
    ordered = sorted(candidates, key=lambda item: (item.machine_id, item.start_time, item.end_time))
    merged: list[list[DetectionCandidate]] = []
    for candidate in ordered:
        if (
            merged
            and merged[-1][0].machine_id == candidate.machine_id
            and candidate.start_time <= max(item.end_time for item in merged[-1])
        ):
            merged[-1].append(candidate)
        else:
            merged.append([candidate])
    return tuple(_make_event(tuple(group), config) for group in merged)