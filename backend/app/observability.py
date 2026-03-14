"""
Minimal structured logging + in-process metrics.
"""

from __future__ import annotations

import json
import logging
import threading
from collections import defaultdict


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
        }
        for key in ("tenant_id", "request_id", "elapsed_ms", "query", "result_count", "error_count"):
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=True)


_configured = False


def _configure_root_logger() -> None:
    global _configured
    if _configured:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)
    _configured = True


def get_logger(name: str) -> logging.Logger:
    _configure_root_logger()
    return logging.getLogger(f"neurix.{name}")


class Metrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._latency = defaultdict(list)
        self._error_count = defaultdict(int)
        self._request_count = defaultdict(int)

    def observe(self, metric_name: str, elapsed_ms: float, *, ok: bool) -> None:
        with self._lock:
            self._latency[metric_name].append(float(elapsed_ms))
            self._request_count[metric_name] += 1
            if not ok:
                self._error_count[metric_name] += 1

    def snapshot(self) -> dict:
        with self._lock:
            result = {}
            for name in self._request_count:
                samples = sorted(self._latency.get(name, []))
                p95 = samples[int(len(samples) * 0.95) - 1] if samples else 0.0
                result[name] = {
                    "requests": self._request_count[name],
                    "errors": self._error_count[name],
                    "p95_ms": round(p95, 2) if p95 > 0 else 0.0,
                }
            return result


metrics = Metrics()
