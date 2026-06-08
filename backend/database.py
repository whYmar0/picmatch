"""
database.py — Конфигурация подключения к базе данных / Database connection configuration

Поддерживает два режима / Supports two modes:
  - LOCAL DEV:  SQLite  (no PostgreSQL needed / PostgreSQL не нужен)
  - PRODUCTION: PostgreSQL via asyncpg

  SQLite (default / по умолчанию):
    DATABASE_URL=sqlite+aiosqlite:///./pickmatch.db

  PostgreSQL (production / продакшн):
    DATABASE_URL=postgresql+asyncpg://user:password@host:5432/pickmatch
"""

import os
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

# Default -> SQLite for local dev (zero setup)
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite+aiosqlite:///./pickmatch.db"
)

IS_SQLITE = DATABASE_URL.startswith("sqlite")

if IS_SQLITE:
    # SQLite: check_same_thread=False needed for async use
    # NOTE: SQLite does not support SSL — do not pass ssl here
    engine = create_async_engine(
        DATABASE_URL,
        echo=os.getenv("DEBUG", "false").lower() == "true",
        connect_args={"check_same_thread": False},
    )
else:
    # PostgreSQL with connection pool
    # ──────────────────────────────────────────────────────────────────────────
    # IMPORTANT for Supabase + asyncpg:
    #   • Use the SESSION POOLER URL (port 5432, host: aws-0-*.pooler.supabase.com)
    #     NOT the Direct Connection URL (db.xxx.supabase.co) — that only works
    #     inside Supabase's own infrastructure.
    #   • asyncpg does NOT support ?sslmode=require in the URL query string.
    #     We strip it and pass ssl via connect_args instead.
    # ──────────────────────────────────────────────────────────────────────────
    import ssl as _ssl_module
    from urllib.parse import urlparse, urlencode, parse_qs, urlunparse

    def _clean_db_url(url: str) -> tuple[str, bool]:
        """Remove ?sslmode from URL (asyncpg ignores it / errors on it).
        Returns (clean_url, ssl_required)."""
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        ssl_required = params.pop("sslmode", ["disable"])[0] in ("require", "verify-ca", "verify-full")
        clean_query = urlencode({k: v[0] for k, v in params.items()})
        clean = parsed._replace(query=clean_query)
        return urlunparse(clean), ssl_required

    _clean_url, _ssl_from_url = _clean_db_url(DATABASE_URL)
    # Also allow override via env var DB_SSL=require|disable
    _env_ssl = os.getenv("DB_SSL", "")
    _use_ssl = _ssl_from_url or _env_ssl.lower() in ("require", "true", "1")

    # Build ssl context for asyncpg if needed
    _pg_connect_args = {}
    if _use_ssl:
        _ssl_ctx = _ssl_module.create_default_context()
        _ssl_ctx.check_hostname = False
        _ssl_ctx.verify_mode = _ssl_module.CERT_NONE   # Supabase pooler uses self-signed intermediate
        _pg_connect_args["ssl"] = _ssl_ctx

    engine = create_async_engine(
        _clean_url,
        echo=os.getenv("DEBUG", "false").lower() == "true",
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
        connect_args=_pg_connect_args,
    )

AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

Base = declarative_base()


async def get_db() -> AsyncSession:
    """FastAPI dependency — yields a DB session and closes it after the request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Creates all tables on application startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
