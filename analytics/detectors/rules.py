from analytics.config import DetectionConfig
from analytics.models import DetectionReason, FeatureQuality, FeatureRecord, OperatingState


def evaluate_rules(feature: FeatureRecord, config: DetectionConfig) -> tuple[DetectionReason, ...]:
    if feature.timestamp is None or feature.quality is FeatureQuality.INVALID:
        return ()

    state = feature.operating_state
    actual = feature.active_power_kw
    expected = feature.expected_power_kw
    excess = feature.excess_power_kw
    if actual is None or expected is None:
        return ()

    matches: list[DetectionReason] = []
    if state == OperatingState.IDLE.value and actual > expected:
        absolute_match = excess is not None and excess >= config.minimum_idle_excess_power_kw
        ratio_match = feature.idle_power_ratio is not None and feature.idle_power_ratio >= config.idle_power_ratio_threshold
        if absolute_match or ratio_match:
            matches.append(DetectionReason.IDLE_WASTAGE)

    if (
        state == OperatingState.LOW_LOAD.value
        and feature.load_percent is not None
        and feature.load_percent <= config.maximum_low_load_percent
        and excess is not None
        and excess >= config.minimum_low_load_excess_power_kw
    ):
        matches.append(DetectionReason.LOW_LOAD_WASTAGE)

    try:
        parsed_state = OperatingState(state) if state is not None else None
    except ValueError:
        parsed_state = None
    if (
        parsed_state in config.abnormal_operating_states
        and expected > 0
        and excess is not None
        and excess >= config.minimum_abnormal_excess_power_kw
        and actual / expected >= config.minimum_abnormal_excess_ratio
    ):
        matches.append(DetectionReason.ABNORMAL_POWER)

    return tuple(matches)