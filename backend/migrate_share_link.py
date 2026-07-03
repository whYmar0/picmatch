"""
migrate_share_link.py — Adds Album.share_token column.

Mirrors the one-off ALTER TABLE pattern used by migrate_auth.py:
safe to re-run (errors from a column that already exists are swallowed).

Run with:
    python migrate_share_link.py
"""
import asyncio
from sqlalchemy import text
from database import engine


async def migrate():
    async with engine.begin() as conn:
        try:
            print("Adding albums.share_token...")
            await conn.execute(
                text(
                    "ALTER TABLE albums ADD COLUMN share_token VARCHAR(64)"
                )
            )
        except Exception as e:
            print(f"Skipped share_token: {e}")

        try:
            print("Creating unique index on albums.share_token...")
            await conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_albums_share_token "
                    "ON albums (share_token)"
                )
            )
        except Exception as e:
            print(f"Skipped share_token index: {e}")

    print("Migration complete!")


if __name__ == "__main__":
    asyncio.run(migrate())
