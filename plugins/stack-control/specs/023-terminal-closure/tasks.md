# Tasks: Mechanical terminal closure of resolved backlog items

**Tests**: TDD mandatory — every behavior lands RED→GREEN.

- [X] T001 Add the `closes:` edge field to `grammars/roadmap.peg` + project `closes: readonly string[]` on `WorkItem` in `src/roadmap/roadmap-model.ts` (FR-001). RED: a node with `- closes: TASK-A, TASK-B` projects `closes=['TASK-A','TASK-B']`.
- [X] T002 Add `close(id)` to `BacklogBackend` in `src/backlog/backend.ts` — `backlog task edit <id> -s Done --plain`; non-zero exit → BacklogError (FR-006/FR-007). RED: shells the right args; throws on unknown id.
- [X] T003 Implement `roadmap close-related <item>` in `src/subcommands/roadmap.ts`: terminal-gate (FR-002), gather `closes:` ∪ `ref:` (FR-003), dry-run/`--apply` (FR-004), idempotent (FR-005), fail-loud per-id (FR-006). RED: CLI tests for the acceptance scenarios.
- [ ] T004 Run the targeted + umbrella vitest; then record `closes: TASK-136, TASK-19` on the 022 node and run `close-related --apply` to close them (the feature's first use in anger).
