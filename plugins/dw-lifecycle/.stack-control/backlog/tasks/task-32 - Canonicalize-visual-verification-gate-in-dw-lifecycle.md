---
id: TASK-32
title: Canonicalize visual-verification gate in dw-lifecycle
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-314
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

Canonicalize a **visual-verification gate** in `dw-lifecycle` so UI work cannot be marked complete without the agent capturing the rendered output, reading the PNG back, and delivering it to the operator — before claiming DONE, before committing, before moving to the next task.

Tests verify DOM structure; only screenshots verify pixels. Sub-agents that satisfy structural test gates can ship broken chrome (invented box styling, collapsed grids, contrast holes) and the operator finds out at next review — by which point follow-on work has compounded on the broken base. The discipline that breaks this loop is **capture → Read → fix-if-broken → only then claim done**, and it needs to live in templates / skills / agent prompts, not just in operator memory.

## The incident this proposal generalises

`audiocontrol-org/audiocontrol` feature branch `feature/akai-harmonization` — Phase 4 visual-fidelity review (commits `885b2d61` → `7d141ea3`).

Sequence:

1. Operator reviewed live `/akai/s3000xl/editor/programs` and reported the chrome bore "only a bizarro-world relationship to our mockups." Sliders had label/readout overlap, sections rendered flat-stacked instead of behind `<AcRadioTabs>`, identity readouts rendered in fake input-box chrome.
2. Controller filed 4 audit findings (AUDIT-20260525-24..27), dispatched sub-agents per finding. Each sub-agent reported DONE with green test gates (43 UI tests + 33 editor-core UI + 4 roland UI all passed).
3. Controller delivered post-fix screenshot to operator → operator rejected: "no — there's still a lot of broken stuff … haphazard vertical alignment … many drop-down controls that still need to be converted to toggles … you have a lot more work to do."
4. Investigation revealed `.ac-compact-field--readout > .ac-field-readout` had been given `padding + border + background + border-radius` — invented box chrome that nothing in the mockup HTML asked for. A prior sub-agent had reasoned "readouts probably need chrome" and added it; tests asserted `<span class="ac-field-readout">` existed, which it did, so tests passed. The operator's eye caught what the test suite couldn't.
5. Operator's verbatim diagnosis: *"the columnar alignment isn't a problem. the elements in a row don't line up. I suspect you aren't using a sane layout strategy and are instead hard coding values that should be maintained by the layout manager. Why is the implementation so broken when the mockup isn't? Are you making shit up and offroading?"*
6. The fix loop that finally produced clean output: direct hand-edit (no sub-agent), build, run `tools/visual-fidelity/capture.mjs`, `Read` the captured PNG, fix the first broken render (`.ac-app-shell--single` modifier that doesn't exist), capture again, deliver.

The lesson the operator named, post-incident: *"five concrete things changed: (1) direct work over delegation for small/focused changes; (2) visual capture as part of the 'done' gate, not the post-mortem; (3) read actual code instead of speculating; (4) mockup HTML treated as literal contract; (5) tight see-edit-see iteration on small units."*

## Proposed canonical changes to dw-lifecycle

### 1. PRD template — new "Visual contract" section (mandatory for user-facing features)

Add to `templates/prd.md` after "Solution" and before "Acceptance Criteria":

```markdown
## Visual Contract

**Canonical mockups:** [list paths to HTML+CSS mockup files that are the literal visual spec for this feature]

**Rule:** implementation CSS for any class `.ac-foo` used in both the mockup and the implementation MUST render the same chrome. The implementation may not declare a property (border, padding, background, etc.) on `.ac-foo` that is not visually present in the mockup's rendering of `.ac-foo`. "It probably should look like X" is not a justification — the mockup is the spec.

**Pages/routes that must match:**

- [list each page + the mockup file that constrains it]
```

Drives the per-task acceptance criteria below.

### 2. Workplan template — per-task visual-verification acceptance criteria

Add to `templates/workplan.md` under every Task that touches UI source:

```markdown
**Visual-verification acceptance criteria** (required for UI-touching tasks):

- [ ] Live screenshot captured at desktop AND mobile viewports after the final commit of this task
- [ ] Screenshot delivered to operator (e.g., via `SendUserFile` in Claude Code, or attached to a PR comment, or linked from this task)
- [ ] Visual delta from the canonical mockup is zero OR documented + operator-accepted in this task's audit-log closure
- [ ] If the task's final commit touched any shared design primitive (e.g., editor-core CSS), screenshots captured for every consumer page, not just the page that drove the change
```

The phase gate becomes: "every page touched this phase has a current screenshot delivered after the phase's final commit."

### 3. `/dw-lifecycle:implement` skill — capture-and-deliver step at end of every task loop

Add a step to `skills/implement/SKILL.md` between the existing "commit at task boundary" and "repeat":

```markdown
5. **Visual verification gate** (UI-touching tasks only):
   - Identify the live route(s) the task affected.
   - Run the project's visual-capture tool (e.g., `tools/visual-fidelity/capture.mjs` or equivalent) for each affected route.
   - Read the captured PNG back. If the rendered chrome diverges from the mockup, the task is NOT done — fix and re-capture before claiming complete.
   - Deliver the post-fix PNG to the operator (`SendUserFile` or PR-comment attachment).
   - Only then mark the task's checkboxes done and commit.

   Skip this step ONLY for tasks that genuinely touch no UI source (pure backend, pure tooling, pure docs). For those tasks, the commit message MUST carry `Visual-verify: skipped-<substantive-reason>` per the gate below.
```

### 4. New agent-prompt fragment — visual-verification-fragment.md

Mirror the existing `install-agent-prompts` pattern (refactor-precondition Step 0 fragment). Create `templates/scope-discovery/agent-visual-verification-fragment.md` and a new `/dw-lifecycle:install-visual-verification-fragment` skill that appends it to repo-local `.claude/agents/*.md` files.

Fragment content (sketch):

```markdown
## Step 0 — Visual verification (UI-touching dispatches only)

If the dispatch brief touches any file under `modules/*/src/**/*.{tsx,jsx,css,scss}` OR any design token / shared primitive, the sub-agent MUST:

1. After implementing the code change, run the project's visual-capture tool (typically `tools/visual-fidelity/capture.mjs` or the equivalent named in the controller's brief).
2. Use the `Read` tool on each captured PNG and visually verify the rendered chrome matches the brief's stated mockup.
3. If chrome diverges (invented styling, broken layout, missing pill toggles, etc.), iterate — do NOT report DONE.
4. Reporting DONE without having captured + Read the PNG is a violation of the controller-IS-the-gate discipline.

The brief MUST name the routes to capture. Sub-agent's DONE report MUST include the path(s) to the captured PNGs.

The controller, after receiving DONE, independently re-runs the capture + Reads the PNG before accepting the dispatch.
```

### 5. Optional: dw-lifecycle helper subcommand for capture coordination

`dw-lifecycle visual-capture --routes <comma-separated-list> --output <dir>` — wraps a Playwright script (or detects an existing repo-local script) and produces uniformly-named PNGs. Lets the skill above reference a canonical command instead of a per-repo path.

Not load-bearing — repo-local scripts work fine — but reduces friction.

### 6. Doctor rule — `visual-verification-stale`

Mirror `agent-prompt-mirror-drift`. The doctor checks: for every workplan task marked `- [x]` whose acceptance criteria include "visual screenshot captured," does a matching PNG exist with mtime > the task's closing-commit SHA? If not, flag.

## What I'm doing in the host repo while waiting for the canonical change

Filing a parallel local-only enforcement: a pre-commit gate that requires `Visual-verify: <pages>` or `Visual-verify: skipped-<substantive-reason>` in any commit message that touches `modules/*/src/**/*.{tsx,jsx,css,scss}`. Substantive-reason validator mirrors the existing AUDIT-20 `substantive_reason` pattern (>=40 chars, no gaming phrases). This is **not** proposed for upstream — the marker format is opinionated and the validator pattern is repo-specific. If the upstream canonical lands a different (better) mechanism, I'll retire the local gate.

## Why this lives in dw-lifecycle, not just per-repo

The capture-and-verify loop is a project-management discipline, not a per-tech-stack concern. Same shape applies to any project that:
- has a visual spec the implementation must match
- uses sub-agents that can pass structural tests while shipping broken chrome
- has an operator who'd rather catch broken pixels at task-boundary than at next-review

dw-lifecycle is the right home: it already owns the templates / skills / gates that codify "what 'done' means" for features.

## Acceptance criteria for this feature request

- [ ] `templates/prd.md` carries a Visual Contract section
- [ ] `templates/workplan.md` carries visual-verification acceptance criteria for UI-touching tasks
- [ ] `skills/implement/SKILL.md` adds the capture-and-deliver step
- [ ] `templates/scope-discovery/agent-visual-verification-fragment.md` + `/dw-lifecycle:install-visual-verification-fragment` skill (or equivalent)
- [ ] `/dw-lifecycle:doctor` rule for stale screenshots (optional, second-pass)
- [ ] Documentation in README or CHANGELOG explaining the new gate + the incident pattern it prevents

## Cross-references

- Incident: `audiocontrol-org/audiocontrol` `feature/akai-harmonization` commits `885b2d61` → `7d141ea3`
- Companion local gate (host-repo only): `Visual-verify` commit-message pre-commit gate (separate work, not proposed for upstream)
- Existing related dw-lifecycle pattern: `install-agent-prompts` (the refactor-precondition Step 0 fragment that this proposal mirrors structurally)
<!-- SECTION:DESCRIPTION:END -->
