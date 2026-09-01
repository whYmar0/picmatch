"""
routers/comments.py — Threaded comments + likes on photos

GET  /comments/photo/{photo_id}         -> list comments (filtered by album.is_public)
POST /comments/                         -> create comment (or reply)
DELETE /comments/{comment_id}           -> delete own comment OR any comment if album owner
POST /comments/{comment_id}/like        -> toggle like on comment

visibility rules:
  - album.is_public=True  -> all authenticated visitors see all comments
  - album.is_public=False -> each commenter sees only their own top-level comments + all replies;
                             the album owner sees everything
"""
import logging
import os
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from database import get_db
from middleware.rate_limit import _get_limit, limiter
from models import User, Comment, CommentLike, Photo, Album, Vote, SharedAccess, Notification, NotificationType
from schemas import CommentCreate, CommentOut, MessageResponse, CommentThreadOut
from auth import get_current_user
from cloudinary_utils import is_cloudinary_configured as _cloudinary_enabled, get_image_url as _cloudinary_url

logger = logging.getLogger("pickmatch")
BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")

router = APIRouter(prefix="/comments", tags=["Comments"])


def _s(v) -> str:
    return str(v)

def _build_comment_out(c: Comment, viewer_id: str, _depth: int = 0) -> CommentOut:
    # Safely access replies — they may not be loaded for deeply nested comments
    try:
        reply_list = c.replies
    except Exception as e:
        logger.warning("Failed to load replies for comment %s: %s", c.id, e)
        reply_list = []

    if _depth == 0:
        replies = [_build_comment_out(r, viewer_id, _depth + 1) for r in
                   sorted(reply_list, key=lambda x: x.created_at)]
    else:
        replies = []

    author_data = c.author
    if author_data is None:
        logger.error("Author is None for comment %s (user_id=%s)", c.id, c.user_id)
        raise HTTPException(
            status_code=500,
            detail="Internal error loading comment author"
        )

    # Safely access likes
    try:
        likes_data = c.likes
    except Exception as e:
        logger.warning("Failed to load likes for comment %s: %s", c.id, e)
        likes_data = []

    liked_by_me = any(_s(lk.user_id) == viewer_id for lk in likes_data)
    like_count = len(likes_data)

    return CommentOut(
        id=c.id,
        photo_id=c.photo_id,
        text=c.text,
        created_at=c.created_at,
        author=author_data,
        like_count=like_count,
        liked_by_me=liked_by_me,
        parent_id=c.parent_id,
        replies=replies,
    )


async def _get_photo_and_album(photo_id: str, db: AsyncSession):
    """Load Photo + its Album in one query."""
    result = await db.execute(
        select(Photo)
        .options(selectinload(Photo.album))
        .where(Photo.id == photo_id)
    )
    photo = result.scalar_one_or_none()
    if not photo:
        raise HTTPException(404, detail="Photo not found")
    return photo, photo.album


