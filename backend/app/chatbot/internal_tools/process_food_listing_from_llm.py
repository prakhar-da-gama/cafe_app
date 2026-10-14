"""Turn the LLM's noisy food listing into a resolved, get-full-menu-shaped tree.

The chatbot asks the model to structure a customer's order as a nested
``categories -> subcategories -> items`` tree (each item is just a free-text
``name`` + ``quantity``). That raw reply can't be trusted: the names are
model-produced and may be misspelled, cased oddly, or made up.

:func:`food_listing_from_llm` takes that payload and, using the fuzzy name
resolvers in :mod:`app.chatbot.validators`, pins every name down to a concrete
menu row:

1. The payload is validated against
   :class:`app.chatbot.pydantic_validators.food_listing.FoodListingFromLLM`.
2. Each category name is resolved to a real ``Category``; each subcategory is
   resolved *within* that category; each item is resolved *within* that
   subcategory. Scoping each step to its resolved parent means a name shared
   across branches can't resolve to the wrong one, and it yields the item's id.
3. Anything that doesn't resolve closely enough (``score_cutoff``) is dropped —
   we only ever return items we are confident about, i.e. items we have a real
   ``item_id`` for. Subcategories and categories left with no resolved items are
   pruned, so the result never contains an empty branch.

The returned shape mirrors the ``get-full-menu`` endpoint (categories ->
subcategories -> items), trimmed to the fields the chatbot needs plus the
``quantity`` the customer asked for.

Sample input (the nested JSON handed in by the LLM)::

    {
        "categories": [
            {
                "name": "Bevrages",                      # note: misspelled
                "subcategories": [
                    {
                        "name": "Hot Drinks",
                        "items": [
                            {"name": "cappucino", "quantity": 2},
                            {"name": "Masala Chai", "quantity": 1},
                            {"name": "Unicorn Frappe", "quantity": 1}  # not on menu
                        ]
                    }
                ]
            },
            {
                "name": "Desserts",
                "subcategories": [
                    {
                        "name": "Cakes",
                        "items": [
                            {"name": "Choco Lava", "quantity": 1}
                        ]
                    }
                ]
            }
        ]
    }

Sample output (resolved; the misspellings are matched to real rows, the
off-menu "Unicorn Frappe" is dropped, and any branch that ends up empty is
pruned). Every node has the same fields get-full-menu serves — categories and
subcategories carry ``description`` / ``photos`` / ``display_order`` /
``is_active``, and each item carries its full ``ItemFull`` shape including
``toppings`` and ``variants`` — plus a ``quantity`` on each item::

    {
        "categories": [
            {
                "id": 1,
                "name": "Beverages",
                "description": null,
                "photos": [],
                "display_order": 1,
                "is_active": true,
                "subcategories": [
                    {
                        "id": 1,
                        "name": "Hot Coffee",
                        "description": null,
                        "photos": [],
                        "display_order": 1,
                        "is_active": true,
                        "items": [
                            {
                                "id": 2,
                                "name": "Cappuccino",
                                "price": 180.0,
                                "photos": [],
                                "tag_ids": [],
                                "is_veg": true,
                                "is_available": true,
                                "display_order": 2,
                                "is_active": true,
                                "is_recommended": false,
                                "toppings": [
                                    {"id": 1, "name": "Extra Shot", "price": 40.0,
                                     "photos": [], "is_available": true,
                                     "is_active": true}
                                ],
                                "variants": [
                                    {"id": 1, "name": "Large",
                                     "description": null, "price_delta": 50.0}
                                ],
                                "quantity": 2
                            }
                        ]
                    }
                ]
            }
        ]
    }
"""
from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from ... import schemas
from ..pydantic_validators.food_listing import FoodListingFromLLM
from ..validators import (
    ResolutionError,
    resolve_category,
    resolve_item,
    resolve_subcategory,
)

# How close a name has to score for us to trust the match. The resolvers use
# rapidfuzz WRatio (0-100), so this is on the same scale. Anything below is
# treated as "not confident" and dropped rather than guessed at.
DEFAULT_SCORE_CUTOFF = 80.0


def food_listing_from_llm(
    db: Session,
    payload: dict[str, Any] | FoodListingFromLLM,
    score_cutoff: float = DEFAULT_SCORE_CUTOFF,
) -> dict[str, Any]:
    """Resolve an LLM food listing to a get-full-menu-shaped tree of real rows.

    ``payload`` is the nested listing described in this module's docstring
    (either a raw dict or an already-validated :class:`FoodListingFromLLM`); a
    raw dict is validated first and raises ``pydantic.ValidationError`` if it
    doesn't match the expected shape.

    Each name is fuzzy-resolved against the menu, scoped to its resolved parent,
    to obtain the concrete ids. Items that don't resolve at/above
    ``score_cutoff`` are dropped, as are subcategories and categories left with
    no resolved items.

    Returns ``{"categories": [...]}`` with the exact same per-node shape the
    ``get-full-menu`` endpoint serves: each node is serialized through the same
    schemas (``CategoryFull`` -> ``SubcategoryFull`` -> ``ItemFull``, so every
    item carries its ``photos``, ``tag_ids``, ``is_veg``, ``is_available``,
    ``toppings``, ``variants`` etc.), via the same ``jsonable_encoder`` so the
    wire types match too. The only differences from the endpoint are that the
    tree is pruned to the resolved items and each item gains the ``quantity``
    the customer asked for.
    """
    listing = (
        payload
        if isinstance(payload, FoodListingFromLLM)
        else FoodListingFromLLM.model_validate(payload)
    )

    categories: list[dict[str, Any]] = []
    for llm_category in listing.categories:
        try:
            category = resolve_category(db, llm_category.name, score_cutoff)
        except ResolutionError:
            continue

        subcategories: list[dict[str, Any]] = []
        for llm_subcategory in llm_category.subcategories:
            try:
                subcategory = resolve_subcategory(
                    db,
                    llm_subcategory.name,
                    category_id=category.id,
                    score_cutoff=score_cutoff,
                )
            except ResolutionError:
                continue

            items: list[dict[str, Any]] = []
            for llm_item in llm_subcategory.items:
                try:
                    item = resolve_item(
                        db,
                        llm_item.name,
                        subcategory_id=subcategory.id,
                        score_cutoff=score_cutoff,
                    )
                except ResolutionError:
                    # Not confident about this item's id -> leave it out.
                    continue
                # Serialize exactly like get-full-menu (all fields + toppings /
                # variants), then tack on the requested quantity.
                item_dump = jsonable_encoder(schemas.ItemFull.model_validate(item))
                item_dump["quantity"] = llm_item.quantity
                items.append(item_dump)

            # Prune subcategories that ended up with no resolved items.
            if items:
                sub_schema = schemas.SubcategoryFull.model_validate(subcategory)
                # Drop the full item tree before encoding; we swap in only the
                # resolved items below.
                sub_schema.items = []
                sub_dump = jsonable_encoder(sub_schema)
                sub_dump["items"] = items
                subcategories.append(sub_dump)

        # Prune categories that ended up with no resolved subcategories.
        if subcategories:
            cat_schema = schemas.CategoryFull.model_validate(category)
            cat_schema.subcategories = []
            cat_dump = jsonable_encoder(cat_schema)
            cat_dump["subcategories"] = subcategories
            categories.append(cat_dump)

    return {"categories": categories}
