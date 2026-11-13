"""Inventory draft schema by default; --apply-schema only creates new tables/indexes."""
import argparse
import asyncio
import json

from sqlalchemy import inspect, text

TABLES = ("album_upload_drafts", "album_upload_items")


async def inventory(engine):
    result = {}
    async with engine.connect() as connection:
        for name in TABLES:
            exists = await connection.run_sync(lambda sync: inspect(sync).has_table(name))
            result[name] = {"exists": exists}
            if exists:
                result[name]["rows"] = await connection.scalar(text(f"SELECT COUNT(*) FROM {name}"))
    return result


async def migrate_schema(engine):
    from database import Base
    import models  # Register the two tables and referenced user metadata.
    async with engine.begin() as connection:
        await connection.run_sync(lambda sync: Base.metadata.create_all(sync, tables=[Base.metadata.tables[name] for name in TABLES]))


async def main(apply_schema):
    from database import engine
    try:
        if apply_schema:
            await migrate_schema(engine)
        print(json.dumps(await inventory(engine)))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply-schema", action="store_true")
    asyncio.run(main(parser.parse_args().apply_schema))
