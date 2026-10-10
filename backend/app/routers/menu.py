from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..auth import require_admin, require_jwt, require_manager
from ..database import get_db

router = APIRouter(prefix="/api/menu", tags=["menu"])


@router.patch("/toppings/{topping_id}/availability", response_model=schemas.ToppingRead)
def set_topping_availability(
    topping_id: int,
    payload: schemas.AvailabilityUpdate,
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_manager),
):
    """Manager: mark a topping in or out of stock. Requires a manager JWT."""
    topping = crud.get_topping(db, topping_id)
    if topping is None:
        raise HTTPException(status_code=404, detail="Topping not found")
    return crud.set_topping_availability(db, topping, payload.is_available)


@router.patch("/{item_id}/availability", response_model=schemas.ItemDetail)
def set_item_availability(
    item_id: int,
    payload: schemas.AvailabilityUpdate,
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_manager),
):
    """Manager: mark a menu item in or out of stock. Requires a manager JWT."""
    item = crud.get_item(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Menu item not found")
    return crud.set_item_availability(db, item, payload.is_available)


@router.get("/out-of-stock-items", response_model=list[schemas.ItemFull])
def out_of_stock_items(
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_manager),
):
    """Manager: all active items that are currently out of stock. Requires a
    manager JWT."""
    return crud.list_out_of_stock_items(db)


@router.get(
    "/out-of-stock-toppings",
    response_model=list[schemas.OutOfStockToppingGroup],
)
def out_of_stock_toppings(
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_manager),
):
    """Manager: out-of-stock toppings grouped under each item they belong to.
    Requires a manager JWT."""
    return crud.list_out_of_stock_toppings(db)


@router.post(
    "/categories",
    response_model=schemas.CategoryFull,
    status_code=status.HTTP_201_CREATED,
)
def create_category(
    payload: schemas.CategoryCreate,
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_admin),
):
    """Admin: add a new top-level menu category. Requires an admin JWT."""
    return crud.create_category(db, payload)


@router.post(
    "/subcategories",
    response_model=schemas.SubcategoryFull,
    status_code=status.HTTP_201_CREATED,
)
def create_subcategory(
    payload: schemas.SubcategoryCreate,
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_admin),
):
    """Admin: add a subcategory under an existing category. Requires an
    admin JWT."""
    if crud.get_category(db, payload.category_id) is None:
        raise HTTPException(status_code=404, detail="Category not found")
    return crud.create_subcategory(db, payload)


@router.post(
    "/toppings",
    response_model=schemas.ToppingRead,
    status_code=status.HTTP_201_CREATED,
)
def create_topping_managed(
    payload: schemas.ToppingCreate,
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_admin),
):
    """Admin: add a topping to the shared pool, returning it with its new id so
    the caller can link it to a dish. Requires an admin JWT."""
    return crud.create_topping(db, payload)


@router.post(
    "/variants",
    response_model=schemas.VariantRead,
    status_code=status.HTTP_201_CREATED,
)
def create_variant_managed(
    payload: schemas.VariantCreate,
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_admin),
):
    """Admin: add a variant to the shared pool, returning it with its new id so
    the caller can link it to a dish. Requires an admin JWT."""
    return crud.create_variant(db, payload)


@router.post(
    "/items",
    response_model=schemas.ItemDetail,
    status_code=status.HTTP_201_CREATED,
)
def create_menu_item_managed(
    payload: schemas.ItemCreate,
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_admin),
):
    """Admin: add a new dish under an existing subcategory. Requires an
    admin JWT."""
    if crud.get_subcategory(db, payload.subcategory_id) is None:
        raise HTTPException(status_code=404, detail="Subcategory not found")
    return crud.create_item(db, payload)


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
    tag_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
    claims: dict[str, Any] = Depends(require_jwt),
):
    """Full nested menu: categories -> subcategories -> items -> toppings/variants,
    plus the number of line items currently in the user's cart.
    Requires a valid JWT bearer token.

    Pass tag_ids repeated in the query string (e.g. ?tag_ids=1&tag_ids=4) to get
    the personalised menu: the same nested shape, filtered to items matching any
    of those tags. With no tag_ids, returns the whole menu."""
    return {
        "categories": crud.get_full_menu(db, tag_ids=tag_ids),
        "cart_count": crud.get_cart_item_count(db, int(claims["sub"])),
    }


@router.get("/get-personalised-menu", response_model=schemas.FullMenuResponse)
def get_personalised_menu(
    tag_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
    claims: dict[str, Any] = Depends(require_jwt),
):
    """Personalised menu: the full nested menu with the same shape and the same
    items as get-full-menu (nothing is filtered out), but the items matching the
    given tags are flagged is_recommended and floated to the front of each
    subcategory, followed by the rest. Also returns the user's cart line-item
    count. Requires a valid JWT bearer token.

    Pass tag_ids repeated in the query string (e.g. ?tag_ids=1&tag_ids=4)."""
    return {
        "categories": crud.get_personalised_menu(db, tag_ids=tag_ids),
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
