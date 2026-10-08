"""Live multiplayer Snake.

A single shared game room (one cafe = one room, no player cap). The server is
authoritative: it owns the board, runs a fixed-tick game loop and broadcasts the
full state to every connected client each tick. Clients only ever send a
direction change or a respawn request.

The loop only runs while at least one player is connected, so the feature costs
nothing when the room is empty.
"""
from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass, field
from typing import Any

import jwt
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..config import get_settings
from ..database import SessionLocal, get_db

settings = get_settings()

router = APIRouter(prefix="/api/game", tags=["game"])

# ---- Board / loop tuning ----
GRID_W = 44
GRID_H = 44
TICK_SECONDS = 0.13  # ~7.5 ticks/second
START_LEN = 4
FOOD_TARGET = 6  # keep this many fruits on the board at all times

# Directions as (dx, dy). y grows downward.
DIRS: dict[str, tuple[int, int]] = {
    "up": (0, -1),
    "down": (0, 1),
    "left": (-1, 0),
    "right": (1, 0),
}

# A cheerful palette; each snake gets one so players can tell each other apart.
COLORS = [
    "#111111",  # the "signature" black snake
    "#7b2ff7",
    "#e23fa0",
    "#ff7a1a",
    "#1aa7ec",
    "#17b978",
    "#f4357a",
    "#9b5de5",
]

# Fallback faces for players who haven't uploaded a photo.
FACE_EMOJIS = [
    "🐍", "🦊", "🐸", "🐼", "🦁", "🐯", "🐵", "🐙", "🦄", "🐲",
    "🐨", "🐷", "🐥", "🦉", "🐝", "🦖", "👾", "🤖", "👻", "🦋",
]


@dataclass
class Player:
    id: str  # per-connection id
    user_id: int
    name: str
    photo: str | None
    emoji: str  # fallback face when there's no photo
    color: str
    body: list[list[int]]  # head first; each cell is [x, y]
    direction: tuple[int, int]
    pending: tuple[int, int]
    alive: bool = True
    score: int = 0
    stat_id: int | None = None

    @property
    def first_name(self) -> str:
        return (self.name or "Player").strip().split(" ")[0]


@dataclass
class Room:
    players: dict[str, Player] = field(default_factory=dict)
    sockets: dict[str, WebSocket] = field(default_factory=dict)
    food: list[list[int]] = field(default_factory=list)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    loop_task: asyncio.Task | None = None


room = Room()


# ---- DB helpers (short-lived sessions; called rarely: spawn / eat / death) ----


def _create_stat(user_id: int) -> int:
    db = SessionLocal()
    try:
        row = models.GameStat(user_id=user_id, score=0)
        db.add(row)
        db.commit()
        db.refresh(row)
        return row.id
    finally:
        db.close()


def _save_score(stat_id: int, score: int) -> None:
    db = SessionLocal()
    try:
        row = db.get(models.GameStat, stat_id)
        if row is not None:
            row.score = score
            db.commit()
    finally:
        db.close()


# ---- Board helpers ----


def _occupied() -> set[tuple[int, int]]:
    cells: set[tuple[int, int]] = set()
    for p in room.players.values():
        if p.alive:
            for c in p.body:
                cells.add((c[0], c[1]))
    for f in room.food:
        cells.add((f[0], f[1]))
    return cells


def _random_free_cell() -> list[int] | None:
    taken = _occupied()
    free_count = GRID_W * GRID_H - len(taken)
    if free_count <= 0:
        return None
    # Rejection sampling is fine: the board is huge relative to the snakes.
    for _ in range(200):
        x, y = random.randrange(GRID_W), random.randrange(GRID_H)
        if (x, y) not in taken:
            return [x, y]
    return None


def _spawn_food() -> None:
    while len(room.food) < FOOD_TARGET:
        cell = _random_free_cell()
        if cell is None:
            break
        room.food.append(cell)


