---
id: TASK-18
title: >-
  graphical-entries: server-side preset path
  (.deskwork/personal/<operator-id>/focus-presets.json) — Phase 6 enhancement
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-382
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

Phase 5 Task 5.5.2 of the `graphical-entries` feature shipped operator-named focus presets via per-browser localStorage. The originally-specified `.deskwork/personal/<operator-id>/focus-presets.json` server-side path was deferred to Phase 6 enhancements without a tracked issue — flagged by AUDIT-20260530-52 as an untracked-deferral pattern.

This issue tracks the deferred server-side path so the workplan line can reference a concrete issue link instead of a vague "deferred to Phase 6 enhancements" note.

## Current state (Phase 5)

- Presets stored at `${STORAGE_KEY_PREFIX}${projectKey}:focus-presets` in per-browser localStorage.
- Deep-link via `?preset=<id>` works **only in the originating browser** (AUDIT-20260530-47 already flagged this as a UX gap; Task 0.23 added a visible "preset not found" affordance + commit-body note acknowledging the per-browser-id design choice).
- Architectural per-browser-id question is operator-level (do we want cross-browser/cross-device shareability?).

## Originally-specified shape

`.deskwork/personal/<operator-id>/focus-presets.json` — server-side JSON file per operator, stored under the project's `.deskwork/personal/` directory. This would enable:
- Preset sync across browsers/devices for the same operator.
- Preset deep-link URLs that resolve everywhere the project is checked out.
- Operator-authored presets shareable via git (if `.deskwork/personal/` is committed) or via copy/paste.

## Open questions for the operator

1. **Storage location.** `.deskwork/personal/<operator-id>/` is the originally-specified shape, but `.deskwork/` is project-shared. Where should "personal" state live?
   - Option A: project tree (`.deskwork/personal/<id>/`) — committed-when-operator-wants; collaborator visibility depends on .gitignore.
   - Option B: user-home (`~/.deskwork/personal/<project-key>/`) — never committed; always local.
   - Option C: hybrid — sync only when operator explicitly opts in via `--share`.
2. **Operator ID source.** Where does `<operator-id>` come from? `git config user.email`? `os.userInfo().username`? `whoami`? A `.deskwork/config.json` field?
3. **Conflict resolution.** Two operators editing presets concurrently — last-writer-wins, merge, refuse-on-conflict?
4. **Deep-link semantics.** Does a URL with `?preset=<id>` look up server-side first, fall back to localStorage? Vice-versa? Same-browser-only as today?
5. **Migration.** Existing per-browser presets — auto-migrate to server on first read, or stay separate, or operator-triggered import?

## Acceptance criteria (when this issue is implemented)

- [ ] Operator can save a preset that persists across browsers/devices (server-side JSON file is the source of truth).
- [ ] `?preset=<id>` deep-link resolves the server-side path first, falls back to localStorage if not found.
- [ ] Preset save-failure semantics match the localStorage path (AUDIT-44 boolean contract — see `dashboard-swimlane-presets-save-failure.test.ts`).
- [ ] Operator can opt in to cross-browser sync via a per-project `.deskwork/config.json` flag (`presetSync: 'localStorage' | 'server' | 'hybrid'`); default preserves Phase 5 localStorage behavior so no surprise sync.
- [ ] Documentation update at `docs/studio-design/ACCEPTED/2026-05-27-multi-lane-dashboard-d3-press-bay/brief.md` reflects the chosen scheme.

## Related

- Phase 5 Task 5.5.2 workplan line at `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md:1661`.
- Audit finding: `docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md` AUDIT-20260530-52 (cross-model: AUDIT-BARRAGE-codex-P5-3).
- Sibling: AUDIT-20260530-47 (Task 0.23) — per-browser id scheme architectural concern.
- Project rule: `.claude/rules/agent-discipline.md` § "Just for now is bullshit" — every deferral needs a tracked issue.

## Out of scope

- Implementing this in the current `graphical-entries` feature cycle (this is a Phase 6 enhancement per the original deferral).
- Multi-operator collaboration features beyond preset sync (presence indicators, real-time updates, etc.).
- Cloud-hosted storage backends (anything beyond the local server-side file path).
<!-- SECTION:DESCRIPTION:END -->
