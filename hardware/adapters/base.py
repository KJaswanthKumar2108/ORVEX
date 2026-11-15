from __future__ import annotations

from abc import ABC, abstractmethod

from hardware.models import RawReading, SensorHealth


class BaseSensorAdapter(ABC):
    """Abstract base class for all physical and simulated sensor adapters.

    Enforces separation between low-level hardware acquisition and upstream
    MQTT transport. Implementations handle protocol nuances (e.g. Modbus RTU,
    GPIO, serial), raw byte decoding, and device health tracking.
    """

    @abstractmethod
    def connect(self) -> bool:
        """Establish connection to the hardware interface or sensor bus.

        Returns:
            True if connection succeeded, False otherwise.
        """

    @abstractmethod
    def disconnect(self) -> None:
        """Gracefully release hardware connection and close descriptors."""

    @abstractmethod
    def read(self) -> RawReading:
        """Acquire a physical measurement sample.

        Returns:
            RawReading with populated measurement fields or failure flags.
            Optional unmeasured metrics must remain None (never 0.0).
        """

    @property
    @abstractmethod
    def is_connected(self) -> bool:
        """Return True if the adapter is currently connected to the sensor."""

    @abstractmethod
    def get_health(self) -> SensorHealth:
        """Return current sensor connection and acquisition health metrics."""

