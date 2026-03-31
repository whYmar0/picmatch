"""
routers/albums.py — Album management routes

BUGFIXES:
  - invite_url now uses FRONTEND_URL env var (was fragile port-replace hack)
  - .dict() replaced with .model_dump() (Pydantic v2)
  - get_my_albums now returns AlbumOut with photos array for card previews
  - All UUID comparisons cast to str() for SQLite compatibility
"""

import os
import uuid
import secrets
from typing import List
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from database import get_db
from models import User, Album, Photo, Vote
from schemas import AlbumOut, AlbumWithPhotos, AlbumAnalytics, PhotoStats, PhotoOut, MessageResponse
from auth import get_current_user, get_creator_user

router = APIRouter(prefix="/albums", tags=["Albums"])

UPLOAD_DIR  = Path(os.getenv("UPLOAD_DIR", "./uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
BASE_URL     = os.getenv("BASE_URL",     "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")   # ← FIX: dedicated var
MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def _str(val) -> str:
    return str(val)


def photo_url(stored: str) -> str:
    return f"{BASE_URL}/uploads/{stored}"


def photo_to_out(p: Photo) -> PhotoOut:
    return PhotoOut(
        id=p.id,
        filename=p.filename,
        url=photo_url(p.stored_filename),
        order=p.order,
        created_at=p.created_at,
    )


def album_to_out(album: Album) -> AlbumOut:
    """
    FIX: invite_url now uses FRONTEND_URL instead of fragile port-replace hack.
    FIX: photos array always included so AlbumCard can render thumbnails.
    FIX: .model_dump() instead of deprecated .dict()
    """
    return AlbumOut(
        id=album.id,
        title=album.title,
        description=album.description,
        invite_code=album.invite_code,
        invite_url=f"{FRONTEND_URL}/vote/{album.invite_code}",  # ← FIX
        is_active=album.is_active,
        photo_count=len(album.photos),
        created_at=album.created_at,
        creator=album.creator,
        photos=[photo_to_out(p) for p in album.photos],         # ← FIX: always included
    )


# ─── Creator Routes ───────────────────────────────────────────────────────────

@router.post("/", response_model=AlbumWithPhotos, status_code=status.HTTP_201_CREATED)
async def create_album(
    title:       str = Form(...),
    description: str = Form(None),
    photos:      List[UploadFile] = File(...),
    current_user: User = Depends(get_creator_user),
    db: AsyncSession = Depends(get_db),
):
    """Creates a new album and uploads photos. Creator only."""
    if not photos:
        raise HTTPException(400, detail="At least one photo is required")
    if len(photos) > 50:
        raise HTTPException(400, detail="Maximum 50 photos per album")

    invite_code = secrets.token_urlsafe(16)
    album = Album(
        title=title,
        description=description,
        invite_code=invite_code,
        creator_id=_str(current_user.id),
    )
    db.add(album)
    await db.flush()

    for idx, photo_file in enumerate(photos):
        if photo_file.content_type not in ALLOWED_TYPES:
            raise HTTPException(
                400,
                detail=f"File type '{photo_file.content_type}' not allowed. Use JPEG, PNG or WebP."
            )
        ext = Path(photo_file.filename or "photo").suffix.lower() or ".jpg"
        stored = f"{uuid.uuid4()}{ext}"
        content = await photo_file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(400, detail=f"'{photo_file.filename}' exceeds 10 MB limit")
        with open(UPLOAD_DIR / stored, "wb") as f:
            f.write(content)
        db.add(Photo(
            album_id=_str(album.id),
            filename=photo_file.filename or stored,
            stored_filename=stored,
            order=idx,
        ))

    await db.flush()

    # Reload with relationships
    result = await db.execute(
        select(Album)
        .options(selectinload(Album.photos), selectinload(Album.creator))
        .where(Album.id == _str(album.id))
    )
    album = result.scalar_one()
    return album_to_out(album)


@router.get("/my", response_model=List[AlbumOut])
async def get_my_albums(
    current_user: User = Depends(get_creator_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns all albums belonging to the current creator.
    FIX: selectinload(Album.photos) included so previews render in AlbumCard.
    """
    result = await db.execute(
        select(Album)
        .options(selectinload(Album.photos), selectinload(Album.creator))
        .where(Album.creator_id == _str(current_user.id))
        .order_by(Album.created_at.desc())
    )
    albums = result.scalars().all()
    return [album_to_out(a) for a in albums]


@router.get("/invite/{invite_code}", response_model=AlbumWithPhotos)
async def get_album_by_invite(
    invite_code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns an album by its invite code. Any authenticated user."""
    result = await db.execute(
        select(Album)
        .options(selectinload(Album.photos), selectinload(Album.creator))
        .where(
            and_(Album.invite_code == invite_code, Album.is_active == True)  # noqa: E712
        )
    )
    album = result.scalar_one_or_none()
    if not album:
        raise HTTPException(404, detail="Album not found or invite link has expired")
    return album_to_out(album)


@router.get("/{album_id}/analytics", response_model=AlbumAnalytics)
async def get_album_analytics(
    album_id: str,
    current_user: User = Depends(get_creator_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns full vote analytics for an album. Creator only.
    Eagerly loads photos → votes in a single query to avoid N+1.
    """
    result = await db.execute(
        select(Album)
        .options(
            selectinload(Album.photos).selectinload(Photo.votes),
            selectinload(Album.creator),
        )
        .where(
            and_(
                Album.id == album_id,
                Album.creator_id == _str(current_user.id),
            )
        )
    )
    album = result.scalar_one_or_none()
    if not album:
        raise HTTPException(404, detail="Album not found or access denied")

    voter_ids: set = set()
    total_votes = 0
    photo_stats: List[PhotoStats] = []

    for photo in album.photos:
        for vote in photo.votes:
            voter_ids.add(_str(vote.voter_id))
            total_votes += 1

        photo_stats.append(PhotoStats(
            id=photo.id,
            filename=photo.filename,
            url=photo_url(photo.stored_filename),
            order=photo.order,
            like_count=photo.like_count,
            dislike_count=photo.dislike_count,
            total_votes=photo.total_votes,
            like_percentage=photo.like_percentage,
            is_winner=False,
        ))

    # Winner = highest like_percentage, tie-break = more total votes
    winner: PhotoStats | None = None
    voted = [p for p in photo_stats if p.total_votes > 0]
    if voted:
        best = max(voted, key=lambda p: (p.like_percentage, p.total_votes))
        best.is_winner = True
        winner = best

    return AlbumAnalytics(
        id=album.id,
        title=album.title,
        description=album.description,
        total_photos=len(album.photos),
        total_votes=total_votes,
        unique_voters=len(voter_ids),
        photos=photo_stats,
        winner=winner,
        created_at=album.created_at,
    )


@router.delete("/{album_id}", response_model=MessageResponse)
async def delete_album(
    album_id: str,
    current_user: User = Depends(get_creator_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently deletes an album and all its uploaded files."""
    result = await db.execute(
        select(Album)
        .options(selectinload(Album.photos))
        .where(
            and_(
                Album.id == album_id,
                Album.creator_id == _str(current_user.id),
            )
        )
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
