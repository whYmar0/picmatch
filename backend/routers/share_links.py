"""
routers/share_links.py — Token-protected share links for album analytics.

Owners generate a single stable per-album token. Whoever holds the link can
view the album's analytics after authenticating to Pickmatch. New visitors
get a SharedAccess row auto-created so the album shows up in their
"Shared with me" list on the dashboard.

URL shape (matches share-analytics-spec.md §3):
    GET  /api/albums/shared/<share_token>/analytics
    POST /api/albums/<album_id>/share-token            (lazy-generate)
    POST /api/albums/<album_id>/share-token/rotate    (rotate)
"""
import os
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError

from database import get_db
from models import User, Album, SharedAccess
from schemas import AlbumAnalytics, ShareTokenOut
from auth import get_current_user
from routers.albums import _build_analytics, _s

router = APIRouter(prefix="/albums", tags=["Share Link"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")


def _share_url(token: str) -> str:
    """Build the public share URL for the given token."""
    return f"{FRONTEND_URL}/share/{token}"


# ─── Lazy-generate / fetch token ──────────────────────────────────────────────

@router.post("/{album_id}/share-token", response_model=ShareTokenOut)
async def get_or_create_share_token(
    album_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Idempotent: returns the existing token if one already exists, otherwise
    generates a fresh `secrets.token_urlsafe(32)` and persists it.

    Auth: must be the album owner.
    """
    album_res = await db.execute(
        select(Album).where(and_(Album.id == album_id,
                                 Album.creator_id == _s(current_user.id)))
    )
    album = album_res.scalar_one_or_none()
    if not album:
        raise HTTPException(404, detail="Album not found or access denied")

    if not album.share_token:
        # ~256 bits of entropy; URL-safe; fits comfortably in String(64)
        album.share_token = secrets.token_urlsafe(32)
        await db.commit()
        await db.refresh(album)

    return ShareTokenOut(
        share_token=album.share_token,
        share_url=_share_url(album.share_token),
    )


# ─── Rotate token ────────────────────────────────────────────────────────────

@router.post("/{album_id}/share-token/rotate", response_model=ShareTokenOut)
async def rotate_share_token(
    album_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Invalidates the current share token and replaces it with a new one.
    Existing SharedAccess rows are preserved — visitors who previously opened
    the old link keep their dashboard entry. Only new visits require the new
    token.
    """
    album_res = await db.execute(
        select(Album).where(and_(Album.id == album_id,
                                 Album.creator_id == _s(current_user.id)))
    )
    album = album_res.scalar_one_or_none()
    if not album:
        raise HTTPException(404, detail="Album not found or access denied")

    album.share_token = secrets.token_urlsafe(32)
    await db.commit()
    await db.refresh(album)

    return ShareTokenOut(
        share_token=album.share_token,
        share_url=_share_url(album.share_token),
    )


# ─── Public analytics-by-token endpoint ──────────────────────────────────────

@router.get("/shared/{token}/analytics", response_model=AlbumAnalytics)
async def get_album_analytics_by_token(
    token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Authenticated visitors with a valid share token get the same analytics
    the owner sees. A SharedAccess row is auto-upserted so the album shows
    up in their "Shared with me" dashboard section.

    Errors:
        401 — no JWT (frontend handles via ProtectedRoute + returnTo)
        404 — invalid token OR album was deleted (no existence leak)
    """
    album_res = await db.execute(
        select(Album)
        .options(selectinload(Album.photos), selectinload(Album.creator))
        .where(Album.share_token == token)
    )
    album = album_res.scalar_one_or_none()
    if not album:
        # Don't distinguish "token never existed" from "album deleted" —
        # an attacker can't probe album existence.
        raise HTTPException(404, detail="Album not found")

    # Auto-upsert SharedAccess (idempotent). We do NOT touch created_at if a
    # row already exists — first-visit info must survive subsequent opens.
    if _s(album.creator_id) != _s(current_user.id):
        existing = await db.execute(
            select(SharedAccess).where(
                and_(SharedAccess.user_id == _s(current_user.id),
                     SharedAccess.album_id == _s(album.id))
            )
        )
        if not existing.scalar_one_or_none():
            try:
                db.add(SharedAccess(
                    user_id=_s(current_user.id),
                    album_id=_s(album.id),
                    can_view_stats=True,
                ))
                await db.commit()
            except IntegrityError:
                # Race: another concurrent request inserted the same row.
                # That's fine — the upsert is idempotent.
                await db.rollback()
            # Other DB errors must propagate — do not mask real bugs.

    return await _build_analytics(
        album=album,
        db=db,
        is_shared=True,
        can_view_stats=True,
    )
