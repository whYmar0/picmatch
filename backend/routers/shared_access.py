"""Albums remembered after link visits; personal recipient management is retired."""
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import get_current_user
from database import get_db
from models import Album, Photo, SharedAccess, User, Vote
from routers.albums import album_to_out, _s
from schemas import SharedAlbumOut
from album_access import link_version

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
    albums = [
        access.album for access in result.scalars().all()
        if access.album.is_active and access.link_version == link_version(access.album)
    ]
    public_ids = [_s(album.id) for album in albums if album.is_public]
    counts = {}
    if public_ids:
        results = await db.execute(
            select(Photo.album_id, func.count(func.distinct(Vote.voter_id)))
            .join(Vote, Vote.photo_id == Photo.id)
            .where(Photo.album_id.in_(public_ids))
            .group_by(Photo.album_id)
        )
        counts = {_s(album_id): count for album_id, count in results}
    return [
        SharedAlbumOut(
            **album_to_out(album, unique_voters=counts.get(_s(album.id), 0) if album.is_public else None).model_dump(),
            can_view_stats=album.is_public,
        )
        for album in albums
    ]
