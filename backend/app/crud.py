import json
import secrets
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import JSON, cast, func, literal, select
from sqlalchemy.orm import Session

from . import models, schemas
from .config import get_settings

settings = get_settings()


def _load_toppings(db: Session, topping_ids: list[int]) -> list[models.Topping]:
    if not topping_ids:
        return []
    stmt = select(models.Topping).where(models.Topping.id.in_(topping_ids))
    return list(db.execute(stmt).scalars().all())


def list_items(
    db: Session, subcategory_id: int | None = None, available_only: bool = False
) -> list[models.Item]:
    stmt = select(models.Item)
    if subcategory_id is not None:
        stmt = stmt.where(models.Item.subcategory_id == subcategory_id)
    if available_only:
        stmt = stmt.where(models.Item.is_available.is_(True))
    stmt = stmt.order_by(models.Item.display_order, models.Item.name)
    return list(db.execute(stmt).scalars().all())


def get_item(db: Session, item_id: int) -> models.Item | None:
    return db.get(models.Item, item_id)


def get_full_menu(
    db: Session, tag_ids: list[int] | None = None
) -> list[schemas.CategoryFull] | list[models.Category]:
    """All categories ordered for display, with subcategories -> items ->
    toppings/variants eagerly loaded via the relationships' selectin loading.

    When ``tag_ids`` is given, the tree is filtered down to items whose tags
    overlap the requested ones, pruning subcategories and categories that end
    up empty. The shape of the response is identical either way — the only
    difference is which items come back. Filtering happens on detached Pydantic
    copies so the loaded ORM relationships are never mutated (which would risk
    orphaning rows on the next autoflush)."""
    stmt = select(models.Category).order_by(
        models.Category.display_order, models.Category.name
    )
    categories = list(db.execute(stmt).scalars().all())
    if not tag_ids:
        return categories

    wanted = set(tag_ids)
    pruned: list[schemas.CategoryFull] = []
    for category in categories:
        cat = schemas.CategoryFull.model_validate(category)
        subs = []
        for sub in cat.subcategories:
            sub.items = [i for i in sub.items if wanted & set(i.tag_ids)]
            if sub.items:
                subs.append(sub)
        if subs:
            cat.subcategories = subs
            pruned.append(cat)
    return pruned


def get_personalised_menu(
    db: Session, tag_ids: list[int] | None = None
) -> list[schemas.CategoryFull]:
    """The personalised menu: the full nested tree with *nothing pruned* — the
    same categories, subcategories and items as the full menu.

    The difference is ordering and flagging: within each subcategory the items
    whose tags overlap the requested ones are marked ``is_recommended`` and
    floated to the front, followed by the remaining items in their normal order.
    With no ``tag_ids`` nothing is recommended, so it reduces to the full menu.

    Flagging/reordering happens on detached Pydantic copies so the loaded ORM
    relationships are never mutated."""
    stmt = select(models.Category).order_by(
        models.Category.display_order, models.Category.name
    )
    categories = list(db.execute(stmt).scalars().all())
    wanted = set(tag_ids or [])

    result: list[schemas.CategoryFull] = []
    for category in categories:
        cat = schemas.CategoryFull.model_validate(category)
        for sub in cat.subcategories:
            recommended: list[schemas.ItemFull] = []
            others: list[schemas.ItemFull] = []
            for item in sub.items:
                if wanted & set(item.tag_ids):
                    item.is_recommended = True
                    recommended.append(item)
                else:
                    others.append(item)
            sub.items = recommended + others
        result.append(cat)
    return result


