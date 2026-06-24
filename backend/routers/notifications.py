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

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _s(v) -> str:
    return str(v)


@router.get("/", response_model=List[NotificationOut])
async def get_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns all notifications for the current user, ordered by newest first.
    Populates thumbnail_url based on:
    - COMMENT/REPLY/LIKE: URL of photo_id
    - VOTE: URL of the first photo in album_id
    """
    result = await db.execute(
        select(Notification)
        .options(selectinload(Notification.actor))
        .where(Notification.user_id == _s(current_user.id))
        .order_by(Notification.created_at.desc())
    )
    notifications = result.scalars().all()

    # Pre-fetch photos to avoid N+1 queries.
    photo_ids = [n.photo_id for n in notifications if n.photo_id]
    album_ids = [n.album_id for n in notifications if n.album_id]

    photo_map = {}
    if photo_ids:
        p_res = await db.execute(select(Photo).where(Photo.id.in_(photo_ids)))
        for p in p_res.scalars().all():
            photo_map[_s(p.id)] = p

    album_first_photo_map = {}
    if album_ids:
        p_res = await db.execute(
            select(Photo)
            .where(Photo.album_id.in_(album_ids))
            .order_by(Photo.album_id, Photo.order.asc())
        )
        for p in p_res.scalars().all():
            aid = _s(p.album_id)
            if aid not in album_first_photo_map:
                album_first_photo_map[aid] = p

    BASE_URL = os.getenv("BASE_URL", "http://localhost:8000").rstrip("/")

    out_list = []
    for n in notifications:
        thumb_url = None
        if n.photo_id and _s(n.photo_id) in photo_map:
            p = photo_map[_s(n.photo_id)]
            thumb_url = f"{BASE_URL}/uploads/{p.stored_filename}"
        elif n.album_id and _s(n.album_id) in album_first_photo_map:
            p = album_first_photo_map[_s(n.album_id)]
            thumb_url = f"{BASE_URL}/uploads/{p.stored_filename}"

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
