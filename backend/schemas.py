"""
schemas.py — Pydantic v2 schemas
All fields use Union[UUID, str] for SQLite/PostgreSQL dual compatibility.
New: VoterReaction, global_like_rate, voter_usernames in analytics.
"""
from datetime import datetime
from typing import Optional, List, Union
from pydantic import BaseModel, EmailStr, Field, field_validator, ConfigDict
import enum

AnyUUID = Union[str, object]  # accepts UUID or str from SQLite


class UserRole(str, enum.Enum):
    CREATOR = "creator"
    VOTER   = "voter"

# ─── Auth ─────────────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    email:    EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)
    # Role is always creator now (unified auth) — kept for DB compat only
    role: UserRole = UserRole.CREATOR

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

# ─── Photo ────────────────────────────────────────────────────────────────────

class PhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:         AnyUUID
    filename:   str
    url:        str
    order:      int
    created_at: datetime

class VoterReaction(BaseModel):
    """Individual voter reaction — used in bottom-sheet per-photo drill-down."""
    voter_id: AnyUUID
    username: str
    is_like:  bool

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
    reactions:       List[VoterReaction] = []  # per-voter list for bottom sheet

# ─── Album ────────────────────────────────────────────────────────────────────

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
    photos:      List[PhotoOut] = []

class AlbumWithPhotos(AlbumOut):
    pass

class VoterSummary(BaseModel):
    """Voter in the album-level icon-row list."""
    voter_id:    AnyUUID
    username:    str
    vote_count:  int  # how many photos they voted on

class AlbumAnalytics(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:               AnyUUID
    title:            str
    description:      Optional[str] = None
    total_photos:     int
    total_votes:      int
    unique_voters:    int
    global_like_rate: float = 0.0   # total_likes / total_votes * 100
    voter_summaries:  List[VoterSummary] = []  # for the icon-row voters bottom sheet
    photos:           List[PhotoStats] = []
    winner:           Optional[PhotoStats] = None
    created_at:       datetime

# ─── Votes ────────────────────────────────────────────────────────────────────

class VoteCreate(BaseModel):
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
    album_id:        AnyUUID
    voted_photo_ids: List[AnyUUID] = []
    total_photos:    int
    voted_count:     int
    is_complete:     bool

# ─── Generic ──────────────────────────────────────────────────────────────────

class MessageResponse(BaseModel):
    message: str
    success: bool = True