def _spawn_body() -> tuple[list[list[int]], tuple[int, int]]:
    """Pick a safe starting segment of START_LEN cells and a direction."""
    for _ in range(200):
        dir_name = random.choice(list(DIRS))
        dx, dy = DIRS[dir_name]
        # Keep the whole starting body on-board, growing away from the head.
        margin = START_LEN + 2
        hx = random.randrange(margin, GRID_W - margin)
        hy = random.randrange(margin, GRID_H - margin)
        body = [[hx - dx * i, hy - dy * i] for i in range(START_LEN)]
        taken = _occupied()
        if all((c[0], c[1]) not in taken for c in body):
            return body, (dx, dy)
    # Fallback: centre, facing right.
    cx, cy = GRID_W // 2, GRID_H // 2
    return [[cx - i, cy] for i in range(START_LEN)], (1, 0)


def _respawn(player: Player) -> None:
    body, direction = _spawn_body()
    player.body = body
    player.direction = direction
    player.pending = direction
    player.alive = True
    player.score = 0
    player.stat_id = _create_stat(player.user_id)


# ---- Simulation ----


def _step() -> None:
    """Advance every alive snake by one cell and resolve collisions/eating.

    Walls aren't lethal: a snake that would leave the board reverses, so its
    head bounces straight back the opposite way. Snake bodies pass through one
    another -- the only lethal event is a head meeting another snake's head.
    """
    alive = [p for p in room.players.values() if p.alive]
    if not alive:
        return

    # 1. Apply queued turns, and bounce any snake that would leave the board.
    for p in alive:
        # Honour the queued turn unless it's a 180° reversal of the current one.
        if (p.pending[0] != -p.direction[0]) or (p.pending[1] != -p.direction[1]):
            p.direction = p.pending
        hx, hy = p.body[0]
        nx, ny = hx + p.direction[0], hy + p.direction[1]
        if not (0 <= nx < GRID_W and 0 <= ny < GRID_H):
            # Reverse the whole snake so the head leads back inward, opposite
            # to its previous motion (a wall "bounce"). Reversing the body is
            # the only way to flip direction without self-collision.
            p.body.reverse()
            p.direction = (-p.direction[0], -p.direction[1])
            p.pending = p.direction

    # 2. Where each head is now, and where it's about to land.
    old_heads: dict[str, tuple[int, int]] = {}
    new_heads: dict[str, tuple[int, int]] = {}
    for p in alive:
        hx, hy = p.body[0]
        old_heads[p.id] = (hx, hy)
        new_heads[p.id] = (hx + p.direction[0], hy + p.direction[1])

    # 3. Head-vs-head deaths. A snake dies if its new head lands on the same
    #    cell as another head's destination (both approached -> both die) or on
    #    the cell another head currently occupies (it approached that head).
    dest_count: dict[tuple[int, int], int] = {}
    for h in new_heads.values():
        dest_count[h] = dest_count.get(h, 0) + 1

    dead_ids: set[str] = set()
    for p in alive:
        nh = new_heads[p.id]
        if dest_count[nh] > 1:
            dead_ids.add(p.id)
            continue
        for q in alive:
            if q.id != p.id and nh == old_heads[q.id]:
                dead_ids.add(p.id)
                break

    for p in alive:
        if p.id in dead_ids:
            p.alive = False
            if p.stat_id is not None:
                _save_score(p.stat_id, p.score)
            # Clear the body so a dead snake stops being drawn; the client
            # shows a "Game over" overlay instead.
            p.body = []

    # 4. Move the survivors and resolve food.
    ate = False
    for p in alive:
        if not p.alive:
            continue
        head = list(new_heads[p.id])
        p.body.insert(0, head)
        food_idx = next(
            (i for i, f in enumerate(room.food) if f[0] == head[0] and f[1] == head[1]),
            None,
        )
        if food_idx is not None:
            room.food.pop(food_idx)
            p.score += 1
            ate = True
            if p.stat_id is not None:
                _save_score(p.stat_id, p.score)
            # eating grows the snake: keep the tail this tick (don't pop)
        else:
            p.body.pop()

    if ate:
        _spawn_food()


def _state_message() -> dict[str, Any]:
    return {
        "type": "state",
        "grid": {"w": GRID_W, "h": GRID_H},
        "food": room.food,
        "players": [
            {
                "id": p.id,
                "userId": p.user_id,
                "name": p.name,
                "first": p.first_name,
                "photo": p.photo,
                "emoji": p.emoji,
                "color": p.color,
                "alive": p.alive,
                "score": p.score,
                "body": p.body,
            }
            for p in room.players.values()
        ],
    }


