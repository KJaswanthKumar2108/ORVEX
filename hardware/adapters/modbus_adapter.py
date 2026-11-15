from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import logging
import struct
import time
from typing import Any, Protocol

from hardware.adapters.base import BaseSensorAdapter
from hardware.models import RawReading, SensorConnectionStatus, SensorHealth

logger = logging.getLogger(__name__)


def calculate_modbus_crc16(data: bytes) -> int:
    """Calculate standard Modbus RTU CRC-16 using polynomial 0xA001."""
    crc = 0xFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return crc


@dataclass(frozen=True, slots=True)
class ModbusRegisterMapping:
    """Describes how to query a physical measurement from a Modbus device."""

    start_register: int
    num_registers: int = 2  # Standard 32-bit float = 2 x 16-bit registers
    function_code: int = 0x04  # 0x04 = Read Input Registers, 0x03 = Read Holding Registers
    scale_factor: float = 1.0
    byte_order: str = ">f"  # Standard Big-Endian IEEE 754 float


@dataclass(frozen=True, slots=True)
class ModbusMeterProfile:
    """Standardized register profile for a commercial 3-phase power meter."""

    name: str
    voltage: ModbusRegisterMapping | None = None
    current: ModbusRegisterMapping | None = None
    active_power: ModbusRegisterMapping | None = None
    reactive_power: ModbusRegisterMapping | None = None
    apparent_power: ModbusRegisterMapping | None = None
    power_factor: ModbusRegisterMapping | None = None
    cumulative_energy: ModbusRegisterMapping | None = None
    frequency: ModbusRegisterMapping | None = None


# Profile for Eastron SDM630 Modbus 3-Phase Energy Meter
# Documented Eastron registers (Input Registers, 0x04, 32-bit IEEE 754 float)
SDM630_PROFILE = ModbusMeterProfile(
    name="Eastron SDM630",
    voltage=ModbusRegisterMapping(start_register=0x0000, function_code=0x04),  # Line 1 to N (Volts)
    current=ModbusRegisterMapping(start_register=0x0006, function_code=0x04),  # Line 1 Current (Amps)
    active_power=ModbusRegisterMapping(start_register=0x0034, function_code=0x04, scale_factor=0.001),  # Total System Power (Watts -> kW)
    apparent_power=ModbusRegisterMapping(start_register=0x0038, function_code=0x04, scale_factor=0.001),  # Total System VA -> kVA
    reactive_power=ModbusRegisterMapping(start_register=0x003C, function_code=0x04, scale_factor=0.001),  # Total System VAr -> kVAR
    power_factor=ModbusRegisterMapping(start_register=0x003E, function_code=0x04),  # Total System PF
    cumulative_energy=ModbusRegisterMapping(start_register=0x0156, function_code=0x04),  # Total Active Energy (kWh)
)


class SerialTransport(Protocol):
    """Protocol for serial communication abstraction."""

    def open(self) -> None: ...
    def close(self) -> None: ...
    def write(self, data: bytes) -> int: ...
    def read(self, size: int) -> bytes: ...
    @property
    def is_open(self) -> bool: ...


class PySerialTransport:
    """Concrete SerialTransport using pyserial for physical RS-485 interfaces."""

    def __init__(
        self,
        port: str,
        baudrate: int = 9600,
        parity: str = "N",
        stopbits: int = 1,
        timeout: float = 1.0,
    ) -> None:
        self.port = port
        self.baudrate = baudrate
        self.parity = parity
        self.stopbits = stopbits
        self.timeout = timeout
        self._serial: Any = None

    def open(self) -> None:
        import serial

        self._serial = serial.Serial(
            port=self.port,
            baudrate=self.baudrate,
            parity=self.parity,
            stopbits=self.stopbits,
            bytesize=8,
            timeout=self.timeout,
        )

    def close(self) -> None:
        if self._serial is not None and self._serial.is_open:
            self._serial.close()
        self._serial = None

    def write(self, data: bytes) -> int:
        if self._serial is None or not self._serial.is_open:
            raise IOError("Serial port is not open.")
        return self._serial.write(data)

    def read(self, size: int) -> bytes:
        if self._serial is None or not self._serial.is_open:
            raise IOError("Serial port is not open.")
        return self._serial.read(size)

    @property
    def is_open(self) -> bool:
        return self._serial is not None and getattr(self._serial, "is_open", False)


