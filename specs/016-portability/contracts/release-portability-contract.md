# Contract: Portable Release and Update Behavior

## Purpose

Preserve the current monorepo lockstep release semantics while moving release
orchestration behind a host-neutral surface.

## Release Invariants

1. One monorepo release updates all shipped plugins/packages in lockstep.
2. One shared version line is applied across shipped artifacts.
3. One release tag/event is the source of truth for distributed artifacts.
4. Verification remains atomic with the release event.

## Distribution Rules

1. Claude marketplace distribution is one channel consuming the shared release.
2. Codex install/update is another channel consuming the same shared release.
3. No host may receive a separate version stream for the same logical release.

## Portability Rules

1. Rehosting release orchestration MUST NOT change atomic release semantics.
2. Host adapters MAY wrap or present release steps differently, but the
   underlying release behavior remains shared.
3. Release/update failures MUST fail loudly without silently publishing a
   partial host-specific outcome.
