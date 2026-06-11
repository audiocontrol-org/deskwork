---
id: TASK-40
title: 'Phase 6: CLI subcommands'
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-279
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Deliverable:** All ~20 new CLI verbs land in `plugins/dw-lifecycle/src/subcommands/` + registered in `cli.ts`.

### Task 1: Inventory + widen + summary commands

- [ ] `scope-inventory <slug>`
- [ ] `scope-widen "<complaint>"`
- [ ] `scope-summary [--surface <glob>]`

### Task 2: Check-* gate commands

- [ ] `check-clones [--gate-mode]`
- [ ] `check-anti-patterns [--gate-mode]`
- [ ] `check-deprecations [--write]`
- [ ] `check-adopters [--gate-mode]`
- [ ] `check-editor-symmetry [--write]`
- [ ] `check-refactor-preconditions [--gate-mode]`

### Task 3: Disposition + baseline commands

- [ ] `dispose-clone <id> --as <refactor|keep-with-reason|ignore-with-justification> [args]` — refuses without Step 0a/0b flags on refactor disposition
- [ ] `refresh-clones-baseline`

### Task 4: Install / migrate / uninstall commands

- [ ] `install-scope-discovery`
- [ ] `install-scope-discovery-hooks`
- [ ] `install-agent-prompts`
- [ ] `migrate-from-pilot` (audiocontrol-specific)
- [ ] `uninstall-scope-discovery-hooks`

### Task 5: Validator + export commands

- [ ] `validate-scope-discovery` — runs all adversarial harnesses
- [ ] `scope-export [--json]`

**Acceptance Criteria:**
- [ ] All ~20 CLI verbs invokable via `dw-lifecycle <verb>` + via skill prose
- [ ] `--gate-mode` flag on check-* commands exits non-zero on violations
- [ ] `--json` flag on summary/export commands emits structured output

Part of #273.
<!-- SECTION:DESCRIPTION:END -->
