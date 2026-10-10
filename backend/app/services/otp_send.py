"""OTP email delivery.

Sends the one-time login code to a user's inbox over SMTP (GoDaddy /
Secureserver in production). When no SMTP host is configured the code is logged
instead of sent, so the auth flow stays usable in local development without a
mail server. The OTP is only ever written to the server log or the recipient's
inbox — it is never returned in an API response.
"""
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

BRAND = "Seoulmate Cafe"


def _build_message(to_email: str, otp: str) -> EmailMessage:
    """Assemble the OTP email with a plain-text part and an HTML alternative."""
    minutes = settings.otp_ttl_minutes
    message = EmailMessage()
    message["Subject"] = f"{otp} is your {BRAND} verification code"
    message["From"] = formataddr((BRAND, settings.smtp_from))
    message["To"] = to_email

    text_body = (
        f"Hi,\n\n"
        f"Your {BRAND} verification code is:\n\n"
        f"    {otp}\n\n"
        f"Enter this code to finish signing in. It expires in {minutes} "
        f"minutes.\n\n"
        f"If you didn't try to sign in, you can safely ignore this email — "
        f"no changes will be made to your account.\n\n"
        f"— The {BRAND} team"
    )
    message.set_content(text_body)

    html_body = f"""\
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;
               font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2933;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#f4f5f7;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="440" cellpadding="0" cellspacing="0"
                 style="background:#ffffff;border-radius:16px;overflow:hidden;
                        box-shadow:0 8px 24px rgba(31,41,51,0.08);">
            <tr>
              <td style="background:#1f3a8a;padding:24px 32px;">
                <span style="color:#ffffff;font-size:20px;font-weight:700;
                             letter-spacing:0.3px;">{BRAND}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 12px;font-size:16px;">Hi,</p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.5;
                          color:#52606d;">
                  Use the code below to finish signing in to your
                  {BRAND} account.
                </p>
                <div style="margin:0 0 24px;padding:18px 0;text-align:center;
                            background:#eef2ff;border-radius:12px;">
                  <span style="font-size:34px;font-weight:700;letter-spacing:8px;
                               color:#1f3a8a;">{otp}</span>
                </div>
                <p style="margin:0 0 8px;font-size:14px;color:#52606d;">
                  This code expires in <strong>{minutes} minutes</strong>.
                </p>
                <p style="margin:0;font-size:13px;color:#9aa5b1;line-height:1.5;">
                  If you didn't try to sign in, you can safely ignore this
                  email — no changes will be made to your account.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#f8fafc;
                         border-top:1px solid #e4e7eb;">
                <span style="font-size:12px;color:#9aa5b1;">
                  © {BRAND}. This is an automated message, please don't reply.
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""
    message.add_alternative(html_body, subtype="html")
    return message


def send_otp_email(to_email: str, otp: str) -> None:
    """Send the one-time password ``otp`` to ``to_email``.

    Raises on an SMTP failure so the caller can surface the error rather than
    silently pretending the mail went out.
    """
    if not settings.smtp_host:
        logger.warning("SMTP not configured; OTP for %s is %s", to_email, otp)
        return

    message = _build_message(to_email, otp)

    if settings.smtp_use_ssl:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(
            settings.smtp_host, settings.smtp_port, timeout=15, context=context
        ) as server:
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(message)
        return

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
        if settings.smtp_use_tls:
            server.starttls(context=ssl.create_default_context())
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(message)
