"""JWT authentication and password hashing helpers."""
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import models
from .config import get_settings
from .database import get_db

settings = get_settings()

# Expects an "Authorization: Bearer <token>" header.
bearer_scheme = HTTPBearer()


# ---- Password hashing ----


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ---- JWT ----


def create_access_token(user: models.User) -> str:
    """Issue a signed JWT identifying the given user."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "email": user.email_id,
        "type": user.user_type.value,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def require_jwt(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict[str, Any]:
    """Validate the bearer token and return its decoded claims.

    Raises 401 if the token is missing, malformed, or expired.
    """
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def get_current_user(
    claims: dict[str, Any] = Depends(require_jwt),
    db: Session = Depends(get_db),
) -> models.User:
    """Resolve the authenticated user from the token's subject claim."""
    user_id = claims.get("sub")
    user = db.get(models.User, int(user_id)) if user_id is not None else None
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
