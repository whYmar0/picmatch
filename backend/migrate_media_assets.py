"""Explicit, resumable Cloudinary transition. Default invocation only prepares a private manifest."""
import argparse
import asyncio
import hashlib
import json
import os
import ssl
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import unquote, urlparse

from cloudinary_utils import ALBUM_IMAGE_TRANSFORMS


def build_groups(rows, avatars):
    groups = {}
    for row in rows:
        public_id, kind = row['stored_filename'], row['media_type']
        if not public_id.startswith('picmatch/') or kind not in ('image', 'video'):
            raise ValueError('Unknown storage reference; inventory must be resolved first')
        if row.get('cloudinary_delivery_type', 'upload') != 'upload':
            raise ValueError('Use the existing manifest to resume protected rows')
        if kind == 'image' and any(unquote(urlparse(a).path).rsplit('.', 1)[0].endswith('/' + public_id) for a in avatars):
            raise ValueError('Album reference collides with an avatar')
        item = groups.setdefault((kind, public_id), {
            'resource_type': kind, 'old_id': public_id, 'new_id': 'picmatch/' + str(uuid.uuid4()),
            'photo_ids': [], 'state': 'planned'})
        item['photo_ids'].append(str(row['id']))
    return list(groups.values())


async def convert_group(group, storage, commit, save):
    old = storage.lookup(group['old_id'], 'upload', group['resource_type'])
    new = storage.lookup(group['new_id'], 'authenticated', group['resource_type'])
    if old and old['asset_id'] != group['asset_id']:
        raise ValueError('Source identity changed')
    if new:
        if new['asset_id'] != group['asset_id'] or old:
            raise ValueError('Destination identity conflict')
    else:
        if not old:
            raise ValueError('Source and destination are missing')
        group['state'] = 'renaming'
        save()
        storage.rename(group)
    group['state'] = 'renamed'
    save()
    storage.prepare_and_verify(group)
    group['state'] = 'ready'
    save()
    await commit(group)
    group['state'] = 'committed'
    save()


def save_manifest(path, document):
    temporary = path.with_suffix('.tmp')
    with temporary.open('w', encoding='utf8') as output:
        json.dump(document, output, indent=2)
        output.flush()
        os.fsync(output.fileno())
    temporary.replace(path)


class CloudStorage:
    def __init__(self, config):
        import cloudinary
        cloudinary.config(cloud_name=config['CLOUDINARY_CLOUD_NAME'], api_key=config['CLOUDINARY_API_KEY'],
                          api_secret=config['CLOUDINARY_API_SECRET'], secure=True)

    def lookup(self, public_id, delivery_type, resource_type):
        import cloudinary.api
        from cloudinary.exceptions import NotFound
        try:
            return cloudinary.api.resource(public_id, type=delivery_type, resource_type=resource_type, timeout=45)
        except NotFound:
            return None

    def describe(self, group):
        import cloudinary.utils
        from cloudinary_utils import get_image_url, get_thumb_url
        source = self.lookup(group['old_id'], 'upload', group['resource_type'])
        if not source:
            raise ValueError('Inventoried source is missing')
        urls = [source['secure_url'], get_image_url(group['old_id'], resource_type=group['resource_type']),
                get_thumb_url(group['old_id'], resource_type=group['resource_type'])]
        for version in (None, source['version']):
            for output_format in (None, source['format']):
                urls.append(cloudinary.utils.cloudinary_url(group['old_id'], secure=True,
                    resource_type=group['resource_type'], version=version, format=output_format, force_version=False)[0])
        urls += [item['secure_url'] for item in source.get('derived', []) if item.get('secure_url')]
        return {**group, 'asset_id': source['asset_id'], 'original_version': source['version'],
                'original_format': source['format'], 'legacy_urls': sorted(set(urls))}

    def rename(self, group):
        import cloudinary.uploader
        result = cloudinary.uploader.rename(group['old_id'], group['new_id'], type='upload',
            to_type='authenticated', resource_type=group['resource_type'], invalidate=True, overwrite=False, timeout=60)
        if result.get('asset_id') != group['asset_id']:
            raise ValueError('Renamed asset identity mismatch')

    def prepare_and_verify(self, group):
        import cloudinary.uploader
        import cloudinary.utils
        import httpx
        kind = group['resource_type']
        if kind == 'image':
            result = cloudinary.uploader.explicit(group['new_id'], type='authenticated', resource_type=kind,
                eager=list(ALBUM_IMAGE_TRANSFORMS), eager_async=False, timeout=60)
            if len(result.get('eager', [])) != 2:
                raise ValueError('Protected image variants are not ready')
        with httpx.Client(timeout=40, follow_redirects=False) as client:
            for transform in (ALBUM_IMAGE_TRANSFORMS if kind == 'image' else [{}]):
                options = dict(secure=True, type='authenticated', resource_type=kind, **transform)
                signed = cloudinary.utils.cloudinary_url(group['new_id'], sign_url=True, **options)[0]
                response = client.head(signed)
                if response.status_code != 200 or not response.headers.get('content-type', '').startswith(kind + '/'):
                    raise ValueError('Protected variant delivery failed')
                unsigned = cloudinary.utils.cloudinary_url(group['new_id'], sign_url=False, **options)[0]
                if client.head(unsigned).status_code not in (401, 403, 404):
                    raise ValueError('Unsigned protected variant is accessible')