def list_items_by_tags(
    db: Session, tag_ids: list[int], page: int = 1, page_size: int = 10
) -> dict:
    """Paginated, available menu items whose tag_ids overlap the requested tags.

    Toppings and variants come along eagerly via each relationship's selectin
    loading (two extra batched queries total, not one-per-item), so the nested
    read stays free of N+1 queries. Filtering is pushed down to MySQL with
    JSON_OVERLAPS so we never materialise the whole table to filter in Python.
    """
    stmt = select(models.Item).where(
        models.Item.is_active.is_(True),
        models.Item.is_available.is_(True),
    )
    if tag_ids:
        requested = cast(literal(json.dumps(tag_ids)), JSON)
        stmt = stmt.where(func.json_overlaps(models.Item.tag_ids, requested) == 1)

    total = db.execute(
        select(func.count()).select_from(stmt.order_by(None).subquery())
    ).scalar_one()

    offset = (page - 1) * page_size
    rows = (
        db.execute(
            stmt.order_by(models.Item.display_order, models.Item.name)
            .limit(page_size)
            .offset(offset)
        )
        .scalars()
        .all()
    )

    return {
        "items": list(rows),
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": offset + len(rows) < total,
    }


def create_item(db: Session, data: schemas.ItemCreate) -> models.Item:
    payload = data.model_dump()
    topping_ids = payload.pop("topping_ids", [])
    item = models.Item(**payload)
    item.toppings = _load_toppings(db, topping_ids)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_item(
    db: Session, item: models.Item, data: schemas.ItemUpdate
) -> models.Item:
    payload = data.model_dump(exclude_unset=True)
    topping_ids = payload.pop("topping_ids", None)
    for field, value in payload.items():
        setattr(item, field, value)
    if topping_ids is not None:
        item.toppings = _load_toppings(db, topping_ids)
    db.commit()
    db.refresh(item)
    return item


def delete_item(db: Session, item: models.Item) -> None:
    db.delete(item)
    db.commit()


def set_item_availability(
    db: Session, item: models.Item, is_available: bool
) -> models.Item:
    """Manager action: flip whether an item is in stock (orderable)."""
    item.is_available = is_available
    db.commit()
    db.refresh(item)
    return item


def list_out_of_stock_items(db: Session) -> list[models.Item]:
    """Active items that are currently out of stock, by name."""
    stmt = (
        select(models.Item)
        .where(
            models.Item.is_active.is_(True),
            models.Item.is_available.is_(False),
        )
        .order_by(models.Item.name)
    )
    return list(db.execute(stmt).scalars().all())


def list_out_of_stock_toppings(db: Session) -> list[dict]:
    """Out-of-stock toppings grouped under each (active) item they belong to.

    A topping can be offered by several items, so it may appear under more than
    one group. Groups and their toppings are sorted by name.
    """
    toppings = (
        db.execute(
            select(models.Topping).where(
                models.Topping.is_active.is_(True),
                models.Topping.is_available.is_(False),
            )
        )
        .scalars()
        .all()
    )

    groups: dict[int, dict] = {}
    for topping in toppings:
        for item in topping.items:
            if not item.is_active:
                continue
            group = groups.get(item.id)
            if group is None:
                group = {"item": item, "toppings": []}
                groups[item.id] = group
            group["toppings"].append(topping)

    result = sorted(groups.values(), key=lambda g: g["item"].name)
    for group in result:
        group["toppings"].sort(key=lambda t: t.name)
    return result


def get_topping(db: Session, topping_id: int) -> models.Topping | None:
    return db.get(models.Topping, topping_id)


def set_topping_availability(
    db: Session, topping: models.Topping, is_available: bool
) -> models.Topping:
    """Manager action: flip whether a topping is in stock."""
    topping.is_available = is_available
    db.commit()
    db.refresh(topping)
    return topping


# ---- OTP ----


def generate_otp() -> str:
    """A zero-padded numeric OTP of the configured length."""
    upper = 10 ** settings.otp_length
    return str(secrets.randbelow(upper)).zfill(settings.otp_length)


def get_otps_for_email(db: Session, email: str) -> list[models.Otp]:
    stmt = select(models.Otp).where(models.Otp.email == email)
    return list(db.execute(stmt).scalars().all())


def create_otp(db: Session, email: str, code: str) -> models.Otp:
    otp = models.Otp(
        email=email,
        otp=code,
        expiry_at=datetime.utcnow() + timedelta(minutes=settings.otp_ttl_minutes),
    )
    db.add(otp)
    db.commit()
    db.refresh(otp)
    return otp


def delete_otps(db: Session, otps: list[models.Otp]) -> None:
    for otp in otps:
        db.delete(otp)
    db.commit()


# ---- Users ----


