from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Literal

SecurityState = Literal["normal", "attack", "defense", "recovery"]


@dataclass(slots=True)
class EconomySnapshot:
    current_loss_per_sec: float
    incremental_loss: float
    total_loss: float
    active_attack_seconds: float


class EconomicEngine:
    def __init__(self) -> None:
        self._total_loss = 0.0
        self._last_ts = time.monotonic()
        self._attack_clock = 0.0

    def update(self, state: SecurityState, severity: float) -> EconomySnapshot:
        now = time.monotonic()
        dt = max(0.01, now - self._last_ts)
        self._last_ts = now

        current_rate = self._rate_for_state(state, severity)
        incremental = current_rate * dt if state != "normal" else 0.0
        self._total_loss += incremental

        if state in ("attack", "defense", "recovery"):
            self._attack_clock += dt
        else:
            self._attack_clock = 0.0

        return EconomySnapshot(
            current_loss_per_sec=current_rate,
            incremental_loss=incremental,
            total_loss=self._total_loss,
            active_attack_seconds=self._attack_clock,
        )

    @staticmethod
    def _rate_for_state(state: SecurityState, severity: float) -> float:
        normalized = max(0.0, min(severity, 3.0))
        base = {
            "normal": 0.0,
            "attack": 1900.0,
            "defense": 800.0,
            "recovery": 260.0,
        }[state]
        return base * (1.0 + normalized * 0.6)
