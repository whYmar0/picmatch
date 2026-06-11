import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
import logging

load_dotenv()

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", SMTP_USER)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

logger = logging.getLogger(__name__)

def send_email_smtp(to_email: str, subject: str, html_content: str):
    """Sends an email using SMTP with STARTTLS."""
    if not SMTP_USER or not SMTP_PASSWORD or SMTP_USER == "your_email@gmail.com":
        logger.warning(f"SMTP_USER/SMTP_PASSWORD not configured. Outputting email body instead:\nTo: {to_email}\nSubject: {subject}\n")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Pickmatch <{FROM_EMAIL}>"
    msg["To"] = to_email

    msg.attach(MIMEText(html_content, "html", "utf-8"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(FROM_EMAIL, [to_email], msg.as_string())
        logger.info(f"Email sent successfully via SMTP to {to_email}")
    except Exception as e:
        logger.error(f"Failed to send email to {to_email} via SMTP: {e}")

def send_verification_email(to_email: str, code: str):
    """Sends a 6-digit verification code to the user's email."""
    subject = "Verify your Pickmatch account"
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #9966CC; text-align: center;">Welcome to Pickmatch!</h2>
        <p>Thank you for signing up. Please use the verification code below to activate your account:</p>
        <div style="background-color: #f4f4f5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <h1 style="letter-spacing: 5px; color: #333; margin: 0;">{code}</h1>
        </div>
        <p>This code will expire in 15 minutes.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin-top: 40px;">
        <p style="color: #888; font-size: 12px; text-align: center;">The Pickmatch Team</p>
    </div>
    """
    send_email_smtp(to_email, subject, html_content)

def send_password_reset_email(to_email: str, token: str):
    """Sends a password reset link to the user's email."""
    reset_link = f"{FRONTEND_URL}/reset-password?token={token}"
    subject = "Reset your Pickmatch password"
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #9966CC; text-align: center;">Pickmatch Password Reset</h2>
        <p>We received a request to reset your password. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{reset_link}" style="background-color: #9966CC; color: white; padding: 12px 24px; text-decoration: none; border-radius: 25px; font-weight: bold;">Reset Password</a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666; font-size: 14px;">{reset_link}</p>
        <p>This link will expire in 30 minutes.</p>
        <p>If you didn't request a password reset, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin-top: 40px;">
        <p style="color: #888; font-size: 12px; text-align: center;">The Pickmatch Team</p>
    </div>
    """
    send_email_smtp(to_email, subject, html_content)
