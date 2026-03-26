from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


@dataclass(slots=True)
class AnomalyResult:
    is_anomaly: bool
    score: float
    severity: float
    confidence: float
    model_ready: bool


class AnomalyDetector:
    def __init__(self, warmup_samples: int = 180) -> None:
        self.warmup_samples = warmup_samples
        self._baseline: list[list[float]] = []
        self._scaler = StandardScaler()
        self._model = IsolationForest(
            n_estimators=220,
            contamination=0.08,
            random_state=42,
            n_jobs=1,
        )
        self._ready = False
        self._threshold = 0.0

    @property
    def ready(self) -> bool:
        return self._ready

    def evaluate(self, vector: list[float]) -> AnomalyResult:
        if not self._ready:
            self._baseline.append(vector)
            if len(self._baseline) < self.warmup_samples:
                return AnomalyResult(
                    is_anomaly=False,
                    score=0.0,
                    severity=0.0,
                    confidence=min(0.95, len(self._baseline) / self.warmup_samples),
                    model_ready=False,
                )
            self._fit_model()

        x = np.array([vector], dtype=float)
        x_scaled = self._scaler.transform(x)
        score = float(-self._model.score_samples(x_scaled)[0])
        is_anomaly = score > self._threshold
        severity = float(np.clip((score - self._threshold) / max(self._threshold, 1e-6), 0.0, 3.0))
        confidence = float(np.clip(0.55 + severity * 0.15, 0.0, 0.99))

        return AnomalyResult(
            is_anomaly=is_anomaly,
            score=score,
            severity=severity,
            confidence=confidence,
            model_ready=True,
        )

    def _fit_model(self) -> None:
        baseline = np.array(self._baseline, dtype=float)
        baseline_scaled = self._scaler.fit_transform(baseline)
        self._model.fit(baseline_scaled)
        train_scores = -self._model.score_samples(baseline_scaled)
        self._threshold = float(np.quantile(train_scores, 0.92))
        self._ready = True
