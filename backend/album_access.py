"""Current-link admission shared by album resources; old participation is not a grant."""
import hashlib
import secrets

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from models import SharedAccess


def link_version(album):
    return hashlib.sha256(album.invite_code.encode("utf-8")).hexdigest()


async def has_album_access(album, user, db):
    if not user or not user.is_active or not user.is_verified:
        return False
    if str(album.creator_id) == str(user.id):
        return True
    if not album.is_active:
        return False
    return await db.scalar(select(SharedAccess.id).where(
        SharedAccess.album_id == str(album.id), SharedAccess.user_id == str(user.id),
        SharedAccess.link_version == link_version(album))) is not None


async def require_album_access(album, user, db, *, code=None, status_code=404):
    if code and album.is_active and secrets.compare_digest(
            album.invite_code.encode("utf-8"), code.encode("utf-8")):
        return
    if not await has_album_access(album, user, db):
        raise HTTPException(status_code, "Album not found or link revoked")


async def remember_link_visit(album, user, db):
    """Caller holds the Album row lock shared with invitation mutation."""
    if not user or not user.is_active or not user.is_verified or str(album.creator_id) == str(user.id):
        return
    query = select(SharedAccess).where(SharedAccess.album_id == str(album.id),
                                       SharedAccess.user_id == str(user.id))
    access = await db.scalar(query)
    if access is None:
        try:
            async with db.begin_nested():
                access = SharedAccess(album_id=str(album.id), user_id=str(user.id),
                                      can_view_stats=album.is_public, link_version=link_version(album))
                db.add(access)
                await db.flush()
        except IntegrityError:
            access = await db.scalar(query)
            if access is None:
                raise
    access.link_version = link_version(album)
    access.can_view_stats = album.is_public
    await db.commit()
