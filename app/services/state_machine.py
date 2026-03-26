from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Literal

from .anomaly import AnomalyResult

SecurityState = Literal["normal", "attack", "defense", "recovery"]


@dataclass(slots=True)
class StateSnapshot:
    state: SecurityState
    changed: bool
    elapsed_in_state: float


class DefenseStateMachine:
    def __init__(self) -> None:
        self.state: SecurityState = "normal"
        self.state_since = time.monotonic()
        self.anomaly_streak = 0
        self.calm_streak = 0
        self._force_until = 0.0

    def force_state(self, new_state: SecurityState, hold_seconds: float = 8.0) -> StateSnapshot:
        now = time.monotonic()
        changed = self.state != new_state
        self.state = new_state
        self.state_since = now
        self._force_until = now + hold_seconds
        self.anomaly_streak = 0
        self.calm_streak = 0
        return StateSnapshot(state=self.state, changed=changed, elapsed_in_state=0.0)

    def update(self, anomaly: AnomalyResult) -> StateSnapshot:
        now = time.monotonic()
        elapsed = now - self.state_since

        if now < self._force_until:
            return StateSnapshot(state=self.state, changed=False, elapsed_in_state=elapsed)

        if anomaly.is_anomaly:
            self.anomaly_streak += 1
            self.calm_streak = 0
        else:
            self.calm_streak += 1
            self.anomaly_streak = max(0, self.anomaly_streak - 1)

        previous = self.state

        if self.state == "normal":
            if self.anomaly_streak >= 3 or anomaly.severity > 1.3:
                self.state = "attack"
        elif self.state == "attack":
            if elapsed >= 6.0:
                self.state = "defense"
        elif self.state == "defense":
            if elapsed >= 5.0:
                self.state = "recovery"
        elif self.state == "recovery":
            if self.calm_streak >= 6 and elapsed >= 4.0:
                self.state = "normal"

        changed = previous != self.state
        if changed:
            self.state_since = now
            elapsed = 0.0

        return StateSnapshot(state=self.state, changed=changed, elapsed_in_state=elapsed)
