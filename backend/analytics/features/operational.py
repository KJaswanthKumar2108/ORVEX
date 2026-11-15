from math import isfinite

from analytics.models import OperatingState


def parse_operating_state(value: str | None) -> OperatingState | None:
    if value is None:
        return None
    try:
        return OperatingState(value.upper())
    except (AttributeError, ValueError):
        return None


def calculate_excess_power_kw(
    active_power_kw: float | None,
    expected_power_kw: float | None,
) -> float | None:
    if active_power_kw is None or expected_power_kw is None:
        return None
    if not isfinite(active_power_kw) or not isfinite(expected_power_kw):
        return None
    excess_power_kw = max(active_power_kw - expected_power_kw, 0.0)
    return excess_power_kw if isfinite(excess_power_kw) else None


def calculate_idle_power_ratio(
    state: OperatingState | None,
    active_power_kw: float | None,
    expected_power_kw: float | None,
) -> float | None:
    if state is not OperatingState.IDLE or active_power_kw is None or expected_power_kw is None:
        return None
    if expected_power_kw <= 0 or not isfinite(active_power_kw) or not isfinite(expected_power_kw):
        return None
    ratio = active_power_kw / expected_power_kw
    return ratio if isfinite(ratio) else None


def calculate_power_per_load_percent(
    active_power_kw: float | None,
    load_percent: float | None,
) -> float | None:
    if active_power_kw is None or load_percent is None or load_percent <= 0:
        return None
    if not isfinite(active_power_kw) or not isfinite(load_percent):
        return None
    power_per_load = active_power_kw / load_percent
    return power_per_load if isfinite(power_per_load) else None