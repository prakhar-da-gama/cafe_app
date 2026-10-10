from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class TenantRights(Base):
    """Per-tenant entitlements for paid AI features.

    This is a single-cafe app, so there is effectively one row here describing
    what the installation has bought: until when AI is active (ai_access_expiry)
    and how many AI credits it may spend before the next reset. The
    require_ai_access dependency reads this row to decide whether AI endpoints
    are allowed to run.
    """

    __tablename__ = "tenant_rights"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # AI features are active while this is in the future. Null = never purchased.
    ai_access_expiry: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Credit allowance for the current window, and how much has been spent.
    total_credits: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    credits_used: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    # When credits_used rolls back to 0 and the allowance refreshes.
    credits_limit_reset_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
