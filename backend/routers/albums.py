"""
routers/albums.py — Album management routes
Updated: analytics endpoint allows shared users (can_view_stats=True) to view.
Updated: video support and concurrent uploads.
"""
import asyncio
import logging
import os, uuid, secrets, io
from typing import List
from pathlib import Path
from PIL import Image

logger = logging.getLogger(__name__)

def compress_image(image_bytes: bytes, max_size: int = 1200, quality: int = 80) -> bytes:
    try:
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        out_io = io.BytesIO()
        img.save(out_io, format="JPEG", quality=quality, optimize=True)
        return out_io.getvalue()
    except Exception:
        return image_bytes

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from sqlalchemy.orm import selectinload

from database import get_db
from middleware.rate_limit import _get_limit, limiter
from models import User, Album, Photo, Vote, SharedAccess, Comment
from schemas import (
    AlbumOut, AlbumWithPhotos, AlbumAnalytics,
    PhotoStats, PhotoOut, MessageResponse,
    VoterReaction, VoterSummary,
)
from auth import get_current_user
from cloudinary_utils import (
    is_cloudinary_configured as _cloudinary_enabled,
    upload_image as _cloudinary_upload,
    delete_image as _cloudinary_delete,
    get_image_url as _cloudinary_url,
)

router = APIRouter(prefix="/albums", tags=["Albums"])

# Optional auth dependency — does NOT raise 401 if no token present
_bearer = HTTPBearer(auto_error=False)

