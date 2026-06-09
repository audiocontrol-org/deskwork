# Tasks: Backlog slush-pile surface

**Feature**: `specs/008-backlog-surface/` · **Branch**: `feature/stack-control`
**Inputs**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/backlog-cli.md](./contracts/backlog-cli.md), [quickstart.md](./quickstart.md)

**Test policy**: Test-First is NON-NEGOTIABLE (Constitution Principle I). Every implementation task is preceded by a RED test seen failing for the right reason. Integration tests spawn the **real** `backlog` binary against tmp-dir fixtures (testing rule: never mock the filesystem; exercise the adapter + verb boundary). The GitHub import injects the issue-list JSON (no network) and uses the real `backlog` binary for writes.

**Conventions**: `[P]` = parallelizable (different files, no dependency on an incomplete task). `[US#]` = user-story phase task. Paths are under `plugins/stack-control/` unless noted.

## Phase 1: Setup

- [X] T001 [P] Add `backlog.md` as a pinned dependency in `plugins/stack-control/package.json` and `npm install` so the `backlog` binary resolves under the plugin (verified hands-on at 1.46.0; pin the exact version)
- [X] T002 [P] Create `plugins/stack-control/backlog/config.yml` (committed) — `filesystem_only: true` (backlog performs no git ops of its own — we commit, hooks intact), default statuses, and a `task_prefix`
- [X] T003 [P] Create `plugins/stack-control/tests/backlog/fixtures/` — a committed sample audit-log.md carrying ≥2 `acknowledged-slush-pile-<date>` MEDIUM/LOW entries (+ a HIGH that must never migrate) for the slush backfill/migration tests, and a sample injected GitHub issue-list JSON (including one issue whose body contains `#`)
- [X] T004 [P] Create `plugins/stack-control/tests/backlog/helpers.ts` mirroring `tests/inbox/helpers.ts` — FIXTURES path, a `tmpBacklog()` that initializes an isolated tmp backlog dir via the real binary (a committed-config copy; `init` is interactive + git-requiring, so a hand-authored `filesystem_only` config is the deterministic equivalent verified hands-on), and a `runCli` (spawnSync) helper

## Phase 2: Foundational (blocks US1–US4 — the external-backend adapter + verb shell)

