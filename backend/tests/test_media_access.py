import io
import time
import uuid
from datetime import datetime, timezone

import jwt
import pytest
import pytest_asyncio
from PIL import Image

from auth import SECRET_KEY, create_access_token, hash_password
from media_access import MEDIA_AUDIENCE
from models import Album, Photo, SharedAccess, User, UserRole


@pytest_asyncio.fixture
async def media_setup(db_session, monkeypatch, tmp_path):
    from routers import media
    monkeypatch.setattr(media, "UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(media, "_cloudinary_enabled", lambda: False)
    password = hash_password("TestPass!42")
    users = {}
    for name in ("owner", "shared", "outsider", "unverified"):
        user = User(email=f"{name}@example.com", username=name, hashed_password=password,
                    role=UserRole.CREATOR, is_active=True, is_verified=name != "unverified")
        db_session.add(user)
        users[name] = user
    await db_session.flush()
    album = Album(title="Private", creator_id=str(users["owner"].id), is_public=False, invite_code="private-invite")
    db_session.add(album)
    await db_session.flush()
    image = io.BytesIO()
    Image.new("RGB", (1200, 800), "blue").save(image, "JPEG")
    name = f"{uuid.uuid4()}.jpg"
    (tmp_path / name).write_bytes(image.getvalue())
    photo = Photo(album_id=str(album.id), filename="photo.jpg", stored_filename=name, media_type="image", order=0)
    db_session.add(photo)
    access = SharedAccess(user_id=str(users["shared"].id), album_id=str(album.id), can_view_stats=False)
    db_session.add(access)
    await db_session.commit()
    return {"users": users, "album": album, "photo": photo, "access": access, "bytes": image.getvalue(), "root": tmp_path}


def headers(setup, who):
    return {"Authorization": f"Bearer {create_access_token(setup['users'][who])}"} if who else {}


@pytest.mark.asyncio
@pytest.mark.parametrize("who,allowed", [("owner", True), ("shared", True), ("outsider", False), ("unverified", False), (None, False)])
async def test_private_media_matrix(async_client, media_setup, who, allowed):
    photo = media_setup["photo"]
    for path in (f"/api/media/{photo.id}", f"/api/media/{photo.id}?variant=thumbnail", f"/api/media/{photo.id}/access"):
        response = await async_client.get(path, headers=headers(media_setup, who))
        assert response.status_code == (200 if allowed else 404), response.text[:100] if not allowed else ""
        assert response.headers["cache-control"] == "private, no-store"
        assert response.headers["referrer-policy"] == "no-referrer"


@pytest.mark.asyncio
async def test_tickets_scoped_and_not_account_tokens(async_client, media_setup):
    base = f"/api/media/{media_setup['photo'].id}"
    reply = await async_client.get(base + "/access", headers=headers(media_setup, "owner"))
    ticket_url = reply.json()["url"]
    assert "res.cloudinary.com" not in ticket_url
    assert (await async_client.get(ticket_url)).content == media_setup["bytes"]
    from urllib.parse import parse_qs, urlparse
    token = parse_qs(urlparse(ticket_url).query)["ticket"][0]
    claims = jwt.decode(token, SECRET_KEY, algorithms=["HS256"], audience=MEDIA_AUDIENCE)
    assert 0 < claims["exp"] - claims["iat"] <= 300
    assert (await async_client.get(base, params={"ticket": token, "variant": "thumbnail"})).status_code == 404
    assert (await async_client.get(base, params={"ticket": token + "x"})).status_code == 404
    assert (await async_client.get(base, params={"ticket": create_access_token(media_setup["users"]["owner"])})).status_code == 404
    assert (await async_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})).status_code == 401
    claims.update(iat=int(time.time()) - 310, exp=int(time.time()) - 10)
    expired = jwt.encode(claims, SECRET_KEY, algorithm="HS256")
    assert (await async_client.get(base, params={"ticket": expired})).status_code == 404
    assert (await async_client.get(base, params={"ticket": jwt.encode(claims, "wrong-secret", algorithm="HS256")})).status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["revoke", "password", "disable", "unverify"])
