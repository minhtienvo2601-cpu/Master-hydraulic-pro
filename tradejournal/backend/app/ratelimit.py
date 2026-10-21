"""Giới hạn tốc độ dạng cửa sổ trượt trong bộ nhớ tiến trình.

Đủ cho triển khai 1 instance (MVP). Khi chạy nhiều instance, thay bằng Redis
(xem docs/SECURITY.md) — giao diện `hit()` giữ nguyên.
"""
import threading
import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, window_s: int) -> bool:
        """Ghi nhận 1 lần gọi; trả về False nếu vượt giới hạn."""
        now = time.monotonic()
        with self._lock:
            dq = self._hits[key]
            while dq and dq[0] <= now - window_s:
                dq.popleft()
            if len(dq) >= limit:
                return False
            dq.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()
