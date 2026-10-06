from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from sqlalchemy import inspect, text

from .config import get_settings
from .database import Base, engine, ensure_database_exists
from .routers import auth, cart, game, menu, tags, uploads, users
from .routers.uploads import UPLOAD_DIR

settings = get_settings()


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
    yield


app = FastAPI(title="Cafe App API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(cart.router)
app.include_router(game.router)
app.include_router(menu.router)
app.include_router(tags.router)
app.include_router(uploads.router)
app.include_router(users.router)

# Serve uploaded files. Kept under /api so the frontend dev proxy forwards them.
app.mount("/api/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/api/health", tags=["health"])
def health_check():
    return {"status": "ok"}
