"""Shared Gemini client and low-level completion helpers.

Uses the official ``google-genai`` SDK. Authentication is always the
``GEMINI_API_KEY`` from ``.env`` (``settings.gemini_api_key``). The
``gemini_use_vertex`` toggle only picks the endpoint: when set (the default) the
client talks to Vertex AI in Express mode (key billed to its GCP project, so
console.google.com credits apply); otherwise it uses the Gemini Developer API.

The SDK is imported lazily inside ``get_client`` so the API still boots if the
package isn't installed yet; only the AI endpoints fail (with 502) in that case.
"""
from functools import lru_cache

from fastapi import HTTPException, status
from pydantic import BaseModel

from ...config import get_settings

settings = get_settings()


@lru_cache
def get_client():
    """Build (once) and cache the genai client for the configured backend."""
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


def generate_text(prompt: str) -> str:
    """Run a plain-text completion and return the trimmed text."""
    client = get_client()
    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
        )
    except Exception as exc:  # network / quota / auth errors
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gemini request failed: {exc}",
        ) from exc
    return (response.text or "").strip()


def generate_structured(prompt: str, schema: type[BaseModel]) -> BaseModel:
    """Run a JSON-mode completion constrained to ``schema`` and return the parsed
    pydantic instance."""
    from google.genai import types

    client = get_client()
    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schema,
            ),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gemini request failed: {exc}",
        ) from exc

    parsed = response.parsed
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


def generate_structured_multimodal(contents: list, schema: type[BaseModel]) -> BaseModel:
    """Like ``generate_structured`` but for a multimodal prompt: ``contents`` is a
    list mixing ``types.Part`` image parts and plain strings. Used to read one or
    more menu photos and return a single parsed ``schema`` instance."""
    from google.genai import types

    client = get_client()
    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schema,
            ),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gemini request failed: {exc}",
        ) from exc

    parsed = response.parsed
    if not isinstance(parsed, schema):
        try:
            parsed = schema.model_validate_json(response.text or "")
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Gemini returned an unparseable response",
            ) from exc
    return parsed