def get_user_by_email(db: Session, email: str) -> models.User | None:
    stmt = select(models.User).where(models.User.email_id == email)
    return db.execute(stmt).scalars().first()


def manager_exists(db: Session, email: str) -> bool:
    """True if an account with this email exists and is a manager. Backs the
    public pre-check on the manager login page (managers can't self-sign-up)."""
    stmt = select(models.User.id).where(
        models.User.email_id == email,
        models.User.user_type == models.UserType.manager,
    )
    return db.execute(stmt).first() is not None


def create_otp_user(db: Session, email: str) -> models.User:
    """Create a passwordless, nameless account for a verified email."""
    user = models.User(
        name=None,
        email_id=email,
        password=None,
        user_type=models.UserType.customer,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ---- Orders ----


def get_or_create_cart(db: Session, user_id: int) -> models.Order:
    """Return the user's open cart, creating one if none exists.

    A cart is a draft order (status `cart`). Every user has at most one open
    at a time; this is called on login so the user always has one to add to.
    """
    stmt = select(models.Order).where(
        models.Order.user_id == user_id,
        models.Order.status == models.OrderStatus.cart,
    )
    cart = db.execute(stmt).scalars().first()
    if cart is not None:
        return cart

    cart = models.Order(user_id=user_id, status=models.OrderStatus.cart)
    db.add(cart)
    db.commit()
    db.refresh(cart)
    return cart


def get_cart_item_count(db: Session, user_id: int) -> int:
    """Number of line items in the user's open cart (0 if there's no cart)."""
    order_id = db.execute(
        select(models.Order.id).where(
            models.Order.user_id == user_id,
            models.Order.status == models.OrderStatus.cart,
        )
    ).scalar_one_or_none()
    if order_id is None:
        return 0
    return db.execute(
        select(func.count())
        .select_from(models.OrderItem)
        .where(models.OrderItem.order_id == order_id)
    ).scalar_one()


def add_item_to_cart(
    db: Session,
    *,
    user_id: int,
    item: models.Item,
    topping_ids: list[int],
    variant_id: int | None,
    quantity: int,
) -> models.OrderItem:
    """Add a validated line item to the user's cart, snapshotting its unit price.

    The caller is responsible for validating that ``topping_ids`` and
    ``variant_id`` belong to the item. Price = item base + each topping's price
    + the selected variant's (signed) delta.
    """
    total = Decimal(item.price)
    for topping in _load_toppings(db, topping_ids):
        total += topping.price

    variant_ids: list[int] = []
    if variant_id is not None:
        variant = db.get(models.Variant, variant_id)
        total += variant.price_delta
        variant_ids = [variant_id]

    cart = get_or_create_cart(db, user_id)
    order_item = models.OrderItem(
        order_id=cart.id,
        item_id=item.id,
        topping_ids=list(topping_ids),
        variant_ids=variant_ids,
        quantity=quantity,
        price=total,
    )
    db.add(order_item)
    db.commit()
    db.refresh(order_item)
    return order_item


def _serialize_orders(
    db: Session, orders: list[models.Order]
) -> list[schemas.OrderRead]:
    """Expand a list of orders into read models, resolving each line's item,
    chosen toppings and chosen variants.

    The referenced items/toppings/variants are batch-loaded across all lines of
    all orders (three queries total), so this stays free of N+1 regardless of
    how many orders or lines are on the page.
    """
    item_ids: set[int] = set()
    topping_ids: set[int] = set()
    variant_ids: set[int] = set()
    for order in orders:
        for line in order.order_items:
            item_ids.add(line.item_id)
            topping_ids.update(line.topping_ids or [])
            variant_ids.update(line.variant_ids or [])

    def _by_id(model, ids: set[int]) -> dict:
        if not ids:
            return {}
        rows = db.execute(select(model).where(model.id.in_(ids))).scalars().all()
        return {row.id: row for row in rows}

    items = _by_id(models.Item, item_ids)
    toppings = _by_id(models.Topping, topping_ids)
    variants = _by_id(models.Variant, variant_ids)

    result: list[schemas.OrderRead] = []
    for order in orders:
        lines = []
        for line in order.order_items:
            item = items.get(line.item_id)
            if item is None:
                continue  # item row vanished; skip rather than 500 the page
            lines.append(
                schemas.OrderLineRead(
                    id=line.id,
                    item_id=line.item_id,
                    quantity=line.quantity,
                    price=line.price,
                    item=schemas.ItemFull.model_validate(item),
                    toppings=[
                        schemas.ToppingRead.model_validate(toppings[t])
                        for t in (line.topping_ids or [])
                        if t in toppings
                    ],
                    variants=[
                        schemas.VariantRead.model_validate(variants[v])
                        for v in (line.variant_ids or [])
                        if v in variants
                    ],
                )
            )
        result.append(
            schemas.OrderRead(
                id=order.id,
                status=order.status.value,
                total_amount=order.total_amount,
                payment_status=order.payment_status,
                extra_notes=order.extra_notes,
                created_at=order.created_at,
                updated_at=order.updated_at,
                order_items=lines,
            )
        )
    return result


def list_orders(
    db: Session,
    *,
    user_id: int,
    status: models.OrderStatus,
    page: int = 1,
    page_size: int = 10,
) -> dict:
    """A page of the user's orders with the given status, newest first.

    Pagination is applied on the orders table (one `cart` at most, so the cart
    status simply returns a single-element page). Line items are expanded by
    `_serialize_orders`; the (user_id, status) index backs the filter + sort.
    """
    base = select(models.Order).where(
        models.Order.user_id == user_id,
        models.Order.status == status,
    )
    total = db.execute(
        select(func.count()).select_from(base.order_by(None).subquery())
    ).scalar_one()

    offset = (page - 1) * page_size
    orders = list(
        db.execute(
            base.order_by(models.Order.created_at.desc(), models.Order.id.desc())
            .limit(page_size)
            .offset(offset)
        )
        .scalars()
        .all()
    )

    return {
        "items": _serialize_orders(db, orders),
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": offset + len(orders) < total,
    }


def place_order(db: Session, user_id: int) -> schemas.OrderRead | None:
    """Check out the user's cart: stamp its total and flip it to `pending`.

    Returns the placed order, or None if there's no cart or it's empty (so the
    caller can surface a 400 rather than creating an empty order).
    """
    cart = db.execute(
        select(models.Order).where(
            models.Order.user_id == user_id,
            models.Order.status == models.OrderStatus.cart,
        )
    ).scalars().first()
    if cart is None or not cart.order_items:
        return None

    cart.total_amount = sum(
        (line.price * line.quantity for line in cart.order_items), Decimal("0")
    )
    cart.status = models.OrderStatus.pending
    db.commit()
    db.refresh(cart)
    return _serialize_orders(db, [cart])[0]


def list_all_orders(
    db: Session,
    *,
    status: models.OrderStatus,
    page: int = 1,
    page_size: int = 10,
) -> dict:
    """A page of *every* user's orders with the given status, newest first.

    Backs the manager dashboard. Pagination and the newest-first sort are both
    pushed to the database (LIMIT/OFFSET + ORDER BY created_at DESC), and the
    (status, created_at) index covers the filter + sort.
    """
    base = select(models.Order).where(models.Order.status == status)
    total = db.execute(
        select(func.count()).select_from(base.order_by(None).subquery())
    ).scalar_one()

    offset = (page - 1) * page_size
    orders = list(
        db.execute(
            base.order_by(models.Order.created_at.desc(), models.Order.id.desc())
            .limit(page_size)
            .offset(offset)
        )
        .scalars()
        .all()
    )

    return {
        "items": _serialize_orders(db, orders),
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": offset + len(orders) < total,
    }


def manager_update_order(
    db: Session,
    order: models.Order,
    *,
    status: models.OrderStatus | None = None,
    payment_status: bool | None = None,
) -> schemas.OrderRead:
    """Apply a manager's changes to an order and return the serialized result.

    Transition validity is enforced by the caller; this just persists whatever
    fields were provided.
    """
    if status is not None:
        order.status = status
    if payment_status is not None:
        order.payment_status = payment_status
    db.commit()
    db.refresh(order)
    return _serialize_orders(db, [order])[0]
