"""Resolve free text to the best-matching subcategory."""
from sqlalchemy.orm import Session

from ...models import Subcategory
from ._base import resolve


def resolve_subcategory(db: Session, query: str, score_cutoff: float = 0.0) -> Subcategory:
    """Resolve free text to the best-matching subcategory and return the full row."""
    return resolve(db, Subcategory, query, score_cutoff, "subcategories")
