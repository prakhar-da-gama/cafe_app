"""Provision privileged accounts (admins/managers can't self-sign-up).

Usage:
    python seed_admin.py                       # admin@coffee.com + manager@coffee.com
    python seed_admin.py admin you@cafe.com    # make that email an admin
    python seed_admin.py manager boss@cafe.com # make that email a manager

Creates the account if the email is new, or promotes an existing account to the
given role. Login is OTP-only (dev dummy code: 123456).
"""
import sys

from app.database import SessionLocal
from app import models


def provision(email: str, role: models.UserType) -> None:
    db = SessionLocal()
    try:
        email = email.lower()
        user = (
            db.query(models.User).filter(models.User.email_id == email).first()
        )
        if user is None:
            user = models.User(name=None, email_id=email, user_type=role)
            db.add(user)
            action = "created"
        else:
            user.user_type = role
            action = "promoted"
        db.commit()
        print(f"{action} {email} as {role.value}")
    finally:
        db.close()


def main() -> None:
    args = sys.argv[1:]
    if not args:
        provision("admin@coffee.com", models.UserType.admin)
        provision("manager@coffee.com", models.UserType.manager)
        return
    role = models.UserType(args[0])
    email = args[1]
    provision(email, role)


if __name__ == "__main__":
    main()
