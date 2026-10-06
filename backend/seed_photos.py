"""Give every menu item a photo.

For each row in the ``items`` table this:
  1. searches Wikipedia (keyless) for a photo matching the item's name,
  2. downloads that image,
  3. uploads it through the running app's POST /api/upload endpoint, and
  4. stores the returned path in ``item.photos``.

Idempotent: items that already have a photo are left untouched, so it is safe
to re-run. Requires the backend to be running (default http://localhost:8000).

Run:  python seed_photos.py
"""
from __future__ import annotations

import io
import json
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from app.database import SessionLocal
from app import models

API_BASE = "http://localhost:8000"
WIKI_API = "https://en.wikipedia.org/w/api.php"
USER_AGENT = "cafe-app-seed/1.0 (educational demo; contact: local)"
SSL_CTX = ssl.create_default_context()

# Wikipedia asks clients to go easy; a small delay plus backoff keeps us well
# under the rate limit (we saw 429s only when hammering it with no pause).
REQUEST_DELAY = 1.2


def _get(url: str, *, timeout: int = 30) -> tuple[int, dict[str, str], bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as resp:
        return resp.getcode(), dict(resp.headers), resp.read()


def _wiki(params: dict[str, str]) -> dict:
    """Call the MediaWiki API with retry/backoff on rate limits."""
    url = f"{WIKI_API}?{urllib.parse.urlencode(params)}"
    for attempt in range(4):
        try:
            _, _, body = _get(url)
            return json.loads(body)
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < 3:
                wait = 3 * (attempt + 1)
                print(f"    rate-limited; waiting {wait}s...")
                time.sleep(wait)
                continue
            raise
    return {}


# Words that carry no topical meaning for relevance matching.
_STOP = {"the", "and", "with", "cafe", "iced", "hot", "cold", "double", "free"}


def _words(text: str) -> set[str]:
    cleaned = text.lower().replace("&", " ").replace("-", " ")
    return {w for w in cleaned.split() if len(w) > 3 and w not in _STOP}


def _query_variants(name: str) -> list[str]:
    """Search queries from most to least specific: full name, then the trailing
    one/two words (the item's head noun) for invented names like
    'Caramel Cloud Latte' that have no Wikipedia page of their own."""
    parts = name.replace("&", " ").split()
    variants = [name]
    if len(parts) >= 2:
        variants.append(" ".join(parts[-2:]))
    if len(parts) >= 1:
        variants.append(parts[-1])
    # De-dupe, preserving order.
    seen: set[str] = set()
    return [v for v in variants if not (v.lower() in seen or seen.add(v.lower()))]


def find_image_url(name: str) -> str | None:
    """Best photo URL for an item name, or None.

    Tries the full name first, then progressively shorter queries. A result is
    only accepted if the matched Wikipedia page title shares a meaningful word
    with the item name, which rejects the tangential pages that full invented
    names ('Caramel Cloud Latte') would otherwise land on. If nothing passes
    the relevance check, the very first thumbnail seen is used as a last resort."""
    item_words = _words(name)
    fallback: str | None = None

    for query in _query_variants(name):
        item_words |= _words(query)
        data = _wiki({
            "action": "query",
            "format": "json",
            "redirects": "1",
            "generator": "search",
            "gsrsearch": query,
            "gsrlimit": "5",
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
            src = thumb["source"].split("?")[0]  # strip tracking params
            if fallback is None:
                fallback = src
            if _words(page.get("title", "")) & item_words:
                return src
        time.sleep(REQUEST_DELAY)
    return fallback


def upload_via_api(image: bytes, content_type: str) -> str:
    """POST image bytes to the app's upload endpoint; return the served path."""
    ext = {"image/jpeg": ".jpg", "image/png": ".png",
           "image/webp": ".webp", "image/gif": ".gif"}.get(content_type, ".jpg")
    boundary = f"----cafe{uuid.uuid4().hex}"
    buf = io.BytesIO()
    buf.write(f"--{boundary}\r\n".encode())
    buf.write(
        f'Content-Disposition: form-data; name="file"; filename="photo{ext}"\r\n'
        .encode()
    )
    buf.write(f"Content-Type: {content_type}\r\n\r\n".encode())
    buf.write(image)
    buf.write(f"\r\n--{boundary}--\r\n".encode())

    req = urllib.request.Request(
        f"{API_BASE}/api/upload",
        data=buf.getvalue(),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)["path"]


def main() -> None:
    db = SessionLocal()
    try:
        items = db.query(models.Item).order_by(models.Item.id).all()
        updated = skipped = failed = 0
        for item in items:
            if item.photos:
                print(f"[skip] #{item.id} {item.name} (already has a photo)")
                skipped += 1
                continue

            print(f"[ .. ] #{item.id} {item.name}")
            try:
                img_url = find_image_url(item.name)
                if not img_url:
                    print("       no image found")
                    failed += 1
                    continue
                _, headers, image = _get(img_url)
                ctype = headers.get("Content-Type", "image/jpeg").split(";")[0]
                path = upload_via_api(image, ctype)
                item.photos = [path]
                db.commit()
                print(f"       -> {path}  (from {img_url.rsplit('/', 1)[-1]})")
                updated += 1
            except Exception as exc:  # keep going on any single-item failure
                db.rollback()
                print(f"       FAILED: {type(exc).__name__}: {exc}")
                failed += 1

            time.sleep(REQUEST_DELAY)

        print(f"\nDone. updated={updated} skipped={skipped} failed={failed}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
