"""
database.py - Database connection configuration

Supports two modes:
  - LOCAL DEV: SQLite
  - PRODUCTION: PostgreSQL via asyncpg
"""

import os
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./pickmatch.db")
IS_SQLITE = DATABASE_URL.startswith("sqlite")

if IS_SQLITE:
    engine = create_async_engine(
        DATABASE_URL,
        echo=os.getenv("DEBUG", "false").lower() == "true",
        connect_args={"check_same_thread": False},
    )
else:
    import ssl as _ssl_module

    def _clean_db_url(url: str) -> tuple[str, bool]:
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        ssl_required = params.pop("sslmode", ["disable"])[0] in ("require", "verify-ca", "verify-full")
        clean_query = urlencode({k: v[0] for k, v in params.items()})
        return urlunparse(parsed._replace(query=clean_query)), ssl_required

    _clean_url, _ssl_from_url = _clean_db_url(DATABASE_URL)
    _env_ssl = os.getenv("DB_SSL", "")
    _use_ssl = _ssl_from_url or _env_ssl.lower() in ("require", "true", "1")
    _pg_connect_args = {}
    if _use_ssl:
        _ssl_ctx = _ssl_module.create_default_context()
        _ssl_ctx.check_hostname = False
        _ssl_ctx.verify_mode = _ssl_module.CERT_NONE
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
    """FastAPI dependency that yields a DB session and closes it after the request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Creates all tables on application startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
