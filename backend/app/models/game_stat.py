from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class GameStat(Base):
    """One row per snake-game life: the score reached in that session.

    A new row is created when a player (re)spawns and its score is updated as
    they eat. `datetime_started` marks when the life began.
    """

    __tablename__ = "game_stats"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    score: Mapped[int] = mapped_column(Integer, default=0, nullable=False, index=True)
    datetime_started: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False, index=True
    )
