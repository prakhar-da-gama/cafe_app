from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..auth import require_jwt, require_manager
from ..database import get_db

router = APIRouter(prefix="/api/service-reviews", tags=["service-reviews"])


@router.post("", response_model=schemas.ServiceReviewRead, status_code=status.HTTP_201_CREATED)
def create_service_review(
    payload: schemas.ServiceReviewCreate,
    db: Session = Depends(get_db),
    claims: dict[str, Any] = Depends(require_jwt),
):
    """Customer: leave the overall service review for one of your completed
    orders — a 0–5 star rating plus an optional note and photos. 400 if the
    order isn't yours or isn't completed; 409 if it's already been reviewed
    (edit it with PATCH instead). Requires a valid JWT bearer token."""
    user_id = int(claims["sub"])

    if crud.get_service_review_for_order(db, payload.order_id) is not None:
        raise HTTPException(
            status_code=409, detail="This order has already been reviewed"
        )

    review = crud.create_service_review(db, user_id=user_id, data=payload)
    if review is None:
        raise HTTPException(
            status_code=400,
            detail="Order not found, not yours, or not completed yet",
        )
    return review


@router.patch("/{review_id}", response_model=schemas.ServiceReviewRead)
def update_service_review(
    review_id: int,
    payload: schemas.ServiceReviewUpdate,
    db: Session = Depends(get_db),
    claims: dict[str, Any] = Depends(require_jwt),
):
    """Customer: edit your service review (any subset of rating / note /
    photos). 404 if the review isn't yours. Requires a valid JWT."""
    review = crud.update_service_review(
        db,
        user_id=int(claims["sub"]),
        review_id=review_id,
        rating=payload.rating,
        review=payload.review,
        review_images=payload.review_images,
    )
    if review is None:
        raise HTTPException(status_code=404, detail="Service review not found")
    return review


@router.get("/for-order/{order_id}", response_model=schemas.ServiceReviewRead | None)
def get_service_review_for_order(
    order_id: int,
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_jwt),
):
    """The service review already left for an order (or null if none yet), so
    the customer UI can show/prefill it. Requires a valid JWT."""
    return crud.get_service_review_for_order(db, order_id)


@router.get("/summary", response_model=schemas.ServiceRatingSummary)
def service_rating_summary(
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_manager),
):
    """Manager: the headline service rating (average + count). Requires a
    manager JWT."""
    return crud.get_service_rating_summary(db)


@router.get("", response_model=schemas.PaginatedServiceReviews)
def list_service_reviews(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_manager),
):
    """Manager: a page of service reviews, newest first, plus the overall
    average rating. Requires a manager JWT."""
    return crud.list_service_reviews(db, page=page, page_size=page_size)
