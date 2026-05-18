# -*- coding: utf-8 -*-
"""ConfirmBus: bridge sync worker threads with async WebSocket replies.

The Outlook registration flow (running in an executor thread) calls blocking
``confirm_callback(message)``. The async WebSocket handler needs to push the
prompt to the client and, when the client replies, unblock that thread.
ConfirmBus keeps one ``threading.Event`` per key so the worker can ``wait_for``
while the async side calls ``set`` from any context.
"""
from __future__ import annotations

import threading
from typing import Any, Dict


class ConfirmBus:
    def __init__(self) -> None:
        self._events: Dict[str, threading.Event] = {}
        self._values: Dict[str, Any] = {}
        self._lock = threading.Lock()

    def _get_event(self, key: str) -> threading.Event:
        with self._lock:
            event = self._events.get(key)
            if event is None:
                event = threading.Event()
                self._events[key] = event
            return event

    def wait_for(self, key: str, timeout: float | None = None) -> Any:
        """Block the calling thread until ``set(key, value)`` is called.

        Returns the value passed to ``set``. Resets the event afterwards so the
        same key can be reused for the next round-trip.
        """
        event = self._get_event(key)
        event.wait(timeout=timeout)
        with self._lock:
            value = self._values.pop(key, None)
            self._events.pop(key, None)
        return value

    def set(self, key: str, value: Any = None) -> None:
        """Wake any thread waiting on ``key`` with ``value`` as the result."""
        event = self._get_event(key)
        with self._lock:
            self._values[key] = value
        event.set()

    def cancel_all(self) -> None:
        """Release every pending waiter (used on disconnect/teardown)."""
        with self._lock:
            keys = list(self._events.keys())
        for key in keys:
            self.set(key, None)
