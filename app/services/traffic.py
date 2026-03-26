from __future__ import annotations

import math
import os
import random
from collections import Counter, deque
from dataclasses import dataclass
from typing import Literal

SecurityState = Literal["normal", "attack", "defense", "recovery"]

try:
    from scapy.all import AsyncSniffer, IP, TCP, UDP

    SCAPY_AVAILABLE = True
except Exception:
    SCAPY_AVAILABLE = False
    AsyncSniffer = None  # type: ignore[assignment]
    IP = None  # type: ignore[assignment]
    TCP = None  # type: ignore[assignment]
    UDP = None  # type: ignore[assignment]


@dataclass(slots=True)
class PacketSnapshot:
    packet_rate: float
    avg_size: float
    syn_ratio: float
    src_entropy: float
    dst_entropy: float

    @property
    def vector(self) -> list[float]:
        return [self.packet_rate, self.avg_size, self.syn_ratio, self.src_entropy, self.dst_entropy]


@dataclass(slots=True)
class PacketInspect:
    packet_id: str
    status: str
    threat_type: str
    source_ip: str
    source_port: int
    destination_ip: str
    destination_port: int
    protocol: str
    flags: str
    technical_details: str
    payload_sample: str
    routed_to: str


class TrafficStream:
    def __init__(self, use_scapy: bool = False, interface: str | None = None) -> None:
        self.use_scapy = use_scapy and SCAPY_AVAILABLE
        self.interface = interface
        self._sniffer = None
        self._started = False

        self._packets = 0
        self._size_sum = 0
        self._syn_packets = 0
        self._src_window: deque[str] = deque(maxlen=1500)
        self._dst_window: deque[str] = deque(maxlen=1500)
        self._inspection_queue: deque[PacketInspect] = deque(maxlen=800)
        self._packet_counter = 0

        if self.use_scapy:
            self._start_sniffer()

    def _start_sniffer(self) -> None:
        if not SCAPY_AVAILABLE:
            return
        try:
            self._sniffer = AsyncSniffer(
                prn=self._consume_packet,
                store=False,
                iface=self.interface,
                filter="ip",
            )
            self._sniffer.start()
            self._started = True
        except Exception:
            self._started = False
            self.use_scapy = False

    def _consume_packet(self, packet) -> None:
        try:
            if IP not in packet:  # type: ignore[operator]
                return
            ip = packet[IP]  # type: ignore[index]
            self._packets += 1
            self._size_sum += int(getattr(ip, "len", len(packet)))
            self._src_window.append(str(ip.src))
            self._dst_window.append(str(ip.dst))

            protocol = "IP"
            source_port = 0
            destination_port = 0
            flags_label = "-"
            payload_sample = "n/a"
            status = "Normal"
            threat = "Normal Traffic"
            details = "Packet matches baseline flow."

            if TCP in packet:  # type: ignore[operator]
                tcp = packet[TCP]  # type: ignore[index]
                flags = int(tcp.flags)
                syn_flag = 0x02
                ack_flag = 0x10
                protocol = "TCP"
                source_port = int(getattr(tcp, "sport", 0))
                destination_port = int(getattr(tcp, "dport", 0))
                flags_label = str(getattr(tcp, "flags", "-"))
                payload_sample = bytes(tcp.payload)[:16].hex(" ") or "no-payload"
                if flags & syn_flag and not flags & ack_flag:
                    self._syn_packets += 1
                    status = "Malicious"
                    threat = "TCP SYN Flood (DDoS)"
                    details = "High-frequency SYN without ACK handshake completion."
                elif "F" in flags_label:
                    status = "Suspicious"
                    threat = "Connection Teardown Burst"
                    details = "FIN packets detected in unusual pattern."
            elif UDP in packet:  # type: ignore[operator]
                udp = packet[UDP]  # type: ignore[index]
                protocol = "UDP"
                source_port = int(getattr(udp, "sport", 0))
                destination_port = int(getattr(udp, "dport", 0))
                payload_sample = bytes(udp.payload)[:16].hex(" ") or "no-payload"
                if len(bytes(udp.payload)) > 450:
                    status = "Suspicious"
                    threat = "UDP Amplification Pattern"
                    details = "Large UDP payload may indicate amplification traffic."

            self._packet_counter += 1
            self._inspection_queue.append(
                PacketInspect(
                    packet_id=str(self._packet_counter),
                    status=status,
                    threat_type=threat,
                    source_ip=str(ip.src),
                    source_port=source_port,
                    destination_ip=str(ip.dst),
                    destination_port=destination_port,
                    protocol=protocol,
                    flags=flags_label,
                    technical_details=details,
                    payload_sample=payload_sample,
                    routed_to="production-core",
                )
            )
        except Exception:
            return

    def next_snapshot(self, state: SecurityState) -> PacketSnapshot:
        if self._started:
            return self._next_from_sniffer()
        return self._synthetic_snapshot(state)

    def next_inspection(self, state: SecurityState) -> PacketInspect:
        if self._started and self._inspection_queue:
            return self._inspection_queue.pop()
        return self._synthetic_inspection(state)

    def stop(self) -> None:
        if self._sniffer is not None:
            try:
                self._sniffer.stop()
            except Exception:
                pass

    def _next_from_sniffer(self) -> PacketSnapshot:
        packet_rate = float(self._packets)
        avg_size = float(self._size_sum / max(1, self._packets))
        syn_ratio = float(self._syn_packets / max(1, self._packets))
        src_entropy = _shannon_entropy(self._src_window)
        dst_entropy = _shannon_entropy(self._dst_window)

        self._packets = 0
        self._size_sum = 0
        self._syn_packets = 0

        return PacketSnapshot(
            packet_rate=packet_rate,
            avg_size=avg_size,
            syn_ratio=syn_ratio,
            src_entropy=src_entropy,
            dst_entropy=dst_entropy,
        )

    @staticmethod
    def _synthetic_snapshot(state: SecurityState) -> PacketSnapshot:
        if state == "normal":
            packet_rate = random.gauss(95, 20)
            avg_size = random.gauss(600, 70)
            syn_ratio = random.uniform(0.05, 0.13)
            src_entropy = random.uniform(3.1, 3.9)
            dst_entropy = random.uniform(2.8, 3.5)
        elif state == "attack":
            packet_rate = random.gauss(620, 110)
            avg_size = random.gauss(1030, 170)
            syn_ratio = random.uniform(0.46, 0.82)
            src_entropy = random.uniform(1.3, 2.4)
            dst_entropy = random.uniform(0.9, 1.9)
        elif state == "defense":
            packet_rate = random.gauss(370, 80)
            avg_size = random.gauss(850, 130)
            syn_ratio = random.uniform(0.24, 0.48)
            src_entropy = random.uniform(2.0, 2.9)
            dst_entropy = random.uniform(1.7, 2.5)
        else:
            packet_rate = random.gauss(170, 35)
            avg_size = random.gauss(690, 90)
            syn_ratio = random.uniform(0.12, 0.25)
            src_entropy = random.uniform(2.7, 3.4)
            dst_entropy = random.uniform(2.2, 3.1)

        return PacketSnapshot(
            packet_rate=max(1.0, packet_rate),
            avg_size=max(64.0, avg_size),
            syn_ratio=min(1.0, max(0.0, syn_ratio)),
            src_entropy=max(0.1, src_entropy),
            dst_entropy=max(0.1, dst_entropy),
        )

    def _synthetic_inspection(self, state: SecurityState) -> PacketInspect:
        self._packet_counter += 1
        source_ip = _random_public_like_ip()
        destination_ip = "10.0.0.10"
        source_port = random.randint(1024, 65535)
        destination_port = 443
        protocol = "TCP"
        flags = "ACK"
        status = "Normal"
        threat = "Normal Traffic"
        details = "No abnormal packet signature."
        payload = _fake_payload_hex(14)
        routed_to = "production-core"

        if state == "attack":
            flags = "S"
            status = "Malicious"
            threat = "TCP SYN Flood (DDoS)"
            source_port = random.randint(1200, 65000)
            destination_port = random.choice([80, 443, 8080])
            details = "SYN flag burst with incomplete ACK response pattern."
            payload = _fake_payload_hex(20)
        elif state == "defense":
            flags = random.choice(["S", "S", "A"])
            status = "Blocked"
            threat = "Rerouted To Honeypot"
            destination_ip = "192.168.56.20"
            destination_port = 2222
            details = "Packet redirected to deception node for behavioral analysis."
            routed_to = "honeypot-decoy"
            payload = _fake_payload_hex(18)
        elif state == "recovery":
            flags = "A"
            status = "Stabilizing"
            threat = "Post-Incident Cleanup"
            details = "Residual suspicious packets under low-risk monitoring."
            payload = _fake_payload_hex(10)

        return PacketInspect(
            packet_id=str(self._packet_counter),
            status=status,
            threat_type=threat,
            source_ip=source_ip,
            source_port=source_port,
            destination_ip=destination_ip,
            destination_port=destination_port,
            protocol=protocol,
            flags=flags,
            technical_details=details,
            payload_sample=payload,
            routed_to=routed_to,
        )


def _shannon_entropy(items: deque[str]) -> float:
    total = len(items)
    if total == 0:
        return 0.0
    counts = Counter(items)
    entropy = 0.0
    for count in counts.values():
        p = count / total
        entropy -= p * math.log2(p)
    return entropy


def _random_public_like_ip() -> str:
    return f"{random.randint(11, 223)}.{random.randint(1, 254)}.{random.randint(1, 254)}.{random.randint(1, 254)}"


def _fake_payload_hex(length: int) -> str:
    return " ".join(f"{random.randint(0, 255):02x}" for _ in range(max(4, length)))


def stream_from_env() -> TrafficStream:
    use_scapy = os.getenv("USE_SCAPY", "false").lower() == "true"
    interface = os.getenv("SCAPY_INTERFACE") or None
    return TrafficStream(use_scapy=use_scapy, interface=interface)
