"""Inspect editing schema or apply it explicitly to the configured database."""
import argparse
import asyncio
import json

from sqlalchemy import MetaData, inspect, text

from models import Album, AlbumUploadDraft, RemovedAlbumMedia, User


def _columns(connection, table):
    return {column["name"] for column in inspect(connection).get_columns(table)}


def _upgrade(connection):
    if "edit_version" not in _columns(connection, "albums"):
        connection.execute(text("ALTER TABLE albums ADD COLUMN edit_version INTEGER DEFAULT 0 NOT NULL"))

    draft = AlbumUploadDraft.__table__
    columns = _columns(connection, draft.name)
    if "edit_intent" not in columns:
        connection.execute(text("ALTER TABLE album_upload_drafts ADD COLUMN edit_intent JSON"))
    constraints = inspect(connection).get_check_constraints(draft.name)
    size = next((check["sqltext"] for check in constraints if check["name"] == "ck_draft_total_size"), "")
    if ">= 0" not in size:
        if connection.dialect.name == "postgresql":
            connection.execute(text("ALTER TABLE album_upload_drafts DROP CONSTRAINT IF EXISTS ck_draft_total_size"))
            connection.execute(text(
                "ALTER TABLE album_upload_drafts ADD CONSTRAINT ck_draft_total_size "
                "CHECK (total_size >= 0 AND total_size <= 10000000000)"
            ))
        else:
            metadata = MetaData()
            User.__table__.to_metadata(metadata)
            replacement = draft.to_metadata(metadata, name="album_upload_drafts_edit_migration")
            # The old index names are still in use until its table is dropped.
            replacement.indexes.clear()
            replacement.create(connection)
            names = ", ".join(draft.columns.keys())
            connection.execute(text(f"INSERT INTO {replacement.name} ({names}) SELECT {names} FROM {draft.name}"))
            connection.execute(text(f"DROP TABLE {draft.name}"))
            connection.execute(text(f"ALTER TABLE {replacement.name} RENAME TO {draft.name}"))
            for index in draft.indexes:
                index.create(connection)
            if inspect(connection).has_table("album_upload_items"):
                if connection.execute(text("PRAGMA foreign_key_check(album_upload_items)")).first():
                    raise RuntimeError("Album draft references failed migration check")
    RemovedAlbumMedia.__table__.create(connection, checkfirst=True)


async def migrate_schema(engine):
    async with engine.connect() as connection:
        if connection.dialect.name != "sqlite":
            async with connection.begin():
                await connection.run_sync(_upgrade)
            return

        foreign_keys = await connection.scalar(text("PRAGMA foreign_keys"))
        await connection.execute(text("PRAGMA foreign_keys=OFF"))
        await connection.commit()
        try:
            await connection.execute(text("BEGIN IMMEDIATE"))
            await connection.run_sync(_upgrade)
            await connection.commit()
        except BaseException:
            await connection.rollback()
            raise
        finally:
            if foreign_keys:
                await connection.execute(text("PRAGMA foreign_keys=ON"))
                await connection.commit()


def _inventory(connection):
    inspector = inspect(connection)
    return {
        table.name: sorted(_columns(connection, table.name)) if inspector.has_table(table.name) else []
        for table in (Album.__table__, AlbumUploadDraft.__table__, RemovedAlbumMedia.__table__)
    }


async def main(apply):
    from database import engine

    try:
        if apply:
            await migrate_schema(engine)
        async with engine.connect() as connection:
            print(json.dumps(await connection.run_sync(_inventory)))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply-schema", action="store_true")
    asyncio.run(main(parser.parse_args().apply_schema))
