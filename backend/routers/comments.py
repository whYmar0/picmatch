"""
routers/comments.py — Threaded comments + likes on photos
GET  /comments/photo/{photo_id}         → list top-level comments + replies
POST /comments/                         → create comment (or reply)
DELETE /comments/{comment_id}           → delete own comment
POST /comments/{comment_id}/like        → toggle like on comment
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from database import get_db
from models import User, Comment, CommentLike, Photo
from schemas import CommentCreate, CommentOut, MessageResponse
from auth import get_current_user

router = APIRouter(prefix="/comments", tags=["Comments"])


def _s(v) -> str:
    return str(v)


def _build_comment_out(c: Comment, viewer_id: str) -> CommentOut:
    liked_by_me = any(_s(lk.user_id) == viewer_id for lk in c.likes)
    replies = [_build_comment_out(r, viewer_id) for r in
               sorted(c.replies, key=lambda x: x.created_at)]
    return CommentOut(
        id=c.id,
        photo_id=c.photo_id,
        text=c.text,
        created_at=c.created_at,
        author=c.author,
        like_count=c.like_count,
        liked_by_me=liked_by_me,
        parent_id=c.parent_id,
        replies=replies,
    )


@router.get("/photo/{photo_id}", response_model=List[CommentOut])
async def get_comments(
    photo_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns top-level comments for a photo, each with nested replies."""
    result = await db.execute(
        select(Comment)
        .options(
            selectinload(Comment.author),
            selectinload(Comment.likes),
            selectinload(Comment.replies)
            .selectinload(Comment.author),
            selectinload(Comment.replies)
            .selectinload(Comment.likes),
        )
        .where(and_(Comment.photo_id == photo_id, Comment.parent_id == None))  # noqa
        .order_by(Comment.created_at.asc())
    )
    comments = result.scalars().all()
    viewer_id = _s(current_user.id)
    return [_build_comment_out(c, viewer_id) for c in comments]


@router.post("/", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
async def create_comment(
    body: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify photo exists
    res = await db.execute(select(Photo).where(Photo.id == _s(body.photo_id)))
    if not res.scalar_one_or_none():
        raise HTTPException(404, detail="Photo not found")

    # Verify parent exists if given
    if body.parent_id:
        res = await db.execute(select(Comment).where(Comment.id == _s(body.parent_id)))
        if not res.scalar_one_or_none():
            raise HTTPException(404, detail="Parent comment not found")

    comment = Comment(
        photo_id=_s(body.photo_id),
        user_id=_s(current_user.id),
        text=body.text.strip(),
        parent_id=_s(body.parent_id) if body.parent_id else None,
    )
    db.add(comment)
    await db.flush()

    # Reload with relationships
    result = await db.execute(
        select(Comment)
        .options(
            selectinload(Comment.author),
            selectinload(Comment.likes),
            selectinload(Comment.replies).selectinload(Comment.author),
            selectinload(Comment.replies).selectinload(Comment.likes),
        )
        .where(Comment.id == _s(comment.id))
    )
    c = result.scalar_one()
    return _build_comment_out(c, _s(current_user.id))


@router.delete("/{comment_id}", response_model=MessageResponse)
async def delete_comment(
    comment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Comment).where(
            and_(Comment.id == comment_id,
                 Comment.user_id == _s(current_user.id))
        )
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(404, detail="Comment not found or not yours")
    await db.delete(comment)
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
        return MessageResponse(message="unliked")
    else:
        # Verify comment exists
        res = await db.execute(select(Comment).where(Comment.id == comment_id))
        if not res.scalar_one_or_none():
            raise HTTPException(404, detail="Comment not found")
        db.add(CommentLike(comment_id=comment_id, user_id=_s(current_user.id)))
        return MessageResponse(message="liked")
