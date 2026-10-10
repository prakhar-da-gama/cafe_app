"""Gemini chat behind the dish-creation assistant (POST /dish-assistant/*)."""
from fastapi import HTTPException, status
from pydantic import BaseModel

from .client import get_client, settings


class DishVariantProposal(BaseModel):
    """A variant the assistant proposes for the dish (created only on submit)."""

    name: str
    price_delta: float = 0.0


class DishToppingProposal(BaseModel):
    """A topping the assistant proposes for the dish (created only on submit)."""

    name: str
    price: float = 0.0


class DishFormProposal(BaseModel):
    """The dish-creation form the assistant fills in, by name. Category,
    subcategory and tag names are resolved back to real ids by the router."""

    category_name: str | None = None
    subcategory_name: str | None = None
    name: str | None = None
    price: float | None = None
    is_veg: bool | None = None
    description: str | None = None
    tags: list[str] = []
    variants: list[DishVariantProposal] = []
    toppings: list[DishToppingProposal] = []


class DishAssistantReply(BaseModel):
    """One turn from the dish-creation assistant: a chat message for the
    manager, whether it has enough to submit, and the form filled so far."""

    message: str
    ready: bool = False
    form: DishFormProposal


def start_dish_chat(system_prompt: str):
    """Open a Gemini chat session for creating a dish, pinned to JSON output
    shaped like :class:`DishAssistantReply`. The returned chat object keeps the
    conversation history, giving the assistant persistent context across turns.
    It is held in server memory by the router; nothing is persisted."""
    from google.genai import types

    client = get_client()
    try:
        return client.chats.create(
            model=settings.gemini_model,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                response_schema=DishAssistantReply,
            ),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gemini request failed: {exc}",
        ) from exc


def send_dish_message(chat, message: str) -> DishAssistantReply:
    """Send the manager's message on an existing dish chat and return the parsed
    structured reply."""
    try:
        response = chat.send_message(message)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gemini request failed: {exc}",
        ) from exc

    parsed = getattr(response, "parsed", None)
    if not isinstance(parsed, DishAssistantReply):
        try:
            parsed = DishAssistantReply.model_validate_json(response.text or "")
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Gemini returned an unparseable response",
            ) from exc
    return parsed
