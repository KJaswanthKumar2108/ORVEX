from __future__ import annotations

from datetime import datetime, timedelta, timezone
from math import sqrt
from typing import Any
from uuid import UUID

from app.db.models import Machine, MachineHealthWarning, MaintenanceObservation, Telemetry
from app.repositories.machine_health_repository import MachineHealthRepository
from app.repositories.machine_repository import MachineRepository
from app.repositories.telemetry_repository import TelemetryRepository
from app.schemas.machine_health import (
    ChannelCoverageReport,
    ChannelStatus,
    FleetHealthSummaryResponse,
    HealthSeverity,
    HealthStatus,
    MachineHealthDetailResponse,
    MachineHealthWarningResponse,
    MaintenanceObservationCreate,
    MaintenanceObservationResponse,
    SubScoreBreakdown,
    WarningType,
)


# Configurable baseline defaults
DEFAULT_BASELINE_TEMP_C = 65.0
CRITICAL_TEMP_C = 95.0
WARNING_TEMP_C = 85.0
WATCH_TEMP_C = 75.0

# Minimum data requirements for health scoring
MINIMUM_HEALTH_HISTORY_HOURS = 0.25
MINIMUM_HEALTH_TELEMETRY_SAMPLES = 30


class MachineHealthService:
    def __init__(
        self,
        machine_repository: MachineRepository,
        telemetry_repository: TelemetryRepository,
        health_repository: MachineHealthRepository,
    ) -> None:
        self._machine_repo = machine_repository
        self._telemetry_repo = telemetry_repository
        self._health_repo = health_repository

    # ------------------------------------------------------------------
    # Telemetry Feature Extraction
    # ------------------------------------------------------------------

    def _extract_telemetry_features(
        self, telemetry_records: list[Telemetry], machine: Machine
    ) -> dict[str, Any]:
        """Extract electrical, thermal, mechanical and state stability metrics from telemetry."""
        if not telemetry_records:
            return {
                "sample_count": 0,
                "coverage_hours": 0.0,
                "temperatures": [],
                "powers": [],
                "currents": [],
                "rpms": [],
                "states": [],
                "load_percentages": [],
            }

        sorted_records = sorted(telemetry_records, key=lambda r: r.timestamp)
        span_seconds = (sorted_records[-1].timestamp - sorted_records[0].timestamp).total_seconds()
        coverage_hours = max(0.0, span_seconds / 3600.0)

        powers = [r.active_power for r in sorted_records if r.active_power is not None]
        currents = [r.current for r in sorted_records if r.current is not None]
        temperatures = [r.temperature for r in sorted_records if r.temperature is not None]
        rpms = [r.rpm for r in sorted_records if r.rpm is not None]
        states = [r.operating_state for r in sorted_records if r.operating_state is not None]
        loads = [r.load_percentage for r in sorted_records if r.load_percentage is not None]

        # Power statistics & within-state CV
        power_mean = sum(powers) / len(powers) if powers else None
        power_std = None
        power_cv = None
        power_peak = max(powers) if powers else None
        if powers and power_mean and power_mean > 0.01:
            variance = sum((p - power_mean) ** 2 for p in powers) / len(powers)
            power_std = sqrt(variance)
            # Evaluate within-state CV when multiple operating states exist to avoid false alarms on normal state changes
            if sorted_records:
                state_cvs = []
                for st in set(states):
                    st_powers = [r.active_power for r in sorted_records if r.operating_state == st and r.active_power is not None]
                    if len(st_powers) >= 5:
                        st_mean = sum(st_powers) / len(st_powers)
                        if st_mean > 5.0:
                            st_var = sum((p - st_mean) ** 2 for p in st_powers) / len(st_powers)
                            state_cvs.append(sqrt(st_var) / st_mean)
                power_cv = max(state_cvs) if state_cvs else (power_std / power_mean)
            else:
                power_cv = power_std / power_mean

        # Current statistics & true electrical surges
        current_mean = sum(currents) / len(currents) if currents else None
        current_surges = 0
        if currents and current_mean and current_mean > 0.1:
            rated_kw = float(machine.rated_power_kw) if (machine and machine.rated_power_kw) else None
            rated_current_est = (rated_kw * 1.6) if rated_kw else (current_mean * 1.5)
            threshold_surge = max(current_mean * 1.6, rated_current_est * 1.25)
            current_surges = sum(1 for c in currents if c > threshold_surge)

        # Temperature statistics & drift
        temp_mean = sum(temperatures) / len(temperatures) if temperatures else None
        temp_max = max(temperatures) if temperatures else None
        temp_drift_rate = None
        if len(temperatures) >= 2 and coverage_hours > 0.05:
            # Drift in degrees per hour
            temp_drift_rate = (temperatures[-1] - temperatures[0]) / coverage_hours

        temp_critical_samples = sum(1 for t in temperatures if t >= CRITICAL_TEMP_C)
        temp_warning_samples = sum(1 for t in temperatures if t >= WARNING_TEMP_C)
        temp_watch_samples = sum(1 for t in temperatures if t >= WATCH_TEMP_C)

        # RPM statistics & slip
        rpm_mean = sum(rpms) / len(rpms) if rpms else None
        rpm_cv = None
        if rpms and rpm_mean and rpm_mean > 10.0:
            rpm_var = sum((r - rpm_mean) ** 2 for r in rpms) / len(rpms)
            rpm_cv = sqrt(rpm_var) / rpm_mean

        # State transition count (thrashing)
        state_transitions = 0
        for i in range(1, len(states)):
            if states[i] != states[i - 1]:
                state_transitions += 1

        transitions_per_hour = (
            (state_transitions / coverage_hours) if coverage_hours > 0.05 else float(state_transitions)
        )

        return {
            "sample_count": len(sorted_records),
            "coverage_hours": coverage_hours,
            "window_start": sorted_records[0].timestamp,
            "window_end": sorted_records[-1].timestamp,
            "power_mean": power_mean,
            "power_std": power_std,
            "power_cv": power_cv,
            "power_peak": power_peak,
            "current_mean": current_mean,
            "current_surges": current_surges,
            "temp_mean": temp_mean,
            "temp_max": temp_max,
            "temp_drift_rate": temp_drift_rate,
            "temp_samples_count": len(temperatures),
            "temp_critical_samples": temp_critical_samples,
            "temp_warning_samples": temp_warning_samples,
            "temp_watch_samples": temp_watch_samples,
            "rpm_mean": rpm_mean,
            "rpm_cv": rpm_cv,
            "rpm_samples_count": len(rpms),
            "state_transitions": state_transitions,
            "transitions_per_hour": transitions_per_hour,
            "states": states,
            "load_mean": sum(loads) / len(loads) if loads else None,
        }

    # ------------------------------------------------------------------
    # Deterministic Condition Monitoring Rules
    # ------------------------------------------------------------------

    def evaluate_condition_rules(
        self,
        machine: Machine,
        features: dict[str, Any],
        persist: bool = True,
    ) -> list[MachineHealthWarning]:
        """Evaluate deterministic rules against extracted telemetry features and persist new warnings."""
        warnings: list[MachineHealthWarning] = []
        now = datetime.now(timezone.utc)
        sample_count = features["sample_count"]

        if sample_count < 5:
            return []

        w_start = features.get("window_start", now - timedelta(hours=1))
        w_end = features.get("window_end", now)

        # Baseline running temperature for this machine
        baseline_temp = DEFAULT_BASELINE_TEMP_C

        # -------------------------------------------------------------
        # Rule 1: Sustained High Temperature / Thermal Drift
        # -------------------------------------------------------------
        temp_mean = features.get("temp_mean")
        temp_max = features.get("temp_max")
        temp_drift = features.get("temp_drift_rate")
        temp_samples = features.get("temp_samples_count", 0)

        if temp_samples >= 10 and temp_mean is not None:
            delta_t = temp_mean - baseline_temp
            severity: HealthSeverity | None = None
            rationale = ""
            action = ""
            critical_samples = features.get("temp_critical_samples", 0)
            warning_samples = features.get("temp_warning_samples", 0)
            watch_samples = features.get("temp_watch_samples", 0)

            if delta_t >= 30.0 or critical_samples >= 3 or (temp_drift and temp_drift >= 15.0 and temp_mean >= WARNING_TEMP_C):
                severity = HealthSeverity.CRITICAL
                rationale = (
                    f"Observed mean temperature {temp_mean:.1f}°C exceeds baseline ({baseline_temp:.1f}°C) by "
                    f"{delta_t:.1f}°C (peak {temp_max:.1f}°C, {critical_samples} critical samples), indicating severe thermal saturation."
                )
                action = (
                    "Inspect motor cooling fans, ventilation cowls, and heat exchange fins immediately. "
                    "Check bearing lubricant for degradation or contamination."
                )
            elif delta_t >= 20.0 or warning_samples >= 5:
                severity = HealthSeverity.WARNING
                rationale = (
                    f"Observed mean temperature {temp_mean:.1f}°C exceeds baseline by {delta_t:.1f}°C. "
                    f"Thermal margin is compressed above warning threshold ({WARNING_TEMP_C:.1f}°C)."
                )
                action = (
                    "Schedule inspection of cooling airflow ducts and ambient ventilation. "
                    "Verify motor terminal box connections."
                )
            elif delta_t >= 12.0 or watch_samples >= 10:
                severity = HealthSeverity.WATCH
                rationale = (
                    f"Observed mean temperature {temp_mean:.1f}°C is elevated ({delta_t:.1f}°C above baseline), "
                    "warranting increased condition monitoring."
                )
                action = "Clean exterior dust accumulation on motor casing during next planned downtime."

            if severity:
                warning = self._build_or_update_warning(
                    machine_id=machine.id,
                    warning_type=WarningType.TEMPERATURE_HIGH_SUSTAINED.value,
                    severity=severity.value,
                    detected_at=now,
                    window_start=w_start,
                    window_end=w_end,
                    observed_value=round(temp_mean, 2),
                    baseline_value=baseline_temp,
                    threshold_value=WATCH_TEMP_C if severity == HealthSeverity.WATCH else (WARNING_TEMP_C if severity == HealthSeverity.WARNING else CRITICAL_TEMP_C),
                    unit="°C",
                    severity_rationale=rationale,
                    telemetry_evidence={
                        "temp_mean_c": round(temp_mean, 2),
                        "temp_max_c": round(temp_max, 2) if temp_max else None,
                        "temp_drift_rate_c_per_hr": round(temp_drift, 2) if temp_drift else None,
                        "sample_count": temp_samples,
                        "delta_c": round(delta_t, 2),
                    },
                    confidence_score=0.92,
                    data_quality="HIGH",
                    recommended_action=action,
                    persist=persist,
                )
                warnings.append(warning)

        # -------------------------------------------------------------
        # Rule 2: Abnormal Electrical Behaviour / Power Volatility
        # -------------------------------------------------------------
        power_cv = features.get("power_cv")
        power_mean = features.get("power_mean")
        power_peak = features.get("power_peak")
        current_surges = features.get("current_surges", 0)

        rated_kw = float(machine.rated_power_kw) if (machine and machine.rated_power_kw) else None
        is_overload = rated_kw is not None and power_mean is not None and power_mean > 1.05 * rated_kw

        if power_mean is not None and power_mean > 5.0:
            severity = None
            rationale = ""
            action = ""

            if (power_cv is not None and power_cv >= 0.45) or current_surges >= 20:
                severity = HealthSeverity.CRITICAL
                rationale = (
                    f"Active power coefficient of variation (CV={power_cv:.2f}) and surge count ({current_surges}) "
                    f"indicate severe electrical instability or mechanical binding."
                )
                action = (
                    "Inspect driven mechanical transmission for binding, jamming, or erratic material feed. "
                    "Verify line current balance across phases."
                )
            elif (power_cv is not None and power_cv >= 0.30) or current_surges >= 10:
                severity = HealthSeverity.WARNING
                rationale = (
                    f"Elevated active power fluctuation (CV={power_cv:.2f}, surges={current_surges}) "
                    f"above stable running envelope."
                )
                action = (
                    "Check electrical feeder connections, breaker contacts, and load consistency."
                )
            elif (power_cv is not None and power_cv >= 0.18) or current_surges >= 5 or is_overload:
                if is_overload:
                    severity = HealthSeverity.WARNING
                    rationale = (
                        f"Continuous active power ({power_mean:.1f} kW) exceeds machine continuous nameplate rating "
                        f"({rated_kw:.1f} kW) by {power_mean - rated_kw:.1f} kW."
                    )
                    action = "Inspect material feed rate and mechanical drive to prevent motor thermal breakdown."
                else:
                    severity = HealthSeverity.WATCH
                    rationale = (
                        f"Moderate power fluctuation detected (CV={power_cv:.2f}, surges={current_surges})."
                    )
                    action = "Review conveyor / crusher feed rate regularity to ensure steady-state loading."

            if severity:
                warning = self._build_or_update_warning(
                    machine_id=machine.id,
                    warning_type=WarningType.POWER_FLUCTUATION.value,
                    severity=severity.value,
                    detected_at=now,
                    window_start=w_start,
                    window_end=w_end,
                    observed_value=round(power_cv, 4),
                    baseline_value=0.08,
                    threshold_value=0.18 if severity == HealthSeverity.WATCH else (0.30 if severity == HealthSeverity.WARNING else 0.45),
                    unit="CV",
                    severity_rationale=rationale,
                    telemetry_evidence={
                        "power_mean_kw": round(power_mean, 2),
                        "power_std_kw": round(features.get("power_std") or 0.0, 2),
                        "power_cv": round(power_cv, 4),
                        "power_peak_kw": round(power_peak, 2) if power_peak else None,
                        "current_surges": current_surges,
                    },
                    confidence_score=0.90,
                    data_quality="HIGH",
                    recommended_action=action,
                    persist=persist,
                )
                warnings.append(warning)

        # -------------------------------------------------------------
        # Rule 3: RPM Instability
        # -------------------------------------------------------------
        rpm_cv = features.get("rpm_cv")
        rpm_mean = features.get("rpm_mean")
        rpm_samples = features.get("rpm_samples_count", 0)

        if rpm_samples >= 10 and rpm_cv is not None and rpm_mean is not None:
            severity = None
            rationale = ""
            action = ""

            if rpm_cv >= 0.15:
                severity = HealthSeverity.CRITICAL
                rationale = f"RPM fluctuation (CV={rpm_cv:.3f}) exceeds critical stability limits."
                action = "Inspect drive pulleys, belt tension, and mechanical gearbox backlash."
            elif rpm_cv >= 0.08:
                severity = HealthSeverity.WARNING
                rationale = f"RPM variation (CV={rpm_cv:.3f}) indicates belt slip or load fluctuation."
                action = "Check V-belt tension and alignment; inspect encoder sensor mounting."
            elif rpm_cv >= 0.04:
                severity = HealthSeverity.WATCH
                rationale = f"Mild RPM jitter detected (CV={rpm_cv:.3f})."
                action = "Inspect tachometer mounting and motor speed control loop."

            if severity:
                warning = self._build_or_update_warning(
                    machine_id=machine.id,
                    warning_type=WarningType.RPM_FLUCTUATION_OR_SLIP.value,
                    severity=severity.value,
                    detected_at=now,
                    window_start=w_start,
                    window_end=w_end,
                    observed_value=round(rpm_cv, 4),
                    baseline_value=0.015,
                    threshold_value=0.04 if severity == HealthSeverity.WATCH else (0.08 if severity == HealthSeverity.WARNING else 0.15),
                    unit="CV",
                    severity_rationale=rationale,
                    telemetry_evidence={
                        "rpm_mean": round(rpm_mean, 1),
                        "rpm_cv": round(rpm_cv, 4),
                        "sample_count": rpm_samples,
                    },
                    confidence_score=0.88,
                    data_quality="MEDIUM",
                    recommended_action=action,
                    persist=persist,
                )
                warnings.append(warning)

        # -------------------------------------------------------------
        # Rule 4: Operating State Thrashing / Cycling
        # -------------------------------------------------------------
        trans_per_hr = features.get("transitions_per_hour", 0.0)
        total_trans = features.get("state_transitions", 0)

        if total_trans >= 4:
            severity = None
            rationale = ""
            action = ""

            if trans_per_hr >= 20.0:
                severity = HealthSeverity.CRITICAL
                rationale = f"High frequency state thrashing detected ({trans_per_hr:.1f} transitions/hr; total {total_trans})."
                action = "Inspect process automation interlocks, level switches, and stop-start sequencing."
            elif trans_per_hr >= 10.0:
                severity = HealthSeverity.WARNING
                rationale = f"Elevated state cycling rate ({trans_per_hr:.1f} transitions/hr; total {total_trans})."
                action = "Adjust operational control deadbands to prevent short-cycling."
            elif trans_per_hr >= 5.0:
                severity = HealthSeverity.WATCH
                rationale = f"Noticeable state switching rate ({trans_per_hr:.1f} transitions/hr)."
                action = "Verify automated hopper feed sensor thresholds."

            if severity:
                warning = self._build_or_update_warning(
                    machine_id=machine.id,
                    warning_type=WarningType.STATE_THRASHING.value,
                    severity=severity.value,
                    detected_at=now,
                    window_start=w_start,
                    window_end=w_end,
                    observed_value=round(trans_per_hr, 1),
                    baseline_value=1.0,
                    threshold_value=5.0 if severity == HealthSeverity.WATCH else (10.0 if severity == HealthSeverity.WARNING else 20.0),
                    unit="trans/hr",
                    severity_rationale=rationale,
                    telemetry_evidence={
                        "total_transitions": total_trans,
                        "transitions_per_hour": round(trans_per_hr, 1),
                        "sample_count": sample_count,
                    },
                    confidence_score=0.95,
                    data_quality="HIGH",
                    recommended_action=action,
                    persist=persist,
                )
                warnings.append(warning)

        # -------------------------------------------------------------
        # Rule 5: Vibration Anomaly
        # Unmeasured: Physical accelerometer not retrofitted in standard Modbus meter
        # -------------------------------------------------------------

        return warnings

    def _build_or_update_warning(
        self,
        machine_id: UUID,
        warning_type: str,
        severity: str,
        detected_at: datetime,
        window_start: datetime,
        window_end: datetime,
        observed_value: float,
        baseline_value: float | None,
        threshold_value: float | None,
        unit: str,
        severity_rationale: str,
        telemetry_evidence: dict[str, Any],
        confidence_score: float,
        data_quality: str,
        recommended_action: str,
        persist: bool = True,
    ) -> MachineHealthWarning:
        """Create a new warning or idempotently refresh an existing active warning."""
        if persist:
            existing = self._health_repo.get_active_warning(machine_id, warning_type)
            if existing:
                existing.severity = severity
                existing.detected_at = detected_at
                existing.window_start = window_start
                existing.window_end = window_end
                existing.observed_value = observed_value
                existing.baseline_value = baseline_value
                existing.threshold_value = threshold_value
                existing.unit = unit
                existing.severity_rationale = severity_rationale
                existing.telemetry_evidence = telemetry_evidence
                existing.confidence_score = confidence_score
                existing.data_quality = data_quality
                existing.recommended_action = recommended_action
                return self._health_repo.update_warning(existing)

        new_warning = MachineHealthWarning(
            machine_id=machine_id,
            warning_type=warning_type,
            severity=severity,
            status="open",
            detected_at=detected_at,
            window_start=window_start,
            window_end=window_end,
            observed_value=observed_value,
            baseline_value=baseline_value,
            threshold_value=threshold_value,
            unit=unit,
            severity_rationale=severity_rationale,
            telemetry_evidence=telemetry_evidence,
            confidence_score=confidence_score,
            data_quality=data_quality,
            recommended_action=recommended_action,
        )
        if persist:
            return self._health_repo.create_warning(new_warning)
        return new_warning

    # ------------------------------------------------------------------
    # Explainable Health Scoring
    # ------------------------------------------------------------------

    def calculate_health_score(
        self,
        features: dict[str, Any],
        active_warnings: list[MachineHealthWarning],
    ) -> tuple[float | None, HealthStatus, SubScoreBreakdown, str | None]:
        """Compute transparent machine health score (0-100) or return INSUFFICIENT_DATA."""
        sample_count = features["sample_count"]
        coverage_hours = features["coverage_hours"]

        # Minimum data coverage check
        if sample_count < MINIMUM_HEALTH_TELEMETRY_SAMPLES or coverage_hours < MINIMUM_HEALTH_HISTORY_HOURS:
            reason = (
                f"Insufficient historical telemetry: {coverage_hours:.1f} hours and {sample_count} samples available. "
                f"Minimum required is {MINIMUM_HEALTH_HISTORY_HOURS:.1f} hours and {MINIMUM_HEALTH_TELEMETRY_SAMPLES} samples."
            )
            return None, HealthStatus.INSUFFICIENT_DATA, SubScoreBreakdown(), reason

        # Nominal feature weights
        weights: dict[str, float] = {}
        sub_scores: dict[str, float | None] = {}

        # 1. Electrical Stability Score (Nominal weight 35%)
        power_cv = features.get("power_cv")
        surges = features.get("current_surges", 0)
        if power_cv is not None:
            elec_score = 100.0 - (power_cv * 120.0) - (min(surges, 20) * 1.5)
            elec_score = max(10.0, min(100.0, elec_score))
            sub_scores["electrical_stability"] = round(elec_score, 1)
            weights["electrical_stability"] = 0.35
        else:
            sub_scores["electrical_stability"] = None

        # 2. Thermal Margin Score (Nominal weight 25%)
        temp_mean = features.get("temp_mean")
        if temp_mean is not None and features.get("temp_samples_count", 0) >= 10:
            delta_t = max(0.0, temp_mean - DEFAULT_BASELINE_TEMP_C)
            thermal_score = 100.0 - (delta_t * 2.5)
            if features.get("temp_max") and features["temp_max"] > WARNING_TEMP_C:
                thermal_score -= 15.0
            thermal_score = max(10.0, min(100.0, thermal_score))
            sub_scores["thermal_margin"] = round(thermal_score, 1)
            weights["thermal_margin"] = 0.25
        else:
            sub_scores["thermal_margin"] = None

        # 3. Operational Consistency (Nominal weight 25%)
        load_mean = features.get("load_mean")
        power_mean = features.get("power_mean")
        if load_mean is not None and power_mean is not None:
            ops_score = 95.0
            if power_cv is not None and power_cv > 0.25:
                ops_score -= 20.0
            sub_scores["operational_consistency"] = round(ops_score, 1)
            weights["operational_consistency"] = 0.25
        else:
            sub_scores["operational_consistency"] = 90.0
            weights["operational_consistency"] = 0.25

        # 4. State Stability Score (Nominal weight 15%)
        trans_per_hr = features.get("transitions_per_hour", 0.0)
        state_score = max(15.0, min(100.0, 100.0 - (trans_per_hr * 4.0)))
        sub_scores["state_stability"] = round(state_score, 1)
        weights["state_stability"] = 0.15

        # Dynamically normalize weights for measured channels
        total_weight = sum(weights.values())
        if total_weight <= 0:
            return None, HealthStatus.INSUFFICIENT_DATA, SubScoreBreakdown(), "No valid channel measurements available."

        normalized_weights = {k: v / total_weight for k, v in weights.items()}

        raw_score = sum(sub_scores[k] * normalized_weights[k] for k in weights)

        # Cap based on active warnings
        worst_severity = None
        for w in active_warnings:
            if w.status in ["open", "acknowledged"]:
                if w.severity == HealthSeverity.CRITICAL.value:
                    worst_severity = HealthSeverity.CRITICAL
                    break
                elif w.severity == HealthSeverity.WARNING.value and worst_severity != HealthSeverity.CRITICAL:
                    worst_severity = HealthSeverity.WARNING
                elif w.severity == HealthSeverity.WATCH.value and worst_severity is None:
                    worst_severity = HealthSeverity.WATCH

        composite_score = raw_score
        if worst_severity == HealthSeverity.CRITICAL:
            composite_score = min(raw_score, 40.0)
        elif worst_severity == HealthSeverity.WARNING:
            composite_score = min(raw_score, 68.0)
        elif worst_severity == HealthSeverity.WATCH:
            composite_score = min(raw_score, 84.0)

        composite_score = round(max(0.0, min(100.0, composite_score)), 1)

        # Map to status
        if composite_score >= 85.0:
            status = HealthStatus.HEALTHY
        elif composite_score >= 70.0:
            status = HealthStatus.WATCH
        elif composite_score >= 50.0:
            status = HealthStatus.WARNING
        else:
            status = HealthStatus.CRITICAL

        breakdown = SubScoreBreakdown(
            electrical_stability=sub_scores["electrical_stability"],
            thermal_margin=sub_scores["thermal_margin"],
            operational_consistency=sub_scores["operational_consistency"],
            state_stability=sub_scores["state_stability"],
            weights_applied={k: round(v, 3) for k, v in normalized_weights.items()},
        )

        return composite_score, status, breakdown, None

    # ------------------------------------------------------------------
    # High-Level Service Methods
    # ------------------------------------------------------------------

    def get_machine_health_detail(
        self,
        machine_id: UUID,
        window_hours: float = 24.0,
        persist_rules: bool = True,
    ) -> MachineHealthDetailResponse | None:
        """Get machine health diagnosis, active warnings, channel coverage, and recent observations."""
        machine = self._machine_repo.get_by_id(machine_id)
        if machine is None:
            return None

        now = datetime.now(timezone.utc)
        start_time = now - timedelta(hours=window_hours)
        telemetry = self._telemetry_repo.get_all_in_range(machine_id, start_time, now)

        features = self._extract_telemetry_features(telemetry, machine)

        # Run condition monitoring rules and persist warnings if requested
        self.evaluate_condition_rules(machine, features, persist=persist_rules)

        # Query active warnings and observations
        warnings = self._health_repo.list_warnings_for_machine(machine_id)
        active_warnings = [w for w in warnings if w.status in ["open", "acknowledged"]]
        observations = self._health_repo.list_observations_for_machine(machine_id, limit=20)

        score, status, sub_scores, reason = self.calculate_health_score(features, active_warnings)

        # Channel coverage summary
        channels = [
            ChannelCoverageReport(
                channel_name="3-Phase Electrical (V, I, P, Q, PF)",
                status=ChannelStatus.ACTIVE_HARDWARE,
                sample_count=len([r for r in telemetry if r.active_power is not None]),
                description="Measured via Eastron SDM630 / 3-phase power meter over Modbus RTU.",
            ),
            ChannelCoverageReport(
                channel_name="Winding/Bearing Temperature",
                status=ChannelStatus.AUXILIARY_SIMULATED if any(r.temperature is not None for r in telemetry) else ChannelStatus.UNMEASURED_NOT_INSTALLED,
                sample_count=len([r for r in telemetry if r.temperature is not None]),
                description="Requires external RTD/PT100 sensor adapter; currently simulated or unmeasured.",
            ),
            ChannelCoverageReport(
                channel_name="Rotational Speed (RPM)",
                status=ChannelStatus.AUXILIARY_SIMULATED if any(r.rpm is not None for r in telemetry) else ChannelStatus.UNMEASURED_NOT_INSTALLED,
                sample_count=len([r for r in telemetry if r.rpm is not None]),
                description="Requires optical/magnetic tachometer; currently simulated or unmeasured.",
            ),
            ChannelCoverageReport(
                channel_name="Vibration (ISO 10816-3 RMS)",
                status=ChannelStatus.UNMEASURED_NOT_INSTALLED,
                sample_count=0,
                description="Requires retrofit tri-axial piezo accelerometer hardware. Channel unmeasured in current deployment.",
            ),
        ]

        warning_responses = [
            MachineHealthWarningResponse(
                id=w.id,
                machine_id=w.machine_id,
                machine_name=machine.name,
                warning_type=w.warning_type,
                severity=HealthSeverity(w.severity),
                status=w.status,
                detected_at=w.detected_at,
                window_start=w.window_start,
                window_end=w.window_end,
                observed_value=w.observed_value,
                baseline_value=w.baseline_value,
                threshold_value=w.threshold_value,
                unit=w.unit,
                severity_rationale=w.severity_rationale,
                telemetry_evidence=w.telemetry_evidence,
                confidence_score=w.confidence_score,
                data_quality=w.data_quality,
                recommended_action=w.recommended_action,
                acknowledged_at=w.acknowledged_at,
                acknowledged_by=w.acknowledged_by,
                resolved_at=w.resolved_at,
                created_at=w.created_at or datetime.now(timezone.utc),
            )
            for w in active_warnings
        ]

        obs_responses = [
            MaintenanceObservationResponse(
                id=o.id,
                machine_id=o.machine_id,
                machine_name=machine.name,
                warning_id=o.warning_id,
                inspector_name=o.inspector_name,
                inspection_date=o.inspection_date,
                suspected_issue=o.suspected_issue,
                corrective_action=o.corrective_action,
                status=o.status,
                notes=o.notes,
                created_at=o.created_at or datetime.now(timezone.utc),
            )
            for o in observations
        ]

        return MachineHealthDetailResponse(
            machine_id=machine.id,
            machine_name=machine.name,
            machine_type=machine.machine_type,
            rated_power_kw=float(machine.rated_power_kw) if machine.rated_power_kw is not None else None,
            health_score=score,
            health_status=status,
            sub_scores=sub_scores,
            channels=channels,
            data_coverage_hours=features["coverage_hours"],
            telemetry_sample_count=features["sample_count"],
            insufficient_data_reason=reason,
            active_warnings=warning_responses,
            recent_observations=obs_responses,
        )

    def get_fleet_health_summary(self) -> FleetHealthSummaryResponse:
        """Fleet-wide machine health overview, health distribution, and active warning tally."""
        machines, _ = self._machine_repo.list_machines(limit=200)
        now = datetime.now(timezone.utc)

        status_counts = {
            HealthStatus.HEALTHY.value: 0,
            HealthStatus.WATCH.value: 0,
            HealthStatus.WARNING.value: 0,
            HealthStatus.CRITICAL.value: 0,
            HealthStatus.INSUFFICIENT_DATA.value: 0,
        }

        severity_counts = {
            HealthSeverity.NORMAL.value: 0,
            HealthSeverity.WATCH.value: 0,
            HealthSeverity.WARNING.value: 0,
            HealthSeverity.CRITICAL.value: 0,
        }

        health_scores: list[float] = []

        for m in machines:
            detail = self.get_machine_health_detail(m.id, window_hours=24.0, persist_rules=False)
            if detail:
                status_counts[detail.health_status.value] += 1
                if detail.health_score is not None:
                    health_scores.append(detail.health_score)
                for w in detail.active_warnings:
                    severity_counts[w.severity.value] += 1

        fleet_avg = round(sum(health_scores) / len(health_scores), 1) if health_scores else None
        active_warnings_count = sum(severity_counts.values()) - severity_counts[HealthSeverity.NORMAL.value]
        recent_obs_count = len(self._health_repo.list_all_observations(limit=100))

        return FleetHealthSummaryResponse(
            fleet_health_score=fleet_avg,
            total_machines_monitored=len(machines),
            status_breakdown=status_counts,
            active_warnings_count=active_warnings_count,
            active_warnings_by_severity={
                "WATCH": severity_counts["WATCH"],
                "WARNING": severity_counts["WARNING"],
                "CRITICAL": severity_counts["CRITICAL"],
            },
            unmeasured_channels=[
                "Vibration (ISO 10816-3 RMS velocity): Requires retrofitted high-frequency accelerometer.",
            ],
            recent_observations_count=recent_obs_count,
            last_evaluated_at=now,
        )

    # ------------------------------------------------------------------
    # Maintenance Observation & Warning Actions
    # ------------------------------------------------------------------

    def list_warnings(
        self,
        machine_id: UUID | None = None,
        severity: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[MachineHealthWarningResponse]:
        warnings = self._health_repo.list_fleet_warnings(
            machine_id=machine_id,
            severity=severity,
            status=status,
            limit=limit,
            offset=offset,
        )
        return [
            MachineHealthWarningResponse(
                id=w.id,
                machine_id=w.machine_id,
                machine_name=w.machine.name if w.machine else None,
                warning_type=w.warning_type,
                severity=HealthSeverity(w.severity),
                status=w.status,
                detected_at=w.detected_at,
                window_start=w.window_start,
                window_end=w.window_end,
                observed_value=w.observed_value,
                baseline_value=w.baseline_value,
                threshold_value=w.threshold_value,
                unit=w.unit,
                severity_rationale=w.severity_rationale,
                telemetry_evidence=w.telemetry_evidence,
                confidence_score=w.confidence_score,
                data_quality=w.data_quality,
                recommended_action=w.recommended_action,
                acknowledged_at=w.acknowledged_at,
                acknowledged_by=w.acknowledged_by,
                resolved_at=w.resolved_at,
                created_at=w.created_at or datetime.now(timezone.utc),
            )
            for w in warnings
        ]

    def acknowledge_warning(
        self,
        warning_id: UUID,
        acknowledged_by: str,
        notes: str | None = None,
    ) -> MachineHealthWarningResponse | None:
        warning = self._health_repo.acknowledge_warning(warning_id, acknowledged_by, notes)
        if warning is None:
            return None
        return MachineHealthWarningResponse(
            id=warning.id,
            machine_id=warning.machine_id,
            machine_name=warning.machine.name if warning.machine else None,
            warning_type=warning.warning_type,
            severity=HealthSeverity(warning.severity),
            status=warning.status,
            detected_at=warning.detected_at,
            window_start=warning.window_start,
            window_end=warning.window_end,
            observed_value=warning.observed_value,
            baseline_value=warning.baseline_value,
            threshold_value=warning.threshold_value,
            unit=warning.unit,
            severity_rationale=warning.severity_rationale,
            telemetry_evidence=warning.telemetry_evidence,
            confidence_score=warning.confidence_score,
            data_quality=warning.data_quality,
            recommended_action=warning.recommended_action,
            acknowledged_at=warning.acknowledged_at,
            acknowledged_by=warning.acknowledged_by,
            resolved_at=warning.resolved_at,
            created_at=warning.created_at or datetime.now(timezone.utc),
        )

    def create_observation(
        self,
        payload: MaintenanceObservationCreate,
    ) -> MaintenanceObservationResponse:
        machine = self._machine_repo.get_by_id(payload.machine_id)
        if machine is None:
            raise ValueError(f"Machine with id {payload.machine_id} does not exist.")

        observation = MaintenanceObservation(
            machine_id=payload.machine_id,
            warning_id=payload.warning_id,
            inspector_name=payload.inspector_name,
            inspection_date=payload.inspection_date,
            suspected_issue=payload.suspected_issue,
            corrective_action=payload.corrective_action,
            status=payload.status,
            notes=payload.notes,
        )
        saved = self._health_repo.create_observation(observation)

        # If observation is resolved and linked to a warning, resolve warning
        if payload.status == "resolved" and payload.warning_id:
            self._health_repo.resolve_warning(payload.warning_id)

        return MaintenanceObservationResponse(
            id=saved.id,
            machine_id=saved.machine_id,
            machine_name=machine.name,
            warning_id=saved.warning_id,
            inspector_name=saved.inspector_name,
            inspection_date=saved.inspection_date,
            suspected_issue=saved.suspected_issue,
            corrective_action=saved.corrective_action,
            status=saved.status,
            notes=saved.notes,
            created_at=saved.created_at or datetime.now(timezone.utc),
        )
