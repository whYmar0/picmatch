# Private Media Implementation Plan

> **For agentic workers:** Execute inline with executing-plans; fresh final review.

**Goal:** Prepare protected album media/API, compatible web rendering and a safe transition plan without touching production.

**Architecture:** Stable per-photo API URLs, shared DB authorization, short-lived audience-scoped browser media tickets and server-side Cloudinary streaming. Public avatars remain independent. Frontend resolver/wrappers preserve media behavior and auth isolation.

**Tech Stack:** Existing FastAPI/SQLAlchemy/PyJWT/Pillow/Cloudinary, Python stdlib streaming, React/Axios/Framer Motion, pytest/Node/Playwright; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-13-private-media-design.md` (approved Stage 5 scope and implementation decisions).

## Global Constraints

- Preserve unrelated dirty files; work on existing pickmatch-v5 checkout, no commits/push/deploy.
- No real DB/Cloudinary mutation, real accounts/email or environment/dependency installation.
- Test DB memory-only; test files under `.planning/2026-11-13-media-privacy/test-uploads` or pytest temp dirs; Cloudinary/network stubbed.
- Public/owner/SharedAccess semantics preserved; private requests also require active verified users.
- Never put account JWT or signed upstream origin URLs into media responses; no public fallback for album Cloudinary assets.
- Physical iOS, real Cloudinary transformations/cache invalidation and migration/deploy remain separately approved acceptance.

## Review Focus

- Every private path checks permissions before cached/thumb/file/upstream access; tickets remain scoped and revocable.
- Public→private, expired/forged/cross-audience tickets and password-version changes cannot bypass checks.
- Mounted DOM sources and pending resolver results cannot survive an account change.
- Stream resources close on HEAD/error/cancellation; Range works and secrets never leak via redirects/errors.
- Type propagation, avatars, image fallback/motion refs, lazy-image expiry and repeated video ticket renewals preserve existing behavior.

## Task 1: Backend boundary

Create `backend/media_access.py`, `backend/routers/media.py`, `backend/tests/test_media_access.py`; modify `auth.py`, `main.py`.

- [x] Write failing isolated media permission/ticket/stream/thumb/range/legacy-avatar tests.
- [x] Implement stable media URLs, common ACL, typed media tickets, local byte/range delivery and protected upstream proxy.
- [x] Replace public album StaticFiles/legacy thumbnail bypasses; preserve DB-referenced public avatars and media security headers including errors.
- [x] Verify owner/shared/outsider/guest, revocation, user flags/password version, public changes and ticket confusion tests.

## Task 2: Producers, storage and migration preparation

Modify `models.py`, `cloudinary_utils.py`, routers albums/comments/notifications; create `backend/migrate_media_privacy.py` and runbook.

- [x] Add delivery-type columns and idempotent schema migration; tests only on memory DB.
- [x] New authenticated album uploads/eager images, carry pending DB type through finalize/delete/cleanup; avatars public.
- [x] Emit media API URLs everywhere; gate private invite metadata. Update intentional legacy test expectations and retain thumb regression coverage.
- [x] Prepare inventory/Cloudinary conversion/invalidation/resume/rollback/deploy runbook; execute none of it on real data.

## Task 3: Web consumers

Create resolver, useMediaSource and native/motion img/video wrappers; adapt album/media consumers and VotePage preload.

- [x] Node checks for URL trust boundary, ticket caching/expiry, forced refresh, account changes/races and anonymous public sources.
- [x] Preserve forwarded refs/native events, image fallback and video playback across bounded ticket retries; reset retry allowance after successful load.
- [x] Mocked local Playwright flow for protected image/video, refresh and account isolation; frontend build.

## Task 4: Whole-change proof and delivery

- [x] Full backend suite, frontend Node/browser/build checks; inspect all failures and fix in scope.
- [x] Fresh final read-only review, fix material findings with regression tests.
- [x] Update `.planning/2026-11-13-media-privacy/` evidence, migration runbook and user handoff.

## Progress

- Baseline backend: 17 passed in 24.09s, isolated memory DB/upload dir and Cloudinary disabled.
- Fresh builder check: implementable, no missing user-policy decision. Incorporated middleware headers, anonymous public path, mounted-source isolation, repeated renewals, cleanup, pending DB provenance.
- Existing analytics share token can recreate SharedAccess after removal; preserve and document that preventing re-entry also requires rotating the share token.
