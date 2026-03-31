"""
schemas.py — Pydantic v2 схемы / Pydantic v2 schemas
Fully compatible with Pydantic v2 and SQLite string UUIDs
"""

from datetime import datetime
from typing import Optional, List, Any, Union
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, field_validator, ConfigDict
import enum


# ─── Enums ────────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    CREATOR = "creator"
    VOTER   = "voter"


# ─── Helpers ──────────────────────────────────────────────────────────────────

# SQLite returns UUIDs as strings; PostgreSQL returns UUID objects.
# Using Union[UUID, str] lets Pydantic accept both without coercion errors.
AnyUUID = Union[UUID, str]


# ─── Auth Schemas ─────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    email:    EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)
    role:     UserRole = UserRole.VOTER

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username may only contain letters, numbers, _ and -")
        return v


class UserLogin(BaseModel):
    email:    EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:         AnyUUID
    email:      str
    username:   str
    role:       UserRole
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user:         UserOut


# ─── Photo Schemas ────────────────────────────────────────────────────────────

class PhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:         AnyUUID
    filename:   str
    url:        str       # Computed URL — injected by router, not ORM field
    order:      int
    created_at: datetime


class PhotoStats(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:              AnyUUID
    filename:        str
    url:             str
    order:           int
    like_count:      int
    dislike_count:   int
    total_votes:     int
    like_percentage: float
    is_winner:       bool = False


# ─── Album Schemas ────────────────────────────────────────────────────────────

class AlbumCreate(BaseModel):
    title:       str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)


class AlbumOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:          AnyUUID
    title:       str
    description: Optional[str] = None
    invite_code: str
    invite_url:  str
    is_active:   bool
    photo_count: int
    created_at:  datetime
    creator:     UserOut
    # Always included so AlbumCard can render preview thumbnails
    photos:      List[PhotoOut] = []


class AlbumWithPhotos(AlbumOut):
    """Alias kept for backwards compat — AlbumOut already includes photos."""
    pass


class AlbumAnalytics(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:             AnyUUID
    title:          str
    description:    Optional[str] = None
    total_photos:   int
    total_votes:    int
    unique_voters:  int
    photos:         List[PhotoStats] = []
    winner:         Optional[PhotoStats] = None
    created_at:     datetime


# ─── Vote Schemas ─────────────────────────────────────────────────────────────

class VoteCreate(BaseModel):
    # Accept both UUID and str so both SQLite string IDs and UUID objects work
    photo_id: AnyUUID
    is_like:  bool


class VoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:         AnyUUID
    photo_id:   AnyUUID
    voter_id:   AnyUUID
    is_like:    bool
    created_at: datetime


class SwipeSession(BaseModel):
    album_id:         AnyUUID
    voted_photo_ids:  List[AnyUUID] = []
    total_photos:     int
    voted_count:      int
    is_complete:      bool


# ─── Generic ──────────────────────────────────────────────────────────────────

class MessageResponse(BaseModel):
    message: str
    success: bool = True
