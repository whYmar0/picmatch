"""
routers/shared_access.py — Shared Access System
Creator can grant another user read-only access to an album's analytics.
Shared user sees the album in a "Shared with me" section on their dashboard.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload

from database import get_db
from models import User, Album, SharedAccess, Photo
from schemas import (
    ShareAlbumRequest, SharedAccessOut, SharedAlbumOut,
    AlbumOut, PhotoOut, MessageResponse
)
from auth import get_current_user
from routers.albums import album_to_out, _s

router = APIRouter(prefix="/shared", tags=["Shared Access"])


@router.post("/albums/{album_id}/share", response_model=SharedAccessOut,
             status_code=status.HTTP_201_CREATED)
async def share_album(
    album_id: str,
    body: ShareAlbumRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Creator shares an album with another user (by username or email)."""
    # Verify the album belongs to the current user
    album_res = await db.execute(
        select(Album).where(and_(Album.id == album_id,
                                 Album.creator_id == _s(current_user.id)))
    )
    album = album_res.scalar_one_or_none()
    if not album:
        raise HTTPException(404, detail="Album not found or access denied")

    # Find the target user
    target_res = await db.execute(
        select(User).where(
            or_(User.username == body.username_or_email,
                User.email == body.username_or_email)
        )
    )
    target = target_res.scalar_one_or_none()
    if not target:
        raise HTTPException(404, detail="User not found")
    if _s(target.id) == _s(current_user.id):
        raise HTTPException(400, detail="You cannot share an album with yourself")

    # Upsert shared access
    existing = await db.execute(
        select(SharedAccess).where(
            and_(SharedAccess.user_id == _s(target.id),
                 SharedAccess.album_id == album_id)
        )
    )
    access = existing.scalar_one_or_none()
    if access:
        access.can_view_stats = body.can_view_stats
    else:
        access = SharedAccess(
            user_id=_s(target.id),
            album_id=album_id,
            can_view_stats=body.can_view_stats,
        )
        db.add(access)

    try:
        await db.flush()
        await db.commit()
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="This album is already shared with that user.") from exc

    await db.refresh(access)

    # Reload with user
    result = await db.execute(
        select(SharedAccess)
        .options(selectinload(SharedAccess.user))
        .where(SharedAccess.id == _s(access.id))
    )
    return SharedAccessOut.model_validate(result.scalar_one())


@router.get("/albums/{album_id}/shares", response_model=List[SharedAccessOut])
async def list_shares(
    album_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all users this album is shared with."""
    # Must be album owner
    album_res = await db.execute(
        select(Album).where(and_(Album.id == album_id,
                                 Album.creator_id == _s(current_user.id)))
    )
    if not album_res.scalar_one_or_none():
        raise HTTPException(404, detail="Album not found or access denied")

    result = await db.execute(
        select(SharedAccess)
        .options(selectinload(SharedAccess.user))
        .where(SharedAccess.album_id == album_id)
    )
    return [SharedAccessOut.model_validate(a) for a in result.scalars().all()]


@router.delete("/albums/{album_id}/shares/{access_id}", response_model=MessageResponse)
async def revoke_share(
    album_id: str,
    access_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove shared access (only album owner can revoke)."""
    # Must be album owner
    album_res = await db.execute(
        select(Album).where(and_(Album.id == album_id,
                                 Album.creator_id == _s(current_user.id)))
    )
    if not album_res.scalar_one_or_none():
        raise HTTPException(404, detail="Album not found or access denied")

    result = await db.execute(
        select(SharedAccess).where(
            and_(SharedAccess.id == access_id, SharedAccess.album_id == album_id)
        )
    )
    access = result.scalar_one_or_none()
    if not access:
        raise HTTPException(404, detail="Shared access not found")

    await db.delete(access)
    await db.commit()
    return MessageResponse(message="Access revoked")


@router.get("/with-me", response_model=List[SharedAlbumOut])
async def shared_with_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Albums that other users have shared with the current user."""
    result = await db.execute(
        select(SharedAccess)
        .options(
            selectinload(SharedAccess.album)
            .selectinload(Album.photos),
            selectinload(SharedAccess.album)
            .selectinload(Album.creator),
        )
        .where(SharedAccess.user_id == _s(current_user.id))
        .order_by(SharedAccess.created_at.desc())
    )
    accesses = result.scalars().all()
    out = []
    for acc in accesses:
        base = album_to_out(acc.album)
        out.append(SharedAlbumOut(**base.model_dump(), can_view_stats=acc.can_view_stats))
    return out
