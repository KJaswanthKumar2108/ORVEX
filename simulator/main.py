import argparse
import sys
import time
from datetime import datetime, timezone
from uuid import UUID, uuid4

from simulator.client import TelemetryApiClient, TelemetryClientError
from simulator.config import (
    CONSOLE_SUMMARY_INTERVAL_SECONDS,
    DEFAULT_API_URL,
    DEFAULT_DURATION_SECONDS,
    DEFAULT_INTERVAL_SECONDS,
)
from simulator.generator import TelemetryGenerator
from simulator.models import Scenario
from simulator.mqtt_client import TelemetryMqttClient, TelemetryMqttClientError
from simulator.profiles import DEFAULT_PROFILE
from simulator.scenarios import ScenarioController


def positive_float(value: str) -> float:
    try:
        parsed = float(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("must be a number") from error
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Send simulated ORVEX telemetry to the existing API or MQTT broker.")
    parser.add_argument(
        "--scenario",
        choices=[scenario.value for scenario in Scenario],
        default=Scenario.NORMAL_OPERATION.value,
    )
    parser.add_argument("--interval", type=positive_float, default=DEFAULT_INTERVAL_SECONDS)
    parser.add_argument("--duration", type=positive_float, default=DEFAULT_DURATION_SECONDS)
    parser.add_argument("--machine-id", type=UUID)
    parser.add_argument("--sensor-id", type=UUID)
    parser.add_argument(
        "--transport",
        choices=["http", "mqtt"],
        default="http",
        help="Telemetry ingestion transport mode (default: http)",
    )
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help="HTTP ingestion API URL")
    parser.add_argument("--mqtt-host", default="localhost", help="MQTT broker host (default: localhost)")
    parser.add_argument("--mqtt-port", type=int, default=1883, help="MQTT broker port (default: 1883)")
    parser.add_argument("--mqtt-topic-prefix", default="orvex", help="MQTT topic prefix (default: orvex)")
    parser.add_argument("--mqtt-username", default=None, help="MQTT broker username")
    parser.add_argument("--mqtt-password", default=None, help="MQTT broker password")
    return parser


def run_simulation(args: argparse.Namespace) -> int:
    machine_id = args.machine_id or uuid4()
    scenario = Scenario(args.scenario)
    generator = TelemetryGenerator(
        machine_id=machine_id,
        sensor_id=args.sensor_id,
        profile=DEFAULT_PROFILE,
        interval_seconds=args.interval,
    )
    controller = ScenarioController(scenario, DEFAULT_PROFILE)

    is_mqtt = args.transport == "mqtt"
    client = None
    if is_mqtt:
        client = TelemetryMqttClient(
            host=args.mqtt_host,
            port=args.mqtt_port,
            topic_prefix=args.mqtt_topic_prefix,
            username=args.mqtt_username,
            password=args.mqtt_password,
        )
    else:
        client = TelemetryApiClient(args.api_url)

    print("ORVEX Telemetry Simulator")
    print(f"Transport: {args.transport.upper()}")
    print(f"Machine: {machine_id}")
    if args.sensor_id:
        print(f"Sensor: {args.sensor_id}")
    print(f"Scenario: {scenario.name}")
    print(f"Interval: {args.interval:g}s | Duration: {args.duration:g}s")
    if is_mqtt:
        print(f"MQTT Broker: {args.mqtt_host}:{args.mqtt_port} (Topic: {args.mqtt_topic_prefix}/v1/machines/{machine_id}/telemetry)")
    else:
        print(f"API: {args.api_url.rstrip('/')}/api/v1/telemetry")

    started_at = time.monotonic()
    next_sample_at = started_at
    last_summary_at = started_at
    sent = 0
    power_sum = 0.0

    try:
        while time.monotonic() - started_at < args.duration:
            elapsed = time.monotonic() - started_at
            step = controller.step_at(elapsed)
            record = generator.generate(
                step.state,
                timestamp=datetime.now(timezone.utc),
                state_elapsed_seconds=step.state_elapsed_seconds,
                power_multiplier=step.power_multiplier,
                load_fraction=step.load_fraction,
            )
            client.send(record)
            sent += 1
            power_sum += record.active_power
            print(
                f"[{record.timestamp:%H:%M:%SZ}] state={record.operating_state.value} "
                f"load={record.load_percent:.1f}% power={record.active_power:.1f}kW "
                f"rpm={record.rpm:.0f}"
            )

            now = time.monotonic()
            if now - last_summary_at >= CONSOLE_SUMMARY_INTERVAL_SECONDS:
                print(f"Summary: sent={sent} avg_power={power_sum / sent:.1f}kW")
                last_summary_at = now

            next_sample_at += args.interval
            if next_sample_at < now:
                next_sample_at = now
            time.sleep(max(0.0, next_sample_at - time.monotonic()))
    finally:
        if is_mqtt and hasattr(client, "close"):
            client.close()

    average_power = power_sum / sent if sent else 0.0
    print(f"Complete: sent={sent} avg_power={average_power:.1f}kW")
    return sent


def main() -> int:
    args = build_parser().parse_args()
    try:
        run_simulation(args)
    except KeyboardInterrupt:
        print("\nSimulator stopped by user.")
        return 130
    except (TelemetryClientError, TelemetryMqttClientError) as error:
        print(f"Simulator stopped: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
