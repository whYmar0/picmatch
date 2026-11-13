"""Owner-scoped upload receipts and lifecycle; no provider URLs cross this boundary."""
import hashlib
import json
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from cloudinary_utils import is_cloudinary_configured
from models import AlbumUploadDraft, AlbumUploadItem, User

ACTIVE = ("uploading", "ready", "cancelling")
EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
              "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov", "video/avi": ".avi"}


def now():
    return datetime.now(timezone.utc)


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


async def owned(db, owner, draft_id, *, lock=False):
    query = select(AlbumUploadDraft).where(AlbumUploadDraft.id == str(draft_id))
    if lock:
        query = query.with_for_update()
    draft = await db.scalar(query.execution_options(populate_existing=True))
    if draft is None or str(draft.user_id) != str(owner.id):
        raise HTTPException(404, "Draft not found")
    return draft


def expire(draft):
    if draft.status in ("uploading", "ready") and utc(draft.expires_at) <= now():
        draft.status = "expired"


async def draft_out(db, draft, item_id=None):
    query = select(AlbumUploadItem).where(AlbumUploadItem.draft_id == str(draft.id)).order_by(AlbumUploadItem.order)
    items = list((await db.scalars(query)).all())
    filtered = items if item_id is None else [item for item in items if item.item_id == str(item_id)]
    if item_id is not None and not filtered:
        raise HTTPException(404, "Item not found")
    return {"id": str(draft.id), "title": draft.title, "description": draft.description,
            "is_public": draft.is_public, "status": draft.status, "total_size": draft.total_size,
            "item_count": len(items), "uploaded_count": sum(item.status == "uploaded" for item in items),
            "expires_at": utc(draft.expires_at).isoformat(), "album_id": draft.album_id,
            "items": [item_out(item) for item in filtered]}


def item_out(item):
    return {"id": item.item_id, "filename": item.filename, "mime_type": item.mime_type,
            "size": item.byte_size, "sha256": item.sha256, "order": item.order, "status": item.status}


async def get_draft(db, owner, draft_id, item_id=None):
    draft = await owned(db, owner, draft_id, lock=True)
    expire(draft)
    await db.commit()
    return await draft_out(db, draft, item_id)


async def create_or_get_draft(db, owner, draft_id, manifest):
    encoded = json.dumps(manifest.model_dump(mode="json"), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    fingerprint = hashlib.sha256(encoded.encode()).hexdigest()
    existing = await db.scalar(select(AlbumUploadDraft).where(AlbumUploadDraft.id == str(draft_id)))
    if existing:
        draft = await owned(db, owner, draft_id, lock=True)
        if draft.manifest_hash != fingerprint:
            raise HTTPException(409, "Draft manifest differs")
        expire(draft)
        await db.commit()
        return await draft_out(db, draft), False
    # NO KEY UPDATE serializes creates without blocking Album's user FK checks.
    await db.scalar(select(User).where(User.id == str(owner.id)).with_for_update(key_share=True))
    existing = await db.scalar(select(AlbumUploadDraft).where(AlbumUploadDraft.id == str(draft_id)))
    if existing:
        await db.rollback()
        return await create_or_get_draft(db, owner, draft_id, manifest)
    active = await db.scalar(select(AlbumUploadDraft).where(AlbumUploadDraft.user_id == str(owner.id), AlbumUploadDraft.status.in_(ACTIVE)))
    if active:
        expire(active)
        await db.flush()
        if active.status in ACTIVE:
            raise HTTPException(409, {"message": "Active draft exists", "draft_id": str(active.id)})
    cloud = is_cloudinary_configured()
    draft = AlbumUploadDraft(id=str(draft_id), user_id=str(owner.id), manifest_hash=fingerprint,
                             title=manifest.title, description=manifest.description, is_public=manifest.is_public,
                             total_size=sum(item.size for item in manifest.items), status="uploading",
                             expires_at=now() + timedelta(days=7))
    db.add(draft)
    try:
        await db.flush()
        for order, item in enumerate(manifest.items):
            stored = f"picmatch/drafts/{draft_id}/{item.id}" if cloud else f"drafts/{draft_id}/{item.id}{EXTENSIONS[item.mime_type]}"
            db.add(AlbumUploadItem(draft_id=str(draft_id), item_id=str(item.id), order=order,
                                  filename=item.filename, mime_type=item.mime_type, byte_size=item.size, sha256=item.sha256,
                                  media_type="video" if item.mime_type.startswith("video/") else "image",
                                  storage_kind="cloudinary" if cloud else "local", stored_filename=stored,
                                  cloudinary_delivery_type="authenticated" if cloud else "upload"))
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return await create_or_get_draft(db, owner, draft_id, manifest)
    return await draft_out(db, draft), True
