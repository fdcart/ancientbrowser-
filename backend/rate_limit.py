"""Simple in-memory rate limiter (fixed window per IP).

Suitable for MVP. For multi-instance deploys, back with Redis.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock
from typing import Deque, Dict


class RateLimiter:
    def __init__(self, max_calls: int, window_s: float):
        self.max_calls = max_calls
        self.window_s = window_s
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        now = time.time()
        with self._lock:
            dq = self._hits[key]
            while dq and now - dq[0] > self.window_s:
                dq.popleft()
            if len(dq) >= self.max_calls:
                return False
            dq.append(now)
            return True
