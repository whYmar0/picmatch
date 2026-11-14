"""Link-only sharing regression checks; no external database or provider calls."""
import pytest
from sqlalchemy import select

from models import Album, SharedAccess


@pytest.mark.parametrize("operation", ["grant", "list", "revoke"])
async def test_personal_sharing_endpoints_are_retired(
    operation, async_client, auth_headers, second_user_headers, db_session
):
    owner = (await async_client.get("/api/auth/me", headers=auth_headers)).json()
    recipient = (await async_client.get("/api/auth/me", headers=second_user_headers)).json()
    album = Album(title="Link-controlled", invite_code="link-only-fixture",
                  creator_id=owner["id"], is_public=False)
    db_session.add(album)
    await db_session.flush()
    access = SharedAccess(user_id=recipient["id"], album_id=str(album.id), can_view_stats=True)
    db_session.add(access)
    await db_session.commit()
    access_id = str(access.id)
    prefix = f"/api/shared/albums/{album.id}"
    if operation == "grant":
        response = await async_client.post(prefix + "/share", headers=auth_headers,
                                           json={"username_or_email": recipient["username"],
                                                 "can_view_stats": False})
    elif operation == "list":
        response = await async_client.get(prefix + "/shares", headers=auth_headers)
    else:
        response = await async_client.delete(prefix + f"/shares/{access_id}", headers=auth_headers)
    assert response.status_code == 404, response.text
    # Retiring endpoints must not silently delete or modify old stored data.
    assert await db_session.scalar(select(SharedAccess.can_view_stats).where(SharedAccess.id == access_id)) is True
