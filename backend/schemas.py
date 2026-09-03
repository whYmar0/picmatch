"""
schemas.py — Pydantic v2 schemas
Added: SharedAccessOut, SharedAlbumOut, CommentOut, CommentCreate, CommentLikeOut
Updated: UserOut gains avatar_url
"""
from datetime import datetime
from typing import Optional, List, Union
from pydantic import BaseModel, EmailStr, Field, field_validator, ConfigDict
import enum

AnyUUID = Union[str, object]


class UserRole(str, enum.Enum):
    CREATOR = "creator"
    VOTER   = "voter"

# ─── Auth ─────────────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    email:    EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8, max_length=100)
    role: UserRole = UserRole.CREATOR

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username may only contain letters, numbers, _ and -")
        return v

    @field_validator("password")
    @classmethod
    def password_valid(cls, v: str) -> str:
        if not any(char.isupper() for char in v):
            raise ValueError("Password must contain at least one uppercase letter")
        special_chars = "!@#$%^&*()_+-=[]{}|;':\",./<>?"
        if not any(char in special_chars for char in v):
            raise ValueError("Password must contain at least one special character")
        return v

class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str

class ResendVerificationRequest(BaseModel):
    email: EmailStr

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(..., min_length=8, max_length=100)

    @field_validator("password")
    @classmethod
    def password_valid(cls, v: str) -> str:
        if not any(char.isupper() for char in v):
            raise ValueError("Password must contain at least one uppercase letter")
        special_chars = "!@#$%^&*()_+-=[]{}|;':\",./<>?"
        if not any(char in special_chars for char in v):
            raise ValueError("Password must contain at least one special character")
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
    avatar_url: Optional[str] = None   # NEW: profile photo
    avatar_color: Optional[str] = None # NEW: random fallback color
    is_verified: bool = True
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
    media_type: str = "image"
    order:      int
    created_at: datetime

class VoterReaction(BaseModel):
    voter_id: AnyUUID
    username: str
    is_like:  bool

class PhotoStats(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:              AnyUUID
    filename:        str
    url:             str
    media_type:      str = "image"
    order:           int
    like_count:      int
    dislike_count:   int
    total_votes:     int
    like_percentage: float
    is_winner:       bool = False
    reactions:       List[VoterReaction] = []

# ─── Album ────────────────────────────────────────────────────────────────────

class AlbumCreate(BaseModel):
    title:       str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    is_public:   bool = True

class AlbumOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:          AnyUUID
    title:       str
    description: Optional[str] = None
    invite_code: str
    invite_url:  str
    is_active:   bool
    is_public:   bool = True
    photo_count: int
    total_votes: int
    created_at:  datetime
    creator:     UserOut
    photos:      List[PhotoOut] = []

class AlbumWithPhotos(AlbumOut):
    pass

class VoterSummary(BaseModel):
    voter_id:   AnyUUID
    username:   str
    vote_count: int

class AlbumAnalytics(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:               AnyUUID
    title:            str
    description:      Optional[str] = None
    creator_id:       AnyUUID
    creator:          Optional[UserOut] = None
    is_public:        bool = True
    # Only populated for PUBLIC albums — lets stats viewers reach the voting
    # page from "Recently visited". Never leaked for private albums.
    invite_code:      Optional[str] = None
    invite_url:       Optional[str] = None
    total_photos:     int
    total_votes:      int
    unique_voters:    int
    global_like_rate: float = 0.0
    voter_summaries:  List[VoterSummary] = []
    photos:           List[PhotoStats] = []
    winner:           Optional[PhotoStats] = None
    created_at:       datetime
    is_shared:        bool = False
    can_view_stats:   bool = False

# ─── SharedAccess ─────────────────────────────────────────────────────────────

class ShareAlbumRequest(BaseModel):
    """Body for granting shared access to another user."""
    username_or_email: str
    can_view_stats: bool = True

class SharedAccessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:             AnyUUID
    user:           UserOut
    can_view_stats: bool
    created_at:     datetime

class SharedAlbumOut(AlbumOut):
    """Album returned in the 'shared with me' list."""
    can_view_stats: bool = True

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

# ─── Comments ─────────────────────────────────────────────────────────────────

class CommentCreate(BaseModel):
    photo_id:  AnyUUID
    text:      str = Field(..., min_length=1, max_length=2000)
    parent_id: Optional[AnyUUID] = None
    reply_to_id: Optional[AnyUUID] = None

class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:         AnyUUID
    photo_id:   AnyUUID
    text:       str
    created_at: datetime
    author:     UserOut
    like_count: int
    liked_by_me: bool = False        # set at query time
    parent_id:  Optional[AnyUUID] = None
    replies:    List["CommentOut"] = []

CommentOut.model_rebuild()  # resolve forward ref

class CommentThreadOut(BaseModel):
    thread: List[CommentOut]
    is_public: bool
    is_owner: bool
    photo_url: Optional[str] = None

class CommentLikeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:         AnyUUID
    user_id:    AnyUUID
    comment_id: AnyUUID
    created_at: datetime

# ─── Notifications ────────────────────────────────────────────────────────────

class NotificationType(str, enum.Enum):
    REPLY   = "reply"
    VOTE    = "vote"
    COMMENT = "comment"

class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: AnyUUID
    type: NotificationType
    is_read: bool
    created_at: datetime

    actor: Optional[UserOut] = None
    album_id: Optional[AnyUUID] = None
    photo_id: Optional[AnyUUID] = None
    comment_id: Optional[AnyUUID] = None
    text: Optional[str] = None
    thumbnail_url: Optional[str] = None


# ─── Share Link ───────────────────────────────────────────────────────────────

class ShareTokenOut(BaseModel):
    """Response for album share-token creation / rotation."""
    share_token: str
    share_url:   str

# ─── Generic ──────────────────────────────────────────────────────────────────

class MessageResponse(BaseModel):
    message: str
    success: bool = True
