# Production media transition plan

**Goal:** Execute the explicitly approved transition of existing Pickmatch media without losing database records or files.
**Spec:** `docs/private-media-transition.md`; approved by user after backup, protected conversion, deployment and temporary upload pause were explained. Local real-provider acceptance is recorded in `docs/private-media-staging.md`.
**Architecture:** Existing Render API/Supabase database/Vercel frontend and Cloudinary environment; no new hosting resources. Temporary API maintenance flag quiesces all application writes while health stays available. Existing photo UUID URLs survive storage ID changes. Private manifests/backups remain ignored locally.

## Targets and constraints

- Render `pickmatch-api`, srv-d8jeuc58nd3s73ehehd0, pickmatch-v5 branch, backend root, free native Python service.
- Vercel `pickmatch`, prj_n1OZgdzFgNZpcGQEVMRD9P6joetW, team_hfMq9TLAwFo34N0WEfPv3O2s, frontend root, same production branch.
- Both providers deploy on branch pushes. Do not push until a coordinated maintenance release is ready. Selectively commit only this change; preserve unrelated user deletions/untracked directories.
- Supabase17.6 session pooler; encrypted connection with verified hostname and official Supabase CA. PostgreSQL18 client tools already installed.
- Initial inventory:21 users,10 albums,125 Photo rows,0 PendingUpload rows. Preserve votes/comments/notifications and avatar resources. No new accounts/email.
- Confirm actual Cloudinary references/duplicates/avatars before renaming. Back up first. Never overwrite destination assets or republish protected files as upload during recovery.

## Work

1. Establish provider access, exact targets and read-only inventory. Keep API tokens/DB credentials private. Vercel scoped token may return404 for /v2/user while correctly allowing this project; judge project access directly.
2. Create a custom-format public-schema pg_dump with no-owner/no-acl; restore into a password-protected disposable loopback Postgres cluster and compare every application table count. Take a fresh final snapshot again after maintenance begins.
3. Add `MEDIA_MAINTENANCE` to existing main.py security middleware/lifespan: all routes except /api/health return503/no-store/Retry-After before dependencies; suppress pending cleanup. Health reports maintenance only when enabled. Tests must fail before implementation, then pass.
4. Create a resumable conversion operator only after inventory is understood. Persist planned destination IDs and original asset IDs before remote calls. Group duplicate references. Verify source provenance, rename upload→authenticated with invalidate/overwriteFalse, prepare exact eager image variants, verify delivery, then conditionally update related DB rows. Resume must handle a successful remote rename followed by process failure. Fail closed on conflicting/missing resources.
5. Test conversion with fake storage/local DB for conflicts, interruption/resume and duplicate grouping. Provider rename rehearsal already passed16 checks on new disposable PNG/WebM; old URLs404, stable asset_id, unchanged video hash.
6. Run full affected suites and fresh read-only review. Fix material findings with reproducing tests before publishing.
7. Save Render maintenance=true and deploy the reviewed commit; coordinate frontend from the same source. Confirm live deploy ID/commit, health maintenance=true, application503, and old writers drained. Then final backup/inventory and additive schema migration.
8. Convert only inventoried referenced Cloudinary resources. Check old original/derived URLs after CDN invalidation and protected variants; retain maintenance until checks pass. Record each manifest stage so failures can resume without destructive rollback.
9. Deploy/verify compatible frontend and clear maintenance with a deploy of the same backend commit. Confirm live provider states, public/private media, closed raw routes and no leaked origin signatures. Restore original auto-deploy configuration if changed.
10. Deliver measured results, backup/manifest locations, user tests and any pending CDN/mobile/load acceptance. Stop the disposable restore cluster after use; retain backup files.

## Review focus

- Maintenance prevents DB/Cloudinary activity before credentials/dependencies and does not lose health readiness.
- Schema is ready before opening new application paths; all writes are quiesced before final backup/conversion.
- Retry cannot overwrite an unrelated Cloudinary asset or update DB to a missing origin; duplicate references move together, avatars remain unchanged.
- Backup truly restores; local restore commands cannot target production.
- Explicit commit/deploy identity and terminal provider states; API secrets never appear in argv/output, logs, Git or public URLs.

## Evidence

- Provider access verified; production CA obtained from the exact certificate URL in official Supabase Studio source, without disabling TLS verification.
- Preliminary custom-format backup created and pg_restore listing validated. Full local restoration pending.
- Maintenance tests observed2 failures, then2 passed after minimal middleware/lifespan change.
