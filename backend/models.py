"""
models.py — SQLAlchemy модели / SQLAlchemy database models
Совместимы с SQLite (локально) и PostgreSQL (продакшн)
Compatible with SQLite (local) and PostgreSQL (production)
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import relationship
import enum

from database import Base, IS_SQLITE

# UUID хранится как String в SQLite, как нативный UUID в PostgreSQL
# UUID stored as String in SQLite, native UUID in PostgreSQL
if IS_SQLITE:
    from sqlalchemy import String as UUIDType
    def new_uuid():
        return str(uuid.uuid4())
else:
    from sqlalchemy.dialects.postgresql import UUID as PgUUID
    def _uuid_col():
        return PgUUID(as_uuid=True)
    def new_uuid():
        return uuid.uuid4()

def uuid_column(primary_key=False, foreign_key=None):
    """Creates a UUID column compatible with both SQLite and PostgreSQL."""
    if IS_SQLITE:
        if foreign_key:
            return Column(String(36), ForeignKey(foreign_key, ondelete="CASCADE"),
                         nullable=False, index=True)
        return Column(String(36), primary_key=primary_key,
                     default=lambda: str(uuid.uuid4()), index=not primary_key)
    else:
        from sqlalchemy.dialects.postgresql import UUID as PgUUID
        if foreign_key:
            return Column(PgUUID(as_uuid=True), ForeignKey(foreign_key, ondelete="CASCADE"),
                         nullable=False, index=True)
        return Column(PgUUID(as_uuid=True), primary_key=primary_key,
                     default=uuid.uuid4, index=not primary_key)


class UserRole(str, enum.Enum):
    CREATOR = "creator"
    VOTER   = "voter"


class User(Base):
    __tablename__ = "users"

    id             = uuid_column(primary_key=True)
    email          = Column(String(255), unique=True, nullable=False, index=True)
    username       = Column(String(100), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role           = Column(SAEnum(UserRole), default=UserRole.VOTER, nullable=False)
    is_active      = Column(Boolean, default=True)
    created_at     = Column(DateTime, default=datetime.utcnow)

    albums = relationship("Album", back_populates="creator", cascade="all, delete-orphan")
    votes  = relationship("Vote",  back_populates="voter",   cascade="all, delete-orphan")


class Album(Base):
    __tablename__ = "albums"

    id          = uuid_column(primary_key=True)
    title       = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    invite_code = Column(String(32), unique=True, nullable=False, index=True)
    creator_id  = uuid_column(foreign_key="users.id")
    is_active   = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)

    creator = relationship("User",  back_populates="albums")
    photos  = relationship("Photo", back_populates="album",
                           cascade="all, delete-orphan", order_by="Photo.order")


class Photo(Base):
    __tablename__ = "photos"

    id              = uuid_column(primary_key=True)
    album_id        = uuid_column(foreign_key="albums.id")
    filename        = Column(String(500), nullable=False)
    stored_filename = Column(String(500), nullable=False)
    order           = Column(Integer, default=0)
    created_at      = Column(DateTime, default=datetime.utcnow)

    album = relationship("Album", back_populates="photos")
    votes = relationship("Vote",  back_populates="photo", cascade="all, delete-orphan")

    @property
    def like_count(self):    return sum(1 for v in self.votes if v.is_like)
    @property
    def dislike_count(self): return sum(1 for v in self.votes if not v.is_like)
    @property
    def total_votes(self):   return len(self.votes)
    @property
    def like_percentage(self):
        return round((self.like_count / self.total_votes) * 100, 1) if self.total_votes else 0.0


class Vote(Base):
    __tablename__ = "votes"

    id         = uuid_column(primary_key=True)
    photo_id   = uuid_column(foreign_key="photos.id")
    voter_id   = uuid_column(foreign_key="users.id")
    is_like    = Column(Boolean, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    photo = relationship("Photo", back_populates="votes")
    voter = relationship("User",  back_populates="votes")
