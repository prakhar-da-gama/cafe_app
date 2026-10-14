"""Resolve free text to the best-matching item."""
from sqlalchemy.orm import Session

from ...models import Item
from ._base import resolve


def resolve_item(
    db: Session,
    query: str,
    subcategory_id: int | None = None,
    score_cutoff: float = 0.0,
) -> Item:
    """Resolve free text to the best-matching item and return the full row.

    When `subcategory_id` is given, matching is restricted to items under that
    subcategory, so a name shared across subcategories can't resolve to the
    wrong one.
    """
    filters = [] if subcategory_id is None else [Item.subcategory_id == subcategory_id]
    return resolve(db, Item, query, score_cutoff, "items", *filters)
