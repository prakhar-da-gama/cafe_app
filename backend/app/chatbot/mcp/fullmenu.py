"""A trimmed, chatbot-friendly view of the full menu.

Mirrors the ``get-full-menu`` endpoint's nested shape (categories ->
subcategories -> items) but strips every row down to the bare fields the
chatbot needs, so the model isn't handed ids, photos, timestamps, toppings,
variants and other noise it never reasons about.

Filtering rules applied here (and not in the HTTP endpoint):

* ``is_veg`` input — when ``True`` only vegetarian items are kept; when
  ``False`` every item is kept regardless of its ``is_veg`` flag.
* availability — only items with ``is_available`` true are ever returned.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from ... import models


def get_full_menu(db: Session, is_veg: bool = False) -> list[dict]:
    """The whole menu as a trimmed nested tree.

    Returns a list of categories, each ``{"name", "subcategories"}``; each
    subcategory ``{"name", "items"}``; each item ``{"name", "price"}``.

    Only available items are included; when ``is_veg`` is true, non-veg items
    are dropped too.
    """
    stmt = select(models.Category).order_by(
        models.Category.display_order, models.Category.name
    )
    categories = db.execute(stmt).scalars().all()

    result: list[dict] = []
    for category in categories:
        subcategories: list[dict] = []
        for sub in category.subcategories:
            items: list[dict] = []
            for item in sub.items:
                if not item.is_available:
                    continue
                if is_veg and not item.is_veg:
                    continue
                items.append(
                    {
                        "name": item.name,
                        "price": float(item.price),
                    }
                )
            subcategories.append({"name": sub.name, "items": items})
        result.append({"name": category.name, "subcategories": subcategories})

    return result
