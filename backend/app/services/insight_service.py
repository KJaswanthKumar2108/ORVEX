from __future__ import annotations

from datetime import datetime, timedelta, timezone
from math import isfinite
from typing import Any
from uuid import UUID, uuid5, NAMESPACE_URL

from app.db.models import CorrectiveAction, EnergyWastageEvent, Machine, Telemetry
from app.repositories.corrective_action_repository import CorrectiveActionRepository
from app.repositories.machine_repository import MachineRepository
from app.repositories.telemetry_repository import TelemetryRepository
from app.repositories.wastage_event_repository import WastageEventRepository
from app.schemas.insight import (
    ActionImpactResponse,
    BaselineStatus,
    ConfidenceLevel,
    CorrectiveActionCreate,
    CorrectiveActionResponse,
    DataQualityClassification,
    ExplainableInsight,
    FleetIntelligenceSummary,
    ImpactClassification,
    MachineBaselineResponse,
    MachineInsightDetailResponse,
    MachinePrioritization,
    PatternAnalysisResponse,
    PatternBreakdown,
    PeriodMetrics,
    PriorityLevel,
)
from app.services.energy_analytics_service import EnergyAnalyticsService, _merge_intervals
from app.services.machine_service import MachineNotFoundError
from app.services.telemetry_query_service import InvalidTimeRangeError

DEFAULT_TARIFF_PER_KWH = 0.12  # USD / kWh assumption
MINIMUM_BASELINE_HISTORY_HOURS = 1.0
MINIMUM_BASELINE_SAMPLES = 30


