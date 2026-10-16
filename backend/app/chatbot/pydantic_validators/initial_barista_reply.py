"""Pydantic schema for the barista's opening turn of a chat session.

Unlike the live-turn :class:`app.chatbot.pydantic_validators.chatbot_reply.ChatbotReply`,
the opener deliberately carries NO item suggestions — generating a nested item
tree up front was slow and the suggestions weren't useful, so the opener is just
a greeting plus the tappable quick-action chips. Used by
:func:`app.chatbot.support_llms.initial_barista_message` for
``POST /api/chatbot/initiate-chat``.

Example of a valid payload::

    {
        "llm_response": "Good morning, I'm Kalp. Tell me what you feel like and
            I'll help you out.",
        "options": [
            "Suggest a full meal combo",
            "What's the special today?",
            "Something light and fresh",
            "A good coffee to start"
        ]
    }
"""
from pydantic import BaseModel, ConfigDict, model_validator


class InitialBaristaReply(BaseModel):
    """The barista's opening turn: a greeting message and exactly the
    quick-action chips (no item suggestions)."""

    # Reject unknown keys so a hallucinated field (e.g. a stray ``items_json``)
    # surfaces as an error instead of being silently dropped.
    model_config = ConfigDict(extra="forbid")

    llm_response: str | None = None
    # Quick-action chips: short, first-person utterances the customer can tap
    # instead of typing (each sent verbatim to /message as their turn).
    options: list[str] | None = None

    @model_validator(mode="after")
    def _has_message(self) -> "InitialBaristaReply":
        if self.llm_response is None or not self.llm_response.strip():
            raise ValueError("opening reply must have a message")
        return self
