---
id: TASK-38
title: 'Phase 8: Install / migrate / uninstall machinery'
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-281
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Deliverable:** Install skills functional end-to-end against fixture projects + audiocontrol-specific migration.

### Task 1: install-scope-discovery

- [ ] Bootstrap `.dw-lifecycle/scope-discovery/` config dir; copy README + LAYOUT.md + refactor-preconditions-checklist.md templates from plugin
- [ ] Refuse if already present (idempotent re-run reports + no-op)

### Task 2: install-scope-discovery-hooks

- [ ] Detect `.githooks/pre-commit` presence; offer `--merge` / `--replace` / `--force`
- [ ] Detect Husky in `package.json`; register hook if present
- [ ] Write `hooks-installed.json` with provenance

### Task 3: install-agent-prompts

- [ ] Detect `.claude/agents/{code-reviewer,codebase-auditor}.md` presence; offer `--merge` / `--force`
- [ ] Write Step 0 §verification sections generated from canonical fragment
- [ ] Record in `hooks-installed.json`

### Task 4: migrate-from-pilot (audiocontrol-specific)

- [ ] Reads audiocontrol's existing `tools/scope-discovery/` + `docs/scope-discovery/`
- [ ] Copies CONFIG verbatim to `.dw-lifecycle/scope-discovery/`
- [ ] Diffs CODE against plugin defaults per file
- [ ] Produces per-file contribute-back-vs-customize-override report

### Task 5: uninstall-scope-discovery-hooks

- [ ] Reads `hooks-installed.json`; drift-checks each installed file
- [ ] Removes files; removes manifest entries
- [ ] `--force-uninstall` overrides drift refusal

**Acceptance Criteria:**
- [ ] Greenfield install creates correct dir structure + schema files
- [ ] Hook install works with absent/existing/Husky variants
- [ ] Agent-prompt install works without trampling existing `.claude/agents/` content
- [ ] migrate-from-pilot runs cleanly against audiocontrol's actual state

Part of #273.
<!-- SECTION:DESCRIPTION:END -->
