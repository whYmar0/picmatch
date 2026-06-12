"""
routers/auth_router.py — Auth + Avatar Upload
"""
import os, uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import User, UserRole
from schemas import (
    UserRegister, UserLogin, UserOut, Token, 
    VerifyEmailRequest, ForgotPasswordRequest, ResetPasswordRequest, ResendVerificationRequest
)
from auth import hash_password, verify_password, create_access_token, get_current_user
from email_utils import send_verification_email, send_password_reset_email
import random
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/auth", tags=["Authentication"])

UPLOAD_DIR   = Path(os.getenv("UPLOAD_DIR", "./uploads"))
BASE_URL     = os.getenv("BASE_URL", "http://localhost:8000")
ALLOWED_IMG  = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_AVATAR   = 5 * 1024 * 1024  # 5 MB

def generate_verification_code() -> str:
    return str(random.randint(100000, 999999))

def get_now():
    return datetime.now(timezone.utc)

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(user_data: UserRegister, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(User).where(User.email == user_data.email))
    if r.scalar_one_or_none():
        raise HTTPException(400, detail="This email is already registered.")

    r = await db.execute(select(User).where(User.username == user_data.username))
    if r.scalar_one_or_none():
        raise HTTPException(400, detail="This username is already taken.")

    code = generate_verification_code()
    expires_at = get_now() + timedelta(minutes=15)

    user = User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=hash_password(user_data.password),
        role=UserRole.CREATOR,
        is_verified=False,
        verification_code=code,
        verification_code_expires_at=expires_at
    )
    db.add(user)
    await db.flush()

    # Send email in background (or inline for simplicity)
    # send_verification_email(user.email, code)

    return {"message": "User registered successfully. Please verify your email.", "requires_verification": True}


@router.post("/login")
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(User).where(User.email == credentials.email))
    user = r.scalar_one_or_none()

    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                            detail="Incorrect email or password.")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            detail="This account has been disabled.")
    if not user.is_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            detail="Email not verified. Please verify your email first.")

    return Token(
        access_token=create_access_token(user.id, user.role.value),
        user=UserOut.model_validate(user),
    )

@router.post("/verify-email")
async def verify_email(req: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(User).where(User.email == req.email))
    user = r.scalar_one_or_none()
    
    if not user:
        raise HTTPException(404, detail="User not found.")
    if user.is_verified:
        raise HTTPException(400, detail="Email is already verified.")
    if user.verification_code != req.code:
        raise HTTPException(400, detail="Invalid verification code.")
    if user.verification_code_expires_at and user.verification_code_expires_at < get_now():
        raise HTTPException(400, detail="Verification code has expired. Please request a new one.")
        
    user.is_verified = True
    user.verification_code = None
    user.verification_code_expires_at = None
    await db.flush()
    return {"message": "Email verified successfully. You can now log in."}

@router.post("/resend-verification")
async def resend_verification(req: ResendVerificationRequest, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(User).where(User.email == req.email))
    user = r.scalar_one_or_none()
    
    if not user:
        raise HTTPException(404, detail="User not found.")
    if user.is_verified:
        raise HTTPException(400, detail="Email is already verified.")
        
    code = generate_verification_code()
    expires_at = get_now() + timedelta(minutes=15)
    
    user.verification_code = code
    user.verification_code_expires_at = expires_at
    await db.flush()
    
    # send_verification_email(user.email, code)
    return {"message": "A new verification code has been sent to your email."}

@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(User).where(User.email == req.email))
    user = r.scalar_one_or_none()
    
    if user:
        token = str(uuid.uuid4())
        user.reset_token = token
        user.reset_token_expires_at = get_now() + timedelta(minutes=30)
        await db.flush()
        
        send_password_reset_email(user.email, token)
        
    return {"message": "If that email is registered, we have sent a password reset link."}

@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(User).where(User.reset_token == req.token))
    user = r.scalar_one_or_none()
    
    if not user:
        raise HTTPException(400, detail="Invalid reset token.")
    if user.reset_token_expires_at and user.reset_token_expires_at < get_now():
        raise HTTPException(400, detail="Reset token has expired.")
        
    user.hashed_password = hash_password(req.password)
    user.reset_token = None
    user.reset_token_expires_at = None
    await db.flush()
    
    return {"message": "Password reset successfully. You can now log in."}


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.post("/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload / replace the current user's profile picture."""
    if file.content_type not in ALLOWED_IMG:
        raise HTTPException(400, detail="Only JPEG, PNG, WebP images are allowed.")

    content = await file.read()
    if len(content) > MAX_AVATAR:
        raise HTTPException(400, detail="Avatar must be under 5 MB.")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext    = Path(file.filename or "avatar").suffix.lower() or ".jpg"
    stored = f"avatar_{uuid.uuid4()}{ext}"
    with open(UPLOAD_DIR / stored, "wb") as f:
        f.write(content)

    # Delete old avatar file if it was a local one
    if current_user.avatar_url and "/uploads/" in current_user.avatar_url:
        old_name = current_user.avatar_url.split("/uploads/")[-1]
        old_path = UPLOAD_DIR / old_name
        if old_path.exists():
            old_path.unlink()

    current_user.avatar_url = f"{BASE_URL}/uploads/{stored}"
    await db.flush()
    await db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.delete("/avatar", response_model=UserOut)
async def delete_avatar(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove the current user's profile picture."""
    if current_user.avatar_url and "/uploads/" in current_user.avatar_url:
        old_name = current_user.avatar_url.split("/uploads/")[-1]
        old_path = UPLOAD_DIR / old_name
        if old_path.is_file():
            old_path.unlink()

    current_user.avatar_url = None
    await db.flush()
    await db.refresh(current_user)
    return UserOut.model_validate(current_user)
