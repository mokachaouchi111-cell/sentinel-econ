from __future__ import annotations

import asyncio
import random
from contextlib import suppress
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import socketio
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .services.anomaly import AnomalyDetector
from .services.economy import EconomicEngine
from .services.incidents import IncidentCenter
from .services.state_machine import DefenseStateMachine, SecurityState
from .services.traffic import PacketInspect, stream_from_env

TICK_SECONDS = 1.0
PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = PROJECT_ROOT / "frontend"

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
api = FastAPI(title="Sentinel-Econ", version="0.1.0")

api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if FRONTEND_DIR.exists():
    api.mount("/frontend", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")


@api.get("/")
async def index() -> FileResponse:
    target = FRONTEND_DIR / "index.html"
    if not target.exists():
        raise HTTPException(status_code=404, detail="frontend/index.html not found")
    return FileResponse(target)


@api.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@api.get("/api/state")
async def state() -> dict[str, Any]:
    return runtime.current_payload


@api.get("/api/inspect/latest")
async def inspect_latest() -> dict[str, Any]:
    return runtime.current_packet_inspect


@api.get("/api/incidents")
async def incidents(limit: int = 20) -> dict[str, Any]:
    return {"events": runtime.incidents.latest_events(limit)}


@api.get("/api/honeypot/events")
async def honeypot_events(limit: int = 20) -> dict[str, Any]:
    return {"events": runtime.incidents.latest_honeypot(limit)}


@api.get("/api/report/current")
async def report_current() -> dict[str, Any]:
    summary = runtime.incidents.summary()
    return {
        "generated_at_utc": datetime.now(tz=timezone.utc).isoformat(),
        "state": runtime.current_payload.get("state"),
        "threat_type": runtime.current_payload.get("threat_type"),
        "anomaly_score": runtime.current_payload.get("anomaly_score"),
        "confidence": runtime.current_payload.get("confidence"),
        "economic": runtime.current_payload.get("econ"),
        "metrics": {
            "packet_rate": runtime.current_payload.get("packet_rate"),
            "syn_ratio": runtime.current_payload.get("syn_ratio"),
            "src_entropy": runtime.current_payload.get("src_entropy"),
            "dst_entropy": runtime.current_payload.get("dst_entropy"),
        },
        "packet_inspect": runtime.current_packet_inspect,
        "incident_summary": {
            "total_events": summary.total_events,
            "total_attacks": summary.total_attacks,
            "total_defense_actions": summary.total_defense_actions,
            "honeypot_hits": summary.honeypot_hits,
            "top_sources": summary.top_sources,
        },
        "last_events": runtime.incidents.latest_events(10),
    }


class HoneypotAttempt(BaseModel):
    username: str
    password: str


class ScenarioRequest(BaseModel):
    attack_seconds: int = 16
    defense_seconds: int = 10
    recovery_seconds: int = 8
    trap_rate_per_sec: int = 4


@api.post("/trap/login")
async def trap_login(payload: HoneypotAttempt, request: Request) -> dict[str, str]:
    source_ip = request.client.host if request.client else "unknown"
    ua = request.headers.get("user-agent", "unknown")
    runtime.incidents.log_honeypot_attempt(
        source_ip=source_ip,
        username=payload.username,
        user_agent=ua,
        ok=False,
    )
    return {"status": "invalid_credentials"}


@api.get("/api/scenario/status")
async def scenario_status() -> dict[str, Any]:
    task_running = runtime.scenario_task is not None and not runtime.scenario_task.done()
    return {"running": runtime.scenario_running or task_running}


@api.post("/api/scenario/launch")
async def scenario_launch(config: ScenarioRequest) -> dict[str, Any]:
    if runtime.scenario_task is not None and not runtime.scenario_task.done():
        raise HTTPException(status_code=409, detail="Scenario is already running")
    runtime.scenario_task = asyncio.create_task(run_attack_scenario(config))
    return {
        "ok": True,
        "message": "Scenario launched",
        "config": config.model_dump(),
    }


@api.post("/api/scenario/stop")
async def scenario_stop() -> dict[str, Any]:
    if runtime.scenario_task is None or runtime.scenario_task.done():
        return {"ok": True, "message": "No active scenario"}
    runtime.scenario_task.cancel()
    with suppress(asyncio.CancelledError):
        await runtime.scenario_task
    return {"ok": True, "message": "Scenario stopped"}


@api.post("/api/simulate/{mode}")
async def simulate(mode: str) -> dict[str, Any]:
    allowed: set[SecurityState] = {"normal", "attack", "defense", "recovery"}
    if mode not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid mode. Use one of: {sorted(allowed)}")
    previous = runtime.current_state
    snapshot = runtime.state_machine.force_state(mode)  # type: ignore[arg-type]
    runtime.current_state = snapshot.state
    runtime.incidents.log_state_transition(
        from_state=previous,
        to_state=snapshot.state,
        reason="Manual simulation command",
        anomaly_score=float(runtime.current_payload.get("anomaly_score", 0.0)),
        severity=float(runtime.current_payload.get("anomaly_score", 0.0)),
        mode="manual",
    )
    return {"ok": True, "forced_state": snapshot.state}


@sio.event
async def connect(sid: str, environ: dict[str, Any]) -> None:
    await sio.emit("network_data", runtime.current_payload, to=sid)
    await sio.emit("packet_inspect", runtime.current_packet_inspect, to=sid)


@sio.event
async def disconnect(sid: str) -> None:
    _ = sid


class Runtime:
    def __init__(self) -> None:
        self.detector = AnomalyDetector(warmup_samples=180)
        self.state_machine = DefenseStateMachine()
        self.economy = EconomicEngine()
        self.traffic = stream_from_env()
        self.incidents = IncidentCenter()
        self.current_state: SecurityState = "normal"
        self.tick = 0
        self.last_detection_tick = 0
        self.loop_task: asyncio.Task[None] | None = None
        self.scenario_task: asyncio.Task[None] | None = None
        self.scenario_running = False
        self.current_packet_inspect: dict[str, Any] = {
            "packet_id": "0",
            "status": "Normal",
            "threat_type": "Normal Traffic",
            "source": {"ip": "0.0.0.0", "port": 0},
            "destination": {"ip": "0.0.0.0", "port": 0},
            "protocol": "TCP",
            "flags": "-",
            "technical_details": "Waiting for traffic stream...",
            "payload_sample": "n/a",
            "routed_to": "production-core",
        }
        self.current_payload: dict[str, Any] = {
            "tick": 0,
            "state": "normal",
            "threat_type": "Normal Traffic",
            "anomaly_score": 0.0,
            "confidence": 0.0,
            "packet_rate": 0.0,
            "avg_packet_size": 0.0,
            "syn_ratio": 0.0,
            "econ": {
                "current_loss_per_sec": 0.0,
                "incremental_loss": 0.0,
                "total_loss": 0.0,
                "active_attack_seconds": 0.0,
            },
            "galaxy": {
                "hostile_ratio": 0.0,
                "explosion_intensity": 0.0,
                "shield_strength": 0.0,
                "core_color": "#2fd5ff",
            },
            "ops": {
                "auto_defense_status": "Monitoring",
                "recommended_action": "No action needed",
            },
            "incident": {
                "total_events": 0,
                "total_attacks": 0,
                "total_defense_actions": 0,
                "honeypot_hits": 0,
            },
            "scenario": {
                "running": False,
            },
            "packet_inspect": self.current_packet_inspect,
        }


runtime = Runtime()


def _threat_label(state: SecurityState, anomaly_score: float) -> str:
    if state == "attack":
        return "Distributed Intrusion Burst"
    if state == "defense":
        return "Active Mitigation"
    if state == "recovery":
        return "Post-Incident Stabilization"
    if anomaly_score > 0.1:
        return "Suspicious Activity"
    return "Normal Traffic"


def _galaxy_payload(state: SecurityState, severity: float) -> dict[str, float | str]:
    if state == "attack":
        return {
            "hostile_ratio": min(0.42, 0.14 + severity * 0.12),
            "explosion_intensity": 0.8 + severity * 0.55,
            "shield_strength": 0.0,
            "core_color": "#ff244d",
        }
    if state == "defense":
        return {
            "hostile_ratio": min(0.25, 0.10 + severity * 0.07),
            "explosion_intensity": 0.45,
            "shield_strength": 0.95,
            "core_color": "#3d80ff",
        }
    if state == "recovery":
        return {
            "hostile_ratio": 0.08,
            "explosion_intensity": 0.16,
            "shield_strength": 0.35,
            "core_color": "#37c9ff",
        }
    return {
        "hostile_ratio": 0.03,
        "explosion_intensity": 0.03,
        "shield_strength": 0.0,
        "core_color": "#2fd5ff",
    }


def _transition_reason(prev: SecurityState, current: SecurityState) -> str:
    mapping = {
        ("normal", "attack"): "Anomaly threshold exceeded",
        ("attack", "defense"): "Active defense policy engaged",
        ("defense", "recovery"): "Containment complete, entering cleanup",
        ("recovery", "normal"): "Traffic normalized",
    }
    return mapping.get((prev, current), f"State changed from {prev} to {current}")


def _ops_status(state: SecurityState) -> tuple[str, str]:
    if state == "attack":
        return ("Incident Active", "Enable containment and inspect source patterns")
    if state == "defense":
        return ("Defense Running", "Keep mitigation active and monitor impact")
    if state == "recovery":
        return ("Recovery In Progress", "Validate service health and audit indicators")
    return ("Monitoring", "No action needed")


def _inspect_payload(packet: PacketInspect, state: SecurityState) -> dict[str, Any]:
    destination_ip = packet.destination_ip
    destination_port = packet.destination_port
    routed_to = packet.routed_to
    threat_type = packet.threat_type
    details = packet.technical_details
    status = packet.status

    if state == "defense":
        destination_ip = "192.168.56.20"
        destination_port = 2222
        routed_to = "honeypot-decoy"
        if threat_type == "Normal Traffic":
            threat_type = "Suspicious Flow Reroute"
        details = "Active deception: packet rerouted to honeypot for containment and attribution."
        status = "Rerouted"

    return {
        "packet_id": packet.packet_id,
        "status": status,
        "threat_type": threat_type,
        "source": {
            "ip": packet.source_ip,
            "port": packet.source_port,
        },
        "destination": {
            "ip": destination_ip,
            "port": destination_port,
        },
        "protocol": packet.protocol,
        "flags": packet.flags,
        "technical_details": details,
        "payload_sample": packet.payload_sample,
        "routed_to": routed_to,
    }


def _random_source_ip() -> str:
    return f"185.{random.randint(10, 220)}.{random.randint(1, 254)}.{random.randint(1, 254)}"


def _inject_honeypot_attempts(rate: int) -> None:
    count = max(1, rate)
    for _ in range(count):
        runtime.incidents.log_honeypot_attempt(
            source_ip=_random_source_ip(),
            username=f"intruder{random.randint(100, 999)}",
            user_agent="Sentinel-Attack-Simulator/1.0",
            ok=False,
        )


def _force_state_for_scenario(next_state: SecurityState, hold_seconds: float, reason: str) -> None:
    previous = runtime.current_state
    snapshot = runtime.state_machine.force_state(next_state, hold_seconds=hold_seconds)
    runtime.current_state = snapshot.state
    runtime.incidents.log_state_transition(
        from_state=previous,
        to_state=snapshot.state,
        reason=reason,
        anomaly_score=float(runtime.current_payload.get("anomaly_score", 0.0)),
        severity=float(runtime.current_payload.get("anomaly_score", 0.0)),
        mode="scenario",
    )


async def run_attack_scenario(config: ScenarioRequest) -> None:
    runtime.scenario_running = True
    try:
        attack_seconds = max(8, min(config.attack_seconds, 120))
        defense_seconds = max(6, min(config.defense_seconds, 120))
        recovery_seconds = max(5, min(config.recovery_seconds, 120))
        trap_rate = max(1, min(config.trap_rate_per_sec, 25))

        _force_state_for_scenario(
            next_state="attack",
            hold_seconds=float(attack_seconds + 2),
            reason="Scenario launched: coordinated attack wave detected",
        )
        for _ in range(attack_seconds):
            _inject_honeypot_attempts(trap_rate + random.randint(0, 2))
            await asyncio.sleep(1)

        _force_state_for_scenario(
            next_state="defense",
            hold_seconds=float(defense_seconds + 2),
            reason="Scenario progression: automated defense and containment",
        )
        for _ in range(defense_seconds):
            _inject_honeypot_attempts(max(1, trap_rate // 2))
            await asyncio.sleep(1)

        _force_state_for_scenario(
            next_state="recovery",
            hold_seconds=float(recovery_seconds + 1),
            reason="Scenario progression: post-incident recovery stage",
        )
        for _ in range(recovery_seconds):
            await asyncio.sleep(1)

        _force_state_for_scenario(
            next_state="normal",
            hold_seconds=2.0,
            reason="Scenario completed: system returned to stable mode",
        )
    finally:
        runtime.scenario_running = False
        runtime.scenario_task = None


async def telemetry_loop() -> None:
    while True:
        runtime.tick += 1
        previous_state = runtime.current_state
        traffic = runtime.traffic.next_snapshot(runtime.current_state)
        inspection = runtime.traffic.next_inspection(runtime.current_state)
        anomaly = runtime.detector.evaluate(traffic.vector)
        transition = runtime.state_machine.update(anomaly)
        runtime.current_state = transition.state
        economy = runtime.economy.update(transition.state, anomaly.severity)
        ops_status, recommendation = _ops_status(transition.state)
        runtime.current_packet_inspect = _inspect_payload(inspection, transition.state)

        if anomaly.is_anomaly and anomaly.model_ready and runtime.tick - runtime.last_detection_tick >= 6:
            runtime.incidents.log_detection(
                message="Anomalous traffic cluster detected",
                anomaly_score=anomaly.score,
                severity=anomaly.severity,
            )
            runtime.last_detection_tick = runtime.tick

        if transition.changed:
            runtime.incidents.log_state_transition(
                from_state=previous_state,
                to_state=transition.state,
                reason=_transition_reason(previous_state, transition.state),
                anomaly_score=anomaly.score,
                severity=anomaly.severity,
                mode="auto",
            )

        incident_summary = runtime.incidents.summary()

        runtime.current_payload = {
            "tick": runtime.tick,
            "state": transition.state,
            "threat_type": _threat_label(transition.state, anomaly.score),
            "anomaly_score": round(anomaly.score, 4),
            "confidence": round(anomaly.confidence, 4),
            "model_ready": anomaly.model_ready,
            "packet_rate": round(traffic.packet_rate, 2),
            "avg_packet_size": round(traffic.avg_size, 2),
            "syn_ratio": round(traffic.syn_ratio, 4),
            "src_entropy": round(traffic.src_entropy, 4),
            "dst_entropy": round(traffic.dst_entropy, 4),
            "state_elapsed_sec": round(transition.elapsed_in_state, 2),
            "econ": {
                "current_loss_per_sec": round(economy.current_loss_per_sec, 2),
                "incremental_loss": round(economy.incremental_loss, 2),
                "total_loss": round(economy.total_loss, 2),
                "active_attack_seconds": round(economy.active_attack_seconds, 2),
            },
            "galaxy": _galaxy_payload(transition.state, anomaly.severity),
            "ops": {
                "auto_defense_status": ops_status,
                "recommended_action": recommendation,
            },
            "incident": {
                "total_events": incident_summary.total_events,
                "total_attacks": incident_summary.total_attacks,
                "total_defense_actions": incident_summary.total_defense_actions,
                "honeypot_hits": incident_summary.honeypot_hits,
            },
            "scenario": {
                "running": runtime.scenario_running,
            },
            "packet_inspect": runtime.current_packet_inspect,
        }

        await sio.emit("network_data", runtime.current_payload)
        await sio.emit("packet_inspect", runtime.current_packet_inspect)
        await asyncio.sleep(TICK_SECONDS)


@api.on_event("startup")
async def on_startup() -> None:
    runtime.loop_task = asyncio.create_task(telemetry_loop())


@api.on_event("shutdown")
async def on_shutdown() -> None:
    if runtime.loop_task:
        runtime.loop_task.cancel()
        with suppress(asyncio.CancelledError):
            await runtime.loop_task
    if runtime.scenario_task:
        runtime.scenario_task.cancel()
        with suppress(asyncio.CancelledError):
            await runtime.scenario_task
    runtime.traffic.stop()


app = socketio.ASGIApp(socketio_server=sio, other_asgi_app=api)
