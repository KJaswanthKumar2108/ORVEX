from __future__ import annotations

from datetime import datetime, timezone
import logging
import signal
import sys
import time
from typing import Any
from uuid import UUID

from hardware.adapters.base import BaseSensorAdapter
from hardware.adapters.mock_adapter import MockSensorAdapter
from hardware.adapters.modbus_adapter import ModbusRtuAdapter, SDM630_PROFILE
from hardware.config import EdgeConfig, get_edge_config
from hardware.models import RawReading, SensorConnectionStatus
from hardware.publisher import EdgeMqttPublisher, EdgePublishError

logger = logging.getLogger(__name__)


class HardwareCollectorDaemon:
    """Industrial edge data collector daemon.

    Coordinates physical sensor acquisition via a BaseSensorAdapter and forwards
    validated telemetry samples to the ORVEX MQTT Gateway.
    """

    def __init__(
        self,
        config: EdgeConfig,
        adapter: BaseSensorAdapter | None = None,
        publisher: EdgeMqttPublisher | None = None,
    ) -> None:
        self._config = config
        self._publisher = publisher or EdgeMqttPublisher(self._config)

        if adapter is not None:
            self._adapter = adapter
        elif self._config.adapter_type == "modbus":
            self._adapter = ModbusRtuAdapter(
                port=self._config.modbus_port,
                baudrate=self._config.modbus_baudrate,
                parity=self._config.modbus_parity,
                stopbits=self._config.modbus_stopbits,
                unit_id=self._config.modbus_unit_id,
                timeout=self._config.modbus_timeout,
                profile=SDM630_PROFILE,
                rated_power_kw=self._config.rated_power_kw or 132.0,
            )
        else:
            self._adapter = MockSensorAdapter(
                rated_power_kw=self._config.rated_power_kw or 132.0,
            )

        self._running: bool = False
        self._samples_collected: int = 0
        self._samples_published: int = 0
        self._errors_count: int = 0

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def adapter(self) -> BaseSensorAdapter:
        return self._adapter

    @property
    def publisher(self) -> EdgeMqttPublisher:
        return self._publisher

    def collect_and_publish_once(self) -> bool:
        """Acquire a single reading from the adapter and publish it to MQTT.

        Returns:
            True if sample was acquired and published successfully, False otherwise.
        """
        # 1. Acquire reading
        reading: RawReading = self._adapter.read()
        self._samples_collected += 1

        if not reading.is_valid:
            self._errors_count += 1
            logger.warning("Sensor acquisition dropped invalid reading: %s", reading.error_message)
            return False

        # 2. Convert to ORVEX telemetry schema payload
        payload = reading.to_telemetry_payload(
            machine_id=self._config.machine_id,
            sensor_id=self._config.sensor_id,
        )

        # 3. Publish to MQTT Gateway
        try:
            self._publisher.publish_reading(payload)
            self._samples_published += 1
            return True
        except EdgePublishError as err:
            self._errors_count += 1
            logger.error("Failed to publish telemetry to MQTT: %s", err)
            return False
        except Exception as err:
            self._errors_count += 1
            logger.exception("Unexpected error publishing telemetry: %s", err)
            return False

    def start(self) -> None:
        """Start the collector loop."""
        logger.info(
            "Starting ORVEX Edge Collector (Machine: %s, Adapter: %s, Interval: %.1fs)...",
            self._config.machine_id,
            self._config.adapter_type,
            self._config.poll_interval_seconds,
        )

        # Connect adapter
        if not self._adapter.connect():
            logger.warning("Initial sensor adapter connection failed; daemon will retry during read cycle.")

        # Connect MQTT publisher
        if not self._publisher.connect():
            logger.warning("Initial MQTT broker connection failed; publisher will retry in background.")

        self._running = True

        def _handle_exit(sig: int, frame: Any) -> None:
            logger.info("Termination signal %s received. Stopping collector...", sig)
            self.stop()

        signal.signal(signal.SIGINT, _handle_exit)
        signal.signal(signal.SIGTERM, _handle_exit)

        try:
            while self._running:
                loop_start = time.time()
                self.collect_and_publish_once()

                elapsed = time.time() - loop_start
                sleep_time = max(0.05, self._config.poll_interval_seconds - elapsed)
                time.sleep(sleep_time)
        finally:
            self.stop()

    def stop(self) -> None:
        """Gracefully shut down adapter and publisher."""
        if not self._running:
            return
        self._running = False
        logger.info(
            "Stopping ORVEX Edge Collector (collected: %d, published: %d, errors: %d)...",
            self._samples_collected,
            self._samples_published,
            self._errors_count,
        )
        self._adapter.disconnect()
        self._publisher.disconnect()


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    config = get_edge_config()
    daemon = HardwareCollectorDaemon(config)
    try:
        daemon.start()
        return 0
    except KeyboardInterrupt:
        daemon.stop()
        return 0
    except Exception as exc:
        logger.exception("Fatal collector error: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())