async def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Returns the current user if a valid token is provided, else None."""
    if not credentials:
        return None
    from auth import decode_token
    payload = decode_token(credentials.credentials)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    from sqlalchemy import select as sa_select
    result = await db.execute(sa_select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    return user if (user and user.is_active) else None

BASE_DIR = Path(__file__).resolve().parent.parent
raw_upload_dir = os.getenv("UPLOAD_DIR", "./uploads")
if Path(raw_upload_dir).is_absolute():
    UPLOAD_DIR = Path(raw_upload_dir)
else:
    UPLOAD_DIR = BASE_DIR / raw_upload_dir
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

BASE_URL     = os.getenv("BASE_URL",     "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB per file
ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/webm", "video/quicktime", "video/avi",
}


def _s(v) -> str:
    return str(v)

def photo_url(stored: str, media_type: str = "image") -> str:
    if _cloudinary_enabled():
        return _cloudinary_url(stored, resource_type="video" if media_type == "video" else "image")
    return f"{BASE_URL}/uploads/{stored}"

def photo_to_out(p: Photo) -> PhotoOut:
    return PhotoOut(id=p.id, filename=p.filename,
                    url=photo_url(p.stored_filename, media_type=p.media_type or "image"),
                    media_type=p.media_type or "image",
                    order=p.order, created_at=p.created_at)

def album_to_out(album: Album, creator: User | None = None, total_votes: int = 0) -> AlbumOut:
    resolved_creator = album.creator or creator
    return AlbumOut(
        id=album.id, title=album.title, description=album.description,
        invite_code=album.invite_code,
        invite_url=f"{FRONTEND_URL}/vote/{album.invite_code}",
        is_active=album.is_active,
        is_public=album.is_public,
        photo_count=len(album.photos),
        total_votes=total_votes,
        created_at=album.created_at,
        creator=resolved_creator,
        photos=[photo_to_out(p) for p in album.photos],
    )


def _safe_extension(filename: str | None) -> str:
    if not filename:
        return ""
    from pathlib import Path as _Path
    return _Path(filename).suffix.lower()


def _ext_for_mime(content_type: str | None) -> str:
    mapping = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "video/mp4": ".mp4",
        "video/webm": ".webm",
        "video/quicktime": ".mov",
        "video/avi": ".avi",
    }
    return mapping.get(content_type or "", "")


# Extension → set of accepted MIME types. Used as a fallback when a browser
# reports a generic or missing Content-Type but the filename has a known extension.
ALLOWED_EXTENSIONS = {
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".png": {"image/png"},
    ".webp": {"image/webp"},
    ".gif": {"image/gif"},
    ".mp4": {"video/mp4"},
    ".webm": {"video/webm"},
    ".mov": {"video/quicktime"},
    ".avi": {"video/avi"},
}


def _normalize_content_type(content_type: str | None) -> str | None:
    """Strip codecs/parameters from a Content-Type header value.

    Browsers may send values like `video/mp4; codecs="avc1.42E01E"` or
    `video/mp4; codecs=avc1.42E01E`. We only care about the base MIME type.
    """
    if not content_type:
        return None
    return content_type.split(";")[0].strip().lower() or None


def _is_allowed_type(content_type: str | None, filename: str | None) -> bool:
    """Return True if the upload is an allowed image or video.

    Browsers usually send a Content-Type, but some devices (e.g. iOS) or
    renamed files may arrive with a generic or missing type. As a fallback,
    we also accept files whose extension maps to a known allowed MIME type.
    """
    base = _normalize_content_type(content_type)
    if base in ALLOWED_TYPES:
        return True
    ext = _safe_extension(filename)
    if ext in ALLOWED_EXTENSIONS:
        # Accept missing content type or generic binary types for known extensions.
        return base in (None, "", "application/octet-stream", "binary/octet-stream")
    return False


async def _process_upload(f: UploadFile, idx: int) -> dict:
    """Read, validate, optionally compress, and upload a single file."""
    base_content_type = _normalize_content_type(f.content_type)

    if not _is_allowed_type(f.content_type, f.filename):
        # Debug logging to diagnose mismatches in production.
        logger.warning(
            "[UPLOAD REJECTED] filename=%r, raw_content_type=%r, base=%r, allowed=%s",
            f.filename, f.content_type, base_content_type, ALLOWED_TYPES,
        )
        raise HTTPException(400, detail=f"'{f.content_type}' not allowed")

    content = await f.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, detail=f"'{f.filename}' exceeds 50 MB")

    is_video = base_content_type.startswith("video/") if base_content_type else False
    media_type = "video" if is_video else "image"

    if is_video:
        # Preserve original extension for local storage; Cloudinary uses public_id.
        ext = _safe_extension(f.filename) or _ext_for_mime(base_content_type)
        stored_ext = ext or ".mp4"
    else:
        content = compress_image(content)
        stored_ext = ".jpg"

    if _cloudinary_enabled():
        stored = f"picmatch/{uuid.uuid4()}"
        # Cloudinary SDK is blocking; run in thread pool to avoid stalling event loop.
        await asyncio.to_thread(_cloudinary_upload, content, public_id=stored)
    else:
        stored = f"{uuid.uuid4()}{stored_ext}"
        def _write():
            with open(UPLOAD_DIR / stored, "wb") as f:
                f.write(content)
        await asyncio.to_thread(_write)

    return {
        "idx": idx,
        "filename": f.filename or stored,
        "stored": stored,
        "media_type": media_type,
    }


@router.post("/", response_model=AlbumWithPhotos, status_code=status.HTTP_201_CREATED)
@limiter.limit(_get_limit("RATE_LIMIT_ALBUM_CREATE", "10/hour"))
async def create_album(
    request: Request,
    title: str = Form(...),
    description: str = Form(None),
    is_public: bool = Form(True),
    photos: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not photos:
        raise HTTPException(400, detail="At least one photo or video is required")

    album = Album(title=title, description=description,
                  invite_code=secrets.token_urlsafe(16),
                  is_public=is_public,
                  creator_id=_s(current_user.id))
    db.add(album)
    await db.flush()

    # Process all uploads concurrently to reduce proxy timeout risk.
    try:
        results = await asyncio.gather(*[_process_upload(f, i) for i, f in enumerate(photos)])
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, detail=f"Upload failed: {exc}")

    results.sort(key=lambda r: r["idx"])
    for row in results:
        db.add(Photo(
            album_id=_s(album.id),
            filename=row["filename"],
            stored_filename=row["stored"],
            media_type=row["media_type"],
            order=row["idx"],
        ))

    await db.flush()
    await db.commit()
    result = await db.execute(
        select(Album)
        .options(selectinload(Album.photos), selectinload(Album.creator))
        .where(Album.id == _s(album.id))
    )
    return album_to_out(result.scalar_one(), creator=current_user)


@router.get("/my", response_model=List[AlbumOut])
async def get_my_albums(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Album)
        .options(selectinload(Album.photos), selectinload(Album.creator))
        .where(Album.creator_id == _s(current_user.id))
        .order_by(Album.created_at.desc())
    )
    albums = result.scalars().all()

    # Compute total votes per album in one query
    album_ids = [_s(a.id) for a in albums]
    vote_count_map = {}
    if album_ids:
        vote_counts = await db.execute(
            select(Photo.album_id, func.count(Vote.id))
            .join(Vote, Vote.photo_id == Photo.id)
            .where(Photo.album_id.in_(album_ids))
            .group_by(Photo.album_id)
        )
        vote_count_map = {str(album_id): count for album_id, count in vote_counts.all()}

    return [album_to_out(a, total_votes=vote_count_map.get(str(a.id), 0)) for a in albums]


@router.get("/invite/{invite_code}", response_model=AlbumWithPhotos)
async def get_album_by_invite(
    invite_code: str,
    # Public endpoint — works with or without a token
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Album)
        .options(selectinload(Album.photos), selectinload(Album.creator))
        .where(and_(Album.invite_code == invite_code, Album.is_active == True))  # noqa
    )
    album = result.scalar_one_or_none()
    if not album:
        raise HTTPException(404, detail="Album not found or invite link has expired")
    return album_to_out(album)


@router.get("/{album_id}/analytics", response_model=AlbumAnalytics)
async def get_album_analytics(
    album_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns analytics. Accessible by:
      1. The album owner (full access)
      2. Any user with a SharedAccess record where can_view_stats=True (read-only)

    OPTIMIZED v2: 2 queries instead of eager-loading all Vote/User ORM objects.
    Fetches raw vote columns and aggregates in O(n) Python pass.
    """
    uid = _s(current_user.id)

    # 1. Fetch album + photos + creator (no votes eager-loaded)
    result = await db.execute(
        select(Album)
        .options(selectinload(Album.photos), selectinload(Album.creator))
        .where(Album.id == album_id)
    )
    album = result.scalar_one_or_none()
    if not album:
        raise HTTPException(404, detail="Album not found")

    is_owner = _s(album.creator_id) == uid

    if not is_owner and not album.is_public:
        raise HTTPException(403, detail="Access denied. This album is private.")

    # M1 fix (code-review): previously hardcoded `can_view_stats = True` for
    # any authenticated viewer of a public album, which made the privacy gate
    # in `_build_analytics` a no-op on this route. Now we compute it correctly:
    #   • owner                                → can_view_stats=True
    #   • explicit SharedAccess(can_view_stats)→ can_view_stats=<the-bit>
    #   • anyone else                          → can_view_stats=False
    #                                          → builder strips voter identities
    is_shared = False
    can_view_stats = is_owner
    if not is_owner:
        sa_res = await db.execute(
            select(SharedAccess).where(
                and_(
                    SharedAccess.user_id == _s(current_user.id),
                    SharedAccess.album_id == album_id,
                )
            )
        )
        sa = sa_res.scalar_one_or_none()
        if sa:
            is_shared = True
            can_view_stats = sa.can_view_stats

    return await _build_analytics(
        album=album, db=db, is_shared=is_shared, can_view_stats=can_view_stats,
    )


