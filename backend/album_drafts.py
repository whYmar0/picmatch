"""Owner-scoped upload receipts and lifecycle; no provider URLs cross this boundary."""
import hashlib
import json
import asyncio
import tempfile
import uuid
import re
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import select, func, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.orm import selectinload
from limits import parse

from cloudinary_utils import is_cloudinary_configured, DraftAssetConflict
from models import AlbumUploadDraft, AlbumUploadItem, User, Album
from middleware.rate_limit import limiter, _get_limit
import album_draft_storage as storage

ACTIVE = ("uploading", "ready", "cancelling")
EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
              "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov", "video/avi": ".avi"}
UPLOAD_SLOTS = asyncio.Semaphore(2)
CLOUD_DRAFT_PREFIX = "picmatch/drafts"
WORKERS = set()
IDLE_SECONDS = 30
RECEIVE_SECONDS = 1200


@dataclass(frozen=True)
class ItemLease:
    draft_id: str
    item_id: str
    key: str
    filename: str
    mime_type: str
    byte_size: int
    sha256: str
    stored_filename: str
    media_type: str
    storage_kind: str
    needs_reconcile: bool


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
            "cleanup_pending": draft.status in ("expired", "cancelling") and any(
                item.status == "uploaded" or item.needs_reconcile or item.lease_id is not None for item in items),
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
    # A rollback expires ORM attributes; retries retain only the authenticated identity.
    owner = SimpleNamespace(id=str(owner.id))
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
    account = await db.scalar(select(User).where(User.id == owner.id).with_for_update(key_share=True))
    if account is None or not account.is_active or not account.is_verified:
        raise HTTPException(403, "Account unavailable")
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
            stored = f"{CLOUD_DRAFT_PREFIX}/{draft_id}/{item.id}" if cloud else f"draft_{draft_id}_{item.id}{EXTENSIONS[item.mime_type]}"
            db.add(AlbumUploadItem(draft_id=str(draft_id), item_id=str(item.id), order=order,
                                  filename=item.filename, mime_type=item.mime_type, byte_size=item.size, sha256=item.sha256,
                                  media_type="video" if item.mime_type.startswith("video/") else "image",
                                  storage_kind="cloudinary" if cloud else "local", stored_filename=stored,
                                  cloudinary_delivery_type="authenticated" if cloud else "upload"))
        await db.commit()
    except IntegrityError:
        await db.rollback()
        existing = await db.scalar(select(AlbumUploadDraft).where(AlbumUploadDraft.id == str(draft_id)))
        if existing:
            return await create_or_get_draft(db, owner, draft_id, manifest)
        active = await db.scalar(select(AlbumUploadDraft).where(AlbumUploadDraft.user_id == owner.id, AlbumUploadDraft.status.in_(ACTIVE)))
        if active:
            raise HTTPException(409, {"message": "Active draft exists", "draft_id": str(active.id)}) from None
        raise HTTPException(503, "Draft could not be saved") from None
    return await draft_out(db, draft), True


async def find_item(db, draft_id, item_id):
    item = await db.scalar(select(AlbumUploadItem).where(
        AlbumUploadItem.draft_id == str(draft_id), AlbumUploadItem.item_id == str(item_id)
    ).execution_options(populate_existing=True))
    if item is None:
        raise HTTPException(404, "Item not found")
    return item


