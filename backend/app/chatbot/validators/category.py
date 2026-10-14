"""Resolve free text to the best-matching category."""
from sqlalchemy.orm import Session

from ...models import Category
from ._base import resolve


def resolve_category(db: Session, query: str, score_cutoff: float = 0.0) -> Category:
    """Resolve free text to the best-matching category and return the full row."""
    return resolve(db, Category, query, score_cutoff, "categories")