class ModbusRtuAdapter(BaseSensorAdapter):
    """Industrial Modbus RTU / RS-485 master adapter for digital energy meters.

    Queries 3-phase energy meters over isolated RS-485 serial buses using standard
    Modbus RTU frames (Function 0x03/0x04) and converts raw IEEE 754 registers into
    canonical ORVEX physical measurements.
    """

    def __init__(
        self,
        transport: SerialTransport | None = None,
        port: str = "COM3",
        baudrate: int = 9600,
        parity: str = "N",
        stopbits: int = 1,
        unit_id: int = 1,
        timeout: float = 1.0,
        profile: ModbusMeterProfile = SDM630_PROFILE,
        rated_power_kw: float | None = 132.0,
    ) -> None:
        if transport is not None:
            self._transport = transport
        else:
            self._transport = PySerialTransport(
                port=port,
                baudrate=baudrate,
                parity=parity,
                stopbits=stopbits,
                timeout=timeout,
            )

        self._unit_id = unit_id
        self._profile = profile
        self._rated_power_kw = rated_power_kw
        self._health = SensorHealth()

    def connect(self) -> bool:
        try:
            self._transport.open()
            self._health.status = SensorConnectionStatus.CONNECTED
            logger.info("Connected Modbus RTU adapter on %s (meter: %s)", getattr(self._transport, "port", "custom"), self._profile.name)
            return True
        except Exception as err:
            self._health.record_failure(datetime.now(timezone.utc), f"Failed to open serial port: {err}")
            logger.warning("Could not open Modbus serial port: %s", err)
            return False

    def disconnect(self) -> None:
        try:
            self._transport.close()
        except Exception as err:
            logger.debug("Error while closing serial transport: %s", err)
        self._health.record_disconnected()

    @property
    def is_connected(self) -> bool:
        return self._transport.is_open

    def get_health(self) -> SensorHealth:
        return self._health

    def build_modbus_request(self, function_code: int, start_reg: int, num_regs: int) -> bytes:
        """Construct standard 8-byte Modbus RTU request frame with CRC-16."""
        header = struct.pack(">BBHH", self._unit_id, function_code, start_reg, num_regs)
        crc = calculate_modbus_crc16(header)
        # CRC is appended Little-Endian (low byte first, then high byte)
        return header + struct.pack("<H", crc)

    def parse_modbus_response(self, response: bytes, expected_function_code: int) -> bytes:
        """Validate Modbus RTU response frame CRC and extract data payload bytes."""
        if len(response) < 5:
            raise ValueError(f"Modbus response too short ({len(response)} bytes).")

        # 1. CRC check
        payload_and_header = response[:-2]
        expected_crc = calculate_modbus_crc16(payload_and_header)
        received_crc = struct.unpack("<H", response[-2:])[0]
        if expected_crc != received_crc:
            raise ValueError(f"Modbus CRC mismatch: expected 0x{expected_crc:04X}, received 0x{received_crc:04X}.")

        # 2. Check for Modbus Exception response (function code with MSB set)
        resp_unit_id, resp_func = struct.unpack(">BB", response[:2])
        if resp_func == (expected_function_code | 0x80):
            exception_code = response[2]
            raise ValueError(f"Modbus Exception response (code 0x{exception_code:02X}).")

        if resp_func != expected_function_code:
            raise ValueError(f"Unexpected Modbus function code 0x{resp_func:02X} (expected 0x{expected_function_code:02X}).")

        byte_count = response[2]
        data_bytes = response[3 : 3 + byte_count]
        return data_bytes

    def read_metric(self, mapping: ModbusRegisterMapping | None) -> float | None:
        """Query a single measurement from the meter via Modbus RTU."""
        if mapping is None:
            return None

        request = self.build_modbus_request(
            function_code=mapping.function_code,
            start_reg=mapping.start_register,
            num_regs=mapping.num_registers,
        )

        self._transport.write(request)
        # Expected response: 1(ID) + 1(Func) + 1(ByteCount) + 4(Data) + 2(CRC) = 9 bytes
        expected_len = 3 + (mapping.num_registers * 2) + 2
        response = self._transport.read(expected_len)

        data = self.parse_modbus_response(response, expected_function_code=mapping.function_code)
        raw_val = struct.unpack(mapping.byte_order, data)[0]
        return float(raw_val * mapping.scale_factor)

    def read(self) -> RawReading:
        now = datetime.now(timezone.utc)
        if not self.is_connected:
            self._health.record_failure(now, "Serial port not open.")
            return RawReading(timestamp=now, is_valid=False, error_message="Serial port not open.")

        try:
            v = self.read_metric(self._profile.voltage)
            i = self.read_metric(self._profile.current)
            p = self.read_metric(self._profile.active_power)
            q = self.read_metric(self._profile.reactive_power)
            s = self.read_metric(self._profile.apparent_power)
            pf = self.read_metric(self._profile.power_factor)
            e = self.read_metric(self._profile.cumulative_energy)

            # Derive load percent and operating state if active power is available
            load_percent = None
            operating_state = None
            if p is not None and self._rated_power_kw and self._rated_power_kw > 0:
                load_percent = min(100.0, max(0.0, (p / self._rated_power_kw) * 100.0))
                if p < 0.5:
                    operating_state = "STOPPED"
                elif p < (self._rated_power_kw * 0.15):
                    operating_state = "IDLE"
                elif load_percent < 30.0:
                    operating_state = "LOW_LOAD"
                else:
                    operating_state = "RUNNING"

            self._health.record_success(now)
            return RawReading(
                timestamp=now,
                voltage=v,
                current=i,
                active_power=p,
                reactive_power=q,
                apparent_power=s,
                power_factor=pf,
                cumulative_energy=e,
                rpm=None,  # Not provided by electrical power meter
                temperature=None,  # Requires external PT100/RTD
                load_percent=load_percent,
                operating_state=operating_state,
                is_valid=True,
            )

        except Exception as err:
            self._health.record_failure(now, f"Modbus acquisition error: {err}")
            return RawReading(
                timestamp=now,
                is_valid=False,
                error_message=f"Modbus acquisition error: {err}",
            )