async def claim_item(db, owner, draft_id, item_id):
    draft = await owned(db, owner, draft_id, lock=True)
    expire(draft)
    item = await find_item(db, draft_id, item_id)
    if draft.status not in ("uploading", "ready", "completed"):
        await db.commit()
        raise HTTPException(410 if draft.status in ("expired", "cancelled") else 409, "Draft closed")
    if item.status == "uploaded":
        await db.commit()
        return item_out(item), 200
    if item.status == "receiving" and item.lease_expires_at and utc(item.lease_expires_at) > now():
        await db.commit()
        return item_out(item), 202
    active = await db.scalar(select(func.count()).select_from(AlbumUploadItem).join(
        AlbumUploadDraft, AlbumUploadDraft.id == AlbumUploadItem.draft_id).where(
        AlbumUploadDraft.user_id == str(owner.id), AlbumUploadItem.status == "receiving",
        AlbumUploadItem.lease_expires_at > now()))
    if active >= 2:
        raise HTTPException(429, "Upload capacity reached", headers={"Retry-After": "2"})
    if not limiter.limiter.hit(parse(_get_limit("RATE_LIMIT_DRAFT_UPLOAD", "30/minute")), "draft-transfer", str(owner.id)):
        raise HTTPException(429, "Too many requests", headers={"Retry-After": "60"})
    item.status = "receiving"
    item.lease_id = str(uuid.uuid4())
    item.lease_expires_at = now() + timedelta(seconds=300)
    lease = ItemLease(str(draft_id), str(item_id), item.lease_id, item.filename, item.mime_type,
                      item.byte_size, item.sha256, item.stored_filename, item.media_type,
                      item.storage_kind, item.needs_reconcile)
    await db.commit()
    return lease, None


async def release_lease(sessions, lease):
    async with sessions() as db:
        await db.execute(update(AlbumUploadItem).where(
            AlbumUploadItem.draft_id == lease.draft_id, AlbumUploadItem.item_id == lease.item_id,
            AlbumUploadItem.lease_id == lease.key).values(status="pending", lease_id=None, lease_expires_at=None))
        await db.commit()


async def heartbeat(sessions, lease):
    while True:
        await asyncio.sleep(30)
        try:
            async with sessions() as db:
                await db.execute(update(AlbumUploadItem).where(
                    AlbumUploadItem.draft_id == lease.draft_id, AlbumUploadItem.item_id == lease.item_id,
                    AlbumUploadItem.lease_id == lease.key).values(lease_expires_at=now() + timedelta(seconds=300)))
                await db.commit()
        except Exception:
            # Failure leaves the durable lease available for conservative recovery.
            return


async def receive_item(request, lease):
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != lease.mime_type:
        raise HTTPException(415, "Media type differs from manifest")
    length = request.headers.get("content-length")
    if length is not None and (len(length) > 20 or not length.isascii() or not length.isdigit() or int(length) != lease.byte_size):
        raise HTTPException(400, "Media size differs from manifest")
    directory = storage.UPLOAD_DIR / ".draft-spool"
    directory.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(prefix=f"{lease.key}-", suffix=".part", dir=directory)
    path = Path(name)
    digest = hashlib.sha256()
    total = 0
    try:
        with open(descriptor, "wb", closefd=True) as file:
            async with asyncio.timeout(RECEIVE_SECONDS):
                iterator = request.stream().__aiter__()
                while True:
                    try:
                        chunk = await asyncio.wait_for(anext(iterator), IDLE_SECONDS)
                    except StopAsyncIteration:
                        break
                    total += len(chunk)
                    if total > lease.byte_size or total > 52428800:
                        raise HTTPException(413, "Media exceeds manifest size")
                    digest.update(chunk)
                    await storage.blocking(file.write, chunk)
        if total != lease.byte_size or digest.hexdigest() != lease.sha256:
            raise HTTPException(400, "Media does not match manifest")
        return path
    except BaseException as error:
        path.unlink(missing_ok=True)
        if isinstance(error, TimeoutError):
            raise HTTPException(408, "Media upload timed out") from None
        raise


async def publish_item(sessions, lease, receipt):
    async with sessions() as db:
        draft = await db.scalar(select(AlbumUploadDraft).where(AlbumUploadDraft.id == lease.draft_id).with_for_update())
        item = await find_item(db, lease.draft_id, lease.item_id)
        expire(draft)
        if item.lease_id != lease.key:
            await db.commit()
            if item.status == "uploaded":
                return item_out(item)
            raise HTTPException(409, "Upload attempt superseded; check draft status")
        if draft.status not in ("uploading", "ready", "completed"):
            await db.commit()
            await storage.delete(lease)
            await db.execute(update(AlbumUploadItem).where(
                AlbumUploadItem.id == item.id, AlbumUploadItem.lease_id == lease.key).values(
                status="pending", needs_reconcile=False, provider_asset_id=None, lease_id=None, lease_expires_at=None))
            await db.commit()
            raise HTTPException(409, "Draft closed")
        asset_id = receipt.get("asset_id") if isinstance(receipt, dict) else None
        if item.provider_asset_id and item.provider_asset_id != asset_id:
            raise DraftAssetConflict("Provider asset identity differs")
        item.provider_asset_id = asset_id
        item.status = "uploaded"
        item.needs_reconcile = False
        item.lease_id = None
        item.lease_expires_at = None
        remaining = await db.scalar(select(func.count()).select_from(AlbumUploadItem).where(
            AlbumUploadItem.draft_id == lease.draft_id, AlbumUploadItem.status != "uploaded"))
        if not remaining:
            draft.status = "ready"
        await db.commit()
        return item_out(item)


