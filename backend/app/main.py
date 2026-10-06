from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import Base, engine, ensure_database_exists
from .routers import auth, menu, tags, users

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create the database (if missing) and tables on startup.
    ensure_database_exists()
    Base.metadata.create_all(bind=engine)
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
app.include_router(menu.router)
app.include_router(tags.router)
app.include_router(users.router)


@app.get("/api/health", tags=["health"])
def health_check():
    return {"status": "ok"}
