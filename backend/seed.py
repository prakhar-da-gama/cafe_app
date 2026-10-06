"""Idempotent demo seed: tags, a category/subcategory, variants, toppings, and
items wired to tags. Safe to run repeatedly — it get-or-creates by name and
never deletes or overwrites existing rows. Run: python seed.py
"""
from decimal import Decimal

from app.database import Base, SessionLocal, engine, ensure_database_exists
from app import models

TAGS = [
    "Sweet", "Strong", "Iced", "Hot", "Decaf",
    "Fruity", "Nutty", "Creamy", "Vegan", "Spiced",
]

VARIANTS = [
    ("Small", "A lighter pour", Decimal("-20.00")),
    ("Regular", "The house standard", Decimal("0.00")),
    ("Large", "For the committed", Decimal("40.00")),
]

TOPPINGS = [
    ("Extra Shot", Decimal("30.00")),
    ("Oat Milk", Decimal("25.00")),
    ("Whipped Cream", Decimal("20.00")),
    ("Caramel Drizzle", Decimal("15.00")),
    ("Cinnamon", Decimal("0.00")),
]

# (name, description, price, veg, [tags], [toppings], [variants])
ITEMS = [
    ("Caramel Cloud Latte", "Silky espresso, steamed milk, caramel ribbons.",
     Decimal("280"), True, ["Sweet", "Hot", "Creamy"],
     ["Extra Shot", "Oat Milk", "Whipped Cream", "Caramel Drizzle"],
     ["Small", "Regular", "Large"]),
    ("Iced Hazelnut Mocha", "Cold-brewed, nutty, chocolate finish.",
     Decimal("320"), True, ["Iced", "Sweet", "Nutty"],
     ["Extra Shot", "Oat Milk", "Whipped Cream"], ["Regular", "Large"]),
    ("Double Ristretto", "Two tight shots. Bold and unapologetic.",
     Decimal("190"), True, ["Strong", "Hot"], ["Extra Shot"],
     ["Small", "Regular"]),
    ("Berry Cold Foam Brew", "Cold brew crowned with berry cold foam.",
     Decimal("300"), True, ["Iced", "Fruity", "Sweet"],
     ["Oat Milk", "Whipped Cream"], ["Regular", "Large"]),
    ("Spiced Chai Oat Latte", "House chai, warming spice, oat milk.",
     Decimal("260"), True, ["Hot", "Spiced", "Vegan", "Creamy"],
     ["Oat Milk", "Cinnamon"], ["Small", "Regular", "Large"]),
    ("Decaf Flat White", "All the ritual, none of the buzz.",
     Decimal("240"), True, ["Decaf", "Hot", "Creamy"],
     ["Oat Milk", "Cinnamon"], ["Regular"]),
    ("Vegan Vanilla Cold Brew", "Slow-steeped, vanilla, splash of oat.",
     Decimal("290"), True, ["Iced", "Vegan", "Sweet"],
     ["Oat Milk", "Caramel Drizzle"], ["Regular", "Large"]),
    ("Pistachio Cortado", "Equal parts espresso and milk, pistachio note.",
     Decimal("270"), True, ["Nutty", "Hot", "Creamy"],
     ["Extra Shot", "Oat Milk"], ["Small", "Regular"]),
]


def get_or_create(db, model, defaults=None, **lookup):
    obj = db.query(model).filter_by(**lookup).first()
    if obj:
        return obj, False
    obj = model(**{**lookup, **(defaults or {})})
    db.add(obj)
    db.flush()
    return obj, True


def main() -> None:
    ensure_database_exists()
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        tags = {t: get_or_create(db, models.Tag, tag=t)[0] for t in TAGS}
        variants = {
            name: get_or_create(
                db, models.Variant, name=name,
                defaults={"description": desc, "price_delta": delta},
            )[0]
            for name, desc, delta in VARIANTS
        }
        toppings = {
            name: get_or_create(
                db, models.Topping, name=name, defaults={"price": price},
            )[0]
            for name, price in TOPPINGS
        }

        category, _ = get_or_create(db, models.Category, name="Coffee Bar")
        subcategory, _ = get_or_create(
            db, models.Subcategory, name="Signature Drinks",
            defaults={"category_id": category.id},
        )

        for order, (name, desc, price, veg, tag_names, top_names, var_names) in enumerate(ITEMS):
            item, created = get_or_create(
                db, models.Item, name=name, subcategory_id=subcategory.id,
                defaults={
                    "description": desc,
                    "price": price,
                    "is_veg": veg,
                    "display_order": order,
                    "tag_ids": [tags[t].id for t in tag_names],
                },
            )
            if created:
                item.toppings = [toppings[n] for n in top_names]
                item.variants = [variants[n] for n in var_names]
            else:
                # Keep tag wiring current without clobbering other edits.
                item.tag_ids = [tags[t].id for t in tag_names]

        db.commit()
        print(f"Seeded {len(TAGS)} tags, {len(ITEMS)} items.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
