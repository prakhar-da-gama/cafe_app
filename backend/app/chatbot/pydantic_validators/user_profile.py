"""Pydantic schema for the customer profile the model distills from a chat.

When a chat session ends, the whole transcript is handed to the model (see
``app/chatbot/support_llms/create_user_profile.py`` and
``app/chatbot/prompts/save_customer_profile_prompt.py``) and it returns a set of
durable preferences to remember about the customer. Each preference maps
directly onto a ``user_preferences`` row: a ``field_name`` key and a list of
string ``values``.

Example of a valid payload::

    {
        "preferences": [
            {"field_name": "dietary", "values": ["vegetarian"]},
            {"field_name": "favourite_items", "values": ["Cappuccino", "Choco Lava"]},
            {"field_name": "allergies", "values": ["peanuts"]}
        ]
    }
"""
from pydantic import BaseModel, ConfigDict, Field


class UserPreferenceEntry(BaseModel):
    """One preference: a key and the string values under it (maps to one
    ``user_preferences`` row)."""

    model_config = ConfigDict(extra="forbid")

    field_name: str = Field(min_length=1, max_length=120)
    values: list[str] = Field(min_length=1)


class UserProfileFromLLM(BaseModel):
    """The durable preferences distilled from a chat. May be empty when the
    conversation revealed nothing worth remembering."""

    model_config = ConfigDict(extra="forbid")

    preferences: list[UserPreferenceEntry] = Field(default_factory=list)
