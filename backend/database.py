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
    engine = create_async_engine(
        DATABASE_URL,
        echo=os.getenv("DEBUG", "false").lower() == "true",
        connect_args={"check_same_thread": False, "ssl": False},
    )
else:
    # PostgreSQL with connection pool
    engine = create_async_engine(
        DATABASE_URL,
        echo=os.getenv("DEBUG", "false").lower() == "true",
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
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
