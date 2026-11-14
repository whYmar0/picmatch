"""Legacy /share URLs use the current invitation generation and album privacy."""
import os
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from album_access import remember_link_visit
from auth import get_current_user
from database import get_db
from middleware.rate_limit import _get_limit, limiter
from models import Album, User
from routers.albums import _build_analytics, album_to_out
from routers.invitations import owner_album, rotate_links
from schemas import AlbumAnalytics, ShareTokenOut, AlbumWithPhotos

router = APIRouter(prefix="/albums", tags=["Share Link"])
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")


def token_out(album):
    return ShareTokenOut(share_token=album.share_token, share_url=f"{FRONTEND_URL}/share/{album.share_token}")


@router.post("/{album_id}/share-token", response_model=ShareTokenOut)
@limiter.limit(_get_limit("RATE_LIMIT_SHARE_TOKEN_GET", "30/hour"))
async def get_or_create_share_token(request: Request, album_id: str,
                                   current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    album = await owner_album(album_id, current_user, db, lock=True)
    if not album.is_active:
        raise HTTPException(409, "Invitation revoked; explicitly create a new invitation")
    if not album.share_token:
        album.share_token = secrets.token_urlsafe(32)
        await db.commit()
    return token_out(album)


@router.post("/{album_id}/share-token/rotate", response_model=ShareTokenOut)
@limiter.limit(_get_limit("RATE_LIMIT_SHARE_TOKEN_ROTATE", "10/hour"))
async def rotate_share_token(request: Request, album_id: str,
                             current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    album = await owner_album(album_id, current_user, db, lock=True)
    rotate_links(album)
    if not album.share_token:
        album.share_token = secrets.token_urlsafe(32)
    await db.commit()
    return token_out(album)


@router.get("/shared/{token}/analytics", response_model=AlbumAnalytics)
@limiter.limit(_get_limit("RATE_LIMIT_SHARE_ANALYTICS_BY_TOKEN", "30/minute"))
async def get_album_analytics_by_token(request: Request, token: str,
                                      current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    album = await linked_album(token, current_user, db)
    owner = str(album.creator_id) == str(current_user.id)
    return await _build_analytics(album=album, db=db, is_shared=not owner,
                                  can_view_stats=owner or album.is_public, viewer_id=str(current_user.id))


async def linked_album(token, user, db):
    album = await db.scalar(select(Album).options(selectinload(Album.photos), selectinload(Album.creator))
                            .where(or_(Album.share_token == token, Album.invite_code == token), Album.is_active == True).with_for_update())
    if album is None:
        raise HTTPException(404, "Album not found")
    await remember_link_visit(album, user, db)
    return album


@router.get("/shared/{token}", response_model=AlbumWithPhotos)
@limiter.limit(_get_limit("RATE_LIMIT_SHARE_ANALYTICS_BY_TOKEN", "30/minute"))
async def get_album_by_token(request: Request, token: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return album_to_out(await linked_album(token, current_user, db))
