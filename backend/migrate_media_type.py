"""
migrate_media_type.py — Adds photos.media_type column.

Mirrors the one-off ALTER TABLE pattern used by migrate_auth.py and
migrate_share_link.py: safe to re-run (errors from a column that already
exists are swallowed).

Run with:
    cd backend && python migrate_media_type.py

Rollback (if needed):
    ALTER TABLE photos DROP COLUMN media_type
"""
import os
import sqlite3


def migrate():
    # Use the same file as the running application. Resolve relative to the
    # backend directory so the script is path-agnostic.
    db_path = os.path.join(os.path.dirname(__file__), "picmatch.db")
    print(f"Using database: {db_path}")

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        try:
            print("Adding photos.media_type...")
            cur.execute(
                "ALTER TABLE photos ADD COLUMN media_type VARCHAR(10) NOT NULL DEFAULT 'image'"
            )
            conn.commit()
            print("Column added.")
        except sqlite3.OperationalError as exc:
            if "duplicate column" in str(exc).lower():
                print("Column already exists.")
            else:
                raise
    finally:
        conn.close()

    print("Migration complete!")


if __name__ == "__main__":
    migrate()
