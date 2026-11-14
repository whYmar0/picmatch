# Link-only invitations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, task by task. Steps use checkbox syntax.

**Goal:** Both album types require a current author link; reset/revoke invalidate old access; private stats remain owner-only; native users can share/manage/open invitations.
**Architecture:** Existing invite_code/is_active define one generation. Nullable SharedAccess.link_version stores SHA256 of the visited generation; owner bypass plus one shared ACL protects album resources. Existing share_token URLs alias the same generation and cannot override privacy. Native uses existing session guards and gallery; site is updated alongside permission changes.
**Tech Stack:** FastAPI/SQLAlchemy, SQLite+PostgreSQL; React/SwiftUI/Swift6; iOS26.0 minimum/SDK27.2/xtool1.24.0. No new dependencies.
**Spec:** docs/superpowers/specs/2026-11-15-link-only-sharing-design.md; latest user statements15November2026 authorize this corrected behavior.

## Global Constraints
- Worktree feat/link-only-sharing. Base90187e0; previous approved retirement committed79da9ff. Preserve original dirty checkout.
- No merge/push/production schema changes/deploy; local tests only. Native source archive before edits because native directory is not Git.
- Never grant by username/email. Past votes/comments and legacy unversioned rows are not access credentials.
- Guest link preview retained; authenticated actions require current-link visit. Private stats forbidden to all non-owners, including old analytics-token visitors.
- Existing short media tickets must not revive after rotation plus a new visit. Check every new Range/HEAD.
- Existing records retained; additive nullable migration, idempotent and verified locally; no raw token/email/provider URLs in logs.

## Review Focus
- Concurrent old visit and rotation: same Album row lock, stale generation cannot grant current access (Task1).
- Old video ticket after rotation/new-link visit must still fail; owner playback persists (Task1).
- Private stats via legacy /share or old can_view_stats=True never exposed; privacy flip invalidates stats rights immediately (Task2).
- Guest media URL copied before reset must fail after reset/revoke, including HEAD/Range; ID-only public media must fail (Task1).
- Session changes during native fetch/mutation cannot expose previous owner's forms/metadata; first sheet opening must have content (Task4).

## Task 1: Versioned ACL, owner link controls, protected media
**Files:** backend/album_access.py(new), media_access.py, routers/media.py, routers/albums.py (invite), routers/invitations.py(new), main.py, models.py, schemas.py, migrate_link_access.py(new); tests/test_link_access.py, test_media_access.py.
**Interfaces:** link_version(album)->str; has_album_access(album,user,db)->bool; require_album_access(...,code=None)->None; remember_link_visit(album,user,db)->None; invitation_state(album)->InvitationOut. GET/POST/DELETE albums/{id}/invitation and POST rotate, owner-only row lock. Legacy link handlers join inTask2. media_url accepts optional invite; ticket issuer/verifier receives album and binds participant version.
- [ ] Write new matrix/rotation/revoke/reactivation/media-ticket/guest Range tests; run focused tests before implementation. Expected: RED on unguarded public media/missing owner controls.
- [ ] Implement nullable link_version model + migration with introspection (no swallowed DDL errors), central ACL and remembered visits. Use Album row lock for visit and mutation. Add owner controls; reset invalidates both code and legacy token; read-only GET never reactivates.
- [ ] Implement invite entry, guest media URLs and ACL on media/access/raw/HEAD/Range. All authenticated media access uses short tickets. Owner tickets remain valid across invitation rotation; participant tickets bind generation.
- [ ] Update old media fixtures/assertions to approved new semantics (valid visit vs legacy row). Run focused tests and local migration twice on SQLite. Expected: GREEN. Commit Task1.

