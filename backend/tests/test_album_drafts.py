import copy
import hashlib
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select


def manifest(data=b"synthetic image", **changes):
    result = {"title": "  iPhone album  ", "description": "Draft", "is_public": False,
              "items": [{"id": str(uuid.uuid4()), "filename": "photo.jpg", "mime_type": "image/jpeg",
                         "size": len(data), "sha256": hashlib.sha256(data).hexdigest()}]}
    result.update(changes)
    return result


async def create(client, headers, body=None, draft_id=None):
    draft_id = draft_id or str(uuid.uuid4())
    body = manifest() if body is None else body
    response = await client.put(f"/api/album-drafts/{draft_id}", json=body, headers=headers)
    return draft_id, body, response


async def test_create_replay_and_conflict(async_client, auth_headers):
    draft_id, body, response = await create(async_client, auth_headers)
    assert response.status_code == 201, response.text
    saved = response.json()
    assert saved["id"] == draft_id and saved["title"] == "iPhone album"
    assert saved["status"] == "uploading" and saved["album_id"] is None
    assert saved["items"][0]["status"] == "pending"
    assert "stored" not in response.text and "cloudinary" not in response.text and "token" not in response.text
    repeated = await async_client.put(f"/api/album-drafts/{draft_id}", json=body, headers=auth_headers)
    assert repeated.status_code == 200 and repeated.json() == saved
    conflict = await async_client.put(f"/api/album-drafts/{draft_id}", json={**body, "title": "Changed"}, headers=auth_headers)
    assert conflict.status_code == 409


async def test_foreign_owner_hidden(async_client, auth_headers, second_user_headers):
    draft_id, body, _ = await create(async_client, auth_headers)
    for method, path, kwargs in [("GET", f"/{draft_id}", {}), ("PUT", f"/{draft_id}", {"json": body})]:
        response = await async_client.request(method, "/api/album-drafts" + path, headers=second_user_headers, **kwargs)
        assert response.status_code == 404 and draft_id not in response.text
    unauthenticated = await async_client.get(f"/api/album-drafts/{draft_id}")
    assert unauthenticated.status_code in (401, 403)


async def test_one_active_draft(async_client, auth_headers):
    draft_id, _, _ = await create(async_client, auth_headers)
    _, _, response = await create(async_client, auth_headers)
    assert response.status_code == 409 and draft_id in response.text


async def test_filtered_status(async_client, auth_headers):
    body = manifest()
    body["items"].append({**body["items"][0], "id": str(uuid.uuid4()), "filename": "second.jpg"})
    draft_id, _, _ = await create(async_client, auth_headers, body)
    response = await async_client.get(f"/api/album-drafts/{draft_id}", params={"item_id": body["items"][1]["id"]}, headers=auth_headers)
    assert response.status_code == 200 and len(response.json()["items"]) == 1
    assert response.json()["items"][0]["order"] == 1
    assert response.json()["item_count"] == 2
    assert (await async_client.get(f"/api/album-drafts/{draft_id}?item_id={uuid.uuid4()}", headers=auth_headers)).status_code == 404


@pytest.mark.parametrize("change", ["empty", "duplicate", "id", "hash", "mime", "name", "control", "long-name", "zero", "oversize", "bool", "title", "description", "owner", "too-many"])
async def test_draft_manifest_boundaries(async_client, auth_headers, change):
    body = manifest()
    item = body["items"][0]
    if change == "empty": body["items"] = []
    elif change == "duplicate": body["items"] *= 2
    elif change == "id": item["id"] = "not-uuid"
    elif change == "hash": item["sha256"] = "invalid"
    elif change == "mime": item["mime_type"] = "image/svg+xml"
    elif change == "name": item["filename"] = "../photo.jpg"
    elif change == "control": item["filename"] = "photo\n.jpg"
    elif change == "long-name": item["filename"] = "я" * 128
    elif change == "zero": item["size"] = 0
    elif change == "oversize": item["size"] = 52428801
    elif change == "bool": item["size"] = True
    elif change == "title": body["title"] = "   "
    elif change == "description": body["description"] = "x" * 1001
    elif change == "owner": body["owner_id"] = str(uuid.uuid4())
    elif change == "too-many": body["items"] = [{**item, "id": str(uuid.uuid4()), "size": 1} for _ in range(10001)]
    _, _, response = await create(async_client, auth_headers, body)
    assert response.status_code == 422, response.text


async def test_exact_ten_gb_metadata_and_extra_byte(async_client, auth_headers):
    body = manifest()
    item = body["items"][0]
    body["items"] = [{**item, "id": str(uuid.uuid4()), "size": 50000000} for _ in range(200)]
    extra = copy.deepcopy(body)
    extra["items"][0]["size"] += 1
    _, _, response = await create(async_client, auth_headers, extra)
    assert response.status_code == 422
    _, _, response = await create(async_client, auth_headers, body)
    assert response.status_code == 201 and response.json()["total_size"] == 10000000000


async def test_expiry_releases_active_slot_without_extending(async_client, auth_headers, db_session):
    from models import AlbumUploadDraft
    draft_id, _, response = await create(async_client, auth_headers)
    expiry = response.json()["expires_at"]
    assert (await async_client.get(f"/api/album-drafts/{draft_id}", headers=auth_headers)).json()["expires_at"] == expiry
    draft = await db_session.scalar(select(AlbumUploadDraft).where(AlbumUploadDraft.id == draft_id))
    draft.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    await db_session.commit()
    _, _, response = await create(async_client, auth_headers)
    assert response.status_code == 201
    old = await async_client.get(f"/api/album-drafts/{draft_id}", headers=auth_headers)
    assert old.json()["status"] == "expired"
