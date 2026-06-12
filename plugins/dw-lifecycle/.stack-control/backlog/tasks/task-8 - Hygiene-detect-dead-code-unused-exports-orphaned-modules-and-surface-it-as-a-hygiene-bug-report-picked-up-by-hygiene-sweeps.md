---
id: TASK-8
title: >-
  Hygiene: detect dead code (unused exports / orphaned modules) and surface it
  as a hygiene bug report picked up by hygiene sweeps
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-419
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

Dead code (unused exports, orphaned modules, unreferenced files) is currently found **reactively and ad-hoc** — by manual grep, by `tsc` errors after a removal, or as a side effect of a cross-model audit-barrage. There is no hygiene sweep that **proactively detects dead code and surfaces it as a hygiene bug report** that the existing hygiene tooling picks up. Add one.

## Why (evidence this is a recurring, untracked pattern)

Dead code keeps getting caught one-at-a-time, after it's already shipped:

- One-off issues filed manually over time: #176 (`lightbox.ts::initLightbox` exported but never called), #264 (confirmed-dead longform body), #156 (init* never invoked at module load).
- This session alone (Phase 39 sites→lanes), five dead surfaces were found ad-hoc once a resolution flip orphaned them: `scaffold.ts`/`scaffoldBlogPost`, `resolveEntryFilePath`, `resolveShortformFilePath`, `resolveChannelsPath`, `body-state.ts` — and `body-state.ts` was only caught because the audit-barrage happened to flag the orphaned `PLACEHOLDER_MARKER` (AUDIT-20260604-01). Nothing systematically looks for "exported, zero consumers."

The existing hygiene surfaces cover adjacent concerns but **not** dead code:
- `check-clones` — duplication
- `check-anti-patterns` — registered legacy shapes
- `check-deprecations` — `@deprecated` files + their importers (deprecation, not deadness)
- `check-adopters` — files that *should* import a canonical primitive
- `debt-report` / `worktree-report` — issues / TBDs / parked branches / stale worktrees

None answer "which exports/files have zero references."

## Request

A hygiene sweep — e.g. `dw-lifecycle check-dead-code` (sibling of `check-clones`/`check-deprecations`), or a dead-code dimension folded into `debt-report` — that:

1. **Detects** unreferenced exports + orphaned/never-imported source files (e.g. via `ts-prune` / `knip` / a `tsc`-based unused-export pass), scoped to the project's `src/` with the usual gitignore + test-file handling.
2. **Surfaces each finding as a hygiene bug report** in the same channel the other sweeps use — the durable `audit-log.md` (so `promote-findings` can scope it into the workplan TDD-first) and/or the `debt-report` snapshot — rather than relying on a human noticing or a barrage incidentally flagging it.
3. Is **picked up by hygiene tooling sweeps** (the session-start advisory snapshot / `debt-report` / the implement-loop structural chain), so dead code becomes tracked the moment it appears, the same way clones/anti-patterns/holdouts already are.

## Notes / open design questions (capture, not scope)

- **Public-API exports** (package.json `exports` subpaths, the `index.ts` barrel) have "zero internal references" by design — the detector needs an allowlist / entry-point set so it doesn't flag every public export as dead (this is the classic `ts-prune`/`knip` entry-points config).
- **False-positive discipline:** mirror the clone-gate's disposition model — a dead-code finding an operator judges intentional (a deliberately-public helper) gets a `keep-with-reason`-style disposition so it doesn't re-fire every sweep.
- **`tsc` is the backstop, not the detector:** removing dead code still needs the build to prove nothing depended on it (this session's audit-grep miss — `grep -v paths.ts:` masking `scrapbook/paths.ts` — is exactly why a tool with an accurate reference graph beats grep).

## Provenance

Operator request 2026-06-04 after the Phase 39 sites→lanes session removed five dead surfaces by hand and the audit-barrage caught a sixth (AUDIT-20260604-01) reactively: "if dead code is found, we should surface it as a hygiene bug report that gets picked up by hygiene tooling sweeps."
<!-- SECTION:DESCRIPTION:END -->
