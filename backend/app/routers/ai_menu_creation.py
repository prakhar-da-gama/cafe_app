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
from ..auth import require_admin, require_ai_credits
from ..database import get_db
from ..services import dish_sessions, gemini, menu_backups

router = APIRouter(prefix="/api/ai/menu", tags=["ai-menu"])

# Credit price per call.
FORMAT_COST = 5
GRAMMAR_COST = 1
# The dish-creation chat: starting it (which spends the first LLM turn) costs 5
# credits; every follow-up message costs 1.
DISH_START_COST = 5
DISH_MESSAGE_COST = 1
# Reading a whole menu off photos is one heavyweight multimodal call.
MENU_IMPORT_COST = 20


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
    _claims: dict[str, Any] = Depends(require_admin),
):
    """Polish a menu category with the AI assistant: returns five suggested
    names and five suggested descriptions, using a cached understanding of the
    whole menu as context. Costs 5 AI credits."""
    menu_description = _ensure_menu_description(db, tenant)
    suggestion = gemini.improve_category(
        payload.name, payload.description, menu_description
    )

    tenant.credits_used += FORMAT_COST
    db.commit()

    return schemas.FormatCategoryResponse(
        original_name=payload.name,
        original_description=payload.description,
        recommended_names=suggestion.recommended_names,
        recommended_descriptions=suggestion.recommended_descriptions,
    )