- [X] T005 RED: `tests/backlog/backend.test.ts` — the typed adapter against the **real** `backlog` binary: a missing binary throws a descriptive error naming the dependency + remediation (no fallback, Principle V); a non-zero backend exit surfaces stderr and throws; `create` returns the parsed new item id; `list` returns the items; `exists(ref)` reports presence (for idempotency)
- [X] T006 Implement `src/backlog/backend.ts` — thin typed adapter via `spawnSync`; typed `create`/`list`/`exists` ops. WRITES shell out to the real binary (`task create --plain`, id parsed from the `Task <ID> -` line); READS parse the YAML-frontmatter task files (the durable artifact — `backlog task list --plain` and `search` expose neither refs nor labels, which idempotency + the `type:` label both need). throw-on-missing-binary + throw-on-non-zero-exit. Make T005 green
- [X] T007 RED: `tests/backlog/verb-backlog.test.ts` — the `backlog` verb dispatcher shell: unknown subaction → exit 2; unknown flag → exit 2; a required flag missing its value → exit 2 with a descriptive message; subactions route (read-only `list` pulled forward, mirroring inbox — no stub handler)
- [X] T008 Implement the `backlog` verb dispatcher shell in `src/subcommands/backlog.ts` (subaction routing, flag validation à la `roadmap`/`inbox`, exit 0/2, catch adapter errors → exit 2 with remediation) and register `backlog: runBacklogCli` in `src/cli.ts` `SUBCOMMANDS`. Make T007 green. (Backlog root = `STACKCTL_BACKLOG_DIR` env ?? plugin root, mirroring inbox's bundled-default + test-seam; `runCli` extended with an optional `env`.)

## Phase 3: User Story 1 — Capture found work in one move (Priority: P1) 🎯 MVP

**Goal**: one-move capture of a found bug/gap into the pile; capture ≠ scope; roadmap + siblings untouched.
**Independent test**: capture a bug with type + ref; the item exists with the project label; `ROADMAP.md` and pre-existing items are byte-for-byte unchanged.

- [X] T009 [P] [US1] RED: `tests/backlog/mappings.test.ts` (capture half) — `typeLabelStamp(input)` maps `bug`/`gap` → the `type:<v>` label + the `agent-found` label (backlog.md has no native type field); rejects an unknown type
- [X] T010 [US1] Implement `src/backlog/mappings.ts` `typeLabelStamp` (+ `isCaptureType`/`CAPTURE_TYPES`/`PROJECT_LABEL`). Make T009 (capture half) green
- [X] T011 [US1] RED: capture cases in `tests/backlog/capture.test.ts` (via `runCli` + real binary) — `backlog capture "<title>" --type bug --ref <url>` → exit 0 + item present with type/label/ref; empty `<title>` → exit 2 + nothing written; invalid `--type` → exit 2; a plain capture applies **no priority/triage** (capture ≠ scope, FR-003); **`ROADMAP.md` unchanged**; capturing a 2nd item leaves the 1st byte-identical (FR-006)
- [X] T012 [US1] Wire the `capture` subaction into `src/subcommands/backlog.ts` (positional `<title>`; flags `--type`/`--ref`/`--body`; stamp via `typeLabelStamp`; create via the adapter). Make T011 green
- [X] T013 [US1] Checkpoint: ran quickstart Scenario 1 live via `bin/stackctl` against a scratch backlog dir — capture exit 0 + id; empty-title/invalid-type refused exit 2 with descriptive messages; `ROADMAP.md` byte-unchanged

## Phase 4: User Story 2 — See the pile without polluting the roadmap (Priority: P2)

**Goal**: review the captured items as a tier distinct from the roadmap; triage/inspection delegated to native commands.
**Independent test**: after captures, `list` reports every item read-only and writes nothing.

- [X] T014 [US2] RED: `list` cases in `tests/backlog/verb-backlog.test.ts` — `backlog list` prints each item's id + status + type and writes nothing; the listing reports only backlog items, never `ROADMAP.md` entries (tier distinct, FR-008); no-backlog-project → exit 2 (list reads frontmatter, so the failure mode is a missing project marker, not a shell-out non-zero)
- [X] T015 [US2] Implement the read-only `list` subaction in `src/subcommands/backlog.ts` (via the adapter). Make T014 green. (Implemented in T008 — `list` pulled into the foundational layer like inbox; T014 adds the US2-specific tier-distinct + writes-nothing coverage.)
- [X] T016 [US2] Checkpoint: ran quickstart Scenario 2 live — `stackctl backlog list` is the read-only tier; native `backlog task <id> --plain`/`board`/`cleanup` work as the delegated triage path against a stackctl-created pile (not re-wrapped, Principle VIII)

## Phase 5: User Story 3 — Seed the pile from open GitHub issues (Priority: P2)

**Goal**: one-time, idempotent snapshot import of open GitHub issues; GitHub unmutated.
**Independent test**: dry-run reports the set + writes nothing; apply creates one backlinked item per issue; re-run creates zero duplicates; GitHub unchanged.

- [X] T017 [P] [US3] RED: `tests/backlog/import-github.test.ts` — dry-run writes nothing + reports the would-import set; apply creates one `imported-issue` item per injected issue with `ref=gh-<number>` + carried labels + body; an issue body containing `#` imports cleanly (FR-015); re-run skips existing `gh-NNN` (zero duplicates, FR-012); a missing/unauthenticated `gh` path → exit 2 with remediation; the injected GitHub source is never written (FR-010)
- [X] T018 [US3] Implement `src/backlog/github-import.ts` — `importGithub` (injected issues + adapter; idempotent skip by `gh-NNN`) + `parseIssues` (defensively typed) + `readGhIssues` (read-only `gh issue list --json …`, fail-loud); pure-tsx via spawnSync argv (no shell pipeline) so `#`/markdown bodies are safe
- [X] T019 [US3] Wire the `import-github` subaction into `src/subcommands/backlog.ts` (dry-run default; `--apply`; `STACKCTL_GH_ISSUES_FILE`/`STACKCTL_GH_BIN` test seams). Make T017 green
- [X] T020 [US3] Checkpoint: ran quickstart Scenario 3 live — real-`gh` dry-run reported "would import 136 issue(s)" and wrote nothing; injected-fixture apply/idempotent-re-run/`#`-body/GitHub-unmutated all green; missing `gh` → exit 2 with remediation

## Phase 6: User Story 4 — Route audit-barrage residuals into the same pile (Priority: P3)

**Goal**: dampener-parked MEDIUM/LOW findings become backlog items; audit-log records a migrated disposition; HIGHs never slushed; `--burn-down` removed.
**Independent test**: backfill existing parked entries → migrated-finding items + `migrated-to-backlog` dispositions; ongoing `slush-findings` routes to the backlog; HIGHs untouched.

- [X] T021 [P] [US4] RED: `tests/backlog/mappings.test.ts` (severity half) — `severityToPriority(MEDIUM|LOW)` maps to backlog priority; a HIGH reaching the mapping throws (HIGH is excluded upstream; fail-loud if it ever arrives)
- [X] T022 [US4] Implement `severityToPriority` in `src/backlog/mappings.ts`. Make T021 (severity half) green
- [X] T023 [US4] RED: `tests/backlog/import-slush.test.ts` — backfill reads the fixture audit-log, creates one `migrated-finding` item per `acknowledged-slush-pile-*` entry (priority from severity, provenance = feature slug + finding id, ref → audit-log entry); the audit-log entry is rewritten to `migrated-to-backlog <task-id>`; the non-slush portion of the audit-log is byte-unchanged (FR-025); idempotent (already-migrated entries skipped); HIGH entries are never migrated
- [X] T024 [US4] Implement the `import-slush` subaction in `src/subcommands/backlog.ts` + a `src/backlog/slush-migrate.ts` helper (find parked entries, create items via the adapter, rewrite the disposition with the existing atomic-write util). Make T023 green. (Backlog root extracted to `src/backlog/root.ts`; `STACKCTL_AUDIT_LOG_FILE` test seam.)
- [X] T025 [US4] RED: rewire assertions in `tests/backlog/slush-findings-rewire.test.ts` — a parked flip's destination is a backlog item + a `migrated-to-backlog` audit-log disposition (NOT `acknowledged-slush-pile-<date>`); HIGHs are still never slushed (unchanged); `--burn-down` is rejected as an unknown flag (removed)
- [X] T026 [US4] Rewire `src/subcommands/slush-findings.ts` — flip destination → backlog (reuse the `slush-migrate.ts` helper + the adapter); record `migrated-to-backlog` in the audit-log instead of the parked status; remove `--burn-down` + the `burnDownSlush` wiring. Leave the dampener DECISION (`src/scope-discovery/promote-findings/slush-remaining.ts`) UNCHANGED. Make T025 green. (Updated the in-use govern-orchestration + spec-governance slush tests to the new disposition + isolated their backlog destination so no test writes the committed pile.)
- [X] T027 [US4] Checkpoint: ran quickstart Scenario 4 live — backfill dry-run/apply migrated 2 parked findings to `migrated-to-backlog TASK-1/2`, HIGH (AUDIT-20260608-03) stayed open, items surface as `migrated-finding`; `--burn-down` rejected (removed); audit-log left a clean open/fixed ledger

## Phase 7: Polish & Cross-Cutting

- [ ] T028 [P] File-size + strict-typing audit: every new module ≤ 500 lines; `tsc --noEmit` strict clean; no `any`/`as`/`@ts-ignore` in new src
- [ ] T029 [P] Author `plugins/stack-control/skills/backlog/SKILL.md` — the `/stack-control:backlog` touch point: when to capture (a bug/gap found mid-work), the **capture ≠ scope** discipline, and the verb surface (capture/list/import-github/import-slush; triage delegated to native `board`/`show`/`cleanup`)
- [ ] T030 [P] Document `stackctl backlog` in the plugin README (verb rows + an "Intake: three sources, one pile" section; note the `slush-findings` rewire + `--burn-down` removal)
- [ ] T031 Full quickstart run-through (all 4 scenarios end-to-end against scratch dirs) + full `vitest` suite green + session-end clone-snapshot. **DRY**: review NEW duplication against the adapter/verb plumbing; extract any shared verb flag-scan/require into the existing `document-verb-shared.ts` (or a sibling) per the 007 precedent, or JUSTIFY a residual clone

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational adapter+shell)** blocks everything.
- **US1 (P1)** depends on Phase 2. **MVP = Phase 1 + Phase 2 + US1.**
- **US2 (P2)** and **US3 (P2)** each depend only on Phase 2 + the verb shell; independent of each other.
- **US4 (P3)** depends on Phase 2 + the `import-slush`/`slush-migrate` helper; the `slush-findings` rewire (T025/T026) depends on the adapter and the migrate helper.
- **Phase 7 (Polish)** last.

## Parallel Opportunities

- Setup: T001–T004 all `[P]`.
- Cross-story RED tests: T017 (US3) and T021 (US4 mapping) are `[P]` once Phase 2 lands.
- Polish: T028–T030 `[P]`.

## MVP Scope

Phase 1 + Phase 2 + **US1 (capture)** = a working one-move slush-pile capture. US2/US3/US4 layer additional review + intake sources onto the same pile.
