"""Disposable loopback-only PostgreSQL migration/locking proof, no provider calls."""
import asyncio
import hashlib
import json
import os
import uuid

URL = "postgresql+asyncpg://link_test@127.0.0.1:55435/postgres"
os.environ["DATABASE_URL"] = URL
os.environ["SECRET_KEY"] = "isolated-link-access-test-secret-with-over-32-characters"
os.environ["CLOUDINARY_CLOUD_NAME"] = ""
os.environ["CLOUDINARY_API_KEY"] = ""
os.environ["CLOUDINARY_API_SECRET"] = ""

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from album_access import has_album_access, remember_link_visit
from database import Base, engine as unused_engine
from media_access import issue_media_ticket, media_ticket_user
from migrate_link_access import migrate
from models import Album, Photo, SharedAccess, User, UserRole
from routers.invitations import rotate_links


async def main():
    schema = "proof_" + uuid.uuid4().hex
    admin = create_async_engine(URL)
    async with admin.begin() as connection:
        await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_async_engine(URL, connect_args={"server_settings": {"search_path": schema}})
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with AsyncSession(engine, expire_on_commit=False) as db:
            owner = User(email="owner@example.com", username="owner", hashed_password="fixture", role=UserRole.CREATOR,
                         is_active=True, is_verified=True)
            visitor = User(email="visitor@example.com", username="visitor", hashed_password="fixture", role=UserRole.CREATOR,
                           is_active=True, is_verified=True)
            db.add_all([owner, visitor]); await db.flush()
            album = Album(title="Preserve me", creator_id=str(owner.id), invite_code="old-code", is_public=False)
            db.add(album); await db.flush()
            photo = Photo(album_id=str(album.id), filename="fixture.jpg", stored_filename="fixture.jpg", order=0)
            db.add(photo)
            db.add(SharedAccess(album_id=str(album.id), user_id=str(visitor.id), can_view_stats=True))
            await db.commit()
            album_id, visitor_id, photo_id = str(album.id), str(visitor.id), str(photo.id)
        async def fingerprint(connection):
            records = []
            for query in ["SELECT id,email,username FROM users ORDER BY id", "SELECT id,title,invite_code FROM albums ORDER BY id",
                          "SELECT id,filename,album_id FROM photos ORDER BY id", "SELECT id,user_id,album_id,can_view_stats FROM shared_accesses ORDER BY id"]:
                records.append([tuple(map(str, row)) for row in (await connection.execute(text(query))).all()])
            return hashlib.sha256(json.dumps(records, sort_keys=True).encode()).hexdigest()
        async with engine.begin() as connection:
            before = await fingerprint(connection)
            await connection.execute(text("ALTER TABLE shared_accesses DROP COLUMN link_version"))
        await migrate(engine); await migrate(engine)
        async with engine.connect() as connection:
            assert before == await fingerprint(connection)
            assert (await connection.execute(text("SELECT link_version FROM shared_accesses"))).scalar_one() is None
        async def visit(code):
            async with AsyncSession(engine, expire_on_commit=False) as db:
                row = await db.scalar(select(Album).where(Album.id == album_id, Album.invite_code == code,
                                                          Album.is_active == True).with_for_update())
                if row is None:
                    return False
                user = await db.get(User, visitor_id)
                await remember_link_visit(row, user, db)
                return True
        async with AsyncSession(engine, expire_on_commit=False) as owner_db:
            locked = await owner_db.scalar(select(Album).where(Album.id == album_id).with_for_update())
            stale_visit = asyncio.create_task(visit(locked.invite_code))
            await asyncio.sleep(0.15)
            assert not stale_visit.done(), "Visitor must wait for the same album lock"
            rotate_links(locked); await owner_db.commit()
            assert await stale_visit is False
            current_code = locked.invite_code
        assert await visit(current_code)
        async with AsyncSession(engine, expire_on_commit=False) as db:
            row, user = await db.get(Album, album_id), await db.get(User, visitor_id)
            assert await has_album_access(row, user, db)
            ticket, _ = issue_media_ticket(user, photo_id, "display", album=row)
            rotate_links(row); await db.commit()
            newer_code = row.invite_code
        assert await visit(newer_code)
        async with AsyncSession(engine, expire_on_commit=False) as db:
            row = await db.get(Album, album_id)
            try:
                await media_ticket_user(ticket, photo_id, "display", db, album=row)
                raise AssertionError("Old ticket revived after new-link visit")
            except HTTPException as error:
                assert error.status_code == 404
        print(json.dumps({"schema": schema, "migration": "twice, content preserved", "fingerprint": before,
                          "concurrent_stale_visit": "blocked then rejected", "old_ticket_after_new_visit": "rejected"}, indent=2))
    finally:
        await engine.dispose(); await admin.dispose(); await unused_engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
