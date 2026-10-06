"""Email delivery via SMTP."""
import logging
import smtplib
from email.message import EmailMessage

from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def send_otp_email(to_email: str, otp: str) -> None:
    """Send a one-time password to ``to_email``.

    When no SMTP host is configured, the OTP is logged instead of sent so the
    flow is usable in local development without a mail server.
    """
    subject = "Your verification code"
    body = (
        f"Your verification code is {otp}.\n"
        f"It is valid for {settings.otp_ttl_minutes} minutes.\n\n"
        "If you did not request this, you can ignore this email."
    )

    if not settings.smtp_host:
        logger.warning("SMTP not configured; OTP for %s is %s", to_email, otp)
        return

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_from
    message["To"] = to_email
    message.set_content(body)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
        if settings.smtp_use_tls:
            server.starttls()
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(message)