async def _broadcast(message: dict[str, Any]) -> None:
    dead_ids: list[str] = []
    for pid, ws in list(room.sockets.items()):
        try:
            await ws.send_json(message)
        except Exception:
            dead_ids.append(pid)
    for pid in dead_ids:
        room.sockets.pop(pid, None)
        room.players.pop(pid, None)


async def _game_loop() -> None:
    """Tick forever while players remain; exits once the room empties."""
    try:
        while True:
            async with room.lock:
                if not room.players:
                    room.loop_task = None
                    return
                _step()
                message = _state_message()
            await _broadcast(message)
            await asyncio.sleep(TICK_SECONDS)
    except asyncio.CancelledError:
        room.loop_task = None
        raise


def _ensure_loop() -> None:
    if room.loop_task is None or room.loop_task.done():
        room.loop_task = asyncio.create_task(_game_loop())


# ---- WebSocket endpoint ----


def _user_from_token(token: str) -> models.User | None:
    try:
        claims = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except jwt.PyJWTError:
        return None
    user_id = claims.get("sub")
    if user_id is None:
        return None
    db = SessionLocal()
    try:
        return db.get(models.User, int(user_id))
    finally:
        db.close()


@router.websocket("/ws")
async def game_ws(websocket: WebSocket, token: str = Query(...)):
    user = _user_from_token(token)
    if user is None:
        await websocket.close(code=4401)  # unauthorized
        return

    await websocket.accept()
    pid = f"{user.id}-{random.randrange(1_000_000):06d}"

    async with room.lock:
        body, direction = _spawn_body()
        # The first player gets the black "signature" snake; others cycle colours.
        color = COLORS[len(room.players) % len(COLORS)]
        player = Player(
            id=pid,
            user_id=user.id,
            name=user.name or user.email_id.split("@")[0],
            photo=user.photo_path,
            emoji=random.choice(FACE_EMOJIS),
            color=color,
            body=body,
            direction=direction,
            pending=direction,
            stat_id=_create_stat(user.id),
        )
        room.players[pid] = player
        room.sockets[pid] = websocket
        _spawn_food()
        _ensure_loop()
        # Tell the client which snake is theirs, plus the first frame.
        hello = {"type": "welcome", "you": pid, **_state_message()}

    await websocket.send_json(hello)

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action") or data.get("type")
            if action == "dir":
                d = DIRS.get(data.get("dir", ""))
                if d is not None:
                    async with room.lock:
                        p = room.players.get(pid)
                        if p is not None and p.alive:
                            p.pending = d
            elif action == "respawn":
                async with room.lock:
                    p = room.players.get(pid)
                    if p is not None and not p.alive:
                        _respawn(p)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        # A player who leaves (or drops offline) is removed from the board.
        async with room.lock:
            p = room.players.pop(pid, None)
            room.sockets.pop(pid, None)
            if p is not None and p.stat_id is not None:
                _save_score(p.stat_id, p.score)


# ---- REST: live count + stats ----


@router.get("/live-count")
def live_count() -> dict[str, int]:
    """How many players are connected right now, and how many are alive."""
    return {
        "count": len(room.players),
        "playing": sum(1 for p in room.players.values() if p.alive),
    }


@router.get("/my-stats", response_model=list[schemas.MyGameStat])
def my_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """The authenticated user's own game lives, most recent first."""
    return (
        db.query(models.GameStat)
        .filter(models.GameStat.user_id == current_user.id)
        .order_by(models.GameStat.datetime_started.desc())
        .all()
    )


@router.get("/overall-stats", response_model=schemas.PaginatedOverallStats)
def overall_stats(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """Global leaderboard across all players, highest score first (paginated)."""
    base = db.query(models.GameStat, models.User).join(
        models.User, models.User.id == models.GameStat.user_id
    )
    total = db.query(func.count(models.GameStat.id)).scalar() or 0
    rows = (
        base.order_by(
            models.GameStat.score.desc(), models.GameStat.datetime_started.desc()
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [
        schemas.OverallGameStat(
            id=stat.id,
            user_id=user.id,
            name=user.name,
            photo_path=user.photo_path,
            score=stat.score,
            datetime_started=stat.datetime_started,
        )
        for stat, user in rows
    ]
    return schemas.PaginatedOverallStats(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )
