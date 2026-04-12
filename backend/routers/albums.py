"""
routers/albums.py — Album management routes
Updated: analytics endpoint allows shared users (can_view_stats=True) to view.
"""
import os, uuid, secrets
from typing import List
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload

from database import get_db
from models import User, Album, Photo, Vote, SharedAccess
from schemas import (
    AlbumOut, AlbumWithPhotos, AlbumAnalytics,
    PhotoStats, PhotoOut, MessageResponse,
    VoterReaction, VoterSummary,
)
from auth import get_current_user

router = APIRouter(prefix="/albums", tags=["Albums"])

# Optional auth dependency — does NOT raise 401 if no token present
_bearer = HTTPBearer(auto_error=False)

async def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Returns the current user if a valid token is provided, else None."""
    if not credentials:
        return None
    from auth import decode_token
    payload = decode_token(credentials.credentials)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    from sqlalchemy import select as sa_select
    result = await db.execute(sa_select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    return user if (user and user.is_active) else None

UPLOAD_DIR   = Path(os.getenv("UPLOAD_DIR", "./uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
BASE_URL     = os.getenv("BASE_URL",     "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def _s(v) -> str:
    return str(v)

def photo_url(stored: str) -> str:
    return f"{BASE_URL}/uploads/{stored}"

def photo_to_out(p: Photo) -> PhotoOut:
    return PhotoOut(id=p.id, filename=p.filename,
                    url=photo_url(p.stored_filename),
                    order=p.order, created_at=p.created_at)

def album_to_out(album: Album) -> AlbumOut:
    return AlbumOut(
        id=album.id, title=album.title, description=album.description,
        invite_code=album.invite_code,
        invite_url=f"{FRONTEND_URL}/vote/{album.invite_code}",
        is_active=album.is_active,
        photo_count=len(album.photos),
        created_at=album.created_at,
        creator=album.creator,
        photos=[photo_to_out(p) for p in album.photos],
    )


@router.post("/", response_model=AlbumWithPhotos, status_code=status.HTTP_201_CREATED)
async def create_album(
    title: str = Form(...),
    description: str = Form(None),
    photos: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not photos:
        raise HTTPException(400, detail="At least one photo is required")
    if len(photos) > 50:
        raise HTTPException(400, detail="Maximum 50 photos per album")

    album = Album(title=title, description=description,
                  invite_code=secrets.token_urlsafe(16),
                  creator_id=_s(current_user.id))
    db.add(album)
    await db.flush()

    for idx, f in enumerate(photos):
        if f.content_type not in ALLOWED_TYPES:
            raise HTTPException(400, detail=f"'{f.content_type}' not allowed")
        ext = Path(f.filename or "photo").suffix.lower() or ".jpg"
        stored = f"{uuid.uuid4()}{ext}"
        content = await f.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(400, detail=f"'{f.filename}' exceeds 10 MB")
        with open(UPLOAD_DIR / stored, "wb") as out:
            out.write(content)
        db.add(Photo(album_id=_s(album.id), filename=f.filename or stored,
                     stored_filename=stored, order=idx))

    await db.flush()
    result = await db.execute(
        select(Album)
        .options(selectinload(Album.photos), selectinload(Album.creator))
        .where(Album.id == _s(album.id))
    )
    return album_to_out(result.scalar_one())


@router.get("/my", response_model=List[AlbumOut])
async def get_my_albums(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Album)
        .options(selectinload(Album.photos), selectinload(Album.creator))
        .where(Album.creator_id == _s(current_user.id))
        .order_by(Album.created_at.desc())
    )
    return [album_to_out(a) for a in result.scalars().all()]


@router.get("/invite/{invite_code}", response_model=AlbumWithPhotos)
async def get_album_by_invite(
    invite_code: str,
    # Public endpoint — works with or without a token
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Album)
        .options(selectinload(Album.photos), selectinload(Album.creator))
        .where(and_(Album.invite_code == invite_code, Album.is_active == True))  # noqa
    )
    album = result.scalar_one_or_none()
    if not album:
        raise HTTPException(404, detail="Album not found or invite link has expired")
    return album_to_out(album)


@router.get("/{album_id}/analytics", response_model=AlbumAnalytics)
async def get_album_analytics(
    album_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns analytics. Accessible by:
      1. The album owner (full access)
      2. Any user with a SharedAccess record where can_view_stats=True (read-only)
    """
    uid = _s(current_user.id)

    # Check owner OR shared access
    result = await db.execute(
        select(Album)
        .options(
            selectinload(Album.photos).selectinload(Photo.votes).selectinload(Vote.voter),
            selectinload(Album.creator),
        )
        .where(Album.id == album_id)
    )
    album = result.scalar_one_or_none()
    if not album:
        raise HTTPException(404, detail="Album not found")

    is_owner = _s(album.creator_id) == uid

    if not is_owner:
        # Check shared access
        acc_res = await db.execute(
            select(SharedAccess).where(
                and_(SharedAccess.album_id == album_id,
                     SharedAccess.user_id == uid,
                     SharedAccess.can_view_stats == True)  # noqa
            )
        )
        if not acc_res.scalar_one_or_none():
            raise HTTPException(403, detail="Access denied")

    total_likes = 0
    total_votes = 0
    voter_map: dict = {}
    photo_stats: List[PhotoStats] = []

    for photo in album.photos:
        reactions: List[VoterReaction] = []
        for vote in photo.votes:
            vid = _s(vote.voter_id)
            uname = vote.voter.username if vote.voter else vid[:8]
            reactions.append(VoterReaction(voter_id=vid, username=uname, is_like=vote.is_like))
            total_votes += 1
            if vote.is_like:
                total_likes += 1
            if vid not in voter_map:
                voter_map[vid] = {"username": uname, "vote_count": 0, "voter_id": vid}
            voter_map[vid]["vote_count"] += 1

        photo_stats.append(PhotoStats(
            id=photo.id, filename=photo.filename,
            url=photo_url(photo.stored_filename),
            order=photo.order,
            like_count=photo.like_count,
            dislike_count=photo.dislike_count,
            total_votes=photo.total_votes,
            like_percentage=photo.like_percentage,
            is_winner=False,
            reactions=reactions,
        ))

    winner = None
    voted = [p for p in photo_stats if p.total_votes > 0]
    if voted:
        best = max(voted, key=lambda p: (p.like_percentage, p.total_votes))
        best.is_winner = True
        winner = best

    global_like_rate = round((total_likes / total_votes) * 100, 1) if total_votes else 0.0
    voter_summaries = [
        VoterSummary(voter_id=v["voter_id"], username=v["username"], vote_count=v["vote_count"])
        for v in sorted(voter_map.values(), key=lambda x: x["vote_count"], reverse=True)
    ]

    return AlbumAnalytics(
        id=album.id, title=album.title, description=album.description,
        total_photos=len(album.photos),
        total_votes=total_votes, unique_voters=len(voter_map),
        global_like_rate=global_like_rate,
        voter_summaries=voter_summaries,
        photos=photo_stats, winner=winner,
        created_at=album.created_at,
        is_shared=not is_owner,
    )


@router.delete("/{album_id}", response_model=MessageResponse)
async def delete_album(
    album_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Album).options(selectinload(Album.photos))
        .where(and_(Album.id == album_id, Album.creator_id == _s(current_user.id)))
    )
    album = result.scalar_one_or_none()
    if not album:
        raise HTTPException(404, detail="Album not found or access denied")

    for photo in album.photos:
        p = UPLOAD_DIR / photo.stored_filename
        if p.exists():
            p.unlink()
    await db.delete(album)
    return MessageResponse(message="Album deleted successfully")
