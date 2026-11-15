from math import isfinite


def calculate_energy_increment_kwh(
    previous_power_kw: float | None,
    current_power_kw: float | None,
    elapsed_seconds: float,
) -> float | None:
    if elapsed_seconds <= 0 or not isfinite(elapsed_seconds):
        raise ValueError("elapsed_seconds must be finite and greater than zero")
    if previous_power_kw is None or current_power_kw is None:
        return None
    if not isfinite(previous_power_kw) or not isfinite(current_power_kw):
        return None
    average_power_kw = (previous_power_kw + current_power_kw) / 2.0
    increment_kwh = average_power_kw * elapsed_seconds / 3600.0
    return increment_kwh if isfinite(increment_kwh) else None