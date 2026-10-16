"""Chatbot session endpoints.

`initiate_chat` opens (or resumes) a chat session for the authenticated user. A
session is a single `chat_contexts` row holding the ambient facts the chatbot
reasons with; every later chatbot call is scoped to that row's id.
"""
import json
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..auth import require_jwt
from ..chatbot.internal_tools import (
    food_listing_from_llm,
    get_current_time,
    get_weather,
    initiate_my_cart,
)
from ..chatbot.llm import generate_chatbot_reply
from ..chatbot.prompts.prompt_shallow_cart import PROMPT_SHALLOW_CART
from ..chatbot.pydantic_validators.user_profile import UserProfileFromLLM
from ..chatbot.support_llms import create_user_profile, initial_barista_message
from ..chatbot.tools import get_context, get_full_menu, get_transcript, view_my_cart
from ..chatbot.tools.fullmenu import ChatContextNotFound
from ..chatbot.tools.viewmycart import OrderNotFound
from ..database import SessionLocal, get_db

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
    # one if there is already a cart, just like POST /api/cart/add-item). Its id
    # is returned so the client can scope later /message and /add-item calls.
    cart_id = initiate_my_cart(db, user_id)

    existing = db.execute(
        select(models.ChatContext).where(
            models.ChatContext.user_id == user_id,
            models.ChatContext.is_active.is_(True),
        )
    ).scalars().first()
    if existing is not None:
        # Resuming an existing session: no fresh opener is generated (the chat's
        # first turn is already in the transcript). ``resumed`` lets the client
        # tell this apart from a brand-new session without inferring it from
        # whether an opener came back.
        return {
            "chat_context_id": existing.id,
            "cart_id": cart_id,
            "resumed": True,
        }

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

    # Open the conversation with a generated barista greeting + 4 quick-action
    # chips, stored as the session's first transcript turn so the chat opens on
    # a real message instead of a hardcoded one. Best-effort: a failed LLM call
    # must never block the session from starting, so any failure just leaves the
    # opener empty (the client falls back to its own greeting).
    first_message: str | None = None
    first_options: list[str] | None = None
    try:
        reply = initial_barista_message(
            get_context(db, context.id),
            get_full_menu(db, context.id),
            view_my_cart(db, cart_id),
        )
        # Log the opener like any other assistant turn; mirrors the /message
        # endpoint's logging. The opener carries no item suggestions.
        db.add(
            models.ChatbotTranscript(
                chat_context_id=context.id,
                role="assistant",
                content=reply.llm_response,
                items_json=None,
            )
        )
        db.commit()
        first_message = reply.llm_response
        first_options = reply.options
    except Exception:
        db.rollback()

    return {
        "chat_context_id": context.id,
        "cart_id": cart_id,
        "resumed": False,
        "first_message": first_message,
        "first_options": first_options,
    }


@router.get("/active-session", response_model=schemas.ActiveChatSession)
def active_session(
    db: Session = Depends(get_db),
    claims: dict[str, Any] = Depends(require_jwt),
):
    """Report whether the user has a resumable barista session, repairing state.

    Called before opening the barista chat so the client can skip the setup step
    (``InitiateChat``) and land directly in the chat when a session is already in
    progress. A session is resumable whenever an active ``chat_contexts`` row
    exists for the user; its cart is ensured either way:

    * chat context + cart both exist -> ``active: true`` with the two ids.
    * chat context exists but the cart is gone (e.g. it was checked out) -> an
      empty cart is created and ``active: true`` is returned with the two ids.
    * no chat context, no cart -> an empty cart is created, ``active: false``.
    * no chat context, cart present -> ``active: false`` (nothing to repair).
    """
    user_id = int(claims["sub"])

    context = db.execute(
        select(models.ChatContext).where(
            models.ChatContext.user_id == user_id,
            models.ChatContext.is_active.is_(True),
        )
    ).scalars().first()
    cart = db.execute(
        select(models.Order).where(
            models.Order.user_id == user_id,
            models.Order.status == models.OrderStatus.cart,
        )
    ).scalars().first()

    if context is not None:
        # An active session is resumable. Make sure it has a cart to build the
        # order into, creating an empty one if the previous cart is gone.
        cart_id = cart.id if cart is not None else crud.get_or_create_cart(db, user_id).id
        return {"active": True, "chat_context_id": context.id, "cart_id": cart_id}

    # No active session to resume. Still leave the user with an open cart to add
    # to next time.
    if cart is None:
        crud.get_or_create_cart(db, user_id)
    return {"active": False}


@router.get("/transcript", response_model=list[schemas.ChatTranscriptEntry])
def get_chat_transcript(
    chat_context_id: int,
    db: Session = Depends(get_db),
    claims: dict[str, Any] = Depends(require_jwt),
):
    """Return a chat session's stored turns, oldest first, for resuming a chat.

    When the barista chat is (re)opened the frontend preloads these so the
    conversation continues where it left off. Only the caller's own session is
    readable. The raw ``items_json`` suggestions are intentionally not returned
    (``ChatTranscriptEntry`` carries only ``role`` + ``content``), so replayed
    turns render as plain chat bubbles rather than rebuilding the menu tables.
    """
    user_id = int(claims["sub"])
    context = db.get(models.ChatContext, chat_context_id)
    if context is None or context.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat session not found",
        )

    rows = (
        db.execute(
            select(models.ChatbotTranscript)
            .where(
                models.ChatbotTranscript.chat_context_id == chat_context_id,
                models.ChatbotTranscript.is_active.is_(True),
            )
            .order_by(models.ChatbotTranscript.id)
        )
        .scalars()
        .all()
    )
    return [{"role": row.role, "content": row.content} for row in rows]


