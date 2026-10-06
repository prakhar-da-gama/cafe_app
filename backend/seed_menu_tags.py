"""Add more menu items and apply relevant tags to every item.

- Does NOT create or change categories / subcategories (uses existing ones).
- Inserts new items under the existing subcategories if missing.
- Recomputes tag_ids for EVERY item based on its real properties, so a tag
  is applied wherever it genuinely fits (e.g. every sugar-free drink gets
  "Sugar-Free", every hot drink gets "Hot", etc.).
- Bestseller / Chef's Special / Combo Deal are assigned randomly (seeded, so
  re-running is reproducible).

Run: python seed_menu_tags.py
"""
import random

from app.database import Base, SessionLocal, engine, ensure_database_exists
from app.models import Item, Subcategory, Tag

# --- Tag ids (match seed_tags.py order) ---
BUDGET, BESTSELLER, CHEF, SPICY, SWEET, SUGARFREE, LOWFAT, PROTEIN, \
    VEG, NONVEG, VEGAN, GF, HOT, CHILLED, COMBO = range(1, 16)

BUDGET_THRESHOLD = 150  # price <= this => Budget-Friendly

# Property-driven item catalog. Flags drive the semantic tags.
#   veg       : vegetarian (False => Non-Veg); vegan implies veg too
#   flags     : any of {sweet, sugar_free, low_fat, high_protein, vegan,
#               gluten_free, spicy}
#   temp      : "hot" | "cold" | None
# Items already in the DB are included so their tags get set as well.
ITEMS = [
    # ---- Hot Coffee ----
    ("Hot Coffee", "Espresso", 120, True,
     {"sugar_free", "low_fat", "vegan", "gluten_free"}, "hot",
     "Rich single shot of espresso."),
    ("Hot Coffee", "Cappuccino", 180, True,
     {"sugar_free", "gluten_free"}, "hot",
     "Espresso with steamed milk and a thick layer of foam."),
    ("Hot Coffee", "Americano", 130, True,
     {"sugar_free", "low_fat", "vegan", "gluten_free"}, "hot",
     "Espresso lengthened with hot water."),
    ("Hot Coffee", "Cafe Latte", 190, True,
     {"sugar_free", "gluten_free"}, "hot",
     "Smooth espresso with lots of steamed milk."),
    ("Hot Coffee", "Cafe Mocha", 220, True,
     {"sweet", "gluten_free"}, "hot",
     "Espresso, steamed milk and rich chocolate."),
    ("Hot Coffee", "Masala Chai", 90, True,
     {"sweet", "spicy", "gluten_free"}, "hot",
     "Spiced Indian milk tea brewed with cardamom and ginger."),
    ("Hot Coffee", "Hot Chocolate", 170, True,
     {"sweet", "gluten_free"}, "hot",
     "Warm milk blended with melted chocolate."),

    # ---- Cold Brews ----
    ("Cold Brews", "Cold Brew", 200, True,
     {"sugar_free", "low_fat", "vegan", "gluten_free"}, "cold",
     "Slow steeped for 18 hours, smooth and low acid."),
    ("Cold Brews", "Iced Americano", 150, True,
     {"sugar_free", "low_fat", "vegan", "gluten_free"}, "cold",
     "Espresso over ice and chilled water."),
    ("Cold Brews", "Iced Latte", 210, True,
     {"sugar_free", "gluten_free"}, "cold",
     "Chilled espresso with milk over ice."),
    ("Cold Brews", "Cold Coffee", 180, True,
     {"sweet", "gluten_free"}, "cold",
     "Blended iced coffee with milk and sugar."),
    ("Cold Brews", "Iced Mocha", 230, True,
     {"sweet", "gluten_free"}, "cold",
     "Iced coffee with chocolate and milk."),
    ("Cold Brews", "Lemon Iced Tea", 110, True,
     {"sweet", "vegan", "gluten_free"}, "cold",
     "Freshly brewed black tea with lemon over ice."),

    # ---- Bakery ----
    ("Bakery", "Blueberry Muffin", 150, True,
     {"sweet"}, None,
     "Freshly baked with real blueberries."),
    ("Bakery", "Chocolate Chip Cookie", 80, True,
     {"sweet"}, None,
     "Chewy cookie loaded with chocolate chips."),
    ("Bakery", "Butter Croissant", 120, True,
     set(), None,
     "Flaky, buttery French-style croissant."),
    ("Bakery", "Veg Sandwich", 130, True,
     set(), None,
     "Grilled sandwich with fresh veggies and cheese."),
    ("Bakery", "Grilled Chicken Sandwich", 220, False,
     {"high_protein", "spicy"}, None,
     "Grilled chicken, lettuce and peri-peri mayo."),
    ("Bakery", "Egg & Cheese Sandwich", 180, False,
     {"high_protein"}, None,
     "Toasted sandwich with egg and melted cheese."),
    ("Bakery", "Chicken Puff", 90, False,
     {"spicy"}, None,
     "Crispy puff pastry with spiced chicken filling."),
    ("Bakery", "Banana Walnut Bread", 160, True,
     {"sweet"}, None,
     "Moist banana loaf with toasted walnuts."),
    ("Bakery", "Gluten-Free Brownie", 180, True,
     {"sweet", "gluten_free"}, None,
     "Fudgy chocolate brownie made without gluten."),
    ("Bakery", "Protein Energy Bar", 150, True,
     {"sweet", "high_protein", "gluten_free"}, None,
     "No-bake oat and peanut butter protein bar."),
]

