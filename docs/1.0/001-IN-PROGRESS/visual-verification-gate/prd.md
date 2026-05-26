---
slug: visual-verification-gate
title: Visual Verification Gate
targetVersion: "1.0"
date: 2026-05-26
parentIssue:
deskwork:
  id: 52aa00c1-3391-470a-bb88-797bdf9d8007
---

# PRD: Visual Verification Gate

## Problem Statement

Structural tests verify DOM shape but not appearance. The operator's eye is the only check on rendered pixels. Sub-agents that satisfy structural test gates can ship broken chrome (invented box styling, collapsed grids, contrast holes, missing pill toggles, slider rows with overlapping labels and readouts) and the operator only catches it at next review — by which point follow-on work has compounded on the broken base. The empirical failure that motivates this: the audiocontrol `feature/akai-harmonization` Phase 4 visual-fidelity review (2026-05-25, commits `885b2d61` → `7d141ea3`). A controller dispatched 4 sub-agents; each reported DONE; 43 + 33 + 4 UI tests all passed; the operator received a post-fix screenshot and rejected it verbatim: *"no — there's still a lot of broken stuff … haphazard vertical alignment … many drop-down controls that still need to be converted to toggles … you have a lot more work to do."* Investigation found `.ac-compact-field--readout > .ac-field-readout` had been given invented `padding + border + background + border-radius` chrome that the mockup HTML didn't ask for. A prior sub-agent had reasoned "readouts probably need chrome" and added it; tests asserted the `<span class="ac-field-readout">` existed, which it did, so tests passed. The operator's eye caught what the test suite couldn't. There are two distinct holes that produce this failure pattern, both of which need closing: 1. **No "done" gate on rendered pixels.** Implementation claims done based on structural tests + sub-agent DONE reports. Nobody Reads the rendered PNG. Invented CSS / wrong modifiers / collapsed grids ship as the new default. 2. **No "ready to start" gate on a blessed mockup.** Substantial UI work begins without a literal visual spec to match. Sub-agents (and the controller) invent visuals from intuition because nothing tells them what the right answer looks like. Once an invention ships, it becomes "the way that page looks" and every follow-on commit drifts further from any coherent visual language. The operator's named lesson from the incident: *"five concrete things changed: (1) direct work over delegation for small/focused changes; (2) visual capture as part of the 'done' gate, not the post-mortem; (3) read actual code instead of speculating; (4) mockup HTML treated as literal contract; (5) tight see-edit-see iteration on small units."*

## Solution

Canonicalize **two paired gates** in `dw-lifecycle` so UI work has structural support for both the start and the end of the loop:

1. **A "mockup-blessed" precondition gate** that institutionalizes mockup development and operator-approved design review BEFORE substantial UI implementation begins. Operationalized in `/dw-lifecycle:implement` as a hard refusal-and-interview cycle:
   - When `/dw-lifecycle:implement` encounters a UI-touching task whose PRD's Visual Contract section names no blessed mockup, the implement skill REFUSES to start the task AND automatically engages the operator in a structured interview to develop a mockup.
   - The interview's output is fed to `/frontend-design`, which produces 2–3 design options based on the operator's answers. The operator selects (or amends + reselects) until a chosen direction emerges.
   - The chosen mockup is committed under the feature's `mockups/` directory. Only when the operator explicitly approves the mockup (via the PRD's Visual Contract section gaining the mockup path AND an approval marker — exact form TBD during PRD iteration) is the orchestrating agent allowed to proceed with implementation of production UI code.
   - This is not advisory — it's a mechanical block. "Implement now and design later" is the failure mode this gate prevents.

2. **A "visual-verify" closure gate** that requires the implementing agent (or sub-agent) to capture the rendered output, `Read` the PNG back, compare against the blessed mockup, and deliver to the operator BEFORE claiming a task done. Enforced mechanically by a `Visual-verify:` commit-message marker validated at pre-commit time.

The two gates work together. Without the precondition, "verify against the mockup" has no reference — the implementation matches nothing because nothing was decided. Without the closure, "we made a mockup" doesn't survive implementation drift — the implementation drifts away from the chosen direction unobserved.

This lives in `dw-lifecycle` (not per-repo) so every adopting project inherits the discipline. Per-project customization is allowed where it makes sense (capture tool wrapper, mockup directory naming, marker format details, interview-prompt phrasing) but the default has teeth — adopters opt into laxer behavior explicitly, not by accident.

