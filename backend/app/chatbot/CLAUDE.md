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
2. Looks up an existing `chat_contexts` row for that `user_id` with `is_active = true`.
   - If one exists, it returns that row's id — the session is resumed, not duplicated.
   - Otherwise it creates a new row: `weather` and `time` are filled from the
     `tools` functions, `setup_of_people` and `veg_only` come from the request body,
     `is_active` is set true, and the new row's id is returned. Weather is
     best-effort — if `tools/weather.py` fails for any reason, `weather` is stored
     as null and the request still succeeds.

Everything the chatbot does afterwards is scoped to this `chat_context_id`.

## Subpackages

- **`tools/`** — trimmed, read-only helpers the model is given. Not MCP, just plain
  functions over a `Session`:
  - `get_full_menu(db, chat_context_id)` — the menu as a nested
    categories → subcategories → items tree, stripped to names/prices. Reads the
    session's `veg_only` flag to decide whether non-veg items are dropped (only
    available items are ever returned).
  - `get_context(db, chat_context_id)` — the session's stored fields (everything
    except `id`, `created_at`, `updated_at`), with any `None`-valued field omitted
    entirely.
  - `get_current_time()` — current local time as an ISO string.
  - `get_weather(db)` — current weather at the cafe's location as a short phrase
    (raises `WeatherUnavailable` when there's no usable location / the API is down).
- **`validators/`** — the reverse direction: fuzzy-resolve noisy, model-produced
  free text (e.g. `"EXTRA CHEESE"`) back to a real menu row by name.

## Schema / table creation

The `chat_contexts` table is created by `Base.metadata.create_all` on startup
(see `app/main.py`). It was also created directly via SQL rather than an Alembic
migration.
