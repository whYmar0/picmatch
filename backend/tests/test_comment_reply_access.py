"""Per-thread reply authorization; isolated SQLite, no provider calls."""
import pytest
import pytest_asyncio
from sqlalchemy import func, select

from album_access import link_version
from auth import create_access_token, hash_password
from models import Album, Comment, Notification, Photo, SharedAccess, User, UserRole


@pytest_asyncio.fixture
async def discussion(db_session):
    password = hash_password("LocalTest!42")
    users = {}
    for name in ("owner", "author", "visitor"):
        users[name] = User(email=f"{name}@example.com", username=name,
                           hashed_password=password, role=UserRole.CREATOR,
                           is_verified=True, is_active=True)
        db_session.add(users[name])
    await db_session.flush()
    album = Album(title="Private discussion", creator_id=str(users["owner"].id),
                  is_public=False, invite_code="comment-reply-fixture")
    other_album = Album(title="Another album", creator_id=str(users["owner"].id),
                        is_public=False, invite_code="other-comment-fixture")
    db_session.add_all([album, other_album])
    await db_session.flush()
    photo = Photo(album_id=str(album.id), filename="photo.jpg", stored_filename="fixture.jpg",
                  media_type="image", order=0)
    other_photo = Photo(album_id=str(other_album.id), filename="other.jpg", stored_filename="other-fixture.jpg",
                        media_type="image", order=0)
    db_session.add_all([photo, other_photo])
    await db_session.flush()
    grants = {}
    for name in ("author", "visitor"):
        grants[name] = SharedAccess(user_id=str(users[name].id), album_id=str(album.id),
                                   link_version=link_version(album), can_view_stats=False)
        db_session.add(grants[name])
    root = Comment(photo_id=str(photo.id), user_id=str(users["author"].id), text="Author's thread")
    own_root = Comment(photo_id=str(photo.id), user_id=str(users["visitor"].id), text="Visitor's thread")
    other_root = Comment(photo_id=str(other_photo.id), user_id=str(users["author"].id), text="Other photo")
    db_session.add_all([root, own_root, other_root])
    await db_session.flush()
    old_reply = Comment(photo_id=str(photo.id), user_id=str(users["visitor"].id),
                        parent_id=str(root.id), text="Reply from when the album was public")
    db_session.add(old_reply)
    await db_session.commit()
    return dict(users=users, album=album, photo=photo, root=root, own_root=own_root,
                other_root=other_root, old_reply=old_reply, grants=grants)


def headers(setup, who):
    return {"Authorization": f"Bearer {create_access_token(setup['users'][who])}"}


async def counts(db):
    return (await db.scalar(select(func.count(Comment.id))),
            await db.scalar(select(func.count(Notification.id))))


def body(setup, parent="root", target=None):
    result = dict(photo_id=str(setup["photo"].id), parent_id=str(setup[parent].id), text="New reply")
    if target:
        result["reply_to_id"] = str(setup[target].id)
    return result


@pytest.mark.parametrize("target", [None, "root", "old_reply"])
async def test_private_foreign_thread_denied_without_comment_or_notification(
    async_client, db_session, discussion, target
):
    listing = await async_client.get(f"/api/comments/photo/{discussion['photo'].id}",
                                    headers=headers(discussion, "visitor"))
    assert listing.status_code == 200
    assert str(discussion["root"].id) not in {c["id"] for c in listing.json()}
    before = await counts(db_session)
    response = await async_client.post("/api/comments/", json=body(discussion, target=target),
                                       headers=headers(discussion, "visitor"))
    assert response.status_code == 403, response.text
    assert await counts(db_session) == before


@pytest.mark.parametrize("public", [False, True])
@pytest.mark.parametrize("who", ["owner", "author", "visitor"])
async def test_parent_must_be_root_even_if_nested_comment_belongs_to_caller(
    async_client, db_session, discussion, public, who
):
    discussion["album"].is_public = public
    await db_session.commit()
    before = await counts(db_session)
    response = await async_client.post("/api/comments/", json=body(discussion, parent="old_reply"),
                                       headers=headers(discussion, who))
    assert response.status_code == 400, response.text
    assert await counts(db_session) == before


@pytest.mark.parametrize("public,who", [(False, "owner"), (False, "author"), (True, "visitor")])
async def test_permitted_root_replies_still_work(async_client, db_session, discussion, public, who):
    discussion["album"].is_public = public
    await db_session.commit()
    response = await async_client.post("/api/comments/", json=body(discussion, target="root"),
                                       headers=headers(discussion, who))
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["parent_id"] == str(discussion["root"].id)
    assert result["author"]["id"] == str(discussion["users"][who].id)


async def test_exact_reply_target_uses_real_root_and_notifies_addressed_user(async_client, db_session, discussion):
    discussion["album"].is_public = True
    await db_session.commit()
    response = await async_client.post("/api/comments/", json=body(discussion, target="old_reply"),
                                       headers=headers(discussion, "author"))
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["parent_id"] == str(discussion["root"].id)
    notification = await db_session.scalar(select(Notification).where(
        Notification.comment_id == result["id"], Notification.user_id == str(discussion["users"]["visitor"].id)))
    assert notification is not None
    assert notification.actor_id == str(discussion["users"]["author"].id)


@pytest.mark.parametrize("kind", ["other_photo", "other_thread"])
async def test_photo_and_reply_target_boundaries_remain_enforced(async_client, db_session, discussion, kind):
    data = body(discussion, parent="other_root") if kind == "other_photo" else body(discussion, target="own_root")
    before = await counts(db_session)
    response = await async_client.post("/api/comments/", json=data, headers=headers(discussion, "owner"))
    assert response.status_code == 400, response.text
    assert await counts(db_session) == before


@pytest.mark.parametrize("public", [False, True])
@pytest.mark.parametrize("change", ["grant_removed", "link_rotated"])
async def test_link_access_is_required_before_reply_checks(async_client, db_session, discussion, public, change):
    discussion["album"].is_public = public
    if change == "grant_removed":
        await db_session.delete(discussion["grants"]["visitor"])
    else:
        discussion["album"].invite_code = "rotated-fixture-code"
    await db_session.commit()
    before = await counts(db_session)
    response = await async_client.post("/api/comments/", json=body(discussion, parent="own_root"),
                                       headers=headers(discussion, "visitor"))
    assert response.status_code == 403, response.text
    assert await counts(db_session) == before


async def test_privacy_change_is_checked_on_server_without_native_preflight(async_client, db_session, discussion):
    discussion["album"].is_public = True
    await db_session.commit()
    listing = await async_client.get(f"/api/comments/photo/{discussion['photo'].id}", headers=headers(discussion, "visitor"))
    assert str(discussion["root"].id) in {c["id"] for c in listing.json()}
    discussion["album"].is_public = False
    await db_session.commit()
    before = await counts(db_session)
    response = await async_client.post("/api/comments/", json=body(discussion), headers=headers(discussion, "visitor"))
    assert response.status_code == 403, response.text
    assert await counts(db_session) == before


async def test_private_participant_can_start_new_own_thread(async_client, discussion):
    response = await async_client.post("/api/comments/", json={"photo_id": str(discussion["photo"].id), "text": "Own new thread"},
                                       headers=headers(discussion, "visitor"))
    assert response.status_code == 201, response.text
    assert response.json()["parent_id"] is None
