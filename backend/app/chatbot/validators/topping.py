"""Resolve free text to the best-matching topping."""
from sqlalchemy.orm import Session

from ...models import Topping
from ._base import resolve


def resolve_topping(db: Session, query: str, score_cutoff: float = 0.0) -> Topping:
    """Resolve free text to the best-matching topping and return the full row."""
    return resolve(db, Topping, query, score_cutoff, "toppings")
