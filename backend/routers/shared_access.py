"""Albums remembered after link visits; personal recipient management is retired."""
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import get_current_user
from database import get_db
from models import SharedAccess, User
from routers.albums import album_to_out, _s
from schemas import SharedAlbumOut

router = APIRouter(prefix="/shared", tags=["Shared Access"])


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
