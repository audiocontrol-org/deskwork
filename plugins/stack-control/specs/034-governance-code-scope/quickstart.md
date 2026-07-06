# Quickstart: Governance Code Scope

Runnable validation that implement-mode governance audits code and excludes documentation. Prerequisites: the stack-control installation (`plugins/stack-control`), `npm install` done, source engine `./bin/stackctl`.

## Scenario 1 — Default policy excludes documentation, keeps code (SC-001, SC-003)

1. On a feature branch, make a committed diff that touches both code and docs, e.g. edit `src/foo.ts`, `docs/PRD.md`, and `skills/x/SKILL.md`.
2. Run implement-mode governance: `./bin/stackctl govern --mode implement --item <roadmap-item>`.
3. **Expected**: the assembled audit payload contains `src/foo.ts` and `skills/x/SKILL.md` (SKILL.md is code) and does **not** contain `docs/PRD.md`. The run prints a concise line: `code-only scoping active — excluded N documentation file(s)`.

*Unit-level proof (faster):* `npm --workspace-equivalent` vitest — `code-scope.test.ts` asserts C2/C3/C4 from the contract (drop `.md`, keep `SKILL.md`, keep root `CLAUDE.md`, drop root `README.md`).

## Scenario 2 — Toggle off restores today's behavior (SC-004)

1. Add to `.stack-control/config.yaml`:
   ```yaml
   govern:
     code_only: false
   ```
2. Run govern as above.
3. **Expected**: the payload is byte-identical to pre-feature behavior — documentation is included; `applyCodeScope` was an identity no-op. Verified by `code-scope-config.test.ts` (identity when inactive) and `code-scope-integration.test.ts`.

## Scenario 3 — Operator tunes the boundary (FR-008, US2)

1. Rescue a markdown fixture used as test data:
   ```yaml
   govern:
     code_scope:
       include: ["**/SKILL.md", "**/WORKFLOW.md", "**/.claude/rules/**/*.md", "**/CLAUDE.md", "CLAUDE.md", "**/AGENTS.md", "AGENTS.md", "test/fixtures/**/*.md"]
   ```
2. **Expected**: a changed `test/fixtures/foo.md` survives the default `.md` exclusion (include wins; supplied list replaces the default include). Verified by `code-scope-config.test.ts` (lists-replace + include-wins).
3. Malformed check: set `code_scope: { exclude: "not-an-array" }` → govern **throws** naming `code_scope.exclude` (does not silently default). Verified by C7.

## Scenario 4 — Documentation-only change graduates cleanly (SC-005, US3)

1. Make a committed diff touching only `docs/*.md` / `spec.md` (no runtime files).
2. Run govern.
3. **Expected**: instead of the empty-scope FATAL, the run reports `nothing to govern — no code in scope (documentation-only change); success`, and the item may graduate. Verified by `code-scope-empty.test.ts`.

## Scenario 5 — Code-only lens omits doc-drift (SC-006)

1. With `code_only` active (default), inspect the rendered implement-mode audit lens (unit: `code-scope-lens.test.ts`).
2. **Expected**: the lens contains no "documentation drift" instruction. With `code_only: false`, the lens contains the original doc-drift bullet.

## What proves the feature

- All `src/__tests__/govern/code-scope*.test.ts` pass (RED-first, then green) — the deterministic floor.
- `npx vitest` green; `tsc --noEmit` clean.
- The five scenarios above observed on a live govern run against a mixed / docs-only / toggled diff.

See [contracts/code-scope.md](./contracts/code-scope.md) for the behavioral contract table and [data-model.md](./data-model.md) for the types.

## Live validation evidence (T019 — step-4 whole-feature govern, 2026-07-05)

`/stack-control:execute` step-4 governance (`stackctl govern --mode implement`) was run
over this feature's own real diff (merge-base `main`..HEAD — mixed `.ts` code + `.md` docs).
Observed live, on the real payload:

- **Code-only scoping active (SC-001, SC-007):** `govern: code-only scoping active — excluded
  13 documentation file(s) from the audit payload.` — the concise summary fired with the count
  and "code-only scoping active", **no per-file path list**; the barrage audited only the `.ts`
  code (spec/plan/tasks/research/data-model/quickstart/contracts/design-record/journal `.md`
  files were excluded).
- **Fleet:** configured 2, produced 2 (`codex`, `claude`), both enforced + monitored.
- **Round 1:** 1 HIGH finding (AUDIT-20260705-01 — empty-scope success could graduate
  over-broad-exclude code unaudited). Fixed TDD-first (T023 RED → T024 fix: the
  `emptiedByDocumentationOnly` guard). Re-govern confirmed it was **not re-raised**.
- **Round 2:** 1 HIGH finding (AUDIT-20260705-02 — package-lock/deps). Verified **false
  positive** (single-model; `picomatch` correctly in the workspace lockfile entry; `npm ci
  --dry-run` succeeds). Dispositioned via operator-confirmed `GOVERN_OVERRIDE`.
- **Outcome:** `terminal-outcome=graduated`; convergence record written with `override: true`.

The identity (`code_only: false`, SC-004) and docs-only success (SC-005) behaviors are proven
on the deterministic test floor (`code-scope-toggle.test.ts`, `code-scope-empty.test.ts`) —
per the audit-barrage-is-stochastic-defense-in-depth rule, a wasteful live barrage purely to
re-show a decidable behavior is avoided.
