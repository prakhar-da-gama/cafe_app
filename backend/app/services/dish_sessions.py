"""In-memory store for the dish-creation chat assistant.

Each session holds a live Gemini chat object (see ``gemini.start_dish_chat``)
so the conversation keeps its context across turns without anything being
written to a database or disk. Sessions are keyed by an opaque token handed to
the client; there is no WebSocket and no persistence.

Sessions auto-expire after ``SESSION_TTL_SECONDS`` of inactivity: every access
first purges anything stale, so a manager who closes the app mid-flow simply
has their session time out and disappear on the next call (or sit idle until
the process restarts). This is a single-cafe, typically single-worker app, so a
process-local dict is sufficient; it is guarded by a lock for safety.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from threading import Lock

SESSION_TTL_SECONDS = 15 * 60


@dataclass
class DishSession:
    chat: object
    created_at: float
    last_active: float


_sessions: dict[str, DishSession] = {}
_lock = Lock()


def _purge_expired(now: float) -> None:
    """Drop sessions idle for longer than the TTL. Caller must hold the lock."""
    stale = [
        sid
        for sid, s in _sessions.items()
        if now - s.last_active > SESSION_TTL_SECONDS
    ]
    for sid in stale:
        _sessions.pop(sid, None)


def create_session(chat: object) -> str:
    """Store a fresh chat and return its new session token."""
    now = time.time()
    with _lock:
        _purge_expired(now)
        sid = uuid.uuid4().hex
        _sessions[sid] = DishSession(chat=chat, created_at=now, last_active=now)
    return sid


def get_session(session_id: str) -> DishSession | None:
    """Return a live session (refreshing its activity) or None if missing/expired."""
    now = time.time()
    with _lock:
        _purge_expired(now)
        session = _sessions.get(session_id)
        if session is not None:
            session.last_active = now
        return session


def end_session(session_id: str) -> None:
    """Drop a session if present (idempotent)."""
    with _lock:
        _sessions.pop(session_id, None)