class Database:
    def __init__(self, connection):
        self.connection = connection

    async def rows(self):
        column = await self.connection.fetchval("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='photos' AND column_name='cloudinary_delivery_type')")
        delivery = 'cloudinary_delivery_type' if column else "'upload' AS cloudinary_delivery_type"
        return [dict(row) for row in await self.connection.fetch(
            'SELECT id::text, stored_filename, media_type, ' + delivery + ' FROM public.photos ORDER BY id')]

    async def validate(self, groups):
        if await self.connection.fetchval('SELECT COUNT(*) FROM public.pending_uploads'):
            raise ValueError('Pending uploads must be resolved before conversion')
        rows = {row['id']: row for row in await self.rows()}
        expected = [photo_id for group in groups for photo_id in group['photo_ids']]
        if len(expected) != len(set(expected)) or set(rows) != set(expected):
            raise ValueError('Photo inventory changed')
        for group in groups:
            for photo_id in group['photo_ids']:
                row = rows[photo_id]
                if row['media_type'] != group['resource_type'] or (row['stored_filename'], row['cloudinary_delivery_type']) not in (
                    (group['old_id'], 'upload'), (group['new_id'], 'authenticated')):
                    raise ValueError('Photo binding changed')
                if group['state'] == 'committed' and row['stored_filename'] != group['new_id']:
                    raise ValueError('Recorded commit does not match database')

    async def commit(self, group):
        ids = [uuid.UUID(photo_id) for photo_id in group['photo_ids']]
        async with self.connection.transaction():
            rows = await self.connection.fetch('SELECT id::text,stored_filename,media_type,cloudinary_delivery_type FROM public.photos WHERE id=ANY($1::uuid[]) FOR UPDATE', ids)
            if {r['id'] for r in rows} != set(group['photo_ids']) or any(
                r['media_type'] != group['resource_type'] or (r['stored_filename'], r['cloudinary_delivery_type']) not in (
                    (group['old_id'], 'upload'), (group['new_id'], 'authenticated')) for r in rows):
                raise ValueError('Photo bindings changed before commit')
            await self.connection.execute("UPDATE public.photos SET stored_filename=$1,cloudinary_delivery_type='authenticated' WHERE id=ANY($2::uuid[]) AND stored_filename=$3 AND cloudinary_delivery_type='upload'", group['new_id'], ids, group['old_id'])


def db_identity(dsn):
    parsed = urlparse(dsn)
    return [parsed.hostname, parsed.port or 5432, parsed.path, parsed.username]


