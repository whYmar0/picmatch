"""Explicit disposable-PostgreSQL acceptance; never uses an application/production DSN."""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import secrets
import sys
import uuid

from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[2]
connection = json.loads((ROOT / ".local-proof/postgres/connection.json").read_text())
url = make_url(connection["dsn"])
assert url.host == "127.0.0.1" and url.port == 55433 and url.database == "draft_acceptance"
os.environ["DATABASE_URL"] = connection["dsn"]
os.environ["SECRET_KEY"] = secrets.token_urlsafe(48)
os.environ["CLOUDINARY_CLOUD_NAME"] = ""
os.environ["DB_SSL"] = ""
os.environ["UPLOAD_DIR"] = str(ROOT / ".local-proof/postgres/uploads")
sys.path.insert(0, str(ROOT / "backend"))

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, func
from auth import create_access_token
from database import Base, engine, AsyncSessionLocal, get_db
from models import User, Album, Photo, AlbumUploadDraft, AlbumUploadItem
from main import app
from middleware.rate_limit import limiter
import album_drafts as drafts


async def reset():
    await drafts.drain_workers()
    limiter.reset()
    async with engine.begin() as db:
        await db.run_sync(Base.metadata.drop_all)
        await db.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as db:
        owner = User(email="local-owner@example.com", username="local-owner", hashed_password="unused", is_verified=True)
        db.add(owner)
        await db.commit()
        return {"Authorization": "Bearer " + create_access_token(owner)}


def manifest(data=b"pg bytes"):
    return {"title": "Postgres receipt", "is_public": False,
            "items": [{"id": str(uuid.uuid4()), "filename": "test.jpg", "mime_type": "image/jpeg",
                       "size": len(data), "sha256": hashlib.sha256(data).hexdigest()}]}


async def prepared(client, headers):
    body = manifest()
    draft_id = str(uuid.uuid4())
    result = await client.put(f"/api/album-drafts/{draft_id}", json=body, headers=headers)
    assert result.status_code == 201, result.text
    result = await client.put(f"/api/album-drafts/{draft_id}/items/{body['items'][0]['id']}",
                              content=b"pg bytes", headers={**headers, "Content-Type": "image/jpeg"})
    assert result.status_code == 200, result.text
    return draft_id


