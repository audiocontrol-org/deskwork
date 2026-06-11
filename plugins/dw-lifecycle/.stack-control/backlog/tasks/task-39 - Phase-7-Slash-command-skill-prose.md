---
id: TASK-39
title: 'Phase 7: Slash command skill prose'
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-280
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Deliverable:** SKILL.md + commands/<name>.md files for each of the ~18 new + 5 updated `/dw-lifecycle:*` skills.

### Task 1: New skill prose (18 skills)

- [ ] For each new skill (scope-inventory, scope-widen, scope-summary, check-clones, check-anti-patterns, check-deprecations, check-adopters, check-editor-symmetry, check-refactor-preconditions, dispose-clone, refresh-clones-baseline, install-scope-discovery, install-scope-discovery-hooks, install-agent-prompts, uninstall-scope-discovery-hooks, migrate-from-pilot, validate-scope-discovery, scope-export):
  - [ ] `plugins/dw-lifecycle/skills/<name>/SKILL.md` with operator-facing flow
  - [ ] `plugins/dw-lifecycle/commands/<name>.md` command file

### Task 2: Updated skill prose (5 skills)

- [ ] `/dw-lifecycle:define` — document auto-scope-inventory + `--no-scope-inventory`
- [ ] `/dw-lifecycle:implement` — document auto-scope-widen + dispatch-wrapper engagement + `--no-scope-widen`
- [ ] `/dw-lifecycle:review` — document auto-clone-detector + `--no-clone-check`
- [ ] `/dw-lifecycle:doctor` — document new doctor rules
- [ ] `/dw-lifecycle:customize` — document `scope-discovery <name>` category

**Acceptance Criteria:**
- [ ] All ~23 skills discoverable via slash-command picker
- [ ] Existing skills' auto-invocation documented + opt-out flags surfaced

Part of #273.
<!-- SECTION:DESCRIPTION:END -->
