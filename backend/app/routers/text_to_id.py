"""Fuzzy name -> row resolvers.

Each endpoint takes a free-text string (typically produced by the chatbot) and
resolves it to the single best-matching row of one menu table by fuzzy-matching
against that table's `name` field, returning the full object for that row.

Matching uses rapidfuzz. The whole table is small (menu data), so we load every
row and score it in memory rather than pushing the fuzzy match into SQL.
"""
from typing import Type, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query
from rapidfuzz import fuzz, process, utils
from sqlalchemy.orm import Session

from .. import schemas
from ..database import Base, get_db
from ..models import Category, Item, Subcategory, Topping, Variant

router = APIRouter(prefix="/api/text-to-id", tags=["text-to-id"])

ModelT = TypeVar("ModelT", bound=Base)


def _resolve(
    db: Session,
    model: Type[ModelT],
    query: str,
    score_cutoff: float,
    label: str,
) -> ModelT:
    """Return the row of `model` whose `name` best matches `query`.

    Raises 404 if the table is empty or nothing scores at/above `score_cutoff`.
    """
    rows = db.query(model).all()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No {label} exist to match against")

    by_id = {row.id: row for row in rows}
    choices = {row_id: row.name for row_id, row in by_id.items()}

    match = process.extractOne(
        query,
        choices,
        scorer=fuzz.WRatio,
        # Normalise case / punctuation / whitespace on both sides before scoring
        # so LLM noise like "EXTRA CHEESE" still matches "Extra Cheese".
        processor=utils.default_process,
        score_cutoff=score_cutoff,
    )
    if match is None:
        raise HTTPException(
            status_code=404,
            detail=f"No {label} name matched {query!r} closely enough",
        )

    # process.extractOne over a dict returns (matched_name, score, matched_key).
    matched_id = match[2]
    return by_id[matched_id]


@router.get("/categories", response_model=schemas.CategoryFull)
def resolve_category(
    q: str = Query(..., min_length=1, description="Text to match against category names"),
    score_cutoff: float = Query(default=0.0, ge=0, le=100),
    db: Session = Depends(get_db),
):
    """Resolve free text to the best-matching category and return the full row."""
    return _resolve(db, Category, q, score_cutoff, "categories")


@router.get("/subcategories", response_model=schemas.SubcategoryFull)
def resolve_subcategory(
    q: str = Query(..., min_length=1, description="Text to match against subcategory names"),
    score_cutoff: float = Query(default=0.0, ge=0, le=100),
    db: Session = Depends(get_db),
):
    """Resolve free text to the best-matching subcategory and return the full row."""
    return _resolve(db, Subcategory, q, score_cutoff, "subcategories")


@router.get("/items", response_model=schemas.ItemDetail)
def resolve_item(
    q: str = Query(..., min_length=1, description="Text to match against item names"),
    score_cutoff: float = Query(default=0.0, ge=0, le=100),
    db: Session = Depends(get_db),
):
    """Resolve free text to the best-matching item and return the full row."""
    return _resolve(db, Item, q, score_cutoff, "items")


@router.get("/toppings", response_model=schemas.ToppingRead)
def resolve_topping(
    q: str = Query(..., min_length=1, description="Text to match against topping names"),
    score_cutoff: float = Query(default=0.0, ge=0, le=100),
    db: Session = Depends(get_db),
):
    """Resolve free text to the best-matching topping and return the full row."""
    return _resolve(db, Topping, q, score_cutoff, "toppings")


@router.get("/variants", response_model=schemas.VariantRead)
def resolve_variant(
    q: str = Query(..., min_length=1, description="Text to match against variant names"),
    score_cutoff: float = Query(default=0.0, ge=0, le=100),
    db: Session = Depends(get_db),
):
    """Resolve free text to the best-matching variant and return the full row."""
    return _resolve(db, Variant, q, score_cutoff, "variants")
