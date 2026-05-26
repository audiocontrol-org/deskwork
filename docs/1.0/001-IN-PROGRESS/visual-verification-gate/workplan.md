---
slug: visual-verification-gate
targetVersion: "1.0"
date: 2026-05-26
---

# Workplan: Visual Verification Gate

**Goal:** Canonicalize **two paired gates** in `dw-lifecycle` so UI work has structural support for both the start and the end of the loop: 1. **A "mockup-blessed" precondition gate** that institutionalizes mockup development and operator-approved design review BEFORE substantial UI implementation begins. Workplan tasks that touch user-facing surfaces don't pass `/dw-lifecycle:implement` readiness without a blessed mockup linked from the PRD. 2. **A "visual-verify" closure gate** that requires the implementing agent (or sub-agent) to capture the rendered output, `Read` the PNG back, compare against the blessed mockup, and deliver to the operator BEFORE claiming a task done. Enforced mechanically by a `Visual-verify:` commit-message marker validated at pre-commit time. The two gates work together. Without the precondition, "verify against the mockup" has no reference. Without the closure, "we made a mockup" doesn't survive implementation drift. This lives in `dw-lifecycle` (not per-repo) so every adopting project inherits the discipline. Per-project customization is allowed where it makes sense (capture tool wrapper, mockup directory naming, marker format details) but the default has teeth — adopters opt into laxer behavior explicitly, not by accident.

## Phase 1: [Phase 1 name]

**Deliverable:** [What works at the end of this phase.]

### Task 1: Initial implementation slice

- [ ] Step 1: **PRD template** — add Visual Contract section with placeholders for canonical mockup paths + page/route constraints.
- [ ] Step 2: **Workplan template** — add visual-verification acceptance criteria block to every per-task template; include both precondition (blessed mockup linked) and closure (post-fix PNG delivered, viewport coverage) criteria.
- [ ] Step 3: **`/dw-lifecycle:implement` skill** — add capture → Read → fix-if-broken → deliver step to the task loop. Skipped explicitly via `Visual-verify: skipped-<reason>` marker; substantive-reason validator runs at pre-commit, not in-skill.
- [ ] Step 4: **Agent-prompt fragment** — author `templates/agent-visual-verification-fragment.md` with Step 0 visual-verification requirements for sub-agents (mirrors install-agent-prompts pattern).
- [ ] Step 5: **`/dw-lifecycle:install-visual-verification-fragment` skill** — install fragment into repo-local `.claude/agents/*.md` files; mirrors the existing install-agent-prompts skill structure.
- [ ] Step 6: **`Visual-verify:` commit-message marker — canonical format** — define syntax + default validator (substantive-reason validator for `skipped-<reason>`; route-list parser for `<routes>`; PNG existence + mtime check for the route-list path).
- [ ] Step 7: **Pre-commit hook for `Visual-verify:` marker** — reject commits touching UI source without a marker, with stale PNGs, or with bullshit skipped-reasons. Installed by `/dw-lifecycle:install` (or a new opt-in skill — TBD during PRD iteration).
- [ ] Step 8: **`dw-lifecycle visual-capture` subcommand (day 1)** — Playwright-based; route + viewport enumeration; uniform PNG naming; configurable output dir.
- [ ] Step 9: **`.dw-lifecycle/visual-verify.config.json` schema** — adopter override surface for marker format, validator pattern, capture script path, mockup directory layout. Zod-validated.
- [ ] Step 10: **`/dw-lifecycle:doctor` rule — visual-verification-stale** — audit closed UI tasks for fresh PNG existence; opt-in `--fix`.
- [ ] Step 11: **Setup-skill enhancement** — when PRD's Visual Contract is non-empty, scaffold `docs/<v>/001-IN-PROGRESS/<feature>/mockups/` (TBD during PRD iteration whether opt-in or default).
- [ ] Step 12: **Implement-skill precondition check** — refuse to start UI-touching tasks when Visual Contract is empty (TBD during PRD iteration whether opt-in or default).
- [ ] Step 13: **Documentation** — README section + CHANGELOG entry explaining the new gates + the incident pattern they prevent + the customization surface.
- [ ] Step 14: **Smoke test** — local-only (per project's no-test-infra-in-CI rule); exercises the marker validator + capture subcommand against a fixture project.
- [ ] Step 15: **Cross-feature integration plan with graphical-entries** — TBD: simple mockups-as-files workflow ships day-1; upgrade path to graphical-entries-driven mockup review when graphical-entries lands. Captured as a known follow-up, not v1 scope.

**Acceptance Criteria:**
- [ ] PRD template carries a Visual Contract section
- [ ] Workplan template carries visual-verification acceptance criteria (precondition + closure) for UI-touching tasks
- [ ] `/dw-lifecycle:implement` skill includes the capture → Read → deliver loop
- [ ] Agent-prompt fragment + `/dw-lifecycle:install-visual-verification-fragment` skill exist; mirrors install-agent-prompts structure
- [ ] `Visual-verify:` commit-message marker is canonical (format + validator defaults ship with teeth)
- [ ] Pre-commit hook enforces the marker on UI-touching commits; opt-in skipped-reason validator rejects bullshit
- [ ] `dw-lifecycle visual-capture` subcommand ships day 1 (Playwright-based)
- [ ] Adopters can customize marker format, validator pattern, capture script, and mockup layout via `.dw-lifecycle/` overrides
- [ ] Doctor rule flags stale screenshots on closed UI tasks; opt-in `--fix` regenerates
- [ ] Adopter-facing docs (README + CHANGELOG) explain the gate + the incident it prevents
- [ ] Local smoke test exercises the marker validator + capture subcommand against a fixture project
- [ ] Cross-feature interaction with graphical-entries documented as a known follow-up (not blocking v1)
