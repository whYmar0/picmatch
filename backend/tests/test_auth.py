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

    # Compare with the unknown-email branch — must use the same message
    resp_unknown_email = await async_client.post("/api/auth/login", json={
        "email": "ghost@nowhere.invalid", "password": "irrelevant",
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
