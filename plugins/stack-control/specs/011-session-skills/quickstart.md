# Quickstart: session-skills validation

Runnable scenarios proving the feature end-to-end. Each maps to a user story / success criterion. All run from the `stackctl` CLI in a plain shell (no Claude Code surface — SC-007). Prerequisites: the plugin built/runnable via `tsx`; a tmp project with a `.stack-control/config.yaml` (an installation) and a git repo; the `backlog` store initialized (008 `filesystem_only` init).

> Commands below are illustrative of the contract, not copy-paste final syntax (flag names finalize in implementation).

## Scenario 1 — Fresh agent oriented at boot (US1, SC-001)

1. In a configured installation with a populated roadmap, an active spec partway through its chain, and a prior journal entry:
   ```
   stackctl session-start
   ```
2. **Expect**: a report naming (a) roadmap ready/next + blocked, (b) the active spec + its chain position + the next `/speckit-*` step, (c) the latest journal entry, (d) open **backlog** items, (e) the staleness line. **No GitHub-issue query.** The command prints and returns — no implementation action.

## Scenario 2 — Read-only invariant (SC-008)

1. `stackctl session-start` twice; capture a tree hash before/after.
2. **Expect**: byte-identical report; **0 on-disk changes**.

## Scenario 3 — No active spec / first session (FR-005)

1. Remove `.specify/feature.json` (or point it nowhere) and empty the journal; run `session-start`.
2. **Expect**: reports "no active spec" + "no prior journal entry" as clean signals (not errors); roadmap + backlog still reported.

## Scenario 4 — Close captures + commits + pushes (US2, SC-002)

1. After a session with ≥1 commit, with a local **bare** remote configured as `origin`:
   ```
   stackctl session-end
   ```
2. **Expect**: a journal entry appended at the configured `journal` path with auto-derived mechanical sections (commit count, files-changed, backlog items touched) + empty narrative slots; doc changes committed **and pushed** to the bare remote; a `SessionEndReport` listing what happened. Re-fetch the bare remote → the journal commit is present.

## Scenario 5 — Sparse-but-honest entry (FR-006)

1. Run `session-end` after a no-op session (no commits).
2. **Expect**: an entry is still written (sparse, honest), committed — not skipped.

## Scenario 6 — Progressed backlog, zero auto-transition (FR-009, SC-006)

1. Make a commit whose message references a backlog item id (e.g. `TASK-3`); run `session-end`.
2. **Expect**: `TASK-3` surfaced as a progressed item in the report; the backlog store shows **its status unchanged** (no auto-transition); no GitHub-issue call made.

## Scenario 7 — Branch-staleness advisory (US4, SC-005)

1. Set the branch behind its base (commit on the base after branching); run `session-start`.
2. **Expect**: advisory line naming the branch is behind (with count); the session still starts.
3. Bring the branch level; re-run → **no** staleness line.
4. Detach HEAD / remove upstream+default → **clean skip** with a note (no error).

## Scenario 8 — Decoupling: custom locations + fail-loud outside (US3, SC-003/SC-004)

1. Configure `journal`, `clone_scope` at non-default locations; run `session-start` + `session-end`.
2. **Expect**: every read/write lands at the configured location (0 hardcoded paths).
3. Run either verb from a dir inside **no** installation.
4. **Expect**: fail-loud naming the missing installation + directing to `stackctl setup` — **no** bundled-copy fallback.

## Scenario 9 — Monorepo isolation + override (US3, FR-015)

1. Two installations at distinct subtrees; run `session-start` inside one.
2. **Expect**: resolves the **nearest** installation; the sibling's files are untouched. Pass `--at <other>` → orients on the other (explicit override).

## Scenario 10 — CLI-first parity (US5, SC-007)

1. Run both verbs in a plain shell with no Claude Code session.
2. **Expect**: identical report/record to the skill path; the skills (`/stack-control:session-start`, `/stack-control:session-end`) merely delegate to these verbs.
