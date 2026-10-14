"""The Gemini call behind the food-ordering chatbot.

Authenticates with the ``GEMINI_API_KEY`` from ``.env`` (exposed as
``settings.gemini_api_key``). Like the helpers in ``app/services/gemini``, the
``gemini_use_vertex`` toggle picks the endpoint: Vertex AI Express mode when set
(the default), otherwise the Gemini Developer API. The SDK is imported lazily so
the API still boots if ``google-genai`` isn't installed — only this endpoint
fails (with 502).

No chat history is kept yet: each call is a fresh, single-shot completion. The
caller assembles the whole prompt (session context + menu + cart + the latest
message) and we constrain the answer to :class:`ChatbotReply`.
"""
from functools import lru_cache

from fastapi import HTTPException, status
from pydantic import BaseModel

from ..config import get_settings
from .pydantic_validators.chatbot_reply import ChatbotReply

settings = get_settings()


@lru_cache
def _get_client():
    """Build (once) and cache a genai client keyed on the .env API key."""
    try:
        from google import genai
    except ImportError as exc:  # package not installed
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="google-genai is not installed on the server",
        ) from exc

    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="GEMINI_API_KEY is not configured",
        )

    if settings.gemini_use_vertex:
        # Vertex AI Express mode: same API key, billed to the key's GCP project.
        return genai.Client(vertexai=True, api_key=settings.gemini_api_key)
    # Gemini Developer API.
    return genai.Client(api_key=settings.gemini_api_key)


def generate_structured(
    system_prompt: str, user_content: str, schema: type[BaseModel]
) -> BaseModel:
    """Run one JSON-mode completion constrained to ``schema`` and return the
    parsed pydantic instance.

    ``system_prompt`` is the persona/output contract; ``user_content`` is the
    per-call payload. Shared by every chatbot LLM call so they all go through the
    one .env-keyed client.
    """
    from google.genai import types

    client = _get_client()
    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=user_content,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                response_schema=schema,
            ),
        )
    except HTTPException:
        raise
    except Exception as exc:  # network / quota / auth errors
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gemini request failed: {exc}",
        ) from exc

    parsed = getattr(response, "parsed", None)
    if not isinstance(parsed, schema):
        # Fall back to validating the raw JSON text if the SDK didn't parse it.
        try:
            parsed = schema.model_validate_json(response.text or "")
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Gemini returned an unparseable response",
            ) from exc
    return parsed


def generate_chatbot_reply(system_prompt: str, user_content: str) -> ChatbotReply:
    """Run one ordering-chatbot turn, constrained to :class:`ChatbotReply`.

    ``user_content`` is the per-turn payload (context + menu + cart + transcript
    + the customer's message).
    """
    return generate_structured(system_prompt, user_content, ChatbotReply)
