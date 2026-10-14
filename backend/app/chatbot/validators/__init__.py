"""Fuzzy name -> row resolvers used internally by the chatbot.

Each resolver takes a free-text string and the best-matching menu row, raising
`ResolutionError` when nothing matches closely enough.
"""
from ._base import ResolutionError, resolve
from .category import resolve_category
from .item import resolve_item
from .subcategory import resolve_subcategory
from .topping import resolve_topping
from .variant import resolve_variant

__all__ = [
    "ResolutionError",
    "resolve",
    "resolve_category",
    "resolve_item",
    "resolve_subcategory",
    "resolve_topping",
    "resolve_variant",
]
