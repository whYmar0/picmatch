import pytest
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine

from migrate_media_privacy import migrate_schema


@pytest.mark.asyncio
async def test_additive_schema_migration_preserves_legacy_rows_and_is_idempotent():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    try:
        async with engine.begin() as conn:
            for table in ("photos", "pending_uploads"):
                await conn.execute(text(f"CREATE TABLE {table} (id TEXT PRIMARY KEY, stored_filename TEXT)"))
                await conn.execute(text(f"INSERT INTO {table} VALUES ('legacy', 'existing-file')"))
        await migrate_schema(engine)
        await migrate_schema(engine)
        async with engine.connect() as conn:
            for table in ("photos", "pending_uploads"):
                row = (await conn.execute(text(f"SELECT * FROM {table}"))).mappings().one()
                assert row["stored_filename"] == "existing-file" and row["cloudinary_delivery_type"] == "upload"
                columns = await conn.run_sync(lambda sync: inspect(sync).get_columns(table))
                assert sum(column["name"] == "cloudinary_delivery_type" for column in columns) == 1
    finally:
        await engine.dispose()
