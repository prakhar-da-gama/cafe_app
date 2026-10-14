"""Resolve free text to the best-matching variant."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import Variant, item_variants
from ._base import resolve


def resolve_variant(db: Session, query: str, score_cutoff: float = 0.0) -> Variant:
    """Resolve free text to the best-matching variant and return the full row."""
    return resolve(db, Variant, query, score_cutoff, "variants")


def item_variant_ids(db: Session, item_id: int) -> list[int]:
    """Return the ids of the variants linked to the given item.

    Reads the ``item_variants`` join table directly, so only the ids are
    fetched (no full variant rows). An unknown item simply yields an empty list.
    """
    stmt = select(item_variants.c.variant_id).where(
        item_variants.c.item_id == item_id
    )
    return list(db.execute(stmt).scalars().all())
