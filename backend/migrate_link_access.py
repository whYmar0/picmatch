"""Add nullable link-visit generation; never infer grants from old manual rows."""
import asyncio

from sqlalchemy import inspect, text

from database import engine


async def migrate(target_engine=engine):
    async with target_engine.begin() as connection:
        columns = await connection.run_sync(lambda sync: {
            column["name"] for column in inspect(sync).get_columns("shared_accesses")})
        if "link_version" not in columns:
            await connection.execute(text("ALTER TABLE shared_accesses ADD COLUMN link_version VARCHAR(64)"))


if __name__ == "__main__":
    asyncio.run(migrate())