FLAG_TAG = {
    "sweet": SWEET,
    "sugar_free": SUGARFREE,
    "low_fat": LOWFAT,
    "high_protein": PROTEIN,
    "vegan": VEGAN,
    "gluten_free": GF,
    "spicy": SPICY,
}


def semantic_tags(price: int, veg: bool, flags: set[str], temp: str | None) -> set[int]:
    tags: set[int] = set()
    tags.add(VEG if veg else NONVEG)
    for flag in flags:
        tags.add(FLAG_TAG[flag])
    if "vegan" in flags:
        tags.add(VEG)  # vegan is also vegetarian
    if temp == "hot":
        tags.add(HOT)
    elif temp == "cold":
        tags.add(CHILLED)
    if price <= BUDGET_THRESHOLD:
        tags.add(BUDGET)
    return tags


def main() -> None:
    ensure_database_exists()
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Validate tags exist (run seed_tags.py first).
        if db.query(Tag).count() < 15:
            print("Tags missing; run `python seed_tags.py` first.")
            return

        sub_by_name = {s.name: s for s in db.query(Subcategory).all()}
        missing = {spec[0] for spec in ITEMS} - set(sub_by_name)
        if missing:
            print(f"Missing subcategories {missing}; aborting (won't create them).")
            return

        rng = random.Random(7)
        inserted = updated = 0
        # Track display_order per subcategory from existing max.
        next_order: dict[int, int] = {}

        for sub_name, name, price, veg, flags, temp, desc in ITEMS:
            sub = sub_by_name[sub_name]
            if sub.id not in next_order:
                existing_max = (
                    db.query(Item)
                    .filter(Item.subcategory_id == sub.id)
                    .count()
                )
                next_order[sub.id] = existing_max

            tags = semantic_tags(price, veg, flags, temp)
            # Random promotional tags.
            if rng.random() < 0.35:
                tags.add(BESTSELLER)
            if rng.random() < 0.30:
                tags.add(CHEF)
            if rng.random() < 0.30:
                tags.add(COMBO)
            tag_ids = sorted(tags)

            item = (
                db.query(Item)
                .filter(Item.subcategory_id == sub.id, Item.name == name)
                .first()
            )
            if item is None:
                item = Item(
                    subcategory_id=sub.id,
                    name=name,
                    description=desc,
                    price=price,
                    photos=[],
                    tag_ids=tag_ids,
                    is_veg=veg,
                    display_order=next_order[sub.id],
                )
                db.add(item)
                next_order[sub.id] += 1
                inserted += 1
            else:
                item.tag_ids = tag_ids
                item.is_veg = veg
                updated += 1

        db.commit()
        print(f"Inserted {inserted} new items, updated tags on {updated} existing items.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
