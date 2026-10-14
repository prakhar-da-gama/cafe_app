"""Resolve free text to the best-matching topping."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import Topping, item_toppings
from ._base import resolve


def resolve_topping(db: Session, query: str, score_cutoff: float = 0.0) -> Topping:
    """Resolve free text to the best-matching topping and return the full row."""
    return resolve(db, Topping, query, score_cutoff, "toppings")


def item_topping_ids(db: Session, item_id: int) -> list[int]:
    """Return the ids of the toppings linked to the given item.

    Reads the ``item_toppings`` join table directly, so only the ids are
    fetched (no full topping rows). An unknown item simply yields an empty list.
    """
    stmt = select(item_toppings.c.topping_id).where(
        item_toppings.c.item_id == item_id
    )
    return list(db.execute(stmt).scalars().all())
