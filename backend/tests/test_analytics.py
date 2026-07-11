"""
tests/test_analytics.py — Analytics endpoint privacy regression tests.

Covered (MED2 from code-review on Wave 1):
  • PUBLIC album, NON-OWNER viewer → voter_summaries=[] + photos[].reactions=[]
  • PUBLIC album, OWNER viewer     → see full voter_summaries + reactions
  • PRIVATE album, NON-OWNER       → 403 (already covered by route, kept here for
                                       completeness)

These tests guard against the M1 regression where the privacy gate in
_build_analytics would silently drop voter identities even when called
with can_view_stats=True by mistake. If a future refactor changes the
ownership check, these tests fail loudly.
"""
import pytest


pytestmark = pytest.mark.security


# ─── Helpers ────────────────────────────────────────────────────────────────
async def _seed_album_with_vote(async_client, headers, *, is_public=True) -> tuple[str, str]:
    """Create an album via DB injection, add one photo, cast one vote so the
    builder has data to (potentially) reveal."""
    from models import Album, Photo, Vote
    from main import app
    from database import get_db

    uid = (await async_client.get("/api/auth/me", headers=headers)).json()["id"]
    gen = app.dependency_overrides[get_db]()
    session = await gen.__anext__()
    try:
        album = Album(
            title="Test Album",
            invite_code="INV" + uid[:8],
            creator_id=uid,
            is_public=is_public,
        )
        session.add(album)
        await session.commit()
        await session.refresh(album)
        photo = Photo(
            album_id=str(album.id),
            filename="t.jpg",
            stored_filename="t.jpg",
            order=0,
        )
        session.add(photo)
        await session.commit()
        await session.refresh(photo)
        vote = Vote(
            photo_id=str(photo.id),
            voter_id=uid,           # owner voted on own photo
            is_like=True,
        )
        session.add(vote)
        await session.commit()
        return str(album.id), str(photo.id)
    finally:
        await gen.aclose()


# ─── Tests ──────────────────────────────────────────────────────────────────
async def test_analytics_strips_voter_identities_for_non_owner_on_public_album(
    async_client,
    make_user,
    auth_headers,
    second_user_headers,
    db_session,
):
    """Alice owns a PUBLIC album and has voted on it. Bob is a different
    authenticated user (NOT shared). Bob's GET /albums/{id}/analytics must
    return:
      • voter_summaries == []  (privacy gate fires)
      • each photos[].reactions == []
      • but counts (like_count, total_votes, like_percentage) preserved
    """
    album_id, _photo_id = await _seed_album_with_vote(
        db_session, async_client, auth_headers, is_public=True,
    )

    resp = await async_client.get(
        f"/api/albums/{album_id}/analytics", headers=second_user_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # PRIVACY GATE (M1 fix): voter identities must be stripped
    assert body["voter_summaries"] == [], (
        f"REGRESSION: non-owner on public album still receives "
        f"voter identities: {body['voter_summaries']}"
    )
    assert body["can_view_stats"] is False    # explicit marker is also set
    for ps in body["photos"]:
        assert ps["reactions"] == [], (
            f"REGRESSION: per-photo reactions leaked to non-owner: "
            f"{ps['reactions']}"
        )

    # AGGREGATES preserved (the privacy gate only removes identities)
    assert body["total_votes"] >= 1
    assert body["photos"][0]["like_count"] >= 1


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
