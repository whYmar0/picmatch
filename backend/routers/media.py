"""Authorized local/Cloudinary media. No origin URLs leave this module."""
import asyncio
import hashlib
import mimetypes
import os
import re
import uuid
from email.utils import formatdate
from pathlib import Path
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request as OriginRequest, build_opener

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse
from PIL import Image, ImageOps
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.background import BackgroundTask

from auth import get_optional_current_user
from cloudinary_utils import is_cloudinary_configured as _cloudinary_enabled, get_album_media_url
from database import get_db
from media_access import issue_media_ticket, media_ticket_user, media_url, require_album_media_access
from middleware.rate_limit import limiter, _get_limit
from models import PendingUpload, Photo, User

router = APIRouter(prefix="/media", tags=["Media"])
legacy_router = APIRouter(tags=["Public avatars"])
raw_upload_dir = Path(os.getenv("UPLOAD_DIR", "./uploads"))
UPLOAD_DIR = raw_upload_dir if raw_upload_dir.is_absolute() else Path(__file__).resolve().parent.parent / raw_upload_dir
Variant = Literal["display", "thumbnail"]
PRIVATE_HEADERS = {"Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer"}
RANGE = re.compile(r"bytes=(\d{0,20})-(\d{0,20})")
MEDIA_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
               ".gif": "image/gif", ".webp": "image/webp", ".mp4": "video/mp4",
               ".webm": "video/webm", ".mov": "video/quicktime", ".avi": "video/x-msvideo"}


async def _photo(photo_id, db):
    photo = await db.scalar(select(Photo).where(Photo.id == str(photo_id)).options(selectinload(Photo.album)))
    if not photo or not photo.album:
        raise HTTPException(404, "Media not found")
    return photo


@router.get("/{photo_id}/access")
@limiter.limit(_get_limit("RATE_LIMIT_MEDIA_ACCESS", "300/minute"))
async def get_media_access(request: Request, photo_id: uuid.UUID, variant: Variant = "display", invite: str | None = Query(None, max_length=128),
                           user=Depends(get_optional_current_user), db: AsyncSession = Depends(get_db)):
    photo = await _photo(photo_id, db)
    await require_album_media_access(photo.album, user, db, code=invite)
    if user is None or invite:
        return {"url": media_url(photo.id, variant=variant, invite=invite, media_type=photo.media_type), "expires_at": None}
    token, expires_at = issue_media_ticket(user, photo.id, variant, album=photo.album)
    return {"url": media_url(photo.id, variant=variant, ticket=token, media_type=photo.media_type), "expires_at": expires_at}


def _range_bounds(value, size):
    match = RANGE.fullmatch(value or "")
    if not match or not any(match.groups()) or size == 0:
        raise HTTPException(416, "Invalid range", headers={"Content-Range": f"bytes */{size}"})
    first, last = match.groups()
    if not first:
        suffix = int(last)
        if suffix == 0:
            raise HTTPException(416, "Invalid range", headers={"Content-Range": f"bytes */{size}"})
        return max(0, size - suffix), size - 1
    start = int(first)
    end = min(int(last), size - 1) if last else size - 1
    if start >= size or end < start:
        raise HTTPException(416, "Invalid range", headers={"Content-Range": f"bytes */{size}"})
    return start, end


def _read_local(path, start, length):
    with path.open("rb") as source:
        source.seek(start)
        while length:
            block = source.read(min(length, 64 * 1024))
            if not block:
                break
            length -= len(block)
            yield block


def _local_response(path, request):
    if not path.is_file():
        raise HTTPException(404, "Media not found")
    stat = path.stat()
    etag = '"' + hashlib.sha256(f"{stat.st_mtime_ns}:{stat.st_size}".encode()).hexdigest() + '"'
    modified = formatdate(stat.st_mtime, usegmt=True)
    start, end, status = 0, stat.st_size - 1, 200
    byte_range = request.headers.get("range")
    if byte_range and request.headers.get("if-range", etag) in (etag, modified):
        start, end = _range_bounds(byte_range, stat.st_size)
        status = 206
    headers = {**PRIVATE_HEADERS, "Accept-Ranges": "bytes", "ETag": etag,
               "Last-Modified": modified, "Content-Length": str(max(0, end - start + 1))}
    if status == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{stat.st_size}"
    content_type = MEDIA_TYPES.get(path.suffix.lower()) or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    if request.method == "HEAD":
        return Response(status_code=status, headers=headers, media_type=content_type)
    iterator = _read_local(path, start, end - start + 1)
    return StreamingResponse(iterator, status_code=status, headers=headers, media_type=content_type,
                             background=BackgroundTask(iterator.close))


