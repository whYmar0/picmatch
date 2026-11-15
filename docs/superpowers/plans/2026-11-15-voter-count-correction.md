# Owner album-list voter count correction

User approved additive backend correction after native stage9 acceptance feedback.
Production deployment requires separate approval; none performed by this change.

Implemented: AlbumOut.unique_voters nullable nonnegative integer. Existing owner
GET /api/albums/my computes COUNT(DISTINCT Vote.voter_id) alongside unchanged
COUNT(Vote.id) in the same grouped query. Empty own albums return0. Other album
payloads leave the optional field null; private/shared statistics do not expand.
No table/model/environment/dependency changes or migrations.

Regression test failed with missing unique_voters before implementation, then
passed for two people/four photo votes, repeated vote, zero voters and owner
isolation/private invitation/shared payload. Focused analytics5passed; full
isolated backend132passed107.42s. Cloudinary/production accounts not used.

Native counterpart: optional uniqueVoters decode; «Проголосовало: N» for owned
albums only. Old server unknown count stays hidden, never mapped from total_votes.
Includes single typed gallery fullscreen destination to fix voting reopening as
MediaViewer. Native source is outside this Git worktree; its source archives and
IPA evidence live in pickmatch_swift/.planning/2026-11-15-voting-followup/.

Rollout: release this exact reviewed backend commit with existing service/env,
verify health/OpenAPI optional-field contract and guest auth denial. No migration
or production-user impersonation. iPhone installation verifies actual modal
reopening and people count. Web source remains compatible without a new UI build.
