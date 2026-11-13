# Album upload drafts — Stage 7A

Local implementation for the native client's upcoming file queue. Existing web
upload/create APIs and existing albums retain their contracts. Deployment and
physical iPhone creation acceptance are separate stages.

## API

All routes below use `/api/album-drafts` and require a current active verified
Bearer account. Another account's UUID gives404. Never persist the account token
in the upload manifest or print it in diagnostic logs.

| Method/path | Result |
|---|---|
| PUT `/{draft_id}` |201 for a new immutable manifest;200 for the same normalized manifest;409 if changed or another draft is active |
| GET `/{draft_id}` | Status, expiration, item totals, safe item metadata and optional completed album_id; `?item_id=UUID` filters the item list |
| PUT `/{draft_id}/items/{item_id}` | Raw file bytes with the declared Content-Type;200 uploaded;202+Retry-After while the same item is receiving;409 for a superseded/expired attempt (check status before retry) |
| POST `/{draft_id}/finalize` |201 new AlbumOut;200 the same album on replay;409 incomplete/cancelling;410 expired/cancelled/deleted result |
| DELETE `/{draft_id}` | Safe cancellation status; repeated cancellation is allowed;409 after completion preserves album media |

Create body fields: title(trimmed1…255), optional description(max1000), is_public
(default true), ordered items. Each item has id(UUID), filename(max255UTF8 bytes,
no separators/control characters), mime_type, size and sha256(64hex characters).
Extra fields, duplicate item IDs and invalid media types are rejected. JSON is
limited to8MiB before parsing, after authentication.

Limits:1…10000 items;1…52428800 bytes each; total prepared bytes≤10000000000.
The server verifies actual stream length, MIME and SHA256 before a provider write.
It cannot measure original Photos assets that the client compresses locally.

Default rates are `RATE_LIMIT_DRAFT_CREATE=10/hour`,
`RATE_LIMIT_DRAFT_STATUS=120/minute`, `RATE_LIMIT_DRAFT_UPLOAD=30/minute`.
Already-uploaded/receiving replay does not spend new-transfer quota. Owner leases
bound two receiving items across drafts, and each process has two worker slots.
The process bound is not a fleet-wide memory limit. Legacy upload60/hour and its
two-hour references are unchanged.

One uploading/ready/cancelling draft per owner is enforced by a partial unique
index and owner/draft locks. Draft lifetime is seven days from creation; GET
does not extend it. Completed receipts remain and never recreate a deleted album.

## Resume and cancellation

Persist draft UUID, item UUIDs, metadata and prepared files before sending requests.
An unknown upload response is resolved by a status lookup or retry with the same
item UUID. A repeated confirmed item returns200 without consuming another body.
A lost finalize response is resolved by GET or the same finalize operation.

Receiving leases last300 seconds, heartbeat every30 seconds. Input times out
after30 seconds without a chunk or20 minutes overall. A worker owns its spool,
slot and independent DB session through the provider operation even if the client
disconnects after sending bytes. Streaming size/hash errors clean their spools. Before provider writes, the worker
locks the draft and confirms its current live lease; stale completion cannot
clear another worker's recovery marker or delete its resource.

Provider storage is authenticated and non-overwriting. Cloudinary context carries
the server-verified draft/item/digest; provider lookup is used for ambiguous
recovery rather than every ordinary upload. Mismatched existing identity gives409
and is neither overwritten nor deleted. Local assets use deterministic flat
filenames to preserve the protected gateway's existing root confinement.

Cancel marks the draft before deletion. In-flight work observes the closed state
and deletes its own late result; finalize and cancel serialize on the draft row.
Failed deletion retains a retryable cancelling state. If a Cloudinary upload's
outcome is unknown and lookup still sees no object, cleanup conservatively keeps
the draft cancelling: provider/operator confirmation may be required. It does not
claim that an unknown in-flight operation was cancelled or delete an unverified
resource. This may temporarily block another draft for that account.

