"""Credentials for immutable draft bytes only; never general account credentials."""
import re
import secrets
import time
import uuid

import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select

from auth import SECRET_KEY, get_current_user, optional_security
from database import get_db
from models import User, AlbumUploadDraft

AUDIENCE = 'pickmatch-draft-upload'
ISSUER = 'pickmatch-api'
TYPE = 'pickmatch-draft-upload+jwt'
LIFETIME = 86400


def unauthorized():
    return HTTPException(401, 'Upload authorization required')


def issue_upload_grant(user, draft, access_expires_at):
    import album_drafts as drafts
    issued = int(time.time())
    expires = min(issued + LIFETIME, int(drafts.utc(draft.expires_at).timestamp()), access_expires_at)
    if type(access_expires_at) is not int or expires <= issued:
        raise unauthorized()
    claims = {'aud': AUDIENCE, 'iss': ISSUER, 'purpose': 'upload-items',
              'sub': str(user.id), 'draft': str(draft.id), 'manifest_hash': draft.manifest_hash,
              'pwd_version': int(user.password_version), 'iat': issued, 'exp': expires,
              'jti': secrets.token_urlsafe(16)}
    return jwt.encode(claims, SECRET_KEY, algorithm='HS256', headers={'typ': TYPE}), expires


async def upload_grant_owner(grant, draft_id, db):
    try:
        if not isinstance(grant, str) or not 1 <= len(grant) <= 4096:
            raise ValueError()
        if jwt.get_unverified_header(grant).get('typ') != TYPE:
            raise ValueError()
        claims = jwt.decode(grant, SECRET_KEY, algorithms=['HS256'], audience=AUDIENCE, issuer=ISSUER,
                            options={'require': ['aud','iss','purpose','sub','draft','manifest_hash','pwd_version','iat','exp','jti']})
        if (claims['aud'] != AUDIENCE or claims['purpose'] != 'upload-items'
                or type(claims['pwd_version']) is not int or claims['pwd_version'] < 0
                or type(claims['iat']) is not int or type(claims['exp']) is not int
                or not 0 < claims['exp'] - claims['iat'] <= LIFETIME
                or not isinstance(claims['jti'], str) or not 1 <= len(claims['jti']) <= 128
                or not isinstance(claims['manifest_hash'], str)
                or re.fullmatch('[0-9a-f]{64}', claims['manifest_hash']) is None
                or str(uuid.UUID(claims['sub'])) != claims['sub']
                or str(uuid.UUID(claims['draft'])) != claims['draft']):
            raise ValueError()
    except (jwt.InvalidTokenError, ValueError, TypeError, KeyError, AttributeError):
        raise unauthorized() from None
    if claims['draft'] != str(draft_id):
        raise HTTPException(404, 'Draft not found')
    user = await db.scalar(select(User).where(User.id == claims['sub']))
    if not user or not user.is_active or not user.is_verified or int(user.password_version) != claims['pwd_version']:
        raise unauthorized()
    draft = await db.scalar(select(AlbumUploadDraft).where(AlbumUploadDraft.id == str(draft_id)))
    if draft is None or str(draft.user_id) != claims['sub']:
        raise HTTPException(404, 'Draft not found')
    if draft.manifest_hash != claims['manifest_hash']:
        raise unauthorized()
    return user


async def item_upload_owner(request: Request, draft_id: uuid.UUID,
                            credentials=Depends(optional_security), db=Depends(get_db)):
    grants = request.headers.getlist('x-pickmatch-upload-grant')
    if grants:
        if len(grants) != 1 or request.headers.get('authorization') is not None:
            raise unauthorized()
        return await upload_grant_owner(grants[0], draft_id, db)
    if credentials is None:
        raise unauthorized()
    user = await get_current_user(credentials, db)
    if not user.is_verified:
        raise HTTPException(403, 'Verified account required')
    return user
