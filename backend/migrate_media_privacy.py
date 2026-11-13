"""Read-only inventory by default; --apply-schema adds columns, never changes assets."""
import argparse
import asyncio
import json

from sqlalchemy import inspect, text

TABLES = ("photos", "pending_uploads")


async def migrate_schema(engine):
    async with engine.begin() as connection:
        for table in TABLES:
            exists = await connection.run_sync(lambda sync: inspect(sync).has_table(table))
            if not exists:
                continue
            columns = await connection.run_sync(lambda sync: inspect(sync).get_columns(table))
            if "cloudinary_delivery_type" not in {column["name"] for column in columns}:
                await connection.execute(text(f"ALTER TABLE {table} ADD COLUMN cloudinary_delivery_type VARCHAR(16) NOT NULL DEFAULT 'upload'"))


async def inventory(engine):
    report = {}
    async with engine.connect() as connection:
        for table in TABLES:
            if not await connection.run_sync(lambda sync: inspect(sync).has_table(table)):
                report[table] = {"table_missing": True}
                continue
            columns = await connection.run_sync(lambda sync: inspect(sync).get_columns(table))
            if "cloudinary_delivery_type" in {column["name"] for column in columns}:
                rows = await connection.execute(text(f"SELECT cloudinary_delivery_type, COUNT(*) FROM {table} GROUP BY cloudinary_delivery_type"))
                report[table] = dict(rows.all())
            else:
                report[table] = {"legacy_schema": await connection.scalar(text(f"SELECT COUNT(*) FROM {table}"))}
    return report


async def main(apply_schema):
    from database import engine
    try:
        if apply_schema:
            await migrate_schema(engine)
        print(json.dumps(await inventory(engine), ensure_ascii=False))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply-schema", action="store_true", help="Add columns only, after backup and approval")
    asyncio.run(main(parser.parse_args().apply_schema))
