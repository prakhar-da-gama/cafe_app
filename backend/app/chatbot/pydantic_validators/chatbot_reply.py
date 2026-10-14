"""Pydantic schema for one turn of the ordering chatbot's reply.

The model answers each message with a single JSON object carrying two optional
parts (see ``app/chatbot/prompts/prompt_shallow_cart.py``):

* ``items_json`` — item suggestions, shaped exactly like the input of
  :func:`app.chatbot.internal_tools.process_food_listing_from_llm.food_listing_from_llm`
  (reuses :class:`FoodListingFromLLM`). ``None`` when nothing is suggested.
* ``llm_response`` — free text to continue the conversation. ``None`` when the
  model has nothing to say.

At least one of the two is expected to be present; a reply with both ``None`` is
rejected.

Example of a valid payload::

    {
        "items_json": {
            "categories": [
                {
                    "name": "Beverages",
                    "subcategories": [
                        {
                            "name": "Hot Drinks",
                            "items": [{"name": "Cappuccino", "quantity": 2}]
                        }
                    ]
                }
            ]
        },
        "llm_response": "Two cappuccinos coming up — anything to eat with those?"
    }
"""
from pydantic import BaseModel, ConfigDict, model_validator

from .food_listing import FoodListingFromLLM


class ChatbotReply(BaseModel):
    """One turn from the ordering chatbot: optional item suggestions and/or an
    optional message to keep talking to the customer."""

    # Reject unknown keys so a hallucinated field surfaces as an error instead
    # of being silently dropped.
    model_config = ConfigDict(extra="forbid")

    items_json: FoodListingFromLLM | None = None
    llm_response: str | None = None

    @model_validator(mode="after")
    def _at_least_one(self) -> "ChatbotReply":
        if self.items_json is None and (
            self.llm_response is None or not self.llm_response.strip()
        ):
            raise ValueError("reply must have item suggestions, a message, or both")
        return self
