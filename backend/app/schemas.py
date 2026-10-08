from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ItemBase(BaseModel):
    subcategory_id: int
    name: str = Field(..., min_length=1, max_length=120)
    description: str | None = None
    price: Decimal = Field(..., ge=0)
    photos: list[str] = []
    tag_ids: list[int] = []
    is_veg: bool = True
    is_available: bool = True
    display_order: int = 0
    is_active: bool = True


class ItemCreate(ItemBase):
    # Topping ids to allow on this item (written through the M2M relationship).
    topping_ids: list[int] = []


class ItemUpdate(BaseModel):
    subcategory_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    price: Decimal | None = Field(default=None, ge=0)
    photos: list[str] | None = None
    tag_ids: list[int] | None = None
    topping_ids: list[int] | None = None
    is_veg: bool | None = None
    is_available: bool | None = None
    display_order: int | None = None
    is_active: bool | None = None


class ItemRead(ItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    # Populated from the Item.topping_ids property (derived from the relationship).
    topping_ids: list[int] = []
    created_at: datetime
    updated_at: datetime


# ---- Full-menu nested read schemas ----


class ToppingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    price: Decimal
    photos: list[str] = []
    is_available: bool
    is_active: bool


class VariantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    price_delta: Decimal


class ItemFull(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    price: Decimal
    photos: list[str] = []
    tag_ids: list[int] = []
    is_veg: bool
    is_available: bool
    display_order: int
    is_active: bool
    # Set by the personalised menu for items matching the user's chosen flavours;
    # always False for the plain full menu (the ORM item has no such column).
    is_recommended: bool = False
    toppings: list[ToppingRead] = []
    variants: list[VariantRead] = []


class ItemDetail(ItemFull):
    """Full detail for a single item, including the (potentially large)
    description that is deliberately omitted from the menu listing."""

    description: str | None = None


class SubcategoryFull(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    photos: list[str] = []
    display_order: int
    is_active: bool
    items: list[ItemFull] = []


class CategoryFull(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    photos: list[str] = []
    display_order: int
    is_active: bool
    subcategories: list[SubcategoryFull] = []


class FullMenuResponse(BaseModel):
    """The full nested menu plus the number of line items in the user's cart."""

    categories: list[CategoryFull]
    cart_count: int = 0


# ---- Cart ----


class AddToCartRequest(BaseModel):
    item_id: int
    # Selected toppings (any subset of the item's allowed toppings; may be empty).
    topping_ids: list[int] = []
    # Single selected variant, if the item offers variants.
    variant_id: int | None = None
    quantity: int = Field(default=1, ge=1)


class OrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    item_id: int
    topping_ids: list[int] = []
    variant_ids: list[int] = []
    quantity: int
    price: Decimal


class CartCountResponse(BaseModel):
    cart_count: int = 0


# ---- Orders ----


class OrderLineRead(BaseModel):
    """One line of an order: the snapshotted quantity/price plus the full item
    and the specific toppings and variants that were chosen for this line."""

    id: int
    item_id: int
    quantity: int
    # Unit price snapshot taken when the line was added (base + variants + toppings).
    price: Decimal
    item: ItemFull
    toppings: list[ToppingRead] = []
    variants: list[VariantRead] = []


class OrderRead(BaseModel):
    """An order (or the cart) with its fully expanded line items."""

    id: int
    status: str
    total_amount: Decimal
    payment_status: bool
    extra_notes: str | None = None
    created_at: datetime
    updated_at: datetime
    order_items: list[OrderLineRead] = []


class PaginatedOrders(BaseModel):
    """A page of the user's orders for a given status (one cart at most for the
    `cart` status), newest first, paged on the orders table."""

    items: list[OrderRead]
    total: int
    page: int
    page_size: int
    has_more: bool


# ---- Tags ----


class TagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tag: str


# ---- Paginated items-by-tags ----


class PaginatedItems(BaseModel):
    """A page of menu items (with nested toppings/variants) matching some tags."""

    items: list[ItemFull]
    total: int
    page: int
    page_size: int
    has_more: bool


# ---- Auth / OTP ----


class SendOtpRequest(BaseModel):
    email: EmailStr


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=1, max_length=10)


class MessageResponse(BaseModel):
    message: str


class VerifyOtpResponse(BaseModel):
    message: str
    access_token: str
    token_type: str = "bearer"
    # True when the account has no name yet and the client should prompt for it.
    name_required: bool


# ---- User ----


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str | None = None
    email_id: str
    user_type: str
    photo_path: str | None = None


class UserUpdate(BaseModel):
    # Only name, password and photo may be patched.
    name: str | None = Field(default=None, min_length=1, max_length=120)
    password: str | None = Field(default=None, min_length=6, max_length=128)
    photo_path: str | None = Field(default=None, max_length=255)


# ---- Game stats ----


class MyGameStat(BaseModel):
    """A single game life for the authenticated user."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    score: int
    datetime_started: datetime


class OverallGameStat(BaseModel):
    """A leaderboard row: a score together with who scored it."""

    id: int
    user_id: int
    name: str | None = None
    photo_path: str | None = None
    score: int
    datetime_started: datetime


class PaginatedOverallStats(BaseModel):
    items: list[OverallGameStat]
    total: int
    page: int
    page_size: int
    has_more: bool
