"""File-based draft storage with strict ownership checks and observable failures."""
import asyncio
import hashlib
import os
from pathlib import Path

from cloudinary_utils import (DraftAssetConflict, upload_draft_media, lookup_draft_media,
                              delete_draft_media)

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