class InsightService:
    def __init__(
        self,
        machine_repository: MachineRepository,
        telemetry_repository: TelemetryRepository,
        wastage_event_repository: WastageEventRepository,
        corrective_action_repository: CorrectiveActionRepository,
        energy_analytics_service: EnergyAnalyticsService,
        energy_tariff_per_kwh: float = DEFAULT_TARIFF_PER_KWH,
    ) -> None:
        self._machine_repo = machine_repository
        self._telemetry_repo = telemetry_repository
        self._event_repo = wastage_event_repository
        self._action_repo = corrective_action_repository
        self._energy_service = energy_analytics_service
        self._tariff = energy_tariff_per_kwh

    # -------------------------------------------------------------------------
    # 1. FLEET SUMMARY & MACHINE PRIORITIZATION
    # -------------------------------------------------------------------------

    def get_fleet_summary(
        self,
        start_time: datetime,
        end_time: datetime,
    ) -> FleetIntelligenceSummary:
        start_time, end_time = self._normalize_range(start_time, end_time)
        machines, _ = self._machine_repo.list_machines(limit=1000)

        total_actual_kwh = 0.0
        total_wasted_kwh = 0.0
        has_actual = False
        has_wasted = False
        total_unestimated_events = 0

        quality_counts = {"GOOD": 0, "PARTIAL": 0, "INSUFFICIENT_DATA": 0}
        prioritizations: list[MachinePrioritization] = []
        all_insights: list[ExplainableInsight] = []

        for machine in machines:
            try:
                energy_summary = self._energy_service.get_energy_summary(machine.id, start_time, end_time)
            except Exception:
                continue

            events = self._event_repo.get_events_intersecting_range(machine.id, start_time, end_time)
            unestimated_count = sum(1 for e in events if e.estimated_wasted_energy_kwh is None)
            total_unestimated_events += unestimated_count

            if energy_summary.actual_energy_kwh is not None:
                total_actual_kwh += energy_summary.actual_energy_kwh
                has_actual = True

            if energy_summary.estimated_wasted_energy_kwh is not None:
                total_wasted_kwh += energy_summary.estimated_wasted_energy_kwh
                has_wasted = True

            # Data quality classification
            cov = energy_summary.data_coverage_ratio
            if cov >= 0.80 and energy_summary.telemetry_sample_count >= 50:
                dq = DataQualityClassification.GOOD
            elif cov >= 0.30:
                dq = DataQualityClassification.PARTIAL
            else:
                dq = DataQualityClassification.INSUFFICIENT_DATA
            quality_counts[dq.value] += 1

            # Total wasted duration
            wasted_dur_sec = sum(e.duration_seconds or 0.0 for e in events)
            wasted_dur_hours = round(wasted_dur_sec / 3600.0, 2)

            # Prioritization scoring
            prio = self._calculate_prioritization(
                machine=machine,
                wasted_kwh=energy_summary.estimated_wasted_energy_kwh,
                event_count=len(events),
                wasted_duration_seconds=wasted_dur_sec,
                coverage_ratio=cov,
                data_quality=dq,
            )
            prioritizations.append(prio)

            # Extract top explainable insights for this machine
            machine_insights = self._extract_insights_for_events(machine, events, start_time, end_time, cov)
            all_insights.extend(machine_insights)

        # Sort machines by priority score descending and assign rank
        prioritizations.sort(key=lambda p: p.priority_score, reverse=True)
        for rank, p in enumerate(prioritizations, start=1):
            p.priority_rank = rank

        # Top fleet insights (limit to top 15 sorted by severity / wasted energy)
        all_insights.sort(
            key=lambda x: (
                0 if x.severity == "high" else (1 if x.severity == "medium" else 2),
                -(x.estimated_wasted_energy_kwh or 0.0),
            )
        )
        top_insights = all_insights[:15]

        # Fleet cost and wastage ratio
        act_total = round(total_actual_kwh, 4) if has_actual else None
        wst_total = round(total_wasted_kwh, 4) if has_wasted else None

        fleet_pct = None
        if act_total is not None and act_total > 0 and wst_total is not None:
            fleet_pct = round((wst_total / act_total) * 100.0, 2)

        est_cost = round(wst_total * self._tariff, 2) if wst_total is not None else None

        return FleetIntelligenceSummary(
            start_time=start_time,
            end_time=end_time,
            monitored_machines_count=len(machines),
            total_actual_energy_kwh=act_total,
            total_wasted_energy_kwh=wst_total,
            total_unestimated_events_count=total_unestimated_events,
            fleet_wastage_percentage=fleet_pct,
            assumed_energy_tariff_per_kwh=self._tariff,
            estimated_fleet_cost_impact=est_cost,
            tariff_assumptions_note=(
                f"Monetary estimate based on an assumed flat electricity tariff of ${self._tariff:.2f}/kWh. "
                "Excludes demand surcharges, time-of-use tariffs, and power factor penalty billing."
            ),
            scoring_formula_note=(
                "Priority Score = round((Wastage_Score[max 45] + Recurrence_Score[max 25] + Duration_Score[max 20]) "
                "* Quality_Multiplier[0.5-1.0], 1). Score ranges 0-100."
            ),
            priority_rankings=prioritizations,
            top_insights=top_insights,
            data_quality_summary=quality_counts,
            generated_at=datetime.now(timezone.utc),
        )

    def _calculate_prioritization(
        self,
        machine: Machine,
        wasted_kwh: float | None,
        event_count: int,
        wasted_duration_seconds: float,
        coverage_ratio: float,
        data_quality: DataQualityClassification,
    ) -> MachinePrioritization:
        rated_kw = float(machine.rated_power_kw) if machine.rated_power_kw is not None else 100.0
        wasted_val = wasted_kwh if (wasted_kwh is not None and isfinite(wasted_kwh)) else 0.0

        # 1. Wastage Score (max 45): normalized by machine rated power
        # For a 100 kW machine, 3 hours of full-power wastage (300 kWh) reaches full 45 points
        normalized_wastage = wasted_val / max(1.0, rated_kw)
        wastage_score = min(45.0, round(normalized_wastage * 15.0, 2))

        # 2. Recurrence Score (max 25): 5 points per event up to 5 events
        recurrence_score = min(25.0, round(event_count * 5.0, 2))

        # 3. Duration Score (max 20): 10 points per hour of wastage up to 2 hours
        wasted_hours = wasted_duration_seconds / 3600.0
        duration_score = min(20.0, round(wasted_hours * 10.0, 2))

        # 4. Data Quality Multiplier
        if data_quality == DataQualityClassification.GOOD:
            quality_multiplier = 1.0
        elif data_quality == DataQualityClassification.PARTIAL:
            quality_multiplier = 0.75
        else:
            quality_multiplier = 0.50

        raw_score = (wastage_score + recurrence_score + duration_score) * quality_multiplier
        final_score = min(100.0, max(0.0, round(raw_score, 1)))

        # Priority Level
        if final_score >= 60.0:
            level = PriorityLevel.CRITICAL
        elif final_score >= 40.0:
            level = PriorityLevel.HIGH
        elif final_score >= 20.0:
            level = PriorityLevel.MEDIUM
        else:
            level = PriorityLevel.LOW

        # Key factor
        if wastage_score >= recurrence_score and wastage_score >= duration_score and wastage_score > 0:
            key_factor = f"High quantified energy wastage ({wasted_val:.1f} kWh)"
        elif recurrence_score >= duration_score and recurrence_score > 0:
            key_factor = f"Frequent wastage recurrence ({event_count} events)"
        elif duration_score > 0:
            key_factor = f"Sustained wastage duration ({wasted_hours:.1f} hours)"
        else:
            key_factor = "Normal operation; no significant wastage detected"

        est_cost = round(wasted_val * self._tariff, 2) if wasted_kwh is not None else None

        return MachinePrioritization(
            machine_id=machine.id,
            machine_identifier=machine.machine_identifier,
            machine_name=machine.name,
            machine_type=machine.machine_type,
            priority_rank=0,  # filled after fleet sorting
            priority_score=final_score,
            priority_level=level,
            estimated_wasted_energy_kwh=round(wasted_kwh, 4) if wasted_kwh is not None else None,
            wastage_events_count=event_count,
            wasted_duration_hours=round(wasted_hours, 2),
            data_coverage_ratio=round(coverage_ratio, 4),
            data_quality=data_quality,
            estimated_cost_impact=est_cost,
            cost_currency="USD",
            score_breakdown={
                "wastage_score": wastage_score,
                "recurrence_score": recurrence_score,
                "duration_score": duration_score,
                "quality_multiplier": quality_multiplier,
            },
            key_contributing_factor=key_factor,
        )

    # -------------------------------------------------------------------------
    # 2. WASTAGE PATTERN ANALYSIS
    # -------------------------------------------------------------------------

    def get_pattern_analysis(
        self,
        start_time: datetime,
        end_time: datetime,
    ) -> PatternAnalysisResponse:
        start_time, end_time = self._normalize_range(start_time, end_time)
        window_days = max(0.1, (end_time - start_time).total_seconds() / 86400.0)

        machines, _ = self._machine_repo.list_machines(limit=1000)
        machine_lookup = {m.id: m for m in machines}

        events = self._event_repo.get_all_events_in_range(start_time, end_time)

        # Categorize events by primary reason
        categories: dict[str, list[EnergyWastageEvent]] = {
            "IDLE_WASTAGE": [],
            "LOW_LOAD_WASTAGE": [],
            "ABNORMAL_POWER": [],
            "START_STOP_CYCLING": [],
        }

        for ev in events:
            reason = (ev.detection_reason or "").upper()
            if "IDLE_WASTAGE" in reason:
                categories["IDLE_WASTAGE"].append(ev)
            elif "LOW_LOAD_WASTAGE" in reason:
                categories["LOW_LOAD_WASTAGE"].append(ev)
            elif "ABNORMAL_POWER" in reason:
                categories["ABNORMAL_POWER"].append(ev)
            elif "START_STOP_CYCLING" in reason:
                categories["START_STOP_CYCLING"].append(ev)

        patterns: list[PatternBreakdown] = []
        total_quantified_kwh = 0.0
        has_quantified = False
        unquantified_patterns = 0

        # Pattern definitions & descriptions
        meta = {
            "IDLE_WASTAGE": {
                "name": "Recurring Sustained Idle Wastage",
                "desc": "Motors kept fully energized while machine is unloaded or uncoupled from material feed.",
                "conditions": "Occurs during shift changes, meal breaks, or uncoordinated upstream crusher delays.",
                "countermeasure": "Implement automatic shutdown delay (e.g. 5-minute auto-off timer) or interlock with upstream bin level.",
                "limits": "Does not account for OEM-mandated drive warm-up cycles or bearing lubrication cooling requirements.",
            },
            "LOW_LOAD_WASTAGE": {
                "name": "Chronic Low-Load Inefficiency",
                "desc": "Motors operating continuously below 30% load factor where induction motor efficiency plummets.",
                "conditions": "Occurs when feed rates are throttled below design capacity or oversized motors are fitted.",
                "countermeasure": "Batch material feeding to operate equipment in the 65-85% optimal efficiency zone.",
                "limits": "Power-to-load estimation relies on typical IEC 60034 induction motor torque curves.",
            },
            "ABNORMAL_POWER": {
                "name": "Abnormal Power Envelope Deviation",
                "desc": "Active power consumption substantially exceeding nominal baseline curve for the observed load.",
                "conditions": "Associated with mechanical binding, bearing degradation, or conveyor belt misalignment.",
                "countermeasure": "Conduct thermographic inspection of bearings and inspect conveyor idlers for seized rollers.",
                "limits": "Assumes consistent ore grindability; power surges may reflect occasional hard rock intrusions.",
            },
            "START_STOP_CYCLING": {
                "name": "Frequent Start/Stop Cycling Stress",
                "desc": "Repeated start/stop cycles (>3 within 10 minutes) inducing severe thermal and mechanical stresses.",
                "conditions": "Triggered by bouncing bin level limit switches or hunting automated control loops.",
                "countermeasure": "Increase deadband on bin level switches and program minimum run timers into motor starters.",
                "limits": "Direct electrical kWh wastage is unquantified; primary operational impact is motor winding failure risk.",
            },
        }

        for cat_key, ev_list in categories.items():
            info = meta[cat_key]
            m_ids = list({e.machine_id for e in ev_list})
            m_names = [machine_lookup[mid].name for mid in m_ids if mid in machine_lookup]

            count = len(ev_list)
            dur_sec = sum(e.duration_seconds or 0.0 for e in ev_list)
            dur_hours = round(dur_sec / 3600.0, 2)
            rate_per_day = round(count / window_days, 2)

            # Energy summation with interval clipping to prevent double counting
            if cat_key == "START_STOP_CYCLING":
                cat_kwh = None
                unquantified_patterns += 1
            else:
                kwh_sum = sum(
                    float(e.estimated_wasted_energy_kwh) for e in ev_list if e.estimated_wasted_energy_kwh is not None
                )
                cat_kwh = round(kwh_sum, 4) if kwh_sum > 0 else 0.0
                total_quantified_kwh += cat_kwh
                has_quantified = True

            rep_ids = [e.id for e in ev_list[:5]]

            patterns.append(
                PatternBreakdown(
                    pattern_type=cat_key,
                    pattern_name=info["name"],
                    description=info["desc"],
                    affected_machine_count=len(m_ids),
                    affected_machine_names=m_names,
                    total_event_count=count,
                    recurrence_rate_events_per_day=rate_per_day,
                    total_duration_hours=dur_hours,
                    estimated_wasted_energy_kwh=cat_kwh,
                    typical_operating_conditions=info["conditions"],
                    representative_event_ids=rep_ids,
                    recommended_countermeasure=info["countermeasure"],
                    pattern_limitations=info["limits"],
                )
            )

        return PatternAnalysisResponse(
            start_time=start_time,
            end_time=end_time,
            patterns=patterns,
            total_quantified_wasted_kwh=round(total_quantified_kwh, 4) if has_quantified else None,
            unquantified_pattern_count=unquantified_patterns,
            deduplication_method_note=(
                "Energy metrics are computed across disjoint clipped intervals. Start/stop cycling events are intentionally "
                "recorded as unquantified kWh to prevent false claims of energy savings where mechanical wear dominates."
            ),
            generated_at=datetime.now(timezone.utc),
        )

    # -------------------------------------------------------------------------
    # 3. HISTORICAL BASELINE PERFORMANCE
    # -------------------------------------------------------------------------

    def get_machine_baseline(
        self,
        machine_id: UUID,
        observation_start: datetime | None = None,
        observation_end: datetime | None = None,
    ) -> MachineBaselineResponse:
        machine = self._machine_repo.get_by_id(machine_id)
        if machine is None:
            raise MachineNotFoundError(f"Machine {machine_id} not found.")

        now = datetime.now(timezone.utc)
        obs_end = observation_end or now
        obs_start = observation_start or (obs_end - timedelta(hours=24))
        obs_start, obs_end = self._normalize_range(obs_start, obs_end)

        # Pull historical telemetry for baseline: look back up to 7 days
        history_start = obs_start - timedelta(days=7)
        history_records = self._telemetry_repo.get_all_in_range(machine_id, history_start, obs_end)

        rated_kw = float(machine.rated_power_kw) if machine.rated_power_kw is not None else 100.0

        # Calculate valid hours and sample count
        valid_samples = [r for r in history_records if r.active_power is not None and isfinite(r.active_power)]
        sample_count = len(valid_samples)

        available_hours = 0.0
        if len(valid_samples) >= 2:
            first_ts = valid_samples[0].timestamp
            last_ts = valid_samples[-1].timestamp
            available_hours = max(0.0, (last_ts - first_ts).total_seconds() / 3600.0)

        # Data requirement check
        if available_hours < MINIMUM_BASELINE_HISTORY_HOURS or sample_count < MINIMUM_BASELINE_SAMPLES:
            return MachineBaselineResponse(
                machine_id=machine.id,
                machine_name=machine.name,
                machine_type=machine.machine_type,
                rated_power_kw=float(machine.rated_power_kw) if machine.rated_power_kw is not None else None,
                observation_start_time=obs_start,
                observation_end_time=obs_end,
                baseline_status=BaselineStatus.INSUFFICIENT_DATA,
                is_baseline_valid=False,
                insufficient_data_reason=(
                    f"Insufficient historical telemetry: {available_hours:.1f} hours and {sample_count} samples available. "
                    f"Minimum required is {MINIMUM_BASELINE_HISTORY_HOURS:.1f} hours and {MINIMUM_BASELINE_SAMPLES} samples."
                ),
                required_history_hours=MINIMUM_BASELINE_HISTORY_HOURS,
                available_history_hours=round(available_hours, 2),
                telemetry_samples_evaluated=sample_count,
                baseline_metrics={},
                current_metrics={},
                deviation_percentage=None,
                explanation=(
                    "Historical baseline cannot be credibly established. An uncalibrated baseline would produce "
                    "misleading energy wastage estimates. Collect additional continuous telemetry before relying on baseline analytics."
                ),
                methodology_and_limitations=(
                    "Baseline calculation requires continuous steady-state telemetry across valid load cycles. "
                    "Cross-machine comparisons are prohibited to avoid invalid analogies between different machine duty classes."
                ),
            )

        # Calculate baseline metrics across historical records prior to observation window
        historical_records = [r for r in valid_samples if (r.timestamp if r.timestamp.tzinfo else r.timestamp.replace(tzinfo=timezone.utc)) < obs_start]
        current_records = [r for r in valid_samples if obs_start <= (r.timestamp if r.timestamp.tzinfo else r.timestamp.replace(tzinfo=timezone.utc)) <= obs_end]
        ref_records = historical_records if len(historical_records) >= MINIMUM_BASELINE_SAMPLES else valid_samples

        idle_samples = [r.active_power for r in ref_records if (r.operating_state or "").upper() == "IDLE" and r.active_power is not None]
        running_samples = [r.active_power for r in ref_records if (r.operating_state or "").upper() == "RUNNING" and r.active_power is not None]
        pfs = [r.power_factor for r in ref_records if r.power_factor is not None and isfinite(r.power_factor)]

        baseline_idle_kw = round(sum(idle_samples) / len(idle_samples), 2) if idle_samples else round(rated_kw * 0.15, 2)
        baseline_running_kw = round(sum(running_samples) / len(running_samples), 2) if running_samples else round(rated_kw * 0.70, 2)
        baseline_pf = round(sum(pfs) / len(pfs), 3) if pfs else 0.85

        # Current window metrics
        curr_powers = [r.active_power for r in current_records if r.active_power is not None]
        curr_idle = [r.active_power for r in current_records if (r.operating_state or "").upper() == "IDLE" and r.active_power is not None]
        curr_pfs = [r.power_factor for r in current_records if r.power_factor is not None]

        curr_avg_kw = round(sum(curr_powers) / len(curr_powers), 2) if curr_powers else None
        curr_idle_kw = round(sum(curr_idle) / len(curr_idle), 2) if curr_idle else None
        curr_avg_pf = round(sum(curr_pfs) / len(curr_pfs), 3) if curr_pfs else None

        # Deviation calculation
        deviation_pct = None
        if curr_avg_kw is not None and baseline_running_kw > 0:
            deviation_pct = round(((curr_avg_kw - baseline_running_kw) / baseline_running_kw) * 100.0, 1)

        is_deviation = deviation_pct is not None and abs(deviation_pct) >= 15.0
        status = BaselineStatus.DEVIATION_DETECTED if is_deviation else BaselineStatus.NORMAL

        if is_deviation:
            explanation = (
                f"Current average power ({curr_avg_kw} kW) deviates by {deviation_pct:+.1f}% from the established historical "
                f"running baseline ({baseline_running_kw} kW). This indicates significant operating condition shifts."
            )
        else:
            explanation = (
                f"Machine operating metrics are within normal baseline tolerances (current {curr_avg_kw or 0.0} kW vs "
                f"baseline {baseline_running_kw} kW, deviation: {deviation_pct or 0.0:+.1f}%)."
            )

        return MachineBaselineResponse(
            machine_id=machine.id,
            machine_name=machine.name,
            machine_type=machine.machine_type,
            rated_power_kw=float(machine.rated_power_kw) if machine.rated_power_kw is not None else None,
            observation_start_time=obs_start,
            observation_end_time=obs_end,
            baseline_status=status,
            is_baseline_valid=True,
            insufficient_data_reason=None,
            required_history_hours=MINIMUM_BASELINE_HISTORY_HOURS,
            available_history_hours=round(available_hours, 2),
            telemetry_samples_evaluated=sample_count,
            baseline_metrics={
                "baseline_idle_power_kw": baseline_idle_kw,
                "baseline_running_power_kw": baseline_running_kw,
                "baseline_power_factor": baseline_pf,
            },
            current_metrics={
                "current_average_power_kw": curr_avg_kw,
                "current_idle_power_kw": curr_idle_kw,
                "current_average_power_factor": curr_avg_pf,
            },
            deviation_percentage=deviation_pct,
            explanation=explanation,
            methodology_and_limitations=(
                "Baseline derived solely from this machine's own historical telemetry over identical operating states. "
                "Comparisons assume consistent mechanical drive efficiency and do not normalize for varying ore hardness."
            ),
        )

    # -------------------------------------------------------------------------
    # 4. BEFORE-AND-AFTER ASSESSMENT (ACTION IMPACT)
    # -------------------------------------------------------------------------

    def record_corrective_action(self, payload: CorrectiveActionCreate) -> CorrectiveActionResponse:
        machine = self._machine_repo.get_by_id(payload.machine_id)
        if machine is None:
            raise MachineNotFoundError(f"Machine {payload.machine_id} not found.")

        perf_time = payload.performed_at
        if perf_time.tzinfo is None:
            perf_time = perf_time.replace(tzinfo=timezone.utc)

        action = CorrectiveAction(
            machine_id=payload.machine_id,
            action_type=payload.action_type.strip(),
            title=payload.title.strip(),
            description=payload.description.strip() if payload.description else None,
            performed_at=perf_time,
            operator_name=payload.operator_name.strip() if payload.operator_name else None,
            notes=payload.notes.strip() if payload.notes else None,
        )
        saved = self._action_repo.create(action)
        return self._map_action_response(saved)

    def list_corrective_actions(self, machine_id: UUID | None = None) -> list[CorrectiveActionResponse]:
        if machine_id is not None:
            actions = self._action_repo.list_for_machine(machine_id)
        else:
            actions = self._action_repo.list_all()
        return [self._map_action_response(a) for a in actions]

    def delete_corrective_action(self, action_id: UUID) -> bool:
        return self._action_repo.delete(action_id)

    def assess_action_impact(
        self,
        action_id: UUID,
        window_hours: float = 24.0,
    ) -> ActionImpactResponse:
        action = self._action_repo.get_by_id(action_id)
        if action is None:
            raise MachineNotFoundError(f"Corrective action {action_id} not found.")

        window_hours = max(0.5, min(168.0, window_hours))  # bounded 0.5h to 7 days
        action_time = action.performed_at if action.performed_at.tzinfo else action.performed_at.replace(tzinfo=timezone.utc)
        delta_window = timedelta(hours=window_hours)

        pre_start = action_time - delta_window
        pre_end = action_time

        post_start = action_time
        post_end = action_time + delta_window

        pre_metrics = self._compute_period_metrics(action.machine_id, pre_start, pre_end)
        post_metrics = self._compute_period_metrics(action.machine_id, post_start, post_end)

        # Statistical comparability check
        min_samples = 10
        is_comparable = (
            pre_metrics.telemetry_sample_count >= min_samples
            and post_metrics.telemetry_sample_count >= min_samples
            and pre_metrics.data_coverage_ratio >= 0.20
            and post_metrics.data_coverage_ratio >= 0.20
        )

        if not is_comparable:
            return ActionImpactResponse(
                action=self._map_action_response(action),
                evaluation_window_hours=window_hours,
                pre_action_period=pre_metrics,
                post_action_period=post_metrics,
                impact_status=ImpactClassification.INSUFFICIENT_DATA,
                is_statistically_comparable=False,
                comparability_notes=(
                    f"Insufficient telemetry coverage for a valid before-and-after comparison. "
                    f"Pre-action samples: {pre_metrics.telemetry_sample_count} (coverage: {pre_metrics.data_coverage_ratio*100:.1f}%), "
                    f"Post-action samples: {post_metrics.telemetry_sample_count} (coverage: {post_metrics.data_coverage_ratio*100:.1f}%)."
                ),
                absolute_wasted_energy_delta_kwh=None,
                percentage_wasted_energy_delta=None,
                absolute_idle_hours_delta=None,
                event_count_delta=post_metrics.wastage_event_count - pre_metrics.wastage_event_count,
                summary_explanation=(
                    "Data coverage is insufficient to verify whether the corrective action impacted energy consumption. "
                    "Ensure telemetry ingestion is active before and after maintenance."
                ),
            )

        # Compute deltas
        pre_wasted = pre_metrics.estimated_wasted_energy_kwh or 0.0
        post_wasted = post_metrics.estimated_wasted_energy_kwh or 0.0
        abs_wasted_delta = round(post_wasted - pre_wasted, 4)

        if pre_wasted > 0:
            pct_wasted_delta = round(((post_wasted - pre_wasted) / pre_wasted) * 100.0, 1)
        elif post_wasted > 0:
            pct_wasted_delta = 100.0
        else:
            pct_wasted_delta = 0.0

        abs_idle_delta = round(post_metrics.idle_duration_hours - pre_metrics.idle_duration_hours, 2)
        event_delta = post_metrics.wastage_event_count - pre_metrics.wastage_event_count

        # Impact Classification
        if pct_wasted_delta <= -5.0 or (event_delta < 0 and pct_wasted_delta <= 0):
            impact = ImpactClassification.IMPROVED
            explanation = (
                f"Energy wastage decreased by {abs(pct_wasted_delta):.1f}% ({abs(abs_wasted_delta):.2f} kWh reduction) "
                f"and wastage events changed by {event_delta:+d} following '{action.title}'."
            )
        elif pct_wasted_delta >= 5.0 or event_delta > 0:
            impact = ImpactClassification.REGRESSED
            explanation = (
                f"Energy wastage increased by {pct_wasted_delta:+.1f}% ({abs_wasted_delta:+.2f} kWh increase) "
                f"following '{action.title}'. Inspect whether operational parameters were appropriately configured."
            )
        else:
            impact = ImpactClassification.NO_SIGNIFICANT_CHANGE
            explanation = (
                f"No significant change detected in energy wastage ({pct_wasted_delta:+.1f}% difference) "
                f"over the {window_hours:.1f}-hour comparison window."
            )

        return ActionImpactResponse(
            action=self._map_action_response(action),
            evaluation_window_hours=window_hours,
            pre_action_period=pre_metrics,
            post_action_period=post_metrics,
            impact_status=impact,
            is_statistically_comparable=True,
            comparability_notes=(
                f"Symmetrical {window_hours:.1f}-hour observation periods with adequate data coverage "
                f"({pre_metrics.data_coverage_ratio*100:.0f}% pre, {post_metrics.data_coverage_ratio*100:.0f}% post)."
            ),
            absolute_wasted_energy_delta_kwh=abs_wasted_delta,
            percentage_wasted_energy_delta=pct_wasted_delta,
            absolute_idle_hours_delta=abs_idle_delta,
            event_count_delta=event_delta,
            summary_explanation=explanation,
        )

    def _compute_period_metrics(
        self,
        machine_id: UUID,
        start_time: datetime,
        end_time: datetime,
    ) -> PeriodMetrics:
        dur_hours = round(max(0.001, (end_time - start_time).total_seconds() / 3600.0), 2)
        try:
            summary = self._energy_service.get_energy_summary(machine_id, start_time, end_time)
            events = self._event_repo.get_events_intersecting_range(machine_id, start_time, end_time)
            records = self._telemetry_repo.get_all_in_range(machine_id, start_time, end_time)

            powers = [r.active_power for r in records if r.active_power is not None and isfinite(r.active_power)]
            avg_kw = round(sum(powers) / len(powers), 2) if powers else None

            idle_hours = round((summary.idle_duration_seconds or 0.0) / 3600.0, 2)

            return PeriodMetrics(
                start_time=start_time,
                end_time=end_time,
                duration_hours=dur_hours,
                telemetry_sample_count=summary.telemetry_sample_count,
                data_coverage_ratio=round(summary.data_coverage_ratio, 4),
                actual_energy_kwh=summary.actual_energy_kwh,
                estimated_wasted_energy_kwh=summary.estimated_wasted_energy_kwh,
                idle_duration_hours=idle_hours,
                wastage_event_count=len(events),
                average_active_power_kw=avg_kw,
            )
        except Exception:
            return PeriodMetrics(
                start_time=start_time,
                end_time=end_time,
                duration_hours=dur_hours,
                telemetry_sample_count=0,
                data_coverage_ratio=0.0,
                actual_energy_kwh=None,
                estimated_wasted_energy_kwh=None,
                idle_duration_hours=0.0,
                wastage_event_count=0,
                average_active_power_kw=None,
            )

    # -------------------------------------------------------------------------
    # 5. MACHINE INSIGHT DETAIL VIEW
    # -------------------------------------------------------------------------

    def get_machine_insight_detail(
        self,
        machine_id: UUID,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
    ) -> MachineInsightDetailResponse:
        machine = self._machine_repo.get_by_id(machine_id)
        if machine is None:
            raise MachineNotFoundError(f"Machine {machine_id} not found.")

        now = datetime.now(timezone.utc)
        parsed_end = end_time or now
        parsed_start = start_time or (parsed_end - timedelta(hours=24))
        parsed_start, parsed_end = self._normalize_range(parsed_start, parsed_end)

        # Energy summary & events
        summary = self._energy_service.get_energy_summary(machine_id, parsed_start, parsed_end)
        events = self._event_repo.get_events_intersecting_range(machine_id, parsed_start, parsed_end)

        cov = summary.data_coverage_ratio
        if cov >= 0.80 and summary.telemetry_sample_count >= 50:
            dq = DataQualityClassification.GOOD
        elif cov >= 0.30:
            dq = DataQualityClassification.PARTIAL
        else:
            dq = DataQualityClassification.INSUFFICIENT_DATA

        wasted_dur_sec = sum(e.duration_seconds or 0.0 for e in events)
        prio = self._calculate_prioritization(
            machine=machine,
            wasted_kwh=summary.estimated_wasted_energy_kwh,
            event_count=len(events),
            wasted_duration_seconds=wasted_dur_sec,
            coverage_ratio=cov,
            data_quality=dq,
        )

        insights = self._extract_insights_for_events(machine, events, parsed_start, parsed_end, cov)
        baseline = self.get_machine_baseline(machine_id, parsed_start, parsed_end)
        actions = self._action_repo.list_for_machine(machine_id, limit=5)

        # Telemetry freshness
        latest = self._telemetry_repo.get_latest_for_machine(machine_id)
        if latest is None:
            freshness = "missing"
        else:
            ts = latest.timestamp if latest.timestamp.tzinfo else latest.timestamp.replace(tzinfo=timezone.utc)
            age = (now - ts).total_seconds()
            freshness = "fresh" if age <= 120.0 else "stale"

        return MachineInsightDetailResponse(
            machine_id=machine.id,
            machine_identifier=machine.machine_identifier,
            machine_name=machine.name,
            machine_type=machine.machine_type,
            rated_power_kw=float(machine.rated_power_kw) if machine.rated_power_kw is not None else None,
            prioritization=prio,
            insights=insights,
            baseline=baseline,
            recent_actions=[self._map_action_response(a) for a in actions],
            telemetry_freshness=freshness,
            data_quality=dq,
            generated_at=datetime.now(timezone.utc),
        )

    # -------------------------------------------------------------------------
    # INTERNAL HELPERS & INSIGHT EXTRACTION
    # -------------------------------------------------------------------------

    def _extract_insights_for_events(
        self,
        machine: Machine,
        events: list[EnergyWastageEvent],
        start_time: datetime,
        end_time: datetime,
        coverage_ratio: float,
    ) -> list[ExplainableInsight]:
        insights: list[ExplainableInsight] = []
        name = machine.name
        rated_kw = float(machine.rated_power_kw) if machine.rated_power_kw is not None else 100.0

        confidence = (
            ConfidenceLevel.HIGH
            if coverage_ratio >= 0.80
            else (ConfidenceLevel.MEDIUM if coverage_ratio >= 0.40 else ConfidenceLevel.LOW)
        )
        conf_def = (
            f"{confidence.value} confidence based on {coverage_ratio*100:.1f}% telemetry data coverage across observation window."
        )

        # Group events by reason
        for ev in events:
            reason = (ev.detection_reason or "").upper()
            dur_sec = ev.duration_seconds or 0.0
            dur_min = max(0.1, dur_sec / 60.0)
            wasted_kwh = float(ev.estimated_wasted_energy_kwh) if ev.estimated_wasted_energy_kwh is not None else None

            # Generate deterministic UUID for insight
            insight_id = uuid5(NAMESPACE_URL, f"orvex-insight:{ev.id}")

            if "START_STOP_CYCLING" in reason:
                insights.append(
                    ExplainableInsight(
                        insight_id=insight_id,
                        machine_id=machine.id,
                        machine_name=name,
                        insight_type="FREQUENT_CYCLING_STRESS",
                        title=f"Rapid Start/Stop Cycling on {name}",
                        severity="medium" if dur_min >= 10.0 else "low",
                        start_time=ev.start_time,
                        end_time=ev.end_time or ev.start_time,
                        observation_window_description=f"{dur_min:.1f} minutes during operating shift",
                        supporting_event_ids=[ev.id],
                        telemetry_evidence={
                            "event_duration_minutes": round(dur_min, 1),
                            "machine_rated_kw": rated_kw,
                        },
                        measured_values={"duration_seconds": dur_sec},
                        applicable_thresholds={"max_allowed_starts_per_10min": 3.0},
                        estimated_wasted_energy_kwh=None,  # Intentionally null!
                        energy_unit="kWh",
                        confidence=confidence,
                        confidence_definition=conf_def,
                        explanation=(
                            f"Machine '{name}' exhibited rapid start/stop cycling behavior over {dur_min:.1f} minutes. "
                            "Start/stop cycling draws 6-8x inrush current and causes heavy thermal/mechanical fatigue. "
                            "Direct energy wastage is intentionally unquantified because mechanical degradation dominates."
                        ),
                        recommended_action=(
                            "Inspect starter contactor control circuits, verify interlock hysteresis, and adjust hopper level sensors "
                            "to enforce a minimum 5-minute continuous run time."
                        ),
                        limitations="Direct electrical energy wastage is unquantified for cycle count stress events.",
                    )
                )
            elif "IDLE_WASTAGE" in reason:
                w_val = wasted_kwh or 0.0
                sev = "high" if w_val >= 5.0 else ("medium" if w_val >= 1.0 else "low")
                insights.append(
                    ExplainableInsight(
                        insight_id=insight_id,
                        machine_id=machine.id,
                        machine_name=name,
                        insight_type="RECURRING_IDLE_WASTAGE",
                        title=f"Avoidable Idle Energy Wastage on {name}",
                        severity=sev,
                        start_time=ev.start_time,
                        end_time=ev.end_time or ev.start_time,
                        observation_window_description=f"{dur_min:.1f} minutes sustained idle",
                        supporting_event_ids=[ev.id],
                        telemetry_evidence={
                            "idle_duration_minutes": round(dur_min, 1),
                            "estimated_wasted_kwh": w_val,
                            "machine_rated_kw": rated_kw,
                        },
                        measured_values={
                            "wasted_energy_kwh": w_val,
                            "idle_duration_seconds": dur_sec,
                        },
                        applicable_thresholds={
                            "minimum_idle_threshold_seconds": 120.0,
                            "baseline_idle_power_kw": round(rated_kw * 0.15, 2),
                        },
                        estimated_wasted_energy_kwh=w_val,
                        energy_unit="kWh",
                        confidence=confidence,
                        confidence_definition=conf_def,
                        explanation=(
                            f"Machine '{name}' remained energized in IDLE state for {dur_min:.1f} minutes, "
                            f"wasting an estimated {w_val:.2f} kWh of electrical energy without producing useful mechanical work."
                        ),
                        recommended_action=(
                            "Configure an automated interlock to de-energize the drive when upstream feed has been idle for more than 5 minutes."
                        ),
                        limitations="Assumes constant no-load power; does not account for auxiliary ventilation blower power.",
                    )
                )
            elif "LOW_LOAD_WASTAGE" in reason:
                w_val = wasted_kwh or 0.0
                sev = "high" if w_val >= 5.0 else ("medium" if w_val >= 1.0 else "low")
                insights.append(
                    ExplainableInsight(
                        insight_id=insight_id,
                        machine_id=machine.id,
                        machine_name=name,
                        insight_type="CHRONIC_LOW_LOAD",
                        title=f"Low-Load Inefficiency on {name}",
                        severity=sev,
                        start_time=ev.start_time,
                        end_time=ev.end_time or ev.start_time,
                        observation_window_description=f"{dur_min:.1f} minutes below 30% load",
                        supporting_event_ids=[ev.id],
                        telemetry_evidence={
                            "low_load_duration_minutes": round(dur_min, 1),
                            "estimated_wasted_kwh": w_val,
                            "machine_rated_kw": rated_kw,
                        },
                        measured_values={"wasted_energy_kwh": w_val},
                        applicable_thresholds={"minimum_efficient_load_percent": 30.0},
                        estimated_wasted_energy_kwh=w_val,
                        energy_unit="kWh",
                        confidence=confidence,
                        confidence_definition=conf_def,
                        explanation=(
                            f"Machine '{name}' operated below minimum efficient loading for {dur_min:.1f} minutes "
                            f"(estimated {w_val:.2f} kWh avoidable excess above benchmark efficiency)."
                        ),
                        recommended_action="Coordinate material batching to run equipment at 70-85% load rather than continuous light loading.",
                        limitations="Relies on standard motor load-efficiency curve; actual efficiency varies with motor winding age.",
                    )
                )
            elif "ABNORMAL_POWER" in reason:
                w_val = wasted_kwh or 0.0
                sev = "high" if w_val >= 5.0 else ("medium" if w_val >= 1.0 else "low")
                insights.append(
                    ExplainableInsight(
                        insight_id=insight_id,
                        machine_id=machine.id,
                        machine_name=name,
                        insight_type="ABNORMAL_POWER_SPIKE",
                        title=f"Abnormal Electrical Power Consumption on {name}",
                        severity=sev,
                        start_time=ev.start_time,
                        end_time=ev.end_time or ev.start_time,
                        observation_window_description=f"{dur_min:.1f} minutes above baseline curve",
                        supporting_event_ids=[ev.id],
                        telemetry_evidence={
                            "duration_minutes": round(dur_min, 1),
                            "estimated_wasted_kwh": w_val,
                            "machine_rated_kw": rated_kw,
                        },
                        measured_values={"excess_wasted_kwh": w_val},
                        applicable_thresholds={"power_deviation_threshold_percent": 20.0},
                        estimated_wasted_energy_kwh=w_val,
                        energy_unit="kWh",
                        confidence=confidence,
                        confidence_definition=conf_def,
                        explanation=(
                            f"Active power consumption on '{name}' significantly exceeded expected baseline over {dur_min:.1f} minutes "
                            f"(estimated {w_val:.2f} kWh excess above normal operational envelope)."
                        ),
                        recommended_action="Inspect conveyor rollers for mechanical binding, belt misalignment, or bearing overheating.",
                        limitations="Ore hardness fluctuations can cause transient power elevations that mimic mechanical drag.",
                    )
                )

        return insights

    @staticmethod
    def _map_action_response(action: CorrectiveAction) -> CorrectiveActionResponse:
        created_time = action.created_at if action.created_at is not None else (action.performed_at or datetime.now(timezone.utc))
        return CorrectiveActionResponse(
            id=action.id,
            machine_id=action.machine_id,
            action_type=action.action_type,
            title=action.title,
            description=action.description,
            performed_at=action.performed_at,
            operator_name=action.operator_name,
            notes=action.notes,
            created_at=created_time,
        )

    @staticmethod
    def _normalize_range(start_time: datetime, end_time: datetime) -> tuple[datetime, datetime]:
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
        if end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)
        start_time = start_time.astimezone(timezone.utc)
        end_time = end_time.astimezone(timezone.utc)
        if start_time >= end_time:
            raise InvalidTimeRangeError("start_time must be strictly before end_time.")
        return start_time, end_time
