import asyncio
import io
import threading
from types import SimpleNamespace
from urllib.error import HTTPError

import pytest
from sqlalchemy import select
from starlette.requests import Request

from models import PendingUpload, Photo
from tests.test_media_access import headers, media_setup


@pytest.mark.asyncio
async def test_cloud_storage_type_survives_finalize_and_pending_delete(async_client, media_setup, db_session, monkeypatch):
    from routers import albums
    calls = []
    monkeypatch.setattr(albums, "_cloudinary_enabled", lambda: True)
    monkeypatch.setattr(albums, "_cloudinary_upload", lambda *args, **kwargs: "unused-private-origin")
    monkeypatch.setattr(albums, "_cloudinary_delete", lambda *args, **kwargs: calls.append(kwargs))
    auth = headers(media_setup, "owner")
    uploaded = await async_client.post("/api/albums/upload-media", files={"file": ("clip.mp4", b"video", "video/mp4")}, headers=auth)
    assert uploaded.status_code == 200
    pending = await db_session.scalar(select(PendingUpload))
    assert pending.cloudinary_delivery_type == "authenticated"
    token = uploaded.json()["upload_token"]
    created = await async_client.post("/api/albums/", data={"title": "Protected", "is_public": "false", "uploaded_media": '["' + token + '"]'}, headers=auth)
    assert created.status_code == 201, created.text
    row = await db_session.get(Photo, created.json()["photos"][0]["id"])
    assert row.cloudinary_delivery_type == "authenticated"
    assert "/api/media/" in created.json()["photos"][0]["url"]
    another = await async_client.post("/api/albums/upload-media", files={"file": ("clip.mp4", b"video", "video/mp4")}, headers=auth)
    deleted = await async_client.delete("/api/albums/upload-media", params={"upload_token": another.json()["upload_token"]}, headers=auth)
    assert deleted.status_code == 200
    assert calls[-1] == {"resource_type": "video", "delivery_type": "authenticated"}


def test_authenticated_eager_variants_match_server_delivery(monkeypatch):
    import cloudinary.uploader
    import cloudinary.utils
    import cloudinary_utils as storage
    uploaded, delivered = [], []
    monkeypatch.setattr(cloudinary.uploader, "upload", lambda *args, **kw: (uploaded.append(kw) or {"secure_url": "unused"}))
    monkeypatch.setattr(cloudinary.utils, "cloudinary_url", lambda *args, **kw: (delivered.append(kw) or ("https://res.cloudinary.com/fixture/private", {})))
    storage.upload_album_media(b"image", "picmatch/private", "image")
    storage.get_album_media_url("picmatch/private", "image")
    storage.get_album_media_url("picmatch/private", "image", thumbnail=True)
    assert uploaded[0]["type"] == "authenticated" and uploaded[0]["overwrite"] is False
    for index, options in enumerate(delivered):
        assert options["type"] == "authenticated" and options["sign_url"] is True
        assert {key: options[key] for key in ("width", "crop", "quality")} == uploaded[0]["eager"][index]
        assert "fetch_format" not in options
    storage.upload_image(b"avatar", "picmatch/avatar")
    assert "type" not in uploaded[1]  # Existing public-avatar API is independent.


class Origin(io.BytesIO):
    status = 206
    headers = {"Content-Type": "image/jpeg", "Content-Length": "4", "Content-Range": "bytes 0-3/8", "Accept-Ranges": "bytes"}


@pytest.mark.asyncio
async def test_cloud_proxy_ranges_headers_and_cleanup(async_client, media_setup, db_session, monkeypatch):
    from routers import media
    photo = media_setup["photo"]
    photo.cloudinary_delivery_type = "authenticated"
    await db_session.commit()
    monkeypatch.setattr(media, "_cloudinary_enabled", lambda: True)
    monkeypatch.setattr(media, "get_album_media_url", lambda *args, **kwargs: "https://res.cloudinary.com/fixture/secret-signature")
    calls, origins = [], []
    def open_origin(url, method, byte_range, if_range):
        calls.append((method, byte_range, if_range))
        source = Origin(b"0123")
        origins.append(source)
        return source
    monkeypatch.setattr(media, "_open_cloudinary", open_origin)
    auth = headers(media_setup, "owner")
    base = f"/api/media/{photo.id}"
    response = await async_client.get(base, headers={**auth, "Range": "bytes=0-3", "If-Range": '"version"'})
    assert response.status_code == 206 and response.content == b"0123"
    assert response.headers["content-range"] == "bytes 0-3/8"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert origins[-1].closed and calls[-1] == ("GET", "bytes=0-3", '"version"')
    head = await async_client.head(base, headers=auth)
    assert head.status_code == 206 and not head.content and origins[-1].closed
    before = len(calls)
    assert (await async_client.get(base, headers={**auth, "Range": "bytes=0-1,4-5"})).status_code == 416
    assert len(calls) == before
    def redirect(*args):
        raise HTTPError("https://res.cloudinary.com/secret", 302, "Redirect", {"Location": "https://res.cloudinary.com/secret"}, io.BytesIO(b""))
    monkeypatch.setattr(media, "_open_cloudinary", redirect)
    error = await async_client.get(base, headers=auth)
    assert error.status_code == 502 and "location" not in error.headers and "secret" not in error.text


@pytest.mark.asyncio
async def test_cancelled_origin_open_closes_its_late_response(monkeypatch):
    from routers import media
    started, release = threading.Event(), threading.Event()
    source = Origin(b"0123")
    def delayed(*args):
        started.set()
        release.wait(2)
        return source
    monkeypatch.setattr(media, "_open_cloudinary", delayed)
    monkeypatch.setattr(media, "get_album_media_url", lambda *args, **kwargs: "https://res.cloudinary.com/fixture/private")
    photo = SimpleNamespace(cloudinary_delivery_type="authenticated", stored_filename="picmatch/private", media_type="image")
    request = Request({"type": "http", "method": "GET", "headers": [], "path": "/"})
    operation = asyncio.create_task(media._cloud_response(photo, "display", request))
    try:
        while not started.is_set(): await asyncio.sleep(0.001)
        operation.cancel()
        with pytest.raises(asyncio.CancelledError): await operation
    finally:
        release.set()
    for _ in range(1000):
        if source.closed: break
        await asyncio.sleep(0.001)
    assert source.closed
