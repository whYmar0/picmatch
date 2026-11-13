"""Tests for the immediate per-file album upload flow."""

import pytest


@pytest.mark.asyncio
async def test_video_upload_then_metadata_album_creation(async_client, auth_headers):
    upload = await async_client.post(
        "/api/albums/upload-media",
        files={"file": ("clip.mp4", b"not-a-real-video", "video/mp4")},
        headers=auth_headers,
    )
    assert upload.status_code == 200, upload.text
    upload_data = upload.json()
    assert upload_data["media_type"] == "video"
    assert upload_data["upload_token"]

    created = await async_client.post(
        "/api/albums/",
        data={
            "title": "Video album",
            "description": "Uploaded one file at a time",
            "is_public": "true",
            "uploaded_media": f'["{upload_data["upload_token"]}"]',
        },
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    album = created.json()
    assert album["photo_count"] == 1
    assert album["photos"][0]["media_type"] == "video"
    assert f"/api/media/{album['photos'][0]['id']}?" in album["photos"][0]["url"]
    assert "media_type=video" in album["photos"][0]["url"]
    assert (await async_client.get(album["photos"][0]["url"])).content == b"not-a-real-video"

    reused = await async_client.post(
        "/api/albums/",
        data={
            "title": "Duplicate video album",
            "is_public": "true",
            "uploaded_media": f'["{upload_data["upload_token"]}"]',
        },
        headers=auth_headers,
    )
    assert reused.status_code == 409, reused.text
