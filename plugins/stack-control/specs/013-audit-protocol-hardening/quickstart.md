# Quickstart / Validation: Audit-Protocol Hardening — Layout-Aware Resolution

Runnable scenarios proving US1 + US2 end-to-end. Prerequisites: the stack-control workspace built/runnable (`tsx`), Vitest available.

## Scenario A — US1: governance resolves a `specs/NNN-slug` feature (the unblock)

The blocker today: the gate cannot find a spec-structured feature's audit-log.

1. Ensure `specs/013-audit-protocol-hardening/` exists with an `audit-log.md` (after this feature lands, US2 will scaffold it; for the resolver test a fixture tree suffices).
2. Resolve the feature by slug:
   - **Unit**: `feature-root.test.ts` asserts `resolveFeatureRoot({ repoRoot, slug: 'audit-protocol-hardening' })` → `root` ends with `specs/013-audit-protocol-hardening`, `layout: 'speckit'`.
   - **Integration**: invoke the gate path for that feature and assert it reaches the audit-log (not the `:128-130` "audit-log not found" FATAL).
3. **Expected**: resolution succeeds with no manual path flag (SC-001).

## Scenario B — US1 regression: legacy `docs/` features unchanged

1. Run the existing `feature-root.test.ts` suite, including `'picks lex-greatest, NOT semver-greatest, when they diverge'`.
2. **Expected**: green — `docs/<version>/001-IN-PROGRESS/<slug>/` resolution and the lex-greatest contract are unchanged (SC-002).

## Scenario C — US1: deterministic precedence + fail-loud

1. Fixture with the slug under BOTH layouts → assert the `speckit` root wins, deterministically (SC: AS-3).
2. Fixture with the slug under NEITHER → assert a fail-loud error naming both searched layouts (SC-004); no fallback, no `undefined`-deref.

## Scenario D — US2: first-barrage scaffold

1. Fixture feature root with NO `audit-log.md` + a populated run-dir.
2. Run `audit-barrage-lift` against it.
3. **Expected**: `audit-log.md` is created with the canonical header (`# Audit log — <slug>`), the run section is appended, findings land — no `return 2` abort (SC-003). Re-running against the same explicit run-dir still lands (FR-008).

## What "done" looks like

- `npx vitest` green, including the new RED-turned-GREEN cases for A/C/D and the preserved B.
- `grep -rn "001-IN-PROGRESS" plugins/stack-control/src --include='*.ts' | grep -v feature-root.ts | grep -v __tests__` shows no audit-log/governance consumer constructing the path outside the helper (SC-005); any remaining hits are the scope-discovery follow-on (research D5), tracked in the backlog.
