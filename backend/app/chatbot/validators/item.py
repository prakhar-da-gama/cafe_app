"""Resolve free text to the best-matching item."""
from sqlalchemy.orm import Session

from ...models import Item
from ._base import resolve


def resolve_item(db: Session, query: str, score_cutoff: float = 0.0) -> Item:
    """Resolve free text to the best-matching item and return the full row."""
    return resolve(db, Item, query, score_cutoff, "items")
