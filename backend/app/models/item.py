from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base
from .associations import item_toppings, item_variants

if TYPE_CHECKING:
    from .subcategory import Subcategory
    from .topping import Topping
    from .variant import Variant


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    subcategory_id: Mapped[int] = mapped_column(
        ForeignKey("subcategories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    photos: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    # Tags for this item, referencing tags.id.
    tag_ids: Mapped[list[int]] = mapped_column(JSON, default=list, nullable=False)
    is_veg: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    subcategory: Mapped["Subcategory"] = relationship(back_populates="items")

    # Allowed toppings for this item (many-to-many). selectin avoids N+1 on reads.
    toppings: Mapped[list["Topping"]] = relationship(
        secondary=item_toppings, back_populates="items", lazy="selectin"
    )

    # Variants offered by this item, drawn from the shared pool (many-to-many).
    variants: Mapped[list["Variant"]] = relationship(
        secondary=item_variants, back_populates="items", lazy="selectin"
    )

    @property
    def topping_ids(self) -> list[int]:
        """Convenience view of the related topping ids for API responses."""
        return [t.id for t in self.toppings]

    @property
    def variant_ids(self) -> list[int]:
        """Convenience view of the related variant ids for API responses."""
        return [v.id for v in self.variants]
