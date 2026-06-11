---
name: wireframe
description: Author a deliberately lo-fi wireframe for a named UI surface change — operator-driven, sketch-kit-based, and lint-enforced (zero check-wireframe findings before the draft may be presented). The optional /frontend-design accelerator routes through the same lint.
---

# /design-control:wireframe `<change>`

Author the **lo-fi wireframe** for one named surface change. The wireframe is
the UX-*spirit* artifact of the design-control discipline: it works out
structure, hierarchy, and flow while being structurally incapable of carrying
visual-design detail — so stale polish can never ship as if intended. Visual
identity lives in the design-language spec (Phase 2), never here.

> Per the plugin thesis (`DESIGN-DISCIPLINE-THESIS.md`): policy is enforced by a
> process, not a rule. The lo-fi property is not a convention the author is
> trusted to follow — it is mechanically enforced by the `check-mockup-lofi`
> lint, which every draft MUST pass before it may be presented.

## Arguments

- `<change>` (required) — a short operator-meaningful brief of the surface
  change (e.g. `regroup the content browser by lane`). If missing, ask for it
  (one argument, one prompt).

## Procedure

1. **Resolve the target surface.** Confirm with the operator which surface the
   change addresses (`surface id` — operator-declared granularity, per the spec's
   Definitions). One wireframe per change; do not batch surfaces.

2. **Set up the wireframe file.** Create `<surface-id>.html` in the operator's
   chosen wireframes directory, with the shipped sketch-kit copied alongside it:
   - copy `assets/sketch-kit/sketch-kit.css` (and `assets/sketch-kit/fonts/` if a
     font-bearing theme is chosen) next to the wireframe;
   - exactly ONE `<link rel="stylesheet" href="sketch-kit.css">`;
   - `<body class="sk sk-theme-<theme>">` — theme is the operator's pick among
     `marker` / `blueprint` / `grayscale` (default `grayscale`);
   - the kit's WIREFRAME banner (`.sk-banner`) stays — the artifact self-labels.

3. **Author the wireframe — manual path (default, requires NO engine).** The
   operator (or the agent under operator direction) writes plain structural HTML
   using only the `.sk-*` vocabulary and the lint's allowed structural tags.
   Imagery is the fixed `.sk-img` placeholder; icons are text labels, never
   emoji; copy uses plain Basic-Latin text. This path never calls the engine
   preflight — it works with no engine installed.

4. **Optional engine accelerator.** Only if the operator asks for it: gate on
   `preflightEngine` (`@/engine-adapter`, method `author-wireframe`) — absence
   fails loud naming the remedy — then request a draft via the engine adapter.
   **Engine output gets zero trust:** it lands in the same file and is judged by
   the same lint as a manual draft (a `lint-rejected` response is the defined
   failure mode; fix or discard, never grandfather).

5. **Lint gate — the non-negotiable step.** Run:

   ```bash
   plugins/design-control/bin/check-wireframe <path/to/wireframe.html>
   ```

   - Exit `0` (lint green, zero findings) → the draft may be presented.
   - Exit `1` → fix every finding and re-run. NEVER present a draft with open
     findings; NEVER hand-wave a finding as "just lo-fi enough". The lint is the
     boundary of the lo-fi guarantee.

6. **Record provenance.** This skill authors *driving* wireframes (the artifact
   precedes the implementation): record it via `recordDrivingWireframe`
   (`@/provenance`) in the wireframe's directory, passing the lint-green
   wireframe's filename (`wireframeFile`) — the record binds that artifact by
   name + sha256, so a later replacement of the wireframe is tamper-evident
   (`verifyDrivingWireframe` re-hashes and fails loud on mismatch). The file
   must exist on disk at record time; step 5's lint gate guarantees it does.
   A wireframe reverse-engineered
   from an existing surface is the *derived* path — record it with
   `recordDerivation` at derivation time instead, and note that acceptance will
   require a non-empty operator edit against the stored snapshot
   (`checkDerivedAcceptance`) and the artifact never supports a "wireframe drove
   implementation" claim.

7. **Present and stop.** Show the operator the lint-green wireframe (path +
   `0 findings` output). The operator picks/iterates; translation into the
   design language and implementation are separate steps of the loop, not this
   skill's job.

## What this skill does NOT do

- It does not style anything — no CSS authoring, no presentational attributes
  (the lint rejects them anyway).
- It does not translate to the design language (`translate-design-language`),
  implement, or referee.
- It does not skip the lint for engine-authored drafts — same gate, same lint,
  zero findings.