@router.post("/format-subcategory", response_model=schemas.FormatSubcategoryResponse)
def format_subcategory(
    payload: schemas.FormatSubcategoryRequest,
    db: Session = Depends(get_db),
    tenant: models.TenantRightsAndInformation = Depends(require_ai_credits(FORMAT_COST)),
    _claims: dict[str, Any] = Depends(require_admin),
):
    """Polish a menu subcategory with the AI assistant. Returns five suggested
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
        recommended_names=suggestion.recommended_names,
        recommended_descriptions=suggestion.recommended_descriptions,
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
    _claims: dict[str, Any] = Depends(require_admin),
):
    """Generic grammar/spelling/capitalisation fixer for arbitrary text. Costs 1
    AI credit."""
    fixed = gemini.fix_grammar(payload.text)

    tenant.credits_used += GRAMMAR_COST
    db.commit()

    return schemas.GrammarFixResponse(original_text=payload.text, fixed_text=fixed)


# ---- Dish-creation chat assistant ----


def _dish_system_prompt(
    db: Session, tenant: models.TenantRightsAndInformation
) -> str:
    """Build the assistant's system instruction from the cached menu
    understanding plus the live catalogue of categories, subcategories, tags,
    toppings and variants it is allowed to choose from."""
    menu_description = _ensure_menu_description(db, tenant)

    categories = list(
        db.execute(
            select(models.Category).order_by(models.Category.display_order)
        ).scalars().all()
    )
    cat_by_id = {c.id: c.name for c in categories}
    subcategories = list(
        db.execute(
            select(models.Subcategory).order_by(models.Subcategory.display_order)
        ).scalars().all()
    )
    tags = list(
        db.execute(select(models.Tag).order_by(models.Tag.tag)).scalars().all()
    )
    toppings = list(db.execute(select(models.Topping)).scalars().all())
    variants = list(db.execute(select(models.Variant)).scalars().all())

    cat_names = ", ".join(c.name for c in categories) or "(none yet)"
    sub_lines = (
        "; ".join(
            f"{s.name} (under {cat_by_id.get(s.category_id, '?')})"
            for s in subcategories
        )
        or "(none yet)"
    )
    tag_names = ", ".join(t.tag for t in tags) or "(none)"
    topping_lines = (
        "; ".join(f"{t.name} (₹{t.price})" for t in toppings) or "(none yet)"
    )
    variant_lines = (
        "; ".join(f"{v.name} ({v.price_delta:+})" for v in variants)
        or "(none yet)"
    )

    return (
        "You are a menu assistant helping a cafe manager create exactly ONE new "
        "dish, through a short chat. Each turn you must reply with the "
        "structured JSON: a short 'message' to show the manager, a 'ready' flag, "
        "and the 'form' you have filled in so far.\n\n"
        f"Understanding of this restaurant:\n{menu_description}\n\n"
        f"EXISTING CATEGORIES — choose category_name as EXACTLY one of these: "
        f"{cat_names}\n"
        f"EXISTING SUBCATEGORIES — choose subcategory_name as EXACTLY one of "
        f"these, and it must belong to the chosen category: {sub_lines}\n"
        f"ALLOWED FLAVOUR TAGS — 'tags' must be a subset of these, copied "
        f"exactly: {tag_names}\n"
        f"EXISTING TOPPINGS (reference; you may reuse a name or propose a new "
        f"one): {topping_lines}\n"
        f"EXISTING VARIANTS (reference): {variant_lines}\n\n"
        "Rules:\n"
        "- category_name and subcategory_name MUST be copied verbatim from the "
        "lists above — never invent new ones; the subcategory must sit under the "
        "chosen category.\n"
        "- tags must be copied verbatim from the allowed tags.\n"
        "- Fill name, price (a plain number in rupees), is_veg and description. "
        "Variants (e.g. Small/Large with a signed price_delta) and toppings "
        "(each with a price) are optional — propose them only when they fit.\n"
        "- In 'message', briefly say what you put in the form and invite the "
        "manager to minimise the chat and review it. Keep it short and friendly; "
        "never put JSON or field names in 'message'.\n"
        "- If you lack enough to proceed, ask ONE concise follow-up question in "
        "'message' and set ready=false.\n"
        "- Set ready=true only once the form has at least a name, a price, a "
        "valid category and a valid subcategory."
    )


def _resolve_dish_form(
    db: Session, proposal: gemini.DishFormProposal
) -> schemas.DishAssistantForm:
    """Map the assistant's by-name proposal onto real rows: category,
    subcategory and tags are matched case-insensitively against existing values
    and resolved to ids (left null/empty when they don't match). Variants and
    toppings are passed straight through — they are only created on final
    submit."""
    categories = list(db.execute(select(models.Category)).scalars().all())
    cat_by_name = {c.name.casefold(): c for c in categories}
    category = cat_by_name.get((proposal.category_name or "").strip().casefold())

    subcategories = list(db.execute(select(models.Subcategory)).scalars().all())
    subcategory = None
    wanted_sub = (proposal.subcategory_name or "").strip().casefold()
    if wanted_sub:
        matches = [s for s in subcategories if s.name.casefold() == wanted_sub]
        if category is not None:
            in_cat = [s for s in matches if s.category_id == category.id]
            subcategory = in_cat[0] if in_cat else (matches[0] if matches else None)
        else:
            subcategory = matches[0] if matches else None
    # If only the subcategory matched, backfill its category.
    if subcategory is not None and category is None:
        category = db.get(models.Category, subcategory.category_id)

    tags = list(db.execute(select(models.Tag)).scalars().all())
    tag_by_name = {t.tag.casefold(): t for t in tags}
    tag_ids: list[int] = []
    tag_names: list[str] = []
    for raw in proposal.tags:
        tag = tag_by_name.get(raw.strip().casefold())
        if tag is not None and tag.id not in tag_ids:
            tag_ids.append(tag.id)
            tag_names.append(tag.tag)

    return schemas.DishAssistantForm(
        category_id=category.id if category else None,
        category_name=category.name if category else None,
        subcategory_id=subcategory.id if subcategory else None,
        subcategory_name=subcategory.name if subcategory else None,
        name=proposal.name,
        price=proposal.price,
        is_veg=proposal.is_veg,
        description=proposal.description,
        tag_ids=tag_ids,
        tags=tag_names,
        variants=[
            schemas.DishAssistantVariant(name=v.name, price_delta=v.price_delta)
            for v in proposal.variants
            if v.name.strip()
        ],
        toppings=[
            schemas.DishAssistantTopping(name=t.name, price=t.price)
            for t in proposal.toppings
            if t.name.strip()
        ],
    )


def _reply_out(
    db: Session, reply: gemini.DishAssistantReply
) -> schemas.DishAssistantReply:
    return schemas.DishAssistantReply(
        message=reply.message,
        ready=reply.ready,
        form=_resolve_dish_form(db, reply.form),
    )


@router.post(
    "/dish-assistant/start", response_model=schemas.DishAssistantStartResponse
)
def start_dish_assistant(
    payload: schemas.DishAssistantStartRequest,
    db: Session = Depends(get_db),
    tenant: models.TenantRightsAndInformation = Depends(
        require_ai_credits(DISH_START_COST)
    ),
    _claims: dict[str, Any] = Depends(require_admin),
):
    """Open a dish-creation chat: feeds the model the menu understanding and the
    live catalogue, sends the manager's first message, and returns a session id
    plus the assistant's reply (chat text + the form filled so far). Costs 5 AI
    credits."""
    system_prompt = _dish_system_prompt(db, tenant)
    chat = gemini.start_dish_chat(system_prompt)
    reply = gemini.send_dish_message(chat, payload.message)
    session_id = dish_sessions.create_session(chat)

    tenant.credits_used += DISH_START_COST
    db.commit()

    return schemas.DishAssistantStartResponse(
        session_id=session_id, reply=_reply_out(db, reply)
    )


@router.post(
    "/dish-assistant/message", response_model=schemas.DishAssistantMessageResponse
)
def message_dish_assistant(
    payload: schemas.DishAssistantMessageRequest,
    db: Session = Depends(get_db),
    tenant: models.TenantRightsAndInformation = Depends(
        require_ai_credits(DISH_MESSAGE_COST)
    ),
    _claims: dict[str, Any] = Depends(require_admin),
):
    """Continue an existing dish-creation chat (persistent context). Costs 1 AI
    credit. Returns 410 if the session has expired or been closed."""
    session = dish_sessions.get_session(payload.session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This AI session has expired — start a new one.",
        )
    reply = gemini.send_dish_message(session.chat, payload.message)

    tenant.credits_used += DISH_MESSAGE_COST
    db.commit()

    return schemas.DishAssistantMessageResponse(reply=_reply_out(db, reply))


@router.post("/dish-assistant/end", status_code=status.HTTP_204_NO_CONTENT)
def end_dish_assistant(
    payload: schemas.DishAssistantEndRequest,
    _claims: dict[str, Any] = Depends(require_admin),
):
    """End a dish-creation chat and free its server-side context. Idempotent and
    free; called once the dish has been created or the manager abandons it."""
    dish_sessions.end_session(payload.session_id)


# ---- Create whole menu from photos / backup / restore ----


def _structure_counts(
    tags: list[str], categories: list[dict], backup_path: str | None
) -> schemas.MenuImportResponse:
    """Headline counts of what a (tags, categories) structure will create."""
    subcats = [sub for cat in categories for sub in cat.get("subcategories", [])]
    items = [item for sub in subcats for item in sub.get("items", [])]
    return schemas.MenuImportResponse(
        categories=len(categories),
        subcategories=len(subcats),
        items=len(items),
        tags=len(tags),
        toppings=sum(len(i.get("toppings", [])) for i in items),
        variants=sum(len(i.get("variants", [])) for i in items),
        backup_path=backup_path,
    )


@router.post("/create-menu-from-photo", response_model=schemas.MenuImportResponse)
def create_menu_from_photo(
    payload: schemas.MenuImportRequest,
    db: Session = Depends(get_db),
    tenant: models.TenantRightsAndInformation = Depends(
        require_ai_credits(MENU_IMPORT_COST)
    ),
    _claims: dict[str, Any] = Depends(require_admin),
):
    """Build the entire menu from photos of a physical menu card.

    Reads the uploaded photos plus optional instructions, asks Gemini for the
    full structured menu (categories -> subcategories -> items with variants,
    toppings and a <=20 tag vocabulary including "budget friendly" and "most
    ordered"), then populates the menu tables from it. Costs 20 AI credits.

    If a menu already exists this first backs it up to app/menu_backups (keeping
    only that one backup) and then wipes every menu table before rebuilding. The
    replace is refused with 409 unless ``confirm_overwrite`` is set, and with 400
    if existing orders/carts still reference menu items.
    """
    images = gemini.load_images(payload.photo_paths)
    if not images:
        raise HTTPException(
            status_code=400, detail="None of the given menu photos could be read"
        )

    menu_exists = crud.menu_has_content(db)
    if menu_exists:
        if crud.orders_reference_menu(db):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Cannot replace the menu while existing orders or carts "
                    "reference menu items."
                ),
            )
        if not payload.confirm_overwrite:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "A menu already exists. Confirm to back it up and replace it "
                    "with the one read from these photos."
                ),
            )

    photo_menu = gemini.extract_menu_from_photos(images, payload.instructions)
    tags, categories = gemini.photo_menu_to_structure(photo_menu)

    backup_path: str | None = None
    if menu_exists:
        backup_path = menu_backups.save_backup(
            crud.snapshot_full_menu(db), evict_photos=True
        )
        crud.clear_menu(db)

    crud.rebuild_menu_from_structure(db, tags, categories)

    tenant.credits_used += MENU_IMPORT_COST
    db.commit()

    return _structure_counts(tags, categories, backup_path)


@router.get("/get-menu-backups", response_model=list[schemas.MenuBackupInfo])
def get_menu_backups(
    _claims: dict[str, Any] = Depends(require_admin),
):
    """List the stored menu backups (normally at most one), each with its
    timestamp and headline counts, for the restore picker. Free."""
    return [schemas.MenuBackupInfo(**info) for info in menu_backups.list_backups_info()]


@router.post("/restore-menu-from-backup", response_model=schemas.MenuImportResponse)
def restore_menu_from_backup(
    payload: schemas.RestoreBackupRequest,
    db: Session = Depends(get_db),
    _claims: dict[str, Any] = Depends(require_admin),
):
    """Restore a previously backed-up menu. Free (no LLM call).

    Backs up the current live menu, wipes the menu tables, then rebuilds from the
    chosen backup. The backup that was applied is replaced by the snapshot of the
    menu it displaced, so at most one backup is ever kept and the manager can
    flip back. Refused with 400 if existing orders/carts reference menu items.
    """
    try:
        snapshot = menu_backups.read_backup(payload.backup_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Backup not found")

    if crud.menu_has_content(db) and crud.orders_reference_menu(db):
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot replace the menu while existing orders or carts "
                "reference menu items."
            ),
        )

    current = crud.snapshot_full_menu(db)
    crud.clear_menu(db)

    tags = snapshot.get("tags", [])
    categories = snapshot.get("categories", [])
    crud.rebuild_menu_from_structure(db, tags, categories)

    # The restored menu's images are live again, so keep them; the displaced
    # menu becomes the new (only) backup.
    new_backup = menu_backups.save_backup(current, evict_photos=False)

    return _structure_counts(tags, categories, new_backup)