## Acceptance Criteria

- [ ] PRD template carries a Visual Contract section with explicit mockup-path slots AND an operator-approval marker
- [ ] Workplan template carries visual-verification acceptance criteria (precondition + closure) for UI-touching tasks
- [ ] `/dw-lifecycle:implement` skill includes the capture → Read → deliver closure loop
- [ ] `/dw-lifecycle:implement` skill includes the **precondition cycle**: detects UI-touching tasks lacking a blessed mockup, refuses to start, AND auto-engages the operator in a structured interview that drives a `/frontend-design` invocation, iterates options with the operator, and only proceeds after the operator marks the chosen mockup as approved in the PRD's Visual Contract
- [ ] Workplan template names the per-task mockup precondition explicitly (path to the approved mockup, operator-approval signal) — separate from the closure criteria
- [ ] Agent-prompt fragment + `/dw-lifecycle:install-visual-verification-fragment` skill exist; mirrors install-agent-prompts structure
- [ ] `Visual-verify:` commit-message marker is canonical (format + validator defaults ship with teeth)
- [ ] Pre-commit hook enforces the marker on UI-touching commits; opt-in skipped-reason validator rejects bullshit
- [ ] `dw-lifecycle visual-capture` subcommand ships day 1 (Playwright-based)
- [ ] Adopters can customize marker format, validator pattern, capture script, and mockup layout via `.dw-lifecycle/` overrides
- [ ] Doctor rule flags stale screenshots on closed UI tasks; opt-in `--fix` regenerates
- [ ] Adopter-facing docs (README + CHANGELOG) explain the gate + the incident it prevents
- [ ] Local smoke test exercises the marker validator + capture subcommand against a fixture project
- [ ] Cross-feature interaction with graphical-entries documented as a known follow-up (not blocking v1)

## Out of Scope

- The audiocontrol host-repo `Visual-verify` pre-commit gate stays repo-local until the canonical version lands; the host can then retire its local gate. Migration of audiocontrol's local gate is THAT repo's concern, not deskwork's.
- Specific Playwright versioning / browser pinning beyond what the day-1 helper needs. The capture tool ships with sensible defaults; advanced multi-browser matrices are not in v1.
- Visual diffing (pixel-by-pixel comparison) is NOT in v1. The "Read the PNG" step is operator/agent-eye-driven, not automated pixel diff. Pixel diff is a candidate for a later phase.
- Per-route visual-regression baselines (a la Percy / Chromatic). The Visual-verify gate verifies "the rendered output matches the mockup I'm holding right now," not "the rendered output matches a stored baseline from last week."
- Mobile-vs-desktop viewport-class enforcement beyond what the existing `.claude/rules/ui-verification.md` rule already names. The verify gate names viewports as part of `<routes>` (e.g., `Visual-verify: programs-desktop, programs-mobile`); enforcement of "BOTH viewports captured" is a workplan-template criterion, not a hook-side rule.

## Technical Approach

**Two-gate model.** The "precondition gate" lives in templates (PRD Visual Contract section + workplan acceptance criteria) and is operator-driven during PRD iteration. The "closure gate" lives in the implement skill + sub-agent prompt fragment + pre-commit hook + commit-message marker; it's mechanically enforced after PRD applied. **Marker format (default).** `Visual-verify: <comma-separated-routes>` OR `Visual-verify: skipped-<substantive-reason ≥40 chars, no gaming phrases>`. The format is canonical; the route list, viewport naming, PNG output dir, and validator pattern are project-customizable via a per-project config (location/name TBD during PRD iteration). The default teeth (reject when missing, reject when PNG stale, reject when skipped-reason is bullshit) apply unless the project explicitly opts out. **Capture tool.** `dw-lifecycle visual-capture --routes <list> --viewports <list> --output <dir>` ships day 1. Playwright-based. Per-route + per-viewport PNG output named `<route>-<viewport>.png`. The implement skill + pre-commit hook reference this canonical command, not a per-repo path. Adopters override by writing `.dw-lifecycle/visual-capture.ts` (mirrors the existing template-override escape). **Agent-prompt fragment mirrors `install-agent-prompts`.** Fragment lives at `templates/agent-visual-verification-fragment.md` (or equivalent). A `/dw-lifecycle:install-visual-verification-fragment` skill appends it to repo-local `.claude/agents/*.md` files. Fragment text follows the issue's sketch: "Step 0 — if dispatch brief touches UI source, capture + Read + cite PNG path in DONE; controller re-runs capture + Reads independently." **Mockup development institutionalization — precondition cycle.** The PRD's Visual Contract section is the operator-controlled approval surface. The `/dw-lifecycle:implement` skill enforces the precondition mechanically, not advisorily:

