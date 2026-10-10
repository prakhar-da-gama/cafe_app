"""Gemini call behind POST /create-menu-from-photo.

Reads one or more photos of a physical menu (plus optional free-text notes from
the manager) and returns the whole menu as structured JSON: categories ->
subcategories -> items, each item with its price, veg flag, a short description,
any size variants and add-on toppings, and the flavour/attribute tags that apply
to it. A single global tag vocabulary (at most 20 tags) is proposed alongside,
always including the two mandatory tags "budget friendly" and "most ordered".
"""
from pathlib import Path

from pydantic import BaseModel

from ...routers.uploads import UPLOAD_DIR
from .client import generate_structured_multimodal

# The two tags every imported menu must define. "most ordered" is assigned by
# the model using its general knowledge of which dishes typically sell best
# (a fresh import has no real order history to go on yet).
MANDATORY_TAGS = ["budget friendly", "most ordered"]
MAX_TAGS = 20

# Map the extensions the upload endpoint produces to the mime type Gemini needs.
_EXT_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


class PhotoVariant(BaseModel):
    """A size/option variant for one item (e.g. Large = +40)."""

    name: str
    price_delta: float = 0.0


class PhotoTopping(BaseModel):
    """An add-on topping for one item (e.g. Extra shot = 30)."""

    name: str
    price: float = 0.0


class PhotoItem(BaseModel):
    name: str
    description: str | None = None
    price: float = 0.0
    is_veg: bool = True
    # All tags from the global list that apply to this dish.
    tags: list[str] = []
    variants: list[PhotoVariant] = []
    toppings: list[PhotoTopping] = []


class PhotoSubcategory(BaseModel):
    name: str
    description: str | None = None
    items: list[PhotoItem] = []


class PhotoCategory(BaseModel):
    name: str
    description: str | None = None
    subcategories: list[PhotoSubcategory] = []


class PhotoMenu(BaseModel):
    """The whole menu the model reads off the photos."""

    # The global tag vocabulary (<= 20), always including the mandatory tags.
    tags: list[str] = []
    categories: list[PhotoCategory] = []


def load_images(photo_paths: list[str]) -> list[tuple[bytes, str]]:
    """Resolve the public upload paths (/api/uploads/<name>) to (bytes, mime)
    pairs, skipping anything that no longer exists on disk."""
    images: list[tuple[bytes, str]] = []
    for path in photo_paths:
        name = path.rsplit("/", 1)[-1]
        if not name:
            continue
        file_path = UPLOAD_DIR / name
        if not file_path.is_file():
            continue
        mime = _EXT_MIME.get(file_path.suffix.lower(), "image/jpeg")
        images.append((file_path.read_bytes(), mime))
    return images


def _prompt(instructions: str | None) -> str:
    notes = (instructions or "").strip() or "(none)"
    return (
        "You are digitising a cafe/restaurant menu from the attached photo(s).\n"
        "Read every category, subcategory and dish you can see and return the "
        "complete menu as structured JSON.\n\n"
        "For each dish fill in: name; a short, appetising one-line description; "
        "price as a plain number in Indian rupees (no symbols); is_veg; any size "
        "VARIANTS (e.g. Small/Regular/Large) with a signed price_delta relative "
        "to the base price; and any add-on TOPPINGS with their own price. Group "
        "dishes under sensible categories and subcategories even if the photo "
        "only implies them.\n\n"
        "TAGS — also propose a single global list of AT MOST 20 concise, "
        "lowercase tags that describe this menu (flavours, dietary notes, "
        "occasions, course types, etc.). The list MUST include these two tags "
        'exactly: "budget friendly" and "most ordered". Assign "budget friendly" '
        "to the lower-priced dishes, and use your general knowledge of what "
        "dishes are typically best-sellers at this kind of place to decide which "
        'items deserve "most ordered". Then, for EVERY item, set its `tags` to '
        "ALL of the global tags that genuinely apply to it (copied verbatim from "
        "the global list).\n\n"
        f"Manager's extra notes: {notes}"
    )


def extract_menu_from_photos(
    images: list[tuple[bytes, str]], instructions: str | None
) -> PhotoMenu:
    """Send the menu photos plus instructions to Gemini and return the parsed
    :class:`PhotoMenu`."""
    from google.genai import types

    parts = [
        types.Part.from_bytes(data=data, mime_type=mime) for data, mime in images
    ]
    contents = [*parts, _prompt(instructions)]
    return generate_structured_multimodal(contents, PhotoMenu)  # type: ignore[return-value]


def finalize_tags(raw: list[str]) -> list[str]:
    """Clean the model's tag list: trim, drop blanks/case-insensitive dupes,
    guarantee the mandatory tags are present, and cap the total at
    :data:`MAX_TAGS` while always keeping the mandatory ones."""
    seen: dict[str, str] = {}
    for name in raw:
        key = (name or "").strip()
        if key and key.casefold() not in seen:
            seen[key.casefold()] = key
    for mandatory in MANDATORY_TAGS:
        seen.setdefault(mandatory.casefold(), mandatory)

    mandatory_cf = {m.casefold() for m in MANDATORY_TAGS}
    names = list(seen.values())
    if len(names) > MAX_TAGS:
        kept = [seen[m.casefold()] for m in MANDATORY_TAGS]
        others = [n for n in names if n.casefold() not in mandatory_cf]
        names = kept + others[: MAX_TAGS - len(kept)]
    return names


def photo_menu_to_structure(menu: PhotoMenu) -> tuple[list[str], list[dict]]:
    """Convert the model's :class:`PhotoMenu` into the neutral (tags, categories)
    structure that :func:`crud.rebuild_menu_from_structure` consumes. Imported
    dishes carry no photos (the photos are of the paper menu, not the plates)."""
    tags = finalize_tags(menu.tags)
    categories = [
        {
            "name": cat.name,
            "description": cat.description,
            "photos": [],
            "subcategories": [
                {
                    "name": sub.name,
                    "description": sub.description,
                    "photos": [],
                    "items": [
                        {
                            "name": item.name,
                            "description": item.description,
                            "price": item.price,
                            "photos": [],
                            "is_veg": item.is_veg,
                            "tags": list(item.tags),
                            "toppings": [
                                {"name": t.name, "price": t.price}
                                for t in item.toppings
                            ],
                            "variants": [
                                {"name": v.name, "price_delta": v.price_delta}
                                for v in item.variants
                            ],
                        }
                        for item in sub.items
                    ],
                }
                for sub in cat.subcategories
            ],
        }
        for cat in menu.categories
    ]
    return tags, categories
