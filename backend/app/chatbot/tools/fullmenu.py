"""A trimmed, chatbot-friendly view of the full menu.

Mirrors the ``get-full-menu`` endpoint's nested shape (categories ->
subcategories -> items) but strips every row down to the bare fields the
chatbot needs, so the model isn't handed ids, photos, timestamps, toppings,
variants and other noise it never reasons about.

Filtering rules applied here (and not in the HTTP endpoint):

* veg-only — read from the chat session's ``chat_contexts`` row: when its
  ``veg_only`` flag is true only vegetarian items are kept; otherwise every
  item is kept regardless of its ``is_veg`` flag.
* availability — only items with ``is_available`` true are ever returned.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from ... import models


class ChatContextNotFound(LookupError):
    """Raised when no ``chat_contexts`` row exists for the given id."""


def get_full_menu(db: Session, chat_context_id: int) -> list[dict]:
    """The whole menu as a trimmed nested tree, scoped to a chat session.

    Looks up the ``chat_contexts`` row for ``chat_context_id`` and uses its
    ``veg_only`` flag to decide whether non-veg items are dropped.

    Returns a list of categories, each ``{"name", "subcategories"}``; each
    subcategory ``{"name", "items"}``; each item ``{"name", "price"}``.

    Only available items are included; when the session's ``veg_only`` is true,
    non-veg items are dropped too. Raises :class:`ChatContextNotFound` if the id
    doesn't match a row.
    """
    context = db.get(models.ChatContext, chat_context_id)
    if context is None:
        raise ChatContextNotFound(f"No chat context with id {chat_context_id!r}")
    is_veg = context.veg_only

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
