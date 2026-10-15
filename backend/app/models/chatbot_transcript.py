from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class ChatbotTranscript(Base):
    """One message in a chatbot session's transcript.

    A ``chat_contexts`` row has many of these — one per turn — forming the full
    conversation log. Rows are append-only; chronological order is ``id ASC``
    (the autoincrement key already encodes insertion order within a session, so
    no separate sequence column is needed).

    When the session ends the transcript is *soft-deleted*: each row's
    ``is_active`` is flipped to ``False`` (along with the ``chat_contexts``
    row's) rather than being physically removed, so the conversation is still on
    hand for the background profile build. Transcript reads filter on
    ``is_active`` so ended sessions don't resurface.
    """

    __tablename__ = "chatbot_transcripts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chat_context_id: Mapped[int] = mapped_column(
        ForeignKey("chat_contexts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Who sent this turn: "user" or "assistant".
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    # The message text (the customer's message, or the bot's llm_response).
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The items the bot suggested that turn, if any (raw LLM listing). Null for
    # user turns and for assistant turns with no suggestions.
    items_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    # Soft-delete flag. True for a live session's turns; flipped to False when
    # the session ends (see the class docstring). Transcript reads filter on it.
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
