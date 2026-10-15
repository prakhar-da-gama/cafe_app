# internal_tools

Chatbot helpers that are **called directly by API endpoints** — as opposed to
`../tools/`, which holds the read-only views handed to the model itself.

## Functions used by APIs

| Function | File | Used by API |
| --- | --- | --- |
| `get_current_time` | `time.py` | `POST /api/chatbot/initiate-chat` (`app/routers/chatbot.py`) — stamps the session's `time`. |
| `get_weather` | `weather.py` | `POST /api/chatbot/initiate-chat` — fills the session's `weather` (best-effort; failures are swallowed). Reads the cached `weather_prompt` off the tenant row (no network call). |
| `refresh_weather_prompt` | `weather.py` | Background poll in `app/main.py` — every ~30 min fetches the live weather from Open-Meteo and caches it on the tenant row (`weather_prompt` / `weather_updated_at`). A failed poll is logged and retried next cycle. |
| `initiate_my_cart` | `initiatemycart.py` | `POST /api/chatbot/initiate-chat` — ensures the user has an open cart. |
| `food_listing_from_llm` | `process_food_listing_from_llm.py` | Chatbot order flow — resolves an LLM-produced food listing to a `get-full-menu`-shaped tree of real menu rows. |

Keep this list in sync when a function here is wired into (or removed from) a
route.
