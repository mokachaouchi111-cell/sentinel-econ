from __future__ import annotations

from collections import Counter, deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from .state_machine import SecurityState


def _utc_now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


@dataclass(slots=True)
class IncidentSummary:
    total_events: int
    total_attacks: int
    total_defense_actions: int
    honeypot_hits: int
    top_sources: list[dict[str, Any]]


class IncidentCenter:
    def __init__(self, max_events: int = 250, max_honeypot: int = 300) -> None:
        self._events: deque[dict[str, Any]] = deque(maxlen=max_events)
        self._honeypot_events: deque[dict[str, Any]] = deque(maxlen=max_honeypot)
        self._attack_counter = 0
        self._defense_counter = 0

    def log_state_transition(
        self,
        from_state: SecurityState,
        to_state: SecurityState,
        reason: str,
        anomaly_score: float,
        severity: float,
        mode: str = "auto",
    ) -> dict[str, Any]:
        if to_state == "attack":
            self._attack_counter += 1
        if to_state == "defense":
            self._defense_counter += 1

        event = {
            "id": uuid4().hex[:12],
            "ts": _utc_now(),
            "type": "state_transition",
            "mode": mode,
            "from_state": from_state,
            "to_state": to_state,
            "reason": reason,
            "anomaly_score": round(anomaly_score, 4),
            "severity": round(severity, 4),
        }
        self._events.appendleft(event)
        return event

    def log_detection(self, message: str, anomaly_score: float, severity: float) -> dict[str, Any]:
        event = {
            "id": uuid4().hex[:12],
            "ts": _utc_now(),
            "type": "detection",
            "message": message,
            "anomaly_score": round(anomaly_score, 4),
            "severity": round(severity, 4),
        }
        self._events.appendleft(event)
        return event

    def log_honeypot_attempt(
        self,
        source_ip: str,
        username: str,
        user_agent: str,
        ok: bool = False,
    ) -> dict[str, Any]:
        event = {
            "id": uuid4().hex[:12],
            "ts": _utc_now(),
            "source_ip": source_ip,
            "username": username[:32],
            "user_agent": user_agent[:120],
            "result": "accepted" if ok else "blocked",
        }
        self._honeypot_events.appendleft(event)
        self._events.appendleft(
            {
                "id": uuid4().hex[:12],
                "ts": _utc_now(),
                "type": "honeypot",
                "message": f"Honeypot credential attempt from {source_ip}",
                "source_ip": source_ip,
                "username": username[:32],
            }
        )
        return event

    def latest_events(self, limit: int = 20) -> list[dict[str, Any]]:
        return list(self._events)[: max(1, min(limit, 100))]

    def latest_honeypot(self, limit: int = 20) -> list[dict[str, Any]]:
        return list(self._honeypot_events)[: max(1, min(limit, 100))]

    def summary(self) -> IncidentSummary:
        source_counts = Counter([item["source_ip"] for item in self._honeypot_events])
        top_sources = [{"source_ip": ip, "hits": hits} for ip, hits in source_counts.most_common(5)]
        return IncidentSummary(
            total_events=len(self._events),
            total_attacks=self._attack_counter,
            total_defense_actions=self._defense_counter,
            honeypot_hits=len(self._honeypot_events),
            top_sources=top_sources,
        )