async def main(args):
    import asyncpg
    import httpx
    from dotenv import dotenv_values
    config = dotenv_values(args.env_file)
    context = ssl.create_default_context(cafile=args.ca_file)
    dsn = config['DATABASE_URL'].replace('postgresql+asyncpg://', 'postgresql://', 1)
    snapshot = Path(args.backup)
    with snapshot.open('rb') as source:
        if source.read(5) != b'PGDMP':
            raise ValueError('A PostgreSQL custom-format backup is required')
    identity = db_identity(dsn)
    path = Path(args.manifest)
    storage = CloudStorage(config)
    connection = await asyncpg.connect(dsn, ssl=context, statement_cache_size=0, timeout=20)
    try:
        database = Database(connection)
        if not args.apply:
            if path.exists():
                raise ValueError('Manifest already exists; inspect it before resuming with --apply')
            async with connection.transaction(readonly=True, isolation='repeatable_read'):
                rows = await database.rows()
                avatars = [row['avatar_url'] for row in await connection.fetch('SELECT avatar_url FROM public.users WHERE avatar_url IS NOT NULL')]
                groups = build_groups(rows, avatars)
                await database.validate(groups)
            # Read-only provider inspection; no rename/upload/delete call in this mode.
            with ThreadPoolExecutor(max_workers=4) as pool:
                groups = list(pool.map(storage.describe, groups))
            document = {'database_identity': identity, 'cloud_name': config['CLOUDINARY_CLOUD_NAME'],
                        'created_at': int(time.time()), 'groups': groups, 'state': 'planned'}
            save_manifest(path, document)
        else:
            document = json.loads(path.read_text(encoding='utf8'))
            if document['database_identity'] != identity or document['cloud_name'] != config['CLOUDINARY_CLOUD_NAME']:
                raise ValueError('Manifest belongs to a different environment')
            health = httpx.get(args.api_url.rstrip('/') + '/api/health', timeout=30)
            if health.status_code != 200 or health.json().get('maintenance') is not True:
                raise ValueError('The API must be in maintenance before applying')
            groups = document['groups']
            await database.validate(groups)
            document['backup_sha256'] = hashlib.sha256(snapshot.read_bytes()).hexdigest()
            save_manifest(path, document)
            for index, group in enumerate(groups):
                if group['state'] != 'committed':
                    await convert_group(group, storage, database.commit, lambda: save_manifest(path, document))
                if (index + 1) % 10 == 0 or index + 1 == len(groups):
                    print(json.dumps({'committed_groups': index + 1, 'total': len(groups)}), flush=True)
            urls = sorted({url for group in groups for url in group['legacy_urls']})
            for url in urls:
                parsed = urlparse(url)
                if parsed.scheme != 'https' or parsed.hostname != 'res.cloudinary.com' or parsed.username or parsed.password:
                    raise ValueError('Unexpected legacy origin in manifest')
            def closed(url):
                with httpx.Client(timeout=40, follow_redirects=False) as client:
                    return client.head(url).status_code in (401, 403, 404)
            with ThreadPoolExecutor(max_workers=4) as pool:
                results = list(pool.map(closed, urls))
            document['legacy_urls_checked'] = len(urls)
            document['legacy_urls_remaining'] = sum(not result for result in results)
            document['state'] = 'complete' if all(results) else 'cdn_pending'
            save_manifest(path, document)
        print(json.dumps({'state': document['state'], 'groups': len(document['groups']),
                          'legacy_urls_remaining': document.get('legacy_urls_remaining')}), flush=True)
    finally:
        await connection.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('env-file', 'manifest', 'ca-file', 'backup'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--api-url', default='https://pickmatch-api.onrender.com')
    parser.add_argument('--apply', action='store_true')
    try:
        asyncio.run(main(parser.parse_args()))
    except Exception as error:
        # Provider/HTTP exceptions can contain signed URLs or credentials.
        print(json.dumps({'state': 'failed', 'error_type': type(error).__name__}), flush=True)
        raise SystemExit(1)
