from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class ChatContext(Base):
    """One chatbot session's context for a user.

    A row is created when a user initiates a chat and stays `is_active` until the
    session ends. It snapshots the ambient facts the chatbot reasons with —
    `weather` and `time` (filled from the chatbot tools at creation),
    `setup_of_people` (free text describing who's at the table, supplied by the
    frontend) and `veg_only` (whether to show only vegetarian items).

    At most one active row per user is expected: `initiate_chat` reuses the
    existing active row instead of creating a second one.
    """

    __tablename__ = "chat_contexts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    weather: Mapped[str | None] = mapped_column(Text, nullable=True)
    time: Mapped[str | None] = mapped_column(Text, nullable=True)
    setup_of_people: Mapped[str | None] = mapped_column(Text, nullable=True)
    veg_only: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
    # The conversation log for this session, oldest first. Deleted with the
    # session (DB-side ON DELETE CASCADE handles it, hence passive_deletes).
    transcripts: Mapped[list["ChatbotTranscript"]] = relationship(
        "ChatbotTranscript",
        cascade="all, delete-orphan",
        order_by="ChatbotTranscript.id",
        passive_deletes=True,
    )