Periodic cleanup rechecks expired/cancelling drafts, never completed album assets.
Owned `.draft-spool` files older than24 hours are removed only when no live lease
matches; unknown filenames and symlinks are preserved. Maintenance blocks draft
operations and does not start periodic cleanup. Graceful shutdown drains workers.

## Local verification

Run the ordinary backend suite with isolated database/storage and Cloudinary
disabled. It covers legacy APIs plus manifest/stream/replay/ownership/cancellation,
deletion errors, byte/rate/concurrency limits and maintenance. Fifty-MiB stream
boundaries use synthetic disk data; a ten-GB manifest test transfers no ten-GB file.

Explicit probes are outside ordinary pytest collection:

- `backend/tests/draft_postgres_probe.py` requires a disposable loopback database
  described by ignored `.local-proof/postgres/connection.json`; it refuses any
  host/port/database other than127.0.0.1:55433/draft_acceptance. It tests native UUID
  schema/additive migration, simultaneous initial create reads, competing drafts,
  same-item workers, concurrent finalize and finalize/cancel races.
- `backend/tests/draft_cloudinary_probe.py <local-env-file> <synthetic-webm>` forces
  its own local SQLite DB and a unique `pickmatch-draft-acceptance` namespace. It
  verifies real image/video, lost DB receipt, same-asset replay, decoded protected
  JPEG, video206 range, unsigned denial and cancellation. It deletes only context-
  verified synthetic resources and retains a secret-free cleanup manifest.

Evidence is under ignored `.local-proof/` in the feature worktree. No production
DB, existing user album or existing media namespace is a test target.

## Production rollout checklist — requires separate approval

1. Review local suite, PostgreSQL/provider evidence and final code review.
2. Inspect exact target release and preserve a verified application DB backup.
3. Run `python migrate_album_drafts.py` for read-only schema inventory against the
   intended target; apply the two additive tables/indexes only after approval.
4. Confirm old release remains compatible with the added tables, then deploy the
   approved code. Enable no quota/rate overrides implicitly. Preserve protected
   storage, current start options and secret configuration.
5. Verify health/maintenance and old web creation/read flows; then perform an
   approved small-account draft acceptance. Do not infer10GB device behavior from
   manifest limits. Storage/transfer charges grow with accepted media volume.
6. On rollback, retain the additive schema/receipts and private resources for
   reconciliation; do not republish resources or drop live draft data.

Stage7B will provide Photos import/preparation, persistent background queue and
the creation UI. There is no claim of device upload throughput, disk headroom,
background scheduling or real ten-GB acceptance from this backend work.


## Verified result and implementation decisions

On14November2026:92 isolated tests passed, seven disposable-PostgreSQL groups
passed and four real-Cloudinary groups passed. Both final-review race regressions
failed before the fix and passed afterward. All three synthetic acceptance assets
were confirmed absent after strict cleanup; the earlier standalone protocol asset
was also deleted. The test database is disposable and stopped after verification.
No minor findings were deferred.

- The installed execution-workspace helper was absent. A local ignored ledger
  records the execution; the worktree/evidence are retained, avoiding loss of the
  reproducible local stand before integration. This is manual evidence management.
- Provider/filesystem operations live in one internal storage module, and workers
  use independent sessions bound to the request's engine. No new dependency is
  introduced; test overrides stay confined to their database.
- Local publication uses an atomic hard link on the same filesystem rather than
  a replacing rename; flat names preserve the existing gateway's confinement.
  Moving spool and destination to different filesystems would require adaptation.
- An uncertain provider result can keep cancellation pending and block a new draft
  until provider/operator confirmation; this favors recoverability over reporting
  unproven deletion. A mismatched resource is never silently overwritten/deleted.
- Concurrency evidence is for PostgreSQL and the current shared storage. Two worker
  slots are per process; multi-instance fleet limits/shared-filesystem deployment
  and SQLite write concurrency were not certified by this stage.
- Exact byte/hash/type contracts and real JPEG/WebM were checked; exhaustive codec
  decoding, external Cloudinary administrator replacement, sustained10GB transfer,
  device storage capacity and iOS background behavior are outside this evidence.
