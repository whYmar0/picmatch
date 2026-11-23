import uuid

import pytest
from sqlalchemy import select

from models import Album, Comment, Notification, NotificationType, Photo, User, Vote
from tests.test_album_drafts import create, manifest


@pytest.fixture
async def editable_album(db_session, auth_headers):
    owner = await db_session.scalar(select(User).where(User.email == "alice@x.com"))
    album = Album(title="Original", description="Old", creator_id=owner.id,
                  invite_code="edit-invite", share_token="edit-results", is_public=True)
    album.photos = [
        Photo(filename="first.jpg", stored_filename="first.jpg", order=0),
        Photo(filename="next.jpg", stored_filename="next.jpg", order=1),
    ]
    db_session.add(album)
    await db_session.commit()
    return album, owner


def edit(album, *, items=(), remove=(), version=0):
    return {"title": "Edited", "description": None, "items": list(items),
            "edit": {"album_id": str(album.id), "base_version": version,
                     "remove_photo_ids": [str(photo_id) for photo_id in remove]}}


async def test_album_edit_metadata_and_removal(async_client, auth_headers, second_user_headers, db_session, editable_album):
    album, owner = editable_album
    removed, kept = album.photos
    voter = await db_session.scalar(select(User).where(User.email == "bob@x.com"))
    db_session.add(Vote(photo_id=removed.id, voter_id=voter.id, is_like=False))
    db_session.add(Notification(user_id=owner.id, actor_id=voter.id, type=NotificationType.VOTE, album_id=album.id))
    db_session.add(Notification(user_id=owner.id, actor_id=owner.id, type=NotificationType.VOTE, album_id=album.id))
    db_session.add_all([Vote(photo_id=photo.id, voter_id=owner.id, is_like=True) for photo in album.photos])
    comment = Comment(photo_id=removed.id, user_id=owner.id, text="Deleted with photo")
    db_session.add(comment)
    await db_session.flush()
    db_session.add(Notification(user_id=owner.id, type=NotificationType.COMMENT,
                                album_id=album.id, photo_id=removed.id, comment_id=comment.id))
    await db_session.commit()

    url = f"/api/albums/{album.id}/edit-state"
    assert (await async_client.get(url, headers=second_user_headers)).status_code == 404
    snapshot = await async_client.get(url, headers=auth_headers)
    assert snapshot.status_code == 200
    assert snapshot.json()["edit_version"] == 0
    body = edit(album, remove=[removed.id])
    assert (await create(async_client, second_user_headers, body))[2].status_code == 404
    draft_id, _, response = await create(async_client, auth_headers, body)
    assert response.status_code == 201, response.text
    assert response.json()["target_album_id"] == str(album.id)
    assert response.json()["edit"] == body["edit"]
    assert response.json()["item_count"] == 0
    path = f"/api/album-drafts/{draft_id}"
    assert (await async_client.post(path + "/upload-grant", headers=auth_headers)).status_code == 409
    result = await async_client.post(path + "/finalize", headers=auth_headers)
    assert result.status_code == 201, result.text
    saved = result.json()
    assert saved["id"] == str(album.id) and saved["title"] == "Edited" and saved["is_public"]
    assert [photo["id"] for photo in saved["photos"]] == [str(kept.id)]
    assert saved["unique_voters"] == 1
    repeated = await async_client.post(path + "/finalize", headers=auth_headers)
    assert repeated.status_code == 200 and repeated.json() == saved
    assert [str(photo_id) for photo_id in (await db_session.scalars(select(Vote.photo_id))).all()] == [str(kept.id)]
    assert not (await db_session.scalars(select(Comment.id))).all()
    notices = (await db_session.scalars(select(Notification))).all()
    assert [(notice.actor_id, notice.type) for notice in notices] == [(owner.id, NotificationType.VOTE)]
    await db_session.refresh(album)
    assert (album.edit_version, album.invite_code, album.share_token) == (1, "edit-invite", "edit-results")
    assert (await create(async_client, auth_headers, body))[2].status_code == 409


