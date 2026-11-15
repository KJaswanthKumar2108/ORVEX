from __future__ import annotations

from datetime import datetime, timedelta, timezone
import math
import random
from typing import Set

from hardware.adapters.base import BaseSensorAdapter
from hardware.models import RawReading, SensorConnectionStatus, SensorHealth


class MockSensorAdapter(BaseSensorAdapter):
    """Mock sensor adapter for development, automated testing, and CI verification.

    Explicitly clearly labelled as a synthetic hardware simulator. Provides fault
    injection hooks to rigorously verify edge collector behavior under sensor
    disconnection, transmission dropouts, corrupted floats, and missing measurements.
    """

    def __init__(
        self,
        nominal_voltage: float = 415.0,
        nominal_current: float = 25.0,
        nominal_power_factor: float = 0.95,
        rated_power_kw: float = 132.0,
        initial_energy_kwh: float = 1000.0,
        unmeasured_fields: Set[str] | None = None,
        start_time: datetime | None = None,
        time_step_seconds: float = 1.0,
        nominal_operating_state: str | None = None,
    ) -> None:
        self._nominal_voltage = nominal_voltage
        self._nominal_current = nominal_current
        self._nominal_power_factor = nominal_power_factor
        self._rated_power_kw = rated_power_kw
        self._cumulative_energy = initial_energy_kwh
        self._unmeasured_fields = unmeasured_fields or {"temperature", "rpm"}
        self._simulated_time = start_time
        self._time_step_seconds = time_step_seconds
        self._nominal_operating_state = nominal_operating_state

        self._connected: bool = False
        self._health = SensorHealth()

        # Fault injection toggles
        self._force_disconnected: bool = False
        self._force_comm_error: bool = False
        self._force_stale: bool = False
        self._nan_fields: Set[str] = set()
        self._out_of_range_fields: dict[str, float] = {}
        self._last_reading: RawReading | None = None

    def connect(self) -> bool:
        if self._force_disconnected:
            self._connected = False
            self._health.record_disconnected()
            return False
        self._connected = True
        self._health.status = SensorConnectionStatus.CONNECTED
        return True

    def disconnect(self) -> None:
        self._connected = False
        self._health.record_disconnected()

    @property
    def is_connected(self) -> bool:
        return self._connected and not self._force_disconnected

    def get_health(self) -> SensorHealth:
        return self._health

    # --- Fault Injection Controls ---

    def simulate_disconnection(self, disconnected: bool = True) -> None:
        """Simulate physical cable disconnection or power loss."""
        self._force_disconnected = disconnected
        if disconnected:
            self._connected = False
            self._health.record_disconnected()
        else:
            self.connect()

    def simulate_comm_error(self, comm_error: bool = True) -> None:
        """Simulate RS-485 bus noise, checksum mismatch, or framing error."""
        self._force_comm_error = comm_error

    def simulate_stale(self, stale: bool = True) -> None:
        """Simulate frozen sensor registers repeating the exact same timestamp/reading."""
        self._force_stale = stale

    def inject_nan(self, *field_names: str) -> None:
        """Inject IEEE 754 NaN values into specified field names."""
        self._nan_fields.update(field_names)

    def clear_nan_injections(self) -> None:
        self._nan_fields.clear()

    def inject_out_of_range(self, field_name: str, value: float) -> None:
        """Inject values outside valid domain limits (e.g. pf=1.8, voltage=-10)."""
        self._out_of_range_fields[field_name] = value

    def clear_out_of_range_injections(self) -> None:
        self._out_of_range_fields.clear()

    def set_unmeasured_fields(self, field_names: Set[str]) -> None:
        """Configure which optional metrics are unmeasured/omitted by the meter."""
        self._unmeasured_fields = set(field_names)

    # --- Acquisition Logic ---

    def read(self) -> RawReading:
        if self._simulated_time is not None:
            now = self._simulated_time
            self._simulated_time = now + timedelta(seconds=self._time_step_seconds)
        else:
            now = datetime.now(timezone.utc)

        if not self.is_connected:
            self._health.record_failure(now, "Sensor is disconnected.")
            return RawReading(
                timestamp=now,
                is_valid=False,
                error_message="Sensor is disconnected.",
            )

        if self._force_comm_error:
            self._health.record_failure(now, "Modbus framing error: CRC checksum mismatch.")
            return RawReading(
                timestamp=now,
                is_valid=False,
                error_message="Modbus framing error: CRC checksum mismatch.",
            )

        if self._force_stale and self._last_reading is not None:
            # Repeat prior reading without updating timestamp or values
            return self._last_reading

        # Generate realistic physical electrical measurements with minor variance
        v_noise = random.uniform(-1.5, 1.5)
        voltage = max(0.0, self._nominal_voltage + v_noise)

        i_noise = random.uniform(-0.5, 0.5)
        current = max(0.0, self._nominal_current + i_noise)

        pf_noise = random.uniform(-0.01, 0.01)
        pf = max(-1.0, min(1.0, self._nominal_power_factor + pf_noise))

        # 3-phase active power calculation: P = sqrt(3) * V * I * pf / 1000 (kW)
        active_power = (math.sqrt(3.0) * voltage * current * pf) / 1000.0
        apparent_power = (math.sqrt(3.0) * voltage * current) / 1000.0
        # Reactive power: Q = sqrt(S^2 - P^2)
        q_squared = max(0.0, apparent_power**2 - active_power**2)
        reactive_power = math.sqrt(q_squared)

        # Accumulate energy: 1 second interval = P / 3600 kWh
        self._cumulative_energy += active_power / 3600.0

        # Derived load percentage: (P / P_rated) * 100
        load_percent = min(100.0, (active_power / self._rated_power_kw) * 100.0)

        # Operating state inferred or explicitly configured
        if self._nominal_operating_state is not None:
            operating_state = self._nominal_operating_state
        elif active_power < 0.5:
            operating_state = "STOPPED"
        elif active_power < (self._rated_power_kw * 0.15):
            operating_state = "IDLE"
        elif load_percent < 30.0:
            operating_state = "LOW_LOAD"
        else:
            operating_state = "RUNNING"

        # Apply unmeasured fields (remain None)
        v_val = None if "voltage" in self._unmeasured_fields else voltage
        i_val = None if "current" in self._unmeasured_fields else current
        p_val = None if "active_power" in self._unmeasured_fields else active_power
        q_val = None if "reactive_power" in self._unmeasured_fields else reactive_power
        s_val = None if "apparent_power" in self._unmeasured_fields else apparent_power
        pf_val = None if "power_factor" in self._unmeasured_fields else pf
        e_val = None if "cumulative_energy" in self._unmeasured_fields else self._cumulative_energy
        temp_val = None if "temperature" in self._unmeasured_fields else 48.5
        rpm_val = None if "rpm" in self._unmeasured_fields else 1485.0
        load_val = None if "load_percent" in self._unmeasured_fields else load_percent
        state_val = None if "operating_state" in self._unmeasured_fields else operating_state

        # Apply NaN injections
        if "voltage" in self._nan_fields:
            v_val = float("nan")
        if "current" in self._nan_fields:
            i_val = float("nan")
        if "active_power" in self._nan_fields:
            p_val = float("nan")
        if "power_factor" in self._nan_fields:
            pf_val = float("nan")
        if "temperature" in self._nan_fields:
            temp_val = float("nan")

        # Apply out of range injections
        for fld, val in self._out_of_range_fields.items():
            if fld == "voltage":
                v_val = val
            elif fld == "current":
                i_val = val
            elif fld == "active_power":
                p_val = val
            elif fld == "power_factor":
                pf_val = val
            elif fld == "load_percent":
                load_val = val

        reading = RawReading(
            timestamp=now,
            voltage=v_val,
            current=i_val,
            active_power=p_val,
            reactive_power=q_val,
            apparent_power=s_val,
            power_factor=pf_val,
            cumulative_energy=e_val,
            rpm=rpm_val,
            temperature=temp_val,
            load_percent=load_val,
            operating_state=state_val,
            is_valid=True,
            error_message=None,
        )

        self._health.record_success(now)
        self._last_reading = reading
        return reading
