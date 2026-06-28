import os
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from database import get_db
from models import User, Notification, Photo
from schemas import NotificationOut, MessageResponse
from auth import get_current_user
from cloudinary_utils import is_cloudinary_configured as _cloudinary_enabled, get_image_url as _cloudinary_url

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _s(v) -> str:
    return str(v)


@router.get("/", response_model=List[NotificationOut])
async def get_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns all notifications ordered by newest first.
    OPTIMIZED: single batch query for photo thumbnails + album first photos.
    """
    result = await db.execute(
        select(Notification)
        .options(selectinload(Notification.actor))
        .where(Notification.user_id == _s(current_user.id))
        .order_by(Notification.created_at.desc())
    )
    notifications = result.scalars().all()

    # Collect all IDs for a single batch query
    photo_ids = list({_s(n.photo_id) for n in notifications if n.photo_id})
    album_ids = list({_s(n.album_id) for n in notifications if n.album_id})
    all_ids = set(photo_ids + album_ids)

    photo_map = {}
    album_first_photo_map = {}

    if all_ids:
        # One query: get direct photos + first photo per album
        p_rows = await db.execute(
            select(Photo.id, Photo.album_id, Photo.stored_filename, Photo.order)
            .where(Photo.id.in_(photo_ids))
        )
        for row in p_rows:
            pid, aid, sfname, order = row
            photo_map[_s(pid)] = sfname
            # Track for album first-photo (lowest order wins)
            aid_str = _s(aid)
            current = album_first_photo_map.get(aid_str)
            if current is None or order < current[1]:
                album_first_photo_map[aid_str] = (sfname, order)

        # Fetch first photos for album_ids that weren't covered by photo_ids
        missing_albums = [aid for aid in album_ids if aid not in album_first_photo_map]
        if missing_albums:
            from sqlalchemy import func
            # Subquery: min order per album
            subq = (
                select(Photo.album_id, func.min(Photo.order).label("min_order"))
                .where(Photo.album_id.in_(missing_albums))
                .group_by(Photo.album_id)
            ).subquery()
            ap_rows = await db.execute(
                select(Photo.album_id, Photo.stored_filename)
                .join(subq, (Photo.album_id == subq.c.album_id) & (Photo.order == subq.c.min_order))
            )
            for row in ap_rows:
                album_first_photo_map[_s(row[0])] = (row[1], 0)

    BASE_URL = os.getenv("BASE_URL", "http://localhost:8000").rstrip("/")

    out_list = []
    for n in notifications:
        thumb_url = None
        pid = _s(n.photo_id) if n.photo_id else None
        aid = _s(n.album_id) if n.album_id else None

        if pid and pid in photo_map:
            stored = photo_map[pid]
            thumb_url = _cloudinary_url(stored) if _cloudinary_enabled() else f"{BASE_URL}/uploads/{stored}"
        elif aid and aid in album_first_photo_map:
            stored = album_first_photo_map[aid][0]
            thumb_url = _cloudinary_url(stored) if _cloudinary_enabled() else f"{BASE_URL}/uploads/{stored}"

        n.thumbnail_url = thumb_url
        out_list.append(n)

    return out_list


@router.post("/read", response_model=MessageResponse)
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Marks all unread notifications as read for the current user.
    """
    await db.execute(
        update(Notification)
        .where(Notification.user_id == _s(current_user.id))
        .values(is_read=True)
    )
    await db.commit()
    return MessageResponse(message="Notifications marked as read")
