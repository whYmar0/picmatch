import os
import resend
from dotenv import load_dotenv
import logging

load_dotenv()

resend.api_key = os.getenv("RESEND_API_KEY", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@pickmatch.site")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

logger = logging.getLogger(__name__)

def send_verification_email(to_email: str, code: str):
    """Sends a 6-digit verification code to the user's email using Resend API."""
    if not resend.api_key:
        logger.warning(f"RESEND_API_KEY not set. Would have sent code {code} to {to_email}")
        return

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
    
    try:
        r = resend.Emails.send({
            "from": f"Pickmatch <{FROM_EMAIL}>",
            "to": to_email,
            "subject": subject,
            "html": html_content
        })
        logger.info(f"Verification email sent to {to_email} via Resend: {r}")
    except Exception as e:
        logger.error(f"Failed to send verification email to {to_email} via Resend: {e}")

def send_password_reset_email(to_email: str, token: str):
    """Sends a password reset link to the user's email using Resend API."""
    if not resend.api_key:
        logger.warning(f"RESEND_API_KEY not set. Would have sent reset token {token} to {to_email}")
        return

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
    
    try:
        r = resend.Emails.send({
            "from": f"Pickmatch <{FROM_EMAIL}>",
            "to": to_email,
            "subject": subject,
            "html": html_content
        })
        logger.info(f"Password reset email sent to {to_email} via Resend: {r}")
    except Exception as e:
        logger.error(f"Failed to send password reset email to {to_email} via Resend: {e}")
