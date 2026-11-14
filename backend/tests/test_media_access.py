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
from album_access import link_version
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
    access = SharedAccess(user_id=str(users["shared"].id), album_id=str(album.id), can_view_stats=False,
                          link_version=link_version(album))
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
async def test_privacy_does_not_replace_the_link_gate(async_client, media_setup, db_session):
    album = media_setup["album"]
    base = f"/api/media/{media_setup['photo'].id}"
    assert (await async_client.get("/api/albums/invite/private-invite")).status_code == 200
    assert (await async_client.get("/api/albums/invite/private-invite", headers=headers(media_setup, "outsider"))).status_code == 200
    assert (await async_client.get("/api/albums/invite/private-invite", headers=headers(media_setup, "shared"))).status_code == 200
    album.is_public = True
    await db_session.commit()
    assert (await async_client.get(base)).status_code == 404
    reply = await async_client.get(base + "/access", params={"invite": album.invite_code})
    assert reply.status_code == 200 and reply.json()["expires_at"] is None
    assert "ticket=" not in reply.json()["url"]
    album.is_public = False
    await db_session.commit()
    assert (await async_client.get(reply.json()["url"])).content == media_setup["bytes"]
    album.is_active = False
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


@pytest.mark.asyncio
@pytest.mark.parametrize("public", [True, False])
async def test_link_required_for_both_album_types(async_client, media_setup, db_session, public):
    album = media_setup["album"]
    album.is_public = public
    media_setup["access"].link_version = None
    await db_session.commit()
    base = f"/api/media/{media_setup['photo'].id}"
    for who in (None, "outsider", "shared"):
        assert (await async_client.get(base, headers=headers(media_setup, who))).status_code == 404
    # The same account's real link visit creates a generation-bound admission.
    visit = await async_client.get(f"/api/albums/invite/{album.invite_code}", headers=headers(media_setup, "shared"))
    assert visit.status_code == 200
    assert (await async_client.get(base, headers=headers(media_setup, "shared"))).status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("public", [True, False])
