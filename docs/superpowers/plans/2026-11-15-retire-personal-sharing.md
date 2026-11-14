# Retire personal sharing by username/email

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline implementation. Steps use checkbox syntax.

**Goal:** Remove the rejected username/email grant/list/revoke operations from the live API surface and web client wrapper in this local feature branch.

**Authorization:** User explicitly requested removal on15November2026. This task is independent of the pending public-album link policy. No production rollout, deletion of existing grant rows, or change to read authorization in this slice.

**Architecture:** Unregister the three obsolete personal-management endpoints; retain the existing internal SharedAccess records and with-me list for later link-generation binding. Do not hide a still-usable grant API behind UI changes.

**Files:** backend/routers/shared_access.py; backend/schemas.py (only obsolete request/response DTOs if no callers); frontend/src/api/index.js; backend/tests/test_link_access.py.

## Task1: Prove old manual operations are still active
- [x] Seed owner, recipient, album and an existing internal record in isolated in-memory SQLite.
- [x] Request the old grant, list and revoke endpoints as the owner; expect404 and unchanged records. Run new tests before implementation and observe RED200/201.

## Task2: Retire the old surface
- [x] Remove only POST share, GET shares, DELETE shares/{access_id} handlers and their unused imports/DTOs.
- [x] Remove their unused web API wrappers; preserve sharedWithMe and all existing link wrappers.
- [x] Run focused test to GREEN; check JavaScript syntax.

## Task3: Verify and record
- [x] Run nearest backend suite against test SQLite with Cloudinary disabled, preserve pre-existing failures separately.
- [x] Record exact diff/verification and remaining link-policy boundary. Do not deploy or claim complete link revocation from this partial slice.

## Result

Baseline113passed; new tests first failed201/200/200 on the old surface, then3passed after removal. Full suite116passed in96.17seconds. node --check frontend/src/api/index.js and git diff --check passed. No provider/network/production calls.

This slice removes personal-management API operations and unused web wrappers only. Existing records and read permissions are unchanged. Full link reset/revoke semantics and native flow remain pending the user's public-album policy answer; this branch must not be deployed as a completed stage8.
