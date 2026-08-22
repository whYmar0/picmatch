"""
tests/test_analytics.py — Analytics access and privacy regression tests.

Covered:
  • PUBLIC album, NON-OWNER viewer → full analytics
  • PUBLIC album, OWNER viewer     → full analytics
  • PRIVATE album, shared viewer   → photos/comments-only payload
  • PRIVATE album, non-shared      → 403
"""
import pytest


pytestmark = pytest.mark.security


# ─── Helpers ────────────────────────────────────────────────────────────────
async def _seed_album_with_vote(db_session, async_client, headers, *, is_public=True) -> tuple[str, str]:
    """Create an album + photo + vote via direct DB writes. Uses the conftest
    `db_session` fixture directly — no app.dependency_overrides generator hack.
    """
    from models import Album, Photo, Vote

    uid = (await async_client.get("/api/auth/me", headers=headers)).json()["id"]
    album = Album(
        title="Test Album",
        invite_code="INV" + uid[:8],
        creator_id=uid,
        is_public=is_public,
    )
    db_session.add(album)
    await db_session.commit()
    await db_session.refresh(album)
    photo = Photo(
        album_id=str(album.id),
        filename="t.jpg",
        stored_filename="t.jpg",
        order=0,
    )
    db_session.add(photo)
    await db_session.commit()
    await db_session.refresh(photo)
    vote = Vote(
        photo_id=str(photo.id),
        voter_id=uid,           # owner voted on own photo
        is_like=True,
    )
    db_session.add(vote)
    await db_session.commit()
    return str(album.id), str(photo.id)


# ─── Tests ──────────────────────────────────────────────────────────────────
async def test_analytics_non_owner_on_public_album_sees_full_stats(
    async_client,
    auth_headers,
    second_user_headers,
    db_session,
):
    """Any authenticated voter can see full analytics for a public album."""
    album_id, _photo_id = await _seed_album_with_vote(
        db_session, async_client, auth_headers, is_public=True,
    )

    resp = await async_client.get(
        f"/api/albums/{album_id}/analytics", headers=second_user_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["can_view_stats"] is True
    assert body["total_votes"] >= 1
    assert body["photos"][0]["like_count"] >= 1
    assert len(body["voter_summaries"]) >= 1
    assert len(body["photos"][0]["reactions"]) >= 1


async def test_analytics_owner_on_public_album_sees_everything(
    async_client, auth_headers, db_session,
):
    """Owner MUST still see voter_summaries and reactions — the gate must
    only activate for non-owners."""
    album_id, _ = await _seed_album_with_vote(
        db_session, async_client, auth_headers, is_public=True,
    )
    resp = await async_client.get(
        f"/api/albums/{album_id}/analytics", headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["can_view_stats"] is True
    # Owner sees at least one voter (themselves) — the seed runs a vote.
    assert len(body["voter_summaries"]) >= 1
    assert len(body["photos"][0]["reactions"]) >= 1


async def test_analytics_private_album_shared_viewer_sees_photos_only(
    async_client,
    auth_headers,
    second_user_headers,
    db_session,
):
    """A SharedAccess holder can open a private album without seeing stats."""
    from models import SharedAccess

    album_id, _ = await _seed_album_with_vote(
        db_session, async_client, auth_headers, is_public=False,
    )
    viewer_id = (await async_client.get("/api/auth/me", headers=second_user_headers)).json()["id"]
    db_session.add(SharedAccess(user_id=viewer_id, album_id=album_id, can_view_stats=True))
    await db_session.commit()

    resp = await async_client.get(
        f"/api/albums/{album_id}/analytics", headers=second_user_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["can_view_stats"] is False
    assert body["total_votes"] == 0
    assert body["unique_voters"] == 0
    assert body["global_like_rate"] == 0
    assert body["voter_summaries"] == []
    assert body["winner"] is None
    assert body["photos"][0]["reactions"] == []
    assert body["photos"][0]["like_count"] == 0
    assert body["photos"][0]["dislike_count"] == 0
    assert body["photos"][0]["total_votes"] == 0


async def test_analytics_private_album_blocks_non_owner_with_403(
    async_client,
    auth_headers,
    second_user_headers,
    db_session,
):
    """Private album: non-owner non-shared viewer must get 403, not 200."""
    album_id, _ = await _seed_album_with_vote(
        db_session, async_client, auth_headers, is_public=False,
    )
    resp = await async_client.get(
        f"/api/albums/{album_id}/analytics", headers=second_user_headers,
    )
    assert resp.status_code == 403
