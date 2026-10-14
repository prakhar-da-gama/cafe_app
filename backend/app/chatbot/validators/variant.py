"""Resolve free text to the best-matching variant."""
from sqlalchemy.orm import Session

from ...models import Variant
from ._base import resolve


def resolve_variant(db: Session, query: str, score_cutoff: float = 0.0) -> Variant:
    """Resolve free text to the best-matching variant and return the full row."""
    return resolve(db, Variant, query, score_cutoff, "variants")