@router.post("/message")
def send_message(
    payload: schemas.ChatMessageRequest,
    db: Session = Depends(get_db),
    claims: dict[str, Any] = Depends(require_jwt),
):
    """Send one customer message to the chatbot and return its reply.

    Plain request/response — no WebSocket. The turn is logged to
    ``chatbot_transcripts`` so the conversation has memory: the customer's
    message is stored first, then the whole transcript so far (via
    ``get_transcript``) is handed to the model alongside the system prompt, the
    session context, the full menu and the current cart. The model's reply is
    stored too.

    The reply is shaped ``{"items_json": ..., "llm response": ...}``:

    * ``items_json`` — the model's suggestions resolved against the real menu
      (``food_listing_from_llm``), i.e. a ``get-full-menu``-shaped tree ready for
      the frontend to render. ``null`` when the model suggested nothing.
    * ``llm response`` — the model's natural-language turn, or ``null``.
    """
    try:
        context = get_context(db, payload.chat_context_id)
        menu = get_full_menu(db, payload.chat_context_id)
    except ChatContextNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    try:
        cart = view_my_cart(db, payload.cart_id)
    except OrderNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc

    # Log the customer's turn first and flush so it shows up in the transcript we
    # read back below. Nothing is committed until the reply is in hand, so a
    # failed LLM call rolls the whole turn back (no dangling user message).
    db.add(
        models.ChatbotTranscript(
            chat_context_id=payload.chat_context_id,
            role="user",
            content=payload.message,
        )
    )
    db.flush()

    transcript = get_transcript(db, payload.chat_context_id)

    # Everything the model needs for this turn, as one JSON blob.
    user_content = json.dumps(
        {
            "context": context,
            "menu": menu,
            "cart": cart,
            "transcript_of_conversation": transcript,
            "customer_message": payload.message,
        },
        ensure_ascii=False,
        default=str,
    )
    reply = generate_chatbot_reply(PROMPT_SHALLOW_CART, user_content)

    # Log the assistant's turn (raw suggestions kept as-is for faithful replay).
    db.add(
        models.ChatbotTranscript(
            chat_context_id=payload.chat_context_id,
            role="assistant",
            content=reply.llm_response,
            items_json=reply.items_json.model_dump() if reply.items_json else None,
        )
    )
    db.commit()

    # Resolve the model's noisy item names to real menu rows so the frontend
    # gets something renderable (and hallucinated items are dropped).
    items_json = (
        food_listing_from_llm(db, reply.items_json) if reply.items_json else None
    )
    return {"items_json": items_json, "llm response": reply.llm_response}


def _save_user_preferences(
    db: Session, user_id: int, profile: UserProfileFromLLM
) -> None:
    """Upsert the distilled profile into ``user_preferences``.

    One row per ``field_name``: new keys are inserted, existing keys have the
    new values merged in (union, order-preserving) so preferences accumulate
    across sessions rather than being overwritten.
    """
    for entry in profile.preferences:
        existing = db.execute(
            select(models.UserPreference).where(
                models.UserPreference.user_id == user_id,
                models.UserPreference.field_name == entry.field_name,
            )
        ).scalars().first()
        if existing is None:
            db.add(
                models.UserPreference(
                    user_id=user_id,
                    field_name=entry.field_name,
                    values=list(entry.values),
                )
            )
        else:
            merged = list(existing.values or [])
            for value in entry.values:
                if value not in merged:
                    merged.append(value)
            existing.values = merged


def _build_and_save_profile(user_id: int, transcript: list[dict]) -> None:
    """Distill a customer profile from ``transcript`` and persist it.

    Runs off the request path (via ``BackgroundTasks``) so ``/end-chat`` can
    return instantly instead of waiting on the LLM. Opens its own DB session —
    the request's session is already closed by the time this runs. Best-effort:
    the session has already been ended, so any failure here is simply swallowed.
    """
    db = SessionLocal()
    try:
        profile = create_user_profile(transcript)
        _save_user_preferences(db, user_id, profile)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


@router.post("/end-chat")
def end_chat(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    claims: dict[str, Any] = Depends(require_jwt),
):
    """End the authenticated user's active chat session.

    There's no live LLM connection to close (every turn is stateless). The
    session is *soft-deleted* — the ``chat_contexts`` row and all its
    ``chatbot_transcripts`` turns have ``is_active`` flipped to ``False`` — and
    the endpoint returns immediately. Distilling the durable customer profile
    into ``user_preferences`` is the slow part (an LLM call), so it's handed to
    a background task rather than blocking the response.

    The transcript is read *before* the soft-delete (while its rows are still
    active) and passed to the background task, so the task never has to re-read
    rows it just deactivated.
    """
    user_id = int(claims["sub"])

    context = db.execute(
        select(models.ChatContext).where(
            models.ChatContext.user_id == user_id,
            models.ChatContext.is_active.is_(True),
        )
    ).scalars().first()
    if context is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active chat session to end",
        )

    # Grab the transcript while it's still active, for the background profiler.
    transcript = get_transcript(db, context.id)

    # Soft-delete: flip the session and all its turns inactive. Nothing is
    # physically removed, so the transcript survives for the background build.
    context.is_active = False
    db.execute(
        update(models.ChatbotTranscript)
        .where(models.ChatbotTranscript.chat_context_id == context.id)
        .values(is_active=False)
    )
    db.commit()

    # Build + persist the profile off the request path so this stays instant.
    background_tasks.add_task(_build_and_save_profile, user_id, transcript)

    return {"ended": True}
