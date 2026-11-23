"""Apply an owner's frozen edit and retain cleanup work after publication."""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import selectinload

from album_draft_storage import delete_published_media, published_storage_kind
from models import Album, Comment, CommentLike, Notification, PendingUpload, Photo, RemovedAlbumMedia, Vote, NotificationType
from schemas import AlbumEditIntent

logger = logging.getLogger(__name__)


async def owned_album(db, owner, album_id, *, write=False):
    query = (
        select(Album)
        .where(Album.id == str(album_id), Album.creator_id == str(owner.id), Album.is_active.is_(True))
        .options(selectinload(Album.photos), selectinload(Album.creator))
        .execution_options(populate_existing=True)
        .with_for_update(read=not write, key_share=write)
    )
    album = await db.scalar(query)
    if album is None:
        raise HTTPException(404, "Album not found or access denied")
    return album


async def album_result(db, album):
    from routers.albums import album_to_out

    votes = await db.execute(
        select(func.count(Vote.id), func.count(func.distinct(Vote.voter_id)))
        .join(Photo, Photo.id == Vote.photo_id)
        .where(Photo.album_id == album.id)
    )
    total, people = votes.one()
    return album_to_out(album, total_votes=total, unique_voters=people)


async def edit_snapshot(db, owner, album_id):
    album = await owned_album(db, owner, album_id)
    return {"album": await album_result(db, album), "edit_version": album.edit_version}


async def validate_intent(db, owner, intent, new_count, *, write=False):
    try:
        album = await owned_album(db, owner, intent.album_id, write=write)
    except HTTPException as error:
        if error.status_code != 404:
            raise
        raise HTTPException(404, {"message": "Album not found", "code": "album_edit_target_unavailable"}) from None
    if album.edit_version != intent.base_version:
        raise HTTPException(409, {"message": "Album changed", "code": "album_edit_conflict"})
    existing = {str(photo.id) for photo in album.photos}
    removals = {str(photo_id) for photo_id in intent.remove_photo_ids}
    if not removals <= existing:
        raise HTTPException(422, "Unknown album file")
    if len(existing) - len(removals) + new_count == 0:
        raise HTTPException(422, "At least one photo or video is required")
    return album


async def apply_edit(db, owner, draft, rows):
    intent = AlbumEditIntent.model_validate(draft.edit_intent)
    album = await validate_intent(db, owner, intent, len(rows), write=True)
    changed = await db.execute(
        update(Album)
        .where(Album.id == album.id, Album.edit_version == intent.base_version)
        .values(title=draft.title, description=draft.description, edit_version=intent.base_version + 1)
    )
    if changed.rowcount != 1:
        raise HTTPException(409, {"message": "Album changed", "code": "album_edit_conflict"})

    removed_ids = {str(photo_id) for photo_id in intent.remove_photo_ids}
    if removed_ids:
        # PostgreSQL foreign-key checks wait here before writing a vote or comment on removed media.
        removed = (await db.scalars(
            select(Photo).where(Photo.album_id == album.id, Photo.id.in_(removed_ids))
            .order_by(Photo.id).with_for_update()
        )).all()
        comment_ids = select(Comment.id).where(Comment.photo_id.in_(removed_ids))
        await db.execute(delete(Notification).where(
            Notification.photo_id.in_(removed_ids) | Notification.comment_id.in_(comment_ids)
        ))
        # Vote notices identify an album and voter, so retain the notice if another vote survives.
        remaining_vote = (
            select(Vote.id).join(Photo, Photo.id == Vote.photo_id)
            .where(Photo.album_id == album.id, Photo.id.not_in(removed_ids), Vote.voter_id == Notification.actor_id)
            .exists()
        )
        await db.execute(delete(Notification).where(
            Notification.album_id == album.id, Notification.type == NotificationType.VOTE,
            Notification.actor_id.in_(select(Vote.voter_id).where(Vote.photo_id.in_(removed_ids))),
            ~remaining_vote,
        ))
        await db.execute(delete(CommentLike).where(CommentLike.comment_id.in_(comment_ids)))
        await db.execute(delete(Comment).where(Comment.photo_id.in_(removed_ids)))
        await db.execute(delete(Vote).where(Vote.photo_id.in_(removed_ids)))
        for photo in removed:
            db.add(RemovedAlbumMedia(
                stored_filename=photo.stored_filename, media_type=photo.media_type,
                delivery_type=photo.cloudinary_delivery_type, storage_kind=published_storage_kind(photo),
            ))
        await db.execute(delete(Photo).where(Photo.album_id == album.id, Photo.id.in_(removed_ids)))

    next_order = max((photo.order or 0 for photo in album.photos if str(photo.id) not in removed_ids), default=-1) + 1
    for row in rows:
        db.add(Photo(
            album_id=album.id, filename=row["filename"], stored_filename=row["stored"],
            media_type=row["media_type"], cloudinary_delivery_type=row["cloudinary_delivery_type"],
            order=next_order + row["idx"],
        ))
    return album


async def cleanup_removed_media(db):
    now = datetime.now(timezone.utc)
    jobs = (await db.scalars(
        select(RemovedAlbumMedia).where(RemovedAlbumMedia.retry_at <= now)
        .order_by(RemovedAlbumMedia.retry_at, RemovedAlbumMedia.id).limit(50)
        .with_for_update(skip_locked=True)
    )).all()
    for job in jobs:
        published = select(Photo.id).where(
            Photo.stored_filename == job.stored_filename,
            Photo.media_type == job.media_type,
            Photo.cloudinary_delivery_type == job.delivery_type,
        ).exists()
        pending = select(PendingUpload.id).where(
            PendingUpload.stored_filename == job.stored_filename,
            PendingUpload.media_type == job.media_type,
            PendingUpload.cloudinary_delivery_type == job.delivery_type,
        ).exists()
        referenced = await db.scalar(select(published | pending))
        try:
            if not referenced:
                await delete_published_media(job)
        except Exception:
            job.retry_at = now + timedelta(minutes=15)
            logger.warning("Published media cleanup will retry job %s", job.id)
        else:
            await db.delete(job)
    await db.commit()