@router.get("/{album_id}/my-comments")
async def get_my_comments_in_album(
    album_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns info about the current user's first comment thread in an album.
    Used by the "Recently Visited" feature to open a LockedCommentSheet
    when the user has no analytics access but did participate in comments.
    Response: { has_comments: bool, comment_id: str|None, photo_id: str|None, photo_url: str|None }
    """
    from sqlalchemy.orm import selectinload as sil
    uid = _s(current_user.id)

    # Find the album's photos
    album_res = await db.execute(
        select(Album)
        .options(selectinload(Album.photos))
        .where(Album.id == album_id)
    )
    album = album_res.scalar_one_or_none()
    if not album:
        raise HTTPException(404, detail="Album not found")

    photo_ids = [_s(p.id) for p in album.photos]
    if not photo_ids:
        return {"has_comments": False, "comment_id": None, "photo_id": None, "photo_url": None}

    # Find user's oldest comment in this album (any photo, root level)
    from sqlalchemy import or_
    comment_res = await db.execute(
        select(Comment)
        .where(
            and_(
                Comment.photo_id.in_(photo_ids),
                Comment.user_id == uid,
                Comment.parent_id == None,  # noqa — root comments only
            )
        )
        .order_by(Comment.created_at.asc())
        .limit(1)
    )
    first_comment = comment_res.scalar_one_or_none()
    if not first_comment:
        return {"has_comments": False, "comment_id": None, "photo_id": None, "photo_url": None}

    # Get photo URL
    photo = next((p for p in album.photos if _s(p.id) == _s(first_comment.photo_id)), None)
    photo_url_val = photo_url(photo.stored_filename) if photo else None

    return {
        "has_comments": True,
        "comment_id": _s(first_comment.id),
        "photo_id": _s(first_comment.photo_id),
        "photo_url": photo_url_val,
    }


@router.delete("/{album_id}", response_model=MessageResponse)
async def delete_album(
    album_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Album).options(selectinload(Album.photos))
        .where(and_(Album.id == album_id, Album.creator_id == _s(current_user.id)))
    )
    album = result.scalar_one_or_none()
    if not album:
        raise HTTPException(404, detail="Album not found or access denied")

    for photo in album.photos:
        if _cloudinary_enabled():
            _cloudinary_delete(photo.stored_filename, resource_type="video" if photo.media_type == "video" else "image")
        else:
            p = UPLOAD_DIR / photo.stored_filename
            if p.exists():
                p.unlink()
    await db.delete(album)
    await db.commit()
    return MessageResponse(message="Album deleted successfully")


@router.patch("/{album_id}/privacy", response_model=AlbumOut)
async def toggle_album_privacy(
    album_id: str,
    is_public: bool = Form(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggles album's public/private status."""
    result = await db.execute(
        select(Album)
        .options(selectinload(Album.photos), selectinload(Album.creator))
        .where(and_(Album.id == album_id, Album.creator_id == _s(current_user.id)))
    )
    album = result.scalar_one_or_none()
    if not album:
        raise HTTPException(404, detail="Album not found or access denied")

    album.is_public = is_public
    await db.commit()
    await db.refresh(album)
    return album_to_out(album)


# ─── Analytics builder (shared by /albums/{id}/analytics and share-link route) ──

async def _build_analytics(
    album: Album,
    db: AsyncSession,
    is_shared: bool,
    can_view_stats: bool,
) -> AlbumAnalytics:
    """
    Pure builder that takes an already-loaded `album` (with `.photos` and
    `.creator` populated) and produces the AlbumAnalytics response. The
    owner/access gating is the caller's responsibility — this function
    only does the aggregation so ./share_links.py can reuse it without
    duplicating ~80 lines of vote/photo/winner math.
    """
    photos = album.photos
    photo_ids = [p.id for p in photos]

    # Fetch raw vote rows (columns only, no ORM objects) in one query
    total_likes = 0
    total_votes = 0
    voter_map: dict = {}
    photo_data: dict = {}

    if photo_ids:
        vote_query = (
            select(Vote.photo_id, Vote.voter_id, Vote.is_like, User.username)
            .join(User, Vote.voter_id == User.id)
            .where(Vote.photo_id.in_(photo_ids))
        )
        vote_rows = await db.execute(vote_query)

        for p in photos:
            photo_data[_s(p.id)] = {"photo": p, "likes": 0, "total": 0, "reactions": []}

        # Single O(n) pass through all votes
        for row in vote_rows:
            row_photo_id, row_voter_id, row_is_like, row_username = row
            pid = _s(row_photo_id)
            vid = _s(row_voter_id)
            uname = row_username or vid[:8]

            if pid not in photo_data:
                continue

            pd = photo_data[pid]
            pd["total"] += 1
            total_votes += 1
            if row_is_like:
                pd["likes"] += 1
                total_likes += 1

            pd["reactions"].append(
                VoterReaction(voter_id=vid, username=uname, is_like=row_is_like)
            )

            if vid not in voter_map:
                voter_map[vid] = {"username": uname, "vote_count": 0, "voter_id": vid}
            voter_map[vid]["vote_count"] += 1

    # Build photo_stats from aggregated data
    photo_stats: List[PhotoStats] = []
    for p in photos:
        pid = _s(p.id)
        if pid in photo_data:
            pd = photo_data[pid]
            likes = pd["likes"]
            total = pd["total"]
            dislikes = total - likes
            pct = round((likes / total * 100), 1) if total else 0.0
            photo_stats.append(PhotoStats(
                id=p.id, filename=p.filename,
                url=photo_url(p.stored_filename, media_type=p.media_type or "image"),
                media_type=p.media_type or "image",
                order=p.order,
                like_count=likes, dislike_count=dislikes,
                total_votes=total, like_percentage=pct,
                is_winner=False,
                reactions=pd["reactions"],
            ))
        else:
            photo_stats.append(PhotoStats(
                id=p.id, filename=p.filename,
                url=photo_url(p.stored_filename, media_type=p.media_type or "image"),
                media_type=p.media_type or "image",
                order=p.order,
                like_count=0, dislike_count=0,
                total_votes=0, like_percentage=0.0,
                is_winner=False,
                reactions=[],
            ))

    # Winner
    winner = None
    voted = [ps for ps in photo_stats if ps.total_votes > 0]
    if voted:
        best = max(voted, key=lambda ps: (ps.like_percentage, ps.total_votes))
        best.is_winner = True
        winner = best

    global_like_rate = round((total_likes / total_votes) * 100, 1) if total_votes else 0.0

    # ── Privacy gate — OWASP A01 / data-minimization ───────────────────────────
    # `can_view_stats` is the contract this builder already accepts:
    #   True  → owner OR a user with SharedAccess(can_view_stats=True)
    #   False → any other authenticated viewer, including public-album browsers
    #
    # Voter identities (WHO voted, and HOW they voted on each photo) are
    # sensitive. Aggregate counts (likes/total per photo) are not. The
    # public-album "browse" path was leaking per-voter reactions to every
    # registered user — minimum-necessary says: strip identities, keep
    # totals. Recipients who passed the explicit auth check above still
    # see everything.
    photo_stats_out: List[PhotoStats] = []
    for ps in photo_stats:
        if can_view_stats:
            photo_stats_out.append(ps)
        else:
            # Strip the reactions field; counts + percentages are preserved.
            ps_anonymised = ps.model_copy(update={"reactions": []})
            photo_stats_out.append(ps_anonymised)

    if can_view_stats:
        voter_summaries = [
            VoterSummary(voter_id=v["voter_id"], username=v["username"], vote_count=v["vote_count"])
            for v in sorted(voter_map.values(), key=lambda x: x["vote_count"], reverse=True)
        ]
    else:
        voter_summaries = []  

    return AlbumAnalytics(
        id=album.id, title=album.title, description=album.description,
        creator_id=album.creator_id,
        creator=album.creator,
        is_public=album.is_public,
        total_photos=len(photos),
        total_votes=total_votes, unique_voters=len(voter_map),
        global_like_rate=global_like_rate,
        voter_summaries=voter_summaries,
        photos=photo_stats_out, winner=winner,
        created_at=album.created_at,
        is_shared=is_shared,
        can_view_stats=can_view_stats,
    )