async def test_incomplete_edit_and_cancel_leave_published_album_unchanged(async_client, auth_headers, editable_album):
    album, _ = editable_album
    data = b"new file"
    items = manifest(data)["items"]
    assert (await create(async_client, auth_headers, edit(album, remove=[uuid.uuid4()])))[2].status_code == 422
    assert (await create(async_client, auth_headers, edit(album, remove=[photo.id for photo in album.photos])))[2].status_code == 422
    body = edit(album, items=items, remove=[album.photos[0].id])
    draft_id, _, response = await create(async_client, auth_headers, body)
    assert response.status_code == 201, response.text
    path = f"/api/album-drafts/{draft_id}"
    assert (await async_client.post(path + "/finalize", headers=auth_headers)).status_code == 409
    album_path = f"/api/albums/{album.id}/edit-state"
    assert (await async_client.get(album_path, headers=auth_headers)).json()["album"]["title"] == "Original"
    assert (await async_client.delete(path, headers=auth_headers)).json()["status"] == "cancelled"
    assert len((await async_client.get(album_path, headers=auth_headers)).json()["album"]["photos"]) == 2

async def test_edit_migration_preserves_existing_draft_items(tmp_path):
    from sqlalchemy import event, inspect, text
    from sqlalchemy.ext.asyncio import create_async_engine
    from migrate_album_editing import migrate_schema

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'editing.sqlite'}")
    @event.listens_for(engine.sync_engine, "connect")
    def enable_foreign_keys(connection, _):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    try:
        async with engine.begin() as db:
            await db.execute(text("CREATE TABLE users (id VARCHAR(36) PRIMARY KEY)"))
            await db.execute(text("CREATE TABLE albums (id VARCHAR(36) PRIMARY KEY)"))
            await db.execute(text("""CREATE TABLE album_upload_drafts (
                id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
                manifest_hash VARCHAR(64), title VARCHAR(255), description TEXT, is_public BOOLEAN,
                status VARCHAR(16), total_size BIGINT, created_at DATETIME, expires_at DATETIME, album_id VARCHAR(36),
                CONSTRAINT ck_draft_total_size CHECK (total_size > 0 AND total_size <= 10000000000)
            )"""))
            await db.execute(text("""CREATE TABLE album_upload_items (id VARCHAR(36) PRIMARY KEY,
                draft_id VARCHAR(36) REFERENCES album_upload_drafts(id) ON DELETE CASCADE)"""))
            await db.execute(text("INSERT INTO users VALUES ('owner')"))
            await db.execute(text("INSERT INTO albums VALUES ('album')"))
            await db.execute(text("""INSERT INTO album_upload_drafts VALUES
                ('draft', 'owner', 'original', 'Old', NULL, 0, 'ready', 3, '2026-01-01', '2027-01-01', NULL)"""))
            await db.execute(text("INSERT INTO album_upload_items VALUES ('item', 'draft')"))
        await migrate_schema(engine)
        await migrate_schema(engine)
        async with engine.begin() as db:
            assert (await db.execute(text("SELECT manifest_hash, edit_intent FROM album_upload_drafts"))).one() == ("original", None)
            assert await db.scalar(text("SELECT draft_id FROM album_upload_items WHERE id='item'")) == "draft"
            assert await db.scalar(text("SELECT edit_version FROM albums WHERE id='album'")) == 0
            assert await db.scalar(text("PRAGMA foreign_keys")) == 1
            assert await db.run_sync(lambda conn: inspect(conn).has_table("removed_album_media"))
            await db.execute(text("UPDATE album_upload_drafts SET total_size = 0 WHERE id='draft'"))
    finally:
        await engine.dispose()

