"""Opt-in durable album creation API, compatible with existing album clients."""
import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import ValidationError

from auth import get_current_user
from database import get_db
from middleware.rate_limit import limiter, _get_limit
from schemas import DraftCreate
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
