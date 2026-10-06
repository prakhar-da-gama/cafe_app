from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import JSON, ForeignKey, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base

if TYPE_CHECKING:
    from .order import Order


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The menu item chosen. RESTRICT: items are soft-deleted (is_active), not
    # hard-deleted, so historical order lines keep pointing at a real item.
    item_id: Mapped[int] = mapped_column(
        ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Selected topping / variant ids for this line (subset of the item's allowed set).
    topping_ids: Mapped[list[int]] = mapped_column(JSON, default=list, nullable=False)
    variant_ids: Mapped[list[int]] = mapped_column(JSON, default=list, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # Unit price snapshot (base + variant deltas + toppings) at the time of ordering.
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)

    order: Mapped["Order"] = relationship(back_populates="order_items")
