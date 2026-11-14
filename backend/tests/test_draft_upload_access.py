import time
import uuid

import jwt
import pytest
from sqlalchemy import select

from tests.test_album_drafts import create
from tests.test_album_draft_storage import draft_files


async def granted(client, headers):
    draft_id, body, response = await create(client, headers)
    assert response.status_code == 201
    result = await client.post(f"/api/album-drafts/{draft_id}/upload-grant", headers=headers)
    assert result.status_code == 200, result.text
    assert result.headers['cache-control'] == 'no-store'
    return draft_id, body, result.json()


async def test_grant_can_only_upload_immutable_draft_items(async_client, auth_headers, second_user_headers, draft_files):
    draft_id, body, result = await granted(async_client, auth_headers)
    grant = result['grant']
    headers = {'X-Pickmatch-Upload-Grant': grant, 'Content-Type': 'image/jpeg'}
    base = f'/api/album-drafts/{draft_id}'
    upload = await async_client.put(f"{base}/items/{body['items'][0]['id']}", headers=headers, content=b'synthetic image')
    assert upload.status_code == 200 and upload.json()['status'] == 'uploaded'
    assert (await async_client.put(f"{base}/items/{body['items'][0]['id']}", headers=headers)).status_code == 200
    assert (await async_client.put(f'{base}/items/{uuid.uuid4()}', headers=headers)).status_code == 404
    assert (await async_client.put(f'/api/album-drafts/{uuid.uuid4()}/items/{uuid.uuid4()}', headers=headers)).status_code == 404
    assert (await async_client.post(base+'/upload-grant', headers=second_user_headers)).status_code == 404
    for bearer in (False, True):
        restricted = {'Authorization': 'Bearer '+grant} if bearer else headers
        for method, path, extra in [('GET','/api/auth/me',{}), ('GET',base,{}),
                ('PUT',base,{'json':body}), ('POST',base+'/upload-grant',{}),
                ('POST',base+'/finalize',{}), ('DELETE',base,{}),
                ('GET',f'/api/media/{uuid.uuid4()}',{})]:
            assert (await async_client.request(method,path,headers=restricted,**extra)).status_code in (401,403,404)
    assert (await async_client.put(f"{base}/items/{body['items'][0]['id']}", headers={**auth_headers, **headers})).status_code == 401
    assert (await async_client.post(base+'/finalize',headers=auth_headers)).status_code == 201
    assert auth_headers['Authorization'][7:] not in str(result)


@pytest.mark.parametrize('change', ['tamper','expired','future','aud','iss','typ','purpose','draft','hash','version','bool','long','none','missing','lifetime','subject'])
async def test_grant_validation(async_client, auth_headers, draft_files, change):
    from auth import SECRET_KEY
    draft_id, body, result = await granted(async_client, auth_headers)
    claims = jwt.decode(result['grant'],SECRET_KEY,algorithms=['HS256'],audience='pickmatch-draft-upload')
    header = {'typ':'pickmatch-draft-upload+jwt'}
    algorithm = 'HS256'
    if change == 'expired': claims['exp'] = int(time.time())-1
    elif change == 'future': claims['iat'] = int(time.time())+60
    elif change == 'aud': claims['aud'] = 'pickmatch-media'
    elif change == 'iss': claims['iss'] = 'other'
    elif change == 'typ': header['typ'] = 'JWT'
    elif change == 'purpose': claims['purpose'] = 'read'
    elif change == 'draft': claims['draft'] = str(uuid.uuid4())
    elif change == 'hash': claims['manifest_hash'] = '0'*64
    elif change == 'version': claims['pwd_version'] += 1
    elif change == 'bool': claims['pwd_version'] = False
    elif change == 'missing': claims.pop('jti')
    elif change == 'lifetime': claims['exp'] = claims['iat']+86401
    elif change == 'subject': claims['sub'] = '../not-uuid'
    elif change == 'none': algorithm = 'none'
    grant = jwt.encode(claims, '' if algorithm == 'none' else SECRET_KEY, algorithm=algorithm, headers=header)
    if change == 'tamper': grant = grant.rsplit('.',1)[0]+'.invalid'
    if change == 'long': grant = 'x'*4097
    response = await async_client.put(f"/api/album-drafts/{draft_id}/items/{body['items'][0]['id']}",
        headers={'X-Pickmatch-Upload-Grant':grant,'Content-Type':'image/jpeg'},content=b'synthetic image')
    assert response.status_code in (401,404), response.text
    assert not list(draft_files.rglob('*.jpg'))


async def test_grant_expiry_bounded_and_revoked_user(async_client, auth_headers, db_session, draft_files):
    from auth import SECRET_KEY
    from models import User, AlbumUploadDraft
    draft_id, body, result = await granted(async_client,auth_headers)
    access = jwt.decode(auth_headers['Authorization'][7:],SECRET_KEY,algorithms=['HS256'])
    draft = await db_session.scalar(select(AlbumUploadDraft).where(AlbumUploadDraft.id==draft_id))
    grant = jwt.decode(result['grant'],SECRET_KEY,algorithms=['HS256'],audience='pickmatch-draft-upload')
    assert grant['exp'] == result['expires_at'] <= min(access['exp'],int(draft.expires_at.timestamp()),int(time.time())+86400)
    for field in ('is_active','is_verified','password_version'):
        user = await db_session.scalar(select(User).where(User.id==grant['sub']))
        old = getattr(user,field)
        setattr(user,field,old+1 if field=='password_version' else False)
        await db_session.commit()
        response = await async_client.put(f"/api/album-drafts/{draft_id}/items/{body['items'][0]['id']}",
            headers={'X-Pickmatch-Upload-Grant':result['grant']},content=b'synthetic image')
        assert response.status_code==401
        setattr(user,field,old)
        await db_session.commit()


async def test_grant_short_access_expiry_and_closed_draft(async_client, auth_headers, draft_files):
    from auth import SECRET_KEY
    claims=jwt.decode(auth_headers['Authorization'][7:],SECRET_KEY,algorithms=['HS256'])
    claims['exp']=int(time.time())+120
    headers={'Authorization':'Bearer '+jwt.encode(claims,SECRET_KEY,algorithm='HS256')}
    draft_id,body,result=await granted(async_client,headers)
    assert result['expires_at']==claims['exp']
    await async_client.delete(f'/api/album-drafts/{draft_id}',headers=headers)
    assert (await async_client.post(f'/api/album-drafts/{draft_id}/upload-grant',headers=headers)).status_code==410
    upload=await async_client.put(f"/api/album-drafts/{draft_id}/items/{body['items'][0]['id']}",headers={'X-Pickmatch-Upload-Grant':result['grant']})
    assert upload.status_code==410


async def test_grant_issue_quota_does_not_spend_transfer_quota(async_client, auth_headers, draft_files):
    draft_id,body,result=await granted(async_client,auth_headers)
    for _ in range(29):
        response=await async_client.post(f'/api/album-drafts/{draft_id}/upload-grant',headers=auth_headers)
        assert response.status_code==200
    assert (await async_client.post(f'/api/album-drafts/{draft_id}/upload-grant',headers=auth_headers)).status_code==429
    upload=await async_client.put(f"/api/album-drafts/{draft_id}/items/{body['items'][0]['id']}",
        headers={'X-Pickmatch-Upload-Grant':result['grant'],'Content-Type':'image/jpeg'},content=b'synthetic image')
    assert upload.status_code==200
