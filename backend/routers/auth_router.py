"""
routers/auth_router.py — Authentication routes
Uses Pydantic v2 model_validate() instead of deprecated from_orm()
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import User
from schemas import UserRegister, UserLogin, UserOut, Token
from auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserRegister, db: AsyncSession = Depends(get_db)):
    """Register a new user and return an access token."""

    # Check email uniqueness
    r = await db.execute(select(User).where(User.email == user_data.email))
    if r.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This email is already registered. Please log in or use a different address.",
        )

    # Check username uniqueness
    r = await db.execute(select(User).where(User.username == user_data.username))
    if r.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This username is already taken. Please choose another one.",
        )

    user = User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=hash_password(user_data.password),
        role=user_data.role,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    return Token(
        access_token=create_access_token(user.id, user.role.value),
        user=UserOut.model_validate(user),          # ← Pydantic v2
    )


@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    """
    Authenticate and return a token.
    Returns 401 with a specific message — NOT 422 — so the frontend
    can display the correct inline error to the user.
    """
    r = await db.execute(select(User).where(User.email == credentials.email))
    user = r.scalar_one_or_none()

    # Deliberate: same message for "not found" and "wrong password"
    # to avoid user-enumeration attacks
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password. Please try again.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been disabled. Please contact support.",
        )

    return Token(
        access_token=create_access_token(user.id, user.role.value),
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    """Returns the currently authenticated user's profile."""
    return UserOut.model_validate(current_user)
