import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from sqlalchemy import inspect, text

from .chatbot.internal_tools import refresh_weather_prompt
from .config import get_settings
from .database import Base, SessionLocal, engine, ensure_database_exists
from .routers import (
    ai_menu_creation,
    analyticsadmin,
    auth,
    cart,
    chatbot,
    game,
    menu,
    notifications,
    orders,
    service_reviews,
    tags,
    uploads,
    users,
)
from .routers.uploads import UPLOAD_DIR

settings = get_settings()

logger = logging.getLogger(__name__)

# How often the background task refreshes the cached cafe weather. Kept off the
# request path so initiate-chat never waits on the Open-Meteo round-trip.
_WEATHER_POLL_INTERVAL_SECONDS = 30 * 60


def _refresh_weather_once() -> None:
    """Fetch + cache the weather in its own DB session (run in a worker thread
    since the fetch and SQLAlchemy calls are blocking)."""
    db = SessionLocal()
    try:
        refresh_weather_prompt(db)
    finally:
        db.close()


async def _poll_weather_forever() -> None:
    """Refresh the cached weather now and every 30 min thereafter.

    Failures (API down, no location set, ...) are logged and swallowed so the
    loop simply tries again on the next cycle, leaving the last good value in
    place. The blocking refresh runs in a thread so it never stalls the event
    loop.
    """
    while True:
        try:
            await asyncio.to_thread(_refresh_weather_once)
        except Exception as exc:  # noqa: BLE001 - best-effort poll, never fatal
            logger.warning("Weather refresh failed, will retry in 30 min: %s", exc)
        await asyncio.sleep(_WEATHER_POLL_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create the database (if missing) and tables on startup.
    ensure_database_exists()
    Base.metadata.create_all(bind=engine)
    # create_all adds new tables but never alters existing ones; add the new
    # users.photo_path column if an older database is missing it.
    columns = {c["name"] for c in inspect(engine).get_columns("users")}
    if "photo_path" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN photo_path VARCHAR(255) NULL"))
    # Likewise, add the (user_id, status) index to an older orders table that
    # predates it, so order listing stays indexed on existing databases.
    order_indexes = {i["name"] for i in inspect(engine).get_indexes("orders")}
    if "ix_orders_user_status" not in order_indexes:
        with engine.begin() as conn:
            conn.execute(
                text("CREATE INDEX ix_orders_user_status ON orders (user_id, status)")
            )
    if "ix_orders_status_created" not in order_indexes:
        with engine.begin() as conn:
            conn.execute(
                text("CREATE INDEX ix_orders_status_created ON orders (status, created_at)")
            )
    # Add the AI menu-assistant columns to an older tenant_rights table that
    # predates them.
    tenant_columns = {c["name"] for c in inspect(engine).get_columns("tenant_rights")}
    if "menu_changed" not in tenant_columns:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE tenant_rights "
                    "ADD COLUMN menu_changed BOOLEAN NOT NULL DEFAULT 0"
                )
            )
    if "current_menu_description" not in tenant_columns:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE tenant_rights "
                    "ADD COLUMN current_menu_description TEXT NULL"
                )
            )
    # Add the cached-weather columns the background poll writes to.
    if "weather_prompt" not in tenant_columns:
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE tenant_rights ADD COLUMN weather_prompt TEXT NULL")
            )
    if "weather_updated_at" not in tenant_columns:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE tenant_rights "
                    "ADD COLUMN weather_updated_at DATETIME NULL"
                )
            )

    # Poll the weather in the background so it's cached on the tenant row and
    # initiate-chat can read it without hitting the network.
    weather_task = asyncio.create_task(_poll_weather_forever())
    try:
        yield
    finally:
        weather_task.cancel()
        try:
            await weather_task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Cafe App API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ai_menu_creation.router)
app.include_router(analyticsadmin.router)
app.include_router(auth.router)
app.include_router(cart.router)
app.include_router(chatbot.router)
app.include_router(game.router)
app.include_router(menu.router)
app.include_router(notifications.router)
app.include_router(orders.router)
app.include_router(service_reviews.router)
app.include_router(tags.router)
app.include_router(uploads.router)
app.include_router(users.router)

# Serve uploaded files. Kept under /api so the frontend dev proxy forwards them.
app.mount("/api/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/api/health", tags=["health"])
def health_check():
    return {"status": "ok"}
