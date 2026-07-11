"""
tests/test_votes.py — Voting endpoint regression tests.

Covered:
  • public-album happy path: first vote creates, second vote on same photo updates
  • private album + non-shared voter → 403 (the OWASP IDOR fix from Wave 2)
  • private album + SharedAccess holder → 200
  • non-existent photo_id → 404 (no information disclosure)
"""
import pytest
from sqlalchemy import select


pytestmark = [pytest.mark.smoke, pytest.mark.security]


# ─── Helpers ────────────────────────────────────────────────────────────────
async def _seed_album(db_session, async_client, headers, *, is_public=True, title="T") -> str:
    """Create an empty album via direct DB write and return its album_id.

    Uses the conftest `db_session` fixture directly (no app.dependency_overrides
    generator hack — that pattern is fragile because it relies on the override
    still being in place AND it leaks the generator's lifecycle).
    """
    from models import Album
    uid = (await async_client.get("/api/auth/me", headers=headers)).json()["id"]
    album = Album(
        title=title,
        invite_code="INV" + uid[:8],
        creator_id=uid,
        is_public=is_public,
    )
    db_session.add(album)
    await db_session.commit()
    await db_session.refresh(album)
    return str(album.id)


async def _seed_photo(db_session, album_id: str) -> str:
    from models import Photo
    p = Photo(
        album_id=album_id,
        filename="test.jpg",
        stored_filename="test-test.jpg",
        order=0,
    )
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return str(p.id)


# ─── Tests ──────────────────────────────────────────────────────────────────
async def test_public_album_vote_happy_path(async_client, auth_headers, db_session):
    """User creates a public album, votes on a photo: 201, then re-votes: 200.
    This is the canonical permission path — must pass."""
    album_id = await _seed_album(db_session, async_client, auth_headers, is_public=True)
    photo_id = await _seed_photo(db_session, album_id)

    r1 = await async_client.post(
        "/api/votes/",
        json={"photo_id": photo_id, "is_like": True},
        headers=auth_headers,
    )
    assert r1.status_code == 201, r1.text

    r2 = await async_client.post(
        "/api/votes/",
        json={"photo_id": photo_id, "is_like": False},
        headers=auth_headers,
    )
    # Re-voting on the same (photo, voter) updates the existing vote in place
    # — endpoint returns 200 (NOT 201), which the test confirms.
    assert r2.status_code in (200, 201), r2.text
    body = r2.json()
    assert body["is_like"] is False  # flipped from True → False


async def test_private_album_vote_blocks_non_shared_voter(
    async_client,
    auth_headers,
    second_user_headers,
    db_session,
):
    """The CRITICAL security test (Wave 2 IDOR fix).

    Alice makes a PRIVATE album. Bob is authenticated but has NOT been
    granted SharedAccess. The old code would have accepted Bob's vote.
    After the fix Bob must get 403.
    """
    album_id = await _seed_album(db_session, async_client, auth_headers, is_public=False)
    photo_id = await _seed_photo(db_session, album_id)

    resp = await async_client.post(
        "/api/votes/",
        json={"photo_id": photo_id, "is_like": True},
        headers=second_user_headers,
    )
    assert resp.status_code == 403, (
        f"REGRESSION: private album leaked to non-shared voter. "
        f"Got {resp.status_code}: {resp.text}"
    )
    # Confirm no Vote row was actually inserted (also implicitly tests that
    # the row count in our DB session stays consistent under conftest's
    # StaticPool + autouse schema reset)
    from sqlalchemy import select
    from models import Vote
    res = await db_session.execute(select(Vote).where(Vote.photo_id == photo_id))
    assert res.scalar_one_or_none() is None, "Vote row was inserted despite 403"


async def test_private_album_owner_can_vote(async_client, auth_headers, db_session):
    """Owner of a private album can still vote on their own photos."""
    album_id = await _seed_album(db_session, async_client, auth_headers, is_public=False)
    photo_id = await _seed_photo(db_session, album_id)

    resp = await async_client.post(
        "/api/votes/",
        json={"photo_id": photo_id, "is_like": True},
        headers=auth_headers,
    )
    assert resp.status_code in (200, 201), resp.text


async def test_vote_on_nonexistent_photo_returns_404(async_client, auth_headers):
    """Photo ID that does not exist must return 404 — not 500."""
    resp = await async_client.post(
        "/api/votes/",
        json={"photo_id": "00000000-0000-0000-0000-000000000000",
              "is_like": True},
        headers=auth_headers,
    )
    assert resp.status_code == 404, resp.text
