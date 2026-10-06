from sqlalchemy import Column, ForeignKey, Table

from ..database import Base

# Many-to-many link between items and toppings:
# an item allows a specific subset of toppings; a topping can apply to many items.
item_toppings = Table(
    "item_toppings",
    Base.metadata,
    Column("item_id", ForeignKey("items.id", ondelete="CASCADE"), primary_key=True),
    Column("topping_id", ForeignKey("toppings.id", ondelete="CASCADE"), primary_key=True),
)

# Many-to-many link between items and variants:
# variants live in a shared pool; an item can offer many variants, and a
# variant (e.g. "Large", "Small") can be reused across many items.
item_variants = Table(
    "item_variants",
    Base.metadata,
    Column("item_id", ForeignKey("items.id", ondelete="CASCADE"), primary_key=True),
    Column("variant_id", ForeignKey("variants.id", ondelete="CASCADE"), primary_key=True),
)
