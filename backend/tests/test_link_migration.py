import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from migrate_link_access import migrate


async def test_link_migration_is_additive_and_idempotent(tmp_path):
    engine = create_async_engine("sqlite+aiosqlite:///" + str(tmp_path / "old.db"))
    try:
        async with engine.begin() as connection:
            await connection.execute(text("CREATE TABLE shared_accesses (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36))"))
            await connection.execute(text("INSERT INTO shared_accesses (id,user_id) VALUES ('old-row','user')"))
        await migrate(engine)
        await migrate(engine)
        async with engine.connect() as connection:
            assert (await connection.execute(text("SELECT id,user_id,link_version FROM shared_accesses"))).all() == [("old-row", "user", None)]
    finally:
        await engine.dispose()
