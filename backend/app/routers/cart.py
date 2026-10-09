from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..auth import require_jwt
from ..database import get_db

router = APIRouter(prefix="/api/cart", tags=["cart"])


@router.post(
    "/add-item",
    response_model=schemas.OrderItemRead,
    status_code=status.HTTP_201_CREATED,
)
def add_item_to_cart(
    payload: schemas.AddToCartRequest,
    db: Session = Depends(get_db),
    claims: dict[str, Any] = Depends(require_jwt),
):
    """Add a menu item (with optional toppings and a single variant) to the
    authenticated user's cart, creating the cart if it doesn't exist yet.

    Validates that the chosen toppings and variant are actually offered by the
    item before persisting the line, then snapshots its unit price.
    """
    user_id = int(claims["sub"])

    item = crud.get_item(db, payload.item_id)
    if item is None or not item.is_active:
        raise HTTPException(status_code=404, detail="Menu item not found")

    allowed_toppings = {t.id for t in item.toppings}
    invalid_toppings = [tid for tid in payload.topping_ids if tid not in allowed_toppings]
    if invalid_toppings:
        raise HTTPException(
            status_code=400,
            detail=f"Topping(s) {invalid_toppings} are not available for this item",
        )

    if payload.variant_id is not None:
        allowed_variants = {v.id for v in item.variants}
        if payload.variant_id not in allowed_variants:
            raise HTTPException(
                status_code=400,
                detail=f"Variant {payload.variant_id} is not available for this item",
            )

    return crud.add_item_to_cart(
        db,
        user_id=user_id,
        item=item,
        topping_ids=payload.topping_ids,
        variant_id=payload.variant_id,
        quantity=payload.quantity,
        rating=payload.rating,
        review=payload.review,
        review_photo_paths=payload.review_photo_paths,
    )


@router.get("/count", response_model=schemas.CartCountResponse)
def cart_count(
    db: Session = Depends(get_db),
    claims: dict[str, Any] = Depends(require_jwt),
):
    """Number of line items in the authenticated user's cart."""
    return {"cart_count": crud.get_cart_item_count(db, int(claims["sub"]))}
