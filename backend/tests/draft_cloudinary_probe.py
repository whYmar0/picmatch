"""Explicit real-provider acceptance using a local DB and positively owned synthetic assets."""
import asyncio
import hashlib
import io
import json
import os
from pathlib import Path
import secrets
import sys
import urllib.error
import urllib.request
import uuid

from dotenv import dotenv_values
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PROOF = ROOT / ".local-proof/cloudinary"
PROOF.mkdir(parents=True, exist_ok=True)
values = dotenv_values(sys.argv[1])
for key in ("CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"):
    os.environ[key] = values[key]
database_file = PROOF / (str(uuid.uuid4()) + ".sqlite3")
assert database_file.resolve().is_relative_to(PROOF.resolve())
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///" + str(database_file)
os.environ["SECRET_KEY"] = secrets.token_urlsafe(48)
os.environ["UPLOAD_DIR"] = str(PROOF / "uploads")
os.environ["BASE_URL"] = "http://test"
sys.path.insert(0, str(ROOT / "backend"))

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from database import Base, engine, AsyncSessionLocal
from models import User, AlbumUploadItem
from auth import create_access_token
from main import app
import album_drafts as drafts
import album_draft_storage as storage
from cloudinary_utils import setup_cloudinary

run_id = str(uuid.uuid4())
drafts.CLOUD_DRAFT_PREFIX = "pickmatch-draft-acceptance/" + run_id
mapping = []


async def record(draft_id):
    async with AsyncSessionLocal() as db:
        rows = (await db.scalars(select(AlbumUploadItem).where(AlbumUploadItem.draft_id == draft_id))).all()
        for row in rows:
            item = drafts.storage_item(row)
            assert item.stored_filename.startswith(drafts.CLOUD_DRAFT_PREFIX + "/")
            if not any(old.stored_filename == item.stored_filename for old in mapping): mapping.append(item)
        (PROOF / "manifest.json").write_text(json.dumps([vars(item) for item in mapping], indent=2))


async def main():
    checks = []
    setup_cloudinary()
    try:
        async with engine.begin() as db:
            await db.run_sync(Base.metadata.create_all)
        async with AsyncSessionLocal() as db:
            owner = User(email="synthetic-owner@example.com", username="synthetic-owner", hashed_password="unused", is_verified=True)
            outsider = User(email="synthetic-other@example.com", username="synthetic-other", hashed_password="unused", is_verified=True)
            db.add_all([owner, outsider])
            await db.commit()
            headers = {"Authorization": "Bearer " + create_access_token(owner)}
            other_headers = {"Authorization": "Bearer " + create_access_token(outsider)}
        image = io.BytesIO(); Image.new("RGB", (8, 6), (90, 20, 140)).save(image, "JPEG")
        video = Path(sys.argv[2]).read_bytes()
        sources = [(video, "clip.webm", "video/webm"), (image.getvalue(), "image.jpg", "image/jpeg")]
        items = [{"id": str(uuid.uuid4()), "filename": name, "mime_type": mime,
                  "size": len(data), "sha256": hashlib.sha256(data).hexdigest()} for data, name, mime in sources]
        draft_id = str(uuid.uuid4())
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            result = await client.put(f"/api/album-drafts/{draft_id}", json={"title": "Synthetic provider acceptance", "is_public": False, "items": items}, headers=headers)
            assert result.status_code == 201, result.text
            await record(draft_id)
            original_publish = drafts.publish_item
            fail_receipt = True
            async def lose_receipt(*args):
                nonlocal fail_receipt
                if fail_receipt:
                    fail_receipt = False
                    raise RuntimeError("Synthetic lost DB receipt")
                return await original_publish(*args)
            drafts.publish_item = lose_receipt
            try:
                first = await client.put(f"/api/album-drafts/{draft_id}/items/{items[0]['id']}", content=sources[0][0], headers={**headers, "Content-Type": "video/webm"})
                assert first.status_code == 503
                retry = await client.put(f"/api/album-drafts/{draft_id}/items/{items[0]['id']}", content=b"", headers=headers)
                assert retry.status_code == 200 and retry.json()["status"] == "uploaded"
            finally:
                drafts.publish_item = original_publish
            result = await client.put(f"/api/album-drafts/{draft_id}/items/{items[1]['id']}", content=sources[1][0], headers={**headers, "Content-Type": "image/jpeg"})
            assert result.status_code == 200, result.text
            for item in mapping:
                receipt = await storage.lookup(item)
                assert receipt and receipt["context"]["custom"]["sha256"] == item.sha256
                before = receipt["asset_id"]
                repeat = await client.put(f"/api/album-drafts/{draft_id}/items/{item.item_id}", content=b"", headers=headers)
                assert repeat.status_code == 200 and (await storage.lookup(item))["asset_id"] == before
            checks.append("real private image/video upload, matching context, same-asset replay and lost-receipt recovery")
            created = await client.post(f"/api/album-drafts/{draft_id}/finalize", headers=headers)
            assert created.status_code == 201, created.text
            album = created.json()
            repeat = await client.post(f"/api/album-drafts/{draft_id}/finalize", headers=headers)
            assert repeat.status_code == 200 and repeat.json()["id"] == album["id"]
            assert [item["filename"] for item in album["photos"]] == ["clip.webm", "image.jpg"]
            for photo in album["photos"]:
                denied = await client.get(photo["url"], headers=other_headers)
                assert denied.status_code == 404
                if photo["media_type"] == "video":
                    result = await client.get(photo["url"], headers={**headers, "Range": "bytes=0-15"})
                    assert result.status_code == 206 and result.content == video[:16]
                else:
                    result = await client.get(photo["url"], headers=headers)
                    assert result.status_code == 200
                    Image.open(io.BytesIO(result.content)).load()
            checks.append("idempotent ordered finalize, protected gateway, decoded JPEG and real video byte range")
            import cloudinary.utils
            for item in mapping:
                unsigned = cloudinary.utils.cloudinary_url(item.stored_filename, type="authenticated", resource_type=item.media_type, secure=True, sign_url=False)[0]
                try:
                    await storage.blocking(urllib.request.urlopen, urllib.request.Request(unsigned, method="HEAD"), timeout=20)
                    raise AssertionError("Unsigned private asset was public")
                except urllib.error.HTTPError as error:
                    assert error.code in (401, 403, 404)
            checks.append("unsigned provider URLs denied")

            cancel_id, cancel_item = str(uuid.uuid4()), {**items[1], "id": str(uuid.uuid4())}
            assert (await client.put(f"/api/album-drafts/{cancel_id}", json={"title": "Synthetic cancel", "items": [cancel_item]}, headers=headers)).status_code == 201
            await record(cancel_id)
            assert (await client.put(f"/api/album-drafts/{cancel_id}/items/{cancel_item['id']}", content=sources[1][0], headers={**headers, "Content-Type": "image/jpeg"})).status_code == 200
            cancelled = await client.delete(f"/api/album-drafts/{cancel_id}", headers=headers)
            assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
            assert await storage.lookup(mapping[-1]) is None
            checks.append("strict owned-asset cancellation")
        print(json.dumps({"checks": checks, "passed": True}))
        (PROOF / "result.json").write_text(json.dumps({"checks": checks, "passed": True}, indent=2))
    finally:
        await drafts.drain_workers()
        cleaned = 0
        for item in mapping:
            await storage.delete(item)
            assert await storage.lookup(item) is None
            cleaned += 1
        (PROOF / "cleanup.json").write_text(json.dumps({"owned_assets_absent": cleaned}))
        await engine.dispose()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        print("Synthetic provider acceptance failed:", type(error).__name__)
        raise SystemExit(1)
