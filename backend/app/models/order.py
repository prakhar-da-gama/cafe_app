from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime
from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, Index, Numeric, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base

if TYPE_CHECKING:
    from .order_item import OrderItem


class OrderStatus(str, enum.Enum):
    # A cart is a draft order that hasn't been checked out yet.
    cart = "cart"
    pending = "pending"
    preparing = "preparing"
    ready = "ready"
    completed = "completed"
    cancelled = "cancelled"


class Order(Base):
    __tablename__ = "orders"
    # Listing a user's orders is always filtered by (user_id, status) and paged
    # on the orders table, so index that pair to keep those scans cheap.
    __table_args__ = (Index("ix_orders_user_status", "user_id", "status"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # The owning user. Identifies the cart/order (every user has an account via OTP).
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    status: Mapped[OrderStatus] = mapped_column(
        SAEnum(OrderStatus), nullable=False, default=OrderStatus.pending
    )
    payment_status: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    extra_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Line items (the former `items` JSON, now its own table).
    order_items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", lazy="selectin"
    )
