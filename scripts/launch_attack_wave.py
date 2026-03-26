from __future__ import annotations

import argparse
import json
import random
import string
import threading
import time
import urllib.error
import urllib.request


def post_json(url: str, payload: dict, retries: int = 2, timeout: float = 8.0) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST", headers={"Content-Type": "application/json"})
    last_error: Exception | None = None
    for _ in range(max(1, retries + 1)):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except Exception as exc:
            last_error = exc
            time.sleep(0.15)
    raise RuntimeError(f"request failed: {last_error}")


def get_json(url: str, retries: int = 4, timeout: float = 8.0) -> dict:
    last_error: Exception | None = None
    for _ in range(max(1, retries + 1)):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except Exception as exc:
            last_error = exc
            time.sleep(0.25)
    raise RuntimeError(f"request failed: {last_error}")


def random_username() -> str:
    suffix = "".join(random.choices(string.digits, k=4))
    return f"intruder_{suffix}"


def trap_worker(base_url: str, stop_at: float, worker_id: int) -> None:
    trap_url = f"{base_url}/trap/login"
    while time.time() < stop_at:
        payload = {"username": random_username(), "password": "redteam!2026"}
        try:
            post_json(trap_url, payload)
        except Exception:
            pass
        time.sleep(random.uniform(0.02, 0.12) + worker_id * 0.001)


def main() -> None:
    parser = argparse.ArgumentParser(description="Launch a demo attack wave against Sentinel-Econ lab backend.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="Backend base URL")
    parser.add_argument("--duration", type=int, default=25, help="Wave duration in seconds")
    parser.add_argument("--workers", type=int, default=8, help="Concurrent trap workers")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    duration = max(8, min(args.duration, 300))
    workers = max(1, min(args.workers, 30))

    print(f"[+] Launching scenario on {base_url}")
    try:
        launch_result = post_json(
            f"{base_url}/api/scenario/launch",
            {
                "attack_seconds": max(10, duration // 2),
                "defense_seconds": max(8, duration // 3),
                "recovery_seconds": max(6, duration // 4),
                "trap_rate_per_sec": max(3, workers // 2),
            },
        )
        print("[+] Scenario:", launch_result)
    except urllib.error.URLError as exc:
        print(f"[!] Failed to launch scenario: {exc}")
        return

    stop_at = time.time() + duration
    threads: list[threading.Thread] = []
    for i in range(workers):
        thread = threading.Thread(target=trap_worker, args=(base_url, stop_at, i), daemon=True)
        threads.append(thread)
        thread.start()

    for thread in threads:
        thread.join()

    print("[+] Attack wave finished, fetching final report...")
    try:
        report = get_json(f"{base_url}/api/report/current")
        incident = report.get("incident_summary", {})
        economic = report.get("economic", {})
        print(f"    Total attacks: {incident.get('total_attacks')}")
        print(f"    Honeypot hits: {incident.get('honeypot_hits')}")
        print(f"    Total loss (DZD): {economic.get('total_loss')}")
    except Exception as exc:
        print(f"[!] Could not fetch report: {exc}")


if __name__ == "__main__":
    main()
