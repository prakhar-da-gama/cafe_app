from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..auth import require_jwt
from ..database import get_db

router = APIRouter(prefix="/api/menu", tags=["menu"])


@router.get("", response_model=list[schemas.ItemRead])
def list_menu_items(
    subcategory_id: int | None = Query(default=None),
    available_only: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    return crud.list_items(db, subcategory_id=subcategory_id, available_only=available_only)


@router.post("", response_model=schemas.ItemRead, status_code=status.HTTP_201_CREATED)
def create_menu_item(payload: schemas.ItemCreate, db: Session = Depends(get_db)):
    return crud.create_item(db, payload)


@router.get("/get-full-menu", response_model=schemas.FullMenuResponse)
def get_full_menu(
    db: Session = Depends(get_db),
    claims: dict[str, Any] = Depends(require_jwt),
):
    """Full nested menu: categories -> subcategories -> items -> toppings/variants,
    plus the number of line items currently in the user's cart.
    Requires a valid JWT bearer token."""
    return {
        "categories": crud.get_full_menu(db),
        "cart_count": crud.get_cart_item_count(db, int(claims["sub"])),
    }


@router.get("/get-item/{item_id}", response_model=schemas.ItemDetail)
def get_item_detail(
    item_id: int,
    db: Session = Depends(get_db),
    claims: dict[str, Any] = Depends(require_jwt),
):
    """Full detail for a single item, including its description plus nested
    toppings and variants. Call this when a dish is opened; the description is
    intentionally left out of the menu listing to keep that response small.
    Requires a valid JWT bearer token."""
    item = crud.get_item(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Menu item not found")
    return item


@router.get("/by-tags", response_model=schemas.PaginatedItems)
def menu_items_by_tags(
    tag_ids: list[int] = Query(default=[]),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    claims: dict[str, Any] = Depends(require_jwt),
):
    """Paginated menu items matching any of the given tag ids, each with its
    nested toppings and variants. Requires a valid JWT bearer token.

    Pass tag_ids repeated in the query string, e.g. ?tag_ids=1&tag_ids=4.
    With no tag_ids, returns all available items (paginated)."""
    return crud.list_items_by_tags(db, tag_ids, page=page, page_size=page_size)


@router.get("/{item_id}", response_model=schemas.ItemRead)
def get_menu_item(item_id: int, db: Session = Depends(get_db)):
    item = crud.get_item(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Menu item not found")
    return item


@router.put("/{item_id}", response_model=schemas.ItemRead)
def update_menu_item(
    item_id: int, payload: schemas.ItemUpdate, db: Session = Depends(get_db)
):
    item = crud.get_item(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Menu item not found")
    return crud.update_item(db, item, payload)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_menu_item(item_id: int, db: Session = Depends(get_db)):
    item = crud.get_item(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Menu item not found")
    crud.delete_item(db, item)
