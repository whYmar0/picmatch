"""File-based draft storage with strict ownership checks and observable failures."""
import asyncio
import hashlib
import os
from pathlib import Path

from cloudinary_utils import (DraftAssetConflict, upload_draft_media, lookup_draft_media,
                              delete_draft_media, is_cloudinary_configured)

BASE_DIR = Path(__file__).resolve().parent
raw = Path(os.getenv("UPLOAD_DIR", "./uploads"))
UPLOAD_DIR = raw if raw.is_absolute() else BASE_DIR / raw


def context(item):
    return {"draft": item.draft_id, "item": item.item_id, "sha256": item.sha256}


def local_path(item):
    root = UPLOAD_DIR.resolve()
    path = (root / item.stored_filename).resolve()
    if root not in path.parents:
        raise DraftAssetConflict("Invalid draft storage path")
    return path


def _local_lookup(item):
    path = local_path(item)
    if not path.exists():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(65536), b""):
            digest.update(chunk)
    if path.stat().st_size != item.byte_size or digest.hexdigest() != item.sha256:
        raise DraftAssetConflict("Draft file identity differs")
    return True


def _local_upload(item, spool):
    target = local_path(item)
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        # Spool and destination share a filesystem; publish without overwrite or RAM copy.
        os.link(spool, target)
    except FileExistsError:
        pass
    return _local_lookup(item)


async def blocking(function, *args, **kwargs):
    task = asyncio.create_task(asyncio.to_thread(function, *args, **kwargs))
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        # A cancelled waiter must not delete the file while the SDK still reads it.
        await task
        raise


async def lookup(item):
    if item.storage_kind == "cloudinary":
        return await blocking(lookup_draft_media, item.stored_filename, item.media_type, context(item))
    return await blocking(_local_lookup, item)


async def upload(item, spool):
    if item.storage_kind == "cloudinary":
        return await blocking(upload_draft_media, spool, item.stored_filename, item.media_type, context(item))
    return await blocking(_local_upload, item, spool)


async def delete(item):
    if item.storage_kind == "cloudinary":
        return await blocking(delete_draft_media, item.stored_filename, item.media_type, context(item))
    if await lookup(item):
        await blocking(local_path(item).unlink, missing_ok=True)


def published_storage_kind(photo):
    if photo.cloudinary_delivery_type == "authenticated":
        return "cloudinary"
    root = UPLOAD_DIR.resolve()
    path = (root / photo.stored_filename).resolve()
    if path.is_relative_to(root) and path.is_file():
        return "local"
    return "cloudinary" if is_cloudinary_configured() else "local"


def _destroy_published(public_id, media_type, delivery_type):
    import cloudinary.uploader

    if not is_cloudinary_configured():
        raise RuntimeError("Cloud storage unavailable")
    receipt = cloudinary.uploader.destroy(
        public_id, resource_type=media_type, type=delivery_type, invalidate=True,
    )
    if receipt.get("result") not in ("ok", "not found"):
        raise RuntimeError("Cloud storage did not confirm removal")


async def delete_published_media(job):
    if job.storage_kind == "cloudinary":
        await blocking(_destroy_published, job.stored_filename, job.media_type, job.delivery_type)
    else:
        await blocking(_delete_published_file, job.stored_filename)


def _delete_published_file(stored_filename):
    root = UPLOAD_DIR.resolve()
    path = root / stored_filename
    if not path.parent.resolve().is_relative_to(root) or path.resolve() == root:
        raise DraftAssetConflict("Invalid published media path")
    path.unlink(missing_ok=True)
    thumbnail_dir = root / "thumbnails"
    if thumbnail_dir.resolve().is_relative_to(root):
        (thumbnail_dir / f"thumb_{path.name}.webp").unlink(missing_ok=True)
