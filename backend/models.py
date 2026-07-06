"""
models.py — SQLAlchemy ORM models
New in this version:
  - avatar_url on User
  - SharedAccess: links User ↔ Album with can_view_stats permission
  - Comment: threaded (parent_id nullable FK → self)
  - CommentLike: User likes a comment
  - Timezone: datetime.now(timezone.utc) + DateTime(timezone=True) everywhere
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text, UniqueConstraint, text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import relationship
import enum

from database import Base, IS_SQLITE


def _now():
    return datetime.now(timezone.utc)


def uuid_column(primary_key=False, foreign_key=None, nullable=False):
    if IS_SQLITE:
        if foreign_key:
            return Column(String(36), ForeignKey(foreign_key, ondelete="CASCADE"),
                          nullable=nullable, index=True)
        return Column(String(36), primary_key=primary_key,
                      default=lambda: str(uuid.uuid4()), index=not primary_key)
    else:
        from sqlalchemy.dialects.postgresql import UUID as PgUUID
        if foreign_key:
            return Column(PgUUID(as_uuid=True),
                          ForeignKey(foreign_key, ondelete="CASCADE"),
                          nullable=nullable, index=True)
        return Column(PgUUID(as_uuid=True), primary_key=primary_key,
                      default=uuid.uuid4, index=not primary_key)


class UserRole(str, enum.Enum):
    CREATOR = "creator"
    VOTER   = "voter"


class User(Base):
    __tablename__ = "users"
    id              = uuid_column(primary_key=True)
    email           = Column(String(255), unique=True, nullable=False, index=True)
    username        = Column(String(100), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    # Monotonic counter incremented on every password change. Embedded in
    # the JWT as `pwd_version`; if a token's value is stale, `get_current_user`
    # in auth.py rejects it as a 401. Provides a cheap "log out everywhere"
    # mechanism without needing a token blacklist.
    password_version = Column(Integer, default=0, nullable=False, server_default=text("0"))
    role            = Column(SAEnum(UserRole), default=UserRole.CREATOR, nullable=False)
    is_active       = Column(Boolean, default=True)
    is_verified     = Column(Boolean, default=False, server_default=text("false"))
    verification_code = Column(String(6), nullable=True)
    verification_code_expires_at = Column(DateTime(timezone=True), nullable=True)
    reset_token     = Column(String(255), nullable=True)
    reset_token_expires_at = Column(DateTime(timezone=True), nullable=True)
    avatar_url      = Column(String(500), nullable=True)      # NEW: profile avatar
    avatar_color    = Column(String(20), nullable=True)          # NEW: random avatar fallback color (purple, green, etc.)
    created_at      = Column(DateTime(timezone=True), default=_now)

    albums         = relationship("Album", back_populates="creator", cascade="all, delete-orphan")
    votes          = relationship("Vote",  back_populates="voter",   cascade="all, delete-orphan")
    shared_accesses= relationship("SharedAccess", back_populates="user", cascade="all, delete-orphan",
                                  foreign_keys="SharedAccess.user_id")
    comments        = relationship("Comment", back_populates="author", cascade="all, delete-orphan")
    comment_likes   = relationship("CommentLike", back_populates="user", cascade="all, delete-orphan")


class Album(Base):
    __tablename__ = "albums"
    id          = uuid_column(primary_key=True)
    title       = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    invite_code = Column(String(32), unique=True, nullable=False, index=True)
    creator_id  = uuid_column(foreign_key="users.id")
    is_active   = Column(Boolean, default=True)
    is_public   = Column(Boolean, default=True, server_default=text("true"))
    # Token-protected analytics share link (see routers/share_links.py).
    # Lazy-generated so existing albums get a token on first request.
    share_token = Column(String(64), nullable=True, unique=True, index=True)
    created_at  = Column(DateTime(timezone=True), default=_now)

    creator       = relationship("User",  back_populates="albums")
    photos        = relationship("Photo", back_populates="album",
                                 cascade="all, delete-orphan", order_by="Photo.order")
    shared_accesses = relationship("SharedAccess", back_populates="album",
                                   cascade="all, delete-orphan",
                                   foreign_keys="SharedAccess.album_id")


class Photo(Base):
    __tablename__ = "photos"
    id              = uuid_column(primary_key=True)
    album_id        = uuid_column(foreign_key="albums.id")
    filename        = Column(String(500), nullable=False)
    stored_filename = Column(String(500), nullable=False)
    order           = Column(Integer, default=0)
    created_at      = Column(DateTime(timezone=True), default=_now)

    album    = relationship("Album", back_populates="photos")
    votes    = relationship("Vote",  back_populates="photo", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="photo", cascade="all, delete-orphan")

    @property
    def like_count(self):    return sum(1 for v in self.votes if v.is_like)
    @property
    def dislike_count(self): return sum(1 for v in self.votes if not v.is_like)
    @property
    def total_votes(self):   return len(self.votes)
    @property
    def like_percentage(self):
        return round(self.like_count / self.total_votes * 100, 1) if self.total_votes else 0.0


class Vote(Base):
    __tablename__ = "votes"
    id         = uuid_column(primary_key=True)
    photo_id   = uuid_column(foreign_key="photos.id")
    voter_id   = uuid_column(foreign_key="users.id")
    is_like    = Column(Boolean, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)

    photo = relationship("Photo", back_populates="votes")
    voter = relationship("User",  back_populates="votes")


# ─── SharedAccess ─────────────────────────────────────────────────────────────

class SharedAccess(Base):
    """
    Links a User to an Album they can access without being the owner.
    can_view_stats=True → read-only analytics access.
    No delete / edit rights are granted.
    """
    __tablename__ = "shared_accesses"
    __table_args__ = (UniqueConstraint("user_id", "album_id", name="uq_shared_user_album"),)

    id              = uuid_column(primary_key=True)
    user_id         = uuid_column(foreign_key="users.id")
    album_id        = uuid_column(foreign_key="albums.id")
    can_view_stats  = Column(Boolean, default=True)
    created_at      = Column(DateTime(timezone=True), default=_now)

    user  = relationship("User",  back_populates="shared_accesses", foreign_keys="SharedAccess.user_id")
    album = relationship("Album", back_populates="shared_accesses", foreign_keys="SharedAccess.album_id")


# ─── Comment ──────────────────────────────────────────────────────────────────

class Comment(Base):
    """
    Threaded comment on a photo. parent_id=None → top-level; else → reply.
    """
    __tablename__ = "comments"

    id         = uuid_column(primary_key=True)
    photo_id   = uuid_column(foreign_key="photos.id")
    user_id    = uuid_column(foreign_key="users.id")
    text       = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)

    # Self-referential FK for threading (nullable — top-level comments have no parent)
    if IS_SQLITE:
        parent_id = Column(String(36), ForeignKey("comments.id", ondelete="CASCADE"), nullable=True, index=True)
    else:
        from sqlalchemy.dialects.postgresql import UUID as PgUUID
        parent_id = Column(PgUUID(as_uuid=True), ForeignKey("comments.id", ondelete="CASCADE"), nullable=True, index=True)

    photo    = relationship("Photo",   back_populates="comments")
    author   = relationship("User",    back_populates="comments")
    replies  = relationship("Comment", back_populates="parent",
                            cascade="all, delete-orphan",
                            foreign_keys="Comment.parent_id")
    parent   = relationship("Comment", back_populates="replies",
                            remote_side="Comment.id",
                            foreign_keys="Comment.parent_id")
    likes    = relationship("CommentLike", back_populates="comment",
                            cascade="all, delete-orphan")

    @property
    def like_count(self): return len(self.likes)


class CommentLike(Base):
    __tablename__ = "comment_likes"
    __table_args__ = (UniqueConstraint("user_id", "comment_id", name="uq_comment_like"),)

    id         = uuid_column(primary_key=True)
    user_id    = uuid_column(foreign_key="users.id")
    comment_id = uuid_column(foreign_key="comments.id")
    created_at = Column(DateTime(timezone=True), default=_now)

    user    = relationship("User",    back_populates="comment_likes")
    comment = relationship("Comment", back_populates="likes")


# ─── Notifications ────────────────────────────────────────────────────────────

class NotificationType(str, enum.Enum):
    REPLY   = "reply"   # someone replied to my comment
    LIKE    = "like"    # someone liked my comment
    VOTE    = "vote"    # someone voted on my album
    COMMENT = "comment" # someone commented on my album

class Notification(Base):
    __tablename__ = "notifications"

    id         = uuid_column(primary_key=True)
    user_id    = uuid_column(foreign_key="users.id")      # Recipient
    actor_id   = uuid_column(foreign_key="users.id", nullable=True) # Who did it
    type       = Column(SAEnum(NotificationType), nullable=False)
    
    # Context references
    album_id   = uuid_column(foreign_key="albums.id", nullable=True)
    photo_id   = uuid_column(foreign_key="photos.id", nullable=True)
    comment_id = uuid_column(foreign_key="comments.id", nullable=True)
    text       = Column(Text, nullable=True) # Preview text for comments/replies
    
    is_read    = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=_now)

    user       = relationship("User", foreign_keys=[user_id])
    actor      = relationship("User", foreign_keys=[actor_id])
