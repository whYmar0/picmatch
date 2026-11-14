# Link-only access: local implementation and separate rollout

User-approved rules15November2026: author links admit to both album types;
private statistics are author-only, public statistics belong to admitted viewers.
Username/email recipient management is retired. Opening an old link, old votes,
comments or unversioned legacy access must not bypass reset/revocation.

## Local state

Feature worktree: `.worktrees/pickmatch-link-access`, branch `feat/link-only-sharing`.
Base deployed source90187e0; personal-management retirement79da9ff. Main checkout
and its pre-existing uncommitted changes are preserved. Backend/Web implemented
locally; native source is in sibling `pickmatch_swift` with before/after archives.
No production service, database or web deployment was changed by this work.

One additive nullable column: `shared_accesses.link_version VARCHAR(64)`.
`backend/migrate_link_access.py` introspects before adding it; errors propagate.
No rows, votes, comments, photos or legacy columns are deleted. Old unversioned
visits stop admitting until the current author link is opened again.

One generation governs all aliases. Owner controls:
GET/POST/DELETE `/api/albums/{id}/invitation` and POST `.../rotate`.
GET never reactivates. Reset rotates invite_code and existing share_token;
revoke disables is_active; explicit recreation uses new codes. New results links
can use `/share/{invite_code}`; old `/share/{share_token}` remain aliases while
active. Neither alias bypasses private statistics. Standard album payload for
native `/share` opening: GET `/api/albums/shared/{token}`.

Guests can preview either type using media URLs with a current invite capability.
UUID alone never admits public media. Logged-in media access normally uses a
short ticket; participant tickets are generation-bound and checked on every new
GET/HEAD/Range. Owner tickets retain owner access. Already received bytes and
in-flight responses are outside revocation; future requests are checked again.

## Local verification

- Backend retirement:113 baseline, then116 including new endpoint-removal checks.
- Full link-policy backend suite:127passed before final review; focused RED/GREEN
  covers rotation, reactivation, guest media, raw IDs, legacy grants, analytics,
  comments and votes. Final result/any review corrections recorded in the ledger.
- Real local PostgreSQL18 on127.0.0.1:55435: migration twice, pre/post content
  fingerprints equal; stale visitor waits on owner row lock and is rejected
  after rotation; opening a newer link does not revive an old media ticket.
- Web media tests10passed; browser owner flow passed with mocked API and real
  Chromium. Production build passed. ESLint cannot run because this repository
  has no ESLint configuration; none installed or invented for this change.
- Native existing seven gate scripts:64PASS groups including7 sharing checks;
  actual Darwin SDK build passed. Device ShareLink/presentation is not proved
  by Linux fixtures; do not describe it as physically accepted.

Evidence: worktree `.local-proof/link-only-sharing/`, backend `.local-*.log`,
native `.planning/2026-11-15-link-only-sharing/private/` and `.build/*sharing*.log`.
PG schema names and fingerprints are synthetic test data, not production access.

## Rollout requires explicit approval

1. Take a fresh production database backup and verify restoration separately.
   Record deployed commits, service configuration and data fingerprints without
   emitting secrets or album invitation values. Preserve dirty local files.
2. Apply only the additive link_version migration before starting new code.
   Verify schema and unchanged old data. Do not backfill legacy manual grants
   as current visits: that would preserve the rejected permission mechanism.
3. Release the reviewed backend source, then the coherent web changes. Existing
   env/keys, Cloudinary privacy and upload-draft services remain configured.
   Confirm auth gates, raw public UUID denial and media headers. No production
   user impersonation, token minting or album mutation for smoke tests.
4. Install the prepared native build and have the owner test current links,
   private/public statistics, reset/revoke and another account. Existing links
   continue to be valid until explicitly reset/revoked; old remembered grants
   require re-entry through an actual link. Universal Links remain a separate step.

If deployment needs recovery, close media access with the established maintenance
procedure first. Rolling back to the old authorization code and reopening would
restore public-UUID/legacy grant access; do not present that as a privacy-preserving
rollback. Keep access closed until the reviewed policy is restored.
