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

async def test_shared_public_list_counts_distinct_voters_for_live_links(
    async_client, auth_headers, second_user_headers, db_session,
):
    owner = (await async_client.get('/api/auth/me', headers=auth_headers)).json()['id']
    public = Album(title='Public', creator_id=owner, invite_code='shared-count', is_public=True)
    empty = Album(title='Empty', creator_id=owner, invite_code='empty-shared-count', is_public=True)
    db_session.add_all([public, empty])
    await db_session.flush()
    photos = [Photo(album_id=str(public.id), filename=f'p-{i}.jpg', stored_filename=f'p-{i}.jpg') for i in range(2)]
    db_session.add_all(photos)
    await db_session.flush()
    db_session.add_all(Vote(photo_id=str(photo.id), voter_id=owner, is_like=True) for photo in photos)
    await db_session.commit()

    for album in (public, empty):
        opened = await async_client.get(f'/api/albums/invite/{album.invite_code}', headers=second_user_headers)
        assert opened.status_code == 200

    async def shared_list():
        response = await async_client.get('/api/shared/with-me', headers=second_user_headers)
        assert response.status_code == 200
        return {row['id']: row for row in response.json()}

    rows = await shared_list()
    assert rows[str(public.id)]['unique_voters'] == 1
    assert rows[str(empty.id)]['unique_voters'] == 0
    private = await async_client.patch(f'/api/albums/{public.id}/privacy', headers=auth_headers,
                                      data={'is_public': 'false'})
    assert private.status_code == 200
    assert (await shared_list())[str(public.id)]['unique_voters'] is None
    rotated = await async_client.post(f'/api/albums/{empty.id}/invitation/rotate', headers=auth_headers)
    assert rotated.status_code == 200
    assert str(empty.id) not in await shared_list()
