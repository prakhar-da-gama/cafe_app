"""Chatbot session endpoints.

`initiate_chat` opens (or resumes) a chat session for the authenticated user. A
session is a single `chat_contexts` row holding the ambient facts the chatbot
reasons with; every later chatbot call is scoped to that row's id.
"""
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import require_jwt
from ..chatbot.internal_tools import get_current_time, get_weather, initiate_my_cart
from ..database import get_db

router = APIRouter(prefix="/api/chatbot", tags=["chatbot"])


@router.post("/initiate-chat", response_model=schemas.InitiateChatResponse)
def initiate_chat(
    payload: schemas.InitiateChatRequest,
    db: Session = Depends(get_db),
    claims: dict[str, Any] = Depends(require_jwt),
):
    """Start a chat session, or resume the user's existing active one.

    Either way the user's cart is ensured first (an empty one is created if they
    don't have an open cart yet).

    If the user already has an active `chat_contexts` row, its id is returned as
    is. Otherwise a new row is created: `weather` and `time` are filled from the
    chatbot tools, `setup_of_people` and `veg_only` come from the request, and
    the row is marked active. Returns the chat context id either way.
    """
    user_id = int(claims["sub"])

    # Make sure the user has an open cart for this session (reuses the existing
    # one if there is already a cart, just like POST /api/cart/add-item).
    initiate_my_cart(db, user_id)

    existing = db.execute(
        select(models.ChatContext).where(
            models.ChatContext.user_id == user_id,
            models.ChatContext.is_active.is_(True),
        )
    ).scalars().first()
    if existing is not None:
        return {"chat_context_id": existing.id}

    # Weather is best-effort: nothing about it should ever block the chat from
    # starting, so any failure at all (no location, API down, bad response, ...)
    # silently falls back to no weather.
    try:
        weather = get_weather(db)
    except Exception:
        weather = None

    context = models.ChatContext(
        user_id=user_id,
        weather=weather,
        time=get_current_time(),
        setup_of_people=payload.setup_of_people,
        veg_only=payload.veg_only,
        is_active=True,
    )
    db.add(context)
    db.commit()
    db.refresh(context)
    return {"chat_context_id": context.id}