async def complete_item_upload(request, sessions, lease, slots):
    pulse = asyncio.create_task(heartbeat(sessions, lease))
    spool = None
    try:
        if lease.needs_reconcile:
            receipt = await storage.lookup(lease)
            if receipt is not None:
                return await publish_item(sessions, lease, receipt)
        spool = await receive_item(request, lease)
        async with sessions() as db:
            draft = await db.scalar(select(AlbumUploadDraft).where(
                AlbumUploadDraft.id == lease.draft_id).with_for_update())
            expire(draft)
            if draft.status not in ("uploading", "ready"):
                await db.commit()
                raise HTTPException(409, "Draft closed")
            marked = await db.execute(update(AlbumUploadItem).where(
                AlbumUploadItem.draft_id == lease.draft_id, AlbumUploadItem.item_id == lease.item_id,
                AlbumUploadItem.lease_id == lease.key, AlbumUploadItem.status == "receiving",
                AlbumUploadItem.lease_expires_at > now()).values(needs_reconcile=True))
            if marked.rowcount != 1:
                raise HTTPException(409, "Upload attempt expired; check draft status")
            await db.commit()
        receipt = await storage.upload(lease, spool)
        return await publish_item(sessions, lease, receipt)
    except BaseException as error:
        try:
            await release_lease(sessions, lease)
        except Exception:
            pass  # An expired durable lease is reconciled by a later retry.
        if isinstance(error, (HTTPException, asyncio.CancelledError)):
            raise
        if isinstance(error, DraftAssetConflict):
            raise HTTPException(409, "Draft resource identity differs") from None
        raise HTTPException(503, "Upload could not be confirmed; check draft status and retry") from None
    finally:
        pulse.cancel()
        await asyncio.gather(pulse, return_exceptions=True)
        if spool is not None:
            spool.unlink(missing_ok=True)
        slots.release()


def _worker_done(task):
    WORKERS.discard(task)
    if not task.cancelled():
        task.exception()


async def upload_item(request, db, owner, draft_id, item_id):
    result, status = await claim_item(db, owner, draft_id, item_id)
    if status is not None:
        return result, status
    sessions = async_sessionmaker(db.bind, expire_on_commit=False)
    slots = UPLOAD_SLOTS
    if slots.locked():
        await release_lease(sessions, result)
        raise HTTPException(429, "Upload capacity reached", headers={"Retry-After": "2"})
    await slots.acquire()
    task = asyncio.create_task(complete_item_upload(request, sessions, result, slots))
    WORKERS.add(task)
    task.add_done_callback(_worker_done)
    return await asyncio.shield(task), 200


async def drain_workers():
    if WORKERS:
        await asyncio.gather(*list(WORKERS), return_exceptions=True)


async def finalized_album(db, draft):
    from routers.albums import album_to_out
    album = await db.scalar(select(Album).where(Album.id == draft.album_id).options(
        selectinload(Album.photos), selectinload(Album.creator)).execution_options(populate_existing=True)) if draft.album_id else None
    if album is None:
        raise HTTPException(410, "Completed album no longer exists")
    return album_to_out(album)


