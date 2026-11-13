import asyncio
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import select, func

from tests.test_album_drafts import create, manifest
from tests.test_album_draft_storage import draft_files


async def uploaded(client, headers, data=b"owned image"):
    draft_id, body, response = await create(client, headers, manifest(data))
    assert response.status_code == 201
    response = await client.put(f"/api/album-drafts/{draft_id}/items/{body['items'][0]['id']}", content=data,
                                headers={**headers, "Content-Type": "image/jpeg"})
    assert response.status_code == 200
    return draft_id, body


async def test_finalize_replay_and_gateway(async_client, auth_headers, second_user_headers, draft_files, db_session):
    from models import Album, Photo
    draft_id, _ = await uploaded(async_client, auth_headers)
    first = await async_client.post(f"/api/album-drafts/{draft_id}/finalize", headers=auth_headers)
    assert first.status_code == 201, first.text
    second = await async_client.post(f"/api/album-drafts/{draft_id}/finalize", headers=auth_headers)
    assert second.status_code == 200 and second.json()["id"] == first.json()["id"]
    assert await db_session.scalar(select(func.count()).select_from(Album)) == 1
    assert await db_session.scalar(select(func.count()).select_from(Photo)) == 1
    url = first.json()["photos"][0]["url"]
    assert (await async_client.get(url, headers=auth_headers)).content == b"owned image"
    assert (await async_client.get(url, headers=second_user_headers)).status_code == 404
    assert (await async_client.post(f"/api/album-drafts/{draft_id}/finalize", headers=second_user_headers)).status_code == 404
    cancelled = await async_client.delete(f"/api/album-drafts/{draft_id}", headers=auth_headers)
    assert cancelled.status_code == 409 and list(draft_files.rglob("*.jpg"))


async def test_deleted_album_receipt_cannot_recreate(async_client, auth_headers, draft_files, db_session):
    from models import Album
    draft_id, _ = await uploaded(async_client, auth_headers)
    result = await async_client.post(f"/api/album-drafts/{draft_id}/finalize", headers=auth_headers)
    album = await db_session.scalar(select(Album).where(Album.id == result.json()["id"]))
    await db_session.delete(album)
    await db_session.commit()
    assert (await async_client.post(f"/api/album-drafts/{draft_id}/finalize", headers=auth_headers)).status_code == 410


async def test_partial_finalize_and_cancel_replay(async_client, auth_headers, second_user_headers, draft_files):
    draft_id, _, _ = await create(async_client, auth_headers)
    assert (await async_client.post(f"/api/album-drafts/{draft_id}/finalize", headers=auth_headers)).status_code == 409
    assert (await async_client.delete(f"/api/album-drafts/{draft_id}", headers=second_user_headers)).status_code == 404
    first = await async_client.delete(f"/api/album-drafts/{draft_id}", headers=auth_headers)
    assert first.status_code == 200 and first.json()["status"] == "cancelled"
    second = await async_client.delete(f"/api/album-drafts/{draft_id}", headers=auth_headers)
    assert second.status_code == 200 and second.json()["status"] == "cancelled"
    assert (await async_client.post(f"/api/album-drafts/{draft_id}/finalize", headers=auth_headers)).status_code == 410


async def test_cancel_delete_failure_stays_retryable(async_client, auth_headers, draft_files, monkeypatch):
    import album_draft_storage as storage
    draft_id, _ = await uploaded(async_client, auth_headers)
    original = storage.delete
    async def failed(*args): raise RuntimeError("temporary deletion failure")
    monkeypatch.setattr(storage, "delete", failed)
    result = await async_client.delete(f"/api/album-drafts/{draft_id}", headers=auth_headers)
    assert result.status_code == 200 and result.json()["status"] == "cancelling"
    assert list(draft_files.rglob("*.jpg"))
    monkeypatch.setattr(storage, "delete", original)
    result = await async_client.delete(f"/api/album-drafts/{draft_id}", headers=auth_headers)
    assert result.json()["status"] == "cancelled" and not list(draft_files.rglob("*.jpg"))


async def test_cancel_during_provider_call_deletes_late_asset(async_client, auth_headers, draft_files, monkeypatch):
    import album_draft_storage as storage
    import album_drafts as drafts
    data = b"late upload"
    draft_id, body, _ = await create(async_client, auth_headers, manifest(data))
    original = storage.upload
    started, release = asyncio.Event(), asyncio.Event()
    async def held(item, file):
        started.set()
        await release.wait()
        return await original(item, file)
    monkeypatch.setattr(storage, "upload", held)
    task = asyncio.create_task(async_client.put(f"/api/album-drafts/{draft_id}/items/{body['items'][0]['id']}", content=data,
                                               headers={**auth_headers, "Content-Type": "image/jpeg"}))
    await asyncio.wait_for(started.wait(), 3)
    cancelled = await async_client.delete(f"/api/album-drafts/{draft_id}", headers=auth_headers)
    assert cancelled.json()["status"] == "cancelling"
    release.set()
    assert (await task).status_code == 409
    await drafts.drain_workers()
    final = await async_client.delete(f"/api/album-drafts/{draft_id}", headers=auth_headers)
    assert final.json()["status"] == "cancelled"
    assert not list(draft_files.rglob("*.jpg")) and not list(draft_files.rglob("*.part"))


async def test_expiry_cleanup_preserves_completed_assets(async_client, auth_headers, draft_files, db_session):
    import album_drafts as drafts
    from models import AlbumUploadDraft
    draft_id, _ = await uploaded(async_client, auth_headers)
    draft = await db_session.scalar(select(AlbumUploadDraft).where(AlbumUploadDraft.id == draft_id))
    draft.expires_at = drafts.now() - timedelta(seconds=1)
    await db_session.commit()
    await drafts.cleanup_album_drafts(db_session)
    assert not list(draft_files.rglob("*.jpg"))
    new_id, _ = await uploaded(async_client, auth_headers)
    assert (await async_client.post(f"/api/album-drafts/{new_id}/finalize", headers=auth_headers)).status_code == 201
    completed = await db_session.scalar(select(AlbumUploadDraft).where(AlbumUploadDraft.id == new_id))
    completed.expires_at = drafts.now() - timedelta(days=1)
    await db_session.commit()
    await drafts.cleanup_album_drafts(db_session)
    assert len(list(draft_files.rglob("*.jpg"))) == 1


async def test_abandoned_spools_cleanup_is_owned_and_lease_aware(async_client, auth_headers, draft_files, db_session):
    import os
    import time
    import album_drafts as drafts
    from models import AlbumUploadItem
    draft_id, _, _ = await create(async_client, auth_headers)
    item = await db_session.scalar(select(AlbumUploadItem).where(AlbumUploadItem.draft_id == draft_id))
    item.status = "receiving"
    item.lease_id = str(uuid.uuid4())
    item.lease_expires_at = drafts.now() + timedelta(seconds=300)
    await db_session.commit()
    directory = draft_files / ".draft-spool"
    directory.mkdir()
    stale = directory / f"{uuid.uuid4()}-abcd1234.part"
    live = directory / f"{item.lease_id}-abcd1234.part"
    unknown = directory / "not-owned.part"
    for file in (stale, live, unknown):
        file.write_bytes(b"fixture")
        os.utime(file, (time.time() - 172800, time.time() - 172800))
    await drafts.cleanup_album_drafts(db_session)
    assert not stale.exists() and live.exists() and unknown.exists()
