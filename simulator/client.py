import json
from ipaddress import ip_address
import socket
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, Request, build_opener

from simulator.config import (
    DEFAULT_HTTP_TIMEOUT_SECONDS,
    HTTP_RETRY_COUNT,
    HTTP_RETRY_DELAY_SECONDS,
)
from simulator.models import TelemetryRecord


class TelemetryClientError(RuntimeError):
    """Raised when the ingestion API cannot accept a telemetry record."""


class TelemetryApiClient:
    def __init__(
        self,
        api_url: str,
        timeout_seconds: float = DEFAULT_HTTP_TIMEOUT_SECONDS,
        retries: int = HTTP_RETRY_COUNT,
        retry_delay_seconds: float = HTTP_RETRY_DELAY_SECONDS,
    ) -> None:
        if timeout_seconds <= 0 or retries < 0 or retry_delay_seconds < 0:
            raise ValueError("HTTP timeout must be positive and retry settings cannot be negative")
        self._endpoint = f"{api_url.rstrip('/')}/api/v1/telemetry"
        self._timeout_seconds = timeout_seconds
        self._retries = retries
        self._retry_delay_seconds = retry_delay_seconds
        hostname = urlsplit(api_url).hostname or ""
        try:
            is_loopback = ip_address(hostname).is_loopback
        except ValueError:
            is_loopback = hostname == "localhost" or hostname.endswith(".localhost")
        self._opener = build_opener(ProxyHandler({})) if is_loopback else build_opener()

    def send(self, telemetry: TelemetryRecord) -> None:
        body = json.dumps(telemetry.to_payload(), allow_nan=False).encode("utf-8")
        request = Request(
            self._endpoint,
            data=body,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )

        for attempt in range(self._retries + 1):
            try:
                with self._opener.open(request, timeout=self._timeout_seconds) as response:
                    if response.status == 201:
                        return
                    detail = response.read().decode("utf-8", errors="replace")[:300]
                    raise TelemetryClientError(
                        f"Telemetry API returned unexpected HTTP {response.status}: {detail}"
                    )
            except HTTPError as error:
                detail = error.read().decode("utf-8", errors="replace")[:300]
                message = f"Telemetry API returned HTTP {error.code}: {detail}"
                if error.code not in {429, 500, 502, 503, 504} or attempt >= self._retries:
                    raise TelemetryClientError(message) from error
            except (URLError, TimeoutError, socket.timeout) as error:
                if attempt >= self._retries:
                    raise TelemetryClientError(f"Could not reach telemetry API: {error}") from error

            time.sleep(self._retry_delay_seconds * (2**attempt))

        raise TelemetryClientError("Telemetry API request failed after retries")