async def test_link_guest_preview_and_revocation(async_client, media_setup, db_session, public):
    album = media_setup["album"]
    album.is_public = public
    await db_session.commit()
    visit = await async_client.get(f"/api/albums/invite/{album.invite_code}")
    assert visit.status_code == 200
    url = visit.json()["photos"][0]["url"]
    assert "invite=" in url
    assert (await async_client.get(url)).content == media_setup["bytes"]
    partial = await async_client.get(url, headers={"Range": "bytes=0-9"})
    assert partial.status_code == 206 and len(partial.content) == 10
    endpoint = f"/api/albums/{album.id}/invitation"
    revoked = await async_client.delete(endpoint, headers=headers(media_setup, "owner"))
    assert revoked.status_code == 200 and revoked.json()["is_active"] is False
    for method in ("GET", "HEAD"):
        assert (await async_client.request(method, url, headers={"Range": "bytes=0-9"})).status_code == 404
    assert (await async_client.get(f"/api/albums/invite/{album.invite_code}")).status_code == 404
    # Merely looking at the owner panel must not undo revocation.
    state = (await async_client.get(endpoint, headers=headers(media_setup, "owner"))).json()
    assert state["is_active"] is False and state["invite_url"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize("public", [True, False])
async def test_link_rotation_never_revives_old_ticket(async_client, media_setup, db_session, public):
    album = media_setup["album"]
    album.is_public = public
    album.share_token = "legacy-statistics-token"
    await db_session.commit()
    old_code = album.invite_code
    base = f"/api/media/{media_setup['photo'].id}"
    visitor = headers(media_setup, "shared")
    owner = headers(media_setup, "owner")
    assert (await async_client.get(f"/api/albums/invite/{old_code}", headers=visitor)).status_code == 200
    ticket = (await async_client.get(base + "/access", headers=visitor)).json()["url"]
    owner_ticket = (await async_client.get(base + "/access", headers=owner)).json()["url"]
    assert "ticket=" in ticket
    endpoint = f"/api/albums/{album.id}/invitation"
    rotated = await async_client.post(endpoint + "/rotate", headers=owner)
    assert rotated.status_code == 200
    new_code = rotated.json()["invite_code"]
    assert new_code != old_code
    assert (await async_client.get(f"/api/albums/invite/{old_code}", headers=visitor)).status_code == 404
    assert (await async_client.get("/api/albums/shared/legacy-statistics-token/analytics", headers=visitor)).status_code == 404
    assert (await async_client.get(base, headers=visitor)).status_code == 404
    assert (await async_client.get(ticket)).status_code == 404
    assert (await async_client.get(f"/api/albums/invite/{new_code}", headers=visitor)).status_code == 200
    assert (await async_client.get(base, headers=visitor)).status_code == 200
    assert (await async_client.get(ticket)).status_code == 404
    assert (await async_client.get(owner_ticket)).status_code == 200
    assert (await async_client.delete(endpoint, headers=owner)).status_code == 200
    recreated = await async_client.post(endpoint, headers=owner)
    assert recreated.status_code == 200 and recreated.json()["invite_code"] != new_code
    assert (await async_client.get(base, headers=visitor)).status_code == 404
    assert (await async_client.post(endpoint + "/rotate", headers=headers(media_setup, "outsider"))).status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("public", [True, False])
async def test_link_stats_follow_privacy_not_old_grant(async_client, media_setup, db_session, public):
    from models import Vote
    album = media_setup["album"]
    album.is_public = public
    album.share_token = "legacy-statistics-token"
    media_setup["access"].can_view_stats = True
    db_session.add(Vote(photo_id=str(media_setup["photo"].id), voter_id=str(media_setup["users"]["owner"].id), is_like=True))
    await db_session.commit()
    endpoint = f"/api/albums/{album.id}/analytics"
    assert (await async_client.get(endpoint, headers=headers(media_setup, "outsider"))).status_code in (403, 404)
    visitor = headers(media_setup, "shared")
    for code in ("legacy-statistics-token", album.invite_code):
        opened = await async_client.get(f"/api/albums/shared/{code}", headers=visitor)
        assert opened.status_code == 200
        assert opened.json()["photo_count"] == 1 and "voter_summaries" not in opened.json()
    response = await async_client.get("/api/albums/shared/legacy-statistics-token/analytics", headers=visitor)
    assert response.status_code == 200
    data = response.json()
    assert data["can_view_stats"] is public
    assert data["total_votes"] == (1 if public else 0)
    if not public:
        assert data["voter_summaries"] == [] and data["winner"] is None
        assert all(p["reactions"] == [] and p["total_votes"] == 0 for p in data["photos"])
    # A former public viewer immediately loses statistics after a privacy flip.
    album.is_public = False
    await db_session.commit()
    assert (await async_client.get(endpoint, headers=visitor)).json()["can_view_stats"] is False
    assert (await async_client.get(endpoint, headers=headers(media_setup, "owner"))).json()["can_view_stats"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize("public", [True, False])
async def test_link_revocation_closes_participation_bypasses(async_client, media_setup, db_session, public):
    album = media_setup["album"]
    album.is_public = public
    await db_session.commit()
    visitor = headers(media_setup, "shared")
    photo_id = str(media_setup["photo"].id)
    assert (await async_client.get(f"/api/albums/invite/{album.invite_code}", headers=visitor)).status_code == 200
    assert (await async_client.post("/api/votes/", json={"photo_id": photo_id, "is_like": True}, headers=visitor)).status_code == 201
    comment = await async_client.post("/api/comments/", json={"photo_id": photo_id, "text": "My thread"}, headers=visitor)
    assert comment.status_code == 201, comment.text
    comment_id = comment.json()["id"]
    assert (await async_client.delete(f"/api/albums/{album.id}/invitation", headers=headers(media_setup, "owner"))).status_code == 200
    for method, path, body in [
        ("GET", f"/api/albums/{album.id}/analytics", None),
        ("GET", f"/api/albums/{album.id}/my-comments", None),
        ("GET", f"/api/votes/album/{album.id}/my-votes", None),
        ("DELETE", f"/api/votes/album/{album.id}/my-votes", None),
        ("POST", "/api/votes/", {"photo_id": photo_id, "is_like": False}),
        ("GET", f"/api/comments/photo/{photo_id}", None),
        ("GET", f"/api/comments/thread/{comment_id}", None),
        ("POST", "/api/comments/", {"photo_id": photo_id, "text": "After revoke"}),
        ("POST", f"/api/comments/{comment_id}/like", None),
        ("DELETE", f"/api/comments/{comment_id}", None),
    ]:
        result = await async_client.request(method, path, headers=visitor, **({"json": body} if body else {}))
        assert result.status_code in (403, 404), (method, path, result.status_code)
    assert (await async_client.get("/api/shared/with-me", headers=visitor)).json() == []


@pytest.mark.asyncio
@pytest.mark.parametrize("public", [True, False])
@pytest.mark.parametrize("action", ["rotate", "revoke"])
async def test_link_revocation_hides_new_reply_notifications(
    async_client, media_setup, db_session, public, action
):
    from models import Notification
    from sqlalchemy import select
    album = media_setup["album"]
    album.is_public = public
    await db_session.commit()
    visitor, owner = headers(media_setup, "shared"), headers(media_setup, "owner")
    photo_id = str(media_setup["photo"].id)
    root = await async_client.post("/api/comments/", headers=visitor,
                                   json={"photo_id": photo_id, "text": "Original question"})
    assert root.status_code == 201
    endpoint = f"/api/albums/{album.id}/invitation"
    change = await (async_client.post(endpoint + "/rotate", headers=owner) if action == "rotate"
                    else async_client.delete(endpoint, headers=owner))
    assert change.status_code == 200
    reply = await async_client.post("/api/comments/", headers=owner,
                                    json={"photo_id": photo_id, "parent_id": root.json()["id"],
                                          "text": "Fresh reply after access was revoked"})
    assert reply.status_code == 201, reply.text
    assert (await async_client.get("/api/notifications/", headers=visitor)).json() == []
    assert (await async_client.get("/api/notifications/", headers=owner)).json()
    assert await db_session.scalar(select(Notification.id).where(
        Notification.user_id == str(media_setup["users"]["shared"].id))) is not None
    current = change.json()
    if action == "revoke":
        current = (await async_client.post(endpoint, headers=owner)).json()
    assert (await async_client.get(f"/api/albums/invite/{current['invite_code']}", headers=visitor)).status_code == 200
    visible = (await async_client.get("/api/notifications/", headers=visitor)).json()
    assert len(visible) == 1 and visible[0]["text"] == "Fresh reply after access was revoked"