async def test_existing_ticket_rechecks_current_permissions(async_client, media_setup, db_session, change):
    base = f"/api/media/{media_setup['photo'].id}"
    reply = await async_client.get(base + "/access", headers=headers(media_setup, "shared"))
    assert reply.status_code == 200
    user = media_setup["users"]["shared"]
    if change == "revoke": await db_session.delete(media_setup["access"])
    elif change == "password": user.password_version += 1
    elif change == "disable": user.is_active = False
    else: user.is_verified = False
    await db_session.commit()
    assert (await async_client.get(reply.json()["url"])).status_code == 404


@pytest.mark.asyncio
async def test_public_to_private_and_invite_gate(async_client, media_setup, db_session):
    album = media_setup["album"]
    base = f"/api/media/{media_setup['photo'].id}"
    assert (await async_client.get("/api/albums/invite/private-invite")).status_code == 404
    assert (await async_client.get("/api/albums/invite/private-invite", headers=headers(media_setup, "outsider"))).status_code == 404
    assert (await async_client.get("/api/albums/invite/private-invite", headers=headers(media_setup, "shared"))).status_code == 200
    album.is_public = True
    await db_session.commit()
    assert (await async_client.get(base)).content == media_setup["bytes"]
    reply = await async_client.get(base + "/access")
    assert reply.status_code == 200 and reply.json()["expires_at"] is None
    assert "ticket=" not in reply.json()["url"]
    album.is_public = False
    await db_session.commit()
    assert (await async_client.get(reply.json()["url"])).status_code == 404


@pytest.mark.asyncio
async def test_local_ranges_head_and_thumb_cache(async_client, media_setup):
    base = f"/api/media/{media_setup['photo'].id}"
    auth = headers(media_setup, "owner")
    data = media_setup["bytes"]
    head = await async_client.head(base, headers=auth)
    assert head.status_code == 200 and not head.content and int(head.headers["content-length"]) == len(data)
    for value, expected in [("bytes=0-9", data[:10]), ("bytes=-8", data[-8:]), ("bytes=10-", data[10:])]:
        response = await async_client.get(base, headers={**auth, "Range": value})
        assert response.status_code == 206 and response.content == expected
        assert response.headers["accept-ranges"] == "bytes"
    assert (await async_client.get(base, headers={**auth, "Range": "bytes=99999999-"})).status_code == 416
    assert (await async_client.get(base, headers={**auth, "Range": "bytes=0-1,4-5"})).status_code == 416
    response = await async_client.get(base, headers={**auth, "Range": "bytes=0-1", "If-Range": "old-etag"})
    assert response.status_code == 200 and response.content == data
    thumb = await async_client.get(base + "?variant=thumbnail", headers=auth)
    assert thumb.status_code == 200 and thumb.headers["content-type"] == "image/webp"
    with Image.open(io.BytesIO(thumb.content)) as image: assert max(image.size) <= 480
    assert (await async_client.get(base + "?variant=thumbnail")).status_code == 404


@pytest.mark.asyncio
async def test_legacy_files_denied_but_db_avatar_public(async_client, media_setup, db_session):
    photo = media_setup["photo"]
    for path in (f"/uploads/{photo.stored_filename}", f"/api/thumbnail/{photo.stored_filename}", "/uploads/thumbnails/anything.webp"):
        assert (await async_client.get(path)).status_code == 404
        assert (await async_client.get(path, headers=headers(media_setup, "owner"))).status_code == 404
    avatar = f"avatar_{uuid.uuid4()}.jpg"
    (media_setup["root"] / avatar).write_bytes(media_setup["bytes"])
    assert (await async_client.get(f"/uploads/{avatar}")).status_code == 404
    media_setup["users"]["owner"].avatar_url = f"http://localhost:8000/uploads/{avatar}"
    await db_session.commit()
    assert (await async_client.get(f"/uploads/{avatar}")).content == media_setup["bytes"]


@pytest.mark.asyncio
async def test_cloudinary_legacy_fails_closed_before_upstream(async_client, media_setup, monkeypatch):
    from routers import media
    monkeypatch.setattr(media, "_cloudinary_enabled", lambda: True)
    def forbidden(*args, **kwargs): raise AssertionError("Public Cloudinary origin used")
    monkeypatch.setattr(media, "_open_cloudinary", forbidden)
    response = await async_client.get(f"/api/media/{media_setup['photo'].id}", headers=headers(media_setup, "owner"))
    assert response.status_code == 503
    assert "res.cloudinary.com" not in response.text and "location" not in response.headers
