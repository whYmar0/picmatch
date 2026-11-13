# Album Upload Foundation Implementation Plan — Stage 7A

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement inline, task-by-task, with one fresh final reviewer.

**Goal:** Provide owner-scoped, recoverable album upload drafts that support prepared batches up to 10 GB and return the same item/album after retries.

**Architecture:** Add two draft tables and an opt-in router/service around the existing protected storage and Album/Photo models. Raw per-item uploads are size/hash checked on disk, provider identity is deterministic, and finalize/cancel share a transactional draft lock. Existing web upload/create contracts retain their current behavior.

**Tech Stack:** Existing FastAPI, SQLAlchemy async, Pydantic, PostgreSQL/SQLite, Cloudinary SDK and pytest; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-14-album-creation-design.md` (approved copy retained in this feature branch).

**Status:** User approved local Stage7A implementation and tests with «да, приступай». Implementation verified locally; final review is recorded below. Production rollout remains a separate approval.

## Global Constraints

- Execute product work in `picmatch_v5`, using an isolated Git worktree from its current branch and preserving all existing dirty files. Native source stays at the accepted gallery stage during 7A.
- One active draft per account, immutable manifest, seven-day expiry from creation, 1…10000 items, each 1…52428800 bytes, prepared sum ≤10000000000 bytes.
- New draft defaults: create10/hour, new file transfer30/minute per user, status120/minute; at most two receiving items per user and two per process. Existing legacy60/hour and two-hour references remain unchanged.
- New image/video storage remains authenticated, overwrite=false, with existing eager image variants; DTOs never expose storage paths, provider URLs or auth secrets.
- Confirmed active verified owner is required; foreign UUIDs return404. Finalize/cancel/cleanup must not delete a completed album's media.
- A completed receipt remains valid for the album lifetime; deleted album→410 on finalize replay, never a replacement album.
- No production writes, deploys, quota changes, dependency installations or real-account tests in implementation unless separately authorized. Local synthetic Cloudinary acceptance is within the proposed execution scope, using an isolated test namespace and exact asset ownership checks.
- Test Postgres uses its own disposable local cluster/database; do not reuse the earlier production backup/restore cluster or production DSN. Existing PostgreSQL18 tools may be used without installing anything.

## Review Focus

- Upload success followed by lost response/DB failure must reconcile a single protected provider object.
- Concurrent same-item retries and expired leases must neither create duplicates nor let stale completion delete an active resource.
- Concurrent finalize/cancel/cleanup must resolve to one album or a cancelled draft, with correct ownership and no partial finalization.
- Oversized/short/digest-mismatched streams, including missing Content-Length, must fail before provider writes and release owned temporary files/slots.
- Legacy clients, maintenance, rate enforcement and provider deletion failures must keep their existing behavior or an explicit retryable draft state.

## Files and Responsibilities

Modify `backend/models.py`: `AlbumUploadDraft`, `AlbumUploadItem`, constraints/indexes and optional completed-album association.

Create `backend/album_drafts.py`: manifest fingerprints, draft lifecycle, item leases, durable provider-worker reconciliation, finalize/cancel/cleanup.

Create `backend/routers/album_drafts.py`: typed owner-authenticated HTTP boundary, raw body spool/validation, safe DTOs and rate limits.

Modify `backend/schemas.py`: draft create/item/status contracts with exact validation bounds from the spec.

Modify `backend/cloudinary_utils.py`: draft-only deterministic upload/lookup and strict deletion helpers. Existing `delete_image` swallows errors; do not reuse that behavior for retryable draft cleanup or alter legacy semantics as a side effect.

Modify `backend/routers/albums.py`: extract only the existing Album/Photo insertion block as a transaction-neutral helper shared with draft finalize; retain existing reference claims and HTTP behavior.

Modify `backend/main.py`: router registration and draft cleanup in the existing periodic lifecycle, maintenance-aware.

Create `backend/migrate_album_drafts.py`: read-only schema inventory by default, explicit additive table/index creation when requested; no existing row transformation.

Create `backend/tests/test_album_drafts.py`, `test_album_draft_races.py`, `test_album_draft_storage.py`, `test_album_draft_migration.py`; extend existing upload/storage/maintenance tests only where relevant.

Create `docs/album-upload-drafts.md`: API examples, configuration/limits, failure recovery, local acceptance evidence and a separate production rollout checklist.

## Task 1: Persisted ownership, manifest and metadata contract

**Produces:**
- Models `AlbumUploadDraft` (id, owner, fingerprint, title/description/is_public, status, created_at/expires_at, album_id) and `AlbumUploadItem` (draft_id+item_id, order, filename/MIME, size/SHA256, status, storage identity/type, lease_id/expires_at).
- A DB-enforced unique active draft per owner for uploading/ready/cancelling; cancelled/expired receipts are not active. Serialize creation through the owner row so concurrent creates cannot bypass the constraint.
- `create_or_get_draft(db, owner, draft_id, manifest) -> DraftOut`; `get_draft(db, owner, draft_id, item_id=None) -> DraftOut`. A filtered status request avoids downloading a10000-item list while resolving one ambiguous item.

- [ ] Add isolated tests `test_draft_manifest_boundaries`, `test_create_replay_and_conflict`, `test_foreign_owner_hidden`, `test_one_active_draft`, `test_filtered_status`. Exact10GB is accepted as200×50000000-byte metadata entries; +1 byte is rejected without uploading bytes. Cover10001 items, duplicate UUID, bad SHA/MIME/name, zero/too-large file and whitespace title.
- [ ] Run `python -m pytest tests/test_album_drafts.py -q` from backend in its existing test environment; observe missing route/model failures.
- [ ] Implement schema/models and create/status routes under `/api/album-drafts`. Authenticate before reading a bounded8MiB raw manifest, then validate with the typed schema. Normalize once before fingerprinting; filename≤255 UTF8 bytes and title/description bounds are enforced, owner cannot be supplied by request. Return only safe metadata/status/expiry and optional album_id.
- [ ] Add migration inventory/apply/replay tests preserving existing User/Album/Photo/PendingUpload data. Implement additive table/index migration, default read-only.
- [ ] Run the Task1 test files; expected PASS. Keep seven-day expiry and ownership independent of GET access frequency.

## Task 2: Bounded, replay-safe item transfer and storage

**Consumes:** persisted immutable item size/digest/type and draft ownership from Task1.

**Produces:**
- `claim_item(db, owner, draft_id, item_id) -> ItemLease | ItemOut`; lease300 seconds, heartbeat30 seconds while worker is alive. A live receiving replay returns202+Retry-After; uploaded replay returns200 without reading a body. Expired ownership is reconciled before another provider write.
- `receive_item(request, lease) -> OwnedSpool`: raw stream into a verified temporary path, incremental SHA256, exact byte/MIME checks and at most50MiB. Thirty-second idle timeout and20-minute overall receive deadline are explicit engineering limits.
- `complete_item_upload(lease, spool) -> ItemOut`: independent `AsyncSessionLocal`, conditional lease/generation publication, deterministic storage reconciliation and eventual owned-file cleanup.
- Draft storage helpers `upload_draft_media`, `lookup_draft_media`, `delete_draft_media`; strict outcome/identity checking, no ignored provider failures.

- [ ] Add stream tests for exact size, +1, truncated body, missing/false Content-Length, wrong digest, invalid MIME, disconnect and timeouts. Count provider calls and temp files; invalid bytes must make zero provider writes. Observe failures before implementation.
- [ ] Add provider-adapter tests: lost upload receipt, provider success before DB failure, existing matching object, existing conflicting context/type, transient lookup failure, lease expiry and late completion. Assert one deterministic protected resource, overwrite=false, exact digest/identity, no exposed origin URL and no deletion on a mere stale lease.
- [ ] Implement bounded intake and worker slots. HTTP cancellation must not release a worker slot or delete the spool while a blocking SDK operation still uses it; heartbeat/result DB work uses an independent session. Hold no database row lock across stream/provider I/O.
- [ ] Implement private provider helpers. Normal new uploads use the upload receipt; Admin API lookup is limited to ambiguous/existing/recovery cases, avoiding a lookup per normal file. Verify actual SDK receipt/context behavior with the planned synthetic provider probe before treating identity as established. Unknown/foreign identity fails409 rather than overwrite/delete.
- [ ] Implement local-file storage with atomic rename/digest validation. Do not add external storage providers or chunked uploads in this task.
- [ ] Apply new-transfer rate limits only after the uploaded/receiving replay fast path; limit new work to30/minute. Separate status limit120/minute; keep owner/global concurrency bounds and legacy limits. Test with the real limiter active.
- [ ] Run `python -m pytest tests/test_album_drafts.py tests/test_album_draft_storage.py -q`; expected PASS, including slot/spool cleanup.

## Task 3: Atomic finalize, retryable cancellation, lifecycle and acceptance

**Consumes:** owner draft and confirmed ordered items from Tasks1–2.

**Produces:**
- `add_album_with_photos(db, creator, title, description, is_public, rows) -> Album`: extracted existing insert/flush logic; no commit in helper. Existing create keeps its reference-claim transaction.
- `finalize_draft(db, owner, draft_id) -> AlbumOut`: same draft lock for readiness check, Album/Photo insert and completed+album_id transaction. Initial success201, repeat200; not-ready409, expired410, deleted completed album410.
- `cancel_draft(db, owner, draft_id) -> DraftOut` and `cleanup_album_drafts(db)`: safe cancellation/tombstone, repeatable owned-object removal and expiry recovery. Active worker completion observes draft cancellation before publication; completed assets are excluded.

- [ ] Add lost-final-response and concurrent finalize/finalize/finalize-cancel/cleanup tests; assert one album, exact ordered photos and unchanged private delivery types. Add failed delete/retry, cancellation during provider operation, expiry during upload, stale worker result and deleted-album receipt tests. Observe RED.
- [ ] Extract the existing insert helper without changing validation/reference claims; implement finalize/cancel using the same locked draft row and transaction. Strict provider delete failures retain retryable cleanup state; do not delete through the legacy swallowed-error helper.
- [ ] Extend the existing periodic cleanup lifecycle and router registration. Maintenance must bypass uploads/finalize and must not start draft cleanup. Preserve legacy test expectations, including reuse of legacy tokens returning409.
- [ ] Run full isolated backend suite with production env/DSN/provider calls excluded; expected PASS. Run race tests against disposable local PostgreSQL with at least two independent connections: SQLite alone does not prove locking/active-draft uniqueness.
- [ ] Run an explicitly isolated real-Cloudinary probe with synthetic image/video files: same item repeated, lost-response recovery, matching context, unsigned denial, protected gateway after finalize, strict deletion and no old namespace interaction. Keep proof/asset mapping secret-safe and delete only positively owned test assets. No10GB provider upload or real-user album creation is part of this proof.
- [ ] Document the API, limits/TTL, recovery statuses and storage costs/risks in `docs/album-upload-drafts.md`. Prepare an additive production rollout checklist with backup/schema-first deployment compatibility, preserving the existing live app; execution of that checklist remains a separate approval.
- [ ] One fresh final read-only review; address material findings with focused RED→GREEN regression checks and the green full suite. Deliver the verified local foundation and concrete7B API contract. No iPhone behavior is claimed at7A.

## Plan Review

The independent builder check found no important unanswered question. It confirmed that current Album/Photo models suffice and flagged the swallowed-error deletion helper; this plan explicitly requires a separate strict draft deletion path. Spec coverage maps server ownership/manifest to Task1, byte/provider/lease recovery to Task2 and finalization/cancel/cleanup/compatibility to Task3. Native preparation/UI/background acceptance belongs to7B and is not marked implemented by this plan.
