from math import isfinite


def calculate_apparent_power_kva(
    voltage_v: float | None,
    current_a: float | None,
    voltage_current_multiplier: float = 1.0,
) -> float | None:
    if voltage_v is None or current_a is None:
        return None
    if not all(isfinite(value) for value in (voltage_v, current_a, voltage_current_multiplier)):
        return None
    if voltage_v < 0 or current_a < 0 or voltage_current_multiplier <= 0:
        return None
    apparent_power_kva = voltage_v * current_a * voltage_current_multiplier / 1000.0
    return apparent_power_kva if isfinite(apparent_power_kva) else None


def calculate_power_factor(
    active_power_kw: float | None,
    apparent_power_kva: float | None,
) -> float | None:
    if active_power_kw is None or apparent_power_kva is None or apparent_power_kva <= 0:
        return None
    if not isfinite(active_power_kw) or not isfinite(apparent_power_kva):
        return None
    factor = active_power_kw / apparent_power_kva
    if not -1.0 <= factor <= 1.0:
        return None
    return factor