"""Gemini (via Vertex AI) helpers for the AI menu-assistant endpoints.

Each menu-assistant API lives in its own module; this package re-exports their
public functions and structured-output schemas so callers keep using
``from ..services import gemini`` and ``gemini.improve_category(...)`` etc. The
shared client and low-level completion helpers live in :mod:`client`.
"""
from .category import CategorySuggestion, improve_category
from .client import (
    generate_structured,
    generate_structured_multimodal,
    generate_text,
    get_client,
)
from .dish_assistant import (
    DishAssistantReply,
    DishFormProposal,
    DishToppingProposal,
    DishVariantProposal,
    send_dish_message,
    start_dish_chat,
)
from .grammar import fix_grammar
from .menu_description import generate_menu_description
from .menu_from_photo import (
    PhotoMenu,
    extract_menu_from_photos,
    load_images,
    photo_menu_to_structure,
)
from .subcategory import SubcategorySuggestion, improve_subcategory

__all__ = [
    "CategorySuggestion",
    "improve_category",
    "SubcategorySuggestion",
    "improve_subcategory",
    "generate_menu_description",
    "fix_grammar",
    "DishAssistantReply",
    "DishFormProposal",
    "DishToppingProposal",
    "DishVariantProposal",
    "start_dish_chat",
    "send_dish_message",
    "get_client",
    "generate_text",
    "generate_structured",
    "generate_structured_multimodal",
    "PhotoMenu",
    "extract_menu_from_photos",
    "load_images",
    "photo_menu_to_structure",
]
