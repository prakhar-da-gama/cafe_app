from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime
from sqlalchemy import Enum as SAEnum
from sqlalchemy import Boolean, Index, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class NotificationFor(str, enum.Enum):
    """Which audience a notification is addressed to."""

    manager = "manager"
    admin = "admin"
    customer = "customer"


class Notification(Base):
    """A dashboard notification addressed to one audience (manager / admin /
    customer). The listing endpoint always filters by ``notification_for`` (and
    optionally ``resolved``) and pages newest-first, so a composite index on
    (notification_for, resolved, created_at) backs that filter + ORDER BY +
    pagination entirely at the DB level."""

    __tablename__ = "notifications"
    __table_args__ = (
        Index(
            "ix_notifications_for_resolved_created",
            "notification_for",
            "resolved",
            "created_at",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    notification_text: Mapped[str] = mapped_column(Text, nullable=False)
    resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notification_for: Mapped[NotificationFor] = mapped_column(
        SAEnum(NotificationFor), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
