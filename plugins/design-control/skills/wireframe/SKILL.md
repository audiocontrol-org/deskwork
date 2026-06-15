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
   precedes the implementation): record it in the wireframe's directory by
   running:

   ```bash
   plugins/design-control/bin/wireframe-provenance record-driving <wireframes-dir> <surface-id> <wireframe-filename>
   ```

   (`<wireframe-filename>` is the lint-green wireframe's bare filename inside
   `<wireframes-dir>` — a portable filename, enforced at record time: no path
   separators, no `..`, no subdirectories.) Exit `0` → recorded; exit `1` → descriptive refusal or
   error on stderr — fix and re-run, never skip. The record binds that artifact
   by name + sha256, so a later replacement of the wireframe is tamper-evident:

   ```bash
   plugins/design-control/bin/wireframe-provenance verify-driving <wireframes-dir> <surface-id>
   ```

   re-hashes the bound file and exits `1` on tamper/missing/mode mismatch. The
   wireframe file must exist on disk at record time; step 5's lint gate
   guarantees it does.

   A wireframe reverse-engineered from an existing surface is the *derived*
   path — record it at derivation time instead with:

   ```bash
   plugins/design-control/bin/wireframe-provenance record-derived <wireframes-dir> <surface-id> <source> --from <derived-draft.html>
   ```

   (`<source>` is what the draft was derived FROM — route, URL, file;
   `--from` names the auto-derived draft file, which is snapshotted alongside
   the sidecar). Acceptance of a derived artifact then requires a non-empty
   operator edit against the stored snapshot — the acceptance gate is:

   ```bash
   plugins/design-control/bin/wireframe-provenance check-acceptance <wireframes-dir> <surface-id> <accepted.html>
   ```

   Exit `0` → ok; exit `1` → the artifact is byte-identical to the
   derivation-time snapshot (`derived-unedited`) or the baseline was tampered.
   A derived artifact never supports a "wireframe drove implementation" claim,
   edited or not. Provenance is append-once: if a sidecar already exists for
   the surface, BOTH recorders refuse to overwrite it (in either mode
   direction) — re-recording requires explicitly removing or superseding the
   existing record; never work around the refusal by deleting the sidecar to
   flip a `derived` surface to `driving`.

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
