---
id: TASK-33
title: 'scope-discovery: clone-detector tests flake under full-suite parallel load'
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - bug
dependencies: []
references:
  - gh-297
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Background

Three clone-detector vitest scenarios flake intermittently under full-suite parallel load (vitest's default thread pool). All three pass deterministically when run in isolation or with the clone-detector path filter (`vitest run clone-detector`).

## Affected tests

- `src/__tests__/scope-discovery/clone-detector.batch-dispose.test.ts` — "--diff mode: NEW group cites batch-dispose with the actual id"
- `src/__tests__/scope-discovery/clone-detector.error.test.ts` — "gutted-stub self-check rejects logic-free implementation (harness has teeth)"
- `src/__tests__/scope-discovery/clone-detector.polish.test.ts` — "prints NEW group members + summary; omits default-mode headlines"

## Repro

```bash
npm --workspace @deskwork/plugin-dw-lifecycle run test   # 3 fail intermittently
npm --workspace @deskwork/plugin-dw-lifecycle run test -- clone-detector   # 10/10 pass
```

Full-suite failure flagged across Phase 4, Phase 6, Phase 9, and Phase 10 implementer reports during the scope-discovery feature port. Not a regression introduced by any single commit; emerged once the test count grew past ~700 and the jscpd subprocess concurrency contended with sibling subprocesses.

## Root cause hypothesis

`jscpd-runner.ts` spawns `npx jscpd` as a subprocess that does CPU-intensive token scanning and writes to a tmpdir report file. Under heavy parallel test load, subprocess exit-code or report-file-readiness races appear (the tests assert specific stdout patterns that depend on the subprocess completing in a stable order).

## Suggested fixes (smallest first)

1. **Mark the 3 scenarios `.sequential`** in vitest — runs them serially within their file while the rest of the suite stays parallel.
2. **Pin `clone-detector.*.test.ts` files to a single worker** via vitest config (`pool: 'forks'` + `poolOptions.forks.singleFork: true` on a per-file basis).
3. **Add retry logic** (`test.retry(2)`) — masks the symptom; less principled.

## Disposition for v1 ship

Filing now; deferring fix. The protocol's correctness is unaffected — tests pass in isolation; the flake is purely a test-infrastructure concurrency artifact. The scope-discovery v1 dogfood gate is whether the protocol catches real issues during graphical-entries implementation, not whether the test suite is flake-free.

Parent: #273
<!-- SECTION:DESCRIPTION:END -->