## Task 2: Close all alternate album access and statistics paths
**Files:** routers/share_links.py, albums.py, votes.py, comments.py, shared_access.py, notifications.py if it exposes protected new content; tests/test_link_access.py, test_analytics.py, test_comments.py and affected security fixtures.
**Interfaces:** All album-resource routes use central ACL. _build_analytics clamps can_view_stats to owner or is_public after ACL. Legacy share link visit remembers canonical generation under same lock; old owner share-token operations never reactivate revoked invitations and rotate both aliases.
- [ ] Add failing tests across analytics/comments/thread/likes/votes/my-votes and old records; private /share withtrue stats bit and public-to-private transition. Expected: RED on old participation and stats bypasses.
- [ ] Replace alternate SharedAccess/participation/public bypasses with central gate; preserve per-thread visibility, author-only mutations and response contracts. Filter with-me by active current version, compute stats permission from privacy. No data deletion.
- [ ] Align existing fixtures with explicit link visits where access is intended; assert outsiders denied. Run full backend suite with Cloudinary disabled. Expected: all GREEN; record count. Commit Task2.

## Task 3: Keep the web client coherent with link controls
**Files:** frontend/src/api/index.js, components/ShareModal.jsx, AnalyticsShareSheet.jsx (share a small common sheet if it reduces duplication); utils/mediaAccess.js only if actual query handling needs change; tests/media-access.test.mjs; components/pages visibility fixes only as required by new rules.
- [ ] Add meaningful frontend media tests for guest invite preservation, signed access for public albums, expiry and revoked errors. Expected: failures first where behavior changes.
- [ ] Wire read-only link state and explicit create/reset/revoke in owner share forms; confirmations and visible revoked state. Retain /vote and /share links, guest preview and existing media isolation. Never silently reactivate when opening a sheet.
- [ ] Run web media tests, JavaScript syntax/lint scoped to touched files and production build using existing installed modules. Expected: GREEN. Commit Task3.

## Task 4: Native link sharing/opening and common gallery
**Files (native ../.. /pickmatch_swift):** new AlbumInvitation.swift, SharingClient.swift, AlbumSharingModel.swift, AlbumSharingView.swift, AlbumDetailModel.swift; modify AlbumClient.swift, AlbumListModel.swift, SessionModel.swift, AlbumListView.swift, AlbumGalleryView.swift, MediaViewer.swift, AuthView.swift; tests/SharingChecks.swift, sharing_fixture_server.py, scripts/check-sharing.sh and impacted standalone script lists.
**Interfaces:** AlbumInvitation parser accepts only production HTTPS /vote/code or /share/token; no arbitrary origin or redirects. SharingClient extends guarded AuthClient transport. SessionModel owns authenticated revision checks, second list and API wrappers. AlbumDetailModel owns one selected foreign/own snapshot; viewer uses same detail model. Sharing form model is Identifiable and created on explicit open, not rendering. Owner operations matchInvitationOut.
- [ ] Archive native Sources/Tests/scripts/Package+README baseline; write parser/client/model/session fixture tests. Expected: RED before implementation.
- [ ] Implement typed link parsing, owner read/create/reset/revoke, open both supported link shapes, independent shared list and common detail loading. Do not add foreign albums to own list, persist link codes or expose token. Confirm destructive actions and reconcile uncertain mutation via read-only status.
- [ ] Integrate item-sheets and typed navigation including existing creation handoff. Resource403/404 clears detail/viewer/cache; network error preserves permitted snapshot. All account transitions invalidate new states.
- [ ] Run new sharing checks, all existing six Swift scripts and SDK build. Expected: GREEN; actual iPhone presentation/ShareLink remains acceptance, no fake UI proof. Save exact source diff/archive.

## Task 5: Final whole-change proof and delivery
**Files:** docs/native-sharing.md/README native, docs/link-access-rollout.md backend; proof ledger.
- [ ] Verify migration twice on separate local PostgreSQL and content preservation; no production credentials/calls. Exercise concurrent visit/rotation if local PG available, otherwise disclose pending proof rather than claim it.
- [ ] One fresh read-only review of the whole backend/web/native change against spec; one pass fixes material findings through RED/GREEN and affected gates, no review loop.
- [ ] Verify IPA ZIP/bundle/ARM64 device/minimum26/unsigned, record real test results. Provide concise two-account device checklist and separate production rollout boundary. No knowingly unavailable production tests: local/staging API and eventual rollout require explicit instruction.
- [ ] Commit backend/web/docs in isolated branch; preserve native archives and reviewed diff. Do not merge/push/deploy. Report what requires actual iPhone/local-to-phone backend availability.
