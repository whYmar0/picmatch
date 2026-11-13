import asyncio
import hashlib
import uuid

import pytest
from sqlalchemy import select

from tests.test_album_drafts import create, manifest


@pytest.fixture
def draft_files(tmp_path, monkeypatch):
    import album_draft_storage as storage
    import album_drafts as drafts
    monkeypatch.setattr(storage, "UPLOAD_DIR", tmp_path)
    from routers import media
    monkeypatch.setattr(media, "UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(drafts, "UPLOAD_SLOTS", asyncio.Semaphore(2))
    return tmp_path


async def test_upload_replay_without_reading_second_body(async_client, auth_headers, draft_files):
    data = b"synthetic image"
    draft_id, body, _ = await create(async_client, auth_headers, manifest(data))
    url = f"/api/album-drafts/{draft_id}/items/{body['items'][0]['id']}"
    response = await async_client.put(url, content=data, headers={**auth_headers, "Content-Type": "image/jpeg"})
    assert response.status_code == 200 and response.json()["status"] == "uploaded", response.text
    again = await async_client.put(url, content=b"not the original body", headers=auth_headers)
    assert again.status_code == 200 and again.json() == response.json()
    status = await async_client.get(f"/api/album-drafts/{draft_id}", headers=auth_headers)
    assert status.json()["status"] == "ready" and status.json()["uploaded_count"] == 1
    assert len(list(draft_files.rglob("*.jpg"))) == 1
    assert not list(draft_files.rglob("*.part"))


@pytest.mark.parametrize("case", ["short", "large", "hash", "mime", "length"])
async def test_bad_stream_never_writes_asset(async_client, auth_headers, draft_files, case):
    data = b"expected"
    draft_id, body, _ = await create(async_client, auth_headers, manifest(data))
    payload = b"short" if case == "short" else data + b"x" if case == "large" else b"modified" if case == "hash" else data
    headers = {**auth_headers, "Content-Type": "image/jpeg"}
    if case == "mime": headers["Content-Type"] = "text/html"
    if case == "length": headers["Content-Length"] = "1000"
    response = await async_client.put(f"/api/album-drafts/{draft_id}/items/{body['items'][0]['id']}", content=payload, headers=headers)
    assert response.status_code in (400, 413, 415, 422)
    assert not list(draft_files.rglob("*.jpg")) and not list(draft_files.rglob("*.part"))
    status = await async_client.get(f"/api/album-drafts/{draft_id}", headers=auth_headers)
    assert status.json()["items"][0]["status"] == "pending"


async def test_chunked_stream_and_foreign_item(async_client, auth_headers, second_user_headers, draft_files):
    data = b"chunked-content"
    draft_id, body, _ = await create(async_client, auth_headers, manifest(data))
    url = f"/api/album-drafts/{draft_id}/items/{body['items'][0]['id']}"
    async def chunks():
        yield data[:4]
        yield data[4:]
    wrong = await async_client.put(url, content=data, headers={**second_user_headers, "Content-Type": "image/jpeg"})
    assert wrong.status_code == 404
    valid = await async_client.put(url, content=chunks(), headers={**auth_headers, "Content-Type": "image/jpeg"})
    assert valid.status_code == 200, valid.text
    missing = await async_client.put(f"/api/album-drafts/{draft_id}/items/{uuid.uuid4()}", content=data, headers=auth_headers)
    assert missing.status_code == 404


async def test_provider_success_before_db_failure_reconciles(async_client, auth_headers, draft_files, monkeypatch):
    import album_drafts as drafts
    import album_draft_storage as storage
    data = b"persisted-before-receipt"
    draft_id, body, _ = await create(async_client, auth_headers, manifest(data))
    original = drafts.publish_item
    calls = 0
    async def fail_once(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise RuntimeError("simulated lost database receipt")
        return await original(*args, **kwargs)
    monkeypatch.setattr(drafts, "publish_item", fail_once)
    url = f"/api/album-drafts/{draft_id}/items/{body['items'][0]['id']}"
    first = await async_client.put(url, content=data, headers={**auth_headers, "Content-Type": "image/jpeg"})
    assert first.status_code == 503
    second = await async_client.put(url, content=b"", headers=auth_headers)
    assert second.status_code == 200 and second.json()["status"] == "uploaded"
    assert len(list(draft_files.rglob("*.jpg"))) == 1


async def test_inflight_replay_and_global_slots(async_client, auth_headers, draft_files, monkeypatch):
    import album_draft_storage as storage
    data = b"waiting"
    body = manifest(data)
    body["items"] += [{**body["items"][0], "id": str(uuid.uuid4())} for _ in range(2)]
    draft_id, _, _ = await create(async_client, auth_headers, body)
    original = storage.upload
    started = asyncio.Event()
    release = asyncio.Event()
    async def held(item, file):
        started.set()
        await release.wait()
        return await original(item, file)
    monkeypatch.setattr(storage, "upload", held)
    url = f"/api/album-drafts/{draft_id}/items/{body['items'][0]['id']}"
    task = asyncio.create_task(async_client.put(url, content=data, headers={**auth_headers, "Content-Type": "image/jpeg"}))
    await asyncio.wait_for(started.wait(), 3)
    replay = await async_client.put(url, content=data, headers=auth_headers)
    assert replay.status_code == 202 and replay.headers["Retry-After"]
    release.set()
    assert (await task).status_code == 200


async def test_client_cancellation_keeps_worker_until_provider_finishes(async_client, auth_headers, draft_files, monkeypatch):
    import album_drafts as drafts
    import album_draft_storage as storage
    data = b"cancelled-request"
    draft_id, body, _ = await create(async_client, auth_headers, manifest(data))
    original = storage.upload
    started = asyncio.Event()
    release = asyncio.Event()
    async def held(item, file):
        started.set()
        await release.wait()
        assert file.exists()
        return await original(item, file)
    monkeypatch.setattr(storage, "upload", held)
    url = f"/api/album-drafts/{draft_id}/items/{body['items'][0]['id']}"
    task = asyncio.create_task(async_client.put(url, content=data, headers={**auth_headers, "Content-Type": "image/jpeg"}))
    await asyncio.wait_for(started.wait(), 3)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert list(draft_files.rglob("*.part")) and drafts.UPLOAD_SLOTS._value == 1
    release.set()
    await drafts.drain_workers()
    assert not list(draft_files.rglob("*.part")) and drafts.UPLOAD_SLOTS._value == 2
    assert (await async_client.get(f"/api/album-drafts/{draft_id}", headers=auth_headers)).json()["status"] == "ready"


async def test_stream_hard_limit_and_idle_timeout(draft_files, monkeypatch):
    from album_drafts import ItemLease, receive_item
    import album_drafts as drafts
    from fastapi import HTTPException
    block = b"x" * (1024 * 1024)
    digest = hashlib.sha256()
    for _ in range(50):
        digest.update(block)
    lease = ItemLease(str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4()), "large.jpg", "image/jpeg",
                      52428800, digest.hexdigest(), "unused", "image", "local", False)
    class Stream:
        headers = {"content-type": "image/jpeg"}
        def __init__(self, extra=False, idle=False): self.extra, self.idle = extra, idle
        async def stream(self):
            if self.idle: await asyncio.sleep(0.03)
            for _ in range(50): yield block
            if self.extra: yield b"x"
    file = await receive_item(Stream(), lease)
    assert file.stat().st_size == 52428800
    file.unlink()
    with pytest.raises(HTTPException) as error:
        await receive_item(Stream(extra=True), lease)
    assert error.value.status_code == 413
    monkeypatch.setattr(drafts, "IDLE_SECONDS", 0.005)
    with pytest.raises(HTTPException) as error:
        await receive_item(Stream(idle=True), lease)
    assert error.value.status_code == 408
    assert not list(draft_files.rglob("*.part"))


async def test_new_transfer_limit_does_not_charge_completed_replay(async_client, auth_headers, draft_files):
    data = b"limited"
    body = manifest(data)
    body["items"] += [{**body["items"][0], "id": str(uuid.uuid4())} for _ in range(30)]
    draft_id, _, _ = await create(async_client, auth_headers, body)
    for item in body["items"][:30]:
        response = await async_client.put(f"/api/album-drafts/{draft_id}/items/{item['id']}", content=data,
                                          headers={**auth_headers, "Content-Type": "image/jpeg"})
        assert response.status_code == 200
    extra = await async_client.put(f"/api/album-drafts/{draft_id}/items/{body['items'][-1]['id']}", content=data, headers=auth_headers)
    assert extra.status_code == 429 and extra.headers["Retry-After"]
    replay = await async_client.put(f"/api/album-drafts/{draft_id}/items/{body['items'][0]['id']}", content=b"", headers=auth_headers)
    assert replay.status_code == 200


def test_private_provider_receipts_and_strict_deletion(monkeypatch, tmp_path):
    import cloudinary.api
    import cloudinary.uploader
    import cloudinary_utils as cloud
    context = {"draft": "synthetic", "item": "only", "sha256": "a" * 64}
    receipt = {"public_id": "test/asset", "resource_type": "image", "type": "authenticated",
               "asset_id": "stable", "context": {"custom": context}}
    uploads = []
    monkeypatch.setattr(cloudinary.uploader, "upload", lambda path, **options: uploads.append(options) or receipt)
    monkeypatch.setattr(cloudinary.api, "resource", lambda *a, **k: receipt)
    assert cloud.upload_draft_media(tmp_path / "file", "test/asset", "image", context)["asset_id"] == "stable"
    assert uploads[0]["type"] == "authenticated" and uploads[0]["overwrite"] is False
    assert uploads[0]["eager"] == list(cloud.ALBUM_IMAGE_TRANSFORMS)
    with pytest.raises(cloud.DraftAssetConflict): cloud.lookup_draft_media("test/other", "image", context)
    monkeypatch.setattr(cloudinary.uploader, "destroy", lambda *a, **k: {"result": "failed"})
    with pytest.raises(RuntimeError): cloud.delete_draft_media("test/asset", "image", context)
