"""Seed the tenant_rights row describing this cafe's AI entitlements.

Usage:
    python seed_tenant.py

Creates the "Seoulmate Cafe" tenant with AI access and a credit reset date set
three months out, or leaves an existing row untouched. Idempotent: safe to run
more than once.
"""
from datetime import datetime, timedelta, timezone

from app.database import SessionLocal
from app import models

TENANT_NAME = "Seoulmate Cafe"
TOTAL_CREDITS = 10_000_000
# ~3 months. Stored naive (UTC) to match the DATETIME columns.
THREE_MONTHS = timedelta(days=90)


def seed() -> None:
    db = SessionLocal()
    try:
        existing = (
            db.query(models.TenantRights)
            .filter(models.TenantRights.name == TENANT_NAME)
            .first()
        )
        if existing is not None:
            print(f"tenant_rights already has {TENANT_NAME!r} (id={existing.id})")
            return

        future = datetime.now(timezone.utc).replace(tzinfo=None) + THREE_MONTHS
        tenant = models.TenantRights(
            name=TENANT_NAME,
            ai_access_expiry=future,
            total_credits=TOTAL_CREDITS,
            credits_used=0,
            credits_limit_reset_at=future,
        )
        db.add(tenant)
        db.commit()
        print(f"created tenant_rights {TENANT_NAME!r} (id={tenant.id})")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
