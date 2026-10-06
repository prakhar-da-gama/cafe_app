import enum
from datetime import datetime

from sqlalchemy import DateTime
from sqlalchemy import Enum as SAEnum
from sqlalchemy import String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class UserType(str, enum.Enum):
    customer = "customer"
    admin = "admin"
    manager = "manager"
    captain = "captain"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # Null right after OTP signup, until the user fills in their profile.
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    email_id: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True, index=True
    )
    # Store a hash here, never the plaintext password.
    # Null for OTP-only accounts that haven't set a password yet.
    password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Public path of the user's uploaded photo (e.g. /api/uploads/<name>).
    # Used as the face on their snake in the game; null until they upload one.
    photo_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    user_type: Mapped[UserType] = mapped_column(
        SAEnum(UserType), nullable=False, default=UserType.customer
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
