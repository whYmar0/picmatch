"""
routers/votes.py — Маршруты голосования / Voting routes

BUGFIX: All UUID comparisons now cast to str() before querying SQLite.
        SQLite stores UUIDs as String(36); Pydantic v2 parses them as UUID
        objects; comparing UUID == String silently returns no rows in SQLite.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from database import get_db
from models import User, Photo, Vote, Album
from schemas import VoteCreate, VoteOut, SwipeSession
from auth import get_current_user

router = APIRouter(prefix="/votes", tags=["Votes"])


def _str(val) -> str:
    """Normalise UUID / string to plain str for SQLite-safe comparisons."""
    return str(val)


@router.post("/", response_model=VoteOut, status_code=status.HTTP_201_CREATED)
async def cast_vote(
    vote_data: VoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Голосует за фотографию. Повторный голос обновляет предыдущий.
    Votes on a photo. Re-voting updates the previous vote.

    BUG FIXED: photo_id and voter_id are cast to str() before SQL WHERE clause
    so that SQLite String columns compare correctly with UUID objects from Pydantic.
    """
    photo_id_str = _str(vote_data.photo_id)
    voter_id_str = _str(current_user.id)

    # Verify the photo exists
    result = await db.execute(
        select(Photo).where(Photo.id == photo_id_str)
    )
    photo = result.scalar_one_or_none()

    if not photo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Photo not found. Check that the photo ID is correct.",
        )

    # Check for an existing vote from this voter on this photo
    result = await db.execute(
        select(Vote).where(
            and_(
                Vote.photo_id == photo_id_str,
                Vote.voter_id == voter_id_str,
            )
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Update in place — swipe changed from like to dislike or vice-versa
        existing.is_like = vote_data.is_like
        await db.flush()
        await db.refresh(existing)
        return VoteOut.model_validate(existing)

    vote = Vote(
        photo_id=photo_id_str,
        voter_id=voter_id_str,
        is_like=vote_data.is_like,
    )
    db.add(vote)
    await db.flush()
    await db.refresh(vote)
    return VoteOut.model_validate(vote)


@router.get("/session/{invite_code}", response_model=SwipeSession)
async def get_swipe_session(
    invite_code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns which photos the current voter has already voted on,
    so the swipe UI can resume from where they left off.
    """
    result = await db.execute(
        select(Album).where(
            and_(Album.invite_code == invite_code, Album.is_active == True)  # noqa: E712
        )
    )
    album = result.scalar_one_or_none()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found / Альбом не найден")

    result = await db.execute(
        select(Photo).where(Photo.album_id == _str(album.id)).order_by(Photo.order)
    )
    photos = result.scalars().all()
    photo_ids = [p.id for p in photos]  # already strings from SQLite

    voter_id_str = _str(current_user.id)

    if photo_ids:
        result = await db.execute(
            select(Vote).where(
                and_(
                    Vote.voter_id == voter_id_str,
                    Vote.photo_id.in_(photo_ids),
                )
            )
        )
        voted = result.scalars().all()
        voted_ids = [v.photo_id for v in voted]
    else:
        voted_ids = []

    return SwipeSession(
        album_id=album.id,
        voted_photo_ids=voted_ids,
        total_photos=len(photos),
        voted_count=len(voted_ids),
        is_complete=len(voted_ids) >= len(photos),
    )


@router.get("/album/{album_id}/my-votes", response_model=List[VoteOut])
async def get_my_votes(
    album_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns all votes cast by the current user within a specific album."""
    result = await db.execute(
        select(Photo.id).where(Photo.album_id == album_id)
    )
    photo_ids = result.scalars().all()
    if not photo_ids:
        return []

    result = await db.execute(
        select(Vote).where(
            and_(
                Vote.voter_id == _str(current_user.id),
                Vote.photo_id.in_(photo_ids),
            )
        )
    )
    votes = result.scalars().all()
    return [VoteOut.model_validate(v) for v in votes]