@router.get("/photo/{photo_id}", response_model=List[CommentOut])
async def get_comments(
    photo_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns top-level comments (with nested replies) for a photo.
    Visibility:
      - album owner -> sees all comments
      - public album -> all authenticated users see all comments
      - private album -> each user sees only their own top-level comments + their replies
    """
    photo, album = await _get_photo_and_album(photo_id, db)
    uid = _s(current_user.id)
    is_owner = _s(album.creator_id) == uid

    if not is_owner and not album.is_public:
        access_res = await db.execute(
            select(SharedAccess.id).where(
                and_(SharedAccess.user_id == uid, SharedAccess.album_id == _s(album.id))
            )
        )
        has_access = access_res.scalar_one_or_none() is not None
        if not has_access:
            photo_id_rows = await db.execute(select(Photo.id).where(Photo.album_id == _s(album.id)))
            photo_ids = photo_id_rows.scalars().all()
            if photo_ids:
                vote_res = await db.execute(
                    select(Vote.id).where(
                        and_(Vote.photo_id.in_(photo_ids), Vote.voter_id == uid)
                    ).limit(1)
                )
                comment_res = await db.execute(
                    select(Comment.id).where(
                        and_(Comment.photo_id.in_(photo_ids), Comment.user_id == uid)
                    ).limit(1)
                )
                has_access = (
                    vote_res.scalar_one_or_none() is not None
                    or comment_res.scalar_one_or_none() is not None
                )
        if not has_access:
            raise HTTPException(403, detail="Access denied. This album is private.")

    result = await db.execute(
        select(Comment)
        .options(
            selectinload(Comment.author),
            selectinload(Comment.likes),
            selectinload(Comment.replies).selectinload(Comment.author),
            selectinload(Comment.replies).selectinload(Comment.likes),
            selectinload(Comment.replies).selectinload(Comment.replies),
        )
        .where(and_(Comment.photo_id == photo_id, Comment.parent_id == None))  # noqa
        .order_by(Comment.created_at.asc())
    )
    all_top = result.scalars().all()

    # Strict visibility:
    # Public  -> everyone sees all
    # Owner   -> sees all
    # Private -> regular voters see only their own top-level comments.
    
    if is_owner or album.is_public:
        visible = all_top
    else:
        # Private album: regular voter sees only their own top-level comments
        # (and their nested replies to those comments)
        visible = [c for c in all_top if _s(c.user_id) == uid]

    return [_build_comment_out(c, uid) for c in visible]


@router.get("/thread/{comment_id}", response_model=CommentThreadOut)
async def get_comment_thread(
    comment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns a private comment thread: the target comment + any replies from the album Owner.
    Accessible to the comment's own author regardless of album privacy.
    The album owner sees the FULL thread without filtering.
    """
    uid = _s(current_user.id)

    # Load the root comment (could be parent_id=None or a reply itself)
    res = await db.execute(
        select(Comment)
        .options(
            selectinload(Comment.author),
            selectinload(Comment.replies).selectinload(Comment.author),
            selectinload(Comment.replies).selectinload(Comment.likes),
            selectinload(Comment.replies).selectinload(Comment.replies),
        )
        .where(Comment.id == comment_id)
    )
    comment = res.scalar_one_or_none()
    if not comment:
        raise HTTPException(404, detail="Comment not found")

    # If it's a reply, load the parent instead so we show the full thread
    root_id = _s(comment.parent_id) if comment.parent_id else _s(comment.id)

    result = await db.execute(
        select(Comment)
        .options(
            selectinload(Comment.author),
            selectinload(Comment.likes),
            selectinload(Comment.replies).selectinload(Comment.author),
            selectinload(Comment.replies).selectinload(Comment.likes),
            selectinload(Comment.replies).selectinload(Comment.replies),
        )
        .where(Comment.id == root_id)
    )
    root = result.scalar_one_or_none()
    if not root:
        raise HTTPException(404, detail="Root comment not found")

    # Only the comment author (or the album owner) can access this view
    photo_res = await db.execute(select(Photo).options(selectinload(Photo.album)).where(Photo.id == _s(root.photo_id)))
    photo = photo_res.scalar_one_or_none()
    if not photo or not photo.album:
        raise HTTPException(404, detail="Photo/Album context not found")
    
    album = photo.album
    is_album_owner = _s(album.creator_id) == uid
    is_comment_author = _s(root.user_id) == uid

    if not (is_album_owner or is_comment_author):
        raise HTTPException(403, detail="Access denied")

    # Build filtered result:
    album_creator_id = _s(album.creator_id)
    comment_owner_id = _s(root.user_id)

    filtered_root = _build_comment_out(root, uid)
    
    # Filtering logic:
    # 1. If it's the album owner, they see EVERYTHING (no filtering).
    # 2. If it's a public album, they see EVERYTHING (already allowed by previous logic but explicit here).
    # 3. If it's a regular voter in a private album, they see only their thread with the author.
    if not is_album_owner and not album.is_public:
        filtered_root.replies = [
            r for r in filtered_root.replies
            if str(r.author.id) in (album_creator_id, comment_owner_id)
        ]

    # Generate photo URL — Photo model has no .url attribute;
    # construct it the same way albums.py does via stored_filename.
    if _cloudinary_enabled():
        photo_url_val = _cloudinary_url(photo.stored_filename)
    else:
        photo_url_val = f"{BASE_URL}/uploads/{photo.stored_filename}"

    return CommentThreadOut(
        thread=[filtered_root],
        is_public=album.is_public,
        is_owner=is_album_owner,
        photo_url=photo_url_val
    )


@router.post("/", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(_get_limit("RATE_LIMIT_COMMENT", "30/minute"))
async def create_comment(
    request: Request,
    body: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Load photo with album eagerly ONCE — reuse everywhere
    photo_result = await db.execute(
        select(Photo).options(selectinload(Photo.album)).where(Photo.id == _s(body.photo_id))
    )
    photo_obj = photo_result.scalar_one_or_none()
    if not photo_obj:
        raise HTTPException(404, detail="Photo not found")

    album = photo_obj.album
    album_creator_id = _s(album.creator_id) if album else None
    uid = _s(current_user.id)

    if album and not album.is_public and album_creator_id != uid:
        access_res = await db.execute(
            select(SharedAccess.id).where(
                and_(SharedAccess.user_id == uid, SharedAccess.album_id == _s(album.id))
            )
        )
        has_access = access_res.scalar_one_or_none() is not None
        if not has_access:
            vote_res = await db.execute(
                select(Vote.id).where(
                    and_(Vote.photo_id == _s(photo_obj.id), Vote.voter_id == uid)
                ).limit(1)
            )
            comment_res = await db.execute(
                select(Comment.id).where(
                    and_(Comment.photo_id == _s(photo_obj.id), Comment.user_id == uid)
                ).limit(1)
            )
            has_access = (
                vote_res.scalar_one_or_none() is not None
                or comment_res.scalar_one_or_none() is not None
            )
        if not has_access:
            raise HTTPException(403, detail="Access denied. This album is private.")

    # Validate the thread root and the exact comment being addressed.
    parent = None
    reply_target = None
    if body.parent_id:
        parent_result = await db.execute(
            select(Comment)
            .options(selectinload(Comment.author))
            .where(Comment.id == _s(body.parent_id))
        )
        parent = parent_result.scalar_one_or_none()
        if not parent:
            raise HTTPException(404, detail="Parent comment not found")
        if _s(parent.photo_id) != _s(photo_obj.id):
            raise HTTPException(400, detail="Parent comment belongs to another photo")

        if body.reply_to_id:
            target_result = await db.execute(
                select(Comment)
                .options(selectinload(Comment.author))
                .where(Comment.id == _s(body.reply_to_id))
            )
            reply_target = target_result.scalar_one_or_none()
            if not reply_target or _s(reply_target.photo_id) != _s(photo_obj.id):
                raise HTTPException(400, detail="Reply target is invalid")
            target_root_id = _s(reply_target.parent_id) if reply_target.parent_id else _s(reply_target.id)
            if target_root_id != _s(parent.id):
                raise HTTPException(400, detail="Reply target belongs to another thread")

    comment = Comment(
        photo_id=_s(body.photo_id),
        user_id=_s(current_user.id),
        text=body.text.strip(),
        parent_id=_s(body.parent_id) if body.parent_id else None,
    )
    db.add(comment)
    await db.flush()

    # Capture fields BEFORE commit — after commit() the ORM object is
    # expired, and accessing attributes would trigger a synchronous lazy load
    # on the async session, raising sqlalchemy.exc.MissingGreenlet.
    new_comment_id = _s(comment.id)
    new_comment_text = comment.text
    new_comment_created_at = comment.created_at
    new_comment_parent_id = comment.parent_id

    # Notify from the structural relationship, not from optional @mentions.
    try:
        notifications_to_create = []

        if body.parent_id:
            # Notify the exact addressed author only when this is a genuine reply.
            target_author_id = _s(reply_target.user_id) if reply_target else _s(parent.user_id)
            is_reply = target_author_id != uid
            if is_reply:
                notifications_to_create.append(Notification(
                    user_id=target_author_id,
                    actor_id=uid,
                    type=NotificationType.REPLY,
                    album_id=_s(album.id) if album else None,
                    photo_id=_s(body.photo_id),
                    comment_id=new_comment_id,
                    text=new_comment_text[:100],
                ))

            # The album owner is notified for every comment/reply, unless already
            # notified as the addressed recipient or they are the actor.
            if (album_creator_id
                    and album_creator_id != uid
                    and album_creator_id != target_author_id):
                notifications_to_create.append(Notification(
                    user_id=album_creator_id,
                    actor_id=uid,
                    type=NotificationType.COMMENT,
                    album_id=_s(album.id) if album else None,
                    photo_id=_s(body.photo_id),
                    comment_id=new_comment_id,
                    text=new_comment_text[:100],
                ))
        elif album_creator_id and album_creator_id != uid:
            notifications_to_create.append(Notification(
                user_id=album_creator_id,
                actor_id=uid,
                type=NotificationType.COMMENT,
                album_id=_s(album.id) if album else None,
                photo_id=_s(body.photo_id),
                comment_id=new_comment_id,
                text=new_comment_text[:100],
            ))

        for notification in notifications_to_create:
            db.add(notification)
    except Exception:
        logger.exception("Failed to create notifications for comment %s", new_comment_id)

    await db.commit()

    # Build CommentOut directly from current_user — a brand-new comment has
    # no likes and no replies, so there's no need to re-query with selectinload.
    # This avoids a production bug where selectinload(Comment.author) returns
    # None on PostgreSQL after commit.
    return CommentOut(
        id=new_comment_id,
        photo_id=_s(body.photo_id),
        text=new_comment_text,
        created_at=new_comment_created_at,
        author=current_user,
        like_count=0,
        liked_by_me=False,
        parent_id=new_comment_parent_id,
        replies=[],
    )


@router.delete("/{comment_id}", response_model=MessageResponse)
async def delete_comment(
    comment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Deletes a comment.
    Allowed: comment author OR the album owner.
    """
    result = await db.execute(
        select(Comment)
        .options(
            selectinload(Comment.photo).selectinload(Photo.album)
        )
        .where(Comment.id == comment_id)
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(404, detail="Comment not found")

    uid = _s(current_user.id)
    is_own = _s(comment.user_id) == uid
    is_album_owner = _s(comment.photo.album.creator_id) == uid

    if not (is_own or is_album_owner):
        raise HTTPException(403, detail="Not allowed to delete this comment")

    await db.delete(comment)
    await db.commit()
    return MessageResponse(message="Comment deleted")


@router.post("/{comment_id}/like", response_model=MessageResponse)
@limiter.limit(_get_limit("RATE_LIMIT_COMMENT_LIKE", "60/minute"))
async def toggle_like(
    request: Request,
    comment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle like on a comment. Returns 'liked' or 'unliked'."""
    result = await db.execute(
        select(CommentLike).where(
            and_(CommentLike.comment_id == comment_id,
                 CommentLike.user_id == _s(current_user.id))
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.commit()
        return MessageResponse(message="unliked")
    else:
        res = await db.execute(select(Comment).where(Comment.id == comment_id))
        if not res.scalar_one_or_none():
            raise HTTPException(404, detail="Comment not found")
            
        comment_obj = res.scalar_one()
        db.add(CommentLike(comment_id=comment_id, user_id=_s(current_user.id)))
        
        await db.commit()
        return MessageResponse(message="liked")
