"""Gemini (via Vertex AI) helpers for the AI menu-assistant endpoints.

Uses the official ``google-genai`` SDK. When ``gemini_use_vertex`` is set (the
default) the client talks to Vertex AI, so usage is billed to the configured
GCP project and your console.google.com credits apply. Authentication then uses
Application Default Credentials (``gcloud auth application-default login`` or a
service-account key referenced by GOOGLE_APPLICATION_CREDENTIALS).

The SDK is imported lazily inside ``_get_client`` so the API still boots if the
package isn't installed yet; only the AI endpoints fail (with 502) in that case.
"""
from functools import lru_cache

from fastapi import HTTPException, status
from pydantic import BaseModel

from ..config import get_settings

settings = get_settings()


# ---- Structured-output schemas the model fills in ----


class CategorySuggestion(BaseModel):
    """What the model returns when polishing a category."""

    recommended_name_1: str
    recommended_name_2: str
    recommended_description_1: str
    recommended_description_2: str


class SubcategorySuggestion(BaseModel):
    """What the model returns when polishing a subcategory."""

    recommended_name_1: str
    recommended_name_2: str
    recommended_description_1: str
    recommended_description_2: str
    # Name of an existing category (other than the selected one) that fits
    # better, or null if the selected one is fine.
    recommended_existing_category_name: str | None = None
    # True only if the model strongly feels a new category should be created.
    suggested_create_new_category: bool = False
    suggested_new_category_name: str | None = None
    suggested_new_category_description: str | None = None


@lru_cache
def _get_client():
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


def _generate_text(prompt: str) -> str:
    """Run a plain-text completion and return the trimmed text."""
    client = _get_client()
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


def _generate_structured(prompt: str, schema: type[BaseModel]) -> BaseModel:
    """Run a JSON-mode completion constrained to ``schema`` and return the parsed
    pydantic instance."""
    from google.genai import types

    client = _get_client()
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


# ---- Public helpers used by the router ----


def generate_menu_description(menu_json: str) -> str:
    """Ask Gemini to study the full menu and describe the restaurant in ~300
    words: its style, speciality, and how its themes relate to current trends.

    This understanding is cached on the tenant and reused as context when
    recommending future changes to the menu and theme.
    """
    prompt = (
        "You are a restaurant branding and menu consultant. Below is the "
        "complete menu of a cafe as JSON (categories -> subcategories -> items "
        "with prices, veg flags, toppings and variants).\n\n"
        "Understand this menu and work out the style of the restaurant, its "
        "speciality, its apparent price positioning and target audience. This "
        "information will be used to recommend future changes to the "
        "restaurant's menu and theme, so also analyse current themes and food "
        "trends to give an accurate, grounded description. Write about 300 "
        "words of flowing prose (no headings, no bullet points).\n\n"
        f"MENU JSON:\n{menu_json}"
    )
    return _generate_text(prompt)


def improve_category(
    name: str, description: str | None, menu_description: str
) -> CategorySuggestion:
    """Suggest two improved names and two improved descriptions for a category,
    using the cached restaurant understanding as context."""
    prompt = (
        "You are helping a cafe manager polish a MENU CATEGORY.\n\n"
        "Context — understanding of this restaurant:\n"
        f"{menu_description}\n\n"
        f"Category name provided: {name!r}\n"
        f"Category description provided: {description or '(none)'}\n\n"
        "Using the restaurant context, propose two improved category names and "
        "two improved category descriptions. Fix grammar and spelling, improve "
        "capitalisation, and you may add tasteful symbols/emoji where they suit "
        "the restaurant's style. Keep names short and appetising; keep each "
        "description to one or two sentences. Return them in the structured "
        "fields."
    )
    return _generate_structured(prompt, CategorySuggestion)  # type: ignore[return-value]


def improve_subcategory(
    name: str,
    description: str | None,
    selected_category_name: str,
    existing_category_names: list[str],
    menu_description: str,
) -> SubcategorySuggestion:
    """Suggest improved names/descriptions for a subcategory, recommend a better
    existing category if one fits, or flag that a new category should be
    created."""
    categories_list = ", ".join(existing_category_names) or "(none)"
    prompt = (
        "You are helping a cafe manager polish a MENU SUBCATEGORY.\n\n"
        "Context — understanding of this restaurant:\n"
        f"{menu_description}\n\n"
        f"Subcategory name provided: {name!r}\n"
        f"Subcategory description provided: {description or '(none)'}\n"
        f"Category the manager selected for it: {selected_category_name!r}\n"
        f"All existing categories: {categories_list}\n\n"
        "Tasks:\n"
        "1. Propose two improved subcategory names and two improved "
        "descriptions (fix grammar/spelling/capitalisation, tasteful "
        "symbols/emoji allowed, keep them short and appetising).\n"
        "2. If one of the OTHER existing categories fits this subcategory "
        "clearly better than the selected one, set "
        "recommended_existing_category_name to that category's exact name; "
        "otherwise leave it null.\n"
        "3. Only if you strongly feel none of the existing categories fit and a "
        "brand-new category should be created, set suggested_create_new_category "
        "to true and fill suggested_new_category_name and "
        "suggested_new_category_description; otherwise keep it false and those "
        "null.\n"
        "Return everything in the structured fields."
    )
    return _generate_structured(prompt, SubcategorySuggestion)  # type: ignore[return-value]


def fix_grammar(text: str) -> str:
    """Fix grammar, spelling and capitalisation of arbitrary text, returning the
    corrected version only."""
    prompt = (
        "Fix the grammar, spelling and capitalisation of the following text. "
        "Preserve its meaning and tone, do not add or remove information, and "
        "return ONLY the corrected text with no quotes, labels or commentary.\n\n"
        f"TEXT:\n{text}"
    )
    return _generate_text(prompt)
