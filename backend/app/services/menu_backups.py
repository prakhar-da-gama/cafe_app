"""Filesystem store for whole-menu backups.

A backup is a single JSON file under ``app/menu_backups`` capturing the entire
menu (categories -> subcategories -> items -> toppings/variants, plus the tag
vocabulary) in the neutral shape ``crud.rebuild_menu_from_structure`` rebuilds
from. At most one backup is ever kept: saving a new one first evicts the old
file.

Because the photo-import flow throws the previous menu away for good, evicting
its backup also deletes the uploaded image files that backup referenced. Restore
is different — the images in the backup it is applying are about to become live
again, so eviction there keeps them.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

from ..routers.uploads import UPLOAD_DIR

BACKUP_DIR = Path(__file__).resolve().parent.parent / "menu_backups"
BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def list_backup_paths() -> list[str]:
    """Every backup file currently on disk, oldest name first (there is normally
    at most one)."""
    return sorted(str(p) for p in BACKUP_DIR.glob("menu_*.json"))


def _referenced_photos(snapshot: dict) -> set[str]:
    """All public image paths referenced anywhere in a snapshot."""
    photos: set[str] = set()
    for cat in snapshot.get("categories", []):
        photos.update(cat.get("photos") or [])
        for sub in cat.get("subcategories", []):
            photos.update(sub.get("photos") or [])
            for item in sub.get("items", []):
                photos.update(item.get("photos") or [])
                for topping in item.get("toppings", []):
                    photos.update(topping.get("photos") or [])
    return photos


def _delete_photo(public_path: str) -> None:
    """Delete the upload backing a /api/uploads/<name> path. Best effort."""
    name = public_path.rsplit("/", 1)[-1]
    if not name:
        return
    try:
        (UPLOAD_DIR / name).unlink(missing_ok=True)
    except OSError:  # pragma: no cover - environmental
        pass


def _evict(*, delete_photos: bool) -> None:
    """Remove every existing backup file, optionally deleting the images each
    one referenced too."""
    for path in list_backup_paths():
        file_path = Path(path)
        if delete_photos:
            try:
                snapshot = json.loads(file_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                snapshot = {}
            for photo in _referenced_photos(snapshot):
                _delete_photo(photo)
        try:
            file_path.unlink(missing_ok=True)
        except OSError:  # pragma: no cover - environmental
            pass


def save_backup(snapshot: dict, *, evict_photos: bool) -> str:
    """Write ``snapshot`` as the one and only backup, evicting any existing one
    first, and return its path.

    ``evict_photos`` deletes the previous backup's referenced images too — true
    for the photo-import flow (that menu is gone for good), false for restore
    (whose images are becoming live again).
    """
    _evict(delete_photos=evict_photos)
    now = datetime.now()
    path = BACKUP_DIR / f"menu_{now:%Y%m%d_%H%M%S}.json"
    if path.exists():  # two saves in the same second
        path = BACKUP_DIR / f"menu_{now:%Y%m%d_%H%M%S}_{now.microsecond}.json"
    path.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return str(path)


def read_backup(path: str) -> dict:
    """Load one backup by path, guarding against reads outside the backup dir.

    Raises ``FileNotFoundError`` if the path is outside ``BACKUP_DIR`` or missing.
    """
    file_path = Path(path).resolve()
    if file_path.parent != BACKUP_DIR.resolve() or not file_path.is_file():
        raise FileNotFoundError(path)
    return json.loads(file_path.read_text(encoding="utf-8"))


def list_backups_info() -> list[dict]:
    """Each backup with its stored timestamp and a couple of headline counts, for
    the manager's restore UI."""
    infos: list[dict] = []
    for path in list_backup_paths():
        try:
            snapshot = json.loads(Path(path).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            snapshot = {}
        categories = snapshot.get("categories", [])
        items = sum(
            len(sub.get("items", []))
            for cat in categories
            for sub in cat.get("subcategories", [])
        )
        infos.append(
            {
                "path": path,
                "created_at": snapshot.get("created_at"),
                "categories": len(categories),
                "items": items,
            }
        )
    return infos
