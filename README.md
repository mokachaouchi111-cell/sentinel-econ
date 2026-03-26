# Sentinel-Econ (CODEX)

Prototype MVP for an active cyber defense digital twin:

- `FastAPI + Socket.IO` backend
- `Isolation Forest` anomaly detection
- Economic loss engine in `DZD`
- 3D "Galactic Network" visualization with `Three.js`
- Incident feed + honeypot telemetry + report export
- Raycasting tooltip + Hacker POV tab + attack UI overdrive + PDF report
- Modern panel controls (minimize/hide/focus mode) to avoid dashboard clutter
- Draggable HUD panels with saved layout and one-click reset
- Interactive 3D camera controls (drag orbit + wheel zoom + double-click reset)
- Quantum core upgrades: dual-core layering + hex shader shield + particle shield swarm
- Packet Inspector with live protocol/flags/ports/payload and honeypot rerouting status

## Quick Start

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open: [http://localhost:8000](http://localhost:8000)

## Environment (optional)

- `USE_SCAPY=true` to try live sniffing with Scapy
- `SCAPY_INTERFACE=<iface>` to force a specific network interface

If packet sniffing fails due to permissions, the app falls back to synthetic traffic generation.

## API Endpoints

- `GET /api/health`
- `GET /api/state`
- `GET /api/inspect/latest`
- `GET /api/incidents?limit=20`
- `GET /api/honeypot/events?limit=20`
- `GET /api/report/current`
- `GET /api/scenario/status`
- `POST /trap/login` (honeypot credential trap)
- `POST /api/scenario/launch`
- `POST /api/scenario/stop`
- `POST /api/simulate/attack`
- `POST /api/simulate/defense`
- `POST /api/simulate/recovery`
- `POST /api/simulate/normal`

## Automated Attack Demo

Run a realistic wave (scenario + concurrent honeypot hits):

```bash
python scripts/launch_attack_wave.py --base-url http://127.0.0.1:8000 --duration 30 --workers 10
```

## Project Layout

- `app/main.py` runtime, API, socket events
- `app/services/anomaly.py` Isolation Forest logic
- `app/services/state_machine.py` cyber-defense state transitions
- `app/services/economy.py` loss per second and cumulative loss
- `app/services/traffic.py` Scapy stream or synthetic stream
- `frontend/index.html` HUD + canvas
- `frontend/app.js` galaxy simulation + real-time behavior
- `frontend/styles.css` cyberpunk interface styling
- `scripts/launch_attack_wave.py` external attack wave generator for demo
