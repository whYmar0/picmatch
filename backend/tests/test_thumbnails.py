import io
import pytest
from httpx import AsyncClient, ASGITransport
from PIL import Image

from main import app, UPLOAD_DIR, THUMB_DIR


@pytest.mark.asyncio
async def test_legacy_thumbnail_route_cannot_serve_an_orphan_source_or_cache():
    # Create a dummy image in UPLOAD_DIR
    test_filename = "test_thumb_source.jpg"
    img = Image.new("RGB", (1200, 800), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    with open(UPLOAD_DIR / test_filename, "wb") as f:
        f.write(buf.getvalue())

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        thumb_file = THUMB_DIR / f"thumb_{test_filename}.webp"
        Image.new("RGB", (48, 48), "blue").save(thumb_file, "WEBP")
        response = await client.get(f"/api/thumbnail/{test_filename}")
        assert response.status_code == 404
        response_cached = await client.get(f"/api/thumbnail/{test_filename}")
        assert response_cached.status_code == 404
        assert (await client.get(f"/uploads/{test_filename}")).status_code == 404

    # Cleanup test files
    if (UPLOAD_DIR / test_filename).exists():
        (UPLOAD_DIR / test_filename).unlink()
    if thumb_file.exists():
        thumb_file.unlink()
