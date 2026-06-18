import logging
import os
import re
import smtplib
from email.message import EmailMessage

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

try:
    import resend  # type: ignore
except Exception:  # pragma: no cover
    resend = None

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
FROM_EMAIL = os.getenv("FROM_EMAIL", "").strip()
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")
RESEND_ALLOWED_DOMAIN = os.getenv("RESEND_ALLOWED_DOMAIN", "").strip().lower()
_FREE_MAIL_DOMAINS = {
    "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "live.com",
    "aol.com",
    "icloud.com",
    "proton.me",
    "protonmail.com",
}


def _configured_sender() -> str | None:
    if FROM_EMAIL and "@" in FROM_EMAIL:
        return FROM_EMAIL
    return None


def _sender_domain(sender: str) -> str:
    return sender.rsplit("@", 1)[-1].lower()


def _resend_sender_allowed(sender: str) -> bool:
    if not sender or "@" not in sender:
        return False
    domain = _sender_domain(sender)
    if RESEND_ALLOWED_DOMAIN:
        return domain == RESEND_ALLOWED_DOMAIN
    return domain not in _FREE_MAIL_DOMAINS and bool(re.match(r"^[a-z0-9.-]+\.[a-z]{2,}$", domain))


def _send_via_resend(to_email: str, subject: str, html_content: str) -> bool:
    if not resend or not RESEND_API_KEY:
        return False
    sender = _configured_sender()
    if not sender:
        logger.warning("FROM_EMAIL is missing or invalid; skipping Resend send")
        return False
    if not _resend_sender_allowed(sender):
        logger.warning(
            "FROM_EMAIL domain is not eligible for Resend (%s); skipping Resend send",
            sender,
        )
        return False
    try:
        resend.api_key = RESEND_API_KEY
        resend.Emails.send(
            {
                "from": f"Pickmatch <{sender}>",
                "to": to_email,
                "subject": subject,
                "html": html_content,
            }
        )
        return True
    except Exception:
        logger.exception("Resend send failed for %s", to_email)
        return False


def _send_via_smtp(to_email: str, subject: str, html_content: str) -> bool:
    sender = _configured_sender()
    if not sender or not SMTP_HOST:
        return False
    try:
        msg = EmailMessage()
        msg["From"] = f"Pickmatch <{sender}>"
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.set_content("Please view this message in an HTML-capable email client.")
        msg.add_alternative(html_content, subtype="html")

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
            if SMTP_USE_TLS:
                smtp.starttls()
            if SMTP_USERNAME:
                smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
            smtp.send_message(msg)
        return True
    except Exception:
        logger.exception("SMTP send failed for %s", to_email)
        return False


def _send_email(to_email: str, subject: str, html_content: str, debug_label: str) -> None:
    if _send_via_resend(to_email, subject, html_content):
        logger.info("%s sent to %s via Resend", debug_label, to_email)
        return
    if _send_via_smtp(to_email, subject, html_content):
        logger.info("%s sent to %s via SMTP", debug_label, to_email)
        return
    logger.warning(
        "Email provider not configured; skipping %s for %s",
        debug_label.lower(),
        to_email,
    )


def send_verification_email(to_email: str, code: str) -> None:
    subject = "Verify your Pickmatch account"
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #9966CC; text-align: center;">Welcome to Pickmatch!</h2>
        <p>Use the verification code below to activate your account:</p>
        <div style="background-color: #f4f4f5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <h1 style="letter-spacing: 5px; color: #333; margin: 0;">{code}</h1>
        </div>
        <p>This code will expire in 15 minutes.</p>
        <p>If you did not request this, you can ignore this email.</p>
    </div>
    """
    _send_email(to_email, subject, html_content, "Verification email")


def send_password_reset_email(to_email: str, token: str) -> None:
    reset_link = f"{FRONTEND_URL}/reset-password?token={token}"
    subject = "Reset your Pickmatch password"
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #9966CC; text-align: center;">Pickmatch Password Reset</h2>
        <p>We received a request to reset your password. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{reset_link}" style="background-color: #9966CC; color: white; padding: 12px 24px; text-decoration: none; border-radius: 25px; font-weight: bold;">Reset Password</a>
        </div>
        <p>This link will expire in 30 minutes.</p>
    </div>
    """
    _send_email(to_email, subject, html_content, "Password reset email")
