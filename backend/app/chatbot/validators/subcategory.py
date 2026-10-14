"""Resolve free text to the best-matching subcategory."""
from sqlalchemy.orm import Session

from ...models import Subcategory
from ._base import resolve


def resolve_subcategory(
    db: Session,
    query: str,
    category_id: int | None = None,
    score_cutoff: float = 0.0,
) -> Subcategory:
    """Resolve free text to the best-matching subcategory and return the full row.

    When `category_id` is given, matching is restricted to subcategories under
    that category, so a name shared across categories can't resolve to the
    wrong one.
    """
    filters = [] if category_id is None else [Subcategory.category_id == category_id]
    return resolve(db, Subcategory, query, score_cutoff, "subcategories", *filters)
