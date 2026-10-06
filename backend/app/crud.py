import json
import secrets
from datetime import datetime, timedelta

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


def get_full_menu(db: Session) -> list[models.Category]:
    """All categories ordered for display, with subcategories -> items ->
    toppings/variants eagerly loaded via the relationships' selectin loading."""
    stmt = select(models.Category).order_by(
        models.Category.display_order, models.Category.name
    )
    return list(db.execute(stmt).scalars().all())


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
