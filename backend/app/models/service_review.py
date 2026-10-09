from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base

if TYPE_CHECKING:
    from .order import Order
    from .user import User


class ServiceReview(Base):
    """A customer's overall review of the service for one completed order:
    a 0-5 star rating, an optional note, and optional photos. One per order."""

    __tablename__ = "service_reviews"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # The order being reviewed. Unique so each order carries at most one service
    # review (the customer edits it via PATCH rather than creating duplicates).
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    # The reviewer, kept for convenience/auditing (derivable from the order too).
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    review: Mapped[str | None] = mapped_column(Text, nullable=True)
    review_images: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    order: Mapped["Order"] = relationship()
    user: Mapped["User"] = relationship()
