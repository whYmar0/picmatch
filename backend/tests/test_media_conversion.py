import copy

import pytest

from migrate_media_assets import CloudStorage, build_groups, convert_group


class Storage:
    def __init__(self):
        self.items = {("legacy", "upload"): {"asset_id": "original"}}
        self.renames = 0
        self.fail_after_rename = False

    def lookup(self, public_id, delivery_type, resource_type):
        return self.items.get((public_id, delivery_type))

    def rename(self, group):
        self.renames += 1
        self.items[(group["new_id"], "authenticated")] = self.items.pop((group["old_id"], "upload"))
        if self.fail_after_rename:
            self.fail_after_rename = False
            raise TimeoutError()

    def prepare_and_verify(self, group):
        assert self.items[(group["new_id"], "authenticated")]["asset_id"] == group["asset_id"]


def group():
    return {"old_id": "legacy", "new_id": "protected", "asset_id": "original",
            "resource_type": "image", "photo_ids": ["one"], "state": "planned"}


def test_manifest_covers_old_video_helpers_and_original_url_forms(monkeypatch):
    import cloudinary
    from cloudinary_utils import get_image_url, get_thumb_url
    monkeypatch.setattr(cloudinary.config(), 'cloud_name', 'fixture')
    storage = object.__new__(CloudStorage)
    source_url = 'https://res.cloudinary.com/fixture/video/upload/v7/picmatch/legacy.mp4'
    monkeypatch.setattr(storage, 'lookup', lambda *_: {
        'asset_id': 'original', 'version': 7, 'format': 'mp4', 'secure_url': source_url})
    item = {**group(), 'old_id': 'picmatch/legacy', 'resource_type': 'video'}
    urls = storage.describe(item)['legacy_urls']
    assert get_image_url(item['old_id'], resource_type='video') in urls
    assert get_thumb_url(item['old_id'], resource_type='video') in urls
    assert source_url in urls
    assert 'https://res.cloudinary.com/fixture/video/upload/picmatch/legacy' in urls
    assert 'https://res.cloudinary.com/fixture/video/upload/picmatch/legacy.mp4' in urls


def test_groups_preserve_duplicate_bindings_and_exclude_avatar_collisions():
    rows = [{"id": "one", "stored_filename": "picmatch/a", "media_type": "image"},
            {"id": "two", "stored_filename": "picmatch/a", "media_type": "image"},
            {"id": "three", "stored_filename": "picmatch/a", "media_type": "video"}]
    groups = build_groups(rows, [])
    assert len(groups) == 2
    assert groups[0]["photo_ids"] == ["one", "two"]
    assert groups[0]["new_id"] != groups[1]["new_id"]
    with pytest.raises(ValueError, match="avatar"):
        build_groups(rows, ["https://res.cloudinary.com/cloud/image/upload/v1/picmatch/a.jpg"])


@pytest.mark.asyncio
async def test_conversion_resumes_a_successful_remote_rename_after_timeout():
    storage, item, committed, persisted = Storage(), group(), [], []
    storage.fail_after_rename = True
    async def commit(g): committed.append(g["new_id"])
    save = lambda: persisted.append(copy.deepcopy(item))
    with pytest.raises(TimeoutError):
        await convert_group(item, storage, commit, save)
    assert persisted[-1]["state"] == "renaming"
    assert committed == []
    await convert_group(item, storage, commit, save)
    assert storage.renames == 1 and committed == ["protected"]
    assert item["state"] == "committed"


@pytest.mark.asyncio
async def test_database_failure_after_rename_is_resumable():
    storage, item = Storage(), group()
    async def failed(_): raise RuntimeError("DB unavailable")
    with pytest.raises(RuntimeError):
        await convert_group(item, storage, failed, lambda: None)
    assert item["state"] == "ready"
    async def commit(_): pass
    await convert_group(item, storage, commit, lambda: None)
    assert storage.renames == 1 and item["state"] == "committed"


@pytest.mark.asyncio
@pytest.mark.parametrize("problem", ["different_source", "different_target", "missing", "both"])
async def test_conversion_conflicts_never_rename_or_commit(problem):
    storage, item, commits = Storage(), group(), []
    if problem == "different_source": storage.items[("legacy", "upload")]["asset_id"] = "wrong"
    elif problem == "different_target": storage.items[("protected", "authenticated")] = {"asset_id": "wrong"}
    elif problem == "missing": storage.items.clear()
    else: storage.items[("protected", "authenticated")] = {"asset_id": "original"}
    async def commit(g): commits.append(g)
    with pytest.raises(ValueError):
        await convert_group(item, storage, commit, lambda: None)
    assert storage.renames == 0 and commits == []
