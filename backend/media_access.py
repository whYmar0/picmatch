"""Album media identities, permissions and narrowly scoped browser tickets."""
import os
import secrets
from datetime import datetime, timezone
from urllib.parse import quote, urlencode

import jwt
from fastapi import HTTPException
from sqlalchemy import select

from auth import SECRET_KEY
from models import User
from album_access import require_album_access, link_version

MEDIA_AUDIENCE = "pickmatch-media"
TICKET_SECONDS = 300


def media_url(photo_id, *, variant="display", ticket=None, media_type="image", invite=None):
    base = os.getenv("BASE_URL", "http://localhost:8000").rstrip("/")
    query = {"variant": variant}
    if media_type == "video":
        query["media_type"] = "video"
    if ticket:
        query["ticket"] = ticket
    if invite:
        query["invite"] = invite
    return f"{base}/api/media/{quote(str(photo_id), safe='')}?{urlencode(query)}"


async def require_album_media_access(album, user, db, *, code=None):
    await require_album_access(album, user, db, code=code)


def issue_media_ticket(user, photo_id, variant, *, album):
    now = int(datetime.now(timezone.utc).timestamp())
    claims = {"aud": MEDIA_AUDIENCE, "sub": str(user.id), "photo": str(photo_id),
              "variant": variant, "pwd_version": int(user.password_version),
              "iat": now, "exp": now + TICKET_SECONDS, "jti": secrets.token_urlsafe(12),
              "link_version": "owner" if str(album.creator_id) == str(user.id) else link_version(album)}
    return jwt.encode(claims, SECRET_KEY, algorithm="HS256"), claims["exp"]


async def media_ticket_user(token, photo_id, variant, db, *, album):
    try:
        claims = jwt.decode(token, SECRET_KEY, algorithms=["HS256"], audience=MEDIA_AUDIENCE,
                            options={"require": ["aud", "sub", "photo", "variant", "pwd_version", "iat", "exp", "jti", "link_version"]})
        if (claims["aud"] != MEDIA_AUDIENCE or claims["photo"] != str(photo_id)
                or claims["variant"] != variant or not isinstance(claims["sub"], str)
                or type(claims["pwd_version"]) is not int
                or type(claims["iat"]) is not int or type(claims["exp"]) is not int
                or not 0 < claims["exp"] - claims["iat"] <= TICKET_SECONDS):
            raise ValueError("Invalid scope")
        user = await db.scalar(select(User).where(User.id == claims["sub"]))
        if (not user or not user.is_active or not user.is_verified
                or int(user.password_version) != claims["pwd_version"]):
            raise ValueError("Revoked user")
        expected = "owner" if str(album.creator_id) == str(user.id) else link_version(album)
        if claims["link_version"] != expected:
            raise ValueError("Revoked link")
        return user
    except (jwt.InvalidTokenError, ValueError, TypeError, KeyError):
        raise HTTPException(404, "Media not found")
