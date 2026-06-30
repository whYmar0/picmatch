"""
routers/auth_router.py - Auth + Avatar Upload
"""
import os, io
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from PIL import Image

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, Form, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from auth import create_access_token, get_current_user, hash_password, verify_password
from database import get_db
from email_utils import send_password_reset_email, send_verification_email
from models import User, UserRole
from schemas import (
    ForgotPasswordRequest,
    MessageResponse,
    ResetPasswordRequest,
    ResendVerificationRequest,
    Token,
    UserLogin,
    UserOut,
    UserRegister,
    VerifyEmailRequest,
)
from cloudinary_utils import (
    is_cloudinary_configured as _cloudinary_enabled,
    upload_image as _cloudinary_upload,
    delete_image as _cloudinary_delete,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

BASE_DIR = Path(__file__).resolve().parent.parent
raw_upload_dir = os.getenv("UPLOAD_DIR", "./uploads")
if Path(raw_upload_dir).is_absolute():
    UPLOAD_DIR = Path(raw_upload_dir)
else:
    UPLOAD_DIR = BASE_DIR / raw_upload_dir
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000").rstrip("/")
ALLOWED_IMG = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_AVATAR = 5 * 1024 * 1024


def generate_verification_code() -> str:
    return f"{random.randint(0, 999999):06d}"


def get_now() -> datetime:
    return datetime.now(timezone.utc)


def _make_aware(dt: datetime | None) -> datetime | None:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def _commit_or_conflict(db: AsyncSession) -> None:
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="A user with this email or username already exists.") from exc


AVATAR_COLORS = ["purple", "green", "yellow", "orange", "pink", "blue"]


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserRegister,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    code = generate_verification_code()
    expires_at = get_now() + timedelta(minutes=15)

    existing_by_email = (
        await db.execute(select(User).where(User.email == user_data.email))
    ).scalar_one_or_none()
    existing_by_username = (
        await db.execute(select(User).where(User.username == user_data.username))
    ).scalar_one_or_none()

    if existing_by_email and existing_by_email.is_verified:
        raise HTTPException(status_code=400, detail="This email is already registered.")
    if existing_by_username and existing_by_username.is_verified:
        raise HTTPException(status_code=400, detail="This username is already taken.")
    if existing_by_username and existing_by_username.email != user_data.email:
        raise HTTPException(status_code=400, detail="This username is already taken. Please choose another.")

    try:
        if existing_by_email:
            user = existing_by_email
            user.username = user_data.username
            user.hashed_password = hash_password(user_data.password)
            user.role = UserRole.CREATOR
            user.is_verified = False
            user.verification_code = code
            user.verification_code_expires_at = expires_at
            await db.flush()
        else:
            user = User(
                email=user_data.email,
                username=user_data.username,
                hashed_password=hash_password(user_data.password),
                role=UserRole.CREATOR,
                is_verified=False,
                verification_code=code,
                verification_code_expires_at=expires_at,
                avatar_color=random.choice(AVATAR_COLORS),
            )
            db.add(user)
            await db.flush()
        await _commit_or_conflict(db)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="A user with this email or username already exists.") from exc

    # Send verification email in the background
    background_tasks.add_task(send_verification_email, user.email, code)

    return {
        "access_token": create_access_token(user.id, user.role.value),
        "token_type": "bearer",
        "user": UserOut.model_validate(user),
        "message": "Account created. Please check your email for the verification code.",
        "requires_verification": True,
    }


@router.post("/login")
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    user = (
        await db.execute(select(User).where(User.email == credentials.email))
    ).scalar_one_or_none()

    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password.")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account has been disabled.")
    if not user.is_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email not verified. Please verify your email first.")

    return Token(access_token=create_access_token(user.id, user.role.value), user=UserOut.model_validate(user))


