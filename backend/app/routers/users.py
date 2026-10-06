from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user, hash_password
from ..database import get_db

router = APIRouter(prefix="/api/users", tags=["users"])


@router.patch("/me", response_model=schemas.UserRead)
def update_me(
    payload: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Patch the authenticated user's own name and/or password.

    The JWT identifies the user, so a user can only ever edit their own record.
    """
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        current_user.name = data["name"]
    if "password" in data:
        current_user.password = hash_password(data["password"])
    db.commit()
    db.refresh(current_user)
    return current_user
