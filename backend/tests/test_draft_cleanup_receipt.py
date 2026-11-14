from datetime import timedelta

from sqlalchemy import select

from tests.test_album_draft_races import uploaded
from tests.test_album_draft_storage import draft_files


async def test_expired_cancel_receipt_preserves_pending_deletion(async_client,auth_headers,db_session,draft_files,monkeypatch):
    import album_drafts as drafts
    import album_draft_storage as storage
    from models import AlbumUploadDraft
    draft_id,_=await uploaded(async_client,auth_headers)
    draft=await db_session.scalar(select(AlbumUploadDraft).where(AlbumUploadDraft.id==draft_id))
    draft.expires_at=drafts.now()-timedelta(seconds=1)
    draft.status='expired'
    await db_session.commit()
    original=storage.delete
    async def failed(*args): raise RuntimeError('Synthetic cleanup failure')
    monkeypatch.setattr(storage,'delete',failed)
    pending=await async_client.delete(f'/api/album-drafts/{draft_id}',headers=auth_headers)
    assert pending.json()['status']=='expired' and pending.json()['cleanup_pending'] is True
    assert list(draft_files.rglob('*.jpg'))
    monkeypatch.setattr(storage,'delete',original)
    cleaned=await async_client.delete(f'/api/album-drafts/{draft_id}',headers=auth_headers)
    assert cleaned.json()['status']=='expired' and cleaned.json()['cleanup_pending'] is False
    assert not list(draft_files.rglob('*.jpg'))
