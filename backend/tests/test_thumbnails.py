import io
import pytest
from httpx import AsyncClient, ASGITransport
from PIL import Image

from main import app, UPLOAD_DIR, THUMB_DIR


@pytest.mark.asyncio
async def test_thumbnail_generation_and_caching():
    # Create a dummy image in UPLOAD_DIR
    test_filename = "test_thumb_source.jpg"
    img = Image.new("RGB", (1200, 800), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    with open(UPLOAD_DIR / test_filename, "wb") as f:
        f.write(buf.getvalue())

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"/api/thumbnail/{test_filename}")
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/webp"

        # Check cached file was created
        thumb_file = THUMB_DIR / f"thumb_{test_filename}.webp"
        assert thumb_file.exists()

        # Check dimensions are thumbnail size (max 480)
        with Image.open(thumb_file) as generated:
            w, h = generated.size
            assert max(w, h) <= 480

        # Second request hits cache
        response_cached = await client.get(f"/api/thumbnail/{test_filename}")
        assert response_cached.status_code == 200

    # Cleanup test files
    if (UPLOAD_DIR / test_filename).exists():
        (UPLOAD_DIR / test_filename).unlink()
    if thumb_file.exists():
        thumb_file.unlink()
