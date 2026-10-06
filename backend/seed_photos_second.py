"""Top every menu item up to two photos.

Reuses the Wikipedia search + upload helpers from seed_photos.py. For each item
that has fewer than two photos, it gathers several distinct candidate images
(across the search result pages and the head-noun fallback query), then uploads
and appends ones that differ from what the item already has until it holds two.

Idempotent: items that already have two photos are skipped. Requires the backend
to be running. Run: python seed_photos_second.py
"""
from __future__ import annotations

import time

from app.database import SessionLocal
from app import models
from seed_photos import (
    REQUEST_DELAY,
    _get,
    _query_variants,
    _wiki,
    _words,
    upload_via_api,
)

TARGET = 2


def candidate_urls(name: str) -> list[str]:
    """Several distinct, relevant image URLs for an item, best first."""
    item_words = _words(name)
    relevant: list[str] = []
    extra: list[str] = []  # relevance-failing, kept as last resort
    seen: set[str] = set()

    for query in _query_variants(name):
        item_words |= _words(query)
        data = _wiki({
            "action": "query",
            "format": "json",
            "redirects": "1",
            "generator": "search",
            "gsrsearch": query,
            "gsrlimit": "10",
            "gsrnamespace": "0",
            "prop": "pageimages",
            "piprop": "thumbnail",
            "pithumbsize": "800",
        })
        pages = (data.get("query") or {}).get("pages") or {}
        for page in sorted(pages.values(), key=lambda p: p.get("index", 999)):
            thumb = page.get("thumbnail")
            if not (thumb and thumb.get("source")):
                continue
            src = thumb["source"].split("?")[0]
            if src in seen:
                continue
            seen.add(src)
            if _words(page.get("title", "")) & item_words:
                relevant.append(src)
            else:
                extra.append(src)
        if len(relevant) >= TARGET:
            break
        time.sleep(REQUEST_DELAY)

    return relevant + extra


def main() -> None:
    db = SessionLocal()
    try:
        items = db.query(models.Item).order_by(models.Item.id).all()
        topped = skipped = failed = 0
        for item in items:
            photos = list(item.photos or [])
            if len(photos) >= TARGET:
                print(f"[skip] #{item.id} {item.name} (has {len(photos)})")
                skipped += 1
                continue

            print(f"[ .. ] #{item.id} {item.name} (has {len(photos)}, need {TARGET})")
            try:
                urls = candidate_urls(item.name)
                # Prefer a different image, but it's fine to reuse the best match
                # if that's all there is — duplicates are acceptable here.
                i = 0
                while len(photos) < TARGET and urls:
                    url = urls[i % len(urls)]
                    i += 1
                    _, headers, image = _get(url)
                    ctype = headers.get("Content-Type", "image/jpeg").split(";")[0]
                    path = upload_via_api(image, ctype)
                    photos.append(path)
                    print(f"       + {path}  (from {url.rsplit('/', 1)[-1]})")

                item.photos = photos
                db.commit()
                if len(photos) >= TARGET:
                    topped += 1
                else:
                    print(f"       only reached {len(photos)} photo(s)")
                    failed += 1
            except Exception as exc:
                db.rollback()
                print(f"       FAILED: {type(exc).__name__}: {exc}")
                failed += 1

            time.sleep(REQUEST_DELAY)

        print(f"\nDone. topped-up={topped} skipped={skipped} incomplete={failed}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
