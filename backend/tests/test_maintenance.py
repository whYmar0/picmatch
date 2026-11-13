import asyncio
from unittest.mock import AsyncMock

import pytest


@pytest.mark.asyncio
async def test_maintenance_blocks_routes_before_database_and_preserves_health(async_client, app, monkeypatch):
    from database import get_db

    async def unexpected_database():
        raise AssertionError("Maintenance must not open the database")
        yield

    previous = app.dependency_overrides[get_db]
    app.dependency_overrides[get_db] = unexpected_database
    monkeypatch.setenv("MEDIA_MAINTENANCE", "true")
    try:
        for method, path in (("GET", "/api/albums/"), ("POST", "/api/albums/upload-media"),
                             ("GET", "/api/media/11111111-1111-4111-8111-111111111111"),
                             ("POST", "/api/auth/login"), ("GET", "/uploads/anything.jpg")):
            reply = await async_client.request(method, path)
            assert reply.status_code == 503
            assert reply.headers["retry-after"] == "120"
            assert "no-store" in reply.headers["cache-control"]
            assert reply.headers["x-content-type-options"] == "nosniff"
        health = await async_client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["maintenance"] is True
        monkeypatch.setenv("MEDIA_MAINTENANCE", "false")
        assert "maintenance" not in (await async_client.get("/api/health")).json()
    finally:
        app.dependency_overrides[get_db] = previous


@pytest.mark.asyncio
async def test_maintenance_lifespan_does_not_start_database_cleanup(monkeypatch):
    import main

    cleanup = AsyncMock()
    monkeypatch.setenv("MEDIA_MAINTENANCE", "true")
    monkeypatch.setattr(main, "init_db", AsyncMock())
    monkeypatch.setattr(main, "setup_cloudinary", lambda: None)
    monkeypatch.setattr(main, "_pending_upload_cleanup_loop", cleanup)
    async with main.lifespan(main.app):
        await asyncio.sleep(0)
        cleanup.assert_not_called()
