from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..auth import require_jwt
from ..database import get_db

router = APIRouter(prefix="/api/orders", tags=["orders"])


@router.get("", response_model=schemas.PaginatedOrders)
def list_orders(
    status: models.OrderStatus = Query(
        ..., description="Which order status to list (e.g. cart, pending, preparing)."
    ),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    claims: dict[str, Any] = Depends(require_jwt),
):
    """The authenticated user's orders with the given status, newest first.

    Each order comes back with its line items fully expanded — every line
    carries its item, the chosen toppings and variants, and the price snapshot.
    Pagination is applied on the orders table. The `cart` status returns the
    single open cart (a one-element page); any other status returns that
    status's orders. Requires a valid JWT bearer token."""
    return crud.list_orders(
        db,
        user_id=int(claims["sub"]),
        status=status,
        page=page,
        page_size=page_size,
    )


@router.post("/place", response_model=schemas.OrderRead)
def place_order(
    db: Session = Depends(get_db),
    claims: dict[str, Any] = Depends(require_jwt),
):
    """Check out the authenticated user's cart: stamp its total and move it from
    `cart` to `pending`. Fails with 400 if the cart is missing or empty.
    Requires a valid JWT bearer token."""
    order = crud.place_order(db, int(claims["sub"]))
    if order is None:
        raise HTTPException(status_code=400, detail="Your cart is empty")
    return order