def _thumbnail(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f"{uuid.uuid4().hex}.tmp")
    try:
        with Image.open(source) as image:
            image = ImageOps.exif_transpose(image)
            image.thumbnail((480, 480), Image.Resampling.LANCZOS)
            image.save(temporary, format="WEBP", quality=80, method=4)
        temporary.replace(target)
    except (OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(415, "Cannot create thumbnail")
    finally:
        temporary.unlink(missing_ok=True)


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _open_cloudinary(url, method, byte_range, if_range):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "res.cloudinary.com" or parsed.username or parsed.password:
        raise ValueError("Invalid media origin")
    headers = {"Accept-Encoding": "identity"}
    if byte_range:
        headers["Range"] = byte_range
    if if_range:
        headers["If-Range"] = if_range
    return build_opener(_NoRedirect()).open(OriginRequest(url, headers=headers, method=method), timeout=30)


def _read_origin(source):
    try:
        while block := source.read(64 * 1024):
            yield block
    finally:
        source.close()


def _close_late_open(opening):
    if not opening.cancelled():
        try:
            source = opening.result()
        except Exception:
            return
        asyncio.get_running_loop().run_in_executor(None, source.close)


async def _cloud_response(photo, variant, request):
    if photo.cloudinary_delivery_type != "authenticated":
        raise HTTPException(503, "Media storage migration required")
    byte_range = request.headers.get("range")
    if byte_range and (not RANGE.fullmatch(byte_range) or byte_range == "bytes=-"):
        raise HTTPException(416, "Invalid range")
    if_range = request.headers.get("if-range")
    if if_range and (len(if_range) > 128 or "\r" in if_range or "\n" in if_range):
        raise HTTPException(400, "Invalid range validator")
    try:
        url = get_album_media_url(photo.stored_filename, media_type=photo.media_type, thumbnail=variant == "thumbnail")
        opening = asyncio.create_task(asyncio.to_thread(_open_cloudinary, url, request.method, byte_range, if_range))
        try:
            source = await asyncio.shield(opening)
        except asyncio.CancelledError:
            # Cancelling the request cannot cancel a blocking socket open in its thread.
            opening.add_done_callback(_close_late_open)
            raise
    except HTTPError as error:
        content_range = error.headers.get("Content-Range") if error.headers else None
        error.close()
        if error.code == 416:
            return Response(status_code=416, headers={**PRIVATE_HEADERS, **({"Content-Range": content_range} if content_range else {})})
        raise HTTPException(502, "Media origin unavailable")
    except (OSError, URLError, ValueError):
        raise HTTPException(502, "Media origin unavailable")
    if source.status not in (200, 206):
        await asyncio.to_thread(source.close)
        raise HTTPException(502, "Media origin unavailable")
    headers = {**PRIVATE_HEADERS}
    for key in ("Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"):
        if source.headers.get(key):
            headers[key] = source.headers[key]
    if request.method == "HEAD":
        await asyncio.to_thread(source.close)
        return Response(status_code=source.status, headers=headers)
    return StreamingResponse(_read_origin(source), status_code=source.status, headers=headers,
                             background=BackgroundTask(source.close))


@router.api_route("/{photo_id}", methods=["GET", "HEAD"])
async def read_media(request: Request, photo_id: uuid.UUID, variant: Variant = "display", ticket: str | None = Query(None, max_length=2048), invite: str | None = Query(None, max_length=128),
                     user=Depends(get_optional_current_user), db: AsyncSession = Depends(get_db)):
    photo = await _photo(photo_id, db)
    if ticket:
        user = await media_ticket_user(ticket, photo.id, variant, db, album=photo.album)
    await require_album_media_access(photo.album, user, db, code=invite)
    if _cloudinary_enabled():
        return await _cloud_response(photo, variant, request)
    root = UPLOAD_DIR.resolve()
    path = (root / photo.stored_filename).resolve()
    if path.parent != root or not path.is_file():
        raise HTTPException(404, "Media not found")
    if variant == "thumbnail" and photo.media_type != "video":
        thumb = root / "thumbnails" / f"thumb_{path.name}.webp"
        if not thumb.exists():
            await asyncio.to_thread(_thumbnail, path, thumb)
        path = thumb
    return _local_response(path, request)


@legacy_router.api_route("/uploads/{filename:path}", methods=["GET", "HEAD"])
async def public_avatar(request: Request, filename: str, db: AsyncSession = Depends(get_db)):
    if not re.fullmatch(r"avatar_[0-9a-f-]{36}\.jpg", filename):
        raise HTTPException(404, "File not found")
    # A matching avatar row cannot republish an album or pending upload.
    if await db.scalar(select(Photo.id).where(Photo.stored_filename == filename)) or await db.scalar(select(PendingUpload.id).where(PendingUpload.stored_filename == filename)):
        raise HTTPException(404, "File not found")
    if not await db.scalar(select(User.id).where(User.avatar_url.endswith("/uploads/" + filename, autoescape=True))):
        raise HTTPException(404, "File not found")
    root = UPLOAD_DIR.resolve()
    path = (root / filename).resolve()
    if path.parent != root:
        raise HTTPException(404, "File not found")
    return _local_response(path, request)
