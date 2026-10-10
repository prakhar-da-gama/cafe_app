from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .models import OrderStatus


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
    # Variant ids offered by this item (written through the M2M relationship).
    variant_ids: list[int] = []


class ItemUpdate(BaseModel):
    subcategory_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    price: Decimal | None = Field(default=None, ge=0)
    photos: list[str] | None = None
    tag_ids: list[int] | None = None
    topping_ids: list[int] | None = None
    variant_ids: list[int] | None = None
    is_veg: bool | None = None
    is_available: bool | None = None
    display_order: int | None = None
    is_active: bool | None = None


class ItemRead(ItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    # Populated from the Item.topping_ids / variant_ids properties (derived from
    # the M2M relationships).
    topping_ids: list[int] = []
    variant_ids: list[int] = []
    created_at: datetime
    updated_at: datetime


class AvailabilityUpdate(BaseModel):
    """Manager toggle for whether an item or topping is in stock."""

    is_available: bool


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


# ---- Manager create schemas (categories / subcategories) ----


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    description: str | None = None
    photos: list[str] = []
    # Position among categories; appended to the end when omitted.
    display_order: int | None = None
    is_active: bool = True


class SubcategoryCreate(BaseModel):
    category_id: int
    name: str = Field(..., min_length=1, max_length=80)
    description: str | None = None
    photos: list[str] = []
    # Position within its category; appended to the end when omitted.
    display_order: int | None = None
    is_active: bool = True


class ToppingCreate(BaseModel):
    """Create a topping in the shared pool; its id is then linked to one or
    more items via the item_toppings association."""

    name: str = Field(..., min_length=1, max_length=80)
    price: Decimal = Field(default=Decimal("0"), ge=0)
    photos: list[str] = []
    is_available: bool = True
    is_active: bool = True


class VariantCreate(BaseModel):
    """Create a variant in the shared pool; its id is then linked to one or
    more items via the item_variants association."""

    name: str = Field(..., min_length=1, max_length=80)
    description: str | None = None
    # Signed adjustment to the item's base price (e.g. Large = +40, Small = -20).
    price_delta: Decimal = Decimal("0")


class ItemSummary(BaseModel):
    """A lightweight item reference (no nested toppings/variants)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    price: Decimal
    photos: list[str] = []
    is_veg: bool
    is_available: bool


class OutOfStockToppingGroup(BaseModel):
    """The out-of-stock toppings grouped under one item they belong to."""

    item: ItemSummary
    toppings: list[ToppingRead]


# ---- Cart ----


class AddToCartRequest(BaseModel):
    item_id: int
    # Selected toppings (any subset of the item's allowed toppings; may be empty).
    topping_ids: list[int] = []
    # Single selected variant, if the item offers variants.
    variant_id: int | None = None
    quantity: int = Field(default=1, ge=1)
    # Optional review fields (normally left blank at add-to-cart time and filled
    # in later via the review endpoint once the order is completed).
    rating: int | None = Field(default=None, ge=0, le=5)
    review: str | None = None
    review_photo_paths: list[str] = []


class OrderItemReviewUpdate(BaseModel):
    """Customer review for a single completed order line. Every field is
    optional so a review can set a star rating, a note, photos, or any mix."""

    rating: int | None = Field(default=None, ge=0, le=5)
    review: str | None = None
    review_photo_paths: list[str] | None = None


class OrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    item_id: int
    topping_ids: list[int] = []
    variant_ids: list[int] = []
    quantity: int
    price: Decimal
    rating: int | None = None
    review: str | None = None
    review_photo_paths: list[str] = []


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
    # Customer review of this line (present once left; all optional).
    rating: int | None = None
    review: str | None = None
    review_photo_paths: list[str] = []


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


class OrderManagerUpdate(BaseModel):
    """Manager-driven changes to an order: advance its status along the kitchen
    workflow and/or mark it paid. Allowed status transitions are enforced by the
    router; at least one field should be set."""

    status: OrderStatus | None = None
    payment_status: bool | None = None


# ---- Item reviews (manager view) ----


class ItemReviewEntry(BaseModel):
    """One customer review of an item, pulled from an order line it appears on."""

    order_item_id: int
    order_id: int
    rating: int | None = None
    review: str | None = None
    review_photo_paths: list[str] = []
    created_at: datetime


class ItemReviewsResponse(BaseModel):
    """All reviews left for one menu item across every order it appears on,
    plus the average star rating. Powers the manager's "view ratings" popup."""

    item_id: int
    average_rating: float | None = None
    rating_count: int = 0
    reviews: list[ItemReviewEntry] = []


# ---- Service reviews ----


class ServiceReviewCreate(BaseModel):
    """A customer's overall service review for one completed order."""

    order_id: int
    rating: int = Field(..., ge=0, le=5)
    review: str | None = None
    review_images: list[str] = []


class ServiceReviewUpdate(BaseModel):
    """Partial edit of a service review; only the fields set are changed."""

    rating: int | None = Field(default=None, ge=0, le=5)
    review: str | None = None
    review_images: list[str] | None = None


class ServiceReviewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    user_id: int
    rating: int
    review: str | None = None
    review_images: list[str] = []
    created_at: datetime
    updated_at: datetime


class PaginatedServiceReviews(BaseModel):
    """A page of service reviews (newest first) plus the overall average."""

    items: list[ServiceReviewRead]
    total: int
    page: int
    page_size: int
    has_more: bool
    average_rating: float | None = None


class ServiceRatingSummary(BaseModel):
    """Headline service rating for the manager dashboard."""

    average_rating: float | None = None
    rating_count: int = 0


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


class ExistsResponse(BaseModel):
    exists: bool


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


# ---- AI menu assistant ----


class FormatCategoryRequest(BaseModel):
    """Manager-supplied category to polish with the AI menu assistant."""

    name: str = Field(..., min_length=1, max_length=120)
    description: str | None = None


class FormatCategoryResponse(BaseModel):
    """The manager's original category alongside five AI-suggested rewrites of
    both its name and its description."""

    original_name: str
    original_description: str | None = None
    recommended_names: list[str]
    recommended_descriptions: list[str]


class FormatSubcategoryRequest(BaseModel):
    """Manager-supplied subcategory to polish. ``category_id`` is the category
    the manager currently intends to file it under."""

    name: str = Field(..., min_length=1, max_length=120)
    description: str | None = None
    category_id: int


class FormatSubcategoryResponse(BaseModel):
    original_name: str
    original_description: str | None = None
    recommended_names: list[str]
    recommended_descriptions: list[str]
    # If the assistant thinks the subcategory fits an *existing* category better
    # than the selected one, that category is named here (null otherwise).
    recommended_existing_category_id: int | None = None
    recommended_existing_category_name: str | None = None
    # If the assistant strongly feels a brand-new category should be created for
    # this subcategory, this is true and the two suggested_new_* fields are set.
    suggested_create_new_category: bool = False
    suggested_new_category_name: str | None = None
    suggested_new_category_description: str | None = None


class GrammarFixRequest(BaseModel):
    text: str = Field(..., min_length=1)


class GrammarFixResponse(BaseModel):
    original_text: str
    fixed_text: str


# ---- Dish-creation chat assistant ----


class DishAssistantStartRequest(BaseModel):
    """The manager's opening description of the dish they want to create."""

    message: str = Field(..., min_length=1)


class DishAssistantMessageRequest(BaseModel):
    """A follow-up turn in an existing dish-creation chat."""

    session_id: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)


class DishAssistantEndRequest(BaseModel):
    session_id: str = Field(..., min_length=1)


class DishAssistantVariant(BaseModel):
    name: str
    price_delta: Decimal = Decimal("0")


class DishAssistantTopping(BaseModel):
    name: str
    price: Decimal = Decimal("0")


class DishAssistantForm(BaseModel):
    """The proposed dish, with category/subcategory/tag names resolved to real
    ids where they matched existing rows (null/empty where they did not)."""

    category_id: int | None = None
    category_name: str | None = None
    subcategory_id: int | None = None
    subcategory_name: str | None = None
    name: str | None = None
    price: Decimal | None = None
    is_veg: bool | None = None
    description: str | None = None
    tag_ids: list[int] = []
    tags: list[str] = []
    variants: list[DishAssistantVariant] = []
    toppings: list[DishAssistantTopping] = []


class DishAssistantReply(BaseModel):
    """One assistant turn returned to the client: the chat message to show, a
    ready flag, and the current form proposal."""

    message: str
    ready: bool = False
    form: DishAssistantForm


class DishAssistantStartResponse(BaseModel):
    session_id: str
    reply: DishAssistantReply


class DishAssistantMessageResponse(BaseModel):
    reply: DishAssistantReply
