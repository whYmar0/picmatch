# Stage 5: private media delivery

User approved code, tests and a transition plan for existing files. No production
migration, Cloudinary writes, deployment, real-account calls or dependency installs.

## Approach

Proxy album media through one API authorization boundary. Native clients send
Bearer headers. Browser img/video elements obtain five-minute, photo/variant
tickets using the existing Axios JWT. Tickets cannot authenticate to other APIs
or mint new tickets; copied tickets can read that one file until expiry/revocation.
Check current permissions, active/verified user and password_version on every
private request. No account JWT or signed Cloudinary origin URL exposed in media URLs.

Public Cloudinary URLs cannot enforce revocation; exposing signed Cloudinary URLs
would still bypass current application permissions. Browser cookie-only delivery
depends on third-party cookies. The API proxy avoids both problems and requires
no paid CDN authentication add-on, at the cost of backend bandwidth/streaming load.

## Access

- Public albums readable without login. Private albums: verified active owner or
  current SharedAccess. A plain invite code does not grant private access, matching
  the existing private voting gate; private invite metadata must apply this rule.
- Revoking a share, disabling/unverifying a user or changing password invalidates
  future private requests, including tickets. Downloaded bytes cannot be revoked.
  Existing analytics share links can recreate SharedAccess; preventing re-entry
  also requires rotating that link, as in the existing sharing contract.
- Pending uploads stay inaccessible; their API returns no URL, web previews are local.
- Public avatars remain available only for DB-referenced generated avatar filenames.
  Close other `/uploads` paths and the legacy unauthenticated `/api/thumbnail` route.
- All media responses: private/no-store, no-referrer; checks precede cache, file
  existence or upstream access. GET/HEAD, single byte ranges and If-Range supported.

## Backend

- media_access.py: stable photo URLs, shared permission policy, scoped HS256 media
  tickets (media audience and required sub/photo/variant/pwd_version/iat/exp claims,
  maximum 300 seconds). Existing login JWTs cannot be media tickets or vice versa.
- routers/media.py: access-ticket endpoint and GET/HEAD bytes. Standard-library
  urllib streams Cloudinary with no redirects; no new dependencies. Local bounded
  streams implement ranges (installed Starlette 0.38.6 has no suitable FileResponse ranges).
- Replace every album/comment/notification media URL producer. Ignore invite/raw
  storage in the native metadata list; native app changes are unnecessary now.
- Add cloudinary_delivery_type to Photo/PendingUpload, legacy default upload.
  New album uploads authenticated; avatars remain upload. Finalize/cleanup/delete
  carry the type from server-owned records. Legacy Cloudinary album media fail
  closed until converted, even for public albums (privacy may later change).
- Authenticated images need eager variants: width2048 limit/q_auto and width500
  limit/q_auto, original format retained. Dynamic f_auto is removed only for these
  protected album variants; videos keep original streaming, local thumbs WebP480.

## Web

One resolver/cache recognizes only this API's media paths and obtains tickets
with current auth. Cache results isolated by account token; stale responses
cannot cross account changes. External/blob/avatar sources bypass the resolver.
Native img/video wrappers preserve refs/events; motion wrappers preserve layout
transitions. Refresh tickets once on media failure (covers lazy-image expiry);
video refresh restores time and intended play/pause state. Adapt cards, gallery,
summary, swipe, lightbox, previews, notifications and VotePage preloading.

## Transition

Prepare an idempotent additive schema migration and runbook, not a production
migration execution. Separately approved transition must inventory all album
assets, back up DB, rename/rotate IDs into authenticated storage, eagerly prepare
variants, invalidate old CDN URLs and update DB with resumable error handling.
Preserve avatars; resolve duplicate references; migrate or expire pending uploads.
Old CDN caches may remain for seconds/minutes (sometimes longer); do not claim
privacy until old original and derived URLs have been checked after invalidation.

## Proof

Isolated SQLite and upload directory; stub email/Cloudinary/upstream. Test
owner/shared/outsider/guest, ticket scope/expiry/tampering, revocation/password
version, public→private, pending/raw bypasses, avatar exception, thumbs/ranges,
storage propagation and no public fallback/origin leak. Full backend suite,
frontend resolver Node checks, mocked local browser flow, production build and
fresh final review. Real Cloudinary/CDN, deployment and physical iOS acceptance
remain future separately approved checks.

Sources: existing albums/votes/shared_access/share_links/auth code;
[Cloudinary protection](https://cloudinary.com/documentation/control_access_to_media),
[rename/invalidation](https://cloudinary.com/documentation/rename_assets).
