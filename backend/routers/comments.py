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
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from database import get_db
from models import User, Comment, CommentLike, Photo, Album, Notification, NotificationType
from schemas import CommentCreate, CommentOut, MessageResponse, CommentThreadOut
from auth import get_current_user

router = APIRouter(prefix="/comments", tags=["Comments"])


def _s(v) -> str:
    return str(v)

def _build_comment_out(c: Comment, viewer_id: str, _depth: int = 0) -> CommentOut:
    try:
        reply_list = c.replies
    except Exception:
        reply_list = []

    if _depth == 0:
        replies = [_build_comment_out(r, viewer_id, _depth + 1) for r in
                   sorted(reply_list, key=lambda x: x.created_at)]
    else:
        replies = []
        
    try:
        author_data = c.author
    except Exception:
        author_data = None
        
    try:
        likes_data = c.likes
    except Exception:
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

    return CommentThreadOut(
        thread=[filtered_root],
        is_public=album.is_public,
        is_owner=is_album_owner,
        photo_url=photo.url
    )


@router.post("/", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
async def create_comment(
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

    # Verify parent exists if given
    if body.parent_id:
        parent_result = await db.execute(select(Comment).where(Comment.id == _s(body.parent_id)))
        if not parent_result.scalar_one_or_none():
            raise HTTPException(404, detail="Parent comment not found")

    comment = Comment(
        photo_id=_s(body.photo_id),
        user_id=_s(current_user.id),
        text=body.text.strip(),
        parent_id=_s(body.parent_id) if body.parent_id else None,
    )
    db.add(comment)
    await db.flush()

    # Capture comment ID BEFORE commit — after commit() the ORM object is
    # expired, and accessing comment.id would trigger a synchronous lazy load
    # on the async session, raising sqlalchemy.exc.MissingGreenlet.
    new_comment_id = _s(comment.id)

    # Create Notification
    uid = _s(current_user.id)
    try:
        if body.parent_id:
            # It's a reply: notify parent comment author
            parent_result = await db.execute(select(Comment).where(Comment.id == _s(body.parent_id)))
            parent = parent_result.scalar_one_or_none()
            parent_uid = _s(parent.user_id) if parent else None

            if parent and parent_uid != uid:
                db.add(Notification(
                    user_id=parent_uid,
                    actor_id=uid,
                    type=NotificationType.REPLY,
                    album_id=album_creator_id,
                    photo_id=_s(body.photo_id),
                    comment_id=_s(body.parent_id),
                    text=comment.text[:100],
                ))

            # Always notify album owner if guest replies (no double notify)
            if album_creator_id and album_creator_id != uid:
                if not parent or _s(parent.user_id) != album_creator_id:
                    db.add(Notification(
                        user_id=album_creator_id,
                        actor_id=uid,
                        type=NotificationType.COMMENT,
                        album_id=album_creator_id,
                        photo_id=_s(body.photo_id),
                        comment_id=new_comment_id,
                        text=comment.text[:100],
                    ))
        else:
            # Top-level comment: notify album owner
            if album_creator_id and album_creator_id != uid:
                db.add(Notification(
                    user_id=album_creator_id,
                    actor_id=uid,
                    type=NotificationType.COMMENT,
                    album_id=album_creator_id,
                    photo_id=_s(body.photo_id),
                    comment_id=new_comment_id,
                    text=comment.text[:100],
                ))
    except Exception:
        pass  # Silently fail notifications

    await db.commit()

    # Reload with relationships — use the ID captured before commit
    result = await db.execute(
        select(Comment)
        .options(
            selectinload(Comment.author),
            selectinload(Comment.likes),
            selectinload(Comment.replies).selectinload(Comment.author),
            selectinload(Comment.replies).selectinload(Comment.likes),
            selectinload(Comment.replies).selectinload(Comment.replies),
        )
        .where(Comment.id == new_comment_id)
    )
    c = result.scalar_one()
    return _build_comment_out(c, uid)


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
async def toggle_like(
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
        
        # Notification
        if _s(comment_obj.user_id) != _s(current_user.id):
            # Get album_id through the photo relationship
            photo_ctx = await db.execute(select(Photo).where(Photo.id == _s(comment_obj.photo_id)))
            p_obj = photo_ctx.scalar_one_or_none()
            
            notif = Notification(
                user_id=_s(comment_obj.user_id),
                actor_id=_s(current_user.id),
                type=NotificationType.LIKE,
                album_id=_s(p_obj.album_id) if p_obj else None,
                photo_id=_s(comment_obj.photo_id),
                comment_id=comment_id,
            )
            db.add(notif)
            
        await db.commit()
        return MessageResponse(message="liked")
