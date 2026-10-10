"""Gemini call behind POST /format-subcategory."""
from pydantic import BaseModel

from .client import generate_structured


class SubcategorySuggestion(BaseModel):
    """What the model returns when polishing a subcategory."""

    recommended_names: list[str]
    recommended_descriptions: list[str]
    # Name of an existing category (other than the selected one) that fits
    # better, or null if the selected one is fine.
    recommended_existing_category_name: str | None = None
    # True only if the model strongly feels a new category should be created.
    suggested_create_new_category: bool = False
    suggested_new_category_name: str | None = None
    suggested_new_category_description: str | None = None


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
        "1. Propose exactly five improved subcategory names and exactly five "
        "improved descriptions, ordered best first and each distinct from the "
        "others (fix grammar/spelling/capitalisation, tasteful symbols/emoji "
        "allowed, keep them short and appetising). Return recommended_names "
        "with five names and recommended_descriptions with five descriptions.\n"
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
    return generate_structured(prompt, SubcategorySuggestion)  # type: ignore[return-value]
