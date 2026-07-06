"""migrate_password_version.py — Adds users.password_version column.

Mirrors the one-off ALTER TABLE pattern used by migrate_auth.py and
migrate_share_link.py: safe to re-run (errors from a column that already
exists are swallowed).

Background:
    H2 of the JWT/access-control audit requires a `password_version` counter
    embedded in each JWT as `pwd_version`. Whenever a user resets their
    password, this counter is incremented; tokens issued before that point
    are rejected by auth.get_current_user. Adding the column is forward-only.

Run with:
    cd backend && python migrate_password_version.py

Rollback (if needed):
    ALTER TABLE users DROP COLUMN password_version
"""
import asyncio
from sqlalchemy import text

from database import engine


async def migrate():
    async with engine.begin() as conn:
        try:
            print("Adding users.password_version...")
            await conn.execute(
                text(
                    "ALTER TABLE users "
                    "ADD COLUMN password_version INTEGER NOT NULL DEFAULT 0"
                )
            )
        except Exception as exc:
            print(f"Skipped password_version: {exc}")

    print("Migration complete!")


if __name__ == "__main__":
    asyncio.run(migrate())
