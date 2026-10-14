from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class UserPreference(Base):
    """A single named preference for a user, holding one or more string values.

    `field_name` is the preference key (e.g. "dietary", "favourite_cuisines")
    and `values` is a JSON array of strings for that key. MySQL has no native
    array type, so the list is stored as JSON — the same approach used elsewhere
    in this app (see review_photo_paths / review_images).
    """

    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    field_name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Array of strings, stored as a JSON list. Empty list by default.
    values: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
