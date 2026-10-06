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
    description: str | None = None
    price: Decimal
    photos: list[str] = []
    tag_ids: list[int] = []
    is_veg: bool
    is_available: bool
    display_order: int
    is_active: bool
    toppings: list[ToppingRead] = []
    variants: list[VariantRead] = []


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


class UserUpdate(BaseModel):
    # Only name and password may be patched.
    name: str | None = Field(default=None, min_length=1, max_length=120)
    password: str | None = Field(default=None, min_length=6, max_length=128)