async def main():
    checks = []
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://local") as client:
            from migrate_album_drafts import inventory, migrate_schema
            async with engine.begin() as db:
                await db.run_sync(Base.metadata.drop_all)
                await db.run_sync(lambda sync: Base.metadata.create_all(sync, tables=[table for name, table in Base.metadata.tables.items() if name not in ("album_upload_drafts", "album_upload_items")]))
            async with AsyncSessionLocal() as db:
                seed = User(email="migration@example.com", username="migration", hashed_password="unused", is_verified=True)
                db.add(seed)
                await db.commit()
            assert not (await inventory(engine))["album_upload_drafts"]["exists"]
            await migrate_schema(engine)
            await migrate_schema(engine)
            async with AsyncSessionLocal() as db:
                assert await db.scalar(select(func.count()).select_from(User)) == 1
            checks.append("additive PostgreSQL UUID schema migration and replay preserve existing user")

            headers = await reset()
            draft_id, body = str(uuid.uuid4()), manifest()
            gate = asyncio.Event()
            readers = 0
            async def simultaneous_initial_reads():
                nonlocal readers
                async with AsyncSessionLocal() as session:
                    original = session.scalar
                    seen = False
                    async def scalar(query, *args, **kwargs):
                        nonlocal readers, seen
                        result = await original(query, *args, **kwargs)
                        if not seen and getattr(query, "column_descriptions", [{}])[0].get("entity") is AlbumUploadDraft:
                            seen = True
                            readers += 1
                            if readers == 4: gate.set()
                            await asyncio.wait_for(gate.wait(), 5)
                        return result
                    session.scalar = scalar
                    yield session
            app.dependency_overrides[get_db] = simultaneous_initial_reads
            try:
                results = await asyncio.gather(*[client.put(f"/api/album-drafts/{draft_id}", json=body, headers=headers) for _ in range(4)])
            finally:
                app.dependency_overrides.pop(get_db, None)
            assert sorted(result.status_code for result in results) == [200, 200, 200, 201]
            async with AsyncSessionLocal() as db:
                assert await db.scalar(select(func.count()).select_from(AlbumUploadDraft)) == 1
            checks.append("same-id concurrent create and native UUID schema")

            headers = await reset()
            results = await asyncio.gather(*[client.put(f"/api/album-drafts/{uuid.uuid4()}", json=manifest(), headers=headers) for _ in range(4)])
            assert sum(result.status_code == 201 for result in results) == 1
            assert all(result.status_code in (201, 409) for result in results)
            checks.append("single active owner draft under competing UUIDs")

            headers = await reset()
            body = manifest()
            body["items"] = [{**body["items"][0], "id": str(uuid.uuid4()), "size": 50000000} for _ in range(200)]
            result = await client.put(f"/api/album-drafts/{uuid.uuid4()}", json=body, headers=headers)
            assert result.status_code == 201 and result.json()["total_size"] == 10000000000
            checks.append("PostgreSQL BigInteger exact10GB manifest without byte upload")

            headers = await reset()
            draft_id, body = str(uuid.uuid4()), manifest()
            assert (await client.put(f"/api/album-drafts/{draft_id}", json=body, headers=headers)).status_code == 201
            import album_draft_storage as storage
            original_upload = storage.upload
            calls = 0
            async def slow_upload(item, file):
                nonlocal calls
                calls += 1
                await asyncio.sleep(0.1)
                return await original_upload(item, file)
            storage.upload = slow_upload
            try:
                results = await asyncio.gather(*[client.put(f"/api/album-drafts/{draft_id}/items/{body['items'][0]['id']}",
                    content=b"pg bytes", headers={**headers, "Content-Type": "image/jpeg"}) for _ in range(4)])
            finally:
                storage.upload = original_upload
            assert calls == 1 and all(result.status_code in (200, 202) for result in results)
            assert any(result.status_code == 200 for result in results)
            checks.append("competing same-item requests use one provider worker")

            headers = await reset()
            draft_id = await prepared(client, headers)
            results = await asyncio.gather(*[client.post(f"/api/album-drafts/{draft_id}/finalize", headers=headers) for _ in range(4)])
            assert sorted(result.status_code for result in results) == [200, 200, 200, 201]
            assert len({result.json()["id"] for result in results}) == 1
            async with AsyncSessionLocal() as db:
                assert await db.scalar(select(func.count()).select_from(Album)) == 1
            checks.append("concurrent finalize produces exactly one album")

            for _ in range(5):
                headers = await reset()
                draft_id = await prepared(client, headers)
                finalized, cancelled = await asyncio.gather(client.post(f"/api/album-drafts/{draft_id}/finalize", headers=headers),
                                                            client.delete(f"/api/album-drafts/{draft_id}", headers=headers))
                async with AsyncSessionLocal() as db:
                    draft = await db.scalar(select(AlbumUploadDraft).where(AlbumUploadDraft.id == draft_id))
                    count = await db.scalar(select(func.count()).select_from(Album))
                    if draft.status == "completed":
                        assert finalized.status_code == 201 and cancelled.status_code == 409 and count == 1
                        items = list((await db.scalars(select(AlbumUploadItem))).all())
                        import album_draft_storage as storage
                        assert all(storage.local_path(item).exists() for item in items)
                    else:
                        assert finalized.status_code in (409, 410) and cancelled.status_code == 200 and count == 0
            checks.append("five finalize/cancel races preserve winner and media")
        print(json.dumps({"postgres_checks": checks, "passed": True}))
        (ROOT / ".local-proof/postgres-proof.json").write_text(json.dumps({"checks": checks, "passed": True}, indent=2))
    finally:
        await drafts.drain_workers()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
