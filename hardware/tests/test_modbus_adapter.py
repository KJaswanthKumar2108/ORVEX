from __future__ import annotations

import struct
import pytest

from hardware.adapters.modbus_adapter import (
    ModbusMeterProfile,
    ModbusRegisterMapping,
    ModbusRtuAdapter,
    SDM630_PROFILE,
    SerialTransport,
    calculate_modbus_crc16,
)


class MockSerialTransport:
    """Mock serial transport for deterministic testing of Modbus RTU frames."""

    def __init__(self) -> None:
        self._is_open: bool = False
        self._write_buffer: bytearray = bytearray()
        self._read_queue: list[bytes] = []

    def open(self) -> None:
        self._is_open = True

    def close(self) -> None:
        self._is_open = False

    @property
    def is_open(self) -> bool:
        return self._is_open

    def write(self, data: bytes) -> int:
        if not self._is_open:
            raise IOError("Port not open.")
        self._write_buffer.extend(data)
        return len(data)

    def queue_response(self, response: bytes) -> None:
        self._read_queue.append(response)

    def read(self, size: int) -> bytes:
        if not self._is_open:
            raise IOError("Port not open.")
        if not self._read_queue:
            return b""
        resp = self._read_queue.pop(0)
        return resp[:size]


def make_modbus_float_response(unit_id: int, func: int, float_val: float) -> bytes:
    """Helper to synthesize a standard 9-byte Modbus RTU response with valid CRC."""
    # Data: 4 bytes float (Big-Endian)
    data = struct.pack(">f", float_val)
    # Header: Unit ID (1B) + Func (1B) + Byte Count (1B = 4)
    header = struct.pack(">BBB", unit_id, func, len(data))
    payload = header + data
    crc = calculate_modbus_crc16(payload)
    return payload + struct.pack("<H", crc)


class TestModbusAdapter:
    def test_crc16_calculation(self) -> None:
        # Standard Modbus test vector: 0x01, 0x04, 0x00, 0x00, 0x00, 0x02
        frame = bytes([0x01, 0x04, 0x00, 0x00, 0x00, 0x02])
        crc = calculate_modbus_crc16(frame)
        assert isinstance(crc, int)
        assert 0 <= crc <= 0xFFFF
        # Recalculating over frame + CRC (little endian) yields zero in standard cyclic check
        check_frame = frame + struct.pack("<H", crc)
        assert calculate_modbus_crc16(check_frame) == 0

    def test_build_modbus_request(self) -> None:
        transport = MockSerialTransport()
        adapter = ModbusRtuAdapter(transport=transport, unit_id=1)
        req = adapter.build_modbus_request(function_code=0x04, start_reg=0x0000, num_regs=2)
        assert len(req) == 8
        unit_id, func, reg, count = struct.unpack(">BBHH", req[:6])
        assert unit_id == 1
        assert func == 0x04
        assert reg == 0x0000
        assert count == 2

    def test_parse_modbus_response_valid(self) -> None:
        transport = MockSerialTransport()
        adapter = ModbusRtuAdapter(transport=transport, unit_id=1)

        resp = make_modbus_float_response(unit_id=1, func=0x04, float_val=415.5)
        data = adapter.parse_modbus_response(resp, expected_function_code=0x04)
        val = struct.unpack(">f", data)[0]
        assert round(val, 1) == 415.5

    def test_parse_modbus_response_crc_failure(self) -> None:
        transport = MockSerialTransport()
        adapter = ModbusRtuAdapter(transport=transport, unit_id=1)

        resp = bytearray(make_modbus_float_response(unit_id=1, func=0x04, float_val=415.5))
        # Corrupt one data byte
        resp[4] ^= 0xFF
        with pytest.raises(ValueError, match="Modbus CRC mismatch"):
            adapter.parse_modbus_response(bytes(resp), expected_function_code=0x04)

    def test_parse_modbus_exception_response(self) -> None:
        transport = MockSerialTransport()
        adapter = ModbusRtuAdapter(transport=transport, unit_id=1)

        # Exception response: Unit 1, Func 0x84 (0x04 | 0x80), Exception Code 0x02 (Illegal Data Address)
        exc_payload = bytes([0x01, 0x84, 0x02])
        crc = calculate_modbus_crc16(exc_payload)
        exc_frame = exc_payload + struct.pack("<H", crc)

        with pytest.raises(ValueError, match="Modbus Exception response"):
            adapter.parse_modbus_response(exc_frame, expected_function_code=0x04)

    def test_full_meter_read_with_mock_transport(self) -> None:
        transport = MockSerialTransport()
        # Profile reading Voltage, Current, Active Power (Watts->kW), Apparent, Reactive, PF, Energy
        adapter = ModbusRtuAdapter(
            transport=transport,
            unit_id=1,
            profile=SDM630_PROFILE,
            rated_power_kw=100.0,
        )
        assert adapter.connect()

        # Queue responses in the exact order read() queries them:
        # 1. Voltage (V): 415.2 V
        transport.queue_response(make_modbus_float_response(1, 0x04, 415.2))
        # 2. Current (A): 24.5 A
        transport.queue_response(make_modbus_float_response(1, 0x04, 24.5))
        # 3. Active Power (Watts): 16500.0 W (scale factor 0.001 -> 16.5 kW)
        transport.queue_response(make_modbus_float_response(1, 0x04, 16500.0))
        # 4. Reactive Power (VAr): 4200.0 VAr (scale 0.001 -> 4.2 kVAR)
        transport.queue_response(make_modbus_float_response(1, 0x04, 4200.0))
        # 5. Apparent Power (VA): 17000.0 VA (scale 0.001 -> 17.0 kVA)
        transport.queue_response(make_modbus_float_response(1, 0x04, 17000.0))
        # 6. Power Factor: 0.97
        transport.queue_response(make_modbus_float_response(1, 0x04, 0.97))
        # 7. Cumulative Energy (kWh): 5420.5 kWh
        transport.queue_response(make_modbus_float_response(1, 0x04, 5420.5))

        reading = adapter.read()
        assert reading.is_valid
        assert round(reading.voltage, 1) == 415.2
        assert round(reading.current, 1) == 24.5
        assert round(reading.active_power, 2) == 16.50
        assert round(reading.reactive_power, 2) == 4.20
        assert round(reading.apparent_power, 2) == 17.00
        assert round(reading.power_factor, 2) == 0.97
        assert round(reading.cumulative_energy, 1) == 5420.5
        # Derived fields
        assert round(reading.load_percent, 1) == 16.5  # 16.5 kW / 100 kW * 100
        assert reading.operating_state == "LOW_LOAD"
        # Unmeasured fields
        assert reading.rpm is None
        assert reading.temperature is None
