# chatbot

Everything behind the cafe's menu chatbot.

## Chat sessions

A **chat session** is one `chat_contexts` row (model: `app/models/chat_context.py`,
table `chat_contexts`). It snapshots the ambient facts the chatbot reasons with for
a user: `weather`, `time`, `setup_of_people` (free text, who's at the table) and
`veg_only`. A row stays `is_active` until the session ends; at most one active row
per user is expected.

The session is opened by **`POST /api/chatbot/initiate-chat`**
(`app/routers/chatbot.py`). This router **initiates a particular chat session**:

1. Authenticates the caller via JWT (`require_jwt`; user id is `claims["sub"]`).
2. Ensures the user has an open cart (`initiate_my_cart`) — created empty if absent.
3. Looks up an existing `chat_contexts` row for that `user_id` with `is_active = true`.
   - If one exists, it returns that row's id — the session is resumed, not duplicated.
   - Otherwise it creates a new row: `weather` and `time` are filled from the
     `internal_tools` functions, `setup_of_people` and `veg_only` come from the
     request body, `is_active` is set true, and the new row's id is returned.
     Weather is best-effort — if `internal_tools/weather.py` fails for any reason,
     `weather` is stored as null and the request still succeeds.

Everything the chatbot does afterwards is scoped to this `chat_context_id`.

## Subpackages

- **`tools/`** — trimmed, read-only helpers the *model* is given. Not MCP, just
  plain functions over a `Session`:
  - `get_full_menu(db, chat_context_id)` — the menu as a nested
    categories → subcategories → items tree, stripped to names/prices. Reads the
    session's `veg_only` flag to decide whether non-veg items are dropped (only
    available items are ever returned).
  - `get_context(db, chat_context_id)` — the session's stored fields (everything
    except `id`, `created_at`, `updated_at`), with any `None`-valued field omitted
    entirely.
  - `view_my_cart(db, order_id)` — one order stripped to `total_amount` plus, per
    line, just `{name, quantity}`. Raises `OrderNotFound` for an unknown id.
- **`internal_tools/`** — helpers wired directly into API routes (not handed to
  the model). See `internal_tools/README.md` for the function → API mapping.
  - `get_current_time()` — current local time as an ISO string.
  - `get_weather(db)` — current weather at the cafe's location as a short phrase,
    read from the cached `weather_prompt` on the tenant row (no network call;
    raises `WeatherUnavailable` when nothing is cached yet). The cache is kept
    fresh by `refresh_weather_prompt(db)`, which `app/main.py` polls every ~30
    min against Open-Meteo — this is what keeps `initiate-chat` off the slow API
    round-trip.
  - `initiate_my_cart(db, user_id)` — the id of the user's open cart, creating an
    empty one if none exists (same `get_or_create_cart` logic as the cart endpoints).
  - `food_listing_from_llm(db, payload)` — resolves an LLM-produced nested food
    listing (fuzzy names + quantities) to a `get-full-menu`-shaped tree of real
    menu rows, dropping anything it can't confidently resolve and pruning empty
    branches. Validated by `pydantic_validators/food_listing.py`.
- **`validators/`** — the reverse direction: fuzzy-resolve noisy, model-produced
  free text (e.g. `"EXTRA CHEESE"`) back to a real menu row by name.
- **`pydantic_validators/`** — Pydantic schemas for model-produced payloads, e.g.
  `FoodListingFromLLM`, which `food_listing_from_llm` validates its input against.

## Schema / table creation

The `chat_contexts` table is created by `Base.metadata.create_all` on startup
(see `app/main.py`). It was also created directly via SQL rather than an Alembic
migration.
