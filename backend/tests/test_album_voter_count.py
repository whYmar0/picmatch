"""Owner-list people counts are additive and do not disclose private statistics."""
import pytest

from models import Album, Photo, Vote

pytestmark = pytest.mark.asyncio


async def test_owner_list_counts_people_not_photo_votes(async_client, auth_headers, second_user_headers, db_session):
    owner = (await async_client.get('/api/auth/me', headers=auth_headers)).json()['id']
    visitor = (await async_client.get('/api/auth/me', headers=second_user_headers)).json()['id']
    album = Album(title='People', creator_id=owner, invite_code='people-count', is_public=False)
    empty = Album(title='Empty', creator_id=owner, invite_code='empty-count', is_public=True)
    db_session.add_all([album, empty])
    await db_session.flush()
    photos = [Photo(album_id=str(album.id), filename=f'{i}.jpg', stored_filename=f'{i}.jpg', order=i) for i in range(3)]
    db_session.add_all(photos)
    await db_session.flush()
    for photo in photos:
        db_session.add(Vote(photo_id=str(photo.id), voter_id=owner, is_like=True))
    db_session.add(Vote(photo_id=str(photos[0].id), voter_id=visitor, is_like=False))
    await db_session.commit()

    async def own_list():
        response = await async_client.get('/api/albums/my', headers=auth_headers)
        assert response.status_code == 200
        return {a['id']: a for a in response.json()}

    rows = await own_list()
    assert rows[str(album.id)]['total_votes'] == 4
    assert rows[str(album.id)]['unique_voters'] == 2
    assert rows[str(empty.id)]['unique_voters'] == 0
    assert (await async_client.get('/api/albums/my', headers=second_user_headers)).json() == []

    changed = await async_client.post('/api/votes/', headers=auth_headers,
                                     json={'photo_id': str(photos[0].id), 'is_like': False})
    assert changed.status_code in (200, 201)
    assert (await own_list())[str(album.id)]['unique_voters'] == 2

    invite = await async_client.get('/api/albums/invite/people-count', headers=second_user_headers)
    assert invite.status_code == 200
    assert invite.json().get('unique_voters') is None
    shared = await async_client.get('/api/shared/with-me', headers=second_user_headers)
    assert shared.status_code == 200
    assert shared.json()[0].get('unique_voters') is None
