# Quickstart: Backlog slush-pile surface

Runnable validation scenarios that prove the feature end-to-end. Run from the repo root. The bin is `plugins/stack-control/bin/stackctl`. The `backlog` binary (npm `backlog.md`, pinned in the plugin) must be installed. Use a throwaway `backlog/` tree (a tmp dir initialized for backlog.md) so the real working tree is untouched. See [contracts/backlog-cli.md](./contracts/backlog-cli.md) and [data-model.md](./data-model.md).

> Setup: a scratch backlog dir (`tests/backlog/fixtures/*` or a tmp dir) and, for the GitHub scenario, an authenticated `gh`.

## Scenario 1 — Capture found work in one move (US1; SC-001, SC-002)

1. **Capture** a bug in one move:
   `stackctl backlog capture "doctor validate exceeds line cap" --type bug --ref "https://github.com/audiocontrol-org/deskwork/issues/395"`
   - **Expect**: exit 0, prints the created item id; the item carries `type=bug`, the `agent-found` label, and the ref; `stackctl backlog list` shows it. No triage/priority applied.
2. **Roadmap & siblings untouched** (SC-002):
   - **Expect**: `ROADMAP.md` is byte-for-byte unchanged; any previously captured items are unchanged (capture one more, re-check).
3. **Fail-loud on bad input**:
   `stackctl backlog capture "" --type bug` → exit 2, descriptive error, nothing written.
   `stackctl backlog capture "x" --type nonsense` → exit 2.

## Scenario 2 — See the pile without polluting the roadmap (US2)

1. `stackctl backlog list` — **Expect**: exit 0; each captured item with id + status + type; writes nothing.
2. Native triage/inspection (delegated, not re-wrapped): `backlog board`, `backlog show <id>`, `backlog cleanup`.
   - **Expect**: the slush pile is reviewable as a tier distinct from `ROADMAP.md`.

## Scenario 3 — Seed the pile from open GitHub issues (US3; SC-003, SC-004)

1. **Dry-run** the import:
   `stackctl backlog import-github`
   - **Expect**: exit 0; reports one would-import line per currently-open issue; **writes nothing**; GitHub unchanged.
2. **Apply**:
   `stackctl backlog import-github --apply`
   - **Expect**: exit 0; one item per open issue, each `type=imported-issue`, `ref=gh-<number>`, labels carried; an issue with `#` in its body imports cleanly (FR-015).
3. **Idempotency** (SC-003):
   `stackctl backlog import-github --apply` (again)
   - **Expect**: exit 0; zero duplicates created (already-present `gh-NNN` skipped).
4. **GitHub unmutated** (SC-004): the issues remain open, unlabeled-by-us, uncommented.
5. **Fail-loud**: with `gh` absent/unauthenticated → exit 2 with remediation (no empty-success).

## Scenario 4 — Route audit-barrage residuals into the pile (US4; SC-005, SC-006)

1. **Backfill** existing parked entries:
   `stackctl backlog import-slush --feature 008-backlog-surface` (dry-run) then `--apply`
   - **Expect**: each `acknowledged-slush-pile-*` audit-log entry → a `migrated-finding` item (severity→priority, audit-log ref); the audit-log entry now records `migrated-to-backlog <task-id>` (SC-006). Re-run = zero duplicates.
2. **Ongoing routing** via the rewired `slush-findings` (dampener engaged, HIGH-quiet):
   `stackctl slush-findings --feature <slug> --apply`
   - **Expect**: parked MEDIUM/LOW findings become backlog items (not an `acknowledged-slush-pile` status); HIGHs are never slushed (SC-005); the audit-log stays a clean open/fixed ledger.
   - **Expect**: `--burn-down` no longer exists (removed; the backlog is the burn-down queue).

## Regression guard

- Full suite green: `npx vitest run` in the plugin — including the new `tests/backlog/*` RED-first tests (real-binary integration) and the rewired `slush-findings` tests; the slush DECISION tests (`slush-remaining`) stay green unchanged.
- `tsc --noEmit` strict clean; no `any`/`as`/`@ts-ignore`; new modules ≤ 500 lines.
- Session-end clone snapshot reviewed for any NEW duplication introduced by the adapter/import code.
