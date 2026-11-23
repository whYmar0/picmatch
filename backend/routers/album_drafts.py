"""Opt-in durable album creation API, compatible with existing album clients."""
import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import ValidationError

from auth import get_current_user
from database import get_db
from middleware.rate_limit import limiter, _get_limit
from schemas import DraftCreate
from draft_upload_access import item_upload_owner, issue_upload_grant
import album_drafts as drafts

router = APIRouter(prefix="/album-drafts", tags=["Album drafts"])


async def draft_owner(user=Depends(get_current_user)):
    if not user.is_verified:
        raise HTTPException(403, "Verified account required")
    return user


async def manifest_body(request):
    content = bytearray()
    try:
        async with asyncio.timeout(30):
            async for chunk in request.stream():
                if len(content) + len(chunk) > 8 * 1024 * 1024:
                    raise HTTPException(413, "Manifest too large")
                content.extend(chunk)
    except TimeoutError:
        raise HTTPException(408, "Manifest timed out")
    try:
        return DraftCreate.model_validate_json(content)
    except ValidationError:
        raise HTTPException(422, "Invalid draft manifest")


@router.put("/{draft_id}")
@limiter.limit(_get_limit("RATE_LIMIT_DRAFT_CREATE", "10/hour"))
async def create_draft(request: Request, response: Response, draft_id: uuid.UUID,
                       owner=Depends(draft_owner), db=Depends(get_db)):
    result, created = await drafts.create_or_get_draft(db, owner, draft_id, await manifest_body(request))
    response.status_code = 201 if created else 200
    return result


@router.get("/{draft_id}")
@limiter.limit(_get_limit("RATE_LIMIT_DRAFT_STATUS", "120/minute"))
async def read_draft(request: Request, draft_id: uuid.UUID, item_id: uuid.UUID | None = None,
                     owner=Depends(draft_owner), db=Depends(get_db)):
    return await drafts.get_draft(db, owner, draft_id, item_id)


@router.put("/{draft_id}/items/{item_id}")
async def put_item(request: Request, response: Response, draft_id: uuid.UUID, item_id: uuid.UUID,
                    owner=Depends(item_upload_owner), db=Depends(get_db)):
    result, status = await drafts.upload_item(request, db, owner, draft_id, item_id)
    response.status_code = status
    if status == 202:
        response.headers["Retry-After"] = "2"
    return result


@router.post("/{draft_id}/upload-grant")
@limiter.limit(_get_limit("RATE_LIMIT_DRAFT_GRANT", "30/minute"))
async def upload_grant(request: Request, response: Response, draft_id: uuid.UUID,
                       owner=Depends(draft_owner), db=Depends(get_db)):
    from auth import decode_token
    draft = await drafts.owned(db, owner, draft_id, lock=True)
    drafts.expire(draft)
    if draft.status not in ("uploading", "ready"):
        await db.commit()
        raise HTTPException(410 if draft.status in ("expired", "cancelled") else 409, "Draft closed")
    if draft.total_size == 0:
        raise HTTPException(409, "No files to upload")
    claims = decode_token(request.headers.get("authorization", "")[7:])
    if not claims or type(claims.get("exp")) is not int:
        raise HTTPException(401, "Account authorization required")
    grant, expires = issue_upload_grant(owner, draft, claims["exp"])
    await db.commit()
    response.headers["Cache-Control"] = "no-store"
    return {"grant": grant, "expires_at": expires}


@router.post("/{draft_id}/finalize")
@limiter.limit(_get_limit("RATE_LIMIT_DRAFT_STATUS", "120/minute"))
async def finish_draft(request: Request, response: Response, draft_id: uuid.UUID,
                        owner=Depends(draft_owner), db=Depends(get_db)):
    result, created = await drafts.finalize_draft(db, owner, draft_id)
    response.status_code = 201 if created else 200
    return result


@router.delete("/{draft_id}")
@limiter.limit(_get_limit("RATE_LIMIT_DRAFT_STATUS", "120/minute"))
async def delete_draft(request: Request, draft_id: uuid.UUID,
                        owner=Depends(draft_owner), db=Depends(get_db)):
    return await drafts.cancel_draft(db, owner, draft_id)