async def test_add_media_and_retry_cleanup(async_client, db_session, auth_headers, editable_album, monkeypatch):
    import album_editing
    from models import RemovedAlbumMedia

    album, _ = editable_album
    data = b"new photo bytes"
    items = manifest(data)["items"]
    draft_id, _, response = await create(async_client, auth_headers, edit(album, items=items, remove=[album.photos[0].id]))
    assert response.status_code == 201, response.text
    path = f"/api/album-drafts/{draft_id}"
    uploaded = await async_client.put(
        f"{path}/items/{items[0]['id']}", headers={**auth_headers, "Content-Type": "image/jpeg"}, content=data,
    )
    assert uploaded.status_code == 200, uploaded.text
    saved = await async_client.post(path + "/finalize", headers=auth_headers)
    assert saved.status_code == 201, saved.text
    assert [item["filename"] for item in saved.json()["photos"]] == ["next.jpg", "photo.jpg"]
    assert (await async_client.post(path + "/finalize", headers=auth_headers)).json() == saved.json()
    attempts = []

    async def remove(job):
        attempts.append(job.stored_filename)
        if len(attempts) == 1:
            raise OSError("storage unavailable")

    monkeypatch.setattr(album_editing, "delete_published_media", remove)
    await album_editing.cleanup_removed_media(db_session)
    job = await db_session.scalar(select(RemovedAlbumMedia))
    assert job is not None and attempts == ["first.jpg"]
    from datetime import datetime, timedelta, timezone
    job.retry_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    await db_session.commit()
    await album_editing.cleanup_removed_media(db_session)
    assert attempts == ["first.jpg", "first.jpg"]
    assert await db_session.scalar(select(RemovedAlbumMedia)) is None


async def test_stale_edit_never_recreates_deleted_album(async_client, auth_headers, editable_album, monkeypatch):
    from routers import albums

    album, _ = editable_album
    monkeypatch.setattr(albums, "_cloudinary_enabled", lambda: False)
    draft_id, _, response = await create(async_client, auth_headers, edit(album))
    assert response.status_code == 201, response.text
    deleted = await async_client.delete(f"/api/albums/{album.id}", headers=auth_headers)
    assert deleted.status_code == 200, deleted.text
    assert (await async_client.post(f"/api/album-drafts/{draft_id}/finalize", headers=auth_headers)).status_code == 404
    assert (await async_client.delete(f"/api/album-drafts/{draft_id}", headers=auth_headers)).json()["status"] == "cancelled"


async def test_cleanup_preserves_referenced_objects(db_session, monkeypatch, editable_album):
    import album_editing
    from models import PendingUpload, RemovedAlbumMedia
    from datetime import datetime, timedelta, timezone

    album, owner = editable_album
    db_session.add(PendingUpload(
        user_id=owner.id, stored_filename="pending.jpg", original_filename="pending.jpg",
        media_type="image", expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    ))
    db_session.add_all([
        RemovedAlbumMedia(stored_filename=filename, media_type="image", delivery_type="upload", storage_kind="local")
        for filename in [album.photos[0].stored_filename, "pending.jpg", "unused.jpg"]
    ])
    await db_session.commit()

    deletions = []

    async def remove(job):
        deletions.append(job.stored_filename)

    monkeypatch.setattr(album_editing, "delete_published_media", remove)
    await album_editing.cleanup_removed_media(db_session)
    assert deletions == ["unused.jpg"]
    assert not (await db_session.scalars(select(RemovedAlbumMedia.id))).all()

async def test_removed_media_cleanup_deletes_the_local_preview_and_checks_cloud_receipts(tmp_path, monkeypatch):
    from types import SimpleNamespace
    import cloudinary.uploader
    import album_draft_storage as storage

    monkeypatch.setattr(storage, "UPLOAD_DIR", tmp_path)
    (tmp_path / "thumbnails").mkdir()
    original = tmp_path / "removed.jpg"
    original.write_bytes(b"original")
    preview = tmp_path / "thumbnails/thumb_removed.jpg.webp"
    preview.write_bytes(b"preview")
    await storage.delete_published_media(SimpleNamespace(storage_kind="local", stored_filename="removed.jpg"))
    assert not original.exists() and not preview.exists()

    requests = []

    def destroy(public_id, **kwargs):
        requests.append((public_id, kwargs))
        return {"result": "error" if len(requests) == 1 else "not found"}

    monkeypatch.setattr(storage, "is_cloudinary_configured", lambda: True)
    monkeypatch.setattr(cloudinary.uploader, "destroy", destroy)
    media = SimpleNamespace(storage_kind="cloudinary", stored_filename="drafts/example", media_type="video",
                            delivery_type="authenticated")
    with pytest.raises(RuntimeError):
        await storage.delete_published_media(media)
    await storage.delete_published_media(media)
    expected = ("drafts/example", {"resource_type": "video", "type": "authenticated", "invalidate": True})
    assert requests == [expected, expected]
