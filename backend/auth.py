"""
JWT and password utilities.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError as JWTError
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User

# Ensure .env values are loaded before we read SECRET_KEY, regardless of
# whether `database.py` has already been imported. Idempotent.
load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY environment variable is required and must be set. "
        "Generate one with:\n"
        "    python -c 'import secrets; print(secrets.token_urlsafe(32))'\n"
        "and place it in your .env file (see .env.example)."
    )
# HS256's security collapses below ~32 bytes of entropy — anything shorter
# is offline-brute-forceable. Reject obviously weak secrets at startup so a
# developer-typed string like "changeme" can't accidentally become prod.
# NOTE: this is a length floor, not an entropy check. A 60-char memorable
# string passes it but provides trivial entropy. Always generate with
# `python -c 'import secrets; print(secrets.token_urlsafe(32))'`.
if len(SECRET_KEY.encode("utf-8")) < 32:
    raise RuntimeError(
        "SECRET_KEY must be at least 32 bytes long. "
        "Use: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user: User) -> str:
    """
    Issue a JWT bound to a specific (user, password_version).

    `pwd_version` is checked in `get_current_user` so that a JWT becomes
    invalid as soon as the user's password changes (reset-password, manual
    bump for "log out everywhere").
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "role": user.role.value,
        "pwd_version": int(user.password_version),
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "iat": now,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_token(credentials.credentials)
    if not payload:
        raise exc

    user_id = payload.get("sub")
    if not user_id:
        raise exc

    # Tokens issued before pwd_version was introduced don't carry the claim;
    # `get` with default 0 is safe because every fresh user has version 0.
    token_pwd_version = payload.get("pwd_version", 0)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise exc

    # Password was reset (or admin bumped the version) since this JWT was
    # issued — invalidate it. Forces a re-login.
    if int(user.password_version) != int(token_pwd_version):
        raise exc

    return user


async def get_creator_user(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role.value != "creator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Creators only",
        )
    return current_user
