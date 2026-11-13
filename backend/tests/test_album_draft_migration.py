from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine


async def test_draft_schema_additive_inventory_apply_and_replay(tmp_path):
    from migrate_album_drafts import inventory, migrate_schema
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'migration.sqlite'}")
    try:
        async with engine.begin() as connection:
            await connection.execute(text("CREATE TABLE users (id VARCHAR(36) PRIMARY KEY)"))
            await connection.execute(text("CREATE TABLE photos (id VARCHAR(36) PRIMARY KEY, filename TEXT)"))
            await connection.execute(text("INSERT INTO photos VALUES ('existing', 'keep.jpg')"))
        assert (await inventory(engine))["album_upload_drafts"]["exists"] is False
        async with engine.connect() as connection:
            assert not await connection.run_sync(lambda sync: inspect(sync).has_table("album_upload_items"))
        await migrate_schema(engine)
        await migrate_schema(engine)
        result = await inventory(engine)
        assert all(table["exists"] and table["rows"] == 0 for table in result.values())
        async with engine.connect() as connection:
            assert await connection.scalar(text("SELECT filename FROM photos WHERE id='existing'")) == "keep.jpg"
            indexes = await connection.run_sync(lambda sync: inspect(sync).get_indexes("album_upload_drafts"))
            assert any(index["name"] == "uq_album_upload_active_owner" and index["unique"] for index in indexes)
    finally:
        await engine.dispose()