@router.post("/verify-email")
async def verify_email(req: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == req.email))).scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.is_verified:
        raise HTTPException(status_code=400, detail="Email is already verified.")
    if user.verification_code != req.code:
        raise HTTPException(status_code=400, detail="Invalid verification code.")
    expires_at = _make_aware(user.verification_code_expires_at)
    if expires_at and expires_at < get_now():
        raise HTTPException(status_code=400, detail="Verification code has expired. Please request a new one.")

    user.is_verified = True
    user.verification_code = None
    user.verification_code_expires_at = None
    await _commit_or_conflict(db)
    return {"message": "Email verified successfully. You can now log in."}


@router.post("/resend-verification")
async def resend_verification(req: ResendVerificationRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == req.email))).scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.is_verified:
        raise HTTPException(status_code=400, detail="Email is already verified.")

    code = generate_verification_code()
    user.verification_code = code
    user.verification_code_expires_at = get_now() + timedelta(minutes=15)
    await _commit_or_conflict(db)
    background_tasks.add_task(send_verification_email, user.email, code)
    return {"message": "A new verification code has been sent to your email."}


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == req.email))).scalar_one_or_none()

    if user:
        token = str(uuid.uuid4())
        user.reset_token = token
        user.reset_token_expires_at = get_now() + timedelta(minutes=30)
        await _commit_or_conflict(db)
        # Run email in background to avoid blocking the response
        background_tasks.add_task(send_password_reset_email, user.email, token)

    return {"message": "If that email is registered, we have sent a password reset link."}


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.reset_token == req.token))).scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid reset token.")
    expires_at = _make_aware(user.reset_token_expires_at)
    if expires_at and expires_at < get_now():
        raise HTTPException(status_code=400, detail="Reset token has expired.")

    user.hashed_password = hash_password(req.password)
    user.reset_token = None
    user.reset_token_expires_at = None
    await _commit_or_conflict(db)
    await db.refresh(user)
    return {
        "message": "Password reset successfully.",
        "access_token": create_access_token(user.id, user.role.value),
        "token_type": "bearer",
        "user": UserOut.model_validate(user),
    }


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.post("/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ALLOWED_IMG:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP images are allowed.")

    content = await file.read()
    if len(content) > MAX_AVATAR:
        raise HTTPException(status_code=400, detail="Avatar must be under 5 MB.")

    try:
        img = Image.open(io.BytesIO(content))
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        img.thumbnail((400, 400), Image.Resampling.LANCZOS)
        out_io = io.BytesIO()
        img.save(out_io, format="JPEG", quality=80, optimize=True)
        content = out_io.getvalue()
    except Exception:
        pass

    stored = f"picmatch/avatar_{uuid.uuid4()}"

    if _cloudinary_enabled():
        url = _cloudinary_upload(content, public_id=stored)
        # Delete old avatar from Cloudinary
        if current_user.avatar_url:
            _cloudinary_delete(current_user.avatar_url)
        current_user.avatar_url = url
    else:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        local_name = f"{stored.replace('picmatch/', '')}.jpg"
        with open(UPLOAD_DIR / local_name, "wb") as f:
            f.write(content)
        # Delete old avatar from local
        if current_user.avatar_url and "/uploads/" in current_user.avatar_url:
            old_name = current_user.avatar_url.split("/uploads/")[-1]
            old_path = UPLOAD_DIR / old_name
            if old_path.exists():
                old_path.unlink()
        current_user.avatar_url = f"{BASE_URL}/uploads/{local_name}"
    await _commit_or_conflict(db)
    await db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.delete("/avatar", response_model=UserOut)
async def delete_avatar(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.avatar_url:
        if _cloudinary_enabled():
            _cloudinary_delete(current_user.avatar_url)
        elif "/uploads/" in current_user.avatar_url:
            old_name = current_user.avatar_url.split("/uploads/")[-1]
            old_path = UPLOAD_DIR / old_name
            if old_path.is_file():
                old_path.unlink()

    current_user.avatar_url = None
    await _commit_or_conflict(db)
    await db.refresh(current_user)
    return UserOut.model_validate(current_user)
