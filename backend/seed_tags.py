"""Seed the database with sample tags. Run: python seed_tags.py"""
from app.database import Base, SessionLocal, engine, ensure_database_exists
from app.models import Tag

# 15 of the most useful tags for a typical budget-friendly cafe.
TAGS = [
    "Budget-Friendly",
    "Bestseller",
    "Chef's Special",
    "Spicy",
    "Sweet",
    "Sugar-Free",
    "Low-Fat",
    "High-Protein",
    "Veg",
    "Non-Veg",
    "Vegan",
    "Gluten-Free",
    "Hot",
    "Chilled",
    "Combo Deal",
]


def main() -> None:
    ensure_database_exists()
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existing = {t.tag for t in db.query(Tag.tag).all()}
        added = 0
        for tag in TAGS:
            if tag in existing:
                continue
            db.add(Tag(tag=tag))
            added += 1
        db.commit()
        print(f"Seeded {added} tags ({len(existing)} already present, skipped).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
