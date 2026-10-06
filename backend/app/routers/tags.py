from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import require_jwt
from ..database import get_db

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("", response_model=list[schemas.TagRead])
def list_tags(
    db: Session = Depends(get_db),
    claims: dict[str, Any] = Depends(require_jwt),
):
    """All tags, alphabetically. Requires a valid JWT bearer token."""
    stmt = select(models.Tag).order_by(models.Tag.tag)
    return list(db.execute(stmt).scalars().all())
