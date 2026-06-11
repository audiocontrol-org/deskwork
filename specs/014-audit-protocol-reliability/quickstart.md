# Quickstart Validation — Audit-Protocol Reliability (specs/014)

Per-story runnable validations. Prereqs: repo root `~/work/deskwork-work/stack-control`, suite runner `npx vitest run` from `plugins/stack-control/`, verbs via `plugins/stack-control/bin/stackctl`. Contracts: [contracts/cli-contracts.md](./contracts/cli-contracts.md); invariants: [data-model.md](./data-model.md).

**Suite baseline**: `npx vitest run` green (173 files / 1150 tests pre-feature) — every story adds RED-first tests and ends green.

- **US1**: run the barrage with a fixture fleet where one model yields zero bytes (unit: replay `ModelRunResult` fixtures through the summary/exit seam; integration: a stub CLI on PATH that sleeps past timeout). Expect: WARNING lines naming the model + lost-agreement consequence, exit 0 without floor, non-zero with `--require-models 2`. Healthy-fleet run: no degradation text.
- **US2**: in a tmp repo, write only `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml`; load barrage config (any barrage entry). Expect the three-line legacy WARNING. Repeat with both files (warning + active file wins) and with neither (silent).
- **US3**: feed lift the recorded-collapse fixture (two models, same file, five mechanisms). Expect five independently-closeable entries; a same-root-cause pair still merges with `cross-model`. Replay: `stackctl audit-barrage-lift --feature <fixture> --run-dir <fixture-run> --repo-root <tmp> --apply`.
- **US4**: construct an audit-log where dampener flips and a literal re-parse diverge (canonicalized ID variant). Dry-run prints N; apply migrates exactly N (statuses updated); a deliberately unlocatable flip fails loud naming the ID.
- **US5**: tmp repo with a feature root containing audit-log prose quoting a fake path + an unrelated feature's untracked scaffold. Build the implement payload. Expect: payload contains neither; feature's own untracked files ARE present; `audit_log_excerpt` block still threads.
- **US6**: fresh tmp installation, no `clones.yaml`. Run a complaint-driven `scope-widen … --manifest … --prd-path …`. Expect: seed announcement, exit 0, delta applied, state present afterward. (Today: hard abort — the RED case.)
- **US7**: `specs/NNN-slug` fixture: `scope-export` resolves the manifest; a widen writes EVIDENCE under the spec root (no `docs/` tree recreated); legacy fixture behaves byte-identically to today. Probe: every remaining `001-IN-PROGRESS` grep hit in `src/` (outside resolver + tests) is an error-message/comment string, not a path construction (research R7).
- **US8**: drop one malformed-frontmatter task file into a fixture store. `backlog list`: warning naming the file + healthy items, exit 0. `import-github` re-run against the store: loud `BacklogError` naming the file, exit 2, zero duplicates created.

**Feature-level close-out**: full suite green; per-story RED commits precede fixes (git log shows test-then-fix pairs); `stackctl spec-check --spec specs/014-audit-protocol-reliability` reports spec/plan/tasks all present before `/stack-control:execute`.
