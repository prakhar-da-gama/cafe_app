"""Shared Gemini client and low-level completion helpers.

Uses the official ``google-genai`` SDK. When ``gemini_use_vertex`` is set (the
default) the client talks to Vertex AI, so usage is billed to the configured
GCP project and your console.google.com credits apply. Authentication then uses
Application Default Credentials (``gcloud auth application-default login`` or a
service-account key referenced by GOOGLE_APPLICATION_CREDENTIALS).

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

    if settings.gemini_use_vertex:
        if not settings.gcp_project:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="GCP_PROJECT is not configured for Vertex AI",
            )
        return genai.Client(
            vertexai=True,
            project=settings.gcp_project,
            location=settings.gcp_location,
        )
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="GEMINI_API_KEY is not configured",
        )
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
