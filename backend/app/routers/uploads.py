import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

router = APIRouter(prefix="/api/upload", tags=["uploads"])

# Files land in backend/app/uploads and are served as static files at
# /api/uploads/<name> (see main.py). Keeping both under /api means the frontend
# dev proxy forwards them without extra config.
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Map the content types we accept to a canonical extension.
ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


@router.post("")
def upload_file(file: UploadFile = File(...)) -> dict[str, str]:
    """Store an uploaded file under a random 16-char name and return that name.

    The file is renamed to a uuid-based name (collisions are effectively
    impossible) while preserving a sensible extension. The response also
    includes the public path the file is served from.
    """
    # Prefer the declared content type; fall back to the original extension.
    suffix = ALLOWED_TYPES.get(file.content_type or "")
    if suffix is None:
        suffix = Path(file.filename or "").suffix.lower() or ".bin"

    name = uuid.uuid4().hex[:16] + suffix
    dest = UPLOAD_DIR / name
    try:
        with dest.open("wb") as out:
            shutil.copyfileobj(file.file, out)
    except OSError as exc:  # pragma: no cover - disk errors are environmental
        raise HTTPException(status_code=500, detail="Could not save file") from exc
    finally:
        file.file.close()

    return {"filename": name, "path": f"/api/uploads/{name}"}
