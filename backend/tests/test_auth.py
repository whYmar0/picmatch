"""
tests/test_auth.py — Authentication flow regression tests.

Covers:
  • register happy path
  • duplicate email / username → 409 / 400
  • login valid creds 200 + JWT shape
  • login invalid creds 401 (no enumeration leak in body)
  • /auth/me requires Bearer token
  • register-password complexity validator (lowercase + uppercase + special)
"""
import pytest


pytestmark = pytest.mark.smoke


async def test_register_creates_verifiable_user(async_client):
    """Register returns 201 with a JWT-shaped response."""
    resp = await async_client.post("/api/auth/register", json={
        "email": "carol@x.com",
        "username": "carol",
        "password": "Test1234!A",
        "role": "creator",
    })
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert isinstance(body["access_token"], str) and len(body["access_token"]) > 30
    assert body["user"]["email"] == "carol@x.com"
    assert body["user"]["is_verified"] is False  # require email confirm


async def test_register_duplicate_verified_email_returns_400(async_client, make_user):
    """Second register of an already-VERIFIED email is rejected with 400.

    Each iteration of the auth-router code path is asserted precisely
    so future regressions don't silently leak into the duplicate-email
    branch (which used to return 200/201 in some configs and 409/400 in
    others — that ambiguity is what MED1 in code-review flagged).
    """
    # First user is registered AND `make_user` flips is_verified=True via DB.
    await make_user("dup@x.com", "first_user")
    resp = await async_client.post("/api/auth/register", json={
        "email": "dup@x.com",
        "username": "second_user",
        "password": "Test1234!A",
        "role": "creator",
    })
    # 400 is the documented response for re-register of a verified email.
    assert resp.status_code == 400, (
        f"REGRESSION: duplicate-email branch returned {resp.status_code} "
        f"({resp.text}); expected exactly 400"
    )
    assert "already" in resp.json().get("detail", "").lower()


