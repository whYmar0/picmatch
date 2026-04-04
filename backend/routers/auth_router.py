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
from schemas import UserRegister, UserLogin, UserOut, Token
from auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])

UPLOAD_DIR   = Path(os.getenv("UPLOAD_DIR", "./uploads"))
BASE_URL     = os.getenv("BASE_URL", "http://localhost:8000")
ALLOWED_IMG  = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_AVATAR   = 5 * 1024 * 1024  # 5 MB


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserRegister, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(User).where(User.email == user_data.email))
    if r.scalar_one_or_none():
        raise HTTPException(400, detail="This email is already registered.")

    r = await db.execute(select(User).where(User.username == user_data.username))
    if r.scalar_one_or_none():
        raise HTTPException(400, detail="This username is already taken.")

    user = User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=hash_password(user_data.password),
        role=UserRole.CREATOR,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    return Token(
        access_token=create_access_token(user.id, user.role.value),
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(User).where(User.email == credentials.email))
    user = r.scalar_one_or_none()

    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                            detail="Incorrect email or password.")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            detail="This account has been disabled.")

    return Token(
        access_token=create_access_token(user.id, user.role.value),
        user=UserOut.model_validate(user),
    )


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
