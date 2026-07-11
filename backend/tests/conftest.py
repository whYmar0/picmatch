"""
tests/conftest.py — Shared pytest fixtures for the PicMatch backend.

CRITICAL ordering note: `os.environ` mutations MUST happen BEFORE any
project import. The `database.py` module reads `DATABASE_URL` at import
time to create the async engine — setting the env var after the import
silently keeps the prod (file-based) engine and corrupts every test.
"""

# ─── 1. Test environment shims (must be FIRST) ───────────────────────────────
import os
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-not-for-prod-use-only-32bytes-long"
os.environ.setdefault("CLOUDINARY_CLOUD_NAME", "")          # force local-fs mode
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")
os.environ.setdefault("DEBUG", "false")

import asyncio
import pytest
import pytest_asyncio
from typing import AsyncGenerator
from httpx import AsyncClient

# ─── 2. Project imports (after env shims) ───────────────────────────────────
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.pool import StaticPool

from database import Base, get_db          # noqa: E402
import email_utils                          # noqa: E402

# Stub email side-effects so register / forgot-password don't reach Resend
email_utils.send_verification_email = lambda *_a, **_kw: None
email_utils.send_password_reset_email = lambda *_a, **_kw: None


# ─── 3. Single in-memory SQLite shared across all sessions in a test ────────
#
# `StaticPool` keeps one physical connection alive for the whole process,
# so all sessions see the same `:memory:` schema. Without this, each new
# `AsyncSession` would get a fresh empty DB and the tables created in
# one session would be invisible to the next.
_TEST_ENGINE = create_async_engine(
    os.environ["DATABASE_URL"],
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSession(_TEST_ENGINE, expire_on_commit=False) as session:
        try:
            yield session
        finally:
            await session.close()


@pytest_asyncio.fixture(scope="function", autouse=True)
async def _prepare_schema():
    """Drop + recreate tables AND reset rate-limiter state before every test.

    slowapi's Limiter holds its request counters in module-level storage
    that survives across pytest test boundaries, so without this reset a
    test that hits `/api/auth/register` 3 times would 429-block every
    subsequent test in the same process. `limiter.reset()` clears the
    storage entirely — safe for tests because we already drop+recreate
    the schema, so no rate-limit shadow state can leak from one test to
    the next.
    """
    async with _TEST_ENGINE.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    from middleware.rate_limit import limiter as _limiter
    try:
        _limiter.reset()
    except Exception:
        # Reset might not exist on older slowapi; fall back to clearing storage.
        try:
            _limiter._storage.reset()
        except Exception:
            pass
    yield


# ─── 4. FastAPI app + AsyncClient ────────────────────────────────────────────
#
# We import `app` lazily so the env-shim block above has already mutated
# `os.environ` (uvicorn-style startup would call init_db() against the
# real Postgres URL otherwise).
@pytest_asyncio.fixture
async def app():
    from main import app as _app
    _app.dependency_overrides[get_db] = _override_get_db
    return _app


@pytest_asyncio.fixture
async def async_client(app) -> AsyncGenerator[AsyncClient, None]:
    from httpx import ASGITransport
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client


# ─── 5. Auth helpers ─────────────────────────────────────────────────────────
from auth import create_access_token, hash_password        # noqa: E402
from models import User, UserRole                           # noqa: E402


async def _create_user(
    db: AsyncSession,
    *,
    email: str,
    username: str,
    password: str = "Test1234!A",
    is_verified: bool = True,
    is_active: bool = True,
) -> User:
    user = User(
        email=email,
        username=username,
        hashed_password=hash_password(password),
        role=UserRole.CREATOR,
        is_verified=is_verified,
        is_active=is_active,
        avatar_color="blue",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def make_user(async_client):
    """Factory: returns a coroutine that creates a user via the API path."""
    async def _factory(email: str, username: str, **kwargs):
        # Register via API so we hit the real handlers (rate-limit / verify /
        # response-shape) — exercises the same code path the frontend does.
        # Then we directly mark verified=True and bump password_version via DB
        # so /auth/login works without a real email roundtrip.
        resp = await async_client.post("/api/auth/register", json={
            "email": email, "username": username,
            "password": kwargs.get("password", "Test1234!A"),
            "role": "creator",
        })
        assert resp.status_code in (201, 400), resp.text
        # Hack: poke the DB to flip is_verified so login works without email.
        async for session in _override_get_db():
            from sqlalchemy import select
            res = await session.execute(select(User).where(User.email == email))
            u = res.scalar_one()
            u.is_verified = True
            await session.commit()
            break
        return {"email": email, "username": username, "password": "Test1234!A"}
    return _factory


@pytest_asyncio.fixture
async def auth_headers(async_client, make_user):
    """Builds a registered+verified user and returns a JWT Authorization header.

    NB: `async_client` MUST be a parameter of this fixture. Without it,
    pytest won't fetch the resolved AsyncClient — it falls back to the
    bare `async_client` name from the conftest module namespace, which
    resolves to the FixtureFunctionDefinition itself (not the yielded
    value), causing `AttributeError: 'FixtureFunctionDefinition' object
    has no attribute 'post'` on every dependent test.
    """
    creds = await make_user("alice@x.com", "alice")
    resp = await async_client.post("/api/auth/login", json={
        "email": creds["email"], "password": creds["password"],
    })
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def second_user_headers(async_client, make_user):
    """Separate registered+verified user — for cross-user ownership tests."""
    creds = await make_user("bob@x.com", "bob")
    resp = await async_client.post("/api/auth/login", json={
        "email": creds["email"], "password": creds["password"],
    })
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