async def finalize_draft(db, owner, draft_id):
    from routers.albums import add_album_with_photos
    draft = await owned(db, owner, draft_id, lock=True)
    if draft.status == "completed":
        return await finalized_album(db, draft), False
    expire(draft)
    if draft.status not in ("uploading", "ready"):
        await db.commit()
        raise HTTPException(410 if draft.status in ("expired", "cancelled") else 409, "Draft closed")
    items = list((await db.scalars(select(AlbumUploadItem).where(
        AlbumUploadItem.draft_id == str(draft.id)).order_by(AlbumUploadItem.order))).all())
    if not items or any(item.status != "uploaded" for item in items):
        raise HTTPException(409, "Draft upload incomplete")
    rows = [{"idx": item.order, "filename": item.filename, "stored": item.stored_filename,
             "media_type": item.media_type, "cloudinary_delivery_type": item.cloudinary_delivery_type} for item in items]
    album = await add_album_with_photos(db, owner, draft.title, draft.description, draft.is_public, rows)
    draft.album_id = str(album.id)
    draft.status = "completed"
    await db.commit()
    return await finalized_album(db, draft), True


def storage_item(item):
    return SimpleNamespace(draft_id=str(item.draft_id), item_id=item.item_id, sha256=item.sha256,
                            byte_size=item.byte_size, stored_filename=item.stored_filename,
                            media_type=item.media_type, storage_kind=item.storage_kind)


async def cleanup_draft(db, draft_id):
    draft = await db.scalar(select(AlbumUploadDraft).where(AlbumUploadDraft.id == str(draft_id)).with_for_update())
    if draft is None:
        return
    expire(draft)
    if draft.status not in ("cancelling", "expired"):
        await db.commit()
        return
    items = list((await db.scalars(select(AlbumUploadItem).where(AlbumUploadItem.draft_id == str(draft_id)))).all())
    pending = False
    for item in items:
        if item.status == "receiving" and item.lease_expires_at and utc(item.lease_expires_at) > now():
            pending = True
            continue
        if item.status == "uploaded" or item.needs_reconcile:
            snapshot = storage_item(item)
            await db.commit()
            try:
                if item.needs_reconcile and snapshot.storage_kind == "cloudinary" and await storage.lookup(snapshot) is None:
                    # A lost provider result may still be in flight. Keep its receipt retryable.
                    pending = True
                    continue
                await storage.delete(snapshot)
            except Exception:
                pending = True
                continue
            item.status = "pending"
            item.needs_reconcile = False
            item.provider_asset_id = None
        item.lease_id = None
        item.lease_expires_at = None
        await db.commit()
    draft = await db.scalar(select(AlbumUploadDraft).where(AlbumUploadDraft.id == str(draft_id)).with_for_update().execution_options(populate_existing=True))
    if draft.status == "cancelling" and not pending:
        draft.status = "cancelled"
    await db.commit()


async def cancel_draft(db, owner, draft_id):
    draft = await owned(db, owner, draft_id, lock=True)
    if draft.status == "completed":
        raise HTTPException(409, "Draft already completed")
    if draft.status not in ("cancelled", "expired"):
        draft.status = "cancelling"
    await db.commit()
    await cleanup_draft(db, draft_id)
    await db.refresh(draft)
    return await draft_out(db, draft)


async def cleanup_album_drafts(db):
    ids = list((await db.scalars(select(AlbumUploadDraft.id).where(
        (AlbumUploadDraft.status == "cancelling") | (AlbumUploadDraft.status == "expired") |
        (AlbumUploadDraft.status.in_(("uploading", "ready")) & (AlbumUploadDraft.expires_at <= now()))))).all())
    await db.commit()
    for draft_id in ids:
        await cleanup_draft(db, draft_id)
    directory = storage.UPLOAD_DIR.resolve() / ".draft-spool"
    if directory.is_symlink() or not directory.is_dir():
        return
    live = set((await db.scalars(select(AlbumUploadItem.lease_id).where(
        AlbumUploadItem.status == "receiving", AlbumUploadItem.lease_expires_at > now()))).all())
    await db.commit()
    for file in directory.iterdir():
        match = re.fullmatch(r"([0-9a-f-]{36})-[a-z0-9_]{8}\.part", file.name)
        if (match and match[1] not in live and not file.is_symlink() and file.is_file()
                and file.stat().st_mtime < time.time() - 86400):
            file.unlink(missing_ok=True)
