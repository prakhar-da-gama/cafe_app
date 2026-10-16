from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from .models import OrderStatus

# Reviews are limited to this many words, enforced on every endpoint that
# accepts review text (and mirrored by the frontend).
MAX_REVIEW_WORDS = 50


def validate_review_word_count(value: str | None) -> str | None:
    """Reject review text longer than MAX_REVIEW_WORDS words."""
    if value is not None and len(value.split()) > MAX_REVIEW_WORDS:
        raise ValueError(f"Review must be {MAX_REVIEW_WORDS} words or fewer")
    return value


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

    _check_review = field_validator("review")(validate_review_word_count)


class OrderItemReviewUpdate(BaseModel):
    """Customer review for a single completed order line. Every field is
    optional so a review can set a star rating, a note, photos, or any mix."""

    rating: int | None = Field(default=None, ge=0, le=5)
    review: str | None = None
    review_photo_paths: list[str] | None = None

    _check_review = field_validator("review")(validate_review_word_count)


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


class OrderSummary(BaseModel):
    """A lightweight order row for the manager dashboard list — exactly what the
    collapsed card shows (number, time, drink count, total, status). The line
    items are deliberately *not* expanded here; fetch them on expand via
    GET /api/orders/{order_id}."""

    id: int
    status: str
    total_amount: Decimal
    created_at: datetime
    # Total quantity across the order's lines (the "N drinks" count).
    item_count: int


class PaginatedOrderSummaries(BaseModel):
    """A page of order summaries for the manager dashboard, newest first, paged
    on the orders table."""

    items: list[OrderSummary]
    total: int
    page: int
    page_size: int
    has_more: bool


class OrderManagerUpdate(BaseModel):
    """Manager-driven change to an order: advance its status along the kitchen
    workflow (marking paid is the payment_pending → payment_completed step).
    Allowed status transitions are enforced by the router."""

    status: OrderStatus | None = None


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

    _check_review = field_validator("review")(validate_review_word_count)


class ServiceReviewUpdate(BaseModel):
    """Partial edit of a service review; only the fields set are changed."""

    rating: int | None = Field(default=None, ge=0, le=5)
    review: str | None = None
    review_images: list[str] | None = None

    _check_review = field_validator("review")(validate_review_word_count)


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


class ServiceReviewScoresRead(BaseModel):
    """The singleton aggregate of AI-derived 0-10 service-aspect scores. Any
    aspect may be null when the reviews gave nothing to score it on. Field names
    mirror the service_review_scores columns and the analyser's TAGS list."""

    model_config = ConfigDict(from_attributes=True)

    number_of_reviews: int = 0
    staff_friendliness: int | None = None
    speed_of_service: int | None = None
    order_accuracy: int | None = None
    atmosphere_ambiance: int | None = None
    cleanliness: int | None = None
    value_for_money: int | None = None
    food_quality: int | None = None
    menu_variety: int | None = None
    seating_comfort: int | None = None
    noise_level: int | None = None
    payment_billing_experience: int | None = None


# ---- Notifications ----


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    notification_text: str
    resolved: bool
    notification_for: str
    created_at: datetime
    updated_at: datetime


class PaginatedNotifications(BaseModel):
    """A DB-paginated page of notifications for one audience, newest first."""

    items: list[NotificationRead]
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


# ---- Create menu from photos / backup / restore ----


class MenuImportRequest(BaseModel):
    """Build the whole menu from photos of a physical menu. ``photo_paths`` are
    public upload paths (/api/uploads/<name>) from the upload endpoint, and
    ``instructions`` is optional free text to steer the extraction. When a menu
    already exists the call is refused with 409 unless ``confirm_overwrite`` is
    set — that is the warning the manager must accept before the menu is wiped
    and replaced."""

    photo_paths: list[str] = Field(..., min_length=1)
    instructions: str | None = None
    confirm_overwrite: bool = False


class RestoreBackupRequest(BaseModel):
    backup_path: str = Field(..., min_length=1)


class MenuImportResponse(BaseModel):
    """What a successful import/restore built, plus the backup it wrote of the
    menu that was replaced (null when there was nothing to back up)."""

    categories: int
    subcategories: int
    items: int
    tags: int
    toppings: int
    variants: int
    backup_path: str | None = None


class MenuBackupInfo(BaseModel):
    """One stored backup for the manager's restore list."""

    path: str
    created_at: str | None = None
    categories: int = 0
    items: int = 0


# ---- Chatbot ----


class InitiateChatRequest(BaseModel):
    """What the frontend sends to start (or resume) a chat session."""

    # Free-text description of who's at the table, e.g. "2 adults and a kid".
    setup_of_people: str = Field(..., min_length=1)
    # Whether the chatbot should only consider vegetarian items.
    veg_only: bool = False


class InitiateChatResponse(BaseModel):
    """The ids the rest of the session is scoped to: the active chat context and
    the user's open cart (the chatbot builds the order into this cart).

    For a brand-new session the barista's opening turn is generated and returned
    too (``first_message`` text + ``first_items`` resolved suggestion tree), so
    the chat opens on a real greeting instead of a hardcoded one. Both are null
    when an existing session is resumed (its opening turn is already in the
    transcript) or if generating the opener failed."""

    chat_context_id: int
    cart_id: int
    # True when an existing active session was resumed, False when a brand-new
    # one was created. The client uses this (not the presence of an opener) to
    # decide whether to show the generated opening turn below.
    resumed: bool = False
    # The barista's opening message text, and its resolved item suggestions
    # (get-full-menu-shaped, like the /message endpoint's items_json). Only set
    # for a new session (``resumed`` False).
    first_message: str | None = None
    first_items: dict[str, Any] | None = None
    # The opener's quick-action chips: short, first-person utterances the guest
    # can tap, each sent verbatim to /message as their turn. Rendered as the
    # in-chat MCQ. Only set for a new session.
    first_options: list[str] | None = None


class ActiveChatSession(BaseModel):
    """Whether the user has a resumable barista session (an active chat context
    *and* an open cart). ``active`` is true only when both exist, in which case
    their ids are returned so the client can jump straight into the chat; it is
    false otherwise (after the endpoint has repaired any inconsistent state)."""

    active: bool
    chat_context_id: int | None = None
    cart_id: int | None = None


class ChatTranscriptEntry(BaseModel):
    """One stored turn of a chat session, for replaying the conversation.

    Deliberately omits ``items_json`` — resuming a chat replays the turns as
    plain bubbles, so only the role and the message text are carried."""

    role: str
    content: str | None = None


class ChatMessageRequest(BaseModel):
    """One customer turn: which session and cart it belongs to, plus the text."""

    chat_context_id: int
    # The user's open cart / order the chatbot is building (view_my_cart's order_id).
    cart_id: int
    message: str = Field(..., min_length=1)
