# Audit-barrage — multi-model audit prompt template

You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface the kinds of defects listed under **What to look for** below, in the work product captured under **Under audit**.

You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.

## Feature under audit

design-control

## Feature scope (workplan / PRD summary)

Governance pass over the just-implemented work for feature 'design-control', diffed against 4a7f30d0. The differentiated back half audits a plan it did not author or execute.

## Commit subjects in the audited range

90bc5507 chore(design-control): seed the nested installation's audit-barrage-config from the root override — claude 900s, gemini disabled (run 20260611T062218157Z floor shortfall)
9c0d556c docs(design-control): disposition AUDIT-20260611-01..07 as fixed + record barrage run 20260611T055621128Z
3d32a2fb fix(design-control): bin/wireframe-provenance gives the provenance recorders and gates an executable firing surface (AUDIT-20260611-03)
a26a1645 fix(design-control): recordDerivation stages both artifacts and promotes atomically — sidecar is the commit point, no half-state on failure (AUDIT-20260611-07)
0e4027c3 fix(design-control): provenance is append-once — writeProvenance refuses overwrite, killing the derived-to-driving laundering path (AUDIT-20260611-01)
40124302 fix(design-control): bind driving provenance to its wireframe by filename + sha256 with verifyDrivingWireframe tamper check (AUDIT-20260611-04)
84bcc73c fix(design-control): loadProvenance rejects a sidecar whose inner surfaceId mismatches the requested id (AUDIT-20260611-06)
896be642 fix(design-control): validate surfaceId as portable filename at every provenance path-building entry (AUDIT-20260611-02)
cc2b71e9 fix(design-control): rename misleading derivedAt param to createdAt in both provenance recorders (AUDIT-20260611-05)
9639b445 feat(design-control): wireframe authoring skill + derived-provenance path — Phase 1 complete


## Recent audit-log excerpt (prior findings on this feature)

Use this to avoid re-reporting findings that have already been triaged. If a finding was previously dispositioned (`closed`, `won't-fix`, `accepted-trade-off`), don't re-litigate the disposition; only surface a new instance if the underlying shape regressed.

Severity:   medium
Surface:    plugins/design-control/src/provenance/derived.ts:31-36 (drivingSchema) vs 38-53 (derivedSchema)

The `derived` record stores `snapshotFile`, `snapshotSha256`, and `source` — enough to identify and tamper-check its baseline. The `driving` record stores only `surfaceId`, `mode`, and `createdAt`. `wireframeDroveImplementation` therefore certifies a claim ("this wireframe drove the implementation") about an artifact the record cannot identify: the wireframe HTML next to the sidecar can be wholly replaced after recording and the claim still holds, with no tamper evidence of the kind the derived path deliberately built (lines 148-154). The asymmetry is visible side-by-side in the two schemas.

Blast radius: a downstream consumer (the future referee, or any "did a wireframe drive this change?" check) gets a `true` that is unfalsifiable against the on-disk artifact. Nothing breaks today, but every claim recorded under this schema is permanently unverifiable, and a later schema fix can't retro-bind old records — the cost compounds with adoption, hence medium. Fix: record the wireframe's filename and sha256 at `recordDrivingWireframe` time (the wireframe file already exists at that point per SKILL.md step ordering — lint at step 5 precedes provenance at step 6), and have `wireframeDroveImplementation` (or a sibling verifier) check the hash the way `checkDerivedAcceptance` checks the snapshot.

### AUDIT-20260611-05 — `recordDrivingWireframe` takes a parameter named `derivedAt` for a wireframe that is by definition not derived

Finding-ID: AUDIT-20260611-05
Status:     fixed-cc2b71e9 (2026-06-10; pure rename derivedAt → createdAt in both recorders + all call sites; suite green as regression net)
Severity:   low
Surface:    plugins/design-control/src/provenance/derived.ts:85-88; src/__tests__/provenance/derived.test.ts:118-122

The driving-path recorder's optional timestamp input is named `derivedAt` (`input: { dir; surfaceId; derivedAt?: Date }`), feeding the sidecar field `createdAt`. The name contradicts the mode it records — "derived" is the *other* mode, and the module spends its entire header explaining why the two must never be confused. The tests dutifully pass `derivedAt` when recording a driving wireframe (derived.test.ts lines 118-122), which reads as a category error at every call site.

Blast radius: no behavioral consequence — the value lands in `createdAt` correctly — but this is an exported public API (`@/provenance`), so the misleading name propagates to every future caller and to the eventual `bin/` verb's flag naming. Hence low. Fix: rename to `createdAt?` (or `at?`) in both record functions for symmetry, while the call-site count is still two test files.

### AUDIT-20260611-06 — `loadProvenance` does not verify the sidecar's inner `surfaceId` matches the requested one

Finding-ID: AUDIT-20260611-06
Status:     fixed-84bcc73c (2026-06-10; loadProvenance asserts the sidecar's inner surfaceId equals the requested id, throwing with both ids; RED-first via copied-sidecar fixture)
Severity:   low
Surface:    plugins/design-control/src/provenance/derived.ts:129-139

`loadProvenance(dir, surfaceId)` resolves the file by name and zod-validates its shape, but never asserts `parsed.surfaceId === surfaceId`. A sidecar copied or renamed to another surface's filename (an easy mistake when seeding a second surface from a first) loads cleanly and flows into `checkDerivedAcceptance`, whose finding message then reports the *argument's* surface id (line 158) while gating against the *other* surface's snapshot and hash — a confusing mixed-identity verdict instead of a loud failure.

Blast radius: requires a file-management mistake to trigger, and the resulting behavior is confusing rather than silently wrong in a damaging direction (the hash check still fires against whatever snapshot the record names). Hence low. Fix: one equality check after parse, throwing with both ids in the message.

### AUDIT-20260611-07 — `recordDerivation` can leave an orphaned snapshot if sidecar write fails

Finding-ID: AUDIT-20260611-07
Status:     fixed-a26a1645 (2026-06-10; both artifacts staged as .tmp-<pid> then promoted via renameSync — snapshot first, sidecar last as the commit point; staged temps cleaned on failure; 2 RED-first tests incl. planted-directory write failure)
Severity:   medium
Surface:    `plugins/design-control/src/provenance/derived.ts:102-118`

`recordDerivation` writes `<surfaceId>.derived-snapshot.html` first, then writes `<surfaceId>.provenance.json`. If the process is interrupted, the disk fills, permissions change, or JSON sidecar write otherwise fails after line 104, the directory is left with a snapshot but no valid provenance record. The workplan says `recordDerivation` “writes snapshot + zod-validated sidecar in one move”; this implementation is sequential non-atomic writes.

The blast radius is medium: normal consumers will usually succeed, but the failure mode creates ambiguous provenance state in the operator’s artifact directory. A later unattended agent or operator may see the snapshot and assume derivation was recorded, while `loadProvenance` fails loud because the sidecar is absent. A reasonable fix is to write both artifacts via temporary files and atomic renames, with cleanup on failure, or to write the sidecar first with a temporary snapshot reference and only promote both names once both writes have succeeded.


## Under audit

The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn't).

diff --git a/plugins/design-control/.stack-control/audit-barrage-config.yaml b/plugins/design-control/.stack-control/audit-barrage-config.yaml
new file mode 100644
index 00000000..88b3fa1d
--- /dev/null
+++ b/plugins/design-control/.stack-control/audit-barrage-config.yaml
@@ -0,0 +1,43 @@
+# Audit-barrage model battery — project override for graphical-entries.
+#
+# Overrides the plugin default at:
+#   plugins/dw-lifecycle/templates/audit-barrage-config.yaml
+#
+# Disabled gemini effective 2026-06-01 — gemini-cli was failing 94.1% of runs
+# (16 of 17 across the graphical-entries Phase 0 audit cycle) on two cascading
+# error modes: (1) ClassifierStrategy JSON-routing failures in
+# @google/gemini-cli-core/.../baseLlmClient.js#generateJson (retry exhaustion
+# on empty/unparsable JSON); (2) "exhausted your capacity on this model" API
+# quota errors after the routing failure. Stderrs captured under
+# audit-runs/*/stderr/gemini.txt show the consistent pattern. The audit-barrage
+# was effectively a 2/3 fleet (claude + codex) in practice; making that explicit
+# here so the orchestrator's "models attempted" count and the dampener counter
+# don't get polluted by a model that always fails.
+#
+# Re-enable when the gemini-cli upstream fixes the JSON-mode routing
+# reliability OR our gemini account has sustained quota. See
+# https://github.com/audiocontrol-org/deskwork/issues (the LLM-CLI-failure
+# tooling-feedback context).
+
+# Phase 12 Task 8 (#397, 2026-06-04): migrated to {{prompt-stdin}} for
+# both active models. The argv path failed with spawn E2BIG on bootstrap
+# HEAD~N ranges; stdin delivery bypasses the OS per-arg limit. Phase 19's
+# verb path supports {{prompt-stdin}} since v0.32.1 (the cached v0.36.0
+# binary respects this override even though its own plugin default still
+# ships {{prompt}} until v0.37.0).
+
+models:
+  # 2026-06-10 (specs/014 dogfood): claude 300 -> 900. The first
+  # governed run of specs/014 carried a 181KB diff prompt; claude timed
+  # out at 301s with zero bytes (run 20260611T023019180Z) and the new
+  # US1 floor (govern requires >= 2 emitting models) correctly refused
+  # the round. 300s was tuned for pre-protocol payload sizes. codex
+  # finished the same prompt in ~2 minutes; left at 300.
+  - name: claude
+    binary: claude
+    args_template: "-p {{prompt-stdin}}"
+    timeout_seconds: 900
+  - name: codex
+    binary: codex
+    args_template: "exec {{prompt-stdin}}"
+    timeout_seconds: 600
diff --git a/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/INDEX.md b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/INDEX.md
new file mode 100644
index 00000000..36f8cab9
--- /dev/null
+++ b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/INDEX.md
@@ -0,0 +1,39 @@
+# Audit-barrage run
+
+- timestamp: 20260611T055621128Z
+- feature: design-control-after_clarify
+- run dir: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify
+- prompt: PROMPT.md
+- models attempted: 3
+
+## Per-model results
+### claude
+
+- exit code: 0
+- duration: 140180 ms
+- stdout bytes: 9430
+- stderr bytes: 0
+- stdout path: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/claude.md
+- stderr path: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/claude.txt
+- timed out: no
+
+### codex
+
+- exit code: 0
+- duration: 26545 ms
+- stdout bytes: 1238
+- stderr bytes: 41697
+- stdout path: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/codex.md
+- stderr path: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/codex.txt
+- timed out: no
+
+### gemini
+
+- exit code: 1
+- duration: 31332 ms
+- stdout bytes: 0
+- stderr bytes: 544
+- stdout path: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/gemini.md
+- stderr path: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/gemini.txt
+- timed out: no
+
diff --git a/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/PROMPT.md b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/PROMPT.md
new file mode 100644
index 00000000..c7d93a97
--- /dev/null
+++ b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/PROMPT.md
@@ -0,0 +1,859 @@
+# Audit-barrage — multi-model audit prompt template
+
+You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface the kinds of defects listed under **What to look for** below, in the work product captured under **Under audit**.
+
+You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.
+
+## Feature under audit
+
+design-control
+
+## Feature scope (workplan / PRD summary)
+
+Governance pass over the just-implemented work for feature 'design-control', diffed against HEAD~1. The differentiated back half audits a plan it did not author or execute.
+
+## Commit subjects in the audited range
+
+9639b445 feat(design-control): wireframe authoring skill + derived-provenance path — Phase 1 complete
+
+
+## Recent audit-log excerpt (prior findings on this feature)
+
+Use this to avoid re-reporting findings that have already been triaged. If a finding was previously dispositioned (`closed`, `won't-fix`, `accepted-trade-off`), don't re-litigate the disposition; only surface a new instance if the underlying shape regressed.
+
+Finding-ID: AUDIT-20260610-66 (round-20 gpt-5-01 MED + gpt-5-02 LOW)
+Status:     fixed-0e5b4b21 (2026-06-10; fieldset/legend allowlisted; required joins the structural-state attrs)
+Severity:   medium
+Surface:    plugins/design-control/src/lint/allowlist.ts
+Direction:  false-positive
+
+## CONVERGENCE RECORD — 2026-06-10 lint adversarial barrage loop (rounds 1–20)
+
+**Stop criterion met:** two consecutive zero-HIGH rounds (19 + 20), per the
+PRD's operator-set criterion. Twenty rounds fired via the committed
+re-runnable process (audit/run-lint-barrage.sh → stackctl audit-barrage).
+
+**Loop totals:**
+- Findings recorded: AUDIT-20260610-01 .. -66 (66 IDs; same-mechanism
+  cross-model/cross-finding folds applied per the TF-002 rule)
+- Dispositions: every finding fixed-<sha>, acknowledged-<ref>, superseded, or
+  informational — zero open, zero parked-without-record
+- Test corpus: 151 → 286 (every genuine defeat is a deterministic fixture;
+  every accepted boundary/residual is a documented BOUNDARY fixture)
+- Two of the loop's own earlier dispositions were REVERSED on later evidence
+  (AUDIT-14 query acceptance → AUDIT-45; AUDIT-03 absent-fonts-clean →
+  AUDIT-23) — the protocol audited its own fixes, not just the original code
+- Declared scope boundaries (in the lint docstring + the adversarial prompt,
+  each pinned by fixtures): (1) punctuation FLOW art mechanically gated;
+  letter-composed imagery and grid-diluted punctuation = referee's gross-class
+  domain; (2) UA default rendering of semantic HTML = the unstyled baseline;
+  (3) imagery composed by geometric placement of sanctioned atoms = referee's
+  domain
+- Fleet note: claude contributed rounds 1(retry)+2 then was 0-byte for 18
+  consecutive runs (deskwork issue 447); from round 3 the loop ran on codex
+  alone, so cross-model agreement was only available in rounds 1–2. The
+  convergence verdict is correspondingly single-family — re-validation with a
+  restored fleet is the natural post-447 follow-up.
+
+**Verification discipline held throughout:** every defeating input was
+executed against the real lint before recording (zero auditor predictions
+trusted); every fix was RED-first with the verbatim defeating input as the
+fixture; two self-caught transcription errors in fix shas were corrected in
+dedicated commits.
+
+
+## Under audit
+
+The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn't).
+
+diff --git a/plugins/design-control/bin/check-wireframe b/plugins/design-control/bin/check-wireframe
+new file mode 100755
+index 00000000..b5919fb3
+--- /dev/null
++++ b/plugins/design-control/bin/check-wireframe
+@@ -0,0 +1,25 @@
++#!/bin/sh
++# check-wireframe <wireframe.html> — run the full pinned check-mockup-lofi lint
++# against a wireframe file. Exit codes: 0 lint-green, 1 findings/error, 2 usage.
++# Logic lives in src/authoring/lint-file.ts (tested); this shim only locates the
++# workspace tsx runner (hoisted node_modules in the monorepo) and dispatches.
++set -eu
++
++PLUGIN_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
++
++dir="$PLUGIN_ROOT"
++TSX=""
++while [ "$dir" != "/" ]; do
++  if [ -x "$dir/node_modules/.bin/tsx" ]; then
++    TSX="$dir/node_modules/.bin/tsx"
++    break
++  fi
++  dir=$(dirname -- "$dir")
++done
++
++if [ -z "$TSX" ]; then
++  echo "check-wireframe: tsx runner not found in any node_modules/.bin above $PLUGIN_ROOT — run npm install first" >&2
++  exit 1
++fi
++
++exec "$TSX" "$PLUGIN_ROOT/src/authoring/check-wireframe-cli.ts" "$@"
+diff --git a/plugins/design-control/skills/wireframe/SKILL.md b/plugins/design-control/skills/wireframe/SKILL.md
+new file mode 100644
+index 00000000..47f432b3
+--- /dev/null
++++ b/plugins/design-control/skills/wireframe/SKILL.md
+@@ -0,0 +1,86 @@
++---
++name: wireframe
++description: Author a deliberately lo-fi wireframe for a named UI surface change — operator-driven, sketch-kit-based, and lint-enforced (zero check-wireframe findings before the draft may be presented). The optional /frontend-design accelerator routes through the same lint.
++---
++
++# /design-control:wireframe `<change>`
++
++Author the **lo-fi wireframe** for one named surface change. The wireframe is
++the UX-*spirit* artifact of the design-control discipline: it works out
++structure, hierarchy, and flow while being structurally incapable of carrying
++visual-design detail — so stale polish can never ship as if intended. Visual
++identity lives in the design-language spec (Phase 2), never here.
++
++> Per the plugin thesis (`DESIGN-DISCIPLINE-THESIS.md`): policy is enforced by a
++> process, not a rule. The lo-fi property is not a convention the author is
++> trusted to follow — it is mechanically enforced by the `check-mockup-lofi`
++> lint, which every draft MUST pass before it may be presented.
++
++## Arguments
++
++- `<change>` (required) — a short operator-meaningful brief of the surface
++  change (e.g. `regroup the content browser by lane`). If missing, ask for it
++  (one argument, one prompt).
++
++## Procedure
++
++1. **Resolve the target surface.** Confirm with the operator which surface the
++   change addresses (`surface id` — operator-declared granularity, per the spec's
++   Definitions). One wireframe per change; do not batch surfaces.
++
++2. **Set up the wireframe file.** Create `<surface-id>.html` in the operator's
++   chosen wireframes directory, with the shipped sketch-kit copied alongside it:
++   - copy `assets/sketch-kit/sketch-kit.css` (and `assets/sketch-kit/fonts/` if a
++     font-bearing theme is chosen) next to the wireframe;
++   - exactly ONE `<link rel="stylesheet" href="sketch-kit.css">`;
++   - `<body class="sk sk-theme-<theme>">` — theme is the operator's pick among
++     `marker` / `blueprint` / `grayscale` (default `grayscale`);
++   - the kit's WIREFRAME banner (`.sk-banner`) stays — the artifact self-labels.
++
++3. **Author the wireframe — manual path (default, requires NO engine).** The
++   operator (or the agent under operator direction) writes plain structural HTML
++   using only the `.sk-*` vocabulary and the lint's allowed structural tags.
++   Imagery is the fixed `.sk-img` placeholder; icons are text labels, never
++   emoji; copy uses plain Basic-Latin text. This path never calls the engine
++   preflight — it works with no engine installed.
++
++4. **Optional engine accelerator.** Only if the operator asks for it: gate on
++   `preflightEngine` (`@/engine-adapter`, method `author-wireframe`) — absence
++   fails loud naming the remedy — then request a draft via the engine adapter.
++   **Engine output gets zero trust:** it lands in the same file and is judged by
++   the same lint as a manual draft (a `lint-rejected` response is the defined
++   failure mode; fix or discard, never grandfather).
++
++5. **Lint gate — the non-negotiable step.** Run:
++
++   ```bash
++   plugins/design-control/bin/check-wireframe <path/to/wireframe.html>
++   ```
++
++   - Exit `0` (lint green, zero findings) → the draft may be presented.
++   - Exit `1` → fix every finding and re-run. NEVER present a draft with open
++     findings; NEVER hand-wave a finding as "just lo-fi enough". The lint is the
++     boundary of the lo-fi guarantee.
++
++6. **Record provenance.** This skill authors *driving* wireframes (the artifact
++   precedes the implementation): record it via `recordDrivingWireframe`
++   (`@/provenance`) in the wireframe's directory. A wireframe reverse-engineered
++   from an existing surface is the *derived* path — record it with
++   `recordDerivation` at derivation time instead, and note that acceptance will
++   require a non-empty operator edit against the stored snapshot
++   (`checkDerivedAcceptance`) and the artifact never supports a "wireframe drove
++   implementation" claim.
++
++7. **Present and stop.** Show the operator the lint-green wireframe (path +
++   `0 findings` output). The operator picks/iterates; translation into the
++   design language and implementation are separate steps of the loop, not this
++   skill's job.
++
++## What this skill does NOT do
++
++- It does not style anything — no CSS authoring, no presentational attributes
++  (the lint rejects them anyway).
++- It does not translate to the design language (`translate-design-language`),
++  implement, or referee.
++- It does not skip the lint for engine-authored drafts — same gate, same lint,
++  zero findings.
+diff --git a/plugins/design-control/specs/001-design-control/tasks.md b/plugins/design-control/specs/001-design-control/tasks.md
+index 0d69efb4..a65fd485 100644
+--- a/plugins/design-control/specs/001-design-control/tasks.md
++++ b/plugins/design-control/specs/001-design-control/tasks.md
+@@ -139,13 +139,22 @@ verbatim in substance** — when they drift, the PRD wins.
+       Romanian comma-below, multiline placeholders, cache-busting/percent-encoded/subdirectory kit
+       hrefs, data tables, placeholder rows, prose pages, disclosure blocks, and the boundary
+       fixtures. Suite: 151 → 286.
+-- [ ] `/design-control:wireframe <change>` authoring skill (operator-driven + lint-enforced; the
++- [x] `/design-control:wireframe <change>` authoring skill (operator-driven + lint-enforced; the
+       engine `author-wireframe` method is an optional accelerator routed through the same lint).
+-- [ ] Retroactive path: existing surface → `derived` wireframe/spec; **snapshot the auto-derived
++      **Done — 2026-06-10.** `skills/wireframe/SKILL.md` (manual path needs no engine; the
++      accelerator gates on `preflightEngine` and its output is judged by the same lint) +
++      `@/authoring` (`lintWireframeFile` composes the existing pinned pipeline — no parallel lint
++      path) + `bin/check-wireframe` shim (exit contract 0 green / 1 findings-or-error / 2 usage;
++      logic tested as `runCheckWireframe`, the shim only dispatches). TDD: 9 tests RED first.
++- [x] Retroactive path: existing surface → `derived` wireframe/spec; **snapshot the auto-derived
+       draft at derivation time** (stored alongside provenance) so the edit-diff has a baseline;
+       **acceptance of a `derived` artifact requires a recorded operator edit** (non-empty diff
+       between the stored auto-derived snapshot and the accepted version), not just a state
+       transition; does NOT satisfy a "wireframe drove implementation" claim.
++      **Done — 2026-06-10.** `@/provenance` (`recordDerivation` writes snapshot + zod-validated
++      sidecar in one move; `checkDerivedAcceptance` rejects a byte-identical acceptance with
++      `derived-unedited`, fails loud on a tampered baseline via the recorded sha256;
++      `wireframeDroveImplementation` is true only for `driving` mode). TDD: 9 tests RED first.
+ 
+ **Acceptance:** the engine-adapter **preflight fails loud when `/frontend-design` is absent while
+ manual authoring still works**, and the preflight **precedes the first engine-consuming skill**; the
+diff --git a/plugins/design-control/src/__tests__/authoring/lint-file.test.ts b/plugins/design-control/src/__tests__/authoring/lint-file.test.ts
+new file mode 100644
+index 00000000..891ccae0
+--- /dev/null
++++ b/plugins/design-control/src/__tests__/authoring/lint-file.test.ts
+@@ -0,0 +1,105 @@
++import { describe, it, expect, afterEach } from 'vitest';
++import { mkdtempSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
++import { tmpdir } from 'node:os';
++import { join } from 'node:path';
++import { lintWireframeFile, runCheckWireframe } from '@/authoring/lint-file';
++import { SKETCH_KIT_CSS_PATH, SKETCH_KIT_SAMPLE_PATH } from '@/wireframe-kit/sketch-kit';
++
++const dirs: string[] = [];
++afterEach(() => {
++  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
++});
++
++/** Temp wireframe dir seeded with a genuine copy of the shipped kit CSS. */
++function freshDir(): string {
++  const dir = mkdtempSync(join(tmpdir(), 'dc-lint-file-'));
++  dirs.push(dir);
++  copyFileSync(SKETCH_KIT_CSS_PATH, join(dir, 'sketch-kit.css'));
++  return dir;
++}
++
++const cleanPage =
++  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>' +
++  '<link rel="stylesheet" href="sketch-kit.css"></head>' +
++  '<body class="sk sk-theme-grayscale"><div class="sk-banner">WIREFRAME</div>' +
++  '<h1>Entry list</h1></body></html>';
++
++describe('lintWireframeFile', () => {
++  it('passes the shipped example wireframe (pin built against its own dir)', () => {
++    const result = lintWireframeFile(SKETCH_KIT_SAMPLE_PATH);
++    expect(result.findings).toEqual([]);
++    expect(result.ok).toBe(true);
++  });
++
++  it('passes a clean wireframe sitting next to a genuine kit copy', () => {
++    const dir = freshDir();
++    const file = join(dir, 'change.html');
++    writeFileSync(file, cleanPage);
++    expect(lintWireframeFile(file).ok).toBe(true);
++  });
++
++  it('rejects a wireframe with an inline style (same axis-1 lint, not a parallel path)', () => {
++    const dir = freshDir();
++    const file = join(dir, 'change.html');
++    writeFileSync(file, cleanPage.replace('<h1>', '<h1 style="color:red">'));
++    const result = lintWireframeFile(file);
++    expect(result.ok).toBe(false);
++    expect(result.findings.map((f) => f.rule)).toContain('inline-style');
++  });
++
++  it('rejects a wireframe whose kit copy is not the shipped bytes (identity pin enforced)', () => {
++    const dir = freshDir();
++    writeFileSync(join(dir, 'sketch-kit.css'), readFileSync(SKETCH_KIT_CSS_PATH, 'utf8') + '\nh1{color:hotpink}');
++    const file = join(dir, 'change.html');
++    writeFileSync(file, cleanPage);
++    const result = lintWireframeFile(file);
++    expect(result.ok).toBe(false);
++    expect(result.findings.map((f) => f.rule)).toContain('stylesheet-hash-mismatch');
++  });
++
++  it('fails loud on a missing file', () => {
++    expect(() => lintWireframeFile(join(tmpdir(), 'dc-lint-file-does-not-exist.html'))).toThrow(
++      /no such file|does not exist|ENOENT/i,
++    );
++  });
++});
++
++describe('runCheckWireframe (CLI core — exit codes are the bin contract)', () => {
++  function capture(): { out: string[]; err: string[]; io: { out(line: string): void; err(line: string): void } } {
++    const out: string[] = [];
++    const err: string[] = [];
++    return { out, err, io: { out: (l) => out.push(l), err: (l) => err.push(l) } };
++  }
++
++  it('exits 0 and reports clean on a passing wireframe', () => {
++    const dir = freshDir();
++    const file = join(dir, 'change.html');
++    writeFileSync(file, cleanPage);
++    const { io, out } = capture();
++    expect(runCheckWireframe([file], io)).toBe(0);
++    expect(out.join('\n')).toMatch(/0 findings/);
++  });
++
++  it('exits 1 and prints one line per finding on a failing wireframe', () => {
++    const dir = freshDir();
++    const file = join(dir, 'change.html');
++    writeFileSync(file, cleanPage.replace('<h1>', '<h1 style="color:red">'));
++    const { io, err } = capture();
++    expect(runCheckWireframe([file], io)).toBe(1);
++    expect(err.some((l) => l.includes('inline-style'))).toBe(true);
++  });
++
++  it('exits 1 with a descriptive error on a missing file (no fabricated verdict)', () => {
++    const { io, err } = capture();
++    expect(runCheckWireframe([join(tmpdir(), 'dc-nope.html')], io)).toBe(1);
++    expect(err.join('\n')).toMatch(/no such file|does not exist|ENOENT/i);
++  });
++
++  it('exits 2 on usage error (no argument / extra arguments)', () => {
++    const a = capture();
++    expect(runCheckWireframe([], a.io)).toBe(2);
++    expect(a.err.join('\n')).toMatch(/usage/i);
++    const b = capture();
++    expect(runCheckWireframe(['x.html', 'y.html'], b.io)).toBe(2);
++  });
++});
+diff --git a/plugins/design-control/src/__tests__/provenance/derived.test.ts b/plugins/design-control/src/__tests__/provenance/derived.test.ts
+new file mode 100644
+index 00000000..97c6fcbb
+--- /dev/null
++++ b/plugins/design-control/src/__tests__/provenance/derived.test.ts
+@@ -0,0 +1,146 @@
++import { describe, it, expect, afterEach } from 'vitest';
++import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
++import { tmpdir } from 'node:os';
++import { join } from 'node:path';
++import {
++  recordDerivation,
++  loadProvenance,
++  checkDerivedAcceptance,
++  wireframeDroveImplementation,
++  recordDrivingWireframe,
++} from '@/provenance/derived';
++
++const dirs: string[] = [];
++afterEach(() => {
++  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
++});
++
++function freshDir(): string {
++  const dir = mkdtempSync(join(tmpdir(), 'dc-prov-'));
++  dirs.push(dir);
++  return dir;
++}
++
++const draftHtml =
++  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>' +
++  '<link rel="stylesheet" href="sketch-kit.css"></head>' +
++  '<body class="sk sk-theme-grayscale"><h1>Derived from live surface</h1></body></html>';
++
++describe('recordDerivation', () => {
++  it('writes the auto-derived snapshot AND the provenance sidecar at derivation time', () => {
++    const dir = freshDir();
++    const prov = recordDerivation({
++      dir,
++      surfaceId: 'studio-content-browser',
++      derivedHtml: draftHtml,
++      source: 'http://localhost:4321/dev/editorial-studio',
++      derivedAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    expect(prov.mode).toBe('derived');
++    const names = readdirSync(dir);
++    expect(names).toContain('studio-content-browser.derived-snapshot.html');
++    expect(names).toContain('studio-content-browser.provenance.json');
++    expect(readFileSync(join(dir, 'studio-content-browser.derived-snapshot.html'), 'utf8')).toBe(draftHtml);
++  });
++
++  it('round-trips through loadProvenance (zod-validated)', () => {
++    const dir = freshDir();
++    recordDerivation({
++      dir,
++      surfaceId: 'scrapbook-drawer',
++      derivedHtml: draftHtml,
++      source: 'route /dev/scrapbook',
++      derivedAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    const prov = loadProvenance(dir, 'scrapbook-drawer');
++    expect(prov.surfaceId).toBe('scrapbook-drawer');
++    expect(prov.mode).toBe('derived');
++    if (prov.mode !== 'derived') throw new Error('unreachable');
++    expect(prov.derived.source).toBe('route /dev/scrapbook');
++    expect(prov.derived.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
++  });
++});
++
++describe('loadProvenance fail-loud paths', () => {
++  it('throws a descriptive error when the sidecar is missing', () => {
++    expect(() => loadProvenance(freshDir(), 'nope')).toThrow(/provenance/i);
++  });
++
++  it('throws on a malformed sidecar (no silent fallback)', () => {
++    const dir = freshDir();
++    writeFileSync(join(dir, 'bad.provenance.json'), '{"mode":"derived"}');
++    expect(() => loadProvenance(dir, 'bad')).toThrow();
++  });
++});
++
++describe('checkDerivedAcceptance — acceptance requires a recorded operator edit', () => {
++  it('rejects a byte-identical accepted artifact (state transition alone is not an edit)', () => {
++    const dir = freshDir();
++    recordDerivation({
++      dir,
++      surfaceId: 's1',
++      derivedHtml: draftHtml,
++      source: 'live surface',
++      derivedAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    const result = checkDerivedAcceptance(dir, 's1', draftHtml);
++    expect(result.ok).toBe(false);
++    expect(result.findings.map((f) => f.rule)).toContain('derived-unedited');
++  });
++
++  it('accepts once the operator edit produces a non-empty diff against the stored snapshot', () => {
++    const dir = freshDir();
++    recordDerivation({
++      dir,
++      surfaceId: 's1',
++      derivedHtml: draftHtml,
++      source: 'live surface',
++      derivedAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    const edited = draftHtml.replace('Derived from live surface', 'Entry list, regrouped by lane');
++    expect(checkDerivedAcceptance(dir, 's1', edited).ok).toBe(true);
++  });
++
++  it('fails loud when the stored snapshot was tampered after recording (hash mismatch)', () => {
++    const dir = freshDir();
++    recordDerivation({
++      dir,
++      surfaceId: 's1',
++      derivedHtml: draftHtml,
++      source: 'live surface',
++      derivedAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    writeFileSync(join(dir, 's1.derived-snapshot.html'), draftHtml + '<!-- tampered -->');
++    expect(() => checkDerivedAcceptance(dir, 's1', 'whatever')).toThrow(/snapshot|hash/i);
++  });
++
++  it('does not gate a driving wireframe (the derived gate is mode-scoped)', () => {
++    const dir = freshDir();
++    recordDrivingWireframe({
++      dir,
++      surfaceId: 'fresh',
++      derivedAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    expect(checkDerivedAcceptance(dir, 'fresh', draftHtml).ok).toBe(true);
++  });
++});
++
++describe('wireframeDroveImplementation', () => {
++  it('is true for a driving wireframe and FALSE for a derived one (even an accepted one)', () => {
++    const dir = freshDir();
++    const derived = recordDerivation({
++      dir,
++      surfaceId: 'd',
++      derivedHtml: draftHtml,
++      source: 'live surface',
++      derivedAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    const driving = recordDrivingWireframe({
++      dir,
++      surfaceId: 'w',
++      derivedAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    expect(wireframeDroveImplementation(derived)).toBe(false);
++    expect(wireframeDroveImplementation(driving)).toBe(true);
++  });
++});
+diff --git a/plugins/design-control/src/authoring/check-wireframe-cli.ts b/plugins/design-control/src/authoring/check-wireframe-cli.ts
+new file mode 100644
+index 00000000..3838653a
+--- /dev/null
++++ b/plugins/design-control/src/authoring/check-wireframe-cli.ts
+@@ -0,0 +1,12 @@
++/**
++ * Process entry for `bin/check-wireframe`. All behavior lives in
++ * {@link runCheckWireframe} (tested directly); this file only wires argv and
++ * the process exit code.
++ */
++
++import { runCheckWireframe } from '@/authoring/lint-file';
++
++process.exitCode = runCheckWireframe(process.argv.slice(2), {
++  out: (line) => console.log(line),
++  err: (line) => console.error(line),
++});
+diff --git a/plugins/design-control/src/authoring/index.ts b/plugins/design-control/src/authoring/index.ts
+new file mode 100644
+index 00000000..c6773979
+--- /dev/null
++++ b/plugins/design-control/src/authoring/index.ts
+@@ -0,0 +1,5 @@
++/**
++ * Public surface of the wireframe-authoring path. Import via `@/authoring`.
++ */
++
++export { type CliIo, lintWireframeFile, runCheckWireframe } from '@/authoring/lint-file';
+diff --git a/plugins/design-control/src/authoring/lint-file.ts b/plugins/design-control/src/authoring/lint-file.ts
+new file mode 100644
+index 00000000..310dc89c
+--- /dev/null
++++ b/plugins/design-control/src/authoring/lint-file.ts
+@@ -0,0 +1,68 @@
++/**
++ * File-level entry to the `check-mockup-lofi` lint — the enforcement seam the
++ * `/design-control:wireframe` authoring skill (and the `bin/check-wireframe`
++ * shim) route EVERY wireframe draft through, manual or engine-authored alike.
++ *
++ * This is deliberately a thin composition of the existing axes — axis 1
++ * (element/attribute allowlist) + axis 1.5 (stylesheet identity pin) + the
++ * codepoint allowlist — via `lintWireframe`. No parallel lint path: the skill
++ * and the library agree by construction because they call the same pipeline.
++ */
++
++import { readFileSync } from 'node:fs';
++import { dirname, resolve } from 'node:path';
++import { lintWireframe } from '@/lint/check-mockup-lofi';
++import { buildSketchKitPin } from '@/lint/stylesheet-pin';
++import type { LintResult } from '@/lint/types';
++
++/**
++ * Lint a wireframe FILE: read it, build the sketch-kit identity pin against the
++ * file's own directory (the conventional layout — the kit copy sits next to the
++ * wireframe), and run the full pinned lint. Fails loud on an unreadable file —
++ * a missing wireframe is an error, never a clean verdict.
++ */
++export function lintWireframeFile(filePath: string): LintResult {
++  const absolute = resolve(filePath);
++  const html = readFileSync(absolute, 'utf8');
++  return lintWireframe(html, { stylesheetPin: buildSketchKitPin(dirname(absolute)) });
++}
++
++/** Line-oriented output sink, injected so the CLI core is testable as a function. */
++export interface CliIo {
++  out(line: string): void;
++  err(line: string): void;
++}
++
++const USAGE = 'usage: check-wireframe <wireframe.html>';
++
++/**
++ * CLI core behind `bin/check-wireframe`. Exit-code contract (the skill's gate):
++ *   0 — lint green (zero findings)
++ *   1 — findings present, or the file could not be read (descriptive error;
++ *       never a fabricated verdict)
++ *   2 — usage error
++ */
++export function runCheckWireframe(argv: readonly string[], io: CliIo): number {
++  if (argv.length !== 1) {
++    io.err(USAGE);
++    return 2;
++  }
++  const filePath = argv[0];
++  let result: LintResult;
++  try {
++    result = lintWireframeFile(filePath);
++  } catch (error) {
++    io.err(error instanceof Error ? error.message : String(error));
++    return 1;
++  }
++  if (result.ok) {
++    io.out(`${filePath}: lint green — 0 findings`);
++    return 0;
++  }
++  for (const finding of result.findings) {
++    const where = [finding.tag, finding.attr].filter(Boolean).join(' ');
++    io.err(`${finding.rule}${where ? ` (${where})` : ''}: ${finding.message}`);
++  }
++  io.err(`${filePath}: ${result.findings.length} finding(s)`);
++  return 1;
++}
+diff --git a/plugins/design-control/src/provenance/derived.ts b/plugins/design-control/src/provenance/derived.ts
+new file mode 100644
+index 00000000..6e5c2987
+--- /dev/null
++++ b/plugins/design-control/src/provenance/derived.ts
+@@ -0,0 +1,185 @@
++/**
++ * Wireframe provenance — the retroactive (`derived`) path.
++ *
++ * A wireframe is either DRIVING (authored before the implementation; the
++ * artifact that drove the change) or DERIVED (reverse-engineered from an
++ * already-existing surface). The derived path exists so a legacy surface can be
++ * brought under the discipline, but with two hard properties from the spec:
++ *
++ *  1. The auto-derived draft is SNAPSHOTTED at derivation time, alongside its
++ *     provenance, so acceptance has a baseline to diff against.
++ *  2. Accepting a `derived` artifact REQUIRES a recorded operator edit — a
++ *     non-empty byte diff between the stored snapshot and the accepted version.
++ *     A bare state transition is not an edit.
++ *
++ * And a `derived` artifact NEVER satisfies a "wireframe drove implementation"
++ * claim ({@link wireframeDroveImplementation}) — provenance distinguishes the
++ * two modes precisely so the claim cannot be laundered through acceptance.
++ *
++ * Sidecar layout (per surface, in the operator-chosen provenance dir):
++ *   <surfaceId>.provenance.json          — zod-validated provenance record
++ *   <surfaceId>.derived-snapshot.html    — the auto-derived draft (derived only)
++ */
++
++import { existsSync, readFileSync, writeFileSync } from 'node:fs';
++import { join } from 'node:path';
++import { createHash } from 'node:crypto';
++import { z } from 'zod';
++
++const PROVENANCE_VERSION = 1;
++
++const sha256Hex = (content: string): string => createHash('sha256').update(content).digest('hex');
++
++const drivingSchema = z.object({
++  version: z.literal(PROVENANCE_VERSION),
++  surfaceId: z.string().min(1),
++  mode: z.literal('driving'),
++  createdAt: z.string().datetime(),
++});
++
++const derivedSchema = z.object({
++  version: z.literal(PROVENANCE_VERSION),
++  surfaceId: z.string().min(1),
++  mode: z.literal('derived'),
++  createdAt: z.string().datetime(),
++  derived: z.object({
++    /** Filename (dir-relative) of the snapshot stored at derivation time. */
++    snapshotFile: z.string().min(1),
++    /** sha256 (hex) of the snapshot bytes as recorded — tamper evidence. */
++    snapshotSha256: z.string().regex(/^[0-9a-f]{64}$/),
++    /** What the draft was derived FROM (route, URL, file — operator-meaningful). */
++    source: z.string().min(1),
++  }),
++});
++
++const provenanceSchema = z.discriminatedUnion('mode', [drivingSchema, derivedSchema]);
++
++export type WireframeProvenance = z.infer<typeof provenanceSchema>;
++
++export interface ProvenanceFinding {
++  readonly rule: 'derived-unedited';
++  readonly message: string;
++}
++
++export interface AcceptanceResult {
++  readonly ok: boolean;
++  readonly findings: readonly ProvenanceFinding[];
++}
++
++const sidecarPath = (dir: string, surfaceId: string): string =>
++  join(dir, `${surfaceId}.provenance.json`);
++
++function writeProvenance(dir: string, provenance: WireframeProvenance): void {
++  writeFileSync(
++    sidecarPath(dir, provenance.surfaceId),
++    JSON.stringify(provenance, null, 2) + '\n',
++  );
++}
++
++/** Record a DRIVING wireframe's provenance (the authored-first path). */
++export function recordDrivingWireframe(input: {
++  dir: string;
++  surfaceId: string;
++  derivedAt?: Date;
++}): WireframeProvenance {
++  const provenance: WireframeProvenance = {
++    version: PROVENANCE_VERSION,
++    surfaceId: input.surfaceId,
++    mode: 'driving',
++    createdAt: (input.derivedAt ?? new Date()).toISOString(),
++  };
++  writeProvenance(input.dir, provenance);
++  return provenance;
++}
++
++/**
++ * Record a DERIVED draft at derivation time: store the auto-derived snapshot
++ * AND the provenance sidecar in one move, so the acceptance diff always has its
++ * baseline. The snapshot hash is recorded for tamper evidence.
++ */
++export function recordDerivation(input: {
++  dir: string;
++  surfaceId: string;
++  derivedHtml: string;
++  source: string;
++  derivedAt?: Date;
++}): WireframeProvenance {
++  const snapshotFile = `${input.surfaceId}.derived-snapshot.html`;
++  writeFileSync(join(input.dir, snapshotFile), input.derivedHtml);
++  const provenance: WireframeProvenance = {
++    version: PROVENANCE_VERSION,
++    surfaceId: input.surfaceId,
++    mode: 'derived',
++    createdAt: (input.derivedAt ?? new Date()).toISOString(),
++    derived: {
++      snapshotFile,
++      snapshotSha256: sha256Hex(input.derivedHtml),
++      source: input.source,
++    },
++  };
++  writeProvenance(input.dir, provenance);
++  return provenance;
++}
++
++/** Load + zod-validate a surface's provenance sidecar. Fails loud when absent/malformed. */
++export function loadProvenance(dir: string, surfaceId: string): WireframeProvenance {
++  const path = sidecarPath(dir, surfaceId);
++  if (!existsSync(path)) {
++    throw new Error(
++      `No provenance sidecar for surface "${surfaceId}" at ${path}. ` +
++        `Record provenance at authoring/derivation time (recordDrivingWireframe / recordDerivation).`,
++    );
++  }
++  return provenanceSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
++}
++
++/**
++ * The acceptance gate for `derived` artifacts: the accepted version must carry
++ * a recorded operator edit — a non-empty byte diff against the snapshot stored
++ * at derivation time. Driving wireframes pass through (the gate is mode-scoped).
++ * Fails loud if the stored snapshot no longer matches its recorded hash — a
++ * tampered baseline cannot certify an edit.
++ */
++export function checkDerivedAcceptance(
++  dir: string,
++  surfaceId: string,
++  acceptedHtml: string,
++): AcceptanceResult {
++  const provenance = loadProvenance(dir, surfaceId);
++  if (provenance.mode !== 'derived') {
++    return { ok: true, findings: [] };
++  }
++  const snapshotPath = join(dir, provenance.derived.snapshotFile);
++  const snapshot = readFileSync(snapshotPath, 'utf8');
++  if (sha256Hex(snapshot) !== provenance.derived.snapshotSha256) {
++    throw new Error(
++      `Derived snapshot ${snapshotPath} does not match the hash recorded at derivation time — ` +
++        `the baseline was modified after recording, so the operator-edit diff cannot be trusted. ` +
++        `Re-derive the draft to re-establish a baseline.`,
++    );
++  }
++  if (acceptedHtml === snapshot) {
++    return {
++      ok: false,
++      findings: [
++        {
++          rule: 'derived-unedited',
++          message:
++            `Surface "${surfaceId}": the accepted artifact is byte-identical to the auto-derived ` +
++            `snapshot. Accepting a derived wireframe requires a recorded operator edit ` +
++            `(non-empty diff against the derivation-time snapshot), not just a state transition.`,
++        },
++      ],
++    };
++  }
++  return { ok: true, findings: [] };
++}
++
++/**
++ * Whether this wireframe supports a "wireframe drove implementation" claim.
++ * Only a DRIVING wireframe does; a `derived` one never does, edited or not —
++ * it was reverse-engineered from the surface it would be claiming to have driven.
++ */
++export function wireframeDroveImplementation(provenance: WireframeProvenance): boolean {
++  return provenance.mode === 'driving';
++}
+diff --git a/plugins/design-control/src/provenance/index.ts b/plugins/design-control/src/provenance/index.ts
+new file mode 100644
+index 00000000..3106074f
+--- /dev/null
++++ b/plugins/design-control/src/provenance/index.ts
+@@ -0,0 +1,14 @@
++/**
++ * Public surface of the wireframe-provenance module. Import via `@/provenance`.
++ */
++
++export {
++  type WireframeProvenance,
++  type ProvenanceFinding,
++  type AcceptanceResult,
++  recordDrivingWireframe,
++  recordDerivation,
++  loadProvenance,
++  checkDerivedAcceptance,
++  wireframeDroveImplementation,
++} from '@/provenance/derived';
+
+
+## What to look for
+
+- **Correctness bugs** — logic errors, off-by-one, null/undefined paths, race conditions, missing error handling, swallowed exceptions.
+- **Design issues** — coupling between layers that should be independent, leaking abstractions, primitives that should compose but don't, configuration that should be data ending up as code.
+- **Missed edge cases** — what happens with empty input? Maximum input? Concurrent calls? Partial failure? Network unavailability? Operator interrupt mid-operation? What is the behavior on a fresh install vs. an upgrade?
+- **Code-quality concerns** — files growing past a reasonable cap, names that don't reveal intent, dead code, duplicated logic, magic numbers without explanation, tests that don't test the contract they claim to test.
+- **Cross-cutting impact** — does this diff touch a surface that other surfaces depend on? Are those other surfaces updated? Are migrations needed? Are doctor rules / schemas / validators updated to match the new shape?
+- **Documentation drift** — does the README / SKILL.md / PRD describe the behavior the code actually implements? If the spec changed, did the implementation? If the implementation changed, did the spec?
+- **Operator-discipline traps** — placeholder comments, swallowed errors, hardcoded paths/values that should be configurable, fallbacks that hide failure modes, mock data outside test code. These are bug-factories per project guidelines.
+
+## Output format
+
+For each finding you surface, emit ONE markdown block in this exact shape:
+
+```
+### <heading: one-line summary of the finding>
+
+Finding-ID: AUDIT-BARRAGE-<your-model-name>-<NN>
+Status:     open
+Severity:   <blocking | high | medium | low | informational>
+Surface:    <repo-relative-path:line-range> OR <description of the surface if not anchored to a single file>
+
+<one-to-three paragraphs of body: what the finding is, why it matters, what evidence you relied on, what a reasonable fix would look like. Be specific. Cite line numbers from the diff. If the finding is structural / cross-file, name every file affected.>
+```
+
+Number the findings sequentially (`-01`, `-02`, ...).
+
+**Severity — rate each finding by downstream blast-radius:** the consequence if a downstream consumer acts on the audited surface *as written*. The consumer may be an adopter running the code, or — especially for a spec — an AI agent building **unattended** from it, with no human to catch a wrong reading. Rate by what would actually happen if this shipped as-is, **not by how alarming the finding feels**. State the blast-radius reasoning in the finding body for every finding, at every level.
+
+- `blocking` — acting on it as-written breaks the feature's stated goals in obvious ways; OR (for a spec) the more natural reading an agent reaches first is the wrong one, so it will likely be built wrong by default and nothing in the artifact corrects it.
+- `high` — a correctness/safety defect a consumer will hit; OR a spec contradiction/ambiguity where the readings are roughly equally plausible and the artifact doesn't disambiguate — an agent might build either, including the wrong one.
+- `medium` — a design issue that compounds over time; OR a spec inconsistency a reasonable consumer would resolve correctly anyway (readings barely diverge, or context makes the intended one obvious).
+- `low` — hygiene; cosmetic wording with no behavioral or implementation consequence.
+- `informational` — context worth seeing, not itself a defect.
+
+**Calibrate by consequence, not by alarm.** A genuine contradiction a reader would obviously resolve the right way is at most `medium`. A quietly-plausible wrong reading an agent would actually build is `high`/`blocking` even if it looks minor. A spec's internal consistency is load-bearing — it is the input to an unattended build.
+
+## If you find nothing — say so explicitly
+
+If you walk the diff carefully and find no findings worth surfacing, emit ONE block in this shape instead:
+
+```
+### No findings
+
+Finding-ID: AUDIT-BARRAGE-<your-model-name>-CLEAN
+Status:     open
+Severity:   informational
+Surface:    (the entire diff)
+
+I walked the diff for the feature named above and found no findings worth surfacing. My specific reasoning: <three-to-five sentences explaining what you checked, why those checks came back clean, and what you would have flagged if it had been present.>
+```
+
+**Do not pad with weak findings.** A confident "I checked X, Y, Z and they are clean for these reasons" is more useful to the operator than three vague low-severity notes. The cross-model diversity gives the operator independent signal; an empty clean report from your CLI is itself a signal when paired with findings from your siblings.
+
+## Hard constraints
+
+- **No deferral phrases.** Don't write phrases like "fix later", "address in a follow-up", or other commitments to deferred work. The dispatch-wrapper rejects these as bug-factories. If you spot a deferral phrase IN the diff, surface it as a finding.
+- **Anchor findings to evidence.** A finding that says "this might be a problem" without naming the specific file + line is not actionable. Name the surface, quote the relevant code, explain what's wrong.
+- **One issue per finding block.** Don't bundle multiple concerns into one entry; the operator triages each block as a discrete signal.
+- **Provenance is your model name.** Replace `<your-model-name>` in the Finding-ID with the CLI you are (`claude`, `codex`, `gemini`, etc.). This is how the operator joins findings across models.
diff --git a/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/claude.md b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/claude.md
new file mode 100644
index 00000000..3bc3cefb
--- /dev/null
+++ b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/claude.md
@@ -0,0 +1,65 @@
+### Provenance mode can be silently rewritten — a later `recordDrivingWireframe` call overwrites a `derived` record and launders the exact claim the module exists to prevent
+
+Finding-ID: AUDIT-BARRAGE-claude-01
+Status:     open
+Severity:   medium
+Surface:    plugins/design-control/src/provenance/derived.ts:84-98 (recordDrivingWireframe), 100-127 (recordDerivation), 70-75 (writeProvenance)
+
+`writeProvenance` unconditionally `writeFileSync`s `<surfaceId>.provenance.json`. Nothing in `recordDrivingWireframe` or `recordDerivation` checks whether a sidecar already exists, so a surface recorded as `derived` (with its snapshot + hash baseline) can be flipped to `driving` with a single later call — after which `wireframeDroveImplementation` returns `true` and `checkDerivedAcceptance` passes unconditionally (lines 144-146 short-circuit on non-derived mode). The module's own header (lines 15-17) states the design goal: *"provenance distinguishes the two modes precisely so the claim cannot be laundered through acceptance."* The overwrite path is a one-call laundering vector that bypasses acceptance entirely. The derivation-time snapshot is also silently orphaned (the `.derived-snapshot.html` stays on disk but nothing references it), erasing the audit trail.
+
+Blast radius: this is a library invoked under skill direction, so it requires a wrong call rather than happening by default — but the population this discipline explicitly defends against is an unattended agent looking for the path of least resistance past a failing `derived-unedited` gate, and the cheapest such path is exactly this call. It doesn't break the feature when used correctly, hence medium rather than high. A reasonable fix: `writeProvenance` (or both record functions) fails loud when a sidecar already exists for the surface, with mode transitions requiring an explicit, separately-named operation (or at minimum refusing the `derived → driving` direction outright, since that transition is semantically never legitimate).
+
+### `surfaceId` is interpolated into filesystem paths with no filename validation — `..` escapes the provenance dir, `/` breaks round-tripping
+
+Finding-ID: AUDIT-BARRAGE-claude-02
+Status:     open
+Severity:   medium
+Surface:    plugins/design-control/src/provenance/derived.ts:66-67 (sidecarPath), 108 (snapshotFile), 31, 44 (zod schemas)
+
+The zod schemas constrain `surfaceId` only to `z.string().min(1)`, but the id is used directly to build paths: `join(dir, `${surfaceId}.provenance.json`)` and `${surfaceId}.derived-snapshot.html`. A `surfaceId` of `../something` writes the sidecar and snapshot *outside* the operator-chosen provenance directory; an id containing `/` (e.g. `studio/content-browser` — an entirely plausible operator-meaningful id, given the codebase's route-style naming like `/dev/editorial-studio` which appears in this very diff's tests as a `source` value) either ENOENTs on write or silently lands in an unintended subdirectory. `loadProvenance` joins identically, so the misplacement round-trips invisibly rather than failing loud.
+
+Blast radius: the id is operator/agent-supplied prose, not attacker input, so the realistic failure is accidental misplacement and confusing ENOENTs rather than exploitation — a design defect that compounds as more surfaces are recorded, hence medium. Fix: validate `surfaceId` against a portable-filename pattern (e.g. `/^[a-z0-9][a-z0-9._-]*$/i`) in the zod schema and at record time, failing loud with a message naming the constraint — consistent with the project's no-fallbacks rule.
+
+### The derived-acceptance gate and provenance recording have no executable firing surface — the skill directs the agent to call raw TypeScript functions
+
+Finding-ID: AUDIT-BARRAGE-claude-03
+Status:     open
+Severity:   medium
+Surface:    plugins/design-control/skills/wireframe/SKILL.md:64-72 (step 6); plugins/design-control/src/provenance/derived.ts (whole module); plugins/design-control/bin/ (missing sibling to check-wireframe)
+
+The lint gate got a proper seam: `bin/check-wireframe` → `check-wireframe-cli.ts` → tested `runCheckWireframe`, and SKILL.md step 5 quotes the exact command. The provenance path got none. SKILL.md step 6 instructs: *"record it via `recordDrivingWireframe` (`@/provenance`)"* — but an agent executing the skill has no documented way to invoke a TypeScript export. In practice it will improvise a `tsx -e` one-liner per invocation, which is precisely the "ad-hoc shell instead of proper scripts under `bin/`" anti-pattern the repo's plugin conventions forbid — or it will quietly skip the step, since unlike the lint there is no exit-code gate to fail. The same applies to `checkDerivedAcceptance`: it is a "non-negotiable" acceptance gate per the spec, yet nothing in the diff (no bin verb, no skill step, no caller anywhere) ever fires it. The plugin's own thesis, quoted in this SKILL.md (lines 13-16), is that *"policy is enforced by a process, not a rule"* — the lo-fi property got the process; the provenance property got a rule.
+
+Blast radius: provenance recording will be inconsistent or absent across real wireframes, and the derived gate exists only as a tested library function nobody calls — the discipline degrades silently rather than breaking loudly, which is the compounding-design-issue shape, hence medium. Fix: a `bin/record-provenance` (or `bin/wireframe-provenance` with `record-driving | record-derived | check-acceptance` subcommands) mirroring the `check-wireframe` shim pattern, with SKILL.md steps quoting the commands the way step 5 does.
+
+### A `driving` provenance record carries no binding to the artifact it certifies — no filename, no hash
+
+Finding-ID: AUDIT-BARRAGE-claude-04
+Status:     open
+Severity:   medium
+Surface:    plugins/design-control/src/provenance/derived.ts:31-36 (drivingSchema) vs 38-53 (derivedSchema)
+
+The `derived` record stores `snapshotFile`, `snapshotSha256`, and `source` — enough to identify and tamper-check its baseline. The `driving` record stores only `surfaceId`, `mode`, and `createdAt`. `wireframeDroveImplementation` therefore certifies a claim ("this wireframe drove the implementation") about an artifact the record cannot identify: the wireframe HTML next to the sidecar can be wholly replaced after recording and the claim still holds, with no tamper evidence of the kind the derived path deliberately built (lines 148-154). The asymmetry is visible side-by-side in the two schemas.
+
+Blast radius: a downstream consumer (the future referee, or any "did a wireframe drive this change?" check) gets a `true` that is unfalsifiable against the on-disk artifact. Nothing breaks today, but every claim recorded under this schema is permanently unverifiable, and a later schema fix can't retro-bind old records — the cost compounds with adoption, hence medium. Fix: record the wireframe's filename and sha256 at `recordDrivingWireframe` time (the wireframe file already exists at that point per SKILL.md step ordering — lint at step 5 precedes provenance at step 6), and have `wireframeDroveImplementation` (or a sibling verifier) check the hash the way `checkDerivedAcceptance` checks the snapshot.
+
+### `recordDrivingWireframe` takes a parameter named `derivedAt` for a wireframe that is by definition not derived
+
+Finding-ID: AUDIT-BARRAGE-claude-05
+Status:     open
+Severity:   low
+Surface:    plugins/design-control/src/provenance/derived.ts:85-88; src/__tests__/provenance/derived.test.ts:118-122
+
+The driving-path recorder's optional timestamp input is named `derivedAt` (`input: { dir; surfaceId; derivedAt?: Date }`), feeding the sidecar field `createdAt`. The name contradicts the mode it records — "derived" is the *other* mode, and the module spends its entire header explaining why the two must never be confused. The tests dutifully pass `derivedAt` when recording a driving wireframe (derived.test.ts lines 118-122), which reads as a category error at every call site.
+
+Blast radius: no behavioral consequence — the value lands in `createdAt` correctly — but this is an exported public API (`@/provenance`), so the misleading name propagates to every future caller and to the eventual `bin/` verb's flag naming. Hence low. Fix: rename to `createdAt?` (or `at?`) in both record functions for symmetry, while the call-site count is still two test files.
+
+### `loadProvenance` does not verify the sidecar's inner `surfaceId` matches the requested one
+
+Finding-ID: AUDIT-BARRAGE-claude-06
+Status:     open
+Severity:   low
+Surface:    plugins/design-control/src/provenance/derived.ts:129-139
+
+`loadProvenance(dir, surfaceId)` resolves the file by name and zod-validates its shape, but never asserts `parsed.surfaceId === surfaceId`. A sidecar copied or renamed to another surface's filename (an easy mistake when seeding a second surface from a first) loads cleanly and flows into `checkDerivedAcceptance`, whose finding message then reports the *argument's* surface id (line 158) while gating against the *other* surface's snapshot and hash — a confusing mixed-identity verdict instead of a loud failure.
+
+Blast radius: requires a file-management mistake to trigger, and the resulting behavior is confusing rather than silently wrong in a damaging direction (the hash check still fires against whatever snapshot the record names). Hence low. Fix: one equality check after parse, throwing with both ids in the message.
diff --git a/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/codex.md b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/codex.md
new file mode 100644
index 00000000..d218939a
--- /dev/null
+++ b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/codex.md
@@ -0,0 +1,10 @@
+### `recordDerivation` can leave an orphaned snapshot if sidecar write fails
+
+Finding-ID: AUDIT-BARRAGE-codex-01  
+Status:     open  
+Severity:   medium  
+Surface:    `plugins/design-control/src/provenance/derived.ts:102-118`
+
+`recordDerivation` writes `<surfaceId>.derived-snapshot.html` first, then writes `<surfaceId>.provenance.json`. If the process is interrupted, the disk fills, permissions change, or JSON sidecar write otherwise fails after line 104, the directory is left with a snapshot but no valid provenance record. The workplan says `recordDerivation` “writes snapshot + zod-validated sidecar in one move”; this implementation is sequential non-atomic writes.
+
+The blast radius is medium: normal consumers will usually succeed, but the failure mode creates ambiguous provenance state in the operator’s artifact directory. A later unattended agent or operator may see the snapshot and assume derivation was recorded, while `loadProvenance` fails loud because the sidecar is absent. A reasonable fix is to write both artifacts via temporary files and atomic renames, with cleanup on failure, or to write the sidecar first with a temporary snapshot reference and only promote both names once both writes have succeeded.
diff --git a/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/gemini.md b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/gemini.md
new file mode 100644
index 00000000..e69de29b
diff --git a/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/claude.txt b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/claude.txt
new file mode 100644
index 00000000..e69de29b
diff --git a/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/codex.txt b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/codex.txt
new file mode 100644
index 00000000..3e276314
--- /dev/null
+++ b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/codex.txt
@@ -0,0 +1,886 @@
+Reading prompt from stdin...
+OpenAI Codex v0.136.0
+--------
+workdir: /Users/orion/work/deskwork-work/design-control
+model: gpt-5.5
+provider: openai
+approval: never
+sandbox: workspace-write [workdir, /tmp, $TMPDIR]
+reasoning effort: medium
+reasoning summaries: none
+session id: 019eb540-cb80-7192-abf9-aa0d161422fa
+--------
+user
+# Audit-barrage — multi-model audit prompt template
+
+You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface the kinds of defects listed under **What to look for** below, in the work product captured under **Under audit**.
+
+You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.
+
+## Feature under audit
+
+design-control
+
+## Feature scope (workplan / PRD summary)
+
+Governance pass over the just-implemented work for feature 'design-control', diffed against HEAD~1. The differentiated back half audits a plan it did not author or execute.
+
+## Commit subjects in the audited range
+
+9639b445 feat(design-control): wireframe authoring skill + derived-provenance path — Phase 1 complete
+
+
+## Recent audit-log excerpt (prior findings on this feature)
+
+Use this to avoid re-reporting findings that have already been triaged. If a finding was previously dispositioned (`closed`, `won't-fix`, `accepted-trade-off`), don't re-litigate the disposition; only surface a new instance if the underlying shape regressed.
+
+Finding-ID: AUDIT-20260610-66 (round-20 gpt-5-01 MED + gpt-5-02 LOW)
+Status:     fixed-0e5b4b21 (2026-06-10; fieldset/legend allowlisted; required joins the structural-state attrs)
+Severity:   medium
+Surface:    plugins/design-control/src/lint/allowlist.ts
+Direction:  false-positive
+
+## CONVERGENCE RECORD — 2026-06-10 lint adversarial barrage loop (rounds 1–20)
+
+**Stop criterion met:** two consecutive zero-HIGH rounds (19 + 20), per the
+PRD's operator-set criterion. Twenty rounds fired via the committed
+re-runnable process (audit/run-lint-barrage.sh → stackctl audit-barrage).
+
+**Loop totals:**
+- Findings recorded: AUDIT-20260610-01 .. -66 (66 IDs; same-mechanism
+  cross-model/cross-finding folds applied per the TF-002 rule)
+- Dispositions: every finding fixed-<sha>, acknowledged-<ref>, superseded, or
+  informational — zero open, zero parked-without-record
+- Test corpus: 151 → 286 (every genuine defeat is a deterministic fixture;
+  every accepted boundary/residual is a documented BOUNDARY fixture)
+- Two of the loop's own earlier dispositions were REVERSED on later evidence
+  (AUDIT-14 query acceptance → AUDIT-45; AUDIT-03 absent-fonts-clean →
+  AUDIT-23) — the protocol audited its own fixes, not just the original code
+- Declared scope boundaries (in the lint docstring + the adversarial prompt,
+  each pinned by fixtures): (1) punctuation FLOW art mechanically gated;
+  letter-composed imagery and grid-diluted punctuation = referee's gross-class
+  domain; (2) UA default rendering of semantic HTML = the unstyled baseline;
+  (3) imagery composed by geometric placement of sanctioned atoms = referee's
+  domain
+- Fleet note: claude contributed rounds 1(retry)+2 then was 0-byte for 18
+  consecutive runs (deskwork issue 447); from round 3 the loop ran on codex
+  alone, so cross-model agreement was only available in rounds 1–2. The
+  convergence verdict is correspondingly single-family — re-validation with a
+  restored fleet is the natural post-447 follow-up.
+
+**Verification discipline held throughout:** every defeating input was
+executed against the real lint before recording (zero auditor predictions
+trusted); every fix was RED-first with the verbatim defeating input as the
+fixture; two self-caught transcription errors in fix shas were corrected in
+dedicated commits.
+
+
+## Under audit
+
+The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn't).
+
+diff --git a/plugins/design-control/bin/check-wireframe b/plugins/design-control/bin/check-wireframe
+new file mode 100755
+index 00000000..b5919fb3
+--- /dev/null
++++ b/plugins/design-control/bin/check-wireframe
+@@ -0,0 +1,25 @@
++#!/bin/sh
++# check-wireframe <wireframe.html> — run the full pinned check-mockup-lofi lint
++# against a wireframe file. Exit codes: 0 lint-green, 1 findings/error, 2 usage.
++# Logic lives in src/authoring/lint-file.ts (tested); this shim only locates the
++# workspace tsx runner (hoisted node_modules in the monorepo) and dispatches.
++set -eu
++
++PLUGIN_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
++
++dir="$PLUGIN_ROOT"
++TSX=""
++while [ "$dir" != "/" ]; do
++  if [ -x "$dir/node_modules/.bin/tsx" ]; then
++    TSX="$dir/node_modules/.bin/tsx"
++    break
++  fi
++  dir=$(dirname -- "$dir")
++done
++
++if [ -z "$TSX" ]; then
++  echo "check-wireframe: tsx runner not found in any node_modules/.bin above $PLUGIN_ROOT — run npm install first" >&2
++  exit 1
++fi
++
++exec "$TSX" "$PLUGIN_ROOT/src/authoring/check-wireframe-cli.ts" "$@"
+diff --git a/plugins/design-control/skills/wireframe/SKILL.md b/plugins/design-control/skills/wireframe/SKILL.md
+new file mode 100644
+index 00000000..47f432b3
+--- /dev/null
++++ b/plugins/design-control/skills/wireframe/SKILL.md
+@@ -0,0 +1,86 @@
++---
++name: wireframe
++description: Author a deliberately lo-fi wireframe for a named UI surface change — operator-driven, sketch-kit-based, and lint-enforced (zero check-wireframe findings before the draft may be presented). The optional /frontend-design accelerator routes through the same lint.
++---
++
++# /design-control:wireframe `<change>`
++
++Author the **lo-fi wireframe** for one named surface change. The wireframe is
++the UX-*spirit* artifact of the design-control discipline: it works out
++structure, hierarchy, and flow while being structurally incapable of carrying
++visual-design detail — so stale polish can never ship as if intended. Visual
++identity lives in the design-language spec (Phase 2), never here.
++
++> Per the plugin thesis (`DESIGN-DISCIPLINE-THESIS.md`): policy is enforced by a
++> process, not a rule. The lo-fi property is not a convention the author is
++> trusted to follow — it is mechanically enforced by the `check-mockup-lofi`
++> lint, which every draft MUST pass before it may be presented.
++
++## Arguments
++
++- `<change>` (required) — a short operator-meaningful brief of the surface
++  change (e.g. `regroup the content browser by lane`). If missing, ask for it
++  (one argument, one prompt).
++
++## Procedure
++
++1. **Resolve the target surface.** Confirm with the operator which surface the
++   change addresses (`surface id` — operator-declared granularity, per the spec's
++   Definitions). One wireframe per change; do not batch surfaces.
++
++2. **Set up the wireframe file.** Create `<surface-id>.html` in the operator's
++   chosen wireframes directory, with the shipped sketch-kit copied alongside it:
++   - copy `assets/sketch-kit/sketch-kit.css` (and `assets/sketch-kit/fonts/` if a
++     font-bearing theme is chosen) next to the wireframe;
++   - exactly ONE `<link rel="stylesheet" href="sketch-kit.css">`;
++   - `<body class="sk sk-theme-<theme>">` — theme is the operator's pick among
++     `marker` / `blueprint` / `grayscale` (default `grayscale`);
++   - the kit's WIREFRAME banner (`.sk-banner`) stays — the artifact self-labels.
++
++3. **Author the wireframe — manual path (default, requires NO engine).** The
++   operator (or the agent under operator direction) writes plain structural HTML
++   using only the `.sk-*` vocabulary and the lint's allowed structural tags.
++   Imagery is the fixed `.sk-img` placeholder; icons are text labels, never
++   emoji; copy uses plain Basic-Latin text. This path never calls the engine
++   preflight — it works with no engine installed.
++
++4. **Optional engine accelerator.** Only if the operator asks for it: gate on
++   `preflightEngine` (`@/engine-adapter`, method `author-wireframe`) — absence
++   fails loud naming the remedy — then request a draft via the engine adapter.
++   **Engine output gets zero trust:** it lands in the same file and is judged by
++   the same lint as a manual draft (a `lint-rejected` response is the defined
++   failure mode; fix or discard, never grandfather).
++
++5. **Lint gate — the non-negotiable step.** Run:
++
++   ```bash
++   plugins/design-control/bin/check-wireframe <path/to/wireframe.html>
++   ```
++
++   - Exit `0` (lint green, zero findings) → the draft may be presented.
++   - Exit `1` → fix every finding and re-run. NEVER present a draft with open
++     findings; NEVER hand-wave a finding as "just lo-fi enough". The lint is the
++     boundary of the lo-fi guarantee.
++
++6. **Record provenance.** This skill authors *driving* wireframes (the artifact
++   precedes the implementation): record it via `recordDrivingWireframe`
++   (`@/provenance`) in the wireframe's directory. A wireframe reverse-engineered
++   from an existing surface is the *derived* path — record it with
++   `recordDerivation` at derivation time instead, and note that acceptance will
++   require a non-empty operator edit against the stored snapshot
++   (`checkDerivedAcceptance`) and the artifact never supports a "wireframe drove
++   implementation" claim.
++
++7. **Present and stop.** Show the operator the lint-green wireframe (path +
++   `0 findings` output). The operator picks/iterates; translation into the
++   design language and implementation are separate steps of the loop, not this
++   skill's job.
++
++## What this skill does NOT do
++
++- It does not style anything — no CSS authoring, no presentational attributes
++  (the lint rejects them anyway).
++- It does not translate to the design language (`translate-design-language`),
++  implement, or referee.
++- It does not skip the lint for engine-authored drafts — same gate, same lint,
++  zero findings.
+diff --git a/plugins/design-control/specs/001-design-control/tasks.md b/plugins/design-control/specs/001-design-control/tasks.md
+index 0d69efb4..a65fd485 100644
+--- a/plugins/design-control/specs/001-design-control/tasks.md
++++ b/plugins/design-control/specs/001-design-control/tasks.md
+@@ -139,13 +139,22 @@ verbatim in substance** — when they drift, the PRD wins.
+       Romanian comma-below, multiline placeholders, cache-busting/percent-encoded/subdirectory kit
+       hrefs, data tables, placeholder rows, prose pages, disclosure blocks, and the boundary
+       fixtures. Suite: 151 → 286.
+-- [ ] `/design-control:wireframe <change>` authoring skill (operator-driven + lint-enforced; the
++- [x] `/design-control:wireframe <change>` authoring skill (operator-driven + lint-enforced; the
+       engine `author-wireframe` method is an optional accelerator routed through the same lint).
+-- [ ] Retroactive path: existing surface → `derived` wireframe/spec; **snapshot the auto-derived
++      **Done — 2026-06-10.** `skills/wireframe/SKILL.md` (manual path needs no engine; the
++      accelerator gates on `preflightEngine` and its output is judged by the same lint) +
++      `@/authoring` (`lintWireframeFile` composes the existing pinned pipeline — no parallel lint
++      path) + `bin/check-wireframe` shim (exit contract 0 green / 1 findings-or-error / 2 usage;
++      logic tested as `runCheckWireframe`, the shim only dispatches). TDD: 9 tests RED first.
++- [x] Retroactive path: existing surface → `derived` wireframe/spec; **snapshot the auto-derived
+       draft at derivation time** (stored alongside provenance) so the edit-diff has a baseline;
+       **acceptance of a `derived` artifact requires a recorded operator edit** (non-empty diff
+       between the stored auto-derived snapshot and the accepted version), not just a state
+       transition; does NOT satisfy a "wireframe drove implementation" claim.
++      **Done — 2026-06-10.** `@/provenance` (`recordDerivation` writes snapshot + zod-validated
++      sidecar in one move; `checkDerivedAcceptance` rejects a byte-identical acceptance with
++      `derived-unedited`, fails loud on a tampered baseline via the recorded sha256;
++      `wireframeDroveImplementation` is true only for `driving` mode). TDD: 9 tests RED first.
+ 
+ **Acceptance:** the engine-adapter **preflight fails loud when `/frontend-design` is absent while
+ manual authoring still works**, and the preflight **precedes the first engine-consuming skill**; the
+diff --git a/plugins/design-control/src/__tests__/authoring/lint-file.test.ts b/plugins/design-control/src/__tests__/authoring/lint-file.test.ts
+new file mode 100644
+index 00000000..891ccae0
+--- /dev/null
++++ b/plugins/design-control/src/__tests__/authoring/lint-file.test.ts
+@@ -0,0 +1,105 @@
++import { describe, it, expect, afterEach } from 'vitest';
++import { mkdtempSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
++import { tmpdir } from 'node:os';
++import { join } from 'node:path';
++import { lintWireframeFile, runCheckWireframe } from '@/authoring/lint-file';
++import { SKETCH_KIT_CSS_PATH, SKETCH_KIT_SAMPLE_PATH } from '@/wireframe-kit/sketch-kit';
++
++const dirs: string[] = [];
++afterEach(() => {
++  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
++});
++
++/** Temp wireframe dir seeded with a genuine copy of the shipped kit CSS. */
++function freshDir(): string {
++  const dir = mkdtempSync(join(tmpdir(), 'dc-lint-file-'));
++  dirs.push(dir);
++  copyFileSync(SKETCH_KIT_CSS_PATH, join(dir, 'sketch-kit.css'));
++  return dir;
++}
++
++const cleanPage =
++  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>' +
++  '<link rel="stylesheet" href="sketch-kit.css"></head>' +
++  '<body class="sk sk-theme-grayscale"><div class="sk-banner">WIREFRAME</div>' +
++  '<h1>Entry list</h1></body></html>';
++
++describe('lintWireframeFile', () => {
++  it('passes the shipped example wireframe (pin built against its own dir)', () => {
++    const result = lintWireframeFile(SKETCH_KIT_SAMPLE_PATH);
++    expect(result.findings).toEqual([]);
++    expect(result.ok).toBe(true);
++  });
++
++  it('passes a clean wireframe sitting next to a genuine kit copy', () => {
++    const dir = freshDir();
++    const file = join(dir, 'change.html');
++    writeFileSync(file, cleanPage);
++    expect(lintWireframeFile(file).ok).toBe(true);
++  });
++
++  it('rejects a wireframe with an inline style (same axis-1 lint, not a parallel path)', () => {
++    const dir = freshDir();
++    const file = join(dir, 'change.html');
++    writeFileSync(file, cleanPage.replace('<h1>', '<h1 style="color:red">'));
++    const result = lintWireframeFile(file);
++    expect(result.ok).toBe(false);
++    expect(result.findings.map((f) => f.rule)).toContain('inline-style');
++  });
++
++  it('rejects a wireframe whose kit copy is not the shipped bytes (identity pin enforced)', () => {
++    const dir = freshDir();
++    writeFileSync(join(dir, 'sketch-kit.css'), readFileSync(SKETCH_KIT_CSS_PATH, 'utf8') + '\nh1{color:hotpink}');
++    const file = join(dir, 'change.html');
++    writeFileSync(file, cleanPage);
++    const result = lintWireframeFile(file);
++    expect(result.ok).toBe(false);
++    expect(result.findings.map((f) => f.rule)).toContain('stylesheet-hash-mismatch');
++  });
++
++  it('fails loud on a missing file', () => {
++    expect(() => lintWireframeFile(join(tmpdir(), 'dc-lint-file-does-not-exist.html'))).toThrow(
++      /no such file|does not exist|ENOENT/i,
++    );
++  });
++});
++
++describe('runCheckWireframe (CLI core — exit codes are the bin contract)', () => {
++  function capture(): { out: string[]; err: string[]; io: { out(line: string): void; err(line: string): void } } {
++    const out: string[] = [];
++    const err: string[] = [];
++    return { out, err, io: { out: (l) => out.push(l), err: (l) => err.push(l) } };
++  }
++
++  it('exits 0 and reports clean on a passing wireframe', () => {
++    const dir = freshDir();
++    const file = join(dir, 'change.html');
++    writeFileSync(file, cleanPage);
++    const { io, out } = capture();
++    expect(runCheckWireframe([file], io)).toBe(0);
++    expect(out.join('\n')).toMatch(/0 findings/);
++  });
++
++  it('exits 1 and prints one line per finding on a failing wireframe', () => {
++    const dir = freshDir();
++    const file = join(dir, 'change.html');
++    writeFileSync(file, cleanPage.replace('<h1>', '<h1 style="color:red">'));
++    const { io, err } = capture();
++    expect(runCheckWireframe([file], io)).toBe(1);
++    expect(err.some((l) => l.includes('inline-style'))).toBe(true);
++  });
++
++  it('exits 1 with a descriptive error on a missing file (no fabricated verdict)', () => {
++    const { io, err } = capture();
++    expect(runCheckWireframe([join(tmpdir(), 'dc-nope.html')], io)).toBe(1);
++    expect(err.join('\n')).toMatch(/no such file|does not exist|ENOENT/i);
++  });
++
++  it('exits 2 on usage error (no argument / extra arguments)', () => {
++    const a = capture();
++    expect(runCheckWireframe([], a.io)).toBe(2);
++    expect(a.err.join('\n')).toMatch(/usage/i);
++    const b = capture();
++    expect(runCheckWireframe(['x.html', 'y.html'], b.io)).toBe(2);
++  });
++});
+diff --git a/plugins/design-control/src/__tests__/provenance/derived.test.ts b/plugins/design-control/src/__tests__/provenance/derived.test.ts
+new file mode 100644
+index 00000000..97c6fcbb
+--- /dev/null
++++ b/plugins/design-control/src/__tests__/provenance/derived.test.ts
+@@ -0,0 +1,146 @@
++import { describe, it, expect, afterEach } from 'vitest';
++import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
++import { tmpdir } from 'node:os';
++import { join } from 'node:path';
++import {
++  recordDerivation,
++  loadProvenance,
++  checkDerivedAcceptance,
++  wireframeDroveImplementation,
++  recordDrivingWireframe,
++} from '@/provenance/derived';
++
++const dirs: string[] = [];
++afterEach(() => {
++  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
++});
++
++function freshDir(): string {
++  const dir = mkdtempSync(join(tmpdir(), 'dc-prov-'));
++  dirs.push(dir);
++  return dir;
++}
++
++const draftHtml =
++  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>' +
++  '<link rel="stylesheet" href="sketch-kit.css"></head>' +
++  '<body class="sk sk-theme-grayscale"><h1>Derived from live surface</h1></body></html>';
++
++describe('recordDerivation', () => {
++  it('writes the auto-derived snapshot AND the provenance sidecar at derivation time', () => {
++    const dir = freshDir();
++    const prov = recordDerivation({
++      dir,
++      surfaceId: 'studio-content-browser',
++      derivedHtml: draftHtml,
++      source: 'http://localhost:4321/dev/editorial-studio',
++      derivedAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    expect(prov.mode).toBe('derived');
++    const names = readdirSync(dir);
++    expect(names).toContain('studio-content-browser.derived-snapshot.html');
++    expect(names).toContain('studio-content-browser.provenance.json');
++    expect(readFileSync(join(dir, 'studio-content-browser.derived-snapshot.html'), 'utf8')).toBe(draftHtml);
++  });
++
++  it('round-trips through loadProvenance (zod-validated)', () => {
++    const dir = freshDir();
++    recordDerivation({
++      dir,
++      surfaceId: 'scrapbook-drawer',
++      derivedHtml: draftHtml,
++      source: 'route /dev/scrapbook',
++      derivedAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    const prov = loadProvenance(dir, 'scrapbook-drawer');
++    expect(prov.surfaceId).toBe('scrapbook-drawer');
++    expect(prov.mode).toBe('derived');
++    if (prov.mode !== 'derived') throw new Error('unreachable');
++    expect(prov.derived.source).toBe('route /dev/scrapbook');
++    expect(prov.derived.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
++  });
++});
++
++describe('loadProvenance fail-loud paths', () => {
++  it('throws a descriptive error when the sidecar is missing', () => {
++    expect(() => loadProvenance(freshDir(), 'nope')).toThrow(/provenance/i);
++  });
++
++  it('throws on a malformed sidecar (no silent fallback)', () => {
++    const dir = freshDir();
++    writeFileSync(join(dir, 'bad.provenance.json'), '{"mode":"derived"}');
++    expect(() => loadProvenance(dir, 'bad')).toThrow();
++  });
++});
++
++describe('checkDerivedAcceptance — acceptance requires a recorded operator edit', () => {
++  it('rejects a byte-identical accepted artifact (state transition alone is not an edit)', () => {
++    const dir = freshDir();
++    recordDerivation({
++      dir,
++      surfaceId: 's1',
++      derivedHtml: draftHtml,
++      source: 'live surface',
++      derivedAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    const result = checkDerivedAcceptance(dir, 's1', draftHtml);
++    expect(result.ok).toBe(false);
++    expect(result.findings.map((f) => f.rule)).toContain('derived-unedited');
++  });
++
++  it('accepts once the operator edit produces a non-empty diff against the stored snapshot', () => {
++    const dir = freshDir();
++    recordDerivation({
++      dir,
++      surfaceId: 's1',
++      derivedHtml: draftHtml,
++      source: 'live surface',
++      derivedAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    const edited = draftHtml.replace('Derived from live surface', 'Entry list, regrouped by lane');
++    expect(checkDerivedAcceptance(dir, 's1', edited).ok).toBe(true);
++  });
++
++  it('fails loud when the stored snapshot was tampered after recording (hash mismatch)', () => {
++    const dir = freshDir();
++    recordDerivation({
++      dir,
++      surfaceId: 's1',
++      derivedHtml: draftHtml,
++      source: 'live surface',
++      derivedAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    writeFileSync(join(dir, 's1.derived-snapshot.html'), draftHtml + '<!-- tampered -->');
++    expect(() => checkDerivedAcceptance(dir, 's1', 'whatever')).toThrow(/snapshot|hash/i);
++  });
++
++  it('does not gate a driving wireframe (the derived gate is mode-scoped)', () => {
++    const dir = freshDir();
++    recordDrivingWireframe({
++      dir,
++      surfaceId: 'fresh',
++      derivedAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    expect(checkDerivedAcceptance(dir, 'fresh', draftHtml).ok).toBe(true);
++  });
++});
++
++describe('wireframeDroveImplementation', () => {
++  it('is true for a driving wireframe and FALSE for a derived one (even an accepted one)', () => {
++    const dir = freshDir();
++    const derived = recordDerivation({
++      dir,
++      surfaceId: 'd',
++      derivedHtml: draftHtml,
++      source: 'live surface',
++      derivedAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    const driving = recordDrivingWireframe({
++      dir,
++      surfaceId: 'w',
++      derivedAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    expect(wireframeDroveImplementation(derived)).toBe(false);
++    expect(wireframeDroveImplementation(driving)).toBe(true);
++  });
++});
+diff --git a/plugins/design-control/src/authoring/check-wireframe-cli.ts b/plugins/design-control/src/authoring/check-wireframe-cli.ts
+new file mode 100644
+index 00000000..3838653a
+--- /dev/null
++++ b/plugins/design-control/src/authoring/check-wireframe-cli.ts
+@@ -0,0 +1,12 @@
++/**
++ * Process entry for `bin/check-wireframe`. All behavior lives in
++ * {@link runCheckWireframe} (tested directly); this file only wires argv and
++ * the process exit code.
++ */
++
++import { runCheckWireframe } from '@/authoring/lint-file';
++
++process.exitCode = runCheckWireframe(process.argv.slice(2), {
++  out: (line) => console.log(line),
++  err: (line) => console.error(line),
++});
+diff --git a/plugins/design-control/src/authoring/index.ts b/plugins/design-control/src/authoring/index.ts
+new file mode 100644
+index 00000000..c6773979
+--- /dev/null
++++ b/plugins/design-control/src/authoring/index.ts
+@@ -0,0 +1,5 @@
++/**
++ * Public surface of the wireframe-authoring path. Import via `@/authoring`.
++ */
++
++export { type CliIo, lintWireframeFile, runCheckWireframe } from '@/authoring/lint-file';
+diff --git a/plugins/design-control/src/authoring/lint-file.ts b/plugins/design-control/src/authoring/lint-file.ts
+new file mode 100644
+index 00000000..310dc89c
+--- /dev/null
++++ b/plugins/design-control/src/authoring/lint-file.ts
+@@ -0,0 +1,68 @@
++/**
++ * File-level entry to the `check-mockup-lofi` lint — the enforcement seam the
++ * `/design-control:wireframe` authoring skill (and the `bin/check-wireframe`
++ * shim) route EVERY wireframe draft through, manual or engine-authored alike.
++ *
++ * This is deliberately a thin composition of the existing axes — axis 1
++ * (element/attribute allowlist) + axis 1.5 (stylesheet identity pin) + the
++ * codepoint allowlist — via `lintWireframe`. No parallel lint path: the skill
++ * and the library agree by construction because they call the same pipeline.
++ */
++
++import { readFileSync } from 'node:fs';
++import { dirname, resolve } from 'node:path';
++import { lintWireframe } from '@/lint/check-mockup-lofi';
++import { buildSketchKitPin } from '@/lint/stylesheet-pin';
++import type { LintResult } from '@/lint/types';
++
++/**
++ * Lint a wireframe FILE: read it, build the sketch-kit identity pin against the
++ * file's own directory (the conventional layout — the kit copy sits next to the
++ * wireframe), and run the full pinned lint. Fails loud on an unreadable file —
++ * a missing wireframe is an error, never a clean verdict.
++ */
++export function lintWireframeFile(filePath: string): LintResult {
++  const absolute = resolve(filePath);
++  const html = readFileSync(absolute, 'utf8');
++  return lintWireframe(html, { stylesheetPin: buildSketchKitPin(dirname(absolute)) });
++}
++
++/** Line-oriented output sink, injected so the CLI core is testable as a function. */
++export interface CliIo {
++  out(line: string): void;
++  err(line: string): void;
++}
++
++const USAGE = 'usage: check-wireframe <wireframe.html>';
++
++/**
++ * CLI core behind `bin/check-wireframe`. Exit-code contract (the skill's gate):
++ *   0 — lint green (zero findings)
++ *   1 — findings present, or the file could not be read (descriptive error;
++ *       never a fabricated verdict)
++ *   2 — usage error
++ */
++export function runCheckWireframe(argv: readonly string[], io: CliIo): number {
++  if (argv.length !== 1) {
++    io.err(USAGE);
++    return 2;
++  }
++  const filePath = argv[0];
++  let result: LintResult;
++  try {
++    result = lintWireframeFile(filePath);
++  } catch (error) {
++    io.err(error instanceof Error ? error.message : String(error));
++    return 1;
++  }
++  if (result.ok) {
++    io.out(`${filePath}: lint green — 0 findings`);
++    return 0;
++  }
++  for (const finding of result.findings) {
++    const where = [finding.tag, finding.attr].filter(Boolean).join(' ');
++    io.err(`${finding.rule}${where ? ` (${where})` : ''}: ${finding.message}`);
++  }
++  io.err(`${filePath}: ${result.findings.length} finding(s)`);
++  return 1;
++}
+diff --git a/plugins/design-control/src/provenance/derived.ts b/plugins/design-control/src/provenance/derived.ts
+new file mode 100644
+index 00000000..6e5c2987
+--- /dev/null
++++ b/plugins/design-control/src/provenance/derived.ts
+@@ -0,0 +1,185 @@
++/**
++ * Wireframe provenance — the retroactive (`derived`) path.
++ *
++ * A wireframe is either DRIVING (authored before the implementation; the
++ * artifact that drove the change) or DERIVED (reverse-engineered from an
++ * already-existing surface). The derived path exists so a legacy surface can be
++ * brought under the discipline, but with two hard properties from the spec:
++ *
++ *  1. The auto-derived draft is SNAPSHOTTED at derivation time, alongside its
++ *     provenance, so acceptance has a baseline to diff against.
++ *  2. Accepting a `derived` artifact REQUIRES a recorded operator edit — a
++ *     non-empty byte diff between the stored snapshot and the accepted version.
++ *     A bare state transition is not an edit.
++ *
++ * And a `derived` artifact NEVER satisfies a "wireframe drove implementation"
++ * claim ({@link wireframeDroveImplementation}) — provenance distinguishes the
++ * two modes precisely so the claim cannot be laundered through acceptance.
++ *
++ * Sidecar layout (per surface, in the operator-chosen provenance dir):
++ *   <surfaceId>.provenance.json          — zod-validated provenance record
++ *   <surfaceId>.derived-snapshot.html    — the auto-derived draft (derived only)
++ */
++
++import { existsSync, readFileSync, writeFileSync } from 'node:fs';
++import { join } from 'node:path';
++import { createHash } from 'node:crypto';
++import { z } from 'zod';
++
++const PROVENANCE_VERSION = 1;
++
++const sha256Hex = (content: string): string => createHash('sha256').update(content).digest('hex');
++
++const drivingSchema = z.object({
++  version: z.literal(PROVENANCE_VERSION),
++  surfaceId: z.string().min(1),
++  mode: z.literal('driving'),
++  createdAt: z.string().datetime(),
++});
++
++const derivedSchema = z.object({
++  version: z.literal(PROVENANCE_VERSION),
++  surfaceId: z.string().min(1),
++  mode: z.literal('derived'),
++  createdAt: z.string().datetime(),
++  derived: z.object({
++    /** Filename (dir-relative) of the snapshot stored at derivation time. */
++    snapshotFile: z.string().min(1),
++    /** sha256 (hex) of the snapshot bytes as recorded — tamper evidence. */
++    snapshotSha256: z.string().regex(/^[0-9a-f]{64}$/),
++    /** What the draft was derived FROM (route, URL, file — operator-meaningful). */
++    source: z.string().min(1),
++  }),
++});
++
++const provenanceSchema = z.discriminatedUnion('mode', [drivingSchema, derivedSchema]);
++
++export type WireframeProvenance = z.infer<typeof provenanceSchema>;
++
++export interface ProvenanceFinding {
++  readonly rule: 'derived-unedited';
++  readonly message: string;
++}
++
++export interface AcceptanceResult {
++  readonly ok: boolean;
++  readonly findings: readonly ProvenanceFinding[];
++}
++
++const sidecarPath = (dir: string, surfaceId: string): string =>
++  join(dir, `${surfaceId}.provenance.json`);
++
++function writeProvenance(dir: string, provenance: WireframeProvenance): void {
++  writeFileSync(
++    sidecarPath(dir, provenance.surfaceId),
++    JSON.stringify(provenance, null, 2) + '\n',
++  );
++}
++
++/** Record a DRIVING wireframe's provenance (the authored-first path). */
++export function recordDrivingWireframe(input: {
++  dir: string;
++  surfaceId: string;
++  derivedAt?: Date;
++}): WireframeProvenance {
++  const provenance: WireframeProvenance = {
++    version: PROVENANCE_VERSION,
++    surfaceId: input.surfaceId,
++    mode: 'driving',
++    createdAt: (input.derivedAt ?? new Date()).toISOString(),
++  };
++  writeProvenance(input.dir, provenance);
++  return provenance;
++}
++
++/**
++ * Record a DERIVED draft at derivation time: store the auto-derived snapshot
++ * AND the provenance sidecar in one move, so the acceptance diff always has its
++ * baseline. The snapshot hash is recorded for tamper evidence.
++ */
++export function recordDerivation(input: {
++  dir: string;
++  surfaceId: string;
++  derivedHtml: string;
++  source: string;
++  derivedAt?: Date;
++}): WireframeProvenance {
++  const snapshotFile = `${input.surfaceId}.derived-snapshot.html`;
++  writeFileSync(join(input.dir, snapshotFile), input.derivedHtml);
++  const provenance: WireframeProvenance = {
++    version: PROVENANCE_VERSION,
++    surfaceId: input.surfaceId,
++    mode: 'derived',
++    createdAt: (input.derivedAt ?? new Date()).toISOString(),
++    derived: {
++      snapshotFile,
++      snapshotSha256: sha256Hex(input.derivedHtml),
++      source: input.source,
++    },
++  };
++  writeProvenance(input.dir, provenance);
++  return provenance;
++}
++
++/** Load + zod-validate a surface's provenance sidecar. Fails loud when absent/malformed. */
++export function loadProvenance(dir: string, surfaceId: string): WireframeProvenance {
++  const path = sidecarPath(dir, surfaceId);
++  if (!existsSync(path)) {
++    throw new Error(
++      `No provenance sidecar for surface "${surfaceId}" at ${path}. ` +
++        `Record provenance at authoring/derivation time (recordDrivingWireframe / recordDerivation).`,
++    );
++  }
++  return provenanceSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
++}
++
++/**
++ * The acceptance gate for `derived` artifacts: the accepted version must carry
++ * a recorded operator edit — a non-empty byte diff against the snapshot stored
++ * at derivation time. Driving wireframes pass through (the gate is mode-scoped).
++ * Fails loud if the stored snapshot no longer matches its recorded hash — a
++ * tampered baseline cannot certify an edit.
++ */
++export function checkDerivedAcceptance(
++  dir: string,
++  surfaceId: string,
++  acceptedHtml: string,
++): AcceptanceResult {
++  const provenance = loadProvenance(dir, surfaceId);
++  if (provenance.mode !== 'derived') {
++    return { ok: true, findings: [] };
++  }
++  const snapshotPath = join(dir, provenance.derived.snapshotFile);
++  const snapshot = readFileSync(snapshotPath, 'utf8');
++  if (sha256Hex(snapshot) !== provenance.derived.snapshotSha256) {
++    throw new Error(
++      `Derived snapshot ${snapshotPath} does not match the hash recorded at derivation time — ` +
++        `the baseline was modified after recording, so the operator-edit diff cannot be trusted. ` +
++        `Re-derive the draft to re-establish a baseline.`,
++    );
++  }
++  if (acceptedHtml === snapshot) {
++    return {
++      ok: false,
++      findings: [
++        {
++          rule: 'derived-unedited',
++          message:
++            `Surface "${surfaceId}": the accepted artifact is byte-identical to the auto-derived ` +
++            `snapshot. Accepting a derived wireframe requires a recorded operator edit ` +
++            `(non-empty diff against the derivation-time snapshot), not just a state transition.`,
++        },
++      ],
++    };
++  }
++  return { ok: true, findings: [] };
++}
++
++/**
++ * Whether this wireframe supports a "wireframe drove implementation" claim.
++ * Only a DRIVING wireframe does; a `derived` one never does, edited or not —
++ * it was reverse-engineered from the surface it would be claiming to have driven.
++ */
++export function wireframeDroveImplementation(provenance: WireframeProvenance): boolean {
++  return provenance.mode === 'driving';
++}
+diff --git a/plugins/design-control/src/provenance/index.ts b/plugins/design-control/src/provenance/index.ts
+new file mode 100644
+index 00000000..3106074f
+--- /dev/null
++++ b/plugins/design-control/src/provenance/index.ts
+@@ -0,0 +1,14 @@
++/**
++ * Public surface of the wireframe-provenance module. Import via `@/provenance`.
++ */
++
++export {
++  type WireframeProvenance,
++  type ProvenanceFinding,
++  type AcceptanceResult,
++  recordDrivingWireframe,
++  recordDerivation,
++  loadProvenance,
++  checkDerivedAcceptance,
++  wireframeDroveImplementation,
++} from '@/provenance/derived';
+
+
+## What to look for
+
+- **Correctness bugs** — logic errors, off-by-one, null/undefined paths, race conditions, missing error handling, swallowed exceptions.
+- **Design issues** — coupling between layers that should be independent, leaking abstractions, primitives that should compose but don't, configuration that should be data ending up as code.
+- **Missed edge cases** — what happens with empty input? Maximum input? Concurrent calls? Partial failure? Network unavailability? Operator interrupt mid-operation? What is the behavior on a fresh install vs. an upgrade?
+- **Code-quality concerns** — files growing past a reasonable cap, names that don't reveal intent, dead code, duplicated logic, magic numbers without explanation, tests that don't test the contract they claim to test.
+- **Cross-cutting impact** — does this diff touch a surface that other surfaces depend on? Are those other surfaces updated? Are migrations needed? Are doctor rules / schemas / validators updated to match the new shape?
+- **Documentation drift** — does the README / SKILL.md / PRD describe the behavior the code actually implements? If the spec changed, did the implementation? If the implementation changed, did the spec?
+- **Operator-discipline traps** — placeholder comments, swallowed errors, hardcoded paths/values that should be configurable, fallbacks that hide failure modes, mock data outside test code. These are bug-factories per project guidelines.
+
+## Output format
+
+For each finding you surface, emit ONE markdown block in this exact shape:
+
+```
+### <heading: one-line summary of the finding>
+
+Finding-ID: AUDIT-BARRAGE-<your-model-name>-<NN>
+Status:     open
+Severity:   <blocking | high | medium | low | informational>
+Surface:    <repo-relative-path:line-range> OR <description of the surface if not anchored to a single file>
+
+<one-to-three paragraphs of body: what the finding is, why it matters, what evidence you relied on, what a reasonable fix would look like. Be specific. Cite line numbers from the diff. If the finding is structural / cross-file, name every file affected.>
+```
+
+Number the findings sequentially (`-01`, `-02`, ...).
+
+**Severity — rate each finding by downstream blast-radius:** the consequence if a downstream consumer acts on the audited surface *as written*. The consumer may be an adopter running the code, or — especially for a spec — an AI agent building **unattended** from it, with no human to catch a wrong reading. Rate by what would actually happen if this shipped as-is, **not by how alarming the finding feels**. State the blast-radius reasoning in the finding body for every finding, at every level.
+
+- `blocking` — acting on it as-written breaks the feature's stated goals in obvious ways; OR (for a spec) the more natural reading an agent reaches first is the wrong one, so it will likely be built wrong by default and nothing in the artifact corrects it.
+- `high` — a correctness/safety defect a consumer will hit; OR a spec contradiction/ambiguity where the readings are roughly equally plausible and the artifact doesn't disambiguate — an agent might build either, including the wrong one.
+- `medium` — a design issue that compounds over time; OR a spec inconsistency a reasonable consumer would resolve correctly anyway (readings barely diverge, or context makes the intended one obvious).
+- `low` — hygiene; cosmetic wording with no behavioral or implementation consequence.
+- `informational` — context worth seeing, not itself a defect.
+
+**Calibrate by consequence, not by alarm.** A genuine contradiction a reader would obviously resolve the right way is at most `medium`. A quietly-plausible wrong reading an agent would actually build is `high`/`blocking` even if it looks minor. A spec's internal consistency is load-bearing — it is the input to an unattended build.
+
+## If you find nothing — say so explicitly
+
+If you walk the diff carefully and find no findings worth surfacing, emit ONE block in this shape instead:
+
+```
+### No findings
+
+Finding-ID: AUDIT-BARRAGE-<your-model-name>-CLEAN
+Status:     open
+Severity:   informational
+Surface:    (the entire diff)
+
+I walked the diff for the feature named above and found no findings worth surfacing. My specific reasoning: <three-to-five sentences explaining what you checked, why those checks came back clean, and what you would have flagged if it had been present.>
+```
+
+**Do not pad with weak findings.** A confident "I checked X, Y, Z and they are clean for these reasons" is more useful to the operator than three vague low-severity notes. The cross-model diversity gives the operator independent signal; an empty clean report from your CLI is itself a signal when paired with findings from your siblings.
+
+## Hard constraints
+
+- **No deferral phrases.** Don't write phrases like "fix later", "address in a follow-up", or other commitments to deferred work. The dispatch-wrapper rejects these as bug-factories. If you spot a deferral phrase IN the diff, surface it as a finding.
+- **Anchor findings to evidence.** A finding that says "this might be a problem" without naming the specific file + line is not actionable. Name the surface, quote the relevant code, explain what's wrong.
+- **One issue per finding block.** Don't bundle multiple concerns into one entry; the operator triages each block as a discrete signal.
+- **Provenance is your model name.** Replace `<your-model-name>` in the Finding-ID with the CLI you are (`claude`, `codex`, `gemini`, etc.). This is how the operator joins findings across models.
+
+codex
+### `recordDerivation` can leave an orphaned snapshot if sidecar write fails
+
+Finding-ID: AUDIT-BARRAGE-codex-01  
+Status:     open  
+Severity:   medium  
+Surface:    `plugins/design-control/src/provenance/derived.ts:102-118`
+
+`recordDerivation` writes `<surfaceId>.derived-snapshot.html` first, then writes `<surfaceId>.provenance.json`. If the process is interrupted, the disk fills, permissions change, or JSON sidecar write otherwise fails after line 104, the directory is left with a snapshot but no valid provenance record. The workplan says `recordDerivation` “writes snapshot + zod-validated sidecar in one move”; this implementation is sequential non-atomic writes.
+
+The blast radius is medium: normal consumers will usually succeed, but the failure mode creates ambiguous provenance state in the operator’s artifact directory. A later unattended agent or operator may see the snapshot and assume derivation was recorded, while `loadProvenance` fails loud because the sidecar is absent. A reasonable fix is to write both artifacts via temporary files and atomic renames, with cleanup on failure, or to write the sidecar first with a temporary snapshot reference and only promote both names once both writes have succeeded.
+tokens used
+23,875
diff --git a/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/gemini.txt b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/gemini.txt
new file mode 100644
index 00000000..72be61b7
--- /dev/null
+++ b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/gemini.txt
@@ -0,0 +1,8 @@
+Loaded cached credentials.
+Loading extension: nanobanana
+Attempt 1 failed: You have exhausted your capacity on this model.. Retrying after 10000ms...
+Attempt 2 failed: You have exhausted your capacity on this model.. Retrying after 10000ms...
+Error when talking to Gemini API Full report available at: /var/folders/sk/jzwspmzn1g17x97x7s7l_dch0000gn/T/gemini-client-error-Turn.run-sendMessageStream-2026-06-11T05-56-52-436Z.json
+[API Error: You have exhausted your capacity on this model.]
+An unexpected critical error occurred:
+[object Object]
diff --git a/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/tip.sha b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/tip.sha
new file mode 100644
index 00000000..431f0526
--- /dev/null
+++ b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/tip.sha
@@ -0,0 +1 @@
+9639b4453f88df8b82921955898bfeab23ad9cdd
diff --git a/plugins/design-control/bin/check-wireframe b/plugins/design-control/bin/check-wireframe
new file mode 100755
index 00000000..b5919fb3
--- /dev/null
+++ b/plugins/design-control/bin/check-wireframe
@@ -0,0 +1,25 @@
+#!/bin/sh
+# check-wireframe <wireframe.html> — run the full pinned check-mockup-lofi lint
+# against a wireframe file. Exit codes: 0 lint-green, 1 findings/error, 2 usage.
+# Logic lives in src/authoring/lint-file.ts (tested); this shim only locates the
+# workspace tsx runner (hoisted node_modules in the monorepo) and dispatches.
+set -eu
+
+PLUGIN_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
+
+dir="$PLUGIN_ROOT"
+TSX=""
+while [ "$dir" != "/" ]; do
+  if [ -x "$dir/node_modules/.bin/tsx" ]; then
+    TSX="$dir/node_modules/.bin/tsx"
+    break
+  fi
+  dir=$(dirname -- "$dir")
+done
+
+if [ -z "$TSX" ]; then
+  echo "check-wireframe: tsx runner not found in any node_modules/.bin above $PLUGIN_ROOT — run npm install first" >&2
+  exit 1
+fi
+
+exec "$TSX" "$PLUGIN_ROOT/src/authoring/check-wireframe-cli.ts" "$@"
diff --git a/plugins/design-control/bin/wireframe-provenance b/plugins/design-control/bin/wireframe-provenance
new file mode 100755
index 00000000..eff94773
--- /dev/null
+++ b/plugins/design-control/bin/wireframe-provenance
@@ -0,0 +1,26 @@
+#!/bin/sh
+# wireframe-provenance <subcommand> ... — record + verify wireframe provenance
+# (record-driving | record-derived | check-acceptance | verify-driving).
+# Exit codes: 0 success/ok, 1 refusal/error, 2 usage.
+# Logic lives in src/provenance/cli.ts (tested); this shim only locates the
+# workspace tsx runner (hoisted node_modules in the monorepo) and dispatches.
+set -eu
+
+PLUGIN_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
+
+dir="$PLUGIN_ROOT"
+TSX=""
+while [ "$dir" != "/" ]; do
+  if [ -x "$dir/node_modules/.bin/tsx" ]; then
+    TSX="$dir/node_modules/.bin/tsx"
+    break
+  fi
+  dir=$(dirname -- "$dir")
+done
+
+if [ -z "$TSX" ]; then
+  echo "wireframe-provenance: tsx runner not found in any node_modules/.bin above $PLUGIN_ROOT — run npm install first" >&2
+  exit 1
+fi
+
+exec "$TSX" "$PLUGIN_ROOT/src/provenance/wireframe-provenance-cli.ts" "$@"
diff --git a/plugins/design-control/skills/wireframe/SKILL.md b/plugins/design-control/skills/wireframe/SKILL.md
new file mode 100644
index 00000000..361d1647
--- /dev/null
+++ b/plugins/design-control/skills/wireframe/SKILL.md
@@ -0,0 +1,123 @@
+---
+name: wireframe
+description: Author a deliberately lo-fi wireframe for a named UI surface change — operator-driven, sketch-kit-based, and lint-enforced (zero check-wireframe findings before the draft may be presented). The optional /frontend-design accelerator routes through the same lint.
+---
+
+# /design-control:wireframe `<change>`
+
+Author the **lo-fi wireframe** for one named surface change. The wireframe is
+the UX-*spirit* artifact of the design-control discipline: it works out
+structure, hierarchy, and flow while being structurally incapable of carrying
+visual-design detail — so stale polish can never ship as if intended. Visual
+identity lives in the design-language spec (Phase 2), never here.
+
+> Per the plugin thesis (`DESIGN-DISCIPLINE-THESIS.md`): policy is enforced by a
+> process, not a rule. The lo-fi property is not a convention the author is
+> trusted to follow — it is mechanically enforced by the `check-mockup-lofi`
+> lint, which every draft MUST pass before it may be presented.
+
+## Arguments
+
+- `<change>` (required) — a short operator-meaningful brief of the surface
+  change (e.g. `regroup the content browser by lane`). If missing, ask for it
+  (one argument, one prompt).
+
+## Procedure
+
+1. **Resolve the target surface.** Confirm with the operator which surface the
+   change addresses (`surface id` — operator-declared granularity, per the spec's
+   Definitions). One wireframe per change; do not batch surfaces.
+
+2. **Set up the wireframe file.** Create `<surface-id>.html` in the operator's
+   chosen wireframes directory, with the shipped sketch-kit copied alongside it:
+   - copy `assets/sketch-kit/sketch-kit.css` (and `assets/sketch-kit/fonts/` if a
+     font-bearing theme is chosen) next to the wireframe;
+   - exactly ONE `<link rel="stylesheet" href="sketch-kit.css">`;
+   - `<body class="sk sk-theme-<theme>">` — theme is the operator's pick among
+     `marker` / `blueprint` / `grayscale` (default `grayscale`);
+   - the kit's WIREFRAME banner (`.sk-banner`) stays — the artifact self-labels.
+
+3. **Author the wireframe — manual path (default, requires NO engine).** The
+   operator (or the agent under operator direction) writes plain structural HTML
+   using only the `.sk-*` vocabulary and the lint's allowed structural tags.
+   Imagery is the fixed `.sk-img` placeholder; icons are text labels, never
+   emoji; copy uses plain Basic-Latin text. This path never calls the engine
+   preflight — it works with no engine installed.
+
+4. **Optional engine accelerator.** Only if the operator asks for it: gate on
+   `preflightEngine` (`@/engine-adapter`, method `author-wireframe`) — absence
+   fails loud naming the remedy — then request a draft via the engine adapter.
+   **Engine output gets zero trust:** it lands in the same file and is judged by
+   the same lint as a manual draft (a `lint-rejected` response is the defined
+   failure mode; fix or discard, never grandfather).
+
+5. **Lint gate — the non-negotiable step.** Run:
+
+   ```bash
+   plugins/design-control/bin/check-wireframe <path/to/wireframe.html>
+   ```
+
+   - Exit `0` (lint green, zero findings) → the draft may be presented.
+   - Exit `1` → fix every finding and re-run. NEVER present a draft with open
+     findings; NEVER hand-wave a finding as "just lo-fi enough". The lint is the
+     boundary of the lo-fi guarantee.
+
+6. **Record provenance.** This skill authors *driving* wireframes (the artifact
+   precedes the implementation): record it in the wireframe's directory by
+   running:
+
+   ```bash
+   plugins/design-control/bin/wireframe-provenance record-driving <wireframes-dir> <surface-id> <wireframe-filename>
+   ```
+
+   (`<wireframe-filename>` is the lint-green wireframe's filename, relative to
+   `<wireframes-dir>`.) Exit `0` → recorded; exit `1` → descriptive refusal or
+   error on stderr — fix and re-run, never skip. The record binds that artifact
+   by name + sha256, so a later replacement of the wireframe is tamper-evident:
+
+   ```bash
+   plugins/design-control/bin/wireframe-provenance verify-driving <wireframes-dir> <surface-id>
+   ```
+
+   re-hashes the bound file and exits `1` on tamper/missing/mode mismatch. The
+   wireframe file must exist on disk at record time; step 5's lint gate
+   guarantees it does.
+
+   A wireframe reverse-engineered from an existing surface is the *derived*
+   path — record it at derivation time instead with:
+
+   ```bash
+   plugins/design-control/bin/wireframe-provenance record-derived <wireframes-dir> <surface-id> <source> --from <derived-draft.html>
+   ```
+
+   (`<source>` is what the draft was derived FROM — route, URL, file;
+   `--from` names the auto-derived draft file, which is snapshotted alongside
+   the sidecar). Acceptance of a derived artifact then requires a non-empty
+   operator edit against the stored snapshot — the acceptance gate is:
+
+   ```bash
+   plugins/design-control/bin/wireframe-provenance check-acceptance <wireframes-dir> <surface-id> <accepted.html>
+   ```
+
+   Exit `0` → ok; exit `1` → the artifact is byte-identical to the
+   derivation-time snapshot (`derived-unedited`) or the baseline was tampered.
+   A derived artifact never supports a "wireframe drove implementation" claim,
+   edited or not. Provenance is append-once: if a sidecar already exists for
+   the surface, BOTH recorders refuse to overwrite it (in either mode
+   direction) — re-recording requires explicitly removing or superseding the
+   existing record; never work around the refusal by deleting the sidecar to
+   flip a `derived` surface to `driving`.
+
+7. **Present and stop.** Show the operator the lint-green wireframe (path +
+   `0 findings` output). The operator picks/iterates; translation into the
+   design language and implementation are separate steps of the loop, not this
+   skill's job.
+
+## What this skill does NOT do
+
+- It does not style anything — no CSS authoring, no presentational attributes
+  (the lint rejects them anyway).
+- It does not translate to the design language (`translate-design-language`),
+  implement, or referee.
+- It does not skip the lint for engine-authored drafts — same gate, same lint,
+  zero findings.
diff --git a/plugins/design-control/specs/001-design-control/tasks.md b/plugins/design-control/specs/001-design-control/tasks.md
index 0d69efb4..a65fd485 100644
--- a/plugins/design-control/specs/001-design-control/tasks.md
+++ b/plugins/design-control/specs/001-design-control/tasks.md
@@ -139,13 +139,22 @@ verbatim in substance** — when they drift, the PRD wins.
       Romanian comma-below, multiline placeholders, cache-busting/percent-encoded/subdirectory kit
       hrefs, data tables, placeholder rows, prose pages, disclosure blocks, and the boundary
       fixtures. Suite: 151 → 286.
-- [ ] `/design-control:wireframe <change>` authoring skill (operator-driven + lint-enforced; the
+- [x] `/design-control:wireframe <change>` authoring skill (operator-driven + lint-enforced; the
       engine `author-wireframe` method is an optional accelerator routed through the same lint).
-- [ ] Retroactive path: existing surface → `derived` wireframe/spec; **snapshot the auto-derived
+      **Done — 2026-06-10.** `skills/wireframe/SKILL.md` (manual path needs no engine; the
+      accelerator gates on `preflightEngine` and its output is judged by the same lint) +
+      `@/authoring` (`lintWireframeFile` composes the existing pinned pipeline — no parallel lint
+      path) + `bin/check-wireframe` shim (exit contract 0 green / 1 findings-or-error / 2 usage;
+      logic tested as `runCheckWireframe`, the shim only dispatches). TDD: 9 tests RED first.
+- [x] Retroactive path: existing surface → `derived` wireframe/spec; **snapshot the auto-derived
       draft at derivation time** (stored alongside provenance) so the edit-diff has a baseline;
       **acceptance of a `derived` artifact requires a recorded operator edit** (non-empty diff
       between the stored auto-derived snapshot and the accepted version), not just a state
       transition; does NOT satisfy a "wireframe drove implementation" claim.
+      **Done — 2026-06-10.** `@/provenance` (`recordDerivation` writes snapshot + zod-validated
+      sidecar in one move; `checkDerivedAcceptance` rejects a byte-identical acceptance with
+      `derived-unedited`, fails loud on a tampered baseline via the recorded sha256;
+      `wireframeDroveImplementation` is true only for `driving` mode). TDD: 9 tests RED first.
 
 **Acceptance:** the engine-adapter **preflight fails loud when `/frontend-design` is absent while
 manual authoring still works**, and the preflight **precedes the first engine-consuming skill**; the
diff --git a/plugins/design-control/src/__tests__/authoring/lint-file.test.ts b/plugins/design-control/src/__tests__/authoring/lint-file.test.ts
new file mode 100644
index 00000000..891ccae0
--- /dev/null
+++ b/plugins/design-control/src/__tests__/authoring/lint-file.test.ts
@@ -0,0 +1,105 @@
+import { describe, it, expect, afterEach } from 'vitest';
+import { mkdtempSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { lintWireframeFile, runCheckWireframe } from '@/authoring/lint-file';
+import { SKETCH_KIT_CSS_PATH, SKETCH_KIT_SAMPLE_PATH } from '@/wireframe-kit/sketch-kit';
+
+const dirs: string[] = [];
+afterEach(() => {
+  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
+});
+
+/** Temp wireframe dir seeded with a genuine copy of the shipped kit CSS. */
+function freshDir(): string {
+  const dir = mkdtempSync(join(tmpdir(), 'dc-lint-file-'));
+  dirs.push(dir);
+  copyFileSync(SKETCH_KIT_CSS_PATH, join(dir, 'sketch-kit.css'));
+  return dir;
+}
+
+const cleanPage =
+  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>' +
+  '<link rel="stylesheet" href="sketch-kit.css"></head>' +
+  '<body class="sk sk-theme-grayscale"><div class="sk-banner">WIREFRAME</div>' +
+  '<h1>Entry list</h1></body></html>';
+
+describe('lintWireframeFile', () => {
+  it('passes the shipped example wireframe (pin built against its own dir)', () => {
+    const result = lintWireframeFile(SKETCH_KIT_SAMPLE_PATH);
+    expect(result.findings).toEqual([]);
+    expect(result.ok).toBe(true);
+  });
+
+  it('passes a clean wireframe sitting next to a genuine kit copy', () => {
+    const dir = freshDir();
+    const file = join(dir, 'change.html');
+    writeFileSync(file, cleanPage);
+    expect(lintWireframeFile(file).ok).toBe(true);
+  });
+
+  it('rejects a wireframe with an inline style (same axis-1 lint, not a parallel path)', () => {
+    const dir = freshDir();
+    const file = join(dir, 'change.html');
+    writeFileSync(file, cleanPage.replace('<h1>', '<h1 style="color:red">'));
+    const result = lintWireframeFile(file);
+    expect(result.ok).toBe(false);
+    expect(result.findings.map((f) => f.rule)).toContain('inline-style');
+  });
+
+  it('rejects a wireframe whose kit copy is not the shipped bytes (identity pin enforced)', () => {
+    const dir = freshDir();
+    writeFileSync(join(dir, 'sketch-kit.css'), readFileSync(SKETCH_KIT_CSS_PATH, 'utf8') + '\nh1{color:hotpink}');
+    const file = join(dir, 'change.html');
+    writeFileSync(file, cleanPage);
+    const result = lintWireframeFile(file);
+    expect(result.ok).toBe(false);
+    expect(result.findings.map((f) => f.rule)).toContain('stylesheet-hash-mismatch');
+  });
+
+  it('fails loud on a missing file', () => {
+    expect(() => lintWireframeFile(join(tmpdir(), 'dc-lint-file-does-not-exist.html'))).toThrow(
+      /no such file|does not exist|ENOENT/i,
+    );
+  });
+});
+
+describe('runCheckWireframe (CLI core — exit codes are the bin contract)', () => {
+  function capture(): { out: string[]; err: string[]; io: { out(line: string): void; err(line: string): void } } {
+    const out: string[] = [];
+    const err: string[] = [];
+    return { out, err, io: { out: (l) => out.push(l), err: (l) => err.push(l) } };
+  }
+
+  it('exits 0 and reports clean on a passing wireframe', () => {
+    const dir = freshDir();
+    const file = join(dir, 'change.html');
+    writeFileSync(file, cleanPage);
+    const { io, out } = capture();
+    expect(runCheckWireframe([file], io)).toBe(0);
+    expect(out.join('\n')).toMatch(/0 findings/);
+  });
+
+  it('exits 1 and prints one line per finding on a failing wireframe', () => {
+    const dir = freshDir();
+    const file = join(dir, 'change.html');
+    writeFileSync(file, cleanPage.replace('<h1>', '<h1 style="color:red">'));
+    const { io, err } = capture();
+    expect(runCheckWireframe([file], io)).toBe(1);
+    expect(err.some((l) => l.includes('inline-style'))).toBe(true);
+  });
+
+  it('exits 1 with a descriptive error on a missing file (no fabricated verdict)', () => {
+    const { io, err } = capture();
+    expect(runCheckWireframe([join(tmpdir(), 'dc-nope.html')], io)).toBe(1);
+    expect(err.join('\n')).toMatch(/no such file|does not exist|ENOENT/i);
+  });
+
+  it('exits 2 on usage error (no argument / extra arguments)', () => {
+    const a = capture();
+    expect(runCheckWireframe([], a.io)).toBe(2);
+    expect(a.err.join('\n')).toMatch(/usage/i);
+    const b = capture();
+    expect(runCheckWireframe(['x.html', 'y.html'], b.io)).toBe(2);
+  });
+});
diff --git a/plugins/design-control/src/__tests__/provenance/cli.test.ts b/plugins/design-control/src/__tests__/provenance/cli.test.ts
new file mode 100644
index 00000000..2abb16c1
--- /dev/null
+++ b/plugins/design-control/src/__tests__/provenance/cli.test.ts
@@ -0,0 +1,242 @@
+import { describe, it, expect, afterEach } from 'vitest';
+import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { runWireframeProvenance } from '@/provenance/cli';
+import { loadProvenance, recordDerivation, recordDrivingWireframe } from '@/provenance/derived';
+import type { CliIo } from '@/authoring/lint-file';
+
+const dirs: string[] = [];
+afterEach(() => {
+  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
+});
+
+function freshDir(): string {
+  const dir = mkdtempSync(join(tmpdir(), 'dc-prov-cli-'));
+  dirs.push(dir);
+  return dir;
+}
+
+const draftHtml =
+  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>' +
+  '<link rel="stylesheet" href="sketch-kit.css"></head>' +
+  '<body class="sk sk-theme-grayscale"><h1>Entry list</h1></body></html>';
+
+function capture(): { out: string[]; err: string[]; io: CliIo } {
+  const out: string[] = [];
+  const err: string[] = [];
+  return { out, err, io: { out: (l) => out.push(l), err: (l) => err.push(l) } };
+}
+
+describe('runWireframeProvenance — record-driving', () => {
+  it('exits 0 and writes the driving sidecar for an on-disk wireframe', () => {
+    const dir = freshDir();
+    writeFileSync(join(dir, 'surface-a.html'), draftHtml);
+    const { io, out } = capture();
+    expect(runWireframeProvenance(['record-driving', dir, 'surface-a', 'surface-a.html'], io)).toBe(0);
+    const prov = loadProvenance(dir, 'surface-a');
+    expect(prov.mode).toBe('driving');
+    expect(out.join('\n')).toMatch(/driving/i);
+  });
+
+  it('exits 1 with a descriptive error when the wireframe file is missing', () => {
+    const dir = freshDir();
+    const { io, err } = capture();
+    expect(runWireframeProvenance(['record-driving', dir, 'ghost', 'ghost.html'], io)).toBe(1);
+    expect(err.join('\n')).toMatch(/does not exist/i);
+    expect(readdirSync(dir)).toEqual([]);
+  });
+
+  it('exits 1 on the append-once refusal (existing sidecar, any mode)', () => {
+    const dir = freshDir();
+    writeFileSync(join(dir, 'taken.html'), draftHtml);
+    recordDerivation({ dir, surfaceId: 'taken', derivedHtml: draftHtml, source: 'live surface' });
+    const { io, err } = capture();
+    expect(runWireframeProvenance(['record-driving', dir, 'taken', 'taken.html'], io)).toBe(1);
+    expect(err.join('\n')).toMatch(/append-once/i);
+  });
+
+  it('exits 1 on a non-portable surfaceId, naming the constraint', () => {
+    const dir = freshDir();
+    writeFileSync(join(dir, 'w.html'), draftHtml);
+    const { io, err } = capture();
+    expect(runWireframeProvenance(['record-driving', dir, '../escape', 'w.html'], io)).toBe(1);
+    expect(err.join('\n')).toMatch(/portable-filename/i);
+  });
+});
+
+describe('runWireframeProvenance — record-derived', () => {
+  it('exits 0, reading the draft from --from and committing snapshot + sidecar', () => {
+    const dir = freshDir();
+    const draftFile = join(freshDir(), 'draft.html');
+    writeFileSync(draftFile, draftHtml);
+    const { io, out } = capture();
+    expect(
+      runWireframeProvenance(
+        ['record-derived', dir, 'surface-d', 'route /dev/studio', '--from', draftFile],
+        io,
+      ),
+    ).toBe(0);
+    const prov = loadProvenance(dir, 'surface-d');
+    expect(prov.mode).toBe('derived');
+    if (prov.mode !== 'derived') throw new Error('unreachable');
+    expect(prov.derived.source).toBe('route /dev/studio');
+    expect(readFileSync(join(dir, 'surface-d.derived-snapshot.html'), 'utf8')).toBe(draftHtml);
+    expect(out.join('\n')).toMatch(/derived/i);
+  });
+
+  it('exits 1 with a descriptive error when the --from draft file cannot be read', () => {
+    const dir = freshDir();
+    const { io, err } = capture();
+    expect(
+      runWireframeProvenance(
+        ['record-derived', dir, 'surface-d', 'live surface', '--from', join(dir, 'nope.html')],
+        io,
+      ),
+    ).toBe(1);
+    expect(err.join('\n')).toMatch(/no such file|does not exist|ENOENT/i);
+    expect(readdirSync(dir)).toEqual([]);
+  });
+
+  it('exits 1 on the append-once refusal over an existing record', () => {
+    const dir = freshDir();
+    writeFileSync(join(dir, 'existing.html'), draftHtml);
+    recordDrivingWireframe({ dir, surfaceId: 'existing', wireframeFile: 'existing.html' });
+    const draftFile = join(freshDir(), 'draft.html');
+    writeFileSync(draftFile, draftHtml);
+    const { io, err } = capture();
+    expect(
+      runWireframeProvenance(
+        ['record-derived', dir, 'existing', 'live surface', '--from', draftFile],
+        io,
+      ),
+    ).toBe(1);
+    expect(err.join('\n')).toMatch(/append-once/i);
+  });
+
+  it('exits 2 with usage when the --from flag is misspelled or missing', () => {
+    const dir = freshDir();
+    const a = capture();
+    expect(
+      runWireframeProvenance(['record-derived', dir, 's', 'src', '--form', 'x.html'], a.io),
+    ).toBe(2);
+    expect(a.err.join('\n')).toMatch(/usage/i);
+    const b = capture();
+    expect(runWireframeProvenance(['record-derived', dir, 's', 'src'], b.io)).toBe(2);
+    expect(b.err.join('\n')).toMatch(/usage/i);
+  });
+});
+
+describe('runWireframeProvenance — check-acceptance', () => {
+  it('exits 0 when the accepted artifact carries a non-empty edit against the snapshot', () => {
+    const dir = freshDir();
+    recordDerivation({ dir, surfaceId: 's1', derivedHtml: draftHtml, source: 'live surface' });
+    const accepted = join(freshDir(), 'accepted.html');
+    writeFileSync(accepted, draftHtml.replace('Entry list', 'Entry list, regrouped'));
+    const { io, out } = capture();
+    expect(runWireframeProvenance(['check-acceptance', dir, 's1', accepted], io)).toBe(0);
+    expect(out.join('\n')).toMatch(/ok|accept/i);
+  });
+
+  it('exits 1 with the derived-unedited finding on stderr for a byte-identical artifact', () => {
+    const dir = freshDir();
+    recordDerivation({ dir, surfaceId: 's1', derivedHtml: draftHtml, source: 'live surface' });
+    const accepted = join(freshDir(), 'accepted.html');
+    writeFileSync(accepted, draftHtml);
+    const { io, err } = capture();
+    expect(runWireframeProvenance(['check-acceptance', dir, 's1', accepted], io)).toBe(1);
+    expect(err.join('\n')).toMatch(/derived-unedited/);
+  });
+
+  it('exits 1 with a descriptive error on a tampered baseline (hash mismatch throws)', () => {
+    const dir = freshDir();
+    recordDerivation({ dir, surfaceId: 's1', derivedHtml: draftHtml, source: 'live surface' });
+    writeFileSync(join(dir, 's1.derived-snapshot.html'), draftHtml + '<!-- tampered -->');
+    const accepted = join(freshDir(), 'accepted.html');
+    writeFileSync(accepted, draftHtml + '<edit>');
+    const { io, err } = capture();
+    expect(runWireframeProvenance(['check-acceptance', dir, 's1', accepted], io)).toBe(1);
+    expect(err.join('\n')).toMatch(/hash|baseline|derivation/i);
+  });
+
+  it('exits 1 with a descriptive error when the accepted-artifact file cannot be read', () => {
+    const dir = freshDir();
+    recordDerivation({ dir, surfaceId: 's1', derivedHtml: draftHtml, source: 'live surface' });
+    const { io, err } = capture();
+    expect(
+      runWireframeProvenance(['check-acceptance', dir, 's1', join(dir, 'absent.html')], io),
+    ).toBe(1);
+    expect(err.join('\n')).toMatch(/no such file|does not exist|ENOENT/i);
+  });
+
+  it('exits 0 for a driving record (the gate is mode-scoped)', () => {
+    const dir = freshDir();
+    writeFileSync(join(dir, 'w.html'), draftHtml);
+    recordDrivingWireframe({ dir, surfaceId: 'fresh', wireframeFile: 'w.html' });
+    const accepted = join(freshDir(), 'accepted.html');
+    writeFileSync(accepted, draftHtml);
+    const { io } = capture();
+    expect(runWireframeProvenance(['check-acceptance', dir, 'fresh', accepted], io)).toBe(0);
+  });
+});
+
+describe('runWireframeProvenance — verify-driving', () => {
+  it('exits 0 when the bound wireframe still matches the recorded hash', () => {
+    const dir = freshDir();
+    writeFileSync(join(dir, 'intact.html'), draftHtml);
+    recordDrivingWireframe({ dir, surfaceId: 'intact', wireframeFile: 'intact.html' });
+    const { io, out } = capture();
+    expect(runWireframeProvenance(['verify-driving', dir, 'intact'], io)).toBe(0);
+    expect(out.join('\n')).toMatch(/verified/i);
+  });
+
+  it('exits 1 with a descriptive error on a hash mismatch (artifact replaced after recording)', () => {
+    const dir = freshDir();
+    writeFileSync(join(dir, 'swapped.html'), draftHtml);
+    recordDrivingWireframe({ dir, surfaceId: 'swapped', wireframeFile: 'swapped.html' });
+    writeFileSync(join(dir, 'swapped.html'), draftHtml + '<!-- replaced -->');
+    const { io, err } = capture();
+    expect(runWireframeProvenance(['verify-driving', dir, 'swapped'], io)).toBe(1);
+    expect(err.join('\n')).toMatch(/hash|modified|replaced/i);
+  });
+
+  it('exits 1 when the surface has no provenance sidecar', () => {
+    const { io, err } = capture();
+    expect(runWireframeProvenance(['verify-driving', freshDir(), 'absent'], io)).toBe(1);
+    expect(err.join('\n')).toMatch(/no provenance sidecar/i);
+  });
+
+  it('exits 1 on a derived record (mode mismatch — derived never certifies the claim)', () => {
+    const dir = freshDir();
+    recordDerivation({ dir, surfaceId: 'rev', derivedHtml: draftHtml, source: 'live surface' });
+    const { io, err } = capture();
+    expect(runWireframeProvenance(['verify-driving', dir, 'rev'], io)).toBe(1);
+    expect(err.join('\n')).toMatch(/derived/i);
+  });
+});
+
+describe('runWireframeProvenance — usage errors', () => {
+  it('exits 2 with usage on an unknown subcommand', () => {
+    const { io, err } = capture();
+    expect(runWireframeProvenance(['frobnicate', 'a', 'b'], io)).toBe(2);
+    expect(err.join('\n')).toMatch(/usage/i);
+  });
+
+  it('exits 2 with usage when no subcommand is given', () => {
+    const { io, err } = capture();
+    expect(runWireframeProvenance([], io)).toBe(2);
+    expect(err.join('\n')).toMatch(/usage/i);
+  });
+
+  it.each([
+    [['record-driving', 'dir', 'id']],
+    [['record-driving', 'dir', 'id', 'f.html', 'extra']],
+    [['check-acceptance', 'dir', 'id']],
+    [['verify-driving', 'dir']],
+    [['verify-driving', 'dir', 'id', 'extra']],
+  ])('exits 2 with usage on wrong arity: %j', (argv) => {
+    const { io, err } = capture();
+    expect(runWireframeProvenance(argv, io)).toBe(2);
+    expect(err.join('\n')).toMatch(/usage/i);
+  });
+});
diff --git a/plugins/design-control/src/__tests__/provenance/derived.test.ts b/plugins/design-control/src/__tests__/provenance/derived.test.ts
new file mode 100644
index 00000000..3258abf1
--- /dev/null
+++ b/plugins/design-control/src/__tests__/provenance/derived.test.ts
@@ -0,0 +1,478 @@
+import { describe, it, expect, afterEach } from 'vitest';
+import {
+  copyFileSync,
+  existsSync,
+  mkdirSync,
+  mkdtempSync,
+  readFileSync,
+  writeFileSync,
+  rmSync,
+  readdirSync,
+  statSync,
+} from 'node:fs';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import {
+  recordDerivation,
+  loadProvenance,
+  checkDerivedAcceptance,
+  wireframeDroveImplementation,
+  recordDrivingWireframe,
+  verifyDrivingWireframe,
+} from '@/provenance/derived';
+
+const dirs: string[] = [];
+afterEach(() => {
+  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
+});
+
+function freshDir(): string {
+  const dir = mkdtempSync(join(tmpdir(), 'dc-prov-'));
+  dirs.push(dir);
+  return dir;
+}
+
+const draftHtml =
+  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>' +
+  '<link rel="stylesheet" href="sketch-kit.css"></head>' +
+  '<body class="sk sk-theme-grayscale"><h1>Derived from live surface</h1></body></html>';
+
+/** Write a lint-green-stand-in wireframe file into dir; returns its filename. */
+function writeWireframe(dir: string, name = 'wireframe.html', html = draftHtml): string {
+  writeFileSync(join(dir, name), html);
+  return name;
+}
+
+describe('recordDerivation', () => {
+  it('writes the auto-derived snapshot AND the provenance sidecar at derivation time', () => {
+    const dir = freshDir();
+    const prov = recordDerivation({
+      dir,
+      surfaceId: 'studio-content-browser',
+      derivedHtml: draftHtml,
+      source: 'http://localhost:4321/dev/editorial-studio',
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    expect(prov.mode).toBe('derived');
+    const names = readdirSync(dir);
+    expect(names).toContain('studio-content-browser.derived-snapshot.html');
+    expect(names).toContain('studio-content-browser.provenance.json');
+    expect(readFileSync(join(dir, 'studio-content-browser.derived-snapshot.html'), 'utf8')).toBe(draftHtml);
+  });
+
+  it('round-trips through loadProvenance (zod-validated)', () => {
+    const dir = freshDir();
+    recordDerivation({
+      dir,
+      surfaceId: 'scrapbook-drawer',
+      derivedHtml: draftHtml,
+      source: 'route /dev/scrapbook',
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    const prov = loadProvenance(dir, 'scrapbook-drawer');
+    expect(prov.surfaceId).toBe('scrapbook-drawer');
+    expect(prov.mode).toBe('derived');
+    if (prov.mode !== 'derived') throw new Error('unreachable');
+    expect(prov.derived.source).toBe('route /dev/scrapbook');
+    expect(prov.derived.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
+  });
+});
+
+describe('recordDerivation — all-or-nothing commit (no half-state when a write fails)', () => {
+  it('leaves NEITHER a committed sidecar NOR a committed snapshot when the snapshot write fails', () => {
+    const dir = freshDir();
+    // Deterministic, portable second-write failure: a DIRECTORY planted at the
+    // snapshot target path makes any attempt to place a file there (write or
+    // rename-promote) throw on every platform.
+    mkdirSync(join(dir, 'half.derived-snapshot.html'));
+
+    expect(() =>
+      recordDerivation({
+        dir,
+        surfaceId: 'half',
+        derivedHtml: draftHtml,
+        source: 'live surface',
+        createdAt: new Date('2026-06-10T12:00:00Z'),
+      }),
+    ).toThrow();
+
+    // No committed sidecar may survive the failed pairing — loadProvenance
+    // must fail loud (absent sidecar), not return a record whose snapshot
+    // does not exist.
+    expect(existsSync(join(dir, 'half.provenance.json'))).toBe(false);
+    expect(() => loadProvenance(dir, 'half')).toThrow(/no provenance sidecar/i);
+
+    // The planted blocker is still the directory (no snapshot FILE was
+    // committed over it), and no temp-suffixed staging debris lingers.
+    expect(statSync(join(dir, 'half.derived-snapshot.html')).isDirectory()).toBe(true);
+    expect(readdirSync(dir).filter((n) => n !== 'half.derived-snapshot.html')).toEqual([]);
+  });
+
+  it('happy path commits exactly the sidecar + snapshot pair, with no staging debris', () => {
+    const dir = freshDir();
+    recordDerivation({
+      dir,
+      surfaceId: 'clean',
+      derivedHtml: draftHtml,
+      source: 'live surface',
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    expect(readdirSync(dir).sort()).toEqual([
+      'clean.derived-snapshot.html',
+      'clean.provenance.json',
+    ]);
+    expect(readFileSync(join(dir, 'clean.derived-snapshot.html'), 'utf8')).toBe(draftHtml);
+    const prov = loadProvenance(dir, 'clean');
+    expect(prov.mode).toBe('derived');
+    if (prov.mode !== 'derived') throw new Error('unreachable');
+    expect(prov.derived.snapshotFile).toBe('clean.derived-snapshot.html');
+    expect(prov.derived.source).toBe('live surface');
+  });
+});
+
+describe('loadProvenance fail-loud paths', () => {
+  it('throws a descriptive error when the sidecar is missing', () => {
+    expect(() => loadProvenance(freshDir(), 'nope')).toThrow(/provenance/i);
+  });
+
+  it('throws on a malformed sidecar (no silent fallback)', () => {
+    const dir = freshDir();
+    writeFileSync(join(dir, 'bad.provenance.json'), '{"mode":"derived"}');
+    expect(() => loadProvenance(dir, 'bad')).toThrow();
+  });
+
+  it('throws, naming BOTH ids, when the sidecar inner surfaceId does not match the requested one', () => {
+    const dir = freshDir();
+    recordDerivation({
+      dir,
+      surfaceId: 'surface-alpha',
+      derivedHtml: draftHtml,
+      source: 'live surface',
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    // Simulate a sidecar copied/renamed to another surface's filename: beta has
+    // no record of its own, but alpha's sidecar now sits at beta's path.
+    copyFileSync(
+      join(dir, 'surface-alpha.provenance.json'),
+      join(dir, 'surface-beta.provenance.json'),
+    );
+    expect(() => loadProvenance(dir, 'surface-beta')).toThrow(
+      /surface-beta[\s\S]*surface-alpha|surface-alpha[\s\S]*surface-beta/,
+    );
+  });
+});
+
+describe('checkDerivedAcceptance — acceptance requires a recorded operator edit', () => {
+  it('rejects a byte-identical accepted artifact (state transition alone is not an edit)', () => {
+    const dir = freshDir();
+    recordDerivation({
+      dir,
+      surfaceId: 's1',
+      derivedHtml: draftHtml,
+      source: 'live surface',
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    const result = checkDerivedAcceptance(dir, 's1', draftHtml);
+    expect(result.ok).toBe(false);
+    expect(result.findings.map((f) => f.rule)).toContain('derived-unedited');
+  });
+
+  it('accepts once the operator edit produces a non-empty diff against the stored snapshot', () => {
+    const dir = freshDir();
+    recordDerivation({
+      dir,
+      surfaceId: 's1',
+      derivedHtml: draftHtml,
+      source: 'live surface',
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    const edited = draftHtml.replace('Derived from live surface', 'Entry list, regrouped by lane');
+    expect(checkDerivedAcceptance(dir, 's1', edited).ok).toBe(true);
+  });
+
+  it('fails loud when the stored snapshot was tampered after recording (hash mismatch)', () => {
+    const dir = freshDir();
+    recordDerivation({
+      dir,
+      surfaceId: 's1',
+      derivedHtml: draftHtml,
+      source: 'live surface',
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    writeFileSync(join(dir, 's1.derived-snapshot.html'), draftHtml + '<!-- tampered -->');
+    expect(() => checkDerivedAcceptance(dir, 's1', 'whatever')).toThrow(/snapshot|hash/i);
+  });
+
+  it('does not gate a driving wireframe (the derived gate is mode-scoped)', () => {
+    const dir = freshDir();
+    recordDrivingWireframe({
+      dir,
+      surfaceId: 'fresh',
+      wireframeFile: writeWireframe(dir),
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    expect(checkDerivedAcceptance(dir, 'fresh', draftHtml).ok).toBe(true);
+  });
+});
+
+describe('surfaceId filename validation — path-traversal and separator rejection', () => {
+  const hostileIds = ['../escape', '..', 'a/b', 'nested/../../etc', 'a\\b', 'space id', ''];
+
+  it.each(hostileIds)('recordDrivingWireframe rejects %j with an error naming the constraint', (id) => {
+    const dir = freshDir();
+    expect(() =>
+      recordDrivingWireframe({ dir, surfaceId: id, wireframeFile: writeWireframe(dir) }),
+    ).toThrow(/portable-filename|\^\[a-z0-9\]/i);
+  });
+
+  it.each(hostileIds)('recordDerivation rejects %j without writing any file', (id) => {
+    const dir = freshDir();
+    expect(() =>
+      recordDerivation({ dir, surfaceId: id, derivedHtml: draftHtml, source: 'live surface' }),
+    ).toThrow(/portable-filename|\^\[a-z0-9\]/i);
+    expect(readdirSync(dir)).toEqual([]);
+  });
+
+  it.each(hostileIds)('loadProvenance rejects %j before touching the filesystem', (id) => {
+    expect(() => loadProvenance(freshDir(), id)).toThrow(/portable-filename|\^\[a-z0-9\]/i);
+  });
+
+  it('rejects a bare ".." specifically — the pattern requires an alphanumeric first character', () => {
+    // /^[a-z0-9][a-z0-9._-]*$/i cannot match '..' because '.' fails the [a-z0-9] start anchor.
+    const dir = freshDir();
+    expect(() =>
+      recordDrivingWireframe({ dir, surfaceId: '..', wireframeFile: writeWireframe(dir) }),
+    ).toThrow(/portable-filename|\^\[a-z0-9\]/i);
+  });
+
+  it('the zod schema rejects a sidecar whose stored surfaceId is non-portable (load-side defense)', () => {
+    const dir = freshDir();
+    const hostile = {
+      version: 1,
+      surfaceId: '../escape',
+      mode: 'driving',
+      createdAt: '2026-06-10T12:00:00.000Z',
+    };
+    writeFileSync(join(dir, 'planted.provenance.json'), JSON.stringify(hostile));
+    expect(() => loadProvenance(dir, 'planted')).toThrow();
+  });
+
+  it('still accepts a normal kebab-case id (and dots/underscores after the first char)', () => {
+    const dir = freshDir();
+    recordDrivingWireframe({
+      dir,
+      surfaceId: 'studio-content_browser.v2',
+      wireframeFile: writeWireframe(dir),
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    expect(loadProvenance(dir, 'studio-content_browser.v2').surfaceId).toBe(
+      'studio-content_browser.v2',
+    );
+  });
+});
+
+describe('wireframeDroveImplementation', () => {
+  it('is true for a driving wireframe and FALSE for a derived one (even an accepted one)', () => {
+    const dir = freshDir();
+    const derived = recordDerivation({
+      dir,
+      surfaceId: 'd',
+      derivedHtml: draftHtml,
+      source: 'live surface',
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    const driving = recordDrivingWireframe({
+      dir,
+      surfaceId: 'w',
+      wireframeFile: writeWireframe(dir),
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    expect(wireframeDroveImplementation(derived)).toBe(false);
+    expect(wireframeDroveImplementation(driving)).toBe(true);
+  });
+});
+
+describe('recordDrivingWireframe — binds the wireframe artifact by filename + hash', () => {
+  it('records driving.wireframeFile and a sha256 hex of the wireframe bytes', () => {
+    const dir = freshDir();
+    const wireframeFile = writeWireframe(dir, 'studio-content-browser.html');
+    const prov = recordDrivingWireframe({
+      dir,
+      surfaceId: 'studio-content-browser',
+      wireframeFile,
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    expect(prov.mode).toBe('driving');
+    if (prov.mode !== 'driving') throw new Error('unreachable');
+    expect(prov.driving.wireframeFile).toBe('studio-content-browser.html');
+    expect(prov.driving.wireframeSha256).toMatch(/^[0-9a-f]{64}$/);
+  });
+
+  it('round-trips the driving binding through loadProvenance (zod-validated)', () => {
+    const dir = freshDir();
+    recordDrivingWireframe({
+      dir,
+      surfaceId: 'wf-bound',
+      wireframeFile: writeWireframe(dir, 'wf-bound.html'),
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    const prov = loadProvenance(dir, 'wf-bound');
+    expect(prov.mode).toBe('driving');
+    if (prov.mode !== 'driving') throw new Error('unreachable');
+    expect(prov.driving.wireframeFile).toBe('wf-bound.html');
+    expect(prov.driving.wireframeSha256).toMatch(/^[0-9a-f]{64}$/);
+  });
+
+  it('fails loud when the named wireframe file does not exist at record time', () => {
+    const dir = freshDir();
+    expect(() =>
+      recordDrivingWireframe({ dir, surfaceId: 'ghost', wireframeFile: 'ghost.html' }),
+    ).toThrow(/wireframe/i);
+    expect(readdirSync(dir)).toEqual([]);
+  });
+});
+
+describe('overwrite refusal — an existing record can never be silently re-recorded', () => {
+  it('refuses recordDrivingWireframe over an existing derived record (the laundering direction)', () => {
+    const dir = freshDir();
+    recordDerivation({
+      dir,
+      surfaceId: 'laundered',
+      derivedHtml: draftHtml,
+      source: 'live surface',
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    const wireframeFile = writeWireframe(dir, 'laundered.html');
+    expect(() =>
+      recordDrivingWireframe({ dir, surfaceId: 'laundered', wireframeFile }),
+    ).toThrow(/laundered[\s\S]*derived[\s\S]*(remov|supersed)/i);
+  });
+
+  it('refuses recordDerivation over an existing driving record', () => {
+    const dir = freshDir();
+    recordDrivingWireframe({
+      dir,
+      surfaceId: 'flipped',
+      wireframeFile: writeWireframe(dir, 'flipped.html'),
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    expect(() =>
+      recordDerivation({ dir, surfaceId: 'flipped', derivedHtml: draftHtml, source: 'live surface' }),
+    ).toThrow(/flipped[\s\S]*driving[\s\S]*(remov|supersed)/i);
+  });
+
+  it('refuses a same-mode driving re-record', () => {
+    const dir = freshDir();
+    const wireframeFile = writeWireframe(dir, 'rerecord.html');
+    recordDrivingWireframe({
+      dir,
+      surfaceId: 'rerecord',
+      wireframeFile,
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    expect(() =>
+      recordDrivingWireframe({ dir, surfaceId: 'rerecord', wireframeFile }),
+    ).toThrow(/rerecord[\s\S]*driving[\s\S]*(remov|supersed)/i);
+  });
+
+  it('refuses a same-mode derived re-record', () => {
+    const dir = freshDir();
+    recordDerivation({
+      dir,
+      surfaceId: 'rederive',
+      derivedHtml: draftHtml,
+      source: 'live surface',
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    expect(() =>
+      recordDerivation({
+        dir,
+        surfaceId: 'rederive',
+        derivedHtml: draftHtml + '<!-- second derivation -->',
+        source: 'another surface',
+      }),
+    ).toThrow(/rederive[\s\S]*derived[\s\S]*(remov|supersed)/i);
+  });
+
+  it('leaves the existing sidecar AND snapshot byte-identical after a refused overwrite', () => {
+    const dir = freshDir();
+    recordDerivation({
+      dir,
+      surfaceId: 'baseline',
+      derivedHtml: draftHtml,
+      source: 'live surface',
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    const sidecarBefore = readFileSync(join(dir, 'baseline.provenance.json'), 'utf8');
+    const snapshotBefore = readFileSync(join(dir, 'baseline.derived-snapshot.html'), 'utf8');
+
+    const wireframeFile = writeWireframe(dir, 'baseline.html');
+    expect(() =>
+      recordDrivingWireframe({ dir, surfaceId: 'baseline', wireframeFile }),
+    ).toThrow();
+    expect(() =>
+      recordDerivation({
+        dir,
+        surfaceId: 'baseline',
+        derivedHtml: draftHtml + '<!-- would replace the snapshot -->',
+        source: 'second derivation',
+      }),
+    ).toThrow();
+
+    expect(readFileSync(join(dir, 'baseline.provenance.json'), 'utf8')).toBe(sidecarBefore);
+    expect(readFileSync(join(dir, 'baseline.derived-snapshot.html'), 'utf8')).toBe(snapshotBefore);
+  });
+});
+
+describe('verifyDrivingWireframe — tamper-checks the bound artifact like checkDerivedAcceptance', () => {
+  it('returns the provenance when the wireframe bytes still match the recorded hash', () => {
+    const dir = freshDir();
+    recordDrivingWireframe({
+      dir,
+      surfaceId: 'intact',
+      wireframeFile: writeWireframe(dir, 'intact.html'),
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    const prov = verifyDrivingWireframe(dir, 'intact');
+    expect(prov.mode).toBe('driving');
+    expect(prov.surfaceId).toBe('intact');
+  });
+
+  it('throws when the wireframe bytes were replaced after recording (hash mismatch)', () => {
+    const dir = freshDir();
+    const wireframeFile = writeWireframe(dir, 'swapped.html');
+    recordDrivingWireframe({
+      dir,
+      surfaceId: 'swapped',
+      wireframeFile,
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    writeFileSync(join(dir, wireframeFile), draftHtml + '<!-- wholesale replacement -->');
+    expect(() => verifyDrivingWireframe(dir, 'swapped')).toThrow(/hash|wireframe/i);
+  });
+
+  it('throws when the bound wireframe file has gone missing', () => {
+    const dir = freshDir();
+    const wireframeFile = writeWireframe(dir, 'vanished.html');
+    recordDrivingWireframe({
+      dir,
+      surfaceId: 'vanished',
+      wireframeFile,
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    rmSync(join(dir, wireframeFile));
+    expect(() => verifyDrivingWireframe(dir, 'vanished')).toThrow(/wireframe/i);
+  });
+
+  it('throws on a derived record — a derived artifact never certifies the driving claim', () => {
+    const dir = freshDir();
+    recordDerivation({
+      dir,
+      surfaceId: 'reverse-engineered',
+      derivedHtml: draftHtml,
+      source: 'live surface',
+      createdAt: new Date('2026-06-10T12:00:00Z'),
+    });
+    expect(() => verifyDrivingWireframe(dir, 'reverse-engineered')).toThrow(/driving|derived/i);
+  });
+});
diff --git a/plugins/design-control/src/authoring/check-wireframe-cli.ts b/plugins/design-control/src/authoring/check-wireframe-cli.ts
new file mode 100644
index 00000000..3838653a
--- /dev/null
+++ b/plugins/design-control/src/authoring/check-wireframe-cli.ts
@@ -0,0 +1,12 @@
+/**
+ * Process entry for `bin/check-wireframe`. All behavior lives in
+ * {@link runCheckWireframe} (tested directly); this file only wires argv and
+ * the process exit code.
+ */
+
+import { runCheckWireframe } from '@/authoring/lint-file';
+
+process.exitCode = runCheckWireframe(process.argv.slice(2), {
+  out: (line) => console.log(line),
+  err: (line) => console.error(line),
+});
diff --git a/plugins/design-control/src/authoring/index.ts b/plugins/design-control/src/authoring/index.ts
new file mode 100644
index 00000000..c6773979
--- /dev/null
+++ b/plugins/design-control/src/authoring/index.ts
@@ -0,0 +1,5 @@
+/**
+ * Public surface of the wireframe-authoring path. Import via `@/authoring`.
+ */
+
+export { type CliIo, lintWireframeFile, runCheckWireframe } from '@/authoring/lint-file';
diff --git a/plugins/design-control/src/authoring/lint-file.ts b/plugins/design-control/src/authoring/lint-file.ts
new file mode 100644
index 00000000..310dc89c
--- /dev/null
+++ b/plugins/design-control/src/authoring/lint-file.ts
@@ -0,0 +1,68 @@
+/**
+ * File-level entry to the `check-mockup-lofi` lint — the enforcement seam the
+ * `/design-control:wireframe` authoring skill (and the `bin/check-wireframe`
+ * shim) route EVERY wireframe draft through, manual or engine-authored alike.
+ *
+ * This is deliberately a thin composition of the existing axes — axis 1
+ * (element/attribute allowlist) + axis 1.5 (stylesheet identity pin) + the
+ * codepoint allowlist — via `lintWireframe`. No parallel lint path: the skill
+ * and the library agree by construction because they call the same pipeline.
+ */
+
+import { readFileSync } from 'node:fs';
+import { dirname, resolve } from 'node:path';
+import { lintWireframe } from '@/lint/check-mockup-lofi';
+import { buildSketchKitPin } from '@/lint/stylesheet-pin';
+import type { LintResult } from '@/lint/types';
+
+/**
+ * Lint a wireframe FILE: read it, build the sketch-kit identity pin against the
+ * file's own directory (the conventional layout — the kit copy sits next to the
+ * wireframe), and run the full pinned lint. Fails loud on an unreadable file —
+ * a missing wireframe is an error, never a clean verdict.
+ */
+export function lintWireframeFile(filePath: string): LintResult {
+  const absolute = resolve(filePath);
+  const html = readFileSync(absolute, 'utf8');
+  return lintWireframe(html, { stylesheetPin: buildSketchKitPin(dirname(absolute)) });
+}
+
+/** Line-oriented output sink, injected so the CLI core is testable as a function. */
+export interface CliIo {
+  out(line: string): void;
+  err(line: string): void;
+}
+
+const USAGE = 'usage: check-wireframe <wireframe.html>';
+
+/**
+ * CLI core behind `bin/check-wireframe`. Exit-code contract (the skill's gate):
+ *   0 — lint green (zero findings)
+ *   1 — findings present, or the file could not be read (descriptive error;
+ *       never a fabricated verdict)
+ *   2 — usage error
+ */
+export function runCheckWireframe(argv: readonly string[], io: CliIo): number {
+  if (argv.length !== 1) {
+    io.err(USAGE);
+    return 2;
+  }
+  const filePath = argv[0];
+  let result: LintResult;
+  try {
+    result = lintWireframeFile(filePath);
+  } catch (error) {
+    io.err(error instanceof Error ? error.message : String(error));
+    return 1;
+  }
+  if (result.ok) {
+    io.out(`${filePath}: lint green — 0 findings`);
+    return 0;
+  }
+  for (const finding of result.findings) {
+    const where = [finding.tag, finding.attr].filter(Boolean).join(' ');
+    io.err(`${finding.rule}${where ? ` (${where})` : ''}: ${finding.message}`);
+  }
+  io.err(`${filePath}: ${result.findings.length} finding(s)`);
+  return 1;
+}
diff --git a/plugins/design-control/src/provenance/cli.ts b/plugins/design-control/src/provenance/cli.ts
new file mode 100644
index 00000000..4f6e022a
--- /dev/null
+++ b/plugins/design-control/src/provenance/cli.ts
@@ -0,0 +1,120 @@
+/**
+ * CLI core behind `bin/wireframe-provenance` — the executable firing surface
+ * for the provenance recorders and gates (AUDIT-20260611-03). Mirrors the lint
+ * seam (`bin/check-wireframe` → `check-wireframe-cli.ts` → tested
+ * `runCheckWireframe`): all behavior lives here, tested as a function; the
+ * process entry only wires argv and the exit code.
+ *
+ * Subcommands (exit codes: 0 success/ok, 1 refusal or error, 2 usage):
+ *   record-driving   <dir> <surfaceId> <wireframeFile>
+ *   record-derived   <dir> <surfaceId> <source> --from <derivedHtmlFile>
+ *   check-acceptance <dir> <surfaceId> <acceptedHtmlFile>
+ *   verify-driving   <dir> <surfaceId>
+ */
+
+import { readFileSync } from 'node:fs';
+import type { CliIo } from '@/authoring/lint-file';
+import {
+  checkDerivedAcceptance,
+  recordDerivation,
+  recordDrivingWireframe,
+  verifyDrivingWireframe,
+} from '@/provenance/derived';
+
+const USAGE = [
+  'usage: wireframe-provenance <subcommand> ...',
+  '  record-driving   <dir> <surfaceId> <wireframeFile>',
+  '  record-derived   <dir> <surfaceId> <source> --from <derivedHtmlFile>',
+  '  check-acceptance <dir> <surfaceId> <acceptedHtmlFile>',
+  '  verify-driving   <dir> <surfaceId>',
+];
+
+function printUsage(io: CliIo): number {
+  for (const line of USAGE) io.err(line);
+  return 2;
+}
+
+function printError(io: CliIo, error: unknown): number {
+  io.err(error instanceof Error ? error.message : String(error));
+  return 1;
+}
+
+function runRecordDriving(args: readonly string[], io: CliIo): number {
+  if (args.length !== 3) return printUsage(io);
+  const [dir, surfaceId, wireframeFile] = args;
+  try {
+    recordDrivingWireframe({ dir, surfaceId, wireframeFile });
+  } catch (error) {
+    return printError(io, error);
+  }
+  io.out(`Recorded driving provenance for surface "${surfaceId}" (wireframe ${wireframeFile}).`);
+  return 0;
+}
+
+function runRecordDerived(args: readonly string[], io: CliIo): number {
+  if (args.length !== 5 || args[3] !== '--from') return printUsage(io);
+  const [dir, surfaceId, source, , derivedHtmlFile] = args;
+  try {
+    const derivedHtml = readFileSync(derivedHtmlFile, 'utf8');
+    recordDerivation({ dir, surfaceId, derivedHtml, source });
+  } catch (error) {
+    return printError(io, error);
+  }
+  io.out(
+    `Recorded derived provenance for surface "${surfaceId}" (snapshot + sidecar committed; ` +
+      `source: ${source}).`,
+  );
+  return 0;
+}
+
+function runCheckAcceptance(args: readonly string[], io: CliIo): number {
+  if (args.length !== 3) return printUsage(io);
+  const [dir, surfaceId, acceptedHtmlFile] = args;
+  try {
+    const acceptedHtml = readFileSync(acceptedHtmlFile, 'utf8');
+    const result = checkDerivedAcceptance(dir, surfaceId, acceptedHtml);
+    if (!result.ok) {
+      for (const finding of result.findings) {
+        io.err(`${finding.rule}: ${finding.message}`);
+      }
+      return 1;
+    }
+  } catch (error) {
+    return printError(io, error);
+  }
+  io.out(`Surface "${surfaceId}": acceptance gate ok.`);
+  return 0;
+}
+
+function runVerifyDriving(args: readonly string[], io: CliIo): number {
+  if (args.length !== 2) return printUsage(io);
+  const [dir, surfaceId] = args;
+  try {
+    verifyDrivingWireframe(dir, surfaceId);
+  } catch (error) {
+    return printError(io, error);
+  }
+  io.out(`Surface "${surfaceId}": driving wireframe verified against its recorded hash.`);
+  return 0;
+}
+
+/**
+ * Dispatch entry for the `wireframe-provenance` bin. The exit-code contract is
+ * the skill's gate: 0 success, 1 refusal/error (descriptive message on stderr;
+ * never a fabricated verdict), 2 usage error.
+ */
+export function runWireframeProvenance(argv: readonly string[], io: CliIo): number {
+  const [subcommand, ...args] = argv;
+  switch (subcommand) {
+    case 'record-driving':
+      return runRecordDriving(args, io);
+    case 'record-derived':
+      return runRecordDerived(args, io);
+    case 'check-acceptance':
+      return runCheckAcceptance(args, io);
+    case 'verify-driving':
+      return runVerifyDriving(args, io);
+    default:
+      return printUsage(io);
+  }
+}
diff --git a/plugins/design-control/src/provenance/derived.ts b/plugins/design-control/src/provenance/derived.ts
new file mode 100644
index 00000000..b9133761
--- /dev/null
+++ b/plugins/design-control/src/provenance/derived.ts
@@ -0,0 +1,363 @@
+/**
+ * Wireframe provenance — the retroactive (`derived`) path.
+ *
+ * A wireframe is either DRIVING (authored before the implementation; the
+ * artifact that drove the change) or DERIVED (reverse-engineered from an
+ * already-existing surface). The derived path exists so a legacy surface can be
+ * brought under the discipline, but with two hard properties from the spec:
+ *
+ *  1. The auto-derived draft is SNAPSHOTTED at derivation time, alongside its
+ *     provenance, so acceptance has a baseline to diff against.
+ *  2. Accepting a `derived` artifact REQUIRES a recorded operator edit — a
+ *     non-empty byte diff between the stored snapshot and the accepted version.
+ *     A bare state transition is not an edit.
+ *
+ * And a `derived` artifact NEVER satisfies a "wireframe drove implementation"
+ * claim ({@link wireframeDroveImplementation}) — provenance distinguishes the
+ * two modes precisely so the claim cannot be laundered through acceptance.
+ *
+ * Provenance is APPEND-ONCE: recording over an existing sidecar fails loud in
+ * both modes and both directions, so a `derived` record can never be silently
+ * flipped to `driving` by a later call. Mode transitions require explicitly
+ * removing or superseding the existing record.
+ *
+ * Sidecar layout (per surface, in the operator-chosen provenance dir):
+ *   <surfaceId>.provenance.json          — zod-validated provenance record
+ *   <surfaceId>.derived-snapshot.html    — the auto-derived draft (derived only)
+ */
+
+import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
+import { join } from 'node:path';
+import { createHash } from 'node:crypto';
+import { z } from 'zod';
+
+const PROVENANCE_VERSION = 1;
+
+const sha256Hex = (content: string): string => createHash('sha256').update(content).digest('hex');
+
+/**
+ * `surfaceId` is interpolated into filesystem paths (sidecar + snapshot names),
+ * so it MUST be a portable filename: alphanumeric first character, then only
+ * letters, digits, `.`, `_`, `-`. This rejects `..` (the dot fails the
+ * alphanumeric start anchor) and any `/` or `\` (not in the character class),
+ * so an id can never escape the operator-chosen provenance directory or land
+ * in an unintended subdirectory.
+ */
+const SURFACE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
+
+const surfaceIdMessage = (surfaceId: string): string =>
+  `Invalid surfaceId ${JSON.stringify(surfaceId)}: surfaceId is used as a filename, so it must ` +
+  `match the portable-filename pattern ${String(SURFACE_ID_PATTERN)} — an alphanumeric first ` +
+  `character, then only letters, digits, ".", "_", "-". Path separators and ".." are rejected ` +
+  `so the sidecar and snapshot cannot escape the provenance directory.`;
+
+const surfaceIdSchema = z
+  .string()
+  .min(1)
+  .refine((id) => SURFACE_ID_PATTERN.test(id), {
+    message: `surfaceId must match the portable-filename pattern ${String(SURFACE_ID_PATTERN)}`,
+  });
+
+/** Fail loud at every path-building entry point — no fallback, no sanitizing. */
+function assertPortableSurfaceId(surfaceId: string): void {
+  if (!SURFACE_ID_PATTERN.test(surfaceId)) {
+    throw new Error(surfaceIdMessage(surfaceId));
+  }
+}
+
+const drivingSchema = z.object({
+  version: z.literal(PROVENANCE_VERSION),
+  surfaceId: surfaceIdSchema,
+  mode: z.literal('driving'),
+  createdAt: z.string().datetime(),
+  driving: z.object({
+    /** Filename (dir-relative) of the wireframe this record certifies. */
+    wireframeFile: z.string().min(1),
+    /** sha256 (hex) of the wireframe bytes as recorded — tamper evidence. */
+    wireframeSha256: z.string().regex(/^[0-9a-f]{64}$/),
+  }),
+});
+
+const derivedSchema = z.object({
+  version: z.literal(PROVENANCE_VERSION),
+  surfaceId: surfaceIdSchema,
+  mode: z.literal('derived'),
+  createdAt: z.string().datetime(),
+  derived: z.object({
+    /** Filename (dir-relative) of the snapshot stored at derivation time. */
+    snapshotFile: z.string().min(1),
+    /** sha256 (hex) of the snapshot bytes as recorded — tamper evidence. */
+    snapshotSha256: z.string().regex(/^[0-9a-f]{64}$/),
+    /** What the draft was derived FROM (route, URL, file — operator-meaningful). */
+    source: z.string().min(1),
+  }),
+});
+
+const provenanceSchema = z.discriminatedUnion('mode', [drivingSchema, derivedSchema]);
+
+export type WireframeProvenance = z.infer<typeof provenanceSchema>;
+
+export interface ProvenanceFinding {
+  readonly rule: 'derived-unedited';
+  readonly message: string;
+}
+
+export interface AcceptanceResult {
+  readonly ok: boolean;
+  readonly findings: readonly ProvenanceFinding[];
+}
+
+const sidecarPath = (dir: string, surfaceId: string): string =>
+  join(dir, `${surfaceId}.provenance.json`);
+
+/**
+ * The single chokepoint both recorders write through. Provenance is
+ * append-once: if a sidecar already exists for the surface — in ANY mode —
+ * writing fails loud. Without this, a later `recordDrivingWireframe` call
+ * could silently flip a `derived` record to `driving` (orphaning the
+ * derivation-time snapshot), after which {@link wireframeDroveImplementation}
+ * returns true — laundering the exact claim this module exists to prevent.
+ * Mode transitions are NOT a write-over; they require explicitly removing or
+ * superseding the existing record as a separate, deliberate operation.
+ */
+function assertAppendOnce(dir: string, provenance: WireframeProvenance): string {
+  const path = sidecarPath(dir, provenance.surfaceId);
+  if (existsSync(path)) {
+    const existing = loadProvenance(dir, provenance.surfaceId);
+    throw new Error(
+      `Refusing to record ${provenance.mode} provenance for surface "${provenance.surfaceId}": ` +
+        `a ${existing.mode} record already exists at ${path}. Provenance is append-once — ` +
+        `overwriting would silently rewrite the surface's mode and its recorded baseline. ` +
+        `Re-recording requires explicitly removing or superseding the existing record first.`,
+    );
+  }
+  return path;
+}
+
+function writeProvenance(dir: string, provenance: WireframeProvenance): void {
+  const path = assertAppendOnce(dir, provenance);
+  writeFileSync(path, JSON.stringify(provenance, null, 2) + '\n');
+}
+
+/**
+ * Failure-path cleanup for staged temp files. Swallows secondary errors
+ * deliberately: the caller is about to rethrow the ORIGINAL failure, and a
+ * cleanup hiccup (e.g. permissions just changed) must not mask it. This is
+ * cleanup, not a fallback — the operation still fails loud.
+ */
+function bestEffortRemove(path: string): void {
+  try {
+    rmSync(path, { force: true });
+  } catch {
+    // Intentionally swallowed — see doc comment above.
+  }
+}
+
+/**
+ * Record a DRIVING wireframe's provenance (the authored-first path). The record
+ * binds the artifact it certifies: `wireframeFile` (dir-relative filename of
+ * the lint-green wireframe, which exists by this point — lint precedes
+ * provenance in the skill's step ordering) is read and hashed at record time,
+ * so a later wholesale replacement of the wireframe is tamper-evident
+ * ({@link verifyDrivingWireframe}), mirroring the derived path's snapshot hash.
+ */
+export function recordDrivingWireframe(input: {
+  dir: string;
+  surfaceId: string;
+  /** Filename (within dir) of the wireframe HTML this record certifies. */
+  wireframeFile: string;
+  createdAt?: Date;
+}): WireframeProvenance {
+  assertPortableSurfaceId(input.surfaceId);
+  const wireframePath = join(input.dir, input.wireframeFile);
+  if (!existsSync(wireframePath)) {
+    throw new Error(
+      `Cannot record driving provenance for surface "${input.surfaceId}": wireframe file ` +
+        `${wireframePath} does not exist. The driving record binds the artifact it certifies ` +
+        `by filename + hash, so the lint-green wireframe must be on disk at record time ` +
+        `(lint precedes provenance — see the wireframe skill's step ordering).`,
+    );
+  }
+  const provenance: WireframeProvenance = {
+    version: PROVENANCE_VERSION,
+    surfaceId: input.surfaceId,
+    mode: 'driving',
+    createdAt: (input.createdAt ?? new Date()).toISOString(),
+    driving: {
+      wireframeFile: input.wireframeFile,
+      wireframeSha256: sha256Hex(readFileSync(wireframePath, 'utf8')),
+    },
+  };
+  writeProvenance(input.dir, provenance);
+  return provenance;
+}
+
+/**
+ * Record a DERIVED draft at derivation time: store the auto-derived snapshot
+ * AND the provenance sidecar in one move, so the acceptance diff always has its
+ * baseline. The snapshot hash is recorded for tamper evidence.
+ */
+export function recordDerivation(input: {
+  dir: string;
+  surfaceId: string;
+  derivedHtml: string;
+  source: string;
+  createdAt?: Date;
+}): WireframeProvenance {
+  assertPortableSurfaceId(input.surfaceId);
+  const snapshotFile = `${input.surfaceId}.derived-snapshot.html`;
+  const provenance: WireframeProvenance = {
+    version: PROVENANCE_VERSION,
+    surfaceId: input.surfaceId,
+    mode: 'derived',
+    createdAt: (input.createdAt ?? new Date()).toISOString(),
+    derived: {
+      snapshotFile,
+      snapshotSha256: sha256Hex(input.derivedHtml),
+      source: input.source,
+    },
+  };
+  // The append-once refusal fires BEFORE any byte hits disk — otherwise a
+  // refused re-derivation would have already clobbered (or littered next to)
+  // the existing surface's derivation-time baseline.
+  const sidecarTarget = assertAppendOnce(input.dir, provenance);
+  const snapshotTarget = join(input.dir, snapshotFile);
+  // All-or-nothing commit (AUDIT-20260611-07): two sequential writes to the
+  // final paths can be interrupted between them, leaving a committed sidecar
+  // whose snapshot does not exist (or vice versa). Instead, stage BOTH
+  // artifacts as temp files in the same directory, then promote each with an
+  // atomic rename only after both staged writes succeeded.
+  const stagedSnapshot = `${snapshotTarget}.tmp-${process.pid}`;
+  const stagedSidecar = `${sidecarTarget}.tmp-${process.pid}`;
+  try {
+    writeFileSync(stagedSnapshot, input.derivedHtml);
+    writeFileSync(stagedSidecar, JSON.stringify(provenance, null, 2) + '\n');
+    // Promote snapshot first, sidecar last: the sidecar is the commit point.
+    // If the process dies between the two renames, a snapshot without a
+    // sidecar is inert debris at worst — nothing reads it (loadProvenance
+    // fails loud on the absent sidecar, and recording for the surface is
+    // still possible). The inverse ordering would commit a sidecar whose
+    // recorded snapshot does not exist — a live record with a missing
+    // baseline that breaks checkDerivedAcceptance.
+    renameSync(stagedSnapshot, snapshotTarget);
+    renameSync(stagedSidecar, sidecarTarget);
+  } catch (error) {
+    bestEffortRemove(stagedSnapshot);
+    bestEffortRemove(stagedSidecar);
+    throw error;
+  }
+  return provenance;
+}
+
+/** Load + zod-validate a surface's provenance sidecar. Fails loud when absent/malformed. */
+export function loadProvenance(dir: string, surfaceId: string): WireframeProvenance {
+  assertPortableSurfaceId(surfaceId);
+  const path = sidecarPath(dir, surfaceId);
+  if (!existsSync(path)) {
+    throw new Error(
+      `No provenance sidecar for surface "${surfaceId}" at ${path}. ` +
+        `Record provenance at authoring/derivation time (recordDrivingWireframe / recordDerivation).`,
+    );
+  }
+  const parsed = provenanceSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
+  if (parsed.surfaceId !== surfaceId) {
+    throw new Error(
+      `Provenance sidecar identity mismatch at ${path}: requested surface "${surfaceId}" but the ` +
+        `sidecar records surfaceId "${parsed.surfaceId}". The sidecar was likely copied or renamed ` +
+        `to another surface's filename — its snapshot and hash belong to "${parsed.surfaceId}", so ` +
+        `it cannot vouch for "${surfaceId}". Remove the misplaced sidecar, then record provenance ` +
+        `for "${surfaceId}" (recording refuses to overwrite an existing sidecar).`,
+    );
+  }
+  return parsed;
+}
+
+/**
+ * The acceptance gate for `derived` artifacts: the accepted version must carry
+ * a recorded operator edit — a non-empty byte diff against the snapshot stored
+ * at derivation time. Driving wireframes pass through (the gate is mode-scoped).
+ * Fails loud if the stored snapshot no longer matches its recorded hash — a
+ * tampered baseline cannot certify an edit.
+ */
+export function checkDerivedAcceptance(
+  dir: string,
+  surfaceId: string,
+  acceptedHtml: string,
+): AcceptanceResult {
+  const provenance = loadProvenance(dir, surfaceId);
+  if (provenance.mode !== 'derived') {
+    return { ok: true, findings: [] };
+  }
+  const snapshotPath = join(dir, provenance.derived.snapshotFile);
+  const snapshot = readFileSync(snapshotPath, 'utf8');
+  if (sha256Hex(snapshot) !== provenance.derived.snapshotSha256) {
+    throw new Error(
+      `Derived snapshot ${snapshotPath} does not match the hash recorded at derivation time — ` +
+        `the baseline was modified after recording, so the operator-edit diff cannot be trusted. ` +
+        `Remove the existing record, then re-derive the draft to re-establish a baseline ` +
+        `(recording refuses to overwrite an existing sidecar).`,
+    );
+  }
+  if (acceptedHtml === snapshot) {
+    return {
+      ok: false,
+      findings: [
+        {
+          rule: 'derived-unedited',
+          message:
+            `Surface "${surfaceId}": the accepted artifact is byte-identical to the auto-derived ` +
+            `snapshot. Accepting a derived wireframe requires a recorded operator edit ` +
+            `(non-empty diff against the derivation-time snapshot), not just a state transition.`,
+        },
+      ],
+    };
+  }
+  return { ok: true, findings: [] };
+}
+
+/**
+ * Whether this wireframe supports a "wireframe drove implementation" claim.
+ * Only a DRIVING wireframe does; a `derived` one never does, edited or not —
+ * it was reverse-engineered from the surface it would be claiming to have driven.
+ */
+export function wireframeDroveImplementation(provenance: WireframeProvenance): boolean {
+  return provenance.mode === 'driving';
+}
+
+/**
+ * Verify a DRIVING record against the artifact it certifies, the way
+ * {@link checkDerivedAcceptance} checks the derived snapshot: load the
+ * provenance, require `mode === 'driving'`, re-hash the bound wireframe file,
+ * and fail loud on a mismatch — a record whose wireframe was replaced after
+ * recording cannot certify the "wireframe drove implementation" claim.
+ * Returns the (now hash-verified) provenance.
+ */
+export function verifyDrivingWireframe(dir: string, surfaceId: string): WireframeProvenance {
+  const provenance = loadProvenance(dir, surfaceId);
+  if (provenance.mode !== 'driving') {
+    throw new Error(
+      `Surface "${surfaceId}" has ${provenance.mode} provenance, not driving — a derived ` +
+        `artifact never supports a "wireframe drove implementation" claim, so there is no ` +
+        `driving binding to verify.`,
+    );
+  }
+  const wireframePath = join(dir, provenance.driving.wireframeFile);
+  if (!existsSync(wireframePath)) {
+    throw new Error(
+      `Driving provenance for surface "${surfaceId}" binds wireframe file ${wireframePath}, ` +
+        `but that file no longer exists — the record cannot certify an artifact that is gone. ` +
+        `Restore the wireframe, or remove the existing record and re-record provenance ` +
+        `(recording refuses to overwrite an existing sidecar).`,
+    );
+  }
+  if (sha256Hex(readFileSync(wireframePath, 'utf8')) !== provenance.driving.wireframeSha256) {
+    throw new Error(
+      `Wireframe ${wireframePath} does not match the hash recorded for surface "${surfaceId}" ` +
+        `at recording time — the artifact was modified or replaced after the driving record was ` +
+        `written, so the record cannot certify it. Remove the existing record, then re-lint and ` +
+        `re-record provenance for the current wireframe (recording refuses to overwrite an ` +
+        `existing sidecar).`,
+    );
+  }
+  return provenance;
+}
diff --git a/plugins/design-control/src/provenance/index.ts b/plugins/design-control/src/provenance/index.ts
new file mode 100644
index 00000000..928bf7e4
--- /dev/null
+++ b/plugins/design-control/src/provenance/index.ts
@@ -0,0 +1,17 @@
+/**
+ * Public surface of the wireframe-provenance module. Import via `@/provenance`.
+ */
+
+export {
+  type WireframeProvenance,
+  type ProvenanceFinding,
+  type AcceptanceResult,
+  recordDrivingWireframe,
+  recordDerivation,
+  loadProvenance,
+  checkDerivedAcceptance,
+  wireframeDroveImplementation,
+  verifyDrivingWireframe,
+} from '@/provenance/derived';
+
+export { runWireframeProvenance } from '@/provenance/cli';
diff --git a/plugins/design-control/src/provenance/wireframe-provenance-cli.ts b/plugins/design-control/src/provenance/wireframe-provenance-cli.ts
new file mode 100644
index 00000000..1270bdd8
--- /dev/null
+++ b/plugins/design-control/src/provenance/wireframe-provenance-cli.ts
@@ -0,0 +1,12 @@
+/**
+ * Process entry for `bin/wireframe-provenance`. All behavior lives in
+ * {@link runWireframeProvenance} (tested directly); this file only wires argv
+ * and the process exit code.
+ */
+
+import { runWireframeProvenance } from '@/provenance/cli';
+
+process.exitCode = runWireframeProvenance(process.argv.slice(2), {
+  out: (line) => console.log(line),
+  err: (line) => console.error(line),
+});

diff --git a/Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/INDEX.md b/Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/INDEX.md
new file mode 100644
index 00000000..385dbb00
--- /dev/null
+++ b/Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/INDEX.md
@@ -0,0 +1,39 @@
+# Audit-barrage run
+
+- timestamp: 20260611T062218157Z
+- feature: design-control-after_clarify
+- run dir: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify
+- prompt: PROMPT.md
+- models attempted: 3
+
+## Per-model results
+### claude
+
+- exit code: 143
+- duration: 300254 ms
+- stdout bytes: 0
+- stderr bytes: 0
+- stdout path: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/claude.md
+- stderr path: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/stderr/claude.txt
+- timed out: yes
+
+### codex
+
+- exit code: 0
+- duration: 19795 ms
+- stdout bytes: 2617
+- stderr bytes: 188512
+- stdout path: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/codex.md
+- stderr path: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/stderr/codex.txt
+- timed out: no
+
+### gemini
+
+- exit code: 1
+- duration: 152804 ms
+- stdout bytes: 0
+- stderr bytes: 2169
+- stdout path: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/gemini.md
+- stderr path: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/stderr/gemini.txt
+- timed out: no
+

diff --git a/Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/PROMPT.md b/Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/PROMPT.md
new file mode 100644
index 00000000..c6b1491d
--- /dev/null
+++ b/Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/PROMPT.md
@@ -0,0 +1,3757 @@
+# Audit-barrage — multi-model audit prompt template
+
+You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface the kinds of defects listed under **What to look for** below, in the work product captured under **Under audit**.
+
+You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.
+
+## Feature under audit
+
+design-control
+
+## Feature scope (workplan / PRD summary)
+
+Governance pass over the just-implemented work for feature 'design-control', diffed against 4a7f30d0. The differentiated back half audits a plan it did not author or execute.
+
+## Commit subjects in the audited range
+
+9c0d556c docs(design-control): disposition AUDIT-20260611-01..07 as fixed + record barrage run 20260611T055621128Z
+3d32a2fb fix(design-control): bin/wireframe-provenance gives the provenance recorders and gates an executable firing surface (AUDIT-20260611-03)
+a26a1645 fix(design-control): recordDerivation stages both artifacts and promotes atomically — sidecar is the commit point, no half-state on failure (AUDIT-20260611-07)
+0e4027c3 fix(design-control): provenance is append-once — writeProvenance refuses overwrite, killing the derived-to-driving laundering path (AUDIT-20260611-01)
+40124302 fix(design-control): bind driving provenance to its wireframe by filename + sha256 with verifyDrivingWireframe tamper check (AUDIT-20260611-04)
+84bcc73c fix(design-control): loadProvenance rejects a sidecar whose inner surfaceId mismatches the requested id (AUDIT-20260611-06)
+896be642 fix(design-control): validate surfaceId as portable filename at every provenance path-building entry (AUDIT-20260611-02)
+cc2b71e9 fix(design-control): rename misleading derivedAt param to createdAt in both provenance recorders (AUDIT-20260611-05)
+9639b445 feat(design-control): wireframe authoring skill + derived-provenance path — Phase 1 complete
+
+
+## Recent audit-log excerpt (prior findings on this feature)
+
+Use this to avoid re-reporting findings that have already been triaged. If a finding was previously dispositioned (`closed`, `won't-fix`, `accepted-trade-off`), don't re-litigate the disposition; only surface a new instance if the underlying shape regressed.
+
+Severity:   medium
+Surface:    plugins/design-control/src/provenance/derived.ts:31-36 (drivingSchema) vs 38-53 (derivedSchema)
+
+The `derived` record stores `snapshotFile`, `snapshotSha256`, and `source` — enough to identify and tamper-check its baseline. The `driving` record stores only `surfaceId`, `mode`, and `createdAt`. `wireframeDroveImplementation` therefore certifies a claim ("this wireframe drove the implementation") about an artifact the record cannot identify: the wireframe HTML next to the sidecar can be wholly replaced after recording and the claim still holds, with no tamper evidence of the kind the derived path deliberately built (lines 148-154). The asymmetry is visible side-by-side in the two schemas.
+
+Blast radius: a downstream consumer (the future referee, or any "did a wireframe drive this change?" check) gets a `true` that is unfalsifiable against the on-disk artifact. Nothing breaks today, but every claim recorded under this schema is permanently unverifiable, and a later schema fix can't retro-bind old records — the cost compounds with adoption, hence medium. Fix: record the wireframe's filename and sha256 at `recordDrivingWireframe` time (the wireframe file already exists at that point per SKILL.md step ordering — lint at step 5 precedes provenance at step 6), and have `wireframeDroveImplementation` (or a sibling verifier) check the hash the way `checkDerivedAcceptance` checks the snapshot.
+
+### AUDIT-20260611-05 — `recordDrivingWireframe` takes a parameter named `derivedAt` for a wireframe that is by definition not derived
+
+Finding-ID: AUDIT-20260611-05
+Status:     fixed-cc2b71e9 (2026-06-10; pure rename derivedAt → createdAt in both recorders + all call sites; suite green as regression net)
+Severity:   low
+Surface:    plugins/design-control/src/provenance/derived.ts:85-88; src/__tests__/provenance/derived.test.ts:118-122
+
+The driving-path recorder's optional timestamp input is named `derivedAt` (`input: { dir; surfaceId; derivedAt?: Date }`), feeding the sidecar field `createdAt`. The name contradicts the mode it records — "derived" is the *other* mode, and the module spends its entire header explaining why the two must never be confused. The tests dutifully pass `derivedAt` when recording a driving wireframe (derived.test.ts lines 118-122), which reads as a category error at every call site.
+
+Blast radius: no behavioral consequence — the value lands in `createdAt` correctly — but this is an exported public API (`@/provenance`), so the misleading name propagates to every future caller and to the eventual `bin/` verb's flag naming. Hence low. Fix: rename to `createdAt?` (or `at?`) in both record functions for symmetry, while the call-site count is still two test files.
+
+### AUDIT-20260611-06 — `loadProvenance` does not verify the sidecar's inner `surfaceId` matches the requested one
+
+Finding-ID: AUDIT-20260611-06
+Status:     fixed-84bcc73c (2026-06-10; loadProvenance asserts the sidecar's inner surfaceId equals the requested id, throwing with both ids; RED-first via copied-sidecar fixture)
+Severity:   low
+Surface:    plugins/design-control/src/provenance/derived.ts:129-139
+
+`loadProvenance(dir, surfaceId)` resolves the file by name and zod-validates its shape, but never asserts `parsed.surfaceId === surfaceId`. A sidecar copied or renamed to another surface's filename (an easy mistake when seeding a second surface from a first) loads cleanly and flows into `checkDerivedAcceptance`, whose finding message then reports the *argument's* surface id (line 158) while gating against the *other* surface's snapshot and hash — a confusing mixed-identity verdict instead of a loud failure.
+
+Blast radius: requires a file-management mistake to trigger, and the resulting behavior is confusing rather than silently wrong in a damaging direction (the hash check still fires against whatever snapshot the record names). Hence low. Fix: one equality check after parse, throwing with both ids in the message.
+
+### AUDIT-20260611-07 — `recordDerivation` can leave an orphaned snapshot if sidecar write fails
+
+Finding-ID: AUDIT-20260611-07
+Status:     fixed-a26a1645 (2026-06-10; both artifacts staged as .tmp-<pid> then promoted via renameSync — snapshot first, sidecar last as the commit point; staged temps cleaned on failure; 2 RED-first tests incl. planted-directory write failure)
+Severity:   medium
+Surface:    `plugins/design-control/src/provenance/derived.ts:102-118`
+
+`recordDerivation` writes `<surfaceId>.derived-snapshot.html` first, then writes `<surfaceId>.provenance.json`. If the process is interrupted, the disk fills, permissions change, or JSON sidecar write otherwise fails after line 104, the directory is left with a snapshot but no valid provenance record. The workplan says `recordDerivation` “writes snapshot + zod-validated sidecar in one move”; this implementation is sequential non-atomic writes.
+
+The blast radius is medium: normal consumers will usually succeed, but the failure mode creates ambiguous provenance state in the operator’s artifact directory. A later unattended agent or operator may see the snapshot and assume derivation was recorded, while `loadProvenance` fails loud because the sidecar is absent. A reasonable fix is to write both artifacts via temporary files and atomic renames, with cleanup on failure, or to write the sidecar first with a temporary snapshot reference and only promote both names once both writes have succeeded.
+
+
+## Under audit
+
+The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn't).
+
+diff --git a/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/INDEX.md b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/INDEX.md
+new file mode 100644
+index 00000000..36f8cab9
+--- /dev/null
++++ b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/INDEX.md
+@@ -0,0 +1,39 @@
++# Audit-barrage run
++
++- timestamp: 20260611T055621128Z
++- feature: design-control-after_clarify
++- run dir: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify
++- prompt: PROMPT.md
++- models attempted: 3
++
++## Per-model results
++### claude
++
++- exit code: 0
++- duration: 140180 ms
++- stdout bytes: 9430
++- stderr bytes: 0
++- stdout path: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/claude.md
++- stderr path: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/claude.txt
++- timed out: no
++
++### codex
++
++- exit code: 0
++- duration: 26545 ms
++- stdout bytes: 1238
++- stderr bytes: 41697
++- stdout path: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/codex.md
++- stderr path: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/codex.txt
++- timed out: no
++
++### gemini
++
++- exit code: 1
++- duration: 31332 ms
++- stdout bytes: 0
++- stderr bytes: 544
++- stdout path: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/gemini.md
++- stderr path: /Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/gemini.txt
++- timed out: no
++
+diff --git a/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/PROMPT.md b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/PROMPT.md
+new file mode 100644
+index 00000000..c7d93a97
+--- /dev/null
++++ b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/PROMPT.md
+@@ -0,0 +1,859 @@
++# Audit-barrage — multi-model audit prompt template
++
++You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface the kinds of defects listed under **What to look for** below, in the work product captured under **Under audit**.
++
++You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.
++
++## Feature under audit
++
++design-control
++
++## Feature scope (workplan / PRD summary)
++
++Governance pass over the just-implemented work for feature 'design-control', diffed against HEAD~1. The differentiated back half audits a plan it did not author or execute.
++
++## Commit subjects in the audited range
++
++9639b445 feat(design-control): wireframe authoring skill + derived-provenance path — Phase 1 complete
++
++
++## Recent audit-log excerpt (prior findings on this feature)
++
++Use this to avoid re-reporting findings that have already been triaged. If a finding was previously dispositioned (`closed`, `won't-fix`, `accepted-trade-off`), don't re-litigate the disposition; only surface a new instance if the underlying shape regressed.
++
++Finding-ID: AUDIT-20260610-66 (round-20 gpt-5-01 MED + gpt-5-02 LOW)
++Status:     fixed-0e5b4b21 (2026-06-10; fieldset/legend allowlisted; required joins the structural-state attrs)
++Severity:   medium
++Surface:    plugins/design-control/src/lint/allowlist.ts
++Direction:  false-positive
++
++## CONVERGENCE RECORD — 2026-06-10 lint adversarial barrage loop (rounds 1–20)
++
++**Stop criterion met:** two consecutive zero-HIGH rounds (19 + 20), per the
++PRD's operator-set criterion. Twenty rounds fired via the committed
++re-runnable process (audit/run-lint-barrage.sh → stackctl audit-barrage).
++
++**Loop totals:**
++- Findings recorded: AUDIT-20260610-01 .. -66 (66 IDs; same-mechanism
++  cross-model/cross-finding folds applied per the TF-002 rule)
++- Dispositions: every finding fixed-<sha>, acknowledged-<ref>, superseded, or
++  informational — zero open, zero parked-without-record
++- Test corpus: 151 → 286 (every genuine defeat is a deterministic fixture;
++  every accepted boundary/residual is a documented BOUNDARY fixture)
++- Two of the loop's own earlier dispositions were REVERSED on later evidence
++  (AUDIT-14 query acceptance → AUDIT-45; AUDIT-03 absent-fonts-clean →
++  AUDIT-23) — the protocol audited its own fixes, not just the original code
++- Declared scope boundaries (in the lint docstring + the adversarial prompt,
++  each pinned by fixtures): (1) punctuation FLOW art mechanically gated;
++  letter-composed imagery and grid-diluted punctuation = referee's gross-class
++  domain; (2) UA default rendering of semantic HTML = the unstyled baseline;
++  (3) imagery composed by geometric placement of sanctioned atoms = referee's
++  domain
++- Fleet note: claude contributed rounds 1(retry)+2 then was 0-byte for 18
++  consecutive runs (deskwork issue 447); from round 3 the loop ran on codex
++  alone, so cross-model agreement was only available in rounds 1–2. The
++  convergence verdict is correspondingly single-family — re-validation with a
++  restored fleet is the natural post-447 follow-up.
++
++**Verification discipline held throughout:** every defeating input was
++executed against the real lint before recording (zero auditor predictions
++trusted); every fix was RED-first with the verbatim defeating input as the
++fixture; two self-caught transcription errors in fix shas were corrected in
++dedicated commits.
++
++
++## Under audit
++
++The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn't).
++
++diff --git a/plugins/design-control/bin/check-wireframe b/plugins/design-control/bin/check-wireframe
++new file mode 100755
++index 00000000..b5919fb3
++--- /dev/null
+++++ b/plugins/design-control/bin/check-wireframe
++@@ -0,0 +1,25 @@
+++#!/bin/sh
+++# check-wireframe <wireframe.html> — run the full pinned check-mockup-lofi lint
+++# against a wireframe file. Exit codes: 0 lint-green, 1 findings/error, 2 usage.
+++# Logic lives in src/authoring/lint-file.ts (tested); this shim only locates the
+++# workspace tsx runner (hoisted node_modules in the monorepo) and dispatches.
+++set -eu
+++
+++PLUGIN_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
+++
+++dir="$PLUGIN_ROOT"
+++TSX=""
+++while [ "$dir" != "/" ]; do
+++  if [ -x "$dir/node_modules/.bin/tsx" ]; then
+++    TSX="$dir/node_modules/.bin/tsx"
+++    break
+++  fi
+++  dir=$(dirname -- "$dir")
+++done
+++
+++if [ -z "$TSX" ]; then
+++  echo "check-wireframe: tsx runner not found in any node_modules/.bin above $PLUGIN_ROOT — run npm install first" >&2
+++  exit 1
+++fi
+++
+++exec "$TSX" "$PLUGIN_ROOT/src/authoring/check-wireframe-cli.ts" "$@"
++diff --git a/plugins/design-control/skills/wireframe/SKILL.md b/plugins/design-control/skills/wireframe/SKILL.md
++new file mode 100644
++index 00000000..47f432b3
++--- /dev/null
+++++ b/plugins/design-control/skills/wireframe/SKILL.md
++@@ -0,0 +1,86 @@
+++---
+++name: wireframe
+++description: Author a deliberately lo-fi wireframe for a named UI surface change — operator-driven, sketch-kit-based, and lint-enforced (zero check-wireframe findings before the draft may be presented). The optional /frontend-design accelerator routes through the same lint.
+++---
+++
+++# /design-control:wireframe `<change>`
+++
+++Author the **lo-fi wireframe** for one named surface change. The wireframe is
+++the UX-*spirit* artifact of the design-control discipline: it works out
+++structure, hierarchy, and flow while being structurally incapable of carrying
+++visual-design detail — so stale polish can never ship as if intended. Visual
+++identity lives in the design-language spec (Phase 2), never here.
+++
+++> Per the plugin thesis (`DESIGN-DISCIPLINE-THESIS.md`): policy is enforced by a
+++> process, not a rule. The lo-fi property is not a convention the author is
+++> trusted to follow — it is mechanically enforced by the `check-mockup-lofi`
+++> lint, which every draft MUST pass before it may be presented.
+++
+++## Arguments
+++
+++- `<change>` (required) — a short operator-meaningful brief of the surface
+++  change (e.g. `regroup the content browser by lane`). If missing, ask for it
+++  (one argument, one prompt).
+++
+++## Procedure
+++
+++1. **Resolve the target surface.** Confirm with the operator which surface the
+++   change addresses (`surface id` — operator-declared granularity, per the spec's
+++   Definitions). One wireframe per change; do not batch surfaces.
+++
+++2. **Set up the wireframe file.** Create `<surface-id>.html` in the operator's
+++   chosen wireframes directory, with the shipped sketch-kit copied alongside it:
+++   - copy `assets/sketch-kit/sketch-kit.css` (and `assets/sketch-kit/fonts/` if a
+++     font-bearing theme is chosen) next to the wireframe;
+++   - exactly ONE `<link rel="stylesheet" href="sketch-kit.css">`;
+++   - `<body class="sk sk-theme-<theme>">` — theme is the operator's pick among
+++     `marker` / `blueprint` / `grayscale` (default `grayscale`);
+++   - the kit's WIREFRAME banner (`.sk-banner`) stays — the artifact self-labels.
+++
+++3. **Author the wireframe — manual path (default, requires NO engine).** The
+++   operator (or the agent under operator direction) writes plain structural HTML
+++   using only the `.sk-*` vocabulary and the lint's allowed structural tags.
+++   Imagery is the fixed `.sk-img` placeholder; icons are text labels, never
+++   emoji; copy uses plain Basic-Latin text. This path never calls the engine
+++   preflight — it works with no engine installed.
+++
+++4. **Optional engine accelerator.** Only if the operator asks for it: gate on
+++   `preflightEngine` (`@/engine-adapter`, method `author-wireframe`) — absence
+++   fails loud naming the remedy — then request a draft via the engine adapter.
+++   **Engine output gets zero trust:** it lands in the same file and is judged by
+++   the same lint as a manual draft (a `lint-rejected` response is the defined
+++   failure mode; fix or discard, never grandfather).
+++
+++5. **Lint gate — the non-negotiable step.** Run:
+++
+++   ```bash
+++   plugins/design-control/bin/check-wireframe <path/to/wireframe.html>
+++   ```
+++
+++   - Exit `0` (lint green, zero findings) → the draft may be presented.
+++   - Exit `1` → fix every finding and re-run. NEVER present a draft with open
+++     findings; NEVER hand-wave a finding as "just lo-fi enough". The lint is the
+++     boundary of the lo-fi guarantee.
+++
+++6. **Record provenance.** This skill authors *driving* wireframes (the artifact
+++   precedes the implementation): record it via `recordDrivingWireframe`
+++   (`@/provenance`) in the wireframe's directory. A wireframe reverse-engineered
+++   from an existing surface is the *derived* path — record it with
+++   `recordDerivation` at derivation time instead, and note that acceptance will
+++   require a non-empty operator edit against the stored snapshot
+++   (`checkDerivedAcceptance`) and the artifact never supports a "wireframe drove
+++   implementation" claim.
+++
+++7. **Present and stop.** Show the operator the lint-green wireframe (path +
+++   `0 findings` output). The operator picks/iterates; translation into the
+++   design language and implementation are separate steps of the loop, not this
+++   skill's job.
+++
+++## What this skill does NOT do
+++
+++- It does not style anything — no CSS authoring, no presentational attributes
+++  (the lint rejects them anyway).
+++- It does not translate to the design language (`translate-design-language`),
+++  implement, or referee.
+++- It does not skip the lint for engine-authored drafts — same gate, same lint,
+++  zero findings.
++diff --git a/plugins/design-control/specs/001-design-control/tasks.md b/plugins/design-control/specs/001-design-control/tasks.md
++index 0d69efb4..a65fd485 100644
++--- a/plugins/design-control/specs/001-design-control/tasks.md
+++++ b/plugins/design-control/specs/001-design-control/tasks.md
++@@ -139,13 +139,22 @@ verbatim in substance** — when they drift, the PRD wins.
++       Romanian comma-below, multiline placeholders, cache-busting/percent-encoded/subdirectory kit
++       hrefs, data tables, placeholder rows, prose pages, disclosure blocks, and the boundary
++       fixtures. Suite: 151 → 286.
++-- [ ] `/design-control:wireframe <change>` authoring skill (operator-driven + lint-enforced; the
+++- [x] `/design-control:wireframe <change>` authoring skill (operator-driven + lint-enforced; the
++       engine `author-wireframe` method is an optional accelerator routed through the same lint).
++-- [ ] Retroactive path: existing surface → `derived` wireframe/spec; **snapshot the auto-derived
+++      **Done — 2026-06-10.** `skills/wireframe/SKILL.md` (manual path needs no engine; the
+++      accelerator gates on `preflightEngine` and its output is judged by the same lint) +
+++      `@/authoring` (`lintWireframeFile` composes the existing pinned pipeline — no parallel lint
+++      path) + `bin/check-wireframe` shim (exit contract 0 green / 1 findings-or-error / 2 usage;
+++      logic tested as `runCheckWireframe`, the shim only dispatches). TDD: 9 tests RED first.
+++- [x] Retroactive path: existing surface → `derived` wireframe/spec; **snapshot the auto-derived
++       draft at derivation time** (stored alongside provenance) so the edit-diff has a baseline;
++       **acceptance of a `derived` artifact requires a recorded operator edit** (non-empty diff
++       between the stored auto-derived snapshot and the accepted version), not just a state
++       transition; does NOT satisfy a "wireframe drove implementation" claim.
+++      **Done — 2026-06-10.** `@/provenance` (`recordDerivation` writes snapshot + zod-validated
+++      sidecar in one move; `checkDerivedAcceptance` rejects a byte-identical acceptance with
+++      `derived-unedited`, fails loud on a tampered baseline via the recorded sha256;
+++      `wireframeDroveImplementation` is true only for `driving` mode). TDD: 9 tests RED first.
++ 
++ **Acceptance:** the engine-adapter **preflight fails loud when `/frontend-design` is absent while
++ manual authoring still works**, and the preflight **precedes the first engine-consuming skill**; the
++diff --git a/plugins/design-control/src/__tests__/authoring/lint-file.test.ts b/plugins/design-control/src/__tests__/authoring/lint-file.test.ts
++new file mode 100644
++index 00000000..891ccae0
++--- /dev/null
+++++ b/plugins/design-control/src/__tests__/authoring/lint-file.test.ts
++@@ -0,0 +1,105 @@
+++import { describe, it, expect, afterEach } from 'vitest';
+++import { mkdtempSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
+++import { tmpdir } from 'node:os';
+++import { join } from 'node:path';
+++import { lintWireframeFile, runCheckWireframe } from '@/authoring/lint-file';
+++import { SKETCH_KIT_CSS_PATH, SKETCH_KIT_SAMPLE_PATH } from '@/wireframe-kit/sketch-kit';
+++
+++const dirs: string[] = [];
+++afterEach(() => {
+++  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
+++});
+++
+++/** Temp wireframe dir seeded with a genuine copy of the shipped kit CSS. */
+++function freshDir(): string {
+++  const dir = mkdtempSync(join(tmpdir(), 'dc-lint-file-'));
+++  dirs.push(dir);
+++  copyFileSync(SKETCH_KIT_CSS_PATH, join(dir, 'sketch-kit.css'));
+++  return dir;
+++}
+++
+++const cleanPage =
+++  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>' +
+++  '<link rel="stylesheet" href="sketch-kit.css"></head>' +
+++  '<body class="sk sk-theme-grayscale"><div class="sk-banner">WIREFRAME</div>' +
+++  '<h1>Entry list</h1></body></html>';
+++
+++describe('lintWireframeFile', () => {
+++  it('passes the shipped example wireframe (pin built against its own dir)', () => {
+++    const result = lintWireframeFile(SKETCH_KIT_SAMPLE_PATH);
+++    expect(result.findings).toEqual([]);
+++    expect(result.ok).toBe(true);
+++  });
+++
+++  it('passes a clean wireframe sitting next to a genuine kit copy', () => {
+++    const dir = freshDir();
+++    const file = join(dir, 'change.html');
+++    writeFileSync(file, cleanPage);
+++    expect(lintWireframeFile(file).ok).toBe(true);
+++  });
+++
+++  it('rejects a wireframe with an inline style (same axis-1 lint, not a parallel path)', () => {
+++    const dir = freshDir();
+++    const file = join(dir, 'change.html');
+++    writeFileSync(file, cleanPage.replace('<h1>', '<h1 style="color:red">'));
+++    const result = lintWireframeFile(file);
+++    expect(result.ok).toBe(false);
+++    expect(result.findings.map((f) => f.rule)).toContain('inline-style');
+++  });
+++
+++  it('rejects a wireframe whose kit copy is not the shipped bytes (identity pin enforced)', () => {
+++    const dir = freshDir();
+++    writeFileSync(join(dir, 'sketch-kit.css'), readFileSync(SKETCH_KIT_CSS_PATH, 'utf8') + '\nh1{color:hotpink}');
+++    const file = join(dir, 'change.html');
+++    writeFileSync(file, cleanPage);
+++    const result = lintWireframeFile(file);
+++    expect(result.ok).toBe(false);
+++    expect(result.findings.map((f) => f.rule)).toContain('stylesheet-hash-mismatch');
+++  });
+++
+++  it('fails loud on a missing file', () => {
+++    expect(() => lintWireframeFile(join(tmpdir(), 'dc-lint-file-does-not-exist.html'))).toThrow(
+++      /no such file|does not exist|ENOENT/i,
+++    );
+++  });
+++});
+++
+++describe('runCheckWireframe (CLI core — exit codes are the bin contract)', () => {
+++  function capture(): { out: string[]; err: string[]; io: { out(line: string): void; err(line: string): void } } {
+++    const out: string[] = [];
+++    const err: string[] = [];
+++    return { out, err, io: { out: (l) => out.push(l), err: (l) => err.push(l) } };
+++  }
+++
+++  it('exits 0 and reports clean on a passing wireframe', () => {
+++    const dir = freshDir();
+++    const file = join(dir, 'change.html');
+++    writeFileSync(file, cleanPage);
+++    const { io, out } = capture();
+++    expect(runCheckWireframe([file], io)).toBe(0);
+++    expect(out.join('\n')).toMatch(/0 findings/);
+++  });
+++
+++  it('exits 1 and prints one line per finding on a failing wireframe', () => {
+++    const dir = freshDir();
+++    const file = join(dir, 'change.html');
+++    writeFileSync(file, cleanPage.replace('<h1>', '<h1 style="color:red">'));
+++    const { io, err } = capture();
+++    expect(runCheckWireframe([file], io)).toBe(1);
+++    expect(err.some((l) => l.includes('inline-style'))).toBe(true);
+++  });
+++
+++  it('exits 1 with a descriptive error on a missing file (no fabricated verdict)', () => {
+++    const { io, err } = capture();
+++    expect(runCheckWireframe([join(tmpdir(), 'dc-nope.html')], io)).toBe(1);
+++    expect(err.join('\n')).toMatch(/no such file|does not exist|ENOENT/i);
+++  });
+++
+++  it('exits 2 on usage error (no argument / extra arguments)', () => {
+++    const a = capture();
+++    expect(runCheckWireframe([], a.io)).toBe(2);
+++    expect(a.err.join('\n')).toMatch(/usage/i);
+++    const b = capture();
+++    expect(runCheckWireframe(['x.html', 'y.html'], b.io)).toBe(2);
+++  });
+++});
++diff --git a/plugins/design-control/src/__tests__/provenance/derived.test.ts b/plugins/design-control/src/__tests__/provenance/derived.test.ts
++new file mode 100644
++index 00000000..97c6fcbb
++--- /dev/null
+++++ b/plugins/design-control/src/__tests__/provenance/derived.test.ts
++@@ -0,0 +1,146 @@
+++import { describe, it, expect, afterEach } from 'vitest';
+++import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
+++import { tmpdir } from 'node:os';
+++import { join } from 'node:path';
+++import {
+++  recordDerivation,
+++  loadProvenance,
+++  checkDerivedAcceptance,
+++  wireframeDroveImplementation,
+++  recordDrivingWireframe,
+++} from '@/provenance/derived';
+++
+++const dirs: string[] = [];
+++afterEach(() => {
+++  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
+++});
+++
+++function freshDir(): string {
+++  const dir = mkdtempSync(join(tmpdir(), 'dc-prov-'));
+++  dirs.push(dir);
+++  return dir;
+++}
+++
+++const draftHtml =
+++  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>' +
+++  '<link rel="stylesheet" href="sketch-kit.css"></head>' +
+++  '<body class="sk sk-theme-grayscale"><h1>Derived from live surface</h1></body></html>';
+++
+++describe('recordDerivation', () => {
+++  it('writes the auto-derived snapshot AND the provenance sidecar at derivation time', () => {
+++    const dir = freshDir();
+++    const prov = recordDerivation({
+++      dir,
+++      surfaceId: 'studio-content-browser',
+++      derivedHtml: draftHtml,
+++      source: 'http://localhost:4321/dev/editorial-studio',
+++      derivedAt: new Date('2026-06-10T12:00:00Z'),
+++    });
+++    expect(prov.mode).toBe('derived');
+++    const names = readdirSync(dir);
+++    expect(names).toContain('studio-content-browser.derived-snapshot.html');
+++    expect(names).toContain('studio-content-browser.provenance.json');
+++    expect(readFileSync(join(dir, 'studio-content-browser.derived-snapshot.html'), 'utf8')).toBe(draftHtml);
+++  });
+++
+++  it('round-trips through loadProvenance (zod-validated)', () => {
+++    const dir = freshDir();
+++    recordDerivation({
+++      dir,
+++      surfaceId: 'scrapbook-drawer',
+++      derivedHtml: draftHtml,
+++      source: 'route /dev/scrapbook',
+++      derivedAt: new Date('2026-06-10T12:00:00Z'),
+++    });
+++    const prov = loadProvenance(dir, 'scrapbook-drawer');
+++    expect(prov.surfaceId).toBe('scrapbook-drawer');
+++    expect(prov.mode).toBe('derived');
+++    if (prov.mode !== 'derived') throw new Error('unreachable');
+++    expect(prov.derived.source).toBe('route /dev/scrapbook');
+++    expect(prov.derived.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
+++  });
+++});
+++
+++describe('loadProvenance fail-loud paths', () => {
+++  it('throws a descriptive error when the sidecar is missing', () => {
+++    expect(() => loadProvenance(freshDir(), 'nope')).toThrow(/provenance/i);
+++  });
+++
+++  it('throws on a malformed sidecar (no silent fallback)', () => {
+++    const dir = freshDir();
+++    writeFileSync(join(dir, 'bad.provenance.json'), '{"mode":"derived"}');
+++    expect(() => loadProvenance(dir, 'bad')).toThrow();
+++  });
+++});
+++
+++describe('checkDerivedAcceptance — acceptance requires a recorded operator edit', () => {
+++  it('rejects a byte-identical accepted artifact (state transition alone is not an edit)', () => {
+++    const dir = freshDir();
+++    recordDerivation({
+++      dir,
+++      surfaceId: 's1',
+++      derivedHtml: draftHtml,
+++      source: 'live surface',
+++      derivedAt: new Date('2026-06-10T12:00:00Z'),
+++    });
+++    const result = checkDerivedAcceptance(dir, 's1', draftHtml);
+++    expect(result.ok).toBe(false);
+++    expect(result.findings.map((f) => f.rule)).toContain('derived-unedited');
+++  });
+++
+++  it('accepts once the operator edit produces a non-empty diff against the stored snapshot', () => {
+++    const dir = freshDir();
+++    recordDerivation({
+++      dir,
+++      surfaceId: 's1',
+++      derivedHtml: draftHtml,
+++      source: 'live surface',
+++      derivedAt: new Date('2026-06-10T12:00:00Z'),
+++    });
+++    const edited = draftHtml.replace('Derived from live surface', 'Entry list, regrouped by lane');
+++    expect(checkDerivedAcceptance(dir, 's1', edited).ok).toBe(true);
+++  });
+++
+++  it('fails loud when the stored snapshot was tampered after recording (hash mismatch)', () => {
+++    const dir = freshDir();
+++    recordDerivation({
+++      dir,
+++      surfaceId: 's1',
+++      derivedHtml: draftHtml,
+++      source: 'live surface',
+++      derivedAt: new Date('2026-06-10T12:00:00Z'),
+++    });
+++    writeFileSync(join(dir, 's1.derived-snapshot.html'), draftHtml + '<!-- tampered -->');
+++    expect(() => checkDerivedAcceptance(dir, 's1', 'whatever')).toThrow(/snapshot|hash/i);
+++  });
+++
+++  it('does not gate a driving wireframe (the derived gate is mode-scoped)', () => {
+++    const dir = freshDir();
+++    recordDrivingWireframe({
+++      dir,
+++      surfaceId: 'fresh',
+++      derivedAt: new Date('2026-06-10T12:00:00Z'),
+++    });
+++    expect(checkDerivedAcceptance(dir, 'fresh', draftHtml).ok).toBe(true);
+++  });
+++});
+++
+++describe('wireframeDroveImplementation', () => {
+++  it('is true for a driving wireframe and FALSE for a derived one (even an accepted one)', () => {
+++    const dir = freshDir();
+++    const derived = recordDerivation({
+++      dir,
+++      surfaceId: 'd',
+++      derivedHtml: draftHtml,
+++      source: 'live surface',
+++      derivedAt: new Date('2026-06-10T12:00:00Z'),
+++    });
+++    const driving = recordDrivingWireframe({
+++      dir,
+++      surfaceId: 'w',
+++      derivedAt: new Date('2026-06-10T12:00:00Z'),
+++    });
+++    expect(wireframeDroveImplementation(derived)).toBe(false);
+++    expect(wireframeDroveImplementation(driving)).toBe(true);
+++  });
+++});
++diff --git a/plugins/design-control/src/authoring/check-wireframe-cli.ts b/plugins/design-control/src/authoring/check-wireframe-cli.ts
++new file mode 100644
++index 00000000..3838653a
++--- /dev/null
+++++ b/plugins/design-control/src/authoring/check-wireframe-cli.ts
++@@ -0,0 +1,12 @@
+++/**
+++ * Process entry for `bin/check-wireframe`. All behavior lives in
+++ * {@link runCheckWireframe} (tested directly); this file only wires argv and
+++ * the process exit code.
+++ */
+++
+++import { runCheckWireframe } from '@/authoring/lint-file';
+++
+++process.exitCode = runCheckWireframe(process.argv.slice(2), {
+++  out: (line) => console.log(line),
+++  err: (line) => console.error(line),
+++});
++diff --git a/plugins/design-control/src/authoring/index.ts b/plugins/design-control/src/authoring/index.ts
++new file mode 100644
++index 00000000..c6773979
++--- /dev/null
+++++ b/plugins/design-control/src/authoring/index.ts
++@@ -0,0 +1,5 @@
+++/**
+++ * Public surface of the wireframe-authoring path. Import via `@/authoring`.
+++ */
+++
+++export { type CliIo, lintWireframeFile, runCheckWireframe } from '@/authoring/lint-file';
++diff --git a/plugins/design-control/src/authoring/lint-file.ts b/plugins/design-control/src/authoring/lint-file.ts
++new file mode 100644
++index 00000000..310dc89c
++--- /dev/null
+++++ b/plugins/design-control/src/authoring/lint-file.ts
++@@ -0,0 +1,68 @@
+++/**
+++ * File-level entry to the `check-mockup-lofi` lint — the enforcement seam the
+++ * `/design-control:wireframe` authoring skill (and the `bin/check-wireframe`
+++ * shim) route EVERY wireframe draft through, manual or engine-authored alike.
+++ *
+++ * This is deliberately a thin composition of the existing axes — axis 1
+++ * (element/attribute allowlist) + axis 1.5 (stylesheet identity pin) + the
+++ * codepoint allowlist — via `lintWireframe`. No parallel lint path: the skill
+++ * and the library agree by construction because they call the same pipeline.
+++ */
+++
+++import { readFileSync } from 'node:fs';
+++import { dirname, resolve } from 'node:path';
+++import { lintWireframe } from '@/lint/check-mockup-lofi';
+++import { buildSketchKitPin } from '@/lint/stylesheet-pin';
+++import type { LintResult } from '@/lint/types';
+++
+++/**
+++ * Lint a wireframe FILE: read it, build the sketch-kit identity pin against the
+++ * file's own directory (the conventional layout — the kit copy sits next to the
+++ * wireframe), and run the full pinned lint. Fails loud on an unreadable file —
+++ * a missing wireframe is an error, never a clean verdict.
+++ */
+++export function lintWireframeFile(filePath: string): LintResult {
+++  const absolute = resolve(filePath);
+++  const html = readFileSync(absolute, 'utf8');
+++  return lintWireframe(html, { stylesheetPin: buildSketchKitPin(dirname(absolute)) });
+++}
+++
+++/** Line-oriented output sink, injected so the CLI core is testable as a function. */
+++export interface CliIo {
+++  out(line: string): void;
+++  err(line: string): void;
+++}
+++
+++const USAGE = 'usage: check-wireframe <wireframe.html>';
+++
+++/**
+++ * CLI core behind `bin/check-wireframe`. Exit-code contract (the skill's gate):
+++ *   0 — lint green (zero findings)
+++ *   1 — findings present, or the file could not be read (descriptive error;
+++ *       never a fabricated verdict)
+++ *   2 — usage error
+++ */
+++export function runCheckWireframe(argv: readonly string[], io: CliIo): number {
+++  if (argv.length !== 1) {
+++    io.err(USAGE);
+++    return 2;
+++  }
+++  const filePath = argv[0];
+++  let result: LintResult;
+++  try {
+++    result = lintWireframeFile(filePath);
+++  } catch (error) {
+++    io.err(error instanceof Error ? error.message : String(error));
+++    return 1;
+++  }
+++  if (result.ok) {
+++    io.out(`${filePath}: lint green — 0 findings`);
+++    return 0;
+++  }
+++  for (const finding of result.findings) {
+++    const where = [finding.tag, finding.attr].filter(Boolean).join(' ');
+++    io.err(`${finding.rule}${where ? ` (${where})` : ''}: ${finding.message}`);
+++  }
+++  io.err(`${filePath}: ${result.findings.length} finding(s)`);
+++  return 1;
+++}
++diff --git a/plugins/design-control/src/provenance/derived.ts b/plugins/design-control/src/provenance/derived.ts
++new file mode 100644
++index 00000000..6e5c2987
++--- /dev/null
+++++ b/plugins/design-control/src/provenance/derived.ts
++@@ -0,0 +1,185 @@
+++/**
+++ * Wireframe provenance — the retroactive (`derived`) path.
+++ *
+++ * A wireframe is either DRIVING (authored before the implementation; the
+++ * artifact that drove the change) or DERIVED (reverse-engineered from an
+++ * already-existing surface). The derived path exists so a legacy surface can be
+++ * brought under the discipline, but with two hard properties from the spec:
+++ *
+++ *  1. The auto-derived draft is SNAPSHOTTED at derivation time, alongside its
+++ *     provenance, so acceptance has a baseline to diff against.
+++ *  2. Accepting a `derived` artifact REQUIRES a recorded operator edit — a
+++ *     non-empty byte diff between the stored snapshot and the accepted version.
+++ *     A bare state transition is not an edit.
+++ *
+++ * And a `derived` artifact NEVER satisfies a "wireframe drove implementation"
+++ * claim ({@link wireframeDroveImplementation}) — provenance distinguishes the
+++ * two modes precisely so the claim cannot be laundered through acceptance.
+++ *
+++ * Sidecar layout (per surface, in the operator-chosen provenance dir):
+++ *   <surfaceId>.provenance.json          — zod-validated provenance record
+++ *   <surfaceId>.derived-snapshot.html    — the auto-derived draft (derived only)
+++ */
+++
+++import { existsSync, readFileSync, writeFileSync } from 'node:fs';
+++import { join } from 'node:path';
+++import { createHash } from 'node:crypto';
+++import { z } from 'zod';
+++
+++const PROVENANCE_VERSION = 1;
+++
+++const sha256Hex = (content: string): string => createHash('sha256').update(content).digest('hex');
+++
+++const drivingSchema = z.object({
+++  version: z.literal(PROVENANCE_VERSION),
+++  surfaceId: z.string().min(1),
+++  mode: z.literal('driving'),
+++  createdAt: z.string().datetime(),
+++});
+++
+++const derivedSchema = z.object({
+++  version: z.literal(PROVENANCE_VERSION),
+++  surfaceId: z.string().min(1),
+++  mode: z.literal('derived'),
+++  createdAt: z.string().datetime(),
+++  derived: z.object({
+++    /** Filename (dir-relative) of the snapshot stored at derivation time. */
+++    snapshotFile: z.string().min(1),
+++    /** sha256 (hex) of the snapshot bytes as recorded — tamper evidence. */
+++    snapshotSha256: z.string().regex(/^[0-9a-f]{64}$/),
+++    /** What the draft was derived FROM (route, URL, file — operator-meaningful). */
+++    source: z.string().min(1),
+++  }),
+++});
+++
+++const provenanceSchema = z.discriminatedUnion('mode', [drivingSchema, derivedSchema]);
+++
+++export type WireframeProvenance = z.infer<typeof provenanceSchema>;
+++
+++export interface ProvenanceFinding {
+++  readonly rule: 'derived-unedited';
+++  readonly message: string;
+++}
+++
+++export interface AcceptanceResult {
+++  readonly ok: boolean;
+++  readonly findings: readonly ProvenanceFinding[];
+++}
+++
+++const sidecarPath = (dir: string, surfaceId: string): string =>
+++  join(dir, `${surfaceId}.provenance.json`);
+++
+++function writeProvenance(dir: string, provenance: WireframeProvenance): void {
+++  writeFileSync(
+++    sidecarPath(dir, provenance.surfaceId),
+++    JSON.stringify(provenance, null, 2) + '\n',
+++  );
+++}
+++
+++/** Record a DRIVING wireframe's provenance (the authored-first path). */
+++export function recordDrivingWireframe(input: {
+++  dir: string;
+++  surfaceId: string;
+++  derivedAt?: Date;
+++}): WireframeProvenance {
+++  const provenance: WireframeProvenance = {
+++    version: PROVENANCE_VERSION,
+++    surfaceId: input.surfaceId,
+++    mode: 'driving',
+++    createdAt: (input.derivedAt ?? new Date()).toISOString(),
+++  };
+++  writeProvenance(input.dir, provenance);
+++  return provenance;
+++}
+++
+++/**
+++ * Record a DERIVED draft at derivation time: store the auto-derived snapshot
+++ * AND the provenance sidecar in one move, so the acceptance diff always has its
+++ * baseline. The snapshot hash is recorded for tamper evidence.
+++ */
+++export function recordDerivation(input: {
+++  dir: string;
+++  surfaceId: string;
+++  derivedHtml: string;
+++  source: string;
+++  derivedAt?: Date;
+++}): WireframeProvenance {
+++  const snapshotFile = `${input.surfaceId}.derived-snapshot.html`;
+++  writeFileSync(join(input.dir, snapshotFile), input.derivedHtml);
+++  const provenance: WireframeProvenance = {
+++    version: PROVENANCE_VERSION,
+++    surfaceId: input.surfaceId,
+++    mode: 'derived',
+++    createdAt: (input.derivedAt ?? new Date()).toISOString(),
+++    derived: {
+++      snapshotFile,
+++      snapshotSha256: sha256Hex(input.derivedHtml),
+++      source: input.source,
+++    },
+++  };
+++  writeProvenance(input.dir, provenance);
+++  return provenance;
+++}
+++
+++/** Load + zod-validate a surface's provenance sidecar. Fails loud when absent/malformed. */
+++export function loadProvenance(dir: string, surfaceId: string): WireframeProvenance {
+++  const path = sidecarPath(dir, surfaceId);
+++  if (!existsSync(path)) {
+++    throw new Error(
+++      `No provenance sidecar for surface "${surfaceId}" at ${path}. ` +
+++        `Record provenance at authoring/derivation time (recordDrivingWireframe / recordDerivation).`,
+++    );
+++  }
+++  return provenanceSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
+++}
+++
+++/**
+++ * The acceptance gate for `derived` artifacts: the accepted version must carry
+++ * a recorded operator edit — a non-empty byte diff against the snapshot stored
+++ * at derivation time. Driving wireframes pass through (the gate is mode-scoped).
+++ * Fails loud if the stored snapshot no longer matches its recorded hash — a
+++ * tampered baseline cannot certify an edit.
+++ */
+++export function checkDerivedAcceptance(
+++  dir: string,
+++  surfaceId: string,
+++  acceptedHtml: string,
+++): AcceptanceResult {
+++  const provenance = loadProvenance(dir, surfaceId);
+++  if (provenance.mode !== 'derived') {
+++    return { ok: true, findings: [] };
+++  }
+++  const snapshotPath = join(dir, provenance.derived.snapshotFile);
+++  const snapshot = readFileSync(snapshotPath, 'utf8');
+++  if (sha256Hex(snapshot) !== provenance.derived.snapshotSha256) {
+++    throw new Error(
+++      `Derived snapshot ${snapshotPath} does not match the hash recorded at derivation time — ` +
+++        `the baseline was modified after recording, so the operator-edit diff cannot be trusted. ` +
+++        `Re-derive the draft to re-establish a baseline.`,
+++    );
+++  }
+++  if (acceptedHtml === snapshot) {
+++    return {
+++      ok: false,
+++      findings: [
+++        {
+++          rule: 'derived-unedited',
+++          message:
+++            `Surface "${surfaceId}": the accepted artifact is byte-identical to the auto-derived ` +
+++            `snapshot. Accepting a derived wireframe requires a recorded operator edit ` +
+++            `(non-empty diff against the derivation-time snapshot), not just a state transition.`,
+++        },
+++      ],
+++    };
+++  }
+++  return { ok: true, findings: [] };
+++}
+++
+++/**
+++ * Whether this wireframe supports a "wireframe drove implementation" claim.
+++ * Only a DRIVING wireframe does; a `derived` one never does, edited or not —
+++ * it was reverse-engineered from the surface it would be claiming to have driven.
+++ */
+++export function wireframeDroveImplementation(provenance: WireframeProvenance): boolean {
+++  return provenance.mode === 'driving';
+++}
++diff --git a/plugins/design-control/src/provenance/index.ts b/plugins/design-control/src/provenance/index.ts
++new file mode 100644
++index 00000000..3106074f
++--- /dev/null
+++++ b/plugins/design-control/src/provenance/index.ts
++@@ -0,0 +1,14 @@
+++/**
+++ * Public surface of the wireframe-provenance module. Import via `@/provenance`.
+++ */
+++
+++export {
+++  type WireframeProvenance,
+++  type ProvenanceFinding,
+++  type AcceptanceResult,
+++  recordDrivingWireframe,
+++  recordDerivation,
+++  loadProvenance,
+++  checkDerivedAcceptance,
+++  wireframeDroveImplementation,
+++} from '@/provenance/derived';
++
++
++## What to look for
++
++- **Correctness bugs** — logic errors, off-by-one, null/undefined paths, race conditions, missing error handling, swallowed exceptions.
++- **Design issues** — coupling between layers that should be independent, leaking abstractions, primitives that should compose but don't, configuration that should be data ending up as code.
++- **Missed edge cases** — what happens with empty input? Maximum input? Concurrent calls? Partial failure? Network unavailability? Operator interrupt mid-operation? What is the behavior on a fresh install vs. an upgrade?
++- **Code-quality concerns** — files growing past a reasonable cap, names that don't reveal intent, dead code, duplicated logic, magic numbers without explanation, tests that don't test the contract they claim to test.
++- **Cross-cutting impact** — does this diff touch a surface that other surfaces depend on? Are those other surfaces updated? Are migrations needed? Are doctor rules / schemas / validators updated to match the new shape?
++- **Documentation drift** — does the README / SKILL.md / PRD describe the behavior the code actually implements? If the spec changed, did the implementation? If the implementation changed, did the spec?
++- **Operator-discipline traps** — placeholder comments, swallowed errors, hardcoded paths/values that should be configurable, fallbacks that hide failure modes, mock data outside test code. These are bug-factories per project guidelines.
++
++## Output format
++
++For each finding you surface, emit ONE markdown block in this exact shape:
++
++```
++### <heading: one-line summary of the finding>
++
++Finding-ID: AUDIT-BARRAGE-<your-model-name>-<NN>
++Status:     open
++Severity:   <blocking | high | medium | low | informational>
++Surface:    <repo-relative-path:line-range> OR <description of the surface if not anchored to a single file>
++
++<one-to-three paragraphs of body: what the finding is, why it matters, what evidence you relied on, what a reasonable fix would look like. Be specific. Cite line numbers from the diff. If the finding is structural / cross-file, name every file affected.>
++```
++
++Number the findings sequentially (`-01`, `-02`, ...).
++
++**Severity — rate each finding by downstream blast-radius:** the consequence if a downstream consumer acts on the audited surface *as written*. The consumer may be an adopter running the code, or — especially for a spec — an AI agent building **unattended** from it, with no human to catch a wrong reading. Rate by what would actually happen if this shipped as-is, **not by how alarming the finding feels**. State the blast-radius reasoning in the finding body for every finding, at every level.
++
++- `blocking` — acting on it as-written breaks the feature's stated goals in obvious ways; OR (for a spec) the more natural reading an agent reaches first is the wrong one, so it will likely be built wrong by default and nothing in the artifact corrects it.
++- `high` — a correctness/safety defect a consumer will hit; OR a spec contradiction/ambiguity where the readings are roughly equally plausible and the artifact doesn't disambiguate — an agent might build either, including the wrong one.
++- `medium` — a design issue that compounds over time; OR a spec inconsistency a reasonable consumer would resolve correctly anyway (readings barely diverge, or context makes the intended one obvious).
++- `low` — hygiene; cosmetic wording with no behavioral or implementation consequence.
++- `informational` — context worth seeing, not itself a defect.
++
++**Calibrate by consequence, not by alarm.** A genuine contradiction a reader would obviously resolve the right way is at most `medium`. A quietly-plausible wrong reading an agent would actually build is `high`/`blocking` even if it looks minor. A spec's internal consistency is load-bearing — it is the input to an unattended build.
++
++## If you find nothing — say so explicitly
++
++If you walk the diff carefully and find no findings worth surfacing, emit ONE block in this shape instead:
++
++```
++### No findings
++
++Finding-ID: AUDIT-BARRAGE-<your-model-name>-CLEAN
++Status:     open
++Severity:   informational
++Surface:    (the entire diff)
++
++I walked the diff for the feature named above and found no findings worth surfacing. My specific reasoning: <three-to-five sentences explaining what you checked, why those checks came back clean, and what you would have flagged if it had been present.>
++```
++
++**Do not pad with weak findings.** A confident "I checked X, Y, Z and they are clean for these reasons" is more useful to the operator than three vague low-severity notes. The cross-model diversity gives the operator independent signal; an empty clean report from your CLI is itself a signal when paired with findings from your siblings.
++
++## Hard constraints
++
++- **No deferral phrases.** Don't write phrases like "fix later", "address in a follow-up", or other commitments to deferred work. The dispatch-wrapper rejects these as bug-factories. If you spot a deferral phrase IN the diff, surface it as a finding.
++- **Anchor findings to evidence.** A finding that says "this might be a problem" without naming the specific file + line is not actionable. Name the surface, quote the relevant code, explain what's wrong.
++- **One issue per finding block.** Don't bundle multiple concerns into one entry; the operator triages each block as a discrete signal.
++- **Provenance is your model name.** Replace `<your-model-name>` in the Finding-ID with the CLI you are (`claude`, `codex`, `gemini`, etc.). This is how the operator joins findings across models.
+diff --git a/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/claude.md b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/claude.md
+new file mode 100644
+index 00000000..3bc3cefb
+--- /dev/null
++++ b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/claude.md
+@@ -0,0 +1,65 @@
++### Provenance mode can be silently rewritten — a later `recordDrivingWireframe` call overwrites a `derived` record and launders the exact claim the module exists to prevent
++
++Finding-ID: AUDIT-BARRAGE-claude-01
++Status:     open
++Severity:   medium
++Surface:    plugins/design-control/src/provenance/derived.ts:84-98 (recordDrivingWireframe), 100-127 (recordDerivation), 70-75 (writeProvenance)
++
++`writeProvenance` unconditionally `writeFileSync`s `<surfaceId>.provenance.json`. Nothing in `recordDrivingWireframe` or `recordDerivation` checks whether a sidecar already exists, so a surface recorded as `derived` (with its snapshot + hash baseline) can be flipped to `driving` with a single later call — after which `wireframeDroveImplementation` returns `true` and `checkDerivedAcceptance` passes unconditionally (lines 144-146 short-circuit on non-derived mode). The module's own header (lines 15-17) states the design goal: *"provenance distinguishes the two modes precisely so the claim cannot be laundered through acceptance."* The overwrite path is a one-call laundering vector that bypasses acceptance entirely. The derivation-time snapshot is also silently orphaned (the `.derived-snapshot.html` stays on disk but nothing references it), erasing the audit trail.
++
++Blast radius: this is a library invoked under skill direction, so it requires a wrong call rather than happening by default — but the population this discipline explicitly defends against is an unattended agent looking for the path of least resistance past a failing `derived-unedited` gate, and the cheapest such path is exactly this call. It doesn't break the feature when used correctly, hence medium rather than high. A reasonable fix: `writeProvenance` (or both record functions) fails loud when a sidecar already exists for the surface, with mode transitions requiring an explicit, separately-named operation (or at minimum refusing the `derived → driving` direction outright, since that transition is semantically never legitimate).
++
++### `surfaceId` is interpolated into filesystem paths with no filename validation — `..` escapes the provenance dir, `/` breaks round-tripping
++
++Finding-ID: AUDIT-BARRAGE-claude-02
++Status:     open
++Severity:   medium
++Surface:    plugins/design-control/src/provenance/derived.ts:66-67 (sidecarPath), 108 (snapshotFile), 31, 44 (zod schemas)
++
++The zod schemas constrain `surfaceId` only to `z.string().min(1)`, but the id is used directly to build paths: `join(dir, `${surfaceId}.provenance.json`)` and `${surfaceId}.derived-snapshot.html`. A `surfaceId` of `../something` writes the sidecar and snapshot *outside* the operator-chosen provenance directory; an id containing `/` (e.g. `studio/content-browser` — an entirely plausible operator-meaningful id, given the codebase's route-style naming like `/dev/editorial-studio` which appears in this very diff's tests as a `source` value) either ENOENTs on write or silently lands in an unintended subdirectory. `loadProvenance` joins identically, so the misplacement round-trips invisibly rather than failing loud.
++
++Blast radius: the id is operator/agent-supplied prose, not attacker input, so the realistic failure is accidental misplacement and confusing ENOENTs rather than exploitation — a design defect that compounds as more surfaces are recorded, hence medium. Fix: validate `surfaceId` against a portable-filename pattern (e.g. `/^[a-z0-9][a-z0-9._-]*$/i`) in the zod schema and at record time, failing loud with a message naming the constraint — consistent with the project's no-fallbacks rule.
++
++### The derived-acceptance gate and provenance recording have no executable firing surface — the skill directs the agent to call raw TypeScript functions
++
++Finding-ID: AUDIT-BARRAGE-claude-03
++Status:     open
++Severity:   medium
++Surface:    plugins/design-control/skills/wireframe/SKILL.md:64-72 (step 6); plugins/design-control/src/provenance/derived.ts (whole module); plugins/design-control/bin/ (missing sibling to check-wireframe)
++
++The lint gate got a proper seam: `bin/check-wireframe` → `check-wireframe-cli.ts` → tested `runCheckWireframe`, and SKILL.md step 5 quotes the exact command. The provenance path got none. SKILL.md step 6 instructs: *"record it via `recordDrivingWireframe` (`@/provenance`)"* — but an agent executing the skill has no documented way to invoke a TypeScript export. In practice it will improvise a `tsx -e` one-liner per invocation, which is precisely the "ad-hoc shell instead of proper scripts under `bin/`" anti-pattern the repo's plugin conventions forbid — or it will quietly skip the step, since unlike the lint there is no exit-code gate to fail. The same applies to `checkDerivedAcceptance`: it is a "non-negotiable" acceptance gate per the spec, yet nothing in the diff (no bin verb, no skill step, no caller anywhere) ever fires it. The plugin's own thesis, quoted in this SKILL.md (lines 13-16), is that *"policy is enforced by a process, not a rule"* — the lo-fi property got the process; the provenance property got a rule.
++
++Blast radius: provenance recording will be inconsistent or absent across real wireframes, and the derived gate exists only as a tested library function nobody calls — the discipline degrades silently rather than breaking loudly, which is the compounding-design-issue shape, hence medium. Fix: a `bin/record-provenance` (or `bin/wireframe-provenance` with `record-driving | record-derived | check-acceptance` subcommands) mirroring the `check-wireframe` shim pattern, with SKILL.md steps quoting the commands the way step 5 does.
++
++### A `driving` provenance record carries no binding to the artifact it certifies — no filename, no hash
++
++Finding-ID: AUDIT-BARRAGE-claude-04
++Status:     open
++Severity:   medium
++Surface:    plugins/design-control/src/provenance/derived.ts:31-36 (drivingSchema) vs 38-53 (derivedSchema)
++
++The `derived` record stores `snapshotFile`, `snapshotSha256`, and `source` — enough to identify and tamper-check its baseline. The `driving` record stores only `surfaceId`, `mode`, and `createdAt`. `wireframeDroveImplementation` therefore certifies a claim ("this wireframe drove the implementation") about an artifact the record cannot identify: the wireframe HTML next to the sidecar can be wholly replaced after recording and the claim still holds, with no tamper evidence of the kind the derived path deliberately built (lines 148-154). The asymmetry is visible side-by-side in the two schemas.
++
++Blast radius: a downstream consumer (the future referee, or any "did a wireframe drive this change?" check) gets a `true` that is unfalsifiable against the on-disk artifact. Nothing breaks today, but every claim recorded under this schema is permanently unverifiable, and a later schema fix can't retro-bind old records — the cost compounds with adoption, hence medium. Fix: record the wireframe's filename and sha256 at `recordDrivingWireframe` time (the wireframe file already exists at that point per SKILL.md step ordering — lint at step 5 precedes provenance at step 6), and have `wireframeDroveImplementation` (or a sibling verifier) check the hash the way `checkDerivedAcceptance` checks the snapshot.
++
++### `recordDrivingWireframe` takes a parameter named `derivedAt` for a wireframe that is by definition not derived
++
++Finding-ID: AUDIT-BARRAGE-claude-05
++Status:     open
++Severity:   low
++Surface:    plugins/design-control/src/provenance/derived.ts:85-88; src/__tests__/provenance/derived.test.ts:118-122
++
++The driving-path recorder's optional timestamp input is named `derivedAt` (`input: { dir; surfaceId; derivedAt?: Date }`), feeding the sidecar field `createdAt`. The name contradicts the mode it records — "derived" is the *other* mode, and the module spends its entire header explaining why the two must never be confused. The tests dutifully pass `derivedAt` when recording a driving wireframe (derived.test.ts lines 118-122), which reads as a category error at every call site.
++
++Blast radius: no behavioral consequence — the value lands in `createdAt` correctly — but this is an exported public API (`@/provenance`), so the misleading name propagates to every future caller and to the eventual `bin/` verb's flag naming. Hence low. Fix: rename to `createdAt?` (or `at?`) in both record functions for symmetry, while the call-site count is still two test files.
++
++### `loadProvenance` does not verify the sidecar's inner `surfaceId` matches the requested one
++
++Finding-ID: AUDIT-BARRAGE-claude-06
++Status:     open
++Severity:   low
++Surface:    plugins/design-control/src/provenance/derived.ts:129-139
++
++`loadProvenance(dir, surfaceId)` resolves the file by name and zod-validates its shape, but never asserts `parsed.surfaceId === surfaceId`. A sidecar copied or renamed to another surface's filename (an easy mistake when seeding a second surface from a first) loads cleanly and flows into `checkDerivedAcceptance`, whose finding message then reports the *argument's* surface id (line 158) while gating against the *other* surface's snapshot and hash — a confusing mixed-identity verdict instead of a loud failure.
++
++Blast radius: requires a file-management mistake to trigger, and the resulting behavior is confusing rather than silently wrong in a damaging direction (the hash check still fires against whatever snapshot the record names). Hence low. Fix: one equality check after parse, throwing with both ids in the message.
+diff --git a/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/codex.md b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/codex.md
+new file mode 100644
+index 00000000..d218939a
+--- /dev/null
++++ b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/codex.md
+@@ -0,0 +1,10 @@
++### `recordDerivation` can leave an orphaned snapshot if sidecar write fails
++
++Finding-ID: AUDIT-BARRAGE-codex-01  
++Status:     open  
++Severity:   medium  
++Surface:    `plugins/design-control/src/provenance/derived.ts:102-118`
++
++`recordDerivation` writes `<surfaceId>.derived-snapshot.html` first, then writes `<surfaceId>.provenance.json`. If the process is interrupted, the disk fills, permissions change, or JSON sidecar write otherwise fails after line 104, the directory is left with a snapshot but no valid provenance record. The workplan says `recordDerivation` “writes snapshot + zod-validated sidecar in one move”; this implementation is sequential non-atomic writes.
++
++The blast radius is medium: normal consumers will usually succeed, but the failure mode creates ambiguous provenance state in the operator’s artifact directory. A later unattended agent or operator may see the snapshot and assume derivation was recorded, while `loadProvenance` fails loud because the sidecar is absent. A reasonable fix is to write both artifacts via temporary files and atomic renames, with cleanup on failure, or to write the sidecar first with a temporary snapshot reference and only promote both names once both writes have succeeded.
+diff --git a/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/gemini.md b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/gemini.md
+new file mode 100644
+index 00000000..e69de29b
+diff --git a/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/claude.txt b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/claude.txt
+new file mode 100644
+index 00000000..e69de29b
+diff --git a/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/codex.txt b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/codex.txt
+new file mode 100644
+index 00000000..3e276314
+--- /dev/null
++++ b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/codex.txt
+@@ -0,0 +1,886 @@
++Reading prompt from stdin...
++OpenAI Codex v0.136.0
++--------
++workdir: /Users/orion/work/deskwork-work/design-control
++model: gpt-5.5
++provider: openai
++approval: never
++sandbox: workspace-write [workdir, /tmp, $TMPDIR]
++reasoning effort: medium
++reasoning summaries: none
++session id: 019eb540-cb80-7192-abf9-aa0d161422fa
++--------
++user
++# Audit-barrage — multi-model audit prompt template
++
++You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface the kinds of defects listed under **What to look for** below, in the work product captured under **Under audit**.
++
++You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.
++
++## Feature under audit
++
++design-control
++
++## Feature scope (workplan / PRD summary)
++
++Governance pass over the just-implemented work for feature 'design-control', diffed against HEAD~1. The differentiated back half audits a plan it did not author or execute.
++
++## Commit subjects in the audited range
++
++9639b445 feat(design-control): wireframe authoring skill + derived-provenance path — Phase 1 complete
++
++
++## Recent audit-log excerpt (prior findings on this feature)
++
++Use this to avoid re-reporting findings that have already been triaged. If a finding was previously dispositioned (`closed`, `won't-fix`, `accepted-trade-off`), don't re-litigate the disposition; only surface a new instance if the underlying shape regressed.
++
++Finding-ID: AUDIT-20260610-66 (round-20 gpt-5-01 MED + gpt-5-02 LOW)
++Status:     fixed-0e5b4b21 (2026-06-10; fieldset/legend allowlisted; required joins the structural-state attrs)
++Severity:   medium
++Surface:    plugins/design-control/src/lint/allowlist.ts
++Direction:  false-positive
++
++## CONVERGENCE RECORD — 2026-06-10 lint adversarial barrage loop (rounds 1–20)
++
++**Stop criterion met:** two consecutive zero-HIGH rounds (19 + 20), per the
++PRD's operator-set criterion. Twenty rounds fired via the committed
++re-runnable process (audit/run-lint-barrage.sh → stackctl audit-barrage).
++
++**Loop totals:**
++- Findings recorded: AUDIT-20260610-01 .. -66 (66 IDs; same-mechanism
++  cross-model/cross-finding folds applied per the TF-002 rule)
++- Dispositions: every finding fixed-<sha>, acknowledged-<ref>, superseded, or
++  informational — zero open, zero parked-without-record
++- Test corpus: 151 → 286 (every genuine defeat is a deterministic fixture;
++  every accepted boundary/residual is a documented BOUNDARY fixture)
++- Two of the loop's own earlier dispositions were REVERSED on later evidence
++  (AUDIT-14 query acceptance → AUDIT-45; AUDIT-03 absent-fonts-clean →
++  AUDIT-23) — the protocol audited its own fixes, not just the original code
++- Declared scope boundaries (in the lint docstring + the adversarial prompt,
++  each pinned by fixtures): (1) punctuation FLOW art mechanically gated;
++  letter-composed imagery and grid-diluted punctuation = referee's gross-class
++  domain; (2) UA default rendering of semantic HTML = the unstyled baseline;
++  (3) imagery composed by geometric placement of sanctioned atoms = referee's
++  domain
++- Fleet note: claude contributed rounds 1(retry)+2 then was 0-byte for 18
++  consecutive runs (deskwork issue 447); from round 3 the loop ran on codex
++  alone, so cross-model agreement was only available in rounds 1–2. The
++  convergence verdict is correspondingly single-family — re-validation with a
++  restored fleet is the natural post-447 follow-up.
++
++**Verification discipline held throughout:** every defeating input was
++executed against the real lint before recording (zero auditor predictions
++trusted); every fix was RED-first with the verbatim defeating input as the
++fixture; two self-caught transcription errors in fix shas were corrected in
++dedicated commits.
++
++
++## Under audit
++
++The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn't).
++
++diff --git a/plugins/design-control/bin/check-wireframe b/plugins/design-control/bin/check-wireframe
++new file mode 100755
++index 00000000..b5919fb3
++--- /dev/null
+++++ b/plugins/design-control/bin/check-wireframe
++@@ -0,0 +1,25 @@
+++#!/bin/sh
+++# check-wireframe <wireframe.html> — run the full pinned check-mockup-lofi lint
+++# against a wireframe file. Exit codes: 0 lint-green, 1 findings/error, 2 usage.
+++# Logic lives in src/authoring/lint-file.ts (tested); this shim only locates the
+++# workspace tsx runner (hoisted node_modules in the monorepo) and dispatches.
+++set -eu
+++
+++PLUGIN_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
+++
+++dir="$PLUGIN_ROOT"
+++TSX=""
+++while [ "$dir" != "/" ]; do
+++  if [ -x "$dir/node_modules/.bin/tsx" ]; then
+++    TSX="$dir/node_modules/.bin/tsx"
+++    break
+++  fi
+++  dir=$(dirname -- "$dir")
+++done
+++
+++if [ -z "$TSX" ]; then
+++  echo "check-wireframe: tsx runner not found in any node_modules/.bin above $PLUGIN_ROOT — run npm install first" >&2
+++  exit 1
+++fi
+++
+++exec "$TSX" "$PLUGIN_ROOT/src/authoring/check-wireframe-cli.ts" "$@"
++diff --git a/plugins/design-control/skills/wireframe/SKILL.md b/plugins/design-control/skills/wireframe/SKILL.md
++new file mode 100644
++index 00000000..47f432b3
++--- /dev/null
+++++ b/plugins/design-control/skills/wireframe/SKILL.md
++@@ -0,0 +1,86 @@
+++---
+++name: wireframe
+++description: Author a deliberately lo-fi wireframe for a named UI surface change — operator-driven, sketch-kit-based, and lint-enforced (zero check-wireframe findings before the draft may be presented). The optional /frontend-design accelerator routes through the same lint.
+++---
+++
+++# /design-control:wireframe `<change>`
+++
+++Author the **lo-fi wireframe** for one named surface change. The wireframe is
+++the UX-*spirit* artifact of the design-control discipline: it works out
+++structure, hierarchy, and flow while being structurally incapable of carrying
+++visual-design detail — so stale polish can never ship as if intended. Visual
+++identity lives in the design-language spec (Phase 2), never here.
+++
+++> Per the plugin thesis (`DESIGN-DISCIPLINE-THESIS.md`): policy is enforced by a
+++> process, not a rule. The lo-fi property is not a convention the author is
+++> trusted to follow — it is mechanically enforced by the `check-mockup-lofi`
+++> lint, which every draft MUST pass before it may be presented.
+++
+++## Arguments
+++
+++- `<change>` (required) — a short operator-meaningful brief of the surface
+++  change (e.g. `regroup the content browser by lane`). If missing, ask for it
+++  (one argument, one prompt).
+++
+++## Procedure
+++
+++1. **Resolve the target surface.** Confirm with the operator which surface the
+++   change addresses (`surface id` — operator-declared granularity, per the spec's
+++   Definitions). One wireframe per change; do not batch surfaces.
+++
+++2. **Set up the wireframe file.** Create `<surface-id>.html` in the operator's
+++   chosen wireframes directory, with the shipped sketch-kit copied alongside it:
+++   - copy `assets/sketch-kit/sketch-kit.css` (and `assets/sketch-kit/fonts/` if a
+++     font-bearing theme is chosen) next to the wireframe;
+++   - exactly ONE `<link rel="stylesheet" href="sketch-kit.css">`;
+++   - `<body class="sk sk-theme-<theme>">` — theme is the operator's pick among
+++     `marker` / `blueprint` / `grayscale` (default `grayscale`);
+++   - the kit's WIREFRAME banner (`.sk-banner`) stays — the artifact self-labels.
+++
+++3. **Author the wireframe — manual path (default, requires NO engine).** The
+++   operator (or the agent under operator direction) writes plain structural HTML
+++   using only the `.sk-*` vocabulary and the lint's allowed structural tags.
+++   Imagery is the fixed `.sk-img` placeholder; icons are text labels, never
+++   emoji; copy uses plain Basic-Latin text. This path never calls the engine
+++   preflight — it works with no engine installed.
+++
+++4. **Optional engine accelerator.** Only if the operator asks for it: gate on
+++   `preflightEngine` (`@/engine-adapter`, method `author-wireframe`) — absence
+++   fails loud naming the remedy — then request a draft via the engine adapter.
+++   **Engine output gets zero trust:** it lands in the same file and is judged by
+++   the same lint as a manual draft (a `lint-rejected` response is the defined
+++   failure mode; fix or discard, never grandfather).
+++
+++5. **Lint gate — the non-negotiable step.** Run:
+++
+++   ```bash
+++   plugins/design-control/bin/check-wireframe <path/to/wireframe.html>
+++   ```
+++
+++   - Exit `0` (lint green, zero findings) → the draft may be presented.
+++   - Exit `1` → fix every finding and re-run. NEVER present a draft with open
+++     findings; NEVER hand-wave a finding as "just lo-fi enough". The lint is the
+++     boundary of the lo-fi guarantee.
+++
+++6. **Record provenance.** This skill authors *driving* wireframes (the artifact
+++   precedes the implementation): record it via `recordDrivingWireframe`
+++   (`@/provenance`) in the wireframe's directory. A wireframe reverse-engineered
+++   from an existing surface is the *derived* path — record it with
+++   `recordDerivation` at derivation time instead, and note that acceptance will
+++   require a non-empty operator edit against the stored snapshot
+++   (`checkDerivedAcceptance`) and the artifact never supports a "wireframe drove
+++   implementation" claim.
+++
+++7. **Present and stop.** Show the operator the lint-green wireframe (path +
+++   `0 findings` output). The operator picks/iterates; translation into the
+++   design language and implementation are separate steps of the loop, not this
+++   skill's job.
+++
+++## What this skill does NOT do
+++
+++- It does not style anything — no CSS authoring, no presentational attributes
+++  (the lint rejects them anyway).
+++- It does not translate to the design language (`translate-design-language`),
+++  implement, or referee.
+++- It does not skip the lint for engine-authored drafts — same gate, same lint,
+++  zero findings.
++diff --git a/plugins/design-control/specs/001-design-control/tasks.md b/plugins/design-control/specs/001-design-control/tasks.md
++index 0d69efb4..a65fd485 100644
++--- a/plugins/design-control/specs/001-design-control/tasks.md
+++++ b/plugins/design-control/specs/001-design-control/tasks.md
++@@ -139,13 +139,22 @@ verbatim in substance** — when they drift, the PRD wins.
++       Romanian comma-below, multiline placeholders, cache-busting/percent-encoded/subdirectory kit
++       hrefs, data tables, placeholder rows, prose pages, disclosure blocks, and the boundary
++       fixtures. Suite: 151 → 286.
++-- [ ] `/design-control:wireframe <change>` authoring skill (operator-driven + lint-enforced; the
+++- [x] `/design-control:wireframe <change>` authoring skill (operator-driven + lint-enforced; the
++       engine `author-wireframe` method is an optional accelerator routed through the same lint).
++-- [ ] Retroactive path: existing surface → `derived` wireframe/spec; **snapshot the auto-derived
+++      **Done — 2026-06-10.** `skills/wireframe/SKILL.md` (manual path needs no engine; the
+++      accelerator gates on `preflightEngine` and its output is judged by the same lint) +
+++      `@/authoring` (`lintWireframeFile` composes the existing pinned pipeline — no parallel lint
+++      path) + `bin/check-wireframe` shim (exit contract 0 green / 1 findings-or-error / 2 usage;
+++      logic tested as `runCheckWireframe`, the shim only dispatches). TDD: 9 tests RED first.
+++- [x] Retroactive path: existing surface → `derived` wireframe/spec; **snapshot the auto-derived
++       draft at derivation time** (stored alongside provenance) so the edit-diff has a baseline;
++       **acceptance of a `derived` artifact requires a recorded operator edit** (non-empty diff
++       between the stored auto-derived snapshot and the accepted version), not just a state
++       transition; does NOT satisfy a "wireframe drove implementation" claim.
+++      **Done — 2026-06-10.** `@/provenance` (`recordDerivation` writes snapshot + zod-validated
+++      sidecar in one move; `checkDerivedAcceptance` rejects a byte-identical acceptance with
+++      `derived-unedited`, fails loud on a tampered baseline via the recorded sha256;
+++      `wireframeDroveImplementation` is true only for `driving` mode). TDD: 9 tests RED first.
++ 
++ **Acceptance:** the engine-adapter **preflight fails loud when `/frontend-design` is absent while
++ manual authoring still works**, and the preflight **precedes the first engine-consuming skill**; the
++diff --git a/plugins/design-control/src/__tests__/authoring/lint-file.test.ts b/plugins/design-control/src/__tests__/authoring/lint-file.test.ts
++new file mode 100644
++index 00000000..891ccae0
++--- /dev/null
+++++ b/plugins/design-control/src/__tests__/authoring/lint-file.test.ts
++@@ -0,0 +1,105 @@
+++import { describe, it, expect, afterEach } from 'vitest';
+++import { mkdtempSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
+++import { tmpdir } from 'node:os';
+++import { join } from 'node:path';
+++import { lintWireframeFile, runCheckWireframe } from '@/authoring/lint-file';
+++import { SKETCH_KIT_CSS_PATH, SKETCH_KIT_SAMPLE_PATH } from '@/wireframe-kit/sketch-kit';
+++
+++const dirs: string[] = [];
+++afterEach(() => {
+++  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
+++});
+++
+++/** Temp wireframe dir seeded with a genuine copy of the shipped kit CSS. */
+++function freshDir(): string {
+++  const dir = mkdtempSync(join(tmpdir(), 'dc-lint-file-'));
+++  dirs.push(dir);
+++  copyFileSync(SKETCH_KIT_CSS_PATH, join(dir, 'sketch-kit.css'));
+++  return dir;
+++}
+++
+++const cleanPage =
+++  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>' +
+++  '<link rel="stylesheet" href="sketch-kit.css"></head>' +
+++  '<body class="sk sk-theme-grayscale"><div class="sk-banner">WIREFRAME</div>' +
+++  '<h1>Entry list</h1></body></html>';
+++
+++describe('lintWireframeFile', () => {
+++  it('passes the shipped example wireframe (pin built against its own dir)', () => {
+++    const result = lintWireframeFile(SKETCH_KIT_SAMPLE_PATH);
+++    expect(result.findings).toEqual([]);
+++    expect(result.ok).toBe(true);
+++  });
+++
+++  it('passes a clean wireframe sitting next to a genuine kit copy', () => {
+++    const dir = freshDir();
+++    const file = join(dir, 'change.html');
+++    writeFileSync(file, cleanPage);
+++    expect(lintWireframeFile(file).ok).toBe(true);
+++  });
+++
+++  it('rejects a wireframe with an inline style (same axis-1 lint, not a parallel path)', () => {
+++    const dir = freshDir();
+++    const file = join(dir, 'change.html');
+++    writeFileSync(file, cleanPage.replace('<h1>', '<h1 style="color:red">'));
+++    const result = lintWireframeFile(file);
+++    expect(result.ok).toBe(false);
+++    expect(result.findings.map((f) => f.rule)).toContain('inline-style');
+++  });
+++
+++  it('rejects a wireframe whose kit copy is not the shipped bytes (identity pin enforced)', () => {
+++    const dir = freshDir();
+++    writeFileSync(join(dir, 'sketch-kit.css'), readFileSync(SKETCH_KIT_CSS_PATH, 'utf8') + '\nh1{color:hotpink}');
+++    const file = join(dir, 'change.html');
+++    writeFileSync(file, cleanPage);
+++    const result = lintWireframeFile(file);
+++    expect(result.ok).toBe(false);
+++    expect(result.findings.map((f) => f.rule)).toContain('stylesheet-hash-mismatch');
+++  });
+++
+++  it('fails loud on a missing file', () => {
+++    expect(() => lintWireframeFile(join(tmpdir(), 'dc-lint-file-does-not-exist.html'))).toThrow(
+++      /no such file|does not exist|ENOENT/i,
+++    );
+++  });
+++});
+++
+++describe('runCheckWireframe (CLI core — exit codes are the bin contract)', () => {
+++  function capture(): { out: string[]; err: string[]; io: { out(line: string): void; err(line: string): void } } {
+++    const out: string[] = [];
+++    const err: string[] = [];
+++    return { out, err, io: { out: (l) => out.push(l), err: (l) => err.push(l) } };
+++  }
+++
+++  it('exits 0 and reports clean on a passing wireframe', () => {
+++    const dir = freshDir();
+++    const file = join(dir, 'change.html');
+++    writeFileSync(file, cleanPage);
+++    const { io, out } = capture();
+++    expect(runCheckWireframe([file], io)).toBe(0);
+++    expect(out.join('\n')).toMatch(/0 findings/);
+++  });
+++
+++  it('exits 1 and prints one line per finding on a failing wireframe', () => {
+++    const dir = freshDir();
+++    const file = join(dir, 'change.html');
+++    writeFileSync(file, cleanPage.replace('<h1>', '<h1 style="color:red">'));
+++    const { io, err } = capture();
+++    expect(runCheckWireframe([file], io)).toBe(1);
+++    expect(err.some((l) => l.includes('inline-style'))).toBe(true);
+++  });
+++
+++  it('exits 1 with a descriptive error on a missing file (no fabricated verdict)', () => {
+++    const { io, err } = capture();
+++    expect(runCheckWireframe([join(tmpdir(), 'dc-nope.html')], io)).toBe(1);
+++    expect(err.join('\n')).toMatch(/no such file|does not exist|ENOENT/i);
+++  });
+++
+++  it('exits 2 on usage error (no argument / extra arguments)', () => {
+++    const a = capture();
+++    expect(runCheckWireframe([], a.io)).toBe(2);
+++    expect(a.err.join('\n')).toMatch(/usage/i);
+++    const b = capture();
+++    expect(runCheckWireframe(['x.html', 'y.html'], b.io)).toBe(2);
+++  });
+++});
++diff --git a/plugins/design-control/src/__tests__/provenance/derived.test.ts b/plugins/design-control/src/__tests__/provenance/derived.test.ts
++new file mode 100644
++index 00000000..97c6fcbb
++--- /dev/null
+++++ b/plugins/design-control/src/__tests__/provenance/derived.test.ts
++@@ -0,0 +1,146 @@
+++import { describe, it, expect, afterEach } from 'vitest';
+++import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
+++import { tmpdir } from 'node:os';
+++import { join } from 'node:path';
+++import {
+++  recordDerivation,
+++  loadProvenance,
+++  checkDerivedAcceptance,
+++  wireframeDroveImplementation,
+++  recordDrivingWireframe,
+++} from '@/provenance/derived';
+++
+++const dirs: string[] = [];
+++afterEach(() => {
+++  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
+++});
+++
+++function freshDir(): string {
+++  const dir = mkdtempSync(join(tmpdir(), 'dc-prov-'));
+++  dirs.push(dir);
+++  return dir;
+++}
+++
+++const draftHtml =
+++  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>' +
+++  '<link rel="stylesheet" href="sketch-kit.css"></head>' +
+++  '<body class="sk sk-theme-grayscale"><h1>Derived from live surface</h1></body></html>';
+++
+++describe('recordDerivation', () => {
+++  it('writes the auto-derived snapshot AND the provenance sidecar at derivation time', () => {
+++    const dir = freshDir();
+++    const prov = recordDerivation({
+++      dir,
+++      surfaceId: 'studio-content-browser',
+++      derivedHtml: draftHtml,
+++      source: 'http://localhost:4321/dev/editorial-studio',
+++      derivedAt: new Date('2026-06-10T12:00:00Z'),
+++    });
+++    expect(prov.mode).toBe('derived');
+++    const names = readdirSync(dir);
+++    expect(names).toContain('studio-content-browser.derived-snapshot.html');
+++    expect(names).toContain('studio-content-browser.provenance.json');
+++    expect(readFileSync(join(dir, 'studio-content-browser.derived-snapshot.html'), 'utf8')).toBe(draftHtml);
+++  });
+++
+++  it('round-trips through loadProvenance (zod-validated)', () => {
+++    const dir = freshDir();
+++    recordDerivation({
+++      dir,
+++      surfaceId: 'scrapbook-drawer',
+++      derivedHtml: draftHtml,
+++      source: 'route /dev/scrapbook',
+++      derivedAt: new Date('2026-06-10T12:00:00Z'),
+++    });
+++    const prov = loadProvenance(dir, 'scrapbook-drawer');
+++    expect(prov.surfaceId).toBe('scrapbook-drawer');
+++    expect(prov.mode).toBe('derived');
+++    if (prov.mode !== 'derived') throw new Error('unreachable');
+++    expect(prov.derived.source).toBe('route /dev/scrapbook');
+++    expect(prov.derived.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
+++  });
+++});
+++
+++describe('loadProvenance fail-loud paths', () => {
+++  it('throws a descriptive error when the sidecar is missing', () => {
+++    expect(() => loadProvenance(freshDir(), 'nope')).toThrow(/provenance/i);
+++  });
+++
+++  it('throws on a malformed sidecar (no silent fallback)', () => {
+++    const dir = freshDir();
+++    writeFileSync(join(dir, 'bad.provenance.json'), '{"mode":"derived"}');
+++    expect(() => loadProvenance(dir, 'bad')).toThrow();
+++  });
+++});
+++
+++describe('checkDerivedAcceptance — acceptance requires a recorded operator edit', () => {
+++  it('rejects a byte-identical accepted artifact (state transition alone is not an edit)', () => {
+++    const dir = freshDir();
+++    recordDerivation({
+++      dir,
+++      surfaceId: 's1',
+++      derivedHtml: draftHtml,
+++      source: 'live surface',
+++      derivedAt: new Date('2026-06-10T12:00:00Z'),
+++    });
+++    const result = checkDerivedAcceptance(dir, 's1', draftHtml);
+++    expect(result.ok).toBe(false);
+++    expect(result.findings.map((f) => f.rule)).toContain('derived-unedited');
+++  });
+++
+++  it('accepts once the operator edit produces a non-empty diff against the stored snapshot', () => {
+++    const dir = freshDir();
+++    recordDerivation({
+++      dir,
+++      surfaceId: 's1',
+++      derivedHtml: draftHtml,
+++      source: 'live surface',
+++      derivedAt: new Date('2026-06-10T12:00:00Z'),
+++    });
+++    const edited = draftHtml.replace('Derived from live surface', 'Entry list, regrouped by lane');
+++    expect(checkDerivedAcceptance(dir, 's1', edited).ok).toBe(true);
+++  });
+++
+++  it('fails loud when the stored snapshot was tampered after recording (hash mismatch)', () => {
+++    const dir = freshDir();
+++    recordDerivation({
+++      dir,
+++      surfaceId: 's1',
+++      derivedHtml: draftHtml,
+++      source: 'live surface',
+++      derivedAt: new Date('2026-06-10T12:00:00Z'),
+++    });
+++    writeFileSync(join(dir, 's1.derived-snapshot.html'), draftHtml + '<!-- tampered -->');
+++    expect(() => checkDerivedAcceptance(dir, 's1', 'whatever')).toThrow(/snapshot|hash/i);
+++  });
+++
+++  it('does not gate a driving wireframe (the derived gate is mode-scoped)', () => {
+++    const dir = freshDir();
+++    recordDrivingWireframe({
+++      dir,
+++      surfaceId: 'fresh',
+++      derivedAt: new Date('2026-06-10T12:00:00Z'),
+++    });
+++    expect(checkDerivedAcceptance(dir, 'fresh', draftHtml).ok).toBe(true);
+++  });
+++});
+++
+++describe('wireframeDroveImplementation', () => {
+++  it('is true for a driving wireframe and FALSE for a derived one (even an accepted one)', () => {
+++    const dir = freshDir();
+++    const derived = recordDerivation({
+++      dir,
+++      surfaceId: 'd',
+++      derivedHtml: draftHtml,
+++      source: 'live surface',
+++      derivedAt: new Date('2026-06-10T12:00:00Z'),
+++    });
+++    const driving = recordDrivingWireframe({
+++      dir,
+++      surfaceId: 'w',
+++      derivedAt: new Date('2026-06-10T12:00:00Z'),
+++    });
+++    expect(wireframeDroveImplementation(derived)).toBe(false);
+++    expect(wireframeDroveImplementation(driving)).toBe(true);
+++  });
+++});
++diff --git a/plugins/design-control/src/authoring/check-wireframe-cli.ts b/plugins/design-control/src/authoring/check-wireframe-cli.ts
++new file mode 100644
++index 00000000..3838653a
++--- /dev/null
+++++ b/plugins/design-control/src/authoring/check-wireframe-cli.ts
++@@ -0,0 +1,12 @@
+++/**
+++ * Process entry for `bin/check-wireframe`. All behavior lives in
+++ * {@link runCheckWireframe} (tested directly); this file only wires argv and
+++ * the process exit code.
+++ */
+++
+++import { runCheckWireframe } from '@/authoring/lint-file';
+++
+++process.exitCode = runCheckWireframe(process.argv.slice(2), {
+++  out: (line) => console.log(line),
+++  err: (line) => console.error(line),
+++});
++diff --git a/plugins/design-control/src/authoring/index.ts b/plugins/design-control/src/authoring/index.ts
++new file mode 100644
++index 00000000..c6773979
++--- /dev/null
+++++ b/plugins/design-control/src/authoring/index.ts
++@@ -0,0 +1,5 @@
+++/**
+++ * Public surface of the wireframe-authoring path. Import via `@/authoring`.
+++ */
+++
+++export { type CliIo, lintWireframeFile, runCheckWireframe } from '@/authoring/lint-file';
++diff --git a/plugins/design-control/src/authoring/lint-file.ts b/plugins/design-control/src/authoring/lint-file.ts
++new file mode 100644
++index 00000000..310dc89c
++--- /dev/null
+++++ b/plugins/design-control/src/authoring/lint-file.ts
++@@ -0,0 +1,68 @@
+++/**
+++ * File-level entry to the `check-mockup-lofi` lint — the enforcement seam the
+++ * `/design-control:wireframe` authoring skill (and the `bin/check-wireframe`
+++ * shim) route EVERY wireframe draft through, manual or engine-authored alike.
+++ *
+++ * This is deliberately a thin composition of the existing axes — axis 1
+++ * (element/attribute allowlist) + axis 1.5 (stylesheet identity pin) + the
+++ * codepoint allowlist — via `lintWireframe`. No parallel lint path: the skill
+++ * and the library agree by construction because they call the same pipeline.
+++ */
+++
+++import { readFileSync } from 'node:fs';
+++import { dirname, resolve } from 'node:path';
+++import { lintWireframe } from '@/lint/check-mockup-lofi';
+++import { buildSketchKitPin } from '@/lint/stylesheet-pin';
+++import type { LintResult } from '@/lint/types';
+++
+++/**
+++ * Lint a wireframe FILE: read it, build the sketch-kit identity pin against the
+++ * file's own directory (the conventional layout — the kit copy sits next to the
+++ * wireframe), and run the full pinned lint. Fails loud on an unreadable file —
+++ * a missing wireframe is an error, never a clean verdict.
+++ */
+++export function lintWireframeFile(filePath: string): LintResult {
+++  const absolute = resolve(filePath);
+++  const html = readFileSync(absolute, 'utf8');
+++  return lintWireframe(html, { stylesheetPin: buildSketchKitPin(dirname(absolute)) });
+++}
+++
+++/** Line-oriented output sink, injected so the CLI core is testable as a function. */
+++export interface CliIo {
+++  out(line: string): void;
+++  err(line: string): void;
+++}
+++
+++const USAGE = 'usage: check-wireframe <wireframe.html>';
+++
+++/**
+++ * CLI core behind `bin/check-wireframe`. Exit-code contract (the skill's gate):
+++ *   0 — lint green (zero findings)
+++ *   1 — findings present, or the file could not be read (descriptive error;
+++ *       never a fabricated verdict)
+++ *   2 — usage error
+++ */
+++export function runCheckWireframe(argv: readonly string[], io: CliIo): number {
+++  if (argv.length !== 1) {
+++    io.err(USAGE);
+++    return 2;
+++  }
+++  const filePath = argv[0];
+++  let result: LintResult;
+++  try {
+++    result = lintWireframeFile(filePath);
+++  } catch (error) {
+++    io.err(error instanceof Error ? error.message : String(error));
+++    return 1;
+++  }
+++  if (result.ok) {
+++    io.out(`${filePath}: lint green — 0 findings`);
+++    return 0;
+++  }
+++  for (const finding of result.findings) {
+++    const where = [finding.tag, finding.attr].filter(Boolean).join(' ');
+++    io.err(`${finding.rule}${where ? ` (${where})` : ''}: ${finding.message}`);
+++  }
+++  io.err(`${filePath}: ${result.findings.length} finding(s)`);
+++  return 1;
+++}
++diff --git a/plugins/design-control/src/provenance/derived.ts b/plugins/design-control/src/provenance/derived.ts
++new file mode 100644
++index 00000000..6e5c2987
++--- /dev/null
+++++ b/plugins/design-control/src/provenance/derived.ts
++@@ -0,0 +1,185 @@
+++/**
+++ * Wireframe provenance — the retroactive (`derived`) path.
+++ *
+++ * A wireframe is either DRIVING (authored before the implementation; the
+++ * artifact that drove the change) or DERIVED (reverse-engineered from an
+++ * already-existing surface). The derived path exists so a legacy surface can be
+++ * brought under the discipline, but with two hard properties from the spec:
+++ *
+++ *  1. The auto-derived draft is SNAPSHOTTED at derivation time, alongside its
+++ *     provenance, so acceptance has a baseline to diff against.
+++ *  2. Accepting a `derived` artifact REQUIRES a recorded operator edit — a
+++ *     non-empty byte diff between the stored snapshot and the accepted version.
+++ *     A bare state transition is not an edit.
+++ *
+++ * And a `derived` artifact NEVER satisfies a "wireframe drove implementation"
+++ * claim ({@link wireframeDroveImplementation}) — provenance distinguishes the
+++ * two modes precisely so the claim cannot be laundered through acceptance.
+++ *
+++ * Sidecar layout (per surface, in the operator-chosen provenance dir):
+++ *   <surfaceId>.provenance.json          — zod-validated provenance record
+++ *   <surfaceId>.derived-snapshot.html    — the auto-derived draft (derived only)
+++ */
+++
+++import { existsSync, readFileSync, writeFileSync } from 'node:fs';
+++import { join } from 'node:path';
+++import { createHash } from 'node:crypto';
+++import { z } from 'zod';
+++
+++const PROVENANCE_VERSION = 1;
+++
+++const sha256Hex = (content: string): string => createHash('sha256').update(content).digest('hex');
+++
+++const drivingSchema = z.object({
+++  version: z.literal(PROVENANCE_VERSION),
+++  surfaceId: z.string().min(1),
+++  mode: z.literal('driving'),
+++  createdAt: z.string().datetime(),
+++});
+++
+++const derivedSchema = z.object({
+++  version: z.literal(PROVENANCE_VERSION),
+++  surfaceId: z.string().min(1),
+++  mode: z.literal('derived'),
+++  createdAt: z.string().datetime(),
+++  derived: z.object({
+++    /** Filename (dir-relative) of the snapshot stored at derivation time. */
+++    snapshotFile: z.string().min(1),
+++    /** sha256 (hex) of the snapshot bytes as recorded — tamper evidence. */
+++    snapshotSha256: z.string().regex(/^[0-9a-f]{64}$/),
+++    /** What the draft was derived FROM (route, URL, file — operator-meaningful). */
+++    source: z.string().min(1),
+++  }),
+++});
+++
+++const provenanceSchema = z.discriminatedUnion('mode', [drivingSchema, derivedSchema]);
+++
+++export type WireframeProvenance = z.infer<typeof provenanceSchema>;
+++
+++export interface ProvenanceFinding {
+++  readonly rule: 'derived-unedited';
+++  readonly message: string;
+++}
+++
+++export interface AcceptanceResult {
+++  readonly ok: boolean;
+++  readonly findings: readonly ProvenanceFinding[];
+++}
+++
+++const sidecarPath = (dir: string, surfaceId: string): string =>
+++  join(dir, `${surfaceId}.provenance.json`);
+++
+++function writeProvenance(dir: string, provenance: WireframeProvenance): void {
+++  writeFileSync(
+++    sidecarPath(dir, provenance.surfaceId),
+++    JSON.stringify(provenance, null, 2) + '\n',
+++  );
+++}
+++
+++/** Record a DRIVING wireframe's provenance (the authored-first path). */
+++export function recordDrivingWireframe(input: {
+++  dir: string;
+++  surfaceId: string;
+++  derivedAt?: Date;
+++}): WireframeProvenance {
+++  const provenance: WireframeProvenance = {
+++    version: PROVENANCE_VERSION,
+++    surfaceId: input.surfaceId,
+++    mode: 'driving',
+++    createdAt: (input.derivedAt ?? new Date()).toISOString(),
+++  };
+++  writeProvenance(input.dir, provenance);
+++  return provenance;
+++}
+++
+++/**
+++ * Record a DERIVED draft at derivation time: store the auto-derived snapshot
+++ * AND the provenance sidecar in one move, so the acceptance diff always has its
+++ * baseline. The snapshot hash is recorded for tamper evidence.
+++ */
+++export function recordDerivation(input: {
+++  dir: string;
+++  surfaceId: string;
+++  derivedHtml: string;
+++  source: string;
+++  derivedAt?: Date;
+++}): WireframeProvenance {
+++  const snapshotFile = `${input.surfaceId}.derived-snapshot.html`;
+++  writeFileSync(join(input.dir, snapshotFile), input.derivedHtml);
+++  const provenance: WireframeProvenance = {
+++    version: PROVENANCE_VERSION,
+++    surfaceId: input.surfaceId,
+++    mode: 'derived',
+++    createdAt: (input.derivedAt ?? new Date()).toISOString(),
+++    derived: {
+++      snapshotFile,
+++      snapshotSha256: sha256Hex(input.derivedHtml),
+++      source: input.source,
+++    },
+++  };
+++  writeProvenance(input.dir, provenance);
+++  return provenance;
+++}
+++
+++/** Load + zod-validate a surface's provenance sidecar. Fails loud when absent/malformed. */
+++export function loadProvenance(dir: string, surfaceId: string): WireframeProvenance {
+++  const path = sidecarPath(dir, surfaceId);
+++  if (!existsSync(path)) {
+++    throw new Error(
+++      `No provenance sidecar for surface "${surfaceId}" at ${path}. ` +
+++        `Record provenance at authoring/derivation time (recordDrivingWireframe / recordDerivation).`,
+++    );
+++  }
+++  return provenanceSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
+++}
+++
+++/**
+++ * The acceptance gate for `derived` artifacts: the accepted version must carry
+++ * a recorded operator edit — a non-empty byte diff against the snapshot stored
+++ * at derivation time. Driving wireframes pass through (the gate is mode-scoped).
+++ * Fails loud if the stored snapshot no longer matches its recorded hash — a
+++ * tampered baseline cannot certify an edit.
+++ */
+++export function checkDerivedAcceptance(
+++  dir: string,
+++  surfaceId: string,
+++  acceptedHtml: string,
+++): AcceptanceResult {
+++  const provenance = loadProvenance(dir, surfaceId);
+++  if (provenance.mode !== 'derived') {
+++    return { ok: true, findings: [] };
+++  }
+++  const snapshotPath = join(dir, provenance.derived.snapshotFile);
+++  const snapshot = readFileSync(snapshotPath, 'utf8');
+++  if (sha256Hex(snapshot) !== provenance.derived.snapshotSha256) {
+++    throw new Error(
+++      `Derived snapshot ${snapshotPath} does not match the hash recorded at derivation time — ` +
+++        `the baseline was modified after recording, so the operator-edit diff cannot be trusted. ` +
+++        `Re-derive the draft to re-establish a baseline.`,
+++    );
+++  }
+++  if (acceptedHtml === snapshot) {
+++    return {
+++      ok: false,
+++      findings: [
+++        {
+++          rule: 'derived-unedited',
+++          message:
+++            `Surface "${surfaceId}": the accepted artifact is byte-identical to the auto-derived ` +
+++            `snapshot. Accepting a derived wireframe requires a recorded operator edit ` +
+++            `(non-empty diff against the derivation-time snapshot), not just a state transition.`,
+++        },
+++      ],
+++    };
+++  }
+++  return { ok: true, findings: [] };
+++}
+++
+++/**
+++ * Whether this wireframe supports a "wireframe drove implementation" claim.
+++ * Only a DRIVING wireframe does; a `derived` one never does, edited or not —
+++ * it was reverse-engineered from the surface it would be claiming to have driven.
+++ */
+++export function wireframeDroveImplementation(provenance: WireframeProvenance): boolean {
+++  return provenance.mode === 'driving';
+++}
++diff --git a/plugins/design-control/src/provenance/index.ts b/plugins/design-control/src/provenance/index.ts
++new file mode 100644
++index 00000000..3106074f
++--- /dev/null
+++++ b/plugins/design-control/src/provenance/index.ts
++@@ -0,0 +1,14 @@
+++/**
+++ * Public surface of the wireframe-provenance module. Import via `@/provenance`.
+++ */
+++
+++export {
+++  type WireframeProvenance,
+++  type ProvenanceFinding,
+++  type AcceptanceResult,
+++  recordDrivingWireframe,
+++  recordDerivation,
+++  loadProvenance,
+++  checkDerivedAcceptance,
+++  wireframeDroveImplementation,
+++} from '@/provenance/derived';
++
++
++## What to look for
++
++- **Correctness bugs** — logic errors, off-by-one, null/undefined paths, race conditions, missing error handling, swallowed exceptions.
++- **Design issues** — coupling between layers that should be independent, leaking abstractions, primitives that should compose but don't, configuration that should be data ending up as code.
++- **Missed edge cases** — what happens with empty input? Maximum input? Concurrent calls? Partial failure? Network unavailability? Operator interrupt mid-operation? What is the behavior on a fresh install vs. an upgrade?
++- **Code-quality concerns** — files growing past a reasonable cap, names that don't reveal intent, dead code, duplicated logic, magic numbers without explanation, tests that don't test the contract they claim to test.
++- **Cross-cutting impact** — does this diff touch a surface that other surfaces depend on? Are those other surfaces updated? Are migrations needed? Are doctor rules / schemas / validators updated to match the new shape?
++- **Documentation drift** — does the README / SKILL.md / PRD describe the behavior the code actually implements? If the spec changed, did the implementation? If the implementation changed, did the spec?
++- **Operator-discipline traps** — placeholder comments, swallowed errors, hardcoded paths/values that should be configurable, fallbacks that hide failure modes, mock data outside test code. These are bug-factories per project guidelines.
++
++## Output format
++
++For each finding you surface, emit ONE markdown block in this exact shape:
++
++```
++### <heading: one-line summary of the finding>
++
++Finding-ID: AUDIT-BARRAGE-<your-model-name>-<NN>
++Status:     open
++Severity:   <blocking | high | medium | low | informational>
++Surface:    <repo-relative-path:line-range> OR <description of the surface if not anchored to a single file>
++
++<one-to-three paragraphs of body: what the finding is, why it matters, what evidence you relied on, what a reasonable fix would look like. Be specific. Cite line numbers from the diff. If the finding is structural / cross-file, name every file affected.>
++```
++
++Number the findings sequentially (`-01`, `-02`, ...).
++
++**Severity — rate each finding by downstream blast-radius:** the consequence if a downstream consumer acts on the audited surface *as written*. The consumer may be an adopter running the code, or — especially for a spec — an AI agent building **unattended** from it, with no human to catch a wrong reading. Rate by what would actually happen if this shipped as-is, **not by how alarming the finding feels**. State the blast-radius reasoning in the finding body for every finding, at every level.
++
++- `blocking` — acting on it as-written breaks the feature's stated goals in obvious ways; OR (for a spec) the more natural reading an agent reaches first is the wrong one, so it will likely be built wrong by default and nothing in the artifact corrects it.
++- `high` — a correctness/safety defect a consumer will hit; OR a spec contradiction/ambiguity where the readings are roughly equally plausible and the artifact doesn't disambiguate — an agent might build either, including the wrong one.
++- `medium` — a design issue that compounds over time; OR a spec inconsistency a reasonable consumer would resolve correctly anyway (readings barely diverge, or context makes the intended one obvious).
++- `low` — hygiene; cosmetic wording with no behavioral or implementation consequence.
++- `informational` — context worth seeing, not itself a defect.
++
++**Calibrate by consequence, not by alarm.** A genuine contradiction a reader would obviously resolve the right way is at most `medium`. A quietly-plausible wrong reading an agent would actually build is `high`/`blocking` even if it looks minor. A spec's internal consistency is load-bearing — it is the input to an unattended build.
++
++## If you find nothing — say so explicitly
++
++If you walk the diff carefully and find no findings worth surfacing, emit ONE block in this shape instead:
++
++```
++### No findings
++
++Finding-ID: AUDIT-BARRAGE-<your-model-name>-CLEAN
++Status:     open
++Severity:   informational
++Surface:    (the entire diff)
++
++I walked the diff for the feature named above and found no findings worth surfacing. My specific reasoning: <three-to-five sentences explaining what you checked, why those checks came back clean, and what you would have flagged if it had been present.>
++```
++
++**Do not pad with weak findings.** A confident "I checked X, Y, Z and they are clean for these reasons" is more useful to the operator than three vague low-severity notes. The cross-model diversity gives the operator independent signal; an empty clean report from your CLI is itself a signal when paired with findings from your siblings.
++
++## Hard constraints
++
++- **No deferral phrases.** Don't write phrases like "fix later", "address in a follow-up", or other commitments to deferred work. The dispatch-wrapper rejects these as bug-factories. If you spot a deferral phrase IN the diff, surface it as a finding.
++- **Anchor findings to evidence.** A finding that says "this might be a problem" without naming the specific file + line is not actionable. Name the surface, quote the relevant code, explain what's wrong.
++- **One issue per finding block.** Don't bundle multiple concerns into one entry; the operator triages each block as a discrete signal.
++- **Provenance is your model name.** Replace `<your-model-name>` in the Finding-ID with the CLI you are (`claude`, `codex`, `gemini`, etc.). This is how the operator joins findings across models.
++
++codex
++### `recordDerivation` can leave an orphaned snapshot if sidecar write fails
++
++Finding-ID: AUDIT-BARRAGE-codex-01  
++Status:     open  
++Severity:   medium  
++Surface:    `plugins/design-control/src/provenance/derived.ts:102-118`
++
++`recordDerivation` writes `<surfaceId>.derived-snapshot.html` first, then writes `<surfaceId>.provenance.json`. If the process is interrupted, the disk fills, permissions change, or JSON sidecar write otherwise fails after line 104, the directory is left with a snapshot but no valid provenance record. The workplan says `recordDerivation` “writes snapshot + zod-validated sidecar in one move”; this implementation is sequential non-atomic writes.
++
++The blast radius is medium: normal consumers will usually succeed, but the failure mode creates ambiguous provenance state in the operator’s artifact directory. A later unattended agent or operator may see the snapshot and assume derivation was recorded, while `loadProvenance` fails loud because the sidecar is absent. A reasonable fix is to write both artifacts via temporary files and atomic renames, with cleanup on failure, or to write the sidecar first with a temporary snapshot reference and only promote both names once both writes have succeeded.
++tokens used
++23,875
+diff --git a/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/gemini.txt b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/gemini.txt
+new file mode 100644
+index 00000000..72be61b7
+--- /dev/null
++++ b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/stderr/gemini.txt
+@@ -0,0 +1,8 @@
++Loaded cached credentials.
++Loading extension: nanobanana
++Attempt 1 failed: You have exhausted your capacity on this model.. Retrying after 10000ms...
++Attempt 2 failed: You have exhausted your capacity on this model.. Retrying after 10000ms...
++Error when talking to Gemini API Full report available at: /var/folders/sk/jzwspmzn1g17x97x7s7l_dch0000gn/T/gemini-client-error-Turn.run-sendMessageStream-2026-06-11T05-56-52-436Z.json
++[API Error: You have exhausted your capacity on this model.]
++An unexpected critical error occurred:
++[object Object]
+diff --git a/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/tip.sha b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/tip.sha
+new file mode 100644
+index 00000000..431f0526
+--- /dev/null
++++ b/plugins/design-control/.stack-control/audit-runs/20260611T055621128Z-design-control-after_clarify/tip.sha
+@@ -0,0 +1 @@
++9639b4453f88df8b82921955898bfeab23ad9cdd
+diff --git a/plugins/design-control/bin/check-wireframe b/plugins/design-control/bin/check-wireframe
+new file mode 100755
+index 00000000..b5919fb3
+--- /dev/null
++++ b/plugins/design-control/bin/check-wireframe
+@@ -0,0 +1,25 @@
++#!/bin/sh
++# check-wireframe <wireframe.html> — run the full pinned check-mockup-lofi lint
++# against a wireframe file. Exit codes: 0 lint-green, 1 findings/error, 2 usage.
++# Logic lives in src/authoring/lint-file.ts (tested); this shim only locates the
++# workspace tsx runner (hoisted node_modules in the monorepo) and dispatches.
++set -eu
++
++PLUGIN_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
++
++dir="$PLUGIN_ROOT"
++TSX=""
++while [ "$dir" != "/" ]; do
++  if [ -x "$dir/node_modules/.bin/tsx" ]; then
++    TSX="$dir/node_modules/.bin/tsx"
++    break
++  fi
++  dir=$(dirname -- "$dir")
++done
++
++if [ -z "$TSX" ]; then
++  echo "check-wireframe: tsx runner not found in any node_modules/.bin above $PLUGIN_ROOT — run npm install first" >&2
++  exit 1
++fi
++
++exec "$TSX" "$PLUGIN_ROOT/src/authoring/check-wireframe-cli.ts" "$@"
+diff --git a/plugins/design-control/bin/wireframe-provenance b/plugins/design-control/bin/wireframe-provenance
+new file mode 100755
+index 00000000..eff94773
+--- /dev/null
++++ b/plugins/design-control/bin/wireframe-provenance
+@@ -0,0 +1,26 @@
++#!/bin/sh
++# wireframe-provenance <subcommand> ... — record + verify wireframe provenance
++# (record-driving | record-derived | check-acceptance | verify-driving).
++# Exit codes: 0 success/ok, 1 refusal/error, 2 usage.
++# Logic lives in src/provenance/cli.ts (tested); this shim only locates the
++# workspace tsx runner (hoisted node_modules in the monorepo) and dispatches.
++set -eu
++
++PLUGIN_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
++
++dir="$PLUGIN_ROOT"
++TSX=""
++while [ "$dir" != "/" ]; do
++  if [ -x "$dir/node_modules/.bin/tsx" ]; then
++    TSX="$dir/node_modules/.bin/tsx"
++    break
++  fi
++  dir=$(dirname -- "$dir")
++done
++
++if [ -z "$TSX" ]; then
++  echo "wireframe-provenance: tsx runner not found in any node_modules/.bin above $PLUGIN_ROOT — run npm install first" >&2
++  exit 1
++fi
++
++exec "$TSX" "$PLUGIN_ROOT/src/provenance/wireframe-provenance-cli.ts" "$@"
+diff --git a/plugins/design-control/skills/wireframe/SKILL.md b/plugins/design-control/skills/wireframe/SKILL.md
+new file mode 100644
+index 00000000..361d1647
+--- /dev/null
++++ b/plugins/design-control/skills/wireframe/SKILL.md
+@@ -0,0 +1,123 @@
++---
++name: wireframe
++description: Author a deliberately lo-fi wireframe for a named UI surface change — operator-driven, sketch-kit-based, and lint-enforced (zero check-wireframe findings before the draft may be presented). The optional /frontend-design accelerator routes through the same lint.
++---
++
++# /design-control:wireframe `<change>`
++
++Author the **lo-fi wireframe** for one named surface change. The wireframe is
++the UX-*spirit* artifact of the design-control discipline: it works out
++structure, hierarchy, and flow while being structurally incapable of carrying
++visual-design detail — so stale polish can never ship as if intended. Visual
++identity lives in the design-language spec (Phase 2), never here.
++
++> Per the plugin thesis (`DESIGN-DISCIPLINE-THESIS.md`): policy is enforced by a
++> process, not a rule. The lo-fi property is not a convention the author is
++> trusted to follow — it is mechanically enforced by the `check-mockup-lofi`
++> lint, which every draft MUST pass before it may be presented.
++
++## Arguments
++
++- `<change>` (required) — a short operator-meaningful brief of the surface
++  change (e.g. `regroup the content browser by lane`). If missing, ask for it
++  (one argument, one prompt).
++
++## Procedure
++
++1. **Resolve the target surface.** Confirm with the operator which surface the
++   change addresses (`surface id` — operator-declared granularity, per the spec's
++   Definitions). One wireframe per change; do not batch surfaces.
++
++2. **Set up the wireframe file.** Create `<surface-id>.html` in the operator's
++   chosen wireframes directory, with the shipped sketch-kit copied alongside it:
++   - copy `assets/sketch-kit/sketch-kit.css` (and `assets/sketch-kit/fonts/` if a
++     font-bearing theme is chosen) next to the wireframe;
++   - exactly ONE `<link rel="stylesheet" href="sketch-kit.css">`;
++   - `<body class="sk sk-theme-<theme>">` — theme is the operator's pick among
++     `marker` / `blueprint` / `grayscale` (default `grayscale`);
++   - the kit's WIREFRAME banner (`.sk-banner`) stays — the artifact self-labels.
++
++3. **Author the wireframe — manual path (default, requires NO engine).** The
++   operator (or the agent under operator direction) writes plain structural HTML
++   using only the `.sk-*` vocabulary and the lint's allowed structural tags.
++   Imagery is the fixed `.sk-img` placeholder; icons are text labels, never
++   emoji; copy uses plain Basic-Latin text. This path never calls the engine
++   preflight — it works with no engine installed.
++
++4. **Optional engine accelerator.** Only if the operator asks for it: gate on
++   `preflightEngine` (`@/engine-adapter`, method `author-wireframe`) — absence
++   fails loud naming the remedy — then request a draft via the engine adapter.
++   **Engine output gets zero trust:** it lands in the same file and is judged by
++   the same lint as a manual draft (a `lint-rejected` response is the defined
++   failure mode; fix or discard, never grandfather).
++
++5. **Lint gate — the non-negotiable step.** Run:
++
++   ```bash
++   plugins/design-control/bin/check-wireframe <path/to/wireframe.html>
++   ```
++
++   - Exit `0` (lint green, zero findings) → the draft may be presented.
++   - Exit `1` → fix every finding and re-run. NEVER present a draft with open
++     findings; NEVER hand-wave a finding as "just lo-fi enough". The lint is the
++     boundary of the lo-fi guarantee.
++
++6. **Record provenance.** This skill authors *driving* wireframes (the artifact
++   precedes the implementation): record it in the wireframe's directory by
++   running:
++
++   ```bash
++   plugins/design-control/bin/wireframe-provenance record-driving <wireframes-dir> <surface-id> <wireframe-filename>
++   ```
++
++   (`<wireframe-filename>` is the lint-green wireframe's filename, relative to
++   `<wireframes-dir>`.) Exit `0` → recorded; exit `1` → descriptive refusal or
++   error on stderr — fix and re-run, never skip. The record binds that artifact
++   by name + sha256, so a later replacement of the wireframe is tamper-evident:
++
++   ```bash
++   plugins/design-control/bin/wireframe-provenance verify-driving <wireframes-dir> <surface-id>
++   ```
++
++   re-hashes the bound file and exits `1` on tamper/missing/mode mismatch. The
++   wireframe file must exist on disk at record time; step 5's lint gate
++   guarantees it does.
++
++   A wireframe reverse-engineered from an existing surface is the *derived*
++   path — record it at derivation time instead with:
++
++   ```bash
++   plugins/design-control/bin/wireframe-provenance record-derived <wireframes-dir> <surface-id> <source> --from <derived-draft.html>
++   ```
++
++   (`<source>` is what the draft was derived FROM — route, URL, file;
++   `--from` names the auto-derived draft file, which is snapshotted alongside
++   the sidecar). Acceptance of a derived artifact then requires a non-empty
++   operator edit against the stored snapshot — the acceptance gate is:
++
++   ```bash
++   plugins/design-control/bin/wireframe-provenance check-acceptance <wireframes-dir> <surface-id> <accepted.html>
++   ```
++
++   Exit `0` → ok; exit `1` → the artifact is byte-identical to the
++   derivation-time snapshot (`derived-unedited`) or the baseline was tampered.
++   A derived artifact never supports a "wireframe drove implementation" claim,
++   edited or not. Provenance is append-once: if a sidecar already exists for
++   the surface, BOTH recorders refuse to overwrite it (in either mode
++   direction) — re-recording requires explicitly removing or superseding the
++   existing record; never work around the refusal by deleting the sidecar to
++   flip a `derived` surface to `driving`.
++
++7. **Present and stop.** Show the operator the lint-green wireframe (path +
++   `0 findings` output). The operator picks/iterates; translation into the
++   design language and implementation are separate steps of the loop, not this
++   skill's job.
++
++## What this skill does NOT do
++
++- It does not style anything — no CSS authoring, no presentational attributes
++  (the lint rejects them anyway).
++- It does not translate to the design language (`translate-design-language`),
++  implement, or referee.
++- It does not skip the lint for engine-authored drafts — same gate, same lint,
++  zero findings.
+diff --git a/plugins/design-control/specs/001-design-control/tasks.md b/plugins/design-control/specs/001-design-control/tasks.md
+index 0d69efb4..a65fd485 100644
+--- a/plugins/design-control/specs/001-design-control/tasks.md
++++ b/plugins/design-control/specs/001-design-control/tasks.md
+@@ -139,13 +139,22 @@ verbatim in substance** — when they drift, the PRD wins.
+       Romanian comma-below, multiline placeholders, cache-busting/percent-encoded/subdirectory kit
+       hrefs, data tables, placeholder rows, prose pages, disclosure blocks, and the boundary
+       fixtures. Suite: 151 → 286.
+-- [ ] `/design-control:wireframe <change>` authoring skill (operator-driven + lint-enforced; the
++- [x] `/design-control:wireframe <change>` authoring skill (operator-driven + lint-enforced; the
+       engine `author-wireframe` method is an optional accelerator routed through the same lint).
+-- [ ] Retroactive path: existing surface → `derived` wireframe/spec; **snapshot the auto-derived
++      **Done — 2026-06-10.** `skills/wireframe/SKILL.md` (manual path needs no engine; the
++      accelerator gates on `preflightEngine` and its output is judged by the same lint) +
++      `@/authoring` (`lintWireframeFile` composes the existing pinned pipeline — no parallel lint
++      path) + `bin/check-wireframe` shim (exit contract 0 green / 1 findings-or-error / 2 usage;
++      logic tested as `runCheckWireframe`, the shim only dispatches). TDD: 9 tests RED first.
++- [x] Retroactive path: existing surface → `derived` wireframe/spec; **snapshot the auto-derived
+       draft at derivation time** (stored alongside provenance) so the edit-diff has a baseline;
+       **acceptance of a `derived` artifact requires a recorded operator edit** (non-empty diff
+       between the stored auto-derived snapshot and the accepted version), not just a state
+       transition; does NOT satisfy a "wireframe drove implementation" claim.
++      **Done — 2026-06-10.** `@/provenance` (`recordDerivation` writes snapshot + zod-validated
++      sidecar in one move; `checkDerivedAcceptance` rejects a byte-identical acceptance with
++      `derived-unedited`, fails loud on a tampered baseline via the recorded sha256;
++      `wireframeDroveImplementation` is true only for `driving` mode). TDD: 9 tests RED first.
+ 
+ **Acceptance:** the engine-adapter **preflight fails loud when `/frontend-design` is absent while
+ manual authoring still works**, and the preflight **precedes the first engine-consuming skill**; the
+diff --git a/plugins/design-control/src/__tests__/authoring/lint-file.test.ts b/plugins/design-control/src/__tests__/authoring/lint-file.test.ts
+new file mode 100644
+index 00000000..891ccae0
+--- /dev/null
++++ b/plugins/design-control/src/__tests__/authoring/lint-file.test.ts
+@@ -0,0 +1,105 @@
++import { describe, it, expect, afterEach } from 'vitest';
++import { mkdtempSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
++import { tmpdir } from 'node:os';
++import { join } from 'node:path';
++import { lintWireframeFile, runCheckWireframe } from '@/authoring/lint-file';
++import { SKETCH_KIT_CSS_PATH, SKETCH_KIT_SAMPLE_PATH } from '@/wireframe-kit/sketch-kit';
++
++const dirs: string[] = [];
++afterEach(() => {
++  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
++});
++
++/** Temp wireframe dir seeded with a genuine copy of the shipped kit CSS. */
++function freshDir(): string {
++  const dir = mkdtempSync(join(tmpdir(), 'dc-lint-file-'));
++  dirs.push(dir);
++  copyFileSync(SKETCH_KIT_CSS_PATH, join(dir, 'sketch-kit.css'));
++  return dir;
++}
++
++const cleanPage =
++  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>' +
++  '<link rel="stylesheet" href="sketch-kit.css"></head>' +
++  '<body class="sk sk-theme-grayscale"><div class="sk-banner">WIREFRAME</div>' +
++  '<h1>Entry list</h1></body></html>';
++
++describe('lintWireframeFile', () => {
++  it('passes the shipped example wireframe (pin built against its own dir)', () => {
++    const result = lintWireframeFile(SKETCH_KIT_SAMPLE_PATH);
++    expect(result.findings).toEqual([]);
++    expect(result.ok).toBe(true);
++  });
++
++  it('passes a clean wireframe sitting next to a genuine kit copy', () => {
++    const dir = freshDir();
++    const file = join(dir, 'change.html');
++    writeFileSync(file, cleanPage);
++    expect(lintWireframeFile(file).ok).toBe(true);
++  });
++
++  it('rejects a wireframe with an inline style (same axis-1 lint, not a parallel path)', () => {
++    const dir = freshDir();
++    const file = join(dir, 'change.html');
++    writeFileSync(file, cleanPage.replace('<h1>', '<h1 style="color:red">'));
++    const result = lintWireframeFile(file);
++    expect(result.ok).toBe(false);
++    expect(result.findings.map((f) => f.rule)).toContain('inline-style');
++  });
++
++  it('rejects a wireframe whose kit copy is not the shipped bytes (identity pin enforced)', () => {
++    const dir = freshDir();
++    writeFileSync(join(dir, 'sketch-kit.css'), readFileSync(SKETCH_KIT_CSS_PATH, 'utf8') + '\nh1{color:hotpink}');
++    const file = join(dir, 'change.html');
++    writeFileSync(file, cleanPage);
++    const result = lintWireframeFile(file);
++    expect(result.ok).toBe(false);
++    expect(result.findings.map((f) => f.rule)).toContain('stylesheet-hash-mismatch');
++  });
++
++  it('fails loud on a missing file', () => {
++    expect(() => lintWireframeFile(join(tmpdir(), 'dc-lint-file-does-not-exist.html'))).toThrow(
++      /no such file|does not exist|ENOENT/i,
++    );
++  });
++});
++
++describe('runCheckWireframe (CLI core — exit codes are the bin contract)', () => {
++  function capture(): { out: string[]; err: string[]; io: { out(line: string): void; err(line: string): void } } {
++    const out: string[] = [];
++    const err: string[] = [];
++    return { out, err, io: { out: (l) => out.push(l), err: (l) => err.push(l) } };
++  }
++
++  it('exits 0 and reports clean on a passing wireframe', () => {
++    const dir = freshDir();
++    const file = join(dir, 'change.html');
++    writeFileSync(file, cleanPage);
++    const { io, out } = capture();
++    expect(runCheckWireframe([file], io)).toBe(0);
++    expect(out.join('\n')).toMatch(/0 findings/);
++  });
++
++  it('exits 1 and prints one line per finding on a failing wireframe', () => {
++    const dir = freshDir();
++    const file = join(dir, 'change.html');
++    writeFileSync(file, cleanPage.replace('<h1>', '<h1 style="color:red">'));
++    const { io, err } = capture();
++    expect(runCheckWireframe([file], io)).toBe(1);
++    expect(err.some((l) => l.includes('inline-style'))).toBe(true);
++  });
++
++  it('exits 1 with a descriptive error on a missing file (no fabricated verdict)', () => {
++    const { io, err } = capture();
++    expect(runCheckWireframe([join(tmpdir(), 'dc-nope.html')], io)).toBe(1);
++    expect(err.join('\n')).toMatch(/no such file|does not exist|ENOENT/i);
++  });
++
++  it('exits 2 on usage error (no argument / extra arguments)', () => {
++    const a = capture();
++    expect(runCheckWireframe([], a.io)).toBe(2);
++    expect(a.err.join('\n')).toMatch(/usage/i);
++    const b = capture();
++    expect(runCheckWireframe(['x.html', 'y.html'], b.io)).toBe(2);
++  });
++});
+diff --git a/plugins/design-control/src/__tests__/provenance/cli.test.ts b/plugins/design-control/src/__tests__/provenance/cli.test.ts
+new file mode 100644
+index 00000000..2abb16c1
+--- /dev/null
++++ b/plugins/design-control/src/__tests__/provenance/cli.test.ts
+@@ -0,0 +1,242 @@
++import { describe, it, expect, afterEach } from 'vitest';
++import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
++import { tmpdir } from 'node:os';
++import { join } from 'node:path';
++import { runWireframeProvenance } from '@/provenance/cli';
++import { loadProvenance, recordDerivation, recordDrivingWireframe } from '@/provenance/derived';
++import type { CliIo } from '@/authoring/lint-file';
++
++const dirs: string[] = [];
++afterEach(() => {
++  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
++});
++
++function freshDir(): string {
++  const dir = mkdtempSync(join(tmpdir(), 'dc-prov-cli-'));
++  dirs.push(dir);
++  return dir;
++}
++
++const draftHtml =
++  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>' +
++  '<link rel="stylesheet" href="sketch-kit.css"></head>' +
++  '<body class="sk sk-theme-grayscale"><h1>Entry list</h1></body></html>';
++
++function capture(): { out: string[]; err: string[]; io: CliIo } {
++  const out: string[] = [];
++  const err: string[] = [];
++  return { out, err, io: { out: (l) => out.push(l), err: (l) => err.push(l) } };
++}
++
++describe('runWireframeProvenance — record-driving', () => {
++  it('exits 0 and writes the driving sidecar for an on-disk wireframe', () => {
++    const dir = freshDir();
++    writeFileSync(join(dir, 'surface-a.html'), draftHtml);
++    const { io, out } = capture();
++    expect(runWireframeProvenance(['record-driving', dir, 'surface-a', 'surface-a.html'], io)).toBe(0);
++    const prov = loadProvenance(dir, 'surface-a');
++    expect(prov.mode).toBe('driving');
++    expect(out.join('\n')).toMatch(/driving/i);
++  });
++
++  it('exits 1 with a descriptive error when the wireframe file is missing', () => {
++    const dir = freshDir();
++    const { io, err } = capture();
++    expect(runWireframeProvenance(['record-driving', dir, 'ghost', 'ghost.html'], io)).toBe(1);
++    expect(err.join('\n')).toMatch(/does not exist/i);
++    expect(readdirSync(dir)).toEqual([]);
++  });
++
++  it('exits 1 on the append-once refusal (existing sidecar, any mode)', () => {
++    const dir = freshDir();
++    writeFileSync(join(dir, 'taken.html'), draftHtml);
++    recordDerivation({ dir, surfaceId: 'taken', derivedHtml: draftHtml, source: 'live surface' });
++    const { io, err } = capture();
++    expect(runWireframeProvenance(['record-driving', dir, 'taken', 'taken.html'], io)).toBe(1);
++    expect(err.join('\n')).toMatch(/append-once/i);
++  });
++
++  it('exits 1 on a non-portable surfaceId, naming the constraint', () => {
++    const dir = freshDir();
++    writeFileSync(join(dir, 'w.html'), draftHtml);
++    const { io, err } = capture();
++    expect(runWireframeProvenance(['record-driving', dir, '../escape', 'w.html'], io)).toBe(1);
++    expect(err.join('\n')).toMatch(/portable-filename/i);
++  });
++});
++
++describe('runWireframeProvenance — record-derived', () => {
++  it('exits 0, reading the draft from --from and committing snapshot + sidecar', () => {
++    const dir = freshDir();
++    const draftFile = join(freshDir(), 'draft.html');
++    writeFileSync(draftFile, draftHtml);
++    const { io, out } = capture();
++    expect(
++      runWireframeProvenance(
++        ['record-derived', dir, 'surface-d', 'route /dev/studio', '--from', draftFile],
++        io,
++      ),
++    ).toBe(0);
++    const prov = loadProvenance(dir, 'surface-d');
++    expect(prov.mode).toBe('derived');
++    if (prov.mode !== 'derived') throw new Error('unreachable');
++    expect(prov.derived.source).toBe('route /dev/studio');
++    expect(readFileSync(join(dir, 'surface-d.derived-snapshot.html'), 'utf8')).toBe(draftHtml);
++    expect(out.join('\n')).toMatch(/derived/i);
++  });
++
++  it('exits 1 with a descriptive error when the --from draft file cannot be read', () => {
++    const dir = freshDir();
++    const { io, err } = capture();
++    expect(
++      runWireframeProvenance(
++        ['record-derived', dir, 'surface-d', 'live surface', '--from', join(dir, 'nope.html')],
++        io,
++      ),
++    ).toBe(1);
++    expect(err.join('\n')).toMatch(/no such file|does not exist|ENOENT/i);
++    expect(readdirSync(dir)).toEqual([]);
++  });
++
++  it('exits 1 on the append-once refusal over an existing record', () => {
++    const dir = freshDir();
++    writeFileSync(join(dir, 'existing.html'), draftHtml);
++    recordDrivingWireframe({ dir, surfaceId: 'existing', wireframeFile: 'existing.html' });
++    const draftFile = join(freshDir(), 'draft.html');
++    writeFileSync(draftFile, draftHtml);
++    const { io, err } = capture();
++    expect(
++      runWireframeProvenance(
++        ['record-derived', dir, 'existing', 'live surface', '--from', draftFile],
++        io,
++      ),
++    ).toBe(1);
++    expect(err.join('\n')).toMatch(/append-once/i);
++  });
++
++  it('exits 2 with usage when the --from flag is misspelled or missing', () => {
++    const dir = freshDir();
++    const a = capture();
++    expect(
++      runWireframeProvenance(['record-derived', dir, 's', 'src', '--form', 'x.html'], a.io),
++    ).toBe(2);
++    expect(a.err.join('\n')).toMatch(/usage/i);
++    const b = capture();
++    expect(runWireframeProvenance(['record-derived', dir, 's', 'src'], b.io)).toBe(2);
++    expect(b.err.join('\n')).toMatch(/usage/i);
++  });
++});
++
++describe('runWireframeProvenance — check-acceptance', () => {
++  it('exits 0 when the accepted artifact carries a non-empty edit against the snapshot', () => {
++    const dir = freshDir();
++    recordDerivation({ dir, surfaceId: 's1', derivedHtml: draftHtml, source: 'live surface' });
++    const accepted = join(freshDir(), 'accepted.html');
++    writeFileSync(accepted, draftHtml.replace('Entry list', 'Entry list, regrouped'));
++    const { io, out } = capture();
++    expect(runWireframeProvenance(['check-acceptance', dir, 's1', accepted], io)).toBe(0);
++    expect(out.join('\n')).toMatch(/ok|accept/i);
++  });
++
++  it('exits 1 with the derived-unedited finding on stderr for a byte-identical artifact', () => {
++    const dir = freshDir();
++    recordDerivation({ dir, surfaceId: 's1', derivedHtml: draftHtml, source: 'live surface' });
++    const accepted = join(freshDir(), 'accepted.html');
++    writeFileSync(accepted, draftHtml);
++    const { io, err } = capture();
++    expect(runWireframeProvenance(['check-acceptance', dir, 's1', accepted], io)).toBe(1);
++    expect(err.join('\n')).toMatch(/derived-unedited/);
++  });
++
++  it('exits 1 with a descriptive error on a tampered baseline (hash mismatch throws)', () => {
++    const dir = freshDir();
++    recordDerivation({ dir, surfaceId: 's1', derivedHtml: draftHtml, source: 'live surface' });
++    writeFileSync(join(dir, 's1.derived-snapshot.html'), draftHtml + '<!-- tampered -->');
++    const accepted = join(freshDir(), 'accepted.html');
++    writeFileSync(accepted, draftHtml + '<edit>');
++    const { io, err } = capture();
++    expect(runWireframeProvenance(['check-acceptance', dir, 's1', accepted], io)).toBe(1);
++    expect(err.join('\n')).toMatch(/hash|baseline|derivation/i);
++  });
++
++  it('exits 1 with a descriptive error when the accepted-artifact file cannot be read', () => {
++    const dir = freshDir();
++    recordDerivation({ dir, surfaceId: 's1', derivedHtml: draftHtml, source: 'live surface' });
++    const { io, err } = capture();
++    expect(
++      runWireframeProvenance(['check-acceptance', dir, 's1', join(dir, 'absent.html')], io),
++    ).toBe(1);
++    expect(err.join('\n')).toMatch(/no such file|does not exist|ENOENT/i);
++  });
++
++  it('exits 0 for a driving record (the gate is mode-scoped)', () => {
++    const dir = freshDir();
++    writeFileSync(join(dir, 'w.html'), draftHtml);
++    recordDrivingWireframe({ dir, surfaceId: 'fresh', wireframeFile: 'w.html' });
++    const accepted = join(freshDir(), 'accepted.html');
++    writeFileSync(accepted, draftHtml);
++    const { io } = capture();
++    expect(runWireframeProvenance(['check-acceptance', dir, 'fresh', accepted], io)).toBe(0);
++  });
++});
++
++describe('runWireframeProvenance — verify-driving', () => {
++  it('exits 0 when the bound wireframe still matches the recorded hash', () => {
++    const dir = freshDir();
++    writeFileSync(join(dir, 'intact.html'), draftHtml);
++    recordDrivingWireframe({ dir, surfaceId: 'intact', wireframeFile: 'intact.html' });
++    const { io, out } = capture();
++    expect(runWireframeProvenance(['verify-driving', dir, 'intact'], io)).toBe(0);
++    expect(out.join('\n')).toMatch(/verified/i);
++  });
++
++  it('exits 1 with a descriptive error on a hash mismatch (artifact replaced after recording)', () => {
++    const dir = freshDir();
++    writeFileSync(join(dir, 'swapped.html'), draftHtml);
++    recordDrivingWireframe({ dir, surfaceId: 'swapped', wireframeFile: 'swapped.html' });
++    writeFileSync(join(dir, 'swapped.html'), draftHtml + '<!-- replaced -->');
++    const { io, err } = capture();
++    expect(runWireframeProvenance(['verify-driving', dir, 'swapped'], io)).toBe(1);
++    expect(err.join('\n')).toMatch(/hash|modified|replaced/i);
++  });
++
++  it('exits 1 when the surface has no provenance sidecar', () => {
++    const { io, err } = capture();
++    expect(runWireframeProvenance(['verify-driving', freshDir(), 'absent'], io)).toBe(1);
++    expect(err.join('\n')).toMatch(/no provenance sidecar/i);
++  });
++
++  it('exits 1 on a derived record (mode mismatch — derived never certifies the claim)', () => {
++    const dir = freshDir();
++    recordDerivation({ dir, surfaceId: 'rev', derivedHtml: draftHtml, source: 'live surface' });
++    const { io, err } = capture();
++    expect(runWireframeProvenance(['verify-driving', dir, 'rev'], io)).toBe(1);
++    expect(err.join('\n')).toMatch(/derived/i);
++  });
++});
++
++describe('runWireframeProvenance — usage errors', () => {
++  it('exits 2 with usage on an unknown subcommand', () => {
++    const { io, err } = capture();
++    expect(runWireframeProvenance(['frobnicate', 'a', 'b'], io)).toBe(2);
++    expect(err.join('\n')).toMatch(/usage/i);
++  });
++
++  it('exits 2 with usage when no subcommand is given', () => {
++    const { io, err } = capture();
++    expect(runWireframeProvenance([], io)).toBe(2);
++    expect(err.join('\n')).toMatch(/usage/i);
++  });
++
++  it.each([
++    [['record-driving', 'dir', 'id']],
++    [['record-driving', 'dir', 'id', 'f.html', 'extra']],
++    [['check-acceptance', 'dir', 'id']],
++    [['verify-driving', 'dir']],
++    [['verify-driving', 'dir', 'id', 'extra']],
++  ])('exits 2 with usage on wrong arity: %j', (argv) => {
++    const { io, err } = capture();
++    expect(runWireframeProvenance(argv, io)).toBe(2);
++    expect(err.join('\n')).toMatch(/usage/i);
++  });
++});
+diff --git a/plugins/design-control/src/__tests__/provenance/derived.test.ts b/plugins/design-control/src/__tests__/provenance/derived.test.ts
+new file mode 100644
+index 00000000..3258abf1
+--- /dev/null
++++ b/plugins/design-control/src/__tests__/provenance/derived.test.ts
+@@ -0,0 +1,478 @@
++import { describe, it, expect, afterEach } from 'vitest';
++import {
++  copyFileSync,
++  existsSync,
++  mkdirSync,
++  mkdtempSync,
++  readFileSync,
++  writeFileSync,
++  rmSync,
++  readdirSync,
++  statSync,
++} from 'node:fs';
++import { tmpdir } from 'node:os';
++import { join } from 'node:path';
++import {
++  recordDerivation,
++  loadProvenance,
++  checkDerivedAcceptance,
++  wireframeDroveImplementation,
++  recordDrivingWireframe,
++  verifyDrivingWireframe,
++} from '@/provenance/derived';
++
++const dirs: string[] = [];
++afterEach(() => {
++  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
++});
++
++function freshDir(): string {
++  const dir = mkdtempSync(join(tmpdir(), 'dc-prov-'));
++  dirs.push(dir);
++  return dir;
++}
++
++const draftHtml =
++  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>' +
++  '<link rel="stylesheet" href="sketch-kit.css"></head>' +
++  '<body class="sk sk-theme-grayscale"><h1>Derived from live surface</h1></body></html>';
++
++/** Write a lint-green-stand-in wireframe file into dir; returns its filename. */
++function writeWireframe(dir: string, name = 'wireframe.html', html = draftHtml): string {
++  writeFileSync(join(dir, name), html);
++  return name;
++}
++
++describe('recordDerivation', () => {
++  it('writes the auto-derived snapshot AND the provenance sidecar at derivation time', () => {
++    const dir = freshDir();
++    const prov = recordDerivation({
++      dir,
++      surfaceId: 'studio-content-browser',
++      derivedHtml: draftHtml,
++      source: 'http://localhost:4321/dev/editorial-studio',
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    expect(prov.mode).toBe('derived');
++    const names = readdirSync(dir);
++    expect(names).toContain('studio-content-browser.derived-snapshot.html');
++    expect(names).toContain('studio-content-browser.provenance.json');
++    expect(readFileSync(join(dir, 'studio-content-browser.derived-snapshot.html'), 'utf8')).toBe(draftHtml);
++  });
++
++  it('round-trips through loadProvenance (zod-validated)', () => {
++    const dir = freshDir();
++    recordDerivation({
++      dir,
++      surfaceId: 'scrapbook-drawer',
++      derivedHtml: draftHtml,
++      source: 'route /dev/scrapbook',
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    const prov = loadProvenance(dir, 'scrapbook-drawer');
++    expect(prov.surfaceId).toBe('scrapbook-drawer');
++    expect(prov.mode).toBe('derived');
++    if (prov.mode !== 'derived') throw new Error('unreachable');
++    expect(prov.derived.source).toBe('route /dev/scrapbook');
++    expect(prov.derived.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
++  });
++});
++
++describe('recordDerivation — all-or-nothing commit (no half-state when a write fails)', () => {
++  it('leaves NEITHER a committed sidecar NOR a committed snapshot when the snapshot write fails', () => {
++    const dir = freshDir();
++    // Deterministic, portable second-write failure: a DIRECTORY planted at the
++    // snapshot target path makes any attempt to place a file there (write or
++    // rename-promote) throw on every platform.
++    mkdirSync(join(dir, 'half.derived-snapshot.html'));
++
++    expect(() =>
++      recordDerivation({
++        dir,
++        surfaceId: 'half',
++        derivedHtml: draftHtml,
++        source: 'live surface',
++        createdAt: new Date('2026-06-10T12:00:00Z'),
++      }),
++    ).toThrow();
++
++    // No committed sidecar may survive the failed pairing — loadProvenance
++    // must fail loud (absent sidecar), not return a record whose snapshot
++    // does not exist.
++    expect(existsSync(join(dir, 'half.provenance.json'))).toBe(false);
++    expect(() => loadProvenance(dir, 'half')).toThrow(/no provenance sidecar/i);
++
++    // The planted blocker is still the directory (no snapshot FILE was
++    // committed over it), and no temp-suffixed staging debris lingers.
++    expect(statSync(join(dir, 'half.derived-snapshot.html')).isDirectory()).toBe(true);
++    expect(readdirSync(dir).filter((n) => n !== 'half.derived-snapshot.html')).toEqual([]);
++  });
++
++  it('happy path commits exactly the sidecar + snapshot pair, with no staging debris', () => {
++    const dir = freshDir();
++    recordDerivation({
++      dir,
++      surfaceId: 'clean',
++      derivedHtml: draftHtml,
++      source: 'live surface',
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    expect(readdirSync(dir).sort()).toEqual([
++      'clean.derived-snapshot.html',
++      'clean.provenance.json',
++    ]);
++    expect(readFileSync(join(dir, 'clean.derived-snapshot.html'), 'utf8')).toBe(draftHtml);
++    const prov = loadProvenance(dir, 'clean');
++    expect(prov.mode).toBe('derived');
++    if (prov.mode !== 'derived') throw new Error('unreachable');
++    expect(prov.derived.snapshotFile).toBe('clean.derived-snapshot.html');
++    expect(prov.derived.source).toBe('live surface');
++  });
++});
++
++describe('loadProvenance fail-loud paths', () => {
++  it('throws a descriptive error when the sidecar is missing', () => {
++    expect(() => loadProvenance(freshDir(), 'nope')).toThrow(/provenance/i);
++  });
++
++  it('throws on a malformed sidecar (no silent fallback)', () => {
++    const dir = freshDir();
++    writeFileSync(join(dir, 'bad.provenance.json'), '{"mode":"derived"}');
++    expect(() => loadProvenance(dir, 'bad')).toThrow();
++  });
++
++  it('throws, naming BOTH ids, when the sidecar inner surfaceId does not match the requested one', () => {
++    const dir = freshDir();
++    recordDerivation({
++      dir,
++      surfaceId: 'surface-alpha',
++      derivedHtml: draftHtml,
++      source: 'live surface',
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    // Simulate a sidecar copied/renamed to another surface's filename: beta has
++    // no record of its own, but alpha's sidecar now sits at beta's path.
++    copyFileSync(
++      join(dir, 'surface-alpha.provenance.json'),
++      join(dir, 'surface-beta.provenance.json'),
++    );
++    expect(() => loadProvenance(dir, 'surface-beta')).toThrow(
++      /surface-beta[\s\S]*surface-alpha|surface-alpha[\s\S]*surface-beta/,
++    );
++  });
++});
++
++describe('checkDerivedAcceptance — acceptance requires a recorded operator edit', () => {
++  it('rejects a byte-identical accepted artifact (state transition alone is not an edit)', () => {
++    const dir = freshDir();
++    recordDerivation({
++      dir,
++      surfaceId: 's1',
++      derivedHtml: draftHtml,
++      source: 'live surface',
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    const result = checkDerivedAcceptance(dir, 's1', draftHtml);
++    expect(result.ok).toBe(false);
++    expect(result.findings.map((f) => f.rule)).toContain('derived-unedited');
++  });
++
++  it('accepts once the operator edit produces a non-empty diff against the stored snapshot', () => {
++    const dir = freshDir();
++    recordDerivation({
++      dir,
++      surfaceId: 's1',
++      derivedHtml: draftHtml,
++      source: 'live surface',
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    const edited = draftHtml.replace('Derived from live surface', 'Entry list, regrouped by lane');
++    expect(checkDerivedAcceptance(dir, 's1', edited).ok).toBe(true);
++  });
++
++  it('fails loud when the stored snapshot was tampered after recording (hash mismatch)', () => {
++    const dir = freshDir();
++    recordDerivation({
++      dir,
++      surfaceId: 's1',
++      derivedHtml: draftHtml,
++      source: 'live surface',
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    writeFileSync(join(dir, 's1.derived-snapshot.html'), draftHtml + '<!-- tampered -->');
++    expect(() => checkDerivedAcceptance(dir, 's1', 'whatever')).toThrow(/snapshot|hash/i);
++  });
++
++  it('does not gate a driving wireframe (the derived gate is mode-scoped)', () => {
++    const dir = freshDir();
++    recordDrivingWireframe({
++      dir,
++      surfaceId: 'fresh',
++      wireframeFile: writeWireframe(dir),
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    expect(checkDerivedAcceptance(dir, 'fresh', draftHtml).ok).toBe(true);
++  });
++});
++
++describe('surfaceId filename validation — path-traversal and separator rejection', () => {
++  const hostileIds = ['../escape', '..', 'a/b', 'nested/../../etc', 'a\\b', 'space id', ''];
++
++  it.each(hostileIds)('recordDrivingWireframe rejects %j with an error naming the constraint', (id) => {
++    const dir = freshDir();
++    expect(() =>
++      recordDrivingWireframe({ dir, surfaceId: id, wireframeFile: writeWireframe(dir) }),
++    ).toThrow(/portable-filename|\^\[a-z0-9\]/i);
++  });
++
++  it.each(hostileIds)('recordDerivation rejects %j without writing any file', (id) => {
++    const dir = freshDir();
++    expect(() =>
++      recordDerivation({ dir, surfaceId: id, derivedHtml: draftHtml, source: 'live surface' }),
++    ).toThrow(/portable-filename|\^\[a-z0-9\]/i);
++    expect(readdirSync(dir)).toEqual([]);
++  });
++
++  it.each(hostileIds)('loadProvenance rejects %j before touching the filesystem', (id) => {
++    expect(() => loadProvenance(freshDir(), id)).toThrow(/portable-filename|\^\[a-z0-9\]/i);
++  });
++
++  it('rejects a bare ".." specifically — the pattern requires an alphanumeric first character', () => {
++    // /^[a-z0-9][a-z0-9._-]*$/i cannot match '..' because '.' fails the [a-z0-9] start anchor.
++    const dir = freshDir();
++    expect(() =>
++      recordDrivingWireframe({ dir, surfaceId: '..', wireframeFile: writeWireframe(dir) }),
++    ).toThrow(/portable-filename|\^\[a-z0-9\]/i);
++  });
++
++  it('the zod schema rejects a sidecar whose stored surfaceId is non-portable (load-side defense)', () => {
++    const dir = freshDir();
++    const hostile = {
++      version: 1,
++      surfaceId: '../escape',
++      mode: 'driving',
++      createdAt: '2026-06-10T12:00:00.000Z',
++    };
++    writeFileSync(join(dir, 'planted.provenance.json'), JSON.stringify(hostile));
++    expect(() => loadProvenance(dir, 'planted')).toThrow();
++  });
++
++  it('still accepts a normal kebab-case id (and dots/underscores after the first char)', () => {
++    const dir = freshDir();
++    recordDrivingWireframe({
++      dir,
++      surfaceId: 'studio-content_browser.v2',
++      wireframeFile: writeWireframe(dir),
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    expect(loadProvenance(dir, 'studio-content_browser.v2').surfaceId).toBe(
++      'studio-content_browser.v2',
++    );
++  });
++});
++
++describe('wireframeDroveImplementation', () => {
++  it('is true for a driving wireframe and FALSE for a derived one (even an accepted one)', () => {
++    const dir = freshDir();
++    const derived = recordDerivation({
++      dir,
++      surfaceId: 'd',
++      derivedHtml: draftHtml,
++      source: 'live surface',
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    const driving = recordDrivingWireframe({
++      dir,
++      surfaceId: 'w',
++      wireframeFile: writeWireframe(dir),
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    expect(wireframeDroveImplementation(derived)).toBe(false);
++    expect(wireframeDroveImplementation(driving)).toBe(true);
++  });
++});
++
++describe('recordDrivingWireframe — binds the wireframe artifact by filename + hash', () => {
++  it('records driving.wireframeFile and a sha256 hex of the wireframe bytes', () => {
++    const dir = freshDir();
++    const wireframeFile = writeWireframe(dir, 'studio-content-browser.html');
++    const prov = recordDrivingWireframe({
++      dir,
++      surfaceId: 'studio-content-browser',
++      wireframeFile,
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    expect(prov.mode).toBe('driving');
++    if (prov.mode !== 'driving') throw new Error('unreachable');
++    expect(prov.driving.wireframeFile).toBe('studio-content-browser.html');
++    expect(prov.driving.wireframeSha256).toMatch(/^[0-9a-f]{64}$/);
++  });
++
++  it('round-trips the driving binding through loadProvenance (zod-validated)', () => {
++    const dir = freshDir();
++    recordDrivingWireframe({
++      dir,
++      surfaceId: 'wf-bound',
++      wireframeFile: writeWireframe(dir, 'wf-bound.html'),
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    const prov = loadProvenance(dir, 'wf-bound');
++    expect(prov.mode).toBe('driving');
++    if (prov.mode !== 'driving') throw new Error('unreachable');
++    expect(prov.driving.wireframeFile).toBe('wf-bound.html');
++    expect(prov.driving.wireframeSha256).toMatch(/^[0-9a-f]{64}$/);
++  });
++
++  it('fails loud when the named wireframe file does not exist at record time', () => {
++    const dir = freshDir();
++    expect(() =>
++      recordDrivingWireframe({ dir, surfaceId: 'ghost', wireframeFile: 'ghost.html' }),
++    ).toThrow(/wireframe/i);
++    expect(readdirSync(dir)).toEqual([]);
++  });
++});
++
++describe('overwrite refusal — an existing record can never be silently re-recorded', () => {
++  it('refuses recordDrivingWireframe over an existing derived record (the laundering direction)', () => {
++    const dir = freshDir();
++    recordDerivation({
++      dir,
++      surfaceId: 'laundered',
++      derivedHtml: draftHtml,
++      source: 'live surface',
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    const wireframeFile = writeWireframe(dir, 'laundered.html');
++    expect(() =>
++      recordDrivingWireframe({ dir, surfaceId: 'laundered', wireframeFile }),
++    ).toThrow(/laundered[\s\S]*derived[\s\S]*(remov|supersed)/i);
++  });
++
++  it('refuses recordDerivation over an existing driving record', () => {
++    const dir = freshDir();
++    recordDrivingWireframe({
++      dir,
++      surfaceId: 'flipped',
++      wireframeFile: writeWireframe(dir, 'flipped.html'),
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    expect(() =>
++      recordDerivation({ dir, surfaceId: 'flipped', derivedHtml: draftHtml, source: 'live surface' }),
++    ).toThrow(/flipped[\s\S]*driving[\s\S]*(remov|supersed)/i);
++  });
++
++  it('refuses a same-mode driving re-record', () => {
++    const dir = freshDir();
++    const wireframeFile = writeWireframe(dir, 'rerecord.html');
++    recordDrivingWireframe({
++      dir,
++      surfaceId: 'rerecord',
++      wireframeFile,
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    expect(() =>
++      recordDrivingWireframe({ dir, surfaceId: 'rerecord', wireframeFile }),
++    ).toThrow(/rerecord[\s\S]*driving[\s\S]*(remov|supersed)/i);
++  });
++
++  it('refuses a same-mode derived re-record', () => {
++    const dir = freshDir();
++    recordDerivation({
++      dir,
++      surfaceId: 'rederive',
++      derivedHtml: draftHtml,
++      source: 'live surface',
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    expect(() =>
++      recordDerivation({
++        dir,
++        surfaceId: 'rederive',
++        derivedHtml: draftHtml + '<!-- second derivation -->',
++        source: 'another surface',
++      }),
++    ).toThrow(/rederive[\s\S]*derived[\s\S]*(remov|supersed)/i);
++  });
++
++  it('leaves the existing sidecar AND snapshot byte-identical after a refused overwrite', () => {
++    const dir = freshDir();
++    recordDerivation({
++      dir,
++      surfaceId: 'baseline',
++      derivedHtml: draftHtml,
++      source: 'live surface',
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    const sidecarBefore = readFileSync(join(dir, 'baseline.provenance.json'), 'utf8');
++    const snapshotBefore = readFileSync(join(dir, 'baseline.derived-snapshot.html'), 'utf8');
++
++    const wireframeFile = writeWireframe(dir, 'baseline.html');
++    expect(() =>
++      recordDrivingWireframe({ dir, surfaceId: 'baseline', wireframeFile }),
++    ).toThrow();
++    expect(() =>
++      recordDerivation({
++        dir,
++        surfaceId: 'baseline',
++        derivedHtml: draftHtml + '<!-- would replace the snapshot -->',
++        source: 'second derivation',
++      }),
++    ).toThrow();
++
++    expect(readFileSync(join(dir, 'baseline.provenance.json'), 'utf8')).toBe(sidecarBefore);
++    expect(readFileSync(join(dir, 'baseline.derived-snapshot.html'), 'utf8')).toBe(snapshotBefore);
++  });
++});
++
++describe('verifyDrivingWireframe — tamper-checks the bound artifact like checkDerivedAcceptance', () => {
++  it('returns the provenance when the wireframe bytes still match the recorded hash', () => {
++    const dir = freshDir();
++    recordDrivingWireframe({
++      dir,
++      surfaceId: 'intact',
++      wireframeFile: writeWireframe(dir, 'intact.html'),
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    const prov = verifyDrivingWireframe(dir, 'intact');
++    expect(prov.mode).toBe('driving');
++    expect(prov.surfaceId).toBe('intact');
++  });
++
++  it('throws when the wireframe bytes were replaced after recording (hash mismatch)', () => {
++    const dir = freshDir();
++    const wireframeFile = writeWireframe(dir, 'swapped.html');
++    recordDrivingWireframe({
++      dir,
++      surfaceId: 'swapped',
++      wireframeFile,
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    writeFileSync(join(dir, wireframeFile), draftHtml + '<!-- wholesale replacement -->');
++    expect(() => verifyDrivingWireframe(dir, 'swapped')).toThrow(/hash|wireframe/i);
++  });
++
++  it('throws when the bound wireframe file has gone missing', () => {
++    const dir = freshDir();
++    const wireframeFile = writeWireframe(dir, 'vanished.html');
++    recordDrivingWireframe({
++      dir,
++      surfaceId: 'vanished',
++      wireframeFile,
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    rmSync(join(dir, wireframeFile));
++    expect(() => verifyDrivingWireframe(dir, 'vanished')).toThrow(/wireframe/i);
++  });
++
++  it('throws on a derived record — a derived artifact never certifies the driving claim', () => {
++    const dir = freshDir();
++    recordDerivation({
++      dir,
++      surfaceId: 'reverse-engineered',
++      derivedHtml: draftHtml,
++      source: 'live surface',
++      createdAt: new Date('2026-06-10T12:00:00Z'),
++    });
++    expect(() => verifyDrivingWireframe(dir, 'reverse-engineered')).toThrow(/driving|derived/i);
++  });
++});
+diff --git a/plugins/design-control/src/authoring/check-wireframe-cli.ts b/plugins/design-control/src/authoring/check-wireframe-cli.ts
+new file mode 100644
+index 00000000..3838653a
+--- /dev/null
++++ b/plugins/design-control/src/authoring/check-wireframe-cli.ts
+@@ -0,0 +1,12 @@
++/**
++ * Process entry for `bin/check-wireframe`. All behavior lives in
++ * {@link runCheckWireframe} (tested directly); this file only wires argv and
++ * the process exit code.
++ */
++
++import { runCheckWireframe } from '@/authoring/lint-file';
++
++process.exitCode = runCheckWireframe(process.argv.slice(2), {
++  out: (line) => console.log(line),
++  err: (line) => console.error(line),
++});
+diff --git a/plugins/design-control/src/authoring/index.ts b/plugins/design-control/src/authoring/index.ts
+new file mode 100644
+index 00000000..c6773979
+--- /dev/null
++++ b/plugins/design-control/src/authoring/index.ts
+@@ -0,0 +1,5 @@
++/**
++ * Public surface of the wireframe-authoring path. Import via `@/authoring`.
++ */
++
++export { type CliIo, lintWireframeFile, runCheckWireframe } from '@/authoring/lint-file';
+diff --git a/plugins/design-control/src/authoring/lint-file.ts b/plugins/design-control/src/authoring/lint-file.ts
+new file mode 100644
+index 00000000..310dc89c
+--- /dev/null
++++ b/plugins/design-control/src/authoring/lint-file.ts
+@@ -0,0 +1,68 @@
++/**
++ * File-level entry to the `check-mockup-lofi` lint — the enforcement seam the
++ * `/design-control:wireframe` authoring skill (and the `bin/check-wireframe`
++ * shim) route EVERY wireframe draft through, manual or engine-authored alike.
++ *
++ * This is deliberately a thin composition of the existing axes — axis 1
++ * (element/attribute allowlist) + axis 1.5 (stylesheet identity pin) + the
++ * codepoint allowlist — via `lintWireframe`. No parallel lint path: the skill
++ * and the library agree by construction because they call the same pipeline.
++ */
++
++import { readFileSync } from 'node:fs';
++import { dirname, resolve } from 'node:path';
++import { lintWireframe } from '@/lint/check-mockup-lofi';
++import { buildSketchKitPin } from '@/lint/stylesheet-pin';
++import type { LintResult } from '@/lint/types';
++
++/**
++ * Lint a wireframe FILE: read it, build the sketch-kit identity pin against the
++ * file's own directory (the conventional layout — the kit copy sits next to the
++ * wireframe), and run the full pinned lint. Fails loud on an unreadable file —
++ * a missing wireframe is an error, never a clean verdict.
++ */
++export function lintWireframeFile(filePath: string): LintResult {
++  const absolute = resolve(filePath);
++  const html = readFileSync(absolute, 'utf8');
++  return lintWireframe(html, { stylesheetPin: buildSketchKitPin(dirname(absolute)) });
++}
++
++/** Line-oriented output sink, injected so the CLI core is testable as a function. */
++export interface CliIo {
++  out(line: string): void;
++  err(line: string): void;
++}
++
++const USAGE = 'usage: check-wireframe <wireframe.html>';
++
++/**
++ * CLI core behind `bin/check-wireframe`. Exit-code contract (the skill's gate):
++ *   0 — lint green (zero findings)
++ *   1 — findings present, or the file could not be read (descriptive error;
++ *       never a fabricated verdict)
++ *   2 — usage error
++ */
++export function runCheckWireframe(argv: readonly string[], io: CliIo): number {
++  if (argv.length !== 1) {
++    io.err(USAGE);
++    return 2;
++  }
++  const filePath = argv[0];
++  let result: LintResult;
++  try {
++    result = lintWireframeFile(filePath);
++  } catch (error) {
++    io.err(error instanceof Error ? error.message : String(error));
++    return 1;
++  }
++  if (result.ok) {
++    io.out(`${filePath}: lint green — 0 findings`);
++    return 0;
++  }
++  for (const finding of result.findings) {
++    const where = [finding.tag, finding.attr].filter(Boolean).join(' ');
++    io.err(`${finding.rule}${where ? ` (${where})` : ''}: ${finding.message}`);
++  }
++  io.err(`${filePath}: ${result.findings.length} finding(s)`);
++  return 1;
++}
+diff --git a/plugins/design-control/src/provenance/cli.ts b/plugins/design-control/src/provenance/cli.ts
+new file mode 100644
+index 00000000..4f6e022a
+--- /dev/null
++++ b/plugins/design-control/src/provenance/cli.ts
+@@ -0,0 +1,120 @@
++/**
++ * CLI core behind `bin/wireframe-provenance` — the executable firing surface
++ * for the provenance recorders and gates (AUDIT-20260611-03). Mirrors the lint
++ * seam (`bin/check-wireframe` → `check-wireframe-cli.ts` → tested
++ * `runCheckWireframe`): all behavior lives here, tested as a function; the
++ * process entry only wires argv and the exit code.
++ *
++ * Subcommands (exit codes: 0 success/ok, 1 refusal or error, 2 usage):
++ *   record-driving   <dir> <surfaceId> <wireframeFile>
++ *   record-derived   <dir> <surfaceId> <source> --from <derivedHtmlFile>
++ *   check-acceptance <dir> <surfaceId> <acceptedHtmlFile>
++ *   verify-driving   <dir> <surfaceId>
++ */
++
++import { readFileSync } from 'node:fs';
++import type { CliIo } from '@/authoring/lint-file';
++import {
++  checkDerivedAcceptance,
++  recordDerivation,
++  recordDrivingWireframe,
++  verifyDrivingWireframe,
++} from '@/provenance/derived';
++
++const USAGE = [
++  'usage: wireframe-provenance <subcommand> ...',
++  '  record-driving   <dir> <surfaceId> <wireframeFile>',
++  '  record-derived   <dir> <surfaceId> <source> --from <derivedHtmlFile>',
++  '  check-acceptance <dir> <surfaceId> <acceptedHtmlFile>',
++  '  verify-driving   <dir> <surfaceId>',
++];
++
++function printUsage(io: CliIo): number {
++  for (const line of USAGE) io.err(line);
++  return 2;
++}
++
++function printError(io: CliIo, error: unknown): number {
++  io.err(error instanceof Error ? error.message : String(error));
++  return 1;
++}
++
++function runRecordDriving(args: readonly string[], io: CliIo): number {
++  if (args.length !== 3) return printUsage(io);
++  const [dir, surfaceId, wireframeFile] = args;
++  try {
++    recordDrivingWireframe({ dir, surfaceId, wireframeFile });
++  } catch (error) {
++    return printError(io, error);
++  }
++  io.out(`Recorded driving provenance for surface "${surfaceId}" (wireframe ${wireframeFile}).`);
++  return 0;
++}
++
++function runRecordDerived(args: readonly string[], io: CliIo): number {
++  if (args.length !== 5 || args[3] !== '--from') return printUsage(io);
++  const [dir, surfaceId, source, , derivedHtmlFile] = args;
++  try {
++    const derivedHtml = readFileSync(derivedHtmlFile, 'utf8');
++    recordDerivation({ dir, surfaceId, derivedHtml, source });
++  } catch (error) {
++    return printError(io, error);
++  }
++  io.out(
++    `Recorded derived provenance for surface "${surfaceId}" (snapshot + sidecar committed; ` +
++      `source: ${source}).`,
++  );
++  return 0;
++}
++
++function runCheckAcceptance(args: readonly string[], io: CliIo): number {
++  if (args.length !== 3) return printUsage(io);
++  const [dir, surfaceId, acceptedHtmlFile] = args;
++  try {
++    const acceptedHtml = readFileSync(acceptedHtmlFile, 'utf8');
++    const result = checkDerivedAcceptance(dir, surfaceId, acceptedHtml);
++    if (!result.ok) {
++      for (const finding of result.findings) {
++        io.err(`${finding.rule}: ${finding.message}`);
++      }
++      return 1;
++    }
++  } catch (error) {
++    return printError(io, error);
++  }
++  io.out(`Surface "${surfaceId}": acceptance gate ok.`);
++  return 0;
++}
++
++function runVerifyDriving(args: readonly string[], io: CliIo): number {
++  if (args.length !== 2) return printUsage(io);
++  const [dir, surfaceId] = args;
++  try {
++    verifyDrivingWireframe(dir, surfaceId);
++  } catch (error) {
++    return printError(io, error);
++  }
++  io.out(`Surface "${surfaceId}": driving wireframe verified against its recorded hash.`);
++  return 0;
++}
++
++/**
++ * Dispatch entry for the `wireframe-provenance` bin. The exit-code contract is
++ * the skill's gate: 0 success, 1 refusal/error (descriptive message on stderr;
++ * never a fabricated verdict), 2 usage error.
++ */
++export function runWireframeProvenance(argv: readonly string[], io: CliIo): number {
++  const [subcommand, ...args] = argv;
++  switch (subcommand) {
++    case 'record-driving':
++      return runRecordDriving(args, io);
++    case 'record-derived':
++      return runRecordDerived(args, io);
++    case 'check-acceptance':
++      return runCheckAcceptance(args, io);
++    case 'verify-driving':
++      return runVerifyDriving(args, io);
++    default:
++      return printUsage(io);
++  }
++}
+diff --git a/plugins/design-control/src/provenance/derived.ts b/plugins/design-control/src/provenance/derived.ts
+new file mode 100644
+index 00000000..b9133761
+--- /dev/null
++++ b/plugins/design-control/src/provenance/derived.ts
+@@ -0,0 +1,363 @@
++/**
++ * Wireframe provenance — the retroactive (`derived`) path.
++ *
++ * A wireframe is either DRIVING (authored before the implementation; the
++ * artifact that drove the change) or DERIVED (reverse-engineered from an
++ * already-existing surface). The derived path exists so a legacy surface can be
++ * brought under the discipline, but with two hard properties from the spec:
++ *
++ *  1. The auto-derived draft is SNAPSHOTTED at derivation time, alongside its
++ *     provenance, so acceptance has a baseline to diff against.
++ *  2. Accepting a `derived` artifact REQUIRES a recorded operator edit — a
++ *     non-empty byte diff between the stored snapshot and the accepted version.
++ *     A bare state transition is not an edit.
++ *
++ * And a `derived` artifact NEVER satisfies a "wireframe drove implementation"
++ * claim ({@link wireframeDroveImplementation}) — provenance distinguishes the
++ * two modes precisely so the claim cannot be laundered through acceptance.
++ *
++ * Provenance is APPEND-ONCE: recording over an existing sidecar fails loud in
++ * both modes and both directions, so a `derived` record can never be silently
++ * flipped to `driving` by a later call. Mode transitions require explicitly
++ * removing or superseding the existing record.
++ *
++ * Sidecar layout (per surface, in the operator-chosen provenance dir):
++ *   <surfaceId>.provenance.json          — zod-validated provenance record
++ *   <surfaceId>.derived-snapshot.html    — the auto-derived draft (derived only)
++ */
++
++import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
++import { join } from 'node:path';
++import { createHash } from 'node:crypto';
++import { z } from 'zod';
++
++const PROVENANCE_VERSION = 1;
++
++const sha256Hex = (content: string): string => createHash('sha256').update(content).digest('hex');
++
++/**
++ * `surfaceId` is interpolated into filesystem paths (sidecar + snapshot names),
++ * so it MUST be a portable filename: alphanumeric first character, then only
++ * letters, digits, `.`, `_`, `-`. This rejects `..` (the dot fails the
++ * alphanumeric start anchor) and any `/` or `\` (not in the character class),
++ * so an id can never escape the operator-chosen provenance directory or land
++ * in an unintended subdirectory.
++ */
++const SURFACE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
++
++const surfaceIdMessage = (surfaceId: string): string =>
++  `Invalid surfaceId ${JSON.stringify(surfaceId)}: surfaceId is used as a filename, so it must ` +
++  `match the portable-filename pattern ${String(SURFACE_ID_PATTERN)} — an alphanumeric first ` +
++  `character, then only letters, digits, ".", "_", "-". Path separators and ".." are rejected ` +
++  `so the sidecar and snapshot cannot escape the provenance directory.`;
++
++const surfaceIdSchema = z
++  .string()
++  .min(1)
++  .refine((id) => SURFACE_ID_PATTERN.test(id), {
++    message: `surfaceId must match the portable-filename pattern ${String(SURFACE_ID_PATTERN)}`,
++  });
++
++/** Fail loud at every path-building entry point — no fallback, no sanitizing. */
++function assertPortableSurfaceId(surfaceId: string): void {
++  if (!SURFACE_ID_PATTERN.test(surfaceId)) {
++    throw new Error(surfaceIdMessage(surfaceId));
++  }
++}
++
++const drivingSchema = z.object({
++  version: z.literal(PROVENANCE_VERSION),
++  surfaceId: surfaceIdSchema,
++  mode: z.literal('driving'),
++  createdAt: z.string().datetime(),
++  driving: z.object({
++    /** Filename (dir-relative) of the wireframe this record certifies. */
++    wireframeFile: z.string().min(1),
++    /** sha256 (hex) of the wireframe bytes as recorded — tamper evidence. */
++    wireframeSha256: z.string().regex(/^[0-9a-f]{64}$/),
++  }),
++});
++
++const derivedSchema = z.object({
++  version: z.literal(PROVENANCE_VERSION),
++  surfaceId: surfaceIdSchema,
++  mode: z.literal('derived'),
++  createdAt: z.string().datetime(),
++  derived: z.object({
++    /** Filename (dir-relative) of the snapshot stored at derivation time. */
++    snapshotFile: z.string().min(1),
++    /** sha256 (hex) of the snapshot bytes as recorded — tamper evidence. */
++    snapshotSha256: z.string().regex(/^[0-9a-f]{64}$/),
++    /** What the draft was derived FROM (route, URL, file — operator-meaningful). */
++    source: z.string().min(1),
++  }),
++});
++
++const provenanceSchema = z.discriminatedUnion('mode', [drivingSchema, derivedSchema]);
++
++export type WireframeProvenance = z.infer<typeof provenanceSchema>;
++
++export interface ProvenanceFinding {
++  readonly rule: 'derived-unedited';
++  readonly message: string;
++}
++
++export interface AcceptanceResult {
++  readonly ok: boolean;
++  readonly findings: readonly ProvenanceFinding[];
++}
++
++const sidecarPath = (dir: string, surfaceId: string): string =>
++  join(dir, `${surfaceId}.provenance.json`);
++
++/**
++ * The single chokepoint both recorders write through. Provenance is
++ * append-once: if a sidecar already exists for the surface — in ANY mode —
++ * writing fails loud. Without this, a later `recordDrivingWireframe` call
++ * could silently flip a `derived` record to `driving` (orphaning the
++ * derivation-time snapshot), after which {@link wireframeDroveImplementation}
++ * returns true — laundering the exact claim this module exists to prevent.
++ * Mode transitions are NOT a write-over; they require explicitly removing or
++ * superseding the existing record as a separate, deliberate operation.
++ */
++function assertAppendOnce(dir: string, provenance: WireframeProvenance): string {
++  const path = sidecarPath(dir, provenance.surfaceId);
++  if (existsSync(path)) {
++    const existing = loadProvenance(dir, provenance.surfaceId);
++    throw new Error(
++      `Refusing to record ${provenance.mode} provenance for surface "${provenance.surfaceId}": ` +
++        `a ${existing.mode} record already exists at ${path}. Provenance is append-once — ` +
++        `overwriting would silently rewrite the surface's mode and its recorded baseline. ` +
++        `Re-recording requires explicitly removing or superseding the existing record first.`,
++    );
++  }
++  return path;
++}
++
++function writeProvenance(dir: string, provenance: WireframeProvenance): void {
++  const path = assertAppendOnce(dir, provenance);
++  writeFileSync(path, JSON.stringify(provenance, null, 2) + '\n');
++}
++
++/**
++ * Failure-path cleanup for staged temp files. Swallows secondary errors
++ * deliberately: the caller is about to rethrow the ORIGINAL failure, and a
++ * cleanup hiccup (e.g. permissions just changed) must not mask it. This is
++ * cleanup, not a fallback — the operation still fails loud.
++ */
++function bestEffortRemove(path: string): void {
++  try {
++    rmSync(path, { force: true });
++  } catch {
++    // Intentionally swallowed — see doc comment above.
++  }
++}
++
++/**
++ * Record a DRIVING wireframe's provenance (the authored-first path). The record
++ * binds the artifact it certifies: `wireframeFile` (dir-relative filename of
++ * the lint-green wireframe, which exists by this point — lint precedes
++ * provenance in the skill's step ordering) is read and hashed at record time,
++ * so a later wholesale replacement of the wireframe is tamper-evident
++ * ({@link verifyDrivingWireframe}), mirroring the derived path's snapshot hash.
++ */
++export function recordDrivingWireframe(input: {
++  dir: string;
++  surfaceId: string;
++  /** Filename (within dir) of the wireframe HTML this record certifies. */
++  wireframeFile: string;
++  createdAt?: Date;
++}): WireframeProvenance {
++  assertPortableSurfaceId(input.surfaceId);
++  const wireframePath = join(input.dir, input.wireframeFile);
++  if (!existsSync(wireframePath)) {
++    throw new Error(
++      `Cannot record driving provenance for surface "${input.surfaceId}": wireframe file ` +
++        `${wireframePath} does not exist. The driving record binds the artifact it certifies ` +
++        `by filename + hash, so the lint-green wireframe must be on disk at record time ` +
++        `(lint precedes provenance — see the wireframe skill's step ordering).`,
++    );
++  }
++  const provenance: WireframeProvenance = {
++    version: PROVENANCE_VERSION,
++    surfaceId: input.surfaceId,
++    mode: 'driving',
++    createdAt: (input.createdAt ?? new Date()).toISOString(),
++    driving: {
++      wireframeFile: input.wireframeFile,
++      wireframeSha256: sha256Hex(readFileSync(wireframePath, 'utf8')),
++    },
++  };
++  writeProvenance(input.dir, provenance);
++  return provenance;
++}
++
++/**
++ * Record a DERIVED draft at derivation time: store the auto-derived snapshot
++ * AND the provenance sidecar in one move, so the acceptance diff always has its
++ * baseline. The snapshot hash is recorded for tamper evidence.
++ */
++export function recordDerivation(input: {
++  dir: string;
++  surfaceId: string;
++  derivedHtml: string;
++  source: string;
++  createdAt?: Date;
++}): WireframeProvenance {
++  assertPortableSurfaceId(input.surfaceId);
++  const snapshotFile = `${input.surfaceId}.derived-snapshot.html`;
++  const provenance: WireframeProvenance = {
++    version: PROVENANCE_VERSION,
++    surfaceId: input.surfaceId,
++    mode: 'derived',
++    createdAt: (input.createdAt ?? new Date()).toISOString(),
++    derived: {
++      snapshotFile,
++      snapshotSha256: sha256Hex(input.derivedHtml),
++      source: input.source,
++    },
++  };
++  // The append-once refusal fires BEFORE any byte hits disk — otherwise a
++  // refused re-derivation would have already clobbered (or littered next to)
++  // the existing surface's derivation-time baseline.
++  const sidecarTarget = assertAppendOnce(input.dir, provenance);
++  const snapshotTarget = join(input.dir, snapshotFile);
++  // All-or-nothing commit (AUDIT-20260611-07): two sequential writes to the
++  // final paths can be interrupted between them, leaving a committed sidecar
++  // whose snapshot does not exist (or vice versa). Instead, stage BOTH
++  // artifacts as temp files in the same directory, then promote each with an
++  // atomic rename only after both staged writes succeeded.
++  const stagedSnapshot = `${snapshotTarget}.tmp-${process.pid}`;
++  const stagedSidecar = `${sidecarTarget}.tmp-${process.pid}`;
++  try {
++    writeFileSync(stagedSnapshot, input.derivedHtml);
++    writeFileSync(stagedSidecar, JSON.stringify(provenance, null, 2) + '\n');
++    // Promote snapshot first, sidecar last: the sidecar is the commit point.
++    // If the process dies between the two renames, a snapshot without a
++    // sidecar is inert debris at worst — nothing reads it (loadProvenance
++    // fails loud on the absent sidecar, and recording for the surface is
++    // still possible). The inverse ordering would commit a sidecar whose
++    // recorded snapshot does not exist — a live record with a missing
++    // baseline that breaks checkDerivedAcceptance.
++    renameSync(stagedSnapshot, snapshotTarget);
++    renameSync(stagedSidecar, sidecarTarget);
++  } catch (error) {
++    bestEffortRemove(stagedSnapshot);
++    bestEffortRemove(stagedSidecar);
++    throw error;
++  }
++  return provenance;
++}
++
++/** Load + zod-validate a surface's provenance sidecar. Fails loud when absent/malformed. */
++export function loadProvenance(dir: string, surfaceId: string): WireframeProvenance {
++  assertPortableSurfaceId(surfaceId);
++  const path = sidecarPath(dir, surfaceId);
++  if (!existsSync(path)) {
++    throw new Error(
++      `No provenance sidecar for surface "${surfaceId}" at ${path}. ` +
++        `Record provenance at authoring/derivation time (recordDrivingWireframe / recordDerivation).`,
++    );
++  }
++  const parsed = provenanceSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
++  if (parsed.surfaceId !== surfaceId) {
++    throw new Error(
++      `Provenance sidecar identity mismatch at ${path}: requested surface "${surfaceId}" but the ` +
++        `sidecar records surfaceId "${parsed.surfaceId}". The sidecar was likely copied or renamed ` +
++        `to another surface's filename — its snapshot and hash belong to "${parsed.surfaceId}", so ` +
++        `it cannot vouch for "${surfaceId}". Remove the misplaced sidecar, then record provenance ` +
++        `for "${surfaceId}" (recording refuses to overwrite an existing sidecar).`,
++    );
++  }
++  return parsed;
++}
++
++/**
++ * The acceptance gate for `derived` artifacts: the accepted version must carry
++ * a recorded operator edit — a non-empty byte diff against the snapshot stored
++ * at derivation time. Driving wireframes pass through (the gate is mode-scoped).
++ * Fails loud if the stored snapshot no longer matches its recorded hash — a
++ * tampered baseline cannot certify an edit.
++ */
++export function checkDerivedAcceptance(
++  dir: string,
++  surfaceId: string,
++  acceptedHtml: string,
++): AcceptanceResult {
++  const provenance = loadProvenance(dir, surfaceId);
++  if (provenance.mode !== 'derived') {
++    return { ok: true, findings: [] };
++  }
++  const snapshotPath = join(dir, provenance.derived.snapshotFile);
++  const snapshot = readFileSync(snapshotPath, 'utf8');
++  if (sha256Hex(snapshot) !== provenance.derived.snapshotSha256) {
++    throw new Error(
++      `Derived snapshot ${snapshotPath} does not match the hash recorded at derivation time — ` +
++        `the baseline was modified after recording, so the operator-edit diff cannot be trusted. ` +
++        `Remove the existing record, then re-derive the draft to re-establish a baseline ` +
++        `(recording refuses to overwrite an existing sidecar).`,
++    );
++  }
++  if (acceptedHtml === snapshot) {
++    return {
++      ok: false,
++      findings: [
++        {
++          rule: 'derived-unedited',
++          message:
++            `Surface "${surfaceId}": the accepted artifact is byte-identical to the auto-derived ` +
++            `snapshot. Accepting a derived wireframe requires a recorded operator edit ` +
++            `(non-empty diff against the derivation-time snapshot), not just a state transition.`,
++        },
++      ],
++    };
++  }
++  return { ok: true, findings: [] };
++}
++
++/**
++ * Whether this wireframe supports a "wireframe drove implementation" claim.
++ * Only a DRIVING wireframe does; a `derived` one never does, edited or not —
++ * it was reverse-engineered from the surface it would be claiming to have driven.
++ */
++export function wireframeDroveImplementation(provenance: WireframeProvenance): boolean {
++  return provenance.mode === 'driving';
++}
++
++/**
++ * Verify a DRIVING record against the artifact it certifies, the way
++ * {@link checkDerivedAcceptance} checks the derived snapshot: load the
++ * provenance, require `mode === 'driving'`, re-hash the bound wireframe file,
++ * and fail loud on a mismatch — a record whose wireframe was replaced after
++ * recording cannot certify the "wireframe drove implementation" claim.
++ * Returns the (now hash-verified) provenance.
++ */
++export function verifyDrivingWireframe(dir: string, surfaceId: string): WireframeProvenance {
++  const provenance = loadProvenance(dir, surfaceId);
++  if (provenance.mode !== 'driving') {
++    throw new Error(
++      `Surface "${surfaceId}" has ${provenance.mode} provenance, not driving — a derived ` +
++        `artifact never supports a "wireframe drove implementation" claim, so there is no ` +
++        `driving binding to verify.`,
++    );
++  }
++  const wireframePath = join(dir, provenance.driving.wireframeFile);
++  if (!existsSync(wireframePath)) {
++    throw new Error(
++      `Driving provenance for surface "${surfaceId}" binds wireframe file ${wireframePath}, ` +
++        `but that file no longer exists — the record cannot certify an artifact that is gone. ` +
++        `Restore the wireframe, or remove the existing record and re-record provenance ` +
++        `(recording refuses to overwrite an existing sidecar).`,
++    );
++  }
++  if (sha256Hex(readFileSync(wireframePath, 'utf8')) !== provenance.driving.wireframeSha256) {
++    throw new Error(
++      `Wireframe ${wireframePath} does not match the hash recorded for surface "${surfaceId}" ` +
++        `at recording time — the artifact was modified or replaced after the driving record was ` +
++        `written, so the record cannot certify it. Remove the existing record, then re-lint and ` +
++        `re-record provenance for the current wireframe (recording refuses to overwrite an ` +
++        `existing sidecar).`,
++    );
++  }
++  return provenance;
++}
+diff --git a/plugins/design-control/src/provenance/index.ts b/plugins/design-control/src/provenance/index.ts
+new file mode 100644
+index 00000000..928bf7e4
+--- /dev/null
++++ b/plugins/design-control/src/provenance/index.ts
+@@ -0,0 +1,17 @@
++/**
++ * Public surface of the wireframe-provenance module. Import via `@/provenance`.
++ */
++
++export {
++  type WireframeProvenance,
++  type ProvenanceFinding,
++  type AcceptanceResult,
++  recordDrivingWireframe,
++  recordDerivation,
++  loadProvenance,
++  checkDerivedAcceptance,
++  wireframeDroveImplementation,
++  verifyDrivingWireframe,
++} from '@/provenance/derived';
++
++export { runWireframeProvenance } from '@/provenance/cli';
+diff --git a/plugins/design-control/src/provenance/wireframe-provenance-cli.ts b/plugins/design-control/src/provenance/wireframe-provenance-cli.ts
+new file mode 100644
+index 00000000..1270bdd8
+--- /dev/null
++++ b/plugins/design-control/src/provenance/wireframe-provenance-cli.ts
+@@ -0,0 +1,12 @@
++/**
++ * Process entry for `bin/wireframe-provenance`. All behavior lives in
++ * {@link runWireframeProvenance} (tested directly); this file only wires argv
++ * and the process exit code.
++ */
++
++import { runWireframeProvenance } from '@/provenance/cli';
++
++process.exitCode = runWireframeProvenance(process.argv.slice(2), {
++  out: (line) => console.log(line),
++  err: (line) => console.error(line),
++});
+
+
+## What to look for
+
+- **Correctness bugs** — logic errors, off-by-one, null/undefined paths, race conditions, missing error handling, swallowed exceptions.
+- **Design issues** — coupling between layers that should be independent, leaking abstractions, primitives that should compose but don't, configuration that should be data ending up as code.
+- **Missed edge cases** — what happens with empty input? Maximum input? Concurrent calls? Partial failure? Network unavailability? Operator interrupt mid-operation? What is the behavior on a fresh install vs. an upgrade?
+- **Code-quality concerns** — files growing past a reasonable cap, names that don't reveal intent, dead code, duplicated logic, magic numbers without explanation, tests that don't test the contract they claim to test.
+- **Cross-cutting impact** — does this diff touch a surface that other surfaces depend on? Are those other surfaces updated? Are migrations needed? Are doctor rules / schemas / validators updated to match the new shape?
+- **Documentation drift** — does the README / SKILL.md / PRD describe the behavior the code actually implements? If the spec changed, did the implementation? If the implementation changed, did the spec?
+- **Operator-discipline traps** — placeholder comments, swallowed errors, hardcoded paths/values that should be configurable, fallbacks that hide failure modes, mock data outside test code. These are bug-factories per project guidelines.
+
+## Output format
+
+For each finding you surface, emit ONE markdown block in this exact shape:
+
+```
+### <heading: one-line summary of the finding>
+
+Finding-ID: AUDIT-BARRAGE-<your-model-name>-<NN>
+Status:     open
+Severity:   <blocking | high | medium | low | informational>
+Surface:    <repo-relative-path:line-range> OR <description of the surface if not anchored to a single file>
+
+<one-to-three paragraphs of body: what the finding is, why it matters, what evidence you relied on, what a reasonable fix would look like. Be specific. Cite line numbers from the diff. If the finding is structural / cross-file, name every file affected.>
+```
+
+Number the findings sequentially (`-01`, `-02`, ...).
+
+**Severity — rate each finding by downstream blast-radius:** the consequence if a downstream consumer acts on the audited surface *as written*. The consumer may be an adopter running the code, or — especially for a spec — an AI agent building **unattended** from it, with no human to catch a wrong reading. Rate by what would actually happen if this shipped as-is, **not by how alarming the finding feels**. State the blast-radius reasoning in the finding body for every finding, at every level.
+
+- `blocking` — acting on it as-written breaks the feature's stated goals in obvious ways; OR (for a spec) the more natural reading an agent reaches first is the wrong one, so it will likely be built wrong by default and nothing in the artifact corrects it.
+- `high` — a correctness/safety defect a consumer will hit; OR a spec contradiction/ambiguity where the readings are roughly equally plausible and the artifact doesn't disambiguate — an agent might build either, including the wrong one.
+- `medium` — a design issue that compounds over time; OR a spec inconsistency a reasonable consumer would resolve correctly anyway (readings barely diverge, or context makes the intended one obvious).
+- `low` — hygiene; cosmetic wording with no behavioral or implementation consequence.
+- `informational` — context worth seeing, not itself a defect.
+
+**Calibrate by consequence, not by alarm.** A genuine contradiction a reader would obviously resolve the right way is at most `medium`. A quietly-plausible wrong reading an agent would actually build is `high`/`blocking` even if it looks minor. A spec's internal consistency is load-bearing — it is the input to an unattended build.
+
+## If you find nothing — say so explicitly
+
+If you walk the diff carefully and find no findings worth surfacing, emit ONE block in this shape instead:
+
+```
+### No findings
+
+Finding-ID: AUDIT-BARRAGE-<your-model-name>-CLEAN
+Status:     open
+Severity:   informational
+Surface:    (the entire diff)
+
+I walked the diff for the feature named above and found no findings worth surfacing. My specific reasoning: <three-to-five sentences explaining what you checked, why those checks came back clean, and what you would have flagged if it had been present.>
+```
+
+**Do not pad with weak findings.** A confident "I checked X, Y, Z and they are clean for these reasons" is more useful to the operator than three vague low-severity notes. The cross-model diversity gives the operator independent signal; an empty clean report from your CLI is itself a signal when paired with findings from your siblings.
+
+## Hard constraints
+
+- **No deferral phrases.** Don't write phrases like "fix later", "address in a follow-up", or other commitments to deferred work. The dispatch-wrapper rejects these as bug-factories. If you spot a deferral phrase IN the diff, surface it as a finding.
+- **Anchor findings to evidence.** A finding that says "this might be a problem" without naming the specific file + line is not actionable. Name the surface, quote the relevant code, explain what's wrong.
+- **One issue per finding block.** Don't bundle multiple concerns into one entry; the operator triages each block as a discrete signal.
+- **Provenance is your model name.** Replace `<your-model-name>` in the Finding-ID with the CLI you are (`claude`, `codex`, `gemini`, etc.). This is how the operator joins findings across models.

diff --git a/Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/codex.md b/Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/codex.md
new file mode 100644
index 00000000..8b31d708
--- /dev/null
+++ b/Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/codex.md
@@ -0,0 +1,21 @@
+### `wireframeFile` can still escape the provenance directory
+
+Finding-ID: AUDIT-BARRAGE-codex-01
+Status:     open
+Severity:   medium
+Surface:    plugins/design-control/src/provenance/derived.ts:170-191, 337-361; plugins/design-control/skills/wireframe/SKILL.md:66-76
+
+`surfaceId` is now validated as a portable filename before path construction, but the driving artifact filename is not. `recordDrivingWireframe` accepts `wireframeFile: string`, joins it directly with `input.dir` at line 176, stores it in provenance at line 187, and `verifyDrivingWireframe` later joins the stored value again at line 341. The skill says `<wireframe-filename>` is “relative to `<wireframes-dir>`” at lines 71-72, but the code accepts `../outside.html`, `nested/file.html`, or an absolute path if Node’s `join` semantics are relied on by future callers differently than expected. That means a driving provenance record can bind to a file outside the chosen wireframes directory, or to a nested path the operator did not intend as the surface’s canonical wireframe.
+
+Blast radius is medium: this is operator/agent-supplied input rather than hostile external input, so the realistic failure is misplaced provenance and later verification of the wrong artifact, not an attacker exploit. It still compounds because driving provenance is a certification surface. A reasonable fix is to validate `wireframeFile` as a plain dir-relative filename, or explicitly support subdirectories with `resolve` + containment checks and document that contract.
+
+### `recordDerivation` can clobber an existing snapshot before failing to commit the sidecar
+
+Finding-ID: AUDIT-BARRAGE-codex-02
+Status:     open
+Severity:   medium
+Surface:    plugins/design-control/src/provenance/derived.ts:230-263
+
+`recordDerivation` stages both files, then renames `stagedSnapshot` to `snapshotTarget` at line 251 before renaming the sidecar at line 252. `assertAppendOnce` only checks the sidecar path, so if `<surfaceId>.derived-snapshot.html` already exists without a sidecar, the rename overwrites it on POSIX. If the subsequent sidecar rename fails, the catch removes only temp paths, leaving the pre-existing snapshot replaced by this failed attempt’s bytes.
+
+Blast radius is medium because orphan snapshots are supposed to be inert, but this violates the “no half-state when a write fails” claim and can destroy operator artifact state in a recovery scenario. The fix should treat the snapshot target as part of the append-once commit too: refuse if either final target already exists, or use non-overwriting creation/link semantics for promotion.

diff --git a/Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/stderr/gemini.txt b/Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/stderr/gemini.txt
new file mode 100644
index 00000000..4098b6c8
--- /dev/null
+++ b/Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/stderr/gemini.txt
@@ -0,0 +1,17 @@
+Loaded cached credentials.
+Loading extension: nanobanana
+API returned invalid content (empty or unparsable JSON) after all retries. Full report available at: /var/folders/sk/jzwspmzn1g17x97x7s7l_dch0000gn/T/gemini-client-error-generateJson-invalid-content-2026-06-11T06-24-28-541Z.json
+[Routing] ClassifierStrategy failed: Error: Failed to generate JSON content: Retry attempts exhausted
+    at BaseLlmClient.generateJson (file:///Users/orion/.nvm/versions/node/v22.19.0/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/core/baseLlmClient.js:71:19)
+    at async ClassifierStrategy.route (file:///Users/orion/.nvm/versions/node/v22.19.0/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/routing/strategies/classifierStrategy.js:126:34)
+    at async CompositeStrategy.route (file:///Users/orion/.nvm/versions/node/v22.19.0/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/routing/strategies/compositeStrategy.js:30:34)
+    at async ModelRouterService.route (file:///Users/orion/.nvm/versions/node/v22.19.0/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/routing/modelRouterService.js:44:24)
+    at async GeminiClient.sendMessageStream (file:///Users/orion/.nvm/versions/node/v22.19.0/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/core/client.js:373:30)
+    at async file:///Users/orion/.nvm/versions/node/v22.19.0/lib/node_modules/@google/gemini-cli/dist/src/nonInteractiveCli.js:188:34
+    at async main (file:///Users/orion/.nvm/versions/node/v22.19.0/lib/node_modules/@google/gemini-cli/dist/src/gemini.js:361:9)
+Attempt 1 failed: You have exhausted your capacity on this model.. Retrying after 10000ms...
+Attempt 2 failed: You have exhausted your capacity on this model.. Retrying after 10000ms...
+Error when talking to Gemini API Full report available at: /var/folders/sk/jzwspmzn1g17x97x7s7l_dch0000gn/T/gemini-client-error-Turn.run-sendMessageStream-2026-06-11T06-24-50-918Z.json
+[API Error: You have exhausted your capacity on this model.]
+An unexpected critical error occurred:
+[object Object]

diff --git a/Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/tip.sha b/Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/tip.sha
new file mode 100644
index 00000000..7010129e
--- /dev/null
+++ b/Users/orion/work/deskwork-work/design-control/plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/tip.sha
@@ -0,0 +1 @@
+9c0d556c175d0ec3c98470c5a1127def71fc55c8


## What to look for

- **Correctness bugs** — logic errors, off-by-one, null/undefined paths, race conditions, missing error handling, swallowed exceptions.
- **Design issues** — coupling between layers that should be independent, leaking abstractions, primitives that should compose but don't, configuration that should be data ending up as code.
- **Missed edge cases** — what happens with empty input? Maximum input? Concurrent calls? Partial failure? Network unavailability? Operator interrupt mid-operation? What is the behavior on a fresh install vs. an upgrade?
- **Code-quality concerns** — files growing past a reasonable cap, names that don't reveal intent, dead code, duplicated logic, magic numbers without explanation, tests that don't test the contract they claim to test.
- **Cross-cutting impact** — does this diff touch a surface that other surfaces depend on? Are those other surfaces updated? Are migrations needed? Are doctor rules / schemas / validators updated to match the new shape?
- **Documentation drift** — does the README / SKILL.md / PRD describe the behavior the code actually implements? If the spec changed, did the implementation? If the implementation changed, did the spec?
- **Operator-discipline traps** — placeholder comments, swallowed errors, hardcoded paths/values that should be configurable, fallbacks that hide failure modes, mock data outside test code. These are bug-factories per project guidelines.

## Output format

For each finding you surface, emit ONE markdown block in this exact shape:

```
### <heading: one-line summary of the finding>

Finding-ID: AUDIT-BARRAGE-<your-model-name>-<NN>
Status:     open
Severity:   <blocking | high | medium | low | informational>
Surface:    <repo-relative-path:line-range> OR <description of the surface if not anchored to a single file>

<one-to-three paragraphs of body: what the finding is, why it matters, what evidence you relied on, what a reasonable fix would look like. Be specific. Cite line numbers from the diff. If the finding is structural / cross-file, name every file affected.>
```

Number the findings sequentially (`-01`, `-02`, ...).

**Severity — rate each finding by downstream blast-radius:** the consequence if a downstream consumer acts on the audited surface *as written*. The consumer may be an adopter running the code, or — especially for a spec — an AI agent building **unattended** from it, with no human to catch a wrong reading. Rate by what would actually happen if this shipped as-is, **not by how alarming the finding feels**. State the blast-radius reasoning in the finding body for every finding, at every level.

- `blocking` — acting on it as-written breaks the feature's stated goals in obvious ways; OR (for a spec) the more natural reading an agent reaches first is the wrong one, so it will likely be built wrong by default and nothing in the artifact corrects it.
- `high` — a correctness/safety defect a consumer will hit; OR a spec contradiction/ambiguity where the readings are roughly equally plausible and the artifact doesn't disambiguate — an agent might build either, including the wrong one.
- `medium` — a design issue that compounds over time; OR a spec inconsistency a reasonable consumer would resolve correctly anyway (readings barely diverge, or context makes the intended one obvious).
- `low` — hygiene; cosmetic wording with no behavioral or implementation consequence.
- `informational` — context worth seeing, not itself a defect.

**Calibrate by consequence, not by alarm.** A genuine contradiction a reader would obviously resolve the right way is at most `medium`. A quietly-plausible wrong reading an agent would actually build is `high`/`blocking` even if it looks minor. A spec's internal consistency is load-bearing — it is the input to an unattended build.

## If you find nothing — say so explicitly

If you walk the diff carefully and find no findings worth surfacing, emit ONE block in this shape instead:

```
### No findings

Finding-ID: AUDIT-BARRAGE-<your-model-name>-CLEAN
Status:     open
Severity:   informational
Surface:    (the entire diff)

I walked the diff for the feature named above and found no findings worth surfacing. My specific reasoning: <three-to-five sentences explaining what you checked, why those checks came back clean, and what you would have flagged if it had been present.>
```

**Do not pad with weak findings.** A confident "I checked X, Y, Z and they are clean for these reasons" is more useful to the operator than three vague low-severity notes. The cross-model diversity gives the operator independent signal; an empty clean report from your CLI is itself a signal when paired with findings from your siblings.

## Hard constraints

- **No deferral phrases.** Don't write phrases like "fix later", "address in a follow-up", or other commitments to deferred work. The dispatch-wrapper rejects these as bug-factories. If you spot a deferral phrase IN the diff, surface it as a finding.
- **Anchor findings to evidence.** A finding that says "this might be a problem" without naming the specific file + line is not actionable. Name the surface, quote the relevant code, explain what's wrong.
- **One issue per finding block.** Don't bundle multiple concerns into one entry; the operator triages each block as a discrete signal.
- **Provenance is your model name.** Replace `<your-model-name>` in the Finding-ID with the CLI you are (`claude`, `codex`, `gemini`, etc.). This is how the operator joins findings across models.
