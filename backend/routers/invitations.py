"""Explicit owner controls for the single generation of all album links."""
import os
import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from middleware.rate_limit import _get_limit, limiter
from models import Album, User
from schemas import InvitationOut

router = APIRouter(prefix="/albums", tags=["Invitations"])
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")


def invitation_state(album):
    return InvitationOut(is_active=bool(album.is_active),
                         invite_code=album.invite_code if album.is_active else None,
                         invite_url=f"{FRONTEND_URL}/vote/{album.invite_code}" if album.is_active else None)


def rotate_links(album):
    album.invite_code = secrets.token_urlsafe(16)
    if album.share_token:
        album.share_token = secrets.token_urlsafe(32)
    album.is_active = True


async def owner_album(album_id, user, db, *, lock=False):
    try:
        album_id = str(uuid.UUID(str(album_id)))
    except ValueError:
        raise HTTPException(404, "Album not found or access denied")
    query = select(Album).where(Album.id == album_id, Album.creator_id == str(user.id))
    if lock:
        query = query.with_for_update()
    album = await db.scalar(query)
    if album is None:
        raise HTTPException(404, "Album not found or access denied")
    return album


@router.get("/{album_id}/invitation", response_model=InvitationOut)
async def get_invitation(album_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return invitation_state(await owner_album(album_id, user, db))


@router.post("/{album_id}/invitation", response_model=InvitationOut)
@limiter.limit(_get_limit("RATE_LIMIT_SHARE_TOKEN_GET", "30/hour"))
async def create_invitation(request: Request, album_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    album = await owner_album(album_id, user, db, lock=True)
    if not album.is_active:
        rotate_links(album)
        await db.commit()
    return invitation_state(album)


@router.post("/{album_id}/invitation/rotate", response_model=InvitationOut)
@limiter.limit(_get_limit("RATE_LIMIT_SHARE_TOKEN_ROTATE", "10/hour"))
async def reset_invitation(request: Request, album_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    album = await owner_album(album_id, user, db, lock=True)
    rotate_links(album)
    await db.commit()
    return invitation_state(album)


@router.delete("/{album_id}/invitation", response_model=InvitationOut)
@limiter.limit(_get_limit("RATE_LIMIT_SHARE_TOKEN_ROTATE", "10/hour"))
async def revoke_invitation(request: Request, album_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    album = await owner_album(album_id, user, db, lock=True)
    album.is_active = False
    await db.commit()
    return invitation_state(album)
