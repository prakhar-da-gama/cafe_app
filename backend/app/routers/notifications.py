from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..auth import require_jwt
from ..database import get_db

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=schemas.PaginatedNotifications)
def list_notifications(
    notification_for: models.NotificationFor = Query(...),
    resolved: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_jwt),
):
    """A page of notifications for one audience (manager / admin / customer),
    newest first. Optionally filter by `resolved`. Filtering, ordering and
    pagination all run at the DB level on the
    (notification_for, resolved, created_at) index. Requires a valid JWT."""
    return crud.list_notifications(
        db,
        notification_for=notification_for,
        resolved=resolved,
        page=page,
        page_size=page_size,
    )


@router.patch("/{notification_id}/resolve", response_model=schemas.NotificationRead)
def resolve_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_jwt),
):
    """Mark a notification resolved (the dashboard's tick button). 404 if it
    doesn't exist. Requires a valid JWT."""
    note = crud.resolve_notification(db, notification_id)
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return note
