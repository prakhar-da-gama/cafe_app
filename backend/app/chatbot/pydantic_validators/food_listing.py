"""Pydantic schema for the food listing the LLM hands back to the chatbot.

When the model is asked to turn a free-text order into structured data it
replies with a nested ``categories -> subcategories -> items`` tree where every
leaf item carries a ``name`` and a ``quantity``. That reply is noisy,
model-produced JSON, so it is validated against :class:`FoodListingFromLLM`
before :func:`app.chatbot.internal_tools.foodlistingfromllm.food_listing_from_llm`
tries to resolve each name to a real menu row.

Example of a valid payload::

    {
        "categories": [
            {
                "name": "Beverages",
                "subcategories": [
                    {
                        "name": "Hot Drinks",
                        "items": [
                            {"name": "Cappuccino", "quantity": 2},
                            {"name": "Masala Chai", "quantity": 1}
                        ]
                    }
                ]
            }
        ]
    }
"""
from pydantic import BaseModel, ConfigDict, Field


class LLMItem(BaseModel):
    """One ordered item: a free-text name and how many were asked for."""

    # Reject unknown keys so a malformed/hallucinated field surfaces as an
    # error instead of being silently dropped.
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    quantity: int = Field(ge=1)


class LLMSubcategory(BaseModel):
    """A subcategory name with the items the LLM placed under it."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    items: list[LLMItem] = Field(min_length=1)


class LLMCategory(BaseModel):
    """A category name with its subcategories."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    subcategories: list[LLMSubcategory] = Field(min_length=1)


class FoodListingFromLLM(BaseModel):
    """Top-level wrapper for the nested listing produced by the LLM."""

    model_config = ConfigDict(extra="forbid")

    categories: list[LLMCategory] = Field(min_length=1)