async def test_login_with_valid_creds_returns_jwt(async_client, make_user):
    """A verified user logging in gets a valid JWT-shaped response."""
    await make_user("dave@x.com", "dave")
    resp = await async_client.post("/api/auth/login", json={
        "email": "dave@x.com", "password": "Test1234!A",
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == "dave@x.com"


async def test_login_with_invalid_password_returns_401(async_client, make_user):
    """Brute-force protection test: wrong password must 401, not 500.

    The defensive detail message tells you NOTHING about whether the
    email exists vs the password is bad — both branches return the
    same string ("Incorrect email or password"). That's the OWASP
    recommendation: never distinguish user-not-found from bad-password
    to avoid enabling email enumeration. The test asserts a 401 plus
    that the SAME message is used regardless of which failure branch
    was taken.
    """
    await make_user("eve@x.com", "eve")
    resp_bad_pw = await async_client.post("/api/auth/login", json={
        "email": "eve@x.com", "password": "wrongWRONG12!",
    })
    assert resp_bad_pw.status_code == 401
    obfuscated_msg = resp_bad_pw.json()["detail"]

    # Compare with the unknown-email branch — must use the same message.
    # Note on TLD choice: pydantic v2 + email-validator requires the TLD to be
    # in the public-suffix list (which excludes RFC 2606 reserved `.test` /
    # `.invalid` / `.example`). We use `.com` because it's a public-suffix
    # TLD that obviously doesn't resolve to a real mailbox in this test DB.
    resp_unknown_email = await async_client.post("/api/auth/login", json={
        "email": "ghost@nowhere.com", "password": "irrelevant",
    })
    assert resp_unknown_email.status_code == 401
    assert resp_unknown_email.json()["detail"] == obfuscated_msg, (
        f"REGRESSION: login messages diverge between bad-password and "
        f"unknown-email (bad: {obfuscated_msg!r}, unknown: "
        f"{resp_unknown_email.json()['detail']!r}). Email enumeration "
        f"vulnerability re-opened."
    )


async def test_me_requires_bearer_token(async_client):
    """`/auth/me` without a Bearer token must be blocked.

    FastAPI's `HTTPBearer(auto_error=True)` (the default) rejects missing
    creds with **403** \u2014 not 401 \u2014 because the WWW-Authenticate challenge is
    only meaningful when the server actually attempted to authenticate.
    Asserting in {401, 403} documents both the upstream dep's behavior
    AND the route's own 401 fallback if a malformed token is presented.
    """
    resp = await async_client.get("/api/auth/me")
    assert resp.status_code in (401, 403), (
        f"REGRESSION: /auth/me unauthenticated returned {resp.status_code} "
        f"({resp.text}); expected 401 or 403."
    )


async def test_me_with_valid_token_returns_user(async_client, auth_headers):
    """/auth/me with a valid Bearer returns the user record."""
    resp = await async_client.get("/api/auth/me", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["email"] == "alice@x.com"
    assert body["username"] == "alice"


async def test_register_rejects_weak_password(async_client):
    """Password complexity validator must enforce uppercase + special char."""
    resp = await async_client.post("/api/auth/register", json={
        "email": "weak@x.com",
        "username": "weak_user",
        "password": "alllowercase1234",   # no uppercase, no special
        "role": "creator",
    })
    assert resp.status_code == 422   # pydantic ValidationError
    # Confirm validators caught the rules
    detail = resp.json().get("detail", [])
    assert isinstance(detail, list)
    msgs = " ".join(str(e.get("msg", "")) for e in detail)
    assert ("uppercase" in msgs) or ("special" in msgs)

async def test_update_username_keeps_identity_and_requires_unique_valid_name(
    async_client, auth_headers, second_user_headers,
):
    before = (await async_client.get("/api/auth/me", headers=auth_headers)).json()
    other = (await async_client.get("/api/auth/me", headers=second_user_headers)).json()
    url = "/api/auth/me"
    anonymous = await async_client.patch(url, json={"username": "new_name"})
    assert anonymous.status_code in (401, 403)
    invalid = await async_client.patch(url, headers=auth_headers, json={"username": "a/b"})
    assert invalid.status_code == 422
    conflict = await async_client.patch(url, headers=auth_headers, json={"username": other["username"]})
    assert conflict.status_code == 409
    result = await async_client.patch(url, headers=auth_headers, json={"username": "новый_ник"})
    assert result.status_code == 200
    assert result.json() == {**before, "username": "новый_ник"}
    assert (await async_client.get(url, headers=auth_headers)).json() == result.json()


async def test_change_password_replaces_token_and_clears_outstanding_reset(
    async_client, auth_headers, db_session,
):
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import select
    from models import User

    before = (await async_client.get("/api/auth/me", headers=auth_headers)).json()
    user = await db_session.scalar(select(User).where(User.email == before["email"]))
    original_version = user.password_version
    user.reset_token = "256c3aa2-637e-473e-81ad-2e773d5082df"
    user.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    await db_session.commit()
    url = "/api/auth/change-password"
    body = {"current_password": "Test1234!A", "new_password": "Updated!209"}
    wrong = await async_client.post(url, headers=auth_headers, json={**body, "current_password": "Wrong!099"})
    assert wrong.status_code == 400
    weak = await async_client.post(url, headers=auth_headers, json={**body, "new_password": "lowercase"})
    assert weak.status_code == 422
    assert "lowercase" not in weak.text and "Test1234!A" not in weak.text
    assert (await async_client.get("/api/auth/me", headers=auth_headers)).status_code == 200

    changed = await async_client.post(url, headers=auth_headers, json=body)
    assert changed.status_code == 200
    response = changed.json()
    assert response["token_type"] == "bearer" and response["user"] == before
    await db_session.refresh(user)
    assert user.password_version == original_version + 1
    assert user.reset_token is None and user.reset_token_expires_at is None
    assert (await async_client.get("/api/auth/me", headers=auth_headers)).status_code == 401
    fresh = {"Authorization": f"Bearer {response['access_token']}"}
    assert (await async_client.get("/api/auth/me", headers=fresh)).json() == before
    for password, code in [("Test1234!A", 401), ("Updated!209", 200)]:
        login = await async_client.post("/api/auth/login", json={"email": before["email"], "password": password})
        assert login.status_code == code


async def test_only_one_concurrent_password_change_can_commit(async_client, auth_headers):
    import asyncio

    route = "/api/auth/change-password"
    responses = await asyncio.gather(
        *(async_client.post(route, headers=auth_headers, json={
            "current_password": "Test1234!A", "new_password": password,
        }) for password in ("Updated!210", "Updated!211"))
    )
    assert [result.status_code for result in responses].count(200) == 1
    committed = next(result.json() for result in responses if result.status_code == 200)
    assert (await async_client.get("/api/auth/me", headers={
        "Authorization": f"Bearer {committed['access_token']}",
    })).status_code == 200

async def test_changed_password_uses_all_bytes_and_accepts_a_legacy_hash(
    async_client, auth_headers, db_session,
):
    from passlib.hash import bcrypt
    from sqlalchemy import select
    from models import User

    user = await db_session.scalar(select(User).where(User.username == "alice"))
    user.hashed_password = bcrypt.hash("Test1234!A")
    await db_session.commit()

    prefix = "Aa!" + "a" * 69
    changed = await async_client.post("/api/auth/change-password", headers=auth_headers, json={
        "current_password": "Test1234!A", "new_password": prefix + "NewTail",
    })
    assert changed.status_code == 200
    for suffix, code in (("OldTail", 401), ("NewTail", 200)):
        login = await async_client.post("/api/auth/login", json={"email": user.email, "password": prefix + suffix})
        assert login.status_code == code
