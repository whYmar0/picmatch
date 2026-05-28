from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from database import get_db
from models import User, Notification
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
    """
    result = await db.execute(
        select(Notification)
        .options(selectinload(Notification.actor))
        .where(Notification.user_id == _s(current_user.id))
        .order_by(Notification.created_at.desc())
    )
    return result.scalars().all()


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
