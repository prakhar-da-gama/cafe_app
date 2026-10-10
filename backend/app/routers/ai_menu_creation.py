"""AI menu-assistant endpoints (Gemini via Vertex AI).

These are paid features gated by require_ai_credits: each call must fit within
the tenant's remaining credit allowance, and spends credits once its work
succeeds. Formatting a category/subcategory costs 5 credits; the generic grammar
fix costs 1.
"""
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..auth import require_ai_credits, require_manager
from ..database import get_db
from ..services import gemini

router = APIRouter(prefix="/api/ai/menu", tags=["ai-menu"])

# Credit price per call.
FORMAT_COST = 5
GRAMMAR_COST = 1


def _ensure_menu_description(
    db: Session, tenant: models.TenantRightsAndInformation
) -> str:
    """Return the cached restaurant understanding, rebuilding it first if the
    menu has changed since it was written or it has never been generated.

    Rebuilding feeds the complete get-full-menu response to Gemini and stores
    the ~300-word result on the tenant, then clears the menu_changed flag.
    """
    if tenant.menu_changed or tenant.current_menu_description is None:
        categories = crud.get_full_menu(db)
        menu_payload = [
            schemas.CategoryFull.model_validate(c).model_dump(mode="json")
            for c in categories
        ]
        tenant.current_menu_description = gemini.generate_menu_description(
            json.dumps(menu_payload, ensure_ascii=False)
        )
        tenant.menu_changed = False
        db.commit()
    return tenant.current_menu_description


@router.post("/format-category", response_model=schemas.FormatCategoryResponse)
def format_category(
    payload: schemas.FormatCategoryRequest,
    db: Session = Depends(get_db),
    tenant: models.TenantRightsAndInformation = Depends(require_ai_credits(FORMAT_COST)),
    _claims: dict[str, Any] = Depends(require_manager),
):
    """Polish a menu category with the AI assistant: returns two suggested names
    and two suggested descriptions, using a cached understanding of the whole
    menu as context. Costs 5 AI credits."""
    menu_description = _ensure_menu_description(db, tenant)
    suggestion = gemini.improve_category(
        payload.name, payload.description, menu_description
    )

    tenant.credits_used += FORMAT_COST
    db.commit()

    return schemas.FormatCategoryResponse(
        original_name=payload.name,
        original_description=payload.description,
        recommended_name_1=suggestion.recommended_name_1,
        recommended_name_2=suggestion.recommended_name_2,
        recommended_description_1=suggestion.recommended_description_1,
        recommended_description_2=suggestion.recommended_description_2,
    )


@router.post("/format-subcategory", response_model=schemas.FormatSubcategoryResponse)
def format_subcategory(
    payload: schemas.FormatSubcategoryRequest,
    db: Session = Depends(get_db),
    tenant: models.TenantRightsAndInformation = Depends(require_ai_credits(FORMAT_COST)),
    _claims: dict[str, Any] = Depends(require_manager),
):
    """Polish a menu subcategory with the AI assistant. Returns two suggested
    names and descriptions, may recommend an existing category that fits better
    than the selected one, and may flag that a brand-new category should be
    created. Costs 5 AI credits."""
    selected = crud.get_category(db, payload.category_id)
    if selected is None:
        raise HTTPException(status_code=404, detail="Category not found")

    categories = list(
        db.execute(
            select(models.Category).order_by(models.Category.display_order)
        ).scalars().all()
    )

    menu_description = _ensure_menu_description(db, tenant)
    suggestion = gemini.improve_subcategory(
        payload.name,
        payload.description,
        selected.name,
        [c.name for c in categories],
        menu_description,
    )

    # Resolve a recommended existing category name back to its id (case-
    # insensitive, ignoring the already-selected one).
    recommended_id: int | None = None
    recommended_name: str | None = None
    if suggestion.recommended_existing_category_name:
        wanted = suggestion.recommended_existing_category_name.strip().casefold()
        for category in categories:
            if category.id != selected.id and category.name.casefold() == wanted:
                recommended_id = category.id
                recommended_name = category.name
                break

    tenant.credits_used += FORMAT_COST
    db.commit()

    return schemas.FormatSubcategoryResponse(
        original_name=payload.name,
        original_description=payload.description,
        recommended_name_1=suggestion.recommended_name_1,
        recommended_name_2=suggestion.recommended_name_2,
        recommended_description_1=suggestion.recommended_description_1,
        recommended_description_2=suggestion.recommended_description_2,
        recommended_existing_category_id=recommended_id,
        recommended_existing_category_name=recommended_name,
        suggested_create_new_category=suggestion.suggested_create_new_category,
        suggested_new_category_name=suggestion.suggested_new_category_name,
        suggested_new_category_description=(
            suggestion.suggested_new_category_description
        ),
    )


@router.post("/fix-grammar", response_model=schemas.GrammarFixResponse)
def generix_fix_grammer(
    payload: schemas.GrammarFixRequest,
    db: Session = Depends(get_db),
    tenant: models.TenantRightsAndInformation = Depends(
        require_ai_credits(GRAMMAR_COST)
    ),
    _claims: dict[str, Any] = Depends(require_manager),
):
    """Generic grammar/spelling/capitalisation fixer for arbitrary text. Costs 1
    AI credit."""
    fixed = gemini.fix_grammar(payload.text)

    tenant.credits_used += GRAMMAR_COST
    db.commit()

    return schemas.GrammarFixResponse(original_text=payload.text, fixed_text=fixed)
