"""Ground-truth scenario definitions and telemetry synthesis for ORVEX validation."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

from app.db.models import Telemetry


@dataclass(frozen=True)
class ExpectedOutcome:
    expected_wastage_reasons: list[str] = field(default_factory=list)
    expected_event_count: int = 0
    expected_alert_count: int = 0
    expected_wasted_kwh: float | None = None
    expected_wasted_kwh_tolerance: float = 0.5  # kWh
    expected_health_warnings: list[str] = field(default_factory=list)
    expected_health_status: str | None = None  # HEALTHY, WATCH, WARNING, CRITICAL, INSUFFICIENT_DATA
    min_health_score: float | None = None
    max_health_score: float | None = None
    is_simulated: bool = True
    ground_truth_label: str = "NORMAL"


@dataclass
class ValidationScenario:
    scenario_id: str
    name: str
    description: str
    machine_name: str
    machine_type: str
    rated_power_kw: float
    expected: ExpectedOutcome
    telemetry_records: list[Telemetry] = field(default_factory=list)
    reference_energy_kwh: float = 0.0
    reference_wasted_kwh: float | None = None


def generate_validation_scenarios(
    machine_id_map: dict[str, UUID] | None = None,
    start_time: datetime | None = None,
) -> list[ValidationScenario]:
    """Generate the standard suite of 10 ground-truth validation scenarios."""
    if start_time is None:
        start_time = datetime(2026, 11, 4, 8, 0, 0, tzinfo=timezone.utc)
    if machine_id_map is None:
        machine_id_map = {f"M{i}": uuid4() for i in range(1, 15)}

    scenarios: list[ValidationScenario] = []

    # =========================================================================
    # SCENARIO 1: Normal Machine Operation (Crusher 132 kW)
    # =========================================================================
    m1_id = machine_id_map.get("M1", uuid4())
    s1_records: list[Telemetry] = []
    # 120 samples @ 10s = 20 mins. Power ~88 kW (66% load), Temp ~65°C, RPM ~1480, OPTIMAL state.
    ref_energy_1 = 0.0
    for i in range(120):
        t = start_time + timedelta(seconds=i * 10)
        p = 88.0 + ((i % 5) - 2) * 1.0  # 86 to 90 kW
        ref_energy_1 += p * (10.0 / 3600.0)
        s1_records.append(
            Telemetry(
                id=uuid4(),
                machine_id=m1_id,
                timestamp=t,
                active_power=p,
                current=p * 1.45,
                voltage=415.0,
                reactive_power=25.0,
                apparent_power=p * 1.05,
                power_factor=0.91,
                cumulative_energy=100.0 + ref_energy_1,
                temperature=65.0,
                rpm=1480.0,
                load_percentage=66.0,
                operating_state="OPTIMAL",
            )
        )

    scenarios.append(
        ValidationScenario(
            scenario_id="SCENARIO_1_NORMAL",
            name="Normal Machine Operation",
            description="Steady 132 kW crusher operating inside normal load envelope (86-90 kW, 65°C, 0.91 PF).",
            machine_name="Primary Jaw Crusher",
            machine_type="Crusher",
            rated_power_kw=132.0,
            expected=ExpectedOutcome(
                expected_wastage_reasons=[],
                expected_event_count=0,
                expected_alert_count=0,
                expected_wasted_kwh=None,
                expected_health_warnings=[],
                expected_health_status="HEALTHY",
                min_health_score=85.0,
                max_health_score=100.0,
                ground_truth_label="NORMAL",
            ),
            telemetry_records=s1_records,
            reference_energy_kwh=round(ref_energy_1, 4),
            reference_wasted_kwh=None,
        )
    )

    # =========================================================================
    # SCENARIO 2: Idle Energy Wastage (Crusher 132 kW)
    # =========================================================================
    m2_id = machine_id_map.get("M2", uuid4())
    s2_records: list[Telemetry] = []
    # 5 mins normal (85 kW), then 15 mins IDLE drawing 45 kW (expected idle power 12 kW, excess 33 kW).
    ref_energy_2 = 0.0
    ref_wasted_2 = 33.0 * (15.0 / 60.0)  # 8.25 kWh
    for i in range(120):
        t = start_time + timedelta(seconds=i * 10)
        if i < 30:  # 0 to 5 mins
            p = 85.0
            state = "OPTIMAL"
            load = 64.0
        else:  # 5 to 20 mins
            p = 45.0
            state = "IDLE"
            load = 5.0
        ref_energy_2 += p * (10.0 / 3600.0)
        s2_records.append(
            Telemetry(
                id=uuid4(),
                machine_id=m2_id,
                timestamp=t,
                active_power=p,
                current=p * 1.45,
                voltage=415.0,
                reactive_power=20.0,
                apparent_power=p * 1.05,
                power_factor=0.88 if i < 30 else 0.55,
                cumulative_energy=200.0 + ref_energy_2,
                temperature=68.0,
                rpm=1485.0,
                load_percentage=load,
                operating_state=state,
            )
        )

    scenarios.append(
        ValidationScenario(
            scenario_id="SCENARIO_2_IDLE_WASTAGE",
            name="Sustained Idle Energy Wastage",
            description="132 kW Crusher left idling for 15 minutes drawing 45 kW (expected idle is 12 kW; 33 kW excess).",
            machine_name="Secondary Cone Crusher",
            machine_type="Crusher",
            rated_power_kw=132.0,
            expected=ExpectedOutcome(
                expected_wastage_reasons=["IDLE_WASTAGE"],
                expected_event_count=1,
                expected_alert_count=1,
                expected_wasted_kwh=ref_wasted_2,
                expected_wasted_kwh_tolerance=0.8,
                expected_health_warnings=[],
                expected_health_status="HEALTHY",  # Idling smoothly is not a mechanical failure!
                min_health_score=80.0,
                max_health_score=100.0,
                ground_truth_label="IDLE_WASTAGE",
            ),
            telemetry_records=s2_records,
            reference_energy_kwh=round(ref_energy_2, 4),
            reference_wasted_kwh=round(ref_wasted_2, 4),
        )
    )

    # =========================================================================
    # SCENARIO 3: Low-Load Energy Wastage (Conveyor 45 kW)
    # =========================================================================
    m3_id = machine_id_map.get("M3", uuid4())
    s3_records: list[Telemetry] = []
    # 15 mins LOW_LOAD drawing 22 kW at 20% load (rated 45 kW; expected 9 kW; excess 13 kW).
    ref_energy_3 = 0.0
    ref_wasted_3 = 13.0 * (15.0 / 60.0)  # 3.25 kWh
    for i in range(120):
        t = start_time + timedelta(seconds=i * 10)
        if i < 30:
            p = 32.0
            state = "OPTIMAL"
            load = 70.0
        else:
            p = 22.0
            state = "LOW_LOAD"
            load = 20.0
        ref_energy_3 += p * (10.0 / 3600.0)
        s3_records.append(
            Telemetry(
                id=uuid4(),
                machine_id=m3_id,
                timestamp=t,
                active_power=p,
                current=p * 1.5,
                voltage=415.0,
                reactive_power=12.0,
                apparent_power=p * 1.08,
                power_factor=0.85 if i < 30 else 0.62,
                cumulative_energy=300.0 + ref_energy_3,
                temperature=58.0,
                rpm=980.0,
                load_percentage=load,
                operating_state=state,
            )
        )

    scenarios.append(
        ValidationScenario(
            scenario_id="SCENARIO_3_LOW_LOAD_WASTAGE",
            name="Sustained Low-Load Wastage",
            description="45 kW Conveyor running at 20% capacity drawing 22 kW (expected 9 kW; excess 13 kW).",
            machine_name="Overland Feeder Conveyor",
            machine_type="Conveyor",
            rated_power_kw=45.0,
            expected=ExpectedOutcome(
                expected_wastage_reasons=["LOW_LOAD_WASTAGE"],
                expected_event_count=1,
                expected_alert_count=1,
                expected_wasted_kwh=ref_wasted_3,
                expected_wasted_kwh_tolerance=0.5,
                expected_health_warnings=[],
                expected_health_status="HEALTHY",
                min_health_score=80.0,
                max_health_score=100.0,
                ground_truth_label="LOW_LOAD_WASTAGE",
            ),
            telemetry_records=s3_records,
            reference_energy_kwh=round(ref_energy_3, 4),
            reference_wasted_kwh=round(ref_wasted_3, 4),
        )
    )

    # =========================================================================
    # SCENARIO 4: Abnormal Power Consumption (Crusher 132 kW)
    # =========================================================================
    m4_id = machine_id_map.get("M4", uuid4())
    s4_records: list[Telemetry] = []
    # 15 mins of power at 155 kW (> 132 kW rated; expected 115 kW; excess 40 kW) due to rock binding.
    ref_energy_4 = 0.0
    for i in range(120):
        t = start_time + timedelta(seconds=i * 10)
        p = 168.0 if i >= 30 else 90.0
        state = "HIGH_LOAD" if i >= 30 else "OPTIMAL"
        ref_energy_4 += p * (10.0 / 3600.0)
        s4_records.append(
            Telemetry(
                id=uuid4(),
                machine_id=m4_id,
                timestamp=t,
                active_power=p,
                current=p * 1.6,
                voltage=415.0,
                reactive_power=40.0,
                apparent_power=p * 1.1,
                power_factor=0.88,
                cumulative_energy=400.0 + ref_energy_4,
                temperature=82.0 if i >= 30 else 66.0,
                rpm=1440.0 if i >= 30 else 1480.0,
                load_percentage=100.0 if i >= 30 else 68.0,
                operating_state=state,
            )
        )

    scenarios.append(
        ValidationScenario(
            scenario_id="SCENARIO_4_ABNORMAL_POWER",
            name="Abnormal Power Consumption (Overload Jam)",
            description="132 kW Crusher operating at 155 kW under rock binding conditions (> rated power).",
            machine_name="Tertiary Impact Crusher",
            machine_type="Crusher",
            rated_power_kw=132.0,
            expected=ExpectedOutcome(
                expected_wastage_reasons=["ABNORMAL_POWER"],
                expected_event_count=1,
                expected_alert_count=1,
                expected_wasted_kwh=None,  # Quantified or detected
                expected_health_warnings=["POWER_FLUCTUATION"],
                expected_health_status="WARNING",
                min_health_score=50.0,
                max_health_score=75.0,
                ground_truth_label="ABNORMAL_POWER",
            ),
            telemetry_records=s4_records,
            reference_energy_kwh=round(ref_energy_4, 4),
            reference_wasted_kwh=None,
        )
    )

    # =========================================================================
    # SCENARIO 5: Start-Stop Cycling (Conveyor 45 kW)
    # =========================================================================
    m5_id = machine_id_map.get("M5", uuid4())
    s5_records: list[Telemetry] = []
    # Rapid cycling between STOPPED, STARTING, RUNNING: 10 cycles in 20 minutes.
    cycle_states = ["STOPPED", "STARTING", "RUNNING", "RUNNING", "STOPPED", "STOPPED"]
    ref_energy_5 = 0.0
    for i in range(120):
        t = start_time + timedelta(seconds=i * 10)
        st = cycle_states[i % len(cycle_states)]
        p = 0.0 if st == "STOPPED" else (45.0 if st == "STARTING" else 30.0)
        ref_energy_5 += p * (10.0 / 3600.0)
        s5_records.append(
            Telemetry(
                id=uuid4(),
                machine_id=m5_id,
                timestamp=t,
                active_power=p,
                current=p * 1.5,
                voltage=415.0,
                power_factor=0.85,
                cumulative_energy=500.0 + ref_energy_5,
                temperature=55.0,
                rpm=950.0 if st == "RUNNING" else 0.0,
                load_percentage=60.0 if st == "RUNNING" else 0.0,
                operating_state=st,
            )
        )

    scenarios.append(
        ValidationScenario(
            scenario_id="SCENARIO_5_START_STOP_CYCLING",
            name="Rapid Start-Stop Cycling",
            description="45 kW Conveyor undergoing rapid state cycling (10 complete cycles in 20 mins).",
            machine_name="Stacker Feed Conveyor",
            machine_type="Conveyor",
            rated_power_kw=45.0,
            expected=ExpectedOutcome(
                expected_wastage_reasons=["START_STOP_CYCLING"],
                expected_event_count=1,
                expected_wasted_kwh=None,  # Strictly unquantified (None)
                expected_health_warnings=["STATE_THRASHING"],
                expected_health_status="CRITICAL",
                min_health_score=20.0,
                max_health_score=50.0,
                ground_truth_label="START_STOP_CYCLING",
            ),
            telemetry_records=s5_records,
            reference_energy_kwh=round(ref_energy_5, 4),
            reference_wasted_kwh=None,
        )
    )

    # =========================================================================
    # SCENARIO 6: Temperature Anomaly & Thermal Drift (Crusher 132 kW)
    # =========================================================================
    m6_id = machine_id_map.get("M6", uuid4())
    s6_records: list[Telemetry] = []
    # Temperature rises from 72°C to 98°C (> 95°C critical threshold, drift rate > 20°C/hr).
    ref_energy_6 = 0.0
    for i in range(120):
        t = start_time + timedelta(seconds=i * 10)
        p = 90.0
        ref_energy_6 += p * (10.0 / 3600.0)
        temp = 72.0 + (i / 119.0) * 26.0  # 72°C -> 98°C
        s6_records.append(
            Telemetry(
                id=uuid4(),
                machine_id=m6_id,
                timestamp=t,
                active_power=p,
                current=130.0,
                voltage=415.0,
                power_factor=0.90,
                cumulative_energy=600.0 + ref_energy_6,
                temperature=temp,
                rpm=1480.0,
                load_percentage=68.0,
                operating_state="OPTIMAL",
            )
        )

    scenarios.append(
        ValidationScenario(
            scenario_id="SCENARIO_6_TEMPERATURE_ANOMALY",
            name="Sustained Temperature Saturation & Thermal Drift",
            description="132 kW Crusher with restricted cooling: temperature climbs from 72°C to 98°C (> critical limit).",
            machine_name="Primary Gyratory Crusher",
            machine_type="Crusher",
            rated_power_kw=132.0,
            expected=ExpectedOutcome(
                expected_wastage_reasons=[],
                expected_event_count=0,
                expected_health_warnings=["TEMPERATURE_HIGH_SUSTAINED"],
                expected_health_status="CRITICAL",
                min_health_score=20.0,
                max_health_score=40.0,  # Capped at 40 by critical warning
                ground_truth_label="TEMPERATURE_ANOMALY",
            ),
            telemetry_records=s6_records,
            reference_energy_kwh=round(ref_energy_6, 4),
            reference_wasted_kwh=None,
        )
    )

    # =========================================================================
    # SCENARIO 7: RPM Instability & Belt Slip (Crusher 132 kW)
    # =========================================================================
    m7_id = machine_id_map.get("M7", uuid4())
    s7_records: list[Telemetry] = []
    # RPM unstable with heavy jitter (CV = 0.12 > 0.08 warning threshold).
    ref_energy_7 = 0.0
    for i in range(120):
        t = start_time + timedelta(seconds=i * 10)
        p = 88.0
        ref_energy_7 += p * (10.0 / 3600.0)
        rpm_jitter = ((i % 7) - 3) * 60.0  # 1300 to 1660 RPM swings
        s7_records.append(
            Telemetry(
                id=uuid4(),
                machine_id=m7_id,
                timestamp=t,
                active_power=p,
                current=128.0,
                voltage=415.0,
                power_factor=0.91,
                cumulative_energy=700.0 + ref_energy_7,
                temperature=66.0,
                rpm=1480.0 + rpm_jitter,
                load_percentage=66.0,
                operating_state="OPTIMAL",
            )
        )

    scenarios.append(
        ValidationScenario(
            scenario_id="SCENARIO_7_RPM_INSTABILITY",
            name="Rotational Speed Instability (Belt Slip)",
            description="132 kW Crusher with transmission belt slip causing high RPM jitter (CV=0.12).",
            machine_name="Vibrating Screen Drive",
            machine_type="Screen",
            rated_power_kw=75.0,
            expected=ExpectedOutcome(
                expected_wastage_reasons=[],
                expected_event_count=0,
                expected_health_warnings=["RPM_FLUCTUATION_OR_SLIP"],
                expected_health_status="WARNING",
                min_health_score=50.0,
                max_health_score=70.0,
                ground_truth_label="RPM_INSTABILITY",
            ),
            telemetry_records=s7_records,
            reference_energy_kwh=round(ref_energy_7, 4),
            reference_wasted_kwh=None,
        )
    )

    # =========================================================================
    # SCENARIO 8: Vibration Sensor Status (Unmeasured Channel Check)
    # =========================================================================
    m8_id = machine_id_map.get("M8", uuid4())
    s8_records: list[Telemetry] = []
    # Standard healthy telemetry without accelerometer.
    for i in range(120):
        t = start_time + timedelta(seconds=i * 10)
        s8_records.append(
            Telemetry(
                id=uuid4(),
                machine_id=m8_id,
                timestamp=t,
                active_power=85.0,
                current=125.0,
                voltage=415.0,
                power_factor=0.91,
                cumulative_energy=800.0 + (i * 0.23),
                temperature=64.0,
                rpm=1480.0,
                load_percentage=65.0,
                operating_state="OPTIMAL",
            )
        )

    scenarios.append(
        ValidationScenario(
            scenario_id="SCENARIO_8_VIBRATION_STATUS",
            name="Vibration Sensor Retrofit Status Verification",
            description="Confirms engine correctly reports vibration as unmeasured without generating false alarms.",
            machine_name="Ball Mill Primary Drive",
            machine_type="Mill",
            rated_power_kw=250.0,
            expected=ExpectedOutcome(
                expected_wastage_reasons=[],
                expected_event_count=0,
                expected_health_warnings=[],
                expected_health_status="HEALTHY",
                min_health_score=85.0,
                max_health_score=100.0,
                ground_truth_label="NORMAL",
            ),
            telemetry_records=s8_records,
            reference_energy_kwh=27.6,
            reference_wasted_kwh=None,
        )
    )

    # =========================================================================
    # SCENARIO 9: Single-Sample Transient Spike (Robustness Edge Case)
    # =========================================================================
    m9_id = machine_id_map.get("M9", uuid4())
    s9_records: list[Telemetry] = []
    # 120 samples: sample 50 has a single transient spike of 165 kW / 98°C for 10s, then returns to 85 kW.
    for i in range(120):
        t = start_time + timedelta(seconds=i * 10)
        is_spike = i == 50
        p = 165.0 if is_spike else 85.0
        temp = 98.0 if is_spike else 65.0
        s9_records.append(
            Telemetry(
                id=uuid4(),
                machine_id=m9_id,
                timestamp=t,
                active_power=p,
                current=p * 1.5,
                voltage=415.0,
                power_factor=0.90,
                cumulative_energy=900.0 + (i * 0.24),
                temperature=temp,
                rpm=1480.0,
                load_percentage=65.0,
                operating_state="OPTIMAL",
            )
        )

    scenarios.append(
        ValidationScenario(
            scenario_id="SCENARIO_9_SINGLE_SPIKE_TRANSIENT",
            name="Transient Single-Sample Spike Immunity",
            description="Verifies that isolated 10s electrical or thermal spikes do not trigger sustained wastage or critical health alarms.",
            machine_name="Feed Crusher Backup",
            machine_type="Crusher",
            rated_power_kw=132.0,
            expected=ExpectedOutcome(
                expected_wastage_reasons=[],  # Filtered out by sustained duration criteria
                expected_event_count=0,
                expected_alert_count=0,
                expected_health_warnings=[],
                expected_health_status="HEALTHY",
                min_health_score=80.0,
                max_health_score=100.0,
                ground_truth_label="NORMAL",
            ),
            telemetry_records=s9_records,
            reference_energy_kwh=28.3,
            reference_wasted_kwh=None,
        )
    )

    # =========================================================================
    # SCENARIO 10: Insufficient Data Safeguard (Coverage Edge Case)
    # =========================================================================
    m10_id = machine_id_map.get("M10", uuid4())
    s10_records: list[Telemetry] = []
    # Only 5 samples (50 seconds) — strictly below MINIMUM_HEALTH_TELEMETRY_SAMPLES (30)
    for i in range(5):
        t = start_time + timedelta(seconds=i * 10)
        s10_records.append(
            Telemetry(
                id=uuid4(),
                machine_id=m10_id,
                timestamp=t,
                active_power=40.0,
                current=60.0,
                voltage=415.0,
                power_factor=0.88,
                cumulative_energy=1000.0 + i,
                temperature=60.0,
                rpm=1480.0,
                load_percentage=50.0,
                operating_state="OPTIMAL",
            )
        )

    scenarios.append(
        ValidationScenario(
            scenario_id="SCENARIO_10_INSUFFICIENT_DATA",
            name="Insufficient Telemetry Safeguard",
            description="Confirms that sparse telemetry (< 30 samples, < 1.0 hr) strictly returns INSUFFICIENT_DATA and None score.",
            machine_name="Auxiliary Sump Pump",
            machine_type="Pump",
            rated_power_kw=55.0,
            expected=ExpectedOutcome(
                expected_wastage_reasons=[],
                expected_event_count=0,
                expected_health_warnings=[],
                expected_health_status="INSUFFICIENT_DATA",
                min_health_score=None,
                max_health_score=None,
                ground_truth_label="INSUFFICIENT_DATA",
            ),
            telemetry_records=s10_records,
            reference_energy_kwh=0.55,
            reference_wasted_kwh=None,
        )
    )

    return scenarios