1. **Detection.** When implement begins a task whose definition touches UI source (per the workplan's task-tagging convention — exact form TBD during PRD iteration; default likely matches workplan-criteria globs `modules/*/src/**/*.{tsx,jsx,css,scss}` or equivalent + project-overridable), implement checks the PRD's Visual Contract for an approved-mockup entry covering the task's affected route(s).
2. **Refusal.** If no approved mockup covers the affected routes, implement REFUSES to begin the task's code phase. No "begin and iterate" — the refusal is hard.
3. **Interview.** Implement then **automatically engages the operator in a structured interview** to develop the mockup. The interview's prompt structure asks: what surface? what user-facing behavior? what existing patterns to mirror or break from? what's distinctive about this surface vs. the rest of the app? what's the constraint surface (mobile-first, dense-data, accessibility-critical, etc.)? The operator answers in conversation.
4. **`/frontend-design` invocation.** Implement passes the interview's captured answers to `/frontend-design`, which produces 2–3 mockup directions (per its existing contract). The mockups land under `<feature-docs>/mockups/<direction-slug>.html` and an updated `<feature-docs>/mockups/index.html` per the existing `/frontend-design` skill conventions.
5. **Operator selection + amendment.** The operator reviews the directions and either picks one, asks for amendments (which loop back through `/frontend-design`), or rejects all and re-runs the interview with refined inputs.
6. **Approval.** Once the operator selects a final mockup, the operator records the approval in the PRD's Visual Contract section (path + approval marker; exact mechanism TBD during PRD iteration — likely a frontmatter field or a marker section the doctor rule audits).
7. **Implementation unlocks.** Only after the approval marker exists does `/dw-lifecycle:implement` proceed with the task's code phase. The blessed mockup is now the literal contract the implementation must match (per the closure gate).

The setup skill scaffolds an empty `mockups/` subdir for every feature whose workplan contains UI-touching tasks (detected via task-tagging or workplan-template structure — exact trigger TBD during PRD iteration). The setup-scaffolded mockups directory is the canonical home for the precondition-cycle outputs.

**Operator-approval mechanism.** TBD during PRD iteration. Candidates:

- **Frontmatter field** in the PRD: `mockups: [{ path: "mockups/foo.html", approved: true, approvedAt: "2026-..." }]`. Validates structurally; doctor rule confirms files exist.
- **Markdown section** with an explicit approval marker: `## Visual Contract` body lists each mockup as `- [x] mockups/foo.html — approved 2026-05-...`. Mirrors the existing checkbox-acceptance-criteria pattern. Validates by line-parser.
- **Graphical-entries integration** (post-graphical-entries shipping): mockups become first-class entries in the editorial calendar with workflow states, approved via the standard deskwork pipeline. This is the longer-term destination — v1 may ship with one of the lighter mechanisms and migrate later.

Operator decides the v1 mechanism during PRD iteration. Whichever lands, the doctor rule audits it. **Interaction with graphical-entries.** The in-flight `graphical-entries` feature introduces a "graphical entries" concept — non-document content (images, mockups, design artifacts) tracked in the editorial calendar with workflow states. If `graphical-entries` lands first, the visual-verification-gate's mockup-development workflow can use it as the canonical review surface for mockups: operator drafts mockup → ingests as graphical entry → iterates via deskwork → approves → mockup becomes the blessed visual contract for the implementation phase. If `graphical-entries` lands later, visual-verification-gate ships with a simpler mockup workflow (mockups committed to `docs/.../mockups/`, referenced by path from the PRD) and is upgraded post-graphical-entries to use the richer review surface. This dependency is real but NOT blocking. The simpler workflow is sufficient for v1. **Doctor rule.** Mirrors the existing `agent-prompt-mirror-drift` pattern. Audits: for every workplan task marked `- [x]` with a "visual screenshot captured" criterion, does the named PNG exist with mtime > the closing commit's SHA? Flag any miss. Opt-in `--fix` regenerates the capture.
