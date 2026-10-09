from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..auth import require_jwt, require_manager
from ..database import get_db

router = APIRouter(prefix="/api/orders", tags=["orders"])

# The kitchen workflow a manager may drive an order through. Each status maps to
# the set it's allowed to move to; anything else is rejected with a 400.
_ALLOWED_TRANSITIONS: dict[models.OrderStatus, set[models.OrderStatus]] = {
    models.OrderStatus.pending: {
        models.OrderStatus.preparing,
        models.OrderStatus.cancelled,
    },
    models.OrderStatus.preparing: {models.OrderStatus.ready},
    models.OrderStatus.ready: {models.OrderStatus.completed},
}


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


@router.get("/all", response_model=schemas.PaginatedOrders)
def list_all_orders(
    status: models.OrderStatus = Query(..., description="Status to filter by."),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_manager),
):
    """Manager dashboard: every user's orders with the given status, newest
    first, paginated on the orders table. Each order's line items are fully
    expanded. Requires a manager JWT."""
    return crud.list_all_orders(db, status=status, page=page, page_size=page_size)


@router.patch("/{order_id}", response_model=schemas.OrderRead)
def manager_update_order(
    order_id: int,
    payload: schemas.OrderManagerUpdate,
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_manager),
):
    """Manager: advance an order's status along the kitchen workflow
    (pending → preparing/cancelled → ready → completed) and/or mark it paid.
    Rejects invalid status transitions with 400. Requires a manager JWT."""
    order = db.get(models.Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    if payload.status is not None and payload.status != order.status:
        allowed = _ALLOWED_TRANSITIONS.get(order.status, set())
        if payload.status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot move order from {order.status.value} to {payload.status.value}",
            )

    return crud.manager_update_order(
        db, order, status=payload.status, payment_status=payload.payment_status
    )


@router.patch("/items/{order_item_id}", response_model=schemas.OrderItemRead)
def review_order_item(
    order_item_id: int,
    payload: schemas.OrderItemReviewUpdate,
    db: Session = Depends(get_db),
    claims: dict[str, Any] = Depends(require_jwt),
):
    """Customer: leave (or update) a review on one line of a completed order —
    a 0–5 star rating, a free-text note, and/or uploaded photo paths, all
    optional. Fails with 404 if the line isn't the caller's, or 400 if the order
    isn't completed yet. Requires a valid JWT bearer token."""
    line = crud.update_order_item_review(
        db,
        user_id=int(claims["sub"]),
        order_item_id=order_item_id,
        rating=payload.rating,
        review=payload.review,
        review_photo_paths=payload.review_photo_paths,
    )
    if line is None:
        raise HTTPException(
            status_code=400,
            detail="Order line not found, not yours, or its order isn't completed",
        )
    return line


@router.get(
    "/items/{item_id}/reviews", response_model=schemas.ItemReviewsResponse
)
def view_rating_of_an_item_from_order_items(
    item_id: int,
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_manager),
):
    """Manager: all reviews left for a menu item, gathered from every order line
    that references it (item → order_items via item_id), plus the average star
    rating. Backs the "view ratings" popup on the manager's full menu. Requires
    a manager JWT."""
    return crud.view_rating_of_an_item_from_order_items(db, item_id)


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
