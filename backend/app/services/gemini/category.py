"""Gemini call behind POST /format-category."""
from pydantic import BaseModel

from .client import generate_structured


class CategorySuggestion(BaseModel):
    """What the model returns when polishing a category."""

    recommended_names: list[str]
    recommended_descriptions: list[str]


def improve_category(
    name: str, description: str | None, menu_description: str
) -> CategorySuggestion:
    """Suggest five improved names and five improved descriptions for a
    category, using the cached restaurant understanding as context."""
    prompt = (
        "You are helping a cafe manager polish a MENU CATEGORY.\n\n"
        "Context — understanding of this restaurant:\n"
        f"{menu_description}\n\n"
        f"Category name provided: {name!r}\n"
        f"Category description provided: {description or '(none)'}\n\n"
        "Using the restaurant context, propose exactly five improved category "
        "names and exactly five improved category descriptions, ordered best "
        "first and each distinct from the others. Fix grammar and spelling, "
        "improve capitalisation, and you may add tasteful symbols/emoji where "
        "they suit the restaurant's style. Keep names short and appetising; keep "
        "each description to one or two sentences. Return recommended_names with "
        "five names and recommended_descriptions with five descriptions."
    )
    return generate_structured(prompt, CategorySuggestion)  # type: ignore[return-value]
