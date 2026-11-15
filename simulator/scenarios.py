from dataclasses import dataclass

from simulator.models import OperatingState, Scenario
from simulator.profiles import MachineProfile


@dataclass(frozen=True, slots=True)
class ScenarioStep:
    state: OperatingState
    state_elapsed_seconds: float
    power_multiplier: float = 1.0
    load_fraction: float | None = None


class ScenarioController:
    def __init__(self, scenario: Scenario, profile: MachineProfile) -> None:
        self.scenario = scenario
        self.profile = profile

    def step_at(self, elapsed_seconds: float) -> ScenarioStep:
        elapsed = max(0.0, elapsed_seconds)
        startup = self.profile.starting_duration_seconds

        if self.scenario is Scenario.NORMAL_OPERATION:
            if elapsed < startup:
                return ScenarioStep(OperatingState.STARTING, elapsed)
            phase = (elapsed - startup) % 100.0
            if phase < 45.0:
                return ScenarioStep(OperatingState.RUNNING, phase)
            if phase < 65.0:
                return ScenarioStep(OperatingState.LOW_LOAD, phase - 45.0)
            if phase < 78.0:
                return ScenarioStep(OperatingState.IDLE, phase - 65.0)
            return ScenarioStep(OperatingState.HIGH_LOAD, phase - 78.0)

        if self.scenario is Scenario.IDLE_WASTAGE:
            if elapsed < startup:
                return ScenarioStep(OperatingState.STARTING, elapsed)
            return ScenarioStep(OperatingState.IDLE, elapsed - startup, power_multiplier=2.8)

        if self.scenario is Scenario.LOW_LOAD_WASTAGE:
            if elapsed < startup:
                return ScenarioStep(OperatingState.STARTING, elapsed)
            return ScenarioStep(
                OperatingState.LOW_LOAD,
                elapsed - startup,
                power_multiplier=1.9,
                load_fraction=0.25,
            )

        if self.scenario is Scenario.ABNORMAL_POWER:
            if elapsed < startup:
                return ScenarioStep(OperatingState.STARTING, elapsed)
            return ScenarioStep(
                OperatingState.RUNNING,
                elapsed - startup,
                power_multiplier=1.5,
                load_fraction=0.62,
            )

        return self._cycling_step(elapsed, startup)

    def _cycling_step(self, elapsed: float, startup: float) -> ScenarioStep:
        cycle_seconds = startup + 8.0 + 10.0
        phase = elapsed % cycle_seconds
        if phase < startup:
            return ScenarioStep(OperatingState.STARTING, phase)
        if phase < startup + 8.0:
            return ScenarioStep(OperatingState.RUNNING, phase - startup)
        return ScenarioStep(OperatingState.STOPPED, phase - startup - 8.0)