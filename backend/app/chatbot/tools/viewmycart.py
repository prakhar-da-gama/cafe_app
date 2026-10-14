"""A minimal, chatbot-friendly view of one order (or cart).

Same lookup as ``GET /api/orders/{order_id}``, but stripped right down: just the
order's total and, for each line, the quantity and the item's name — nothing
else (no ids, prices, toppings, variants, reviews, timestamps, ...).
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from ... import models


class OrderNotFound(LookupError):
    """Raised when no ``orders`` row exists for the given id."""


def view_my_cart(db: Session, order_id: int) -> dict:
    """The order's total plus each line as ``{"name", "quantity"}``.

    Returns ``{"total_amount": float, "items": [{"name": str, "quantity": int}]}``.
    Raises :class:`OrderNotFound` if the id doesn't match a row.
    """
    order = db.get(models.Order, order_id)
    if order is None:
        raise OrderNotFound(f"No order with id {order_id!r}")

    lines = order.order_items
    item_ids = {line.item_id for line in lines}
    names = (
        dict(
            db.execute(
                select(models.Item.id, models.Item.name).where(
                    models.Item.id.in_(item_ids)
                )
            ).all()
        )
        if item_ids
        else {}
    )

    return {
        "total_amount": float(order.total_amount),
        "items": [
            {"name": names.get(line.item_id), "quantity": line.quantity}
            for line in lines
        ],
    }
