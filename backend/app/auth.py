"""JWT authentication and password hashing helpers."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
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


def require_manager(claims: dict[str, Any] = Depends(require_jwt)) -> dict[str, Any]:
    """Like require_jwt, but enforces the token belongs to a manager *or* an
    admin. Admins can reach everything a manager can (plus their own area).

    The user type is carried in the token's `type` claim (see
    create_access_token), so this needs no extra database round-trip.
    """
    if claims.get("type") not in (
        models.UserType.manager.value,
        models.UserType.admin.value,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Manager access required",
        )
    return claims


def require_admin(claims: dict[str, Any] = Depends(require_jwt)) -> dict[str, Any]:
    """Like require_jwt, but enforces the token belongs to an admin. Used to
    gate the admin-only area (which sits above the manager dashboard)."""
    if claims.get("type") != models.UserType.admin.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return claims


def require_ai_access(
    db: Session = Depends(get_db),
) -> models.TenantRightsAndInformation:
    """Gate paid AI features: allow the request only while this cafe's AI
    entitlement is still active.

    Reads the single tenant_rights row (this is a one-cafe install) and checks
    that ai_access_expiry is set and still in the future. Returns the row so the
    caller can read/spend credits against it. Raises 403 if AI isn't active.

    The DATETIME column is stored naive (UTC), so compare against a naive UTC
    'now' to avoid aware/naive comparison errors.
    """
    tenant = db.execute(
        select(models.TenantRightsAndInformation).order_by(
            models.TenantRightsAndInformation.id
        )
    ).scalars().first()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if (
        tenant is None
        or tenant.ai_access_expiry is None
        or tenant.ai_access_expiry <= now
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AI features are not active for this cafe",
        )
    return tenant


def require_ai_credits(cost: int):
    """Build a dependency that gates a paid AI endpoint costing ``cost`` credits.

    On top of the require_ai_access expiry check, it verifies there is enough
    budget left for this call, i.e. ``total_credits >= credits_used + cost``.
    Returns the tenant row so the endpoint can spend the credits
    (``credits_used += cost``) once its work succeeds.

    Raises 403 if AI isn't active and 402 (Payment Required) if the remaining
    allowance can't cover this call.
    """

    def dependency(
        db: Session = Depends(get_db),
    ) -> models.TenantRightsAndInformation:
        tenant = require_ai_access(db)
        if tenant.total_credits < tenant.credits_used + cost:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=(
                    "Not enough AI credits remaining for this action "
                    f"(needs {cost})"
                ),
            )
        return tenant

    return dependency


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
