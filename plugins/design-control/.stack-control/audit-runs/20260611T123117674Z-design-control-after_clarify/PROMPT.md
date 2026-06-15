# Audit-barrage — multi-model audit prompt template

You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface the kinds of defects listed under **What to look for** below, in the work product captured under **Under audit**.

You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.

## Feature under audit

design-control

## Feature scope (workplan / PRD summary)

Governance pass over the just-implemented work for feature 'design-control', diffed against 0391a0c0. The differentiated back half audits a plan it did not author or execute.

## Commit subjects in the audited range

bc650cad docs(design-control): check off Phase 2 tasks; roadmap phase-2 → in-flight
4650ee66 feat(design-control): translate-design-language authoring skill (Phase 2)
5853f83f feat(design-control): static link-liveness + bin/check-design-spec (Phase 2)
b2659452 feat(design-control): design-language spec schema + example-presence validation (Phase 2)


## Recent audit-log excerpt (prior findings on this feature)

Use this to avoid re-reporting findings that have already been triaged. If a finding was previously dispositioned (`closed`, `won't-fix`, `accepted-trade-off`), don't re-litigate the disposition; only surface a new instance if the underlying shape regressed.


Blast radius: medium. Requires the remove-and-re-derive recovery path plus a write failure, but the destroyed artifact is exactly the kind of historical baseline the provenance discipline exists to preserve, and the documented recovery procedure is what walks the operator into it. Fix: include `snapshotTarget` in the append-once refusal (refuse if either final target exists), or promote with no-clobber semantics (`linkSync` + `unlink` instead of `renameSync`).

### AUDIT-20260611-12 — The append-once guarantee is check-then-act — concurrent recorders for the same surface can both succeed

Finding-ID: AUDIT-20260611-12
Status:     fixed-8916f7d7 (2026-06-10; driving sidecar written with flag wx — O_CREAT|O_EXCL atomic check-and-write; derived sidecar promote linkSync no-clobber; EEXIST on every path maps to the shared append-once refusal; 2 RED-first tests via dangling-symlink TOCTOU stand-in)
Severity:   low
Surface:    plugins/design-control/src/provenance/derived.ts:128-141 (assertAppendOnce existsSync), :143-146 (writeProvenance with default 'w' flag), :251-252 (clobbering renameSync)

`assertAppendOnce` uses `existsSync`, then `writeProvenance` writes with the default `'w'` flag and `recordDerivation` promotes via clobbering `renameSync`. Two concurrent recorders for the same surface (the stack-control thesis explicitly targets parallel unattended execution) can both pass the existence check and both "succeed," last-writer-wins — including the derived→driving laundering direction that 0e4027c3 was written to kill. The window is small, but the guarantee is the module's headline promise and the atomic primitive is one flag away.

Blast radius: low — requires two processes recording the same surface near-simultaneously, which already implies an orchestration error, and the result is one record silently lost rather than a default-path failure. Fix: `writeFileSync(path, data, { flag: 'wx' })` for the driving sidecar (making check-and-write atomic, with EEXIST mapped to the append-once refusal), and a link-based no-clobber promote on the derived path (which also resolves claude-04).

### AUDIT-20260611-13 — The govern loop's audited diff embeds its own prior run artifacts — payload compounds each round, and the 900s timeout treats the symptom

Finding-ID: AUDIT-20260611-13
Status:     filed-upstream https://github.com/audiocontrol-org/deskwork/issues/459 (2026-06-10; stackctl-govern defect — the governed diff must exclude .stack-control/audit-runs/ meta-artifacts; the 900s timeout stays as mitigation until the generator is removed upstream)
Severity:   medium
Surface:    plugins/design-control/.stack-control/audit-barrage-config.yaml:30-37 (claude 300→900 rationale); the audited diff's inclusion of audit-runs/\*\*/PROMPT.md

This run's payload contains run 062218157Z's PROMPT.md (~3757 lines), which itself embeds run 055621128Z's full PROMPT.md (~859 lines), which embeds the original feature diff — three levels of recursive self-quotation. Because the governed diff is taken against a fixed base (4a7f30d0) and run artifacts are committed inside the audited tree, every governance round appends its own bookkeeping to the next round's prompt. The config comment documents the consequence — a 181KB prompt and a claude timeout at 301s — and responds by raising the timeout to 900s. That is a symptom patch; the generator is the inclusion of `.stack-control/audit-runs/` (meta-artifacts about the audit) in the diff the audit reads. Per the project's own spec-audit-diminishing-returns rule: remove the generator, don't feed it.

Blast radius: medium and monotonically worsening — each round adds its predecessor's full payload, so timeouts and zero-byte model failures (the exact fleet-degradation mode issue 447 documented) recur at the next size doubling regardless of timeout value, and auditor attention is diluted across thousands of lines of self-quotation. Fix: exclude `.stack-control/audit-runs/` (and governance bookkeeping generally) from the governed diff via pathspec, keeping the diff scoped to work product.

### AUDIT-20260611-14 — Seeded config's header narrates a different feature's history ("project override for graphical-entries")

Finding-ID: AUDIT-20260611-14
Status:     fixed-in-bookkeeping-commit (2026-06-10; header rewritten to name this installation + the seeding event; inherited graphical-entries rationale explicitly attributed; stale dw-lifecycle template path corrected to the stack-control template)
Severity:   low
Surface:    plugins/design-control/.stack-control/audit-barrage-config.yaml:1-27

The file seeded into the design-control nested installation opens with "project override for graphical-entries" and carries that feature's gemini-failure statistics (16 of 17 runs across "the graphical-entries Phase 0 audit cycle") and Phase 12 Task 8 history verbatim. Only the final comment block (claude 300→900, specs/014) belongs to this installation. A future reader tuning this config inherits another feature's rationale as if it were locally measured evidence.

Blast radius: low — no behavioral consequence (the `models:` block is correct), purely misleading provenance in comments, but this plugin's whole subject matter is records that accurately bind to what they describe. Fix: reword the header to name this installation, keep the gemini-disable rationale but attribute it ("per the root override, originally measured on graphical-entries"), and drop the Phase-12 block or cite it as inherited.

---

**Summary for triage:** 7 findings, 0 high/blocking. The strongest cross-cutting signals: (1) the governance tooling itself dropped a run record cited by a commit and rendered untracked files with absolute paths into this very audit's payload (claude-01); (2) two real, verified code defects from the floor-refused run are sitting untriaged (claude-02, independently confirmed as claude-03/-04); (3) the recursive prompt-growth generator behind the timeout bump will defeat the 900s ceiling too (claude-06). Claude-03 and -04 corroborate codex's findings from run 062218157Z — that's cross-model agreement, the protocol's HIGH-confidence signal, despite my medium per-finding blast-radius ratings.


## Under audit

The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn't).

diff --git a/plugins/design-control/ROADMAP.md b/plugins/design-control/ROADMAP.md
index d373af1e..d5f3ac03 100644
--- a/plugins/design-control/ROADMAP.md
+++ b/plugins/design-control/ROADMAP.md
@@ -13,7 +13,7 @@ graph with `stackctl roadmap` — do not hand-edit.
 - spec: specs/001-design-control
 
 ## impl:feature/phase-2-design-language-spec
-- status: planned
+- status: in-flight
 - spec: specs/001-design-control
 
 ## impl:feature/phase-3-archive-status
diff --git a/plugins/design-control/bin/check-design-spec b/plugins/design-control/bin/check-design-spec
new file mode 100755
index 00000000..40515040
--- /dev/null
+++ b/plugins/design-control/bin/check-design-spec
@@ -0,0 +1,26 @@
+#!/bin/sh
+# check-design-spec <design-language-spec.md> — validate a design-language spec:
+# markdown schema (closed kinds, css links, example-presence, do/don't) + static
+# link-liveness against author-written CSS (no app boot). Exit codes: 0 green,
+# 1 findings/error, 2 usage. Logic lives in src/design-language/check-spec-file.ts
+# (tested); this shim only locates the workspace tsx runner and dispatches.
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
+  echo "check-design-spec: tsx runner not found in any node_modules/.bin above $PLUGIN_ROOT — run npm install first" >&2
+  exit 1
+fi
+
+exec "$TSX" "$PLUGIN_ROOT/src/design-language/check-design-spec-cli.ts" "$@"
diff --git a/plugins/design-control/skills/translate-design-language/SKILL.md b/plugins/design-control/skills/translate-design-language/SKILL.md
new file mode 100644
index 00000000..fbf3294b
--- /dev/null
+++ b/plugins/design-control/skills/translate-design-language/SKILL.md
@@ -0,0 +1,100 @@
+---
+name: translate-design-language
+description: Draft or maintain the project's design-language spec — the hand-authorable markdown artifact that anchors visual identity (palette/type/spacing tokens + signature components, each rule linked to live CSS + ≥1 example). Hand-authoring is the default and needs NO engine; the optional /frontend-design accelerator drafts from approved wireframe intent and is judged by the same check-design-spec gate.
+---
+
+# /design-control:translate-design-language
+
+Author or update the **design-language spec** for this project. The spec is the
+visual-*letter* artifact of the design-control discipline: the durable home for
+visual identity (the lo-fi wireframe carries UX *spirit* and is structurally
+incapable of carrying visual detail). Every rule binds to reality — a live CSS
+file + selector, ≥1 current example — so the spec cannot quietly drift into
+fiction the way a mockup's incidental polish does.
+
+> Per the plugin thesis (`DESIGN-DISCIPLINE-THESIS.md`): policy is enforced by
+> a process, not a rule. "Each rule links to live CSS" is not a convention the
+> author is trusted to follow — it is mechanically enforced by the
+> `check-design-spec` gate (schema + static link-liveness), which every draft
+> MUST pass before it may be presented.
+
+## Spec convention (hand-authorable markdown)
+
+One markdown file (conventionally `design-language.md` in the operator's chosen
+design docs directory). Rules are declared under ATX headings, fields are
+bullets with a closed key set:
+
+```markdown
+# Design language: <project>
+
+## Palette
+
+### rule: ink-primary
+- kind: palette
+- css: styles/studio.css .btn-primary
+- example: dashboard compose button uses .btn-primary
+- do: Use the ink palette for every primary action.
+- don't: Never introduce raw hex blues outside the palette tokens.
+```
+
+- `kind:` — one of `palette` / `type` / `spacing` / `component` (the closed
+  vocabulary; `component` is the signature-component class).
+- `css: <path> <selector>` — ≥1 per rule; the path is relative to the spec
+  file; the selector must be **defined in that author-written CSS source**
+  (checked statically — no app boot). Non-CSS targets (CSS-in-JS, utility
+  frameworks, CSS-Modules) are reported as not-validated-in-v1 notes.
+- `example:` — ≥1 per rule (a rule with zero examples is rejected). Presence
+  is structural; whether the example still matches live UI is
+  `spec-truthfulness`, deliberately out of v1 scope.
+- `do:` / `don't:` — ≥1 guidance line per rule.
+
+## Procedure
+
+1. **Locate or create the spec file.** One spec per design language; do not
+   fork per-surface copies. If the operator has no spec yet, scaffold the
+   heading + one rule per obvious anchor (masthead, primary action, body type)
+   directly from the live CSS — with the operator naming the files that count
+   as design-language source.
+
+2. **Author or update rules — manual path (default, requires NO engine).** The
+   operator (or the agent under operator direction) writes the rules by hand:
+   pick the selector in live CSS the rule is anchored to, cite ≥1 current
+   example, state the do/don't. Scaffold completion never depends on engine
+   presence — this path never calls the engine preflight.
+
+3. **Optional engine accelerator.** Only if the operator asks for it: gate on
+   `preflightEngine` (`@/engine-adapter`, method `translate-design-language`)
+   — absence fails loud naming the remedy — then request a draft from the
+   engine (input: the approved wireframe intent + the live CSS files the
+   operator names). **Engine output gets zero trust:** it lands in the same
+   file and is judged by the same gate as a hand-authored draft. Engine
+   conformance (`@/engine-adapter/conformance`) is exercised only when the
+   engine is present — never stub it to simulate presence.
+
+4. **Validation gate — the non-negotiable step.** Run:
+
+   ```bash
+   plugins/design-control/bin/check-design-spec <path/to/design-language.md>
+   ```
+
+   - Exit `0` (spec green, zero findings) → the draft may be presented.
+     Read any `not validated in v1` notes aloud to the operator — a skipped
+     link is visible scope, not silent coverage.
+   - Exit `1` → fix every finding and re-run. A dead selector means either the
+     rule rots (fix the link) or the CSS moved (update the rule) — NEVER
+     delete the rule just to silence the finding; that decision is the
+     operator's.
+
+5. **Present and stop.** Show the operator the green spec (path + `0 findings`
+   output + rule count). The operator owns acceptance; implementation against
+   the spec and refereeing are separate steps of the loop, not this skill's
+   job.
+
+## What this skill does NOT do
+
+- It does not author wireframes (`/design-control:wireframe`), implement, or
+  referee.
+- It does not boot the app, capture screenshots, or verify that examples still
+  match live UI (`spec-truthfulness` is named-deferred).
+- It does not skip the gate for engine-authored drafts — same gate, same
+  checker, zero findings.
diff --git a/plugins/design-control/specs/001-design-control/tasks.md b/plugins/design-control/specs/001-design-control/tasks.md
index a65fd485..aae9bbd4 100644
--- a/plugins/design-control/specs/001-design-control/tasks.md
+++ b/plugins/design-control/specs/001-design-control/tasks.md
@@ -165,19 +165,40 @@ same lint; a `derived` artifact cannot be accepted without a recorded operator e
 
 ## Phase 2 — Design-language spec convention (v1-scaffold)
 
-- [ ] Markdown spec schema (palette/type/spacing tokens + signature-component vocabulary +
+- [x] Markdown spec schema (palette/type/spacing tokens + signature-component vocabulary +
       do/don't), each rule linked to a live CSS file/class + ≥1 current example. The spec is a
       **hand-authorable markdown artifact** — **scaffold completion does NOT require the engine.**
-- [ ] **Static** link-liveness check (selector/class must be *defined in author-written source*;
+      **Done — `b2659452`** (`@/design-language/{types,schema}`: rules under `rule: <id>` ATX
+      headings; closed RULE_KINDS palette/type/spacing/component; closed field-bullet set
+      kind/css/example/do/don't with an `unknown-field` typo guard; `css: <path> <selector>`
+      links; invalid rules become findings, never silently kept or dropped. TDD: RED on the
+      unresolvable module first; 17 new tests).
+- [x] **Static** link-liveness check (selector/class must be *defined in author-written source*;
       **no app boot**). Scoped to author-written CSS selectors/classes; utility-framework / CSS-in-JS
       / hashed CSS-Modules resolution is **not validated in v1** (named-deferred). Runtime dead-CSS +
       spec-truthfulness are named-deferred.
-- [ ] **Example-presence validation:** the schema rejects a rule with **zero example references**
+      **Done — `5853f83f`** (`@/design-language/link-liveness`: pure file reads, selector must
+      appear ident-boundary exact in a selector prelude — comments/string-contents stripped,
+      at-rule preludes excluded but descended into, so `@media` rules count and
+      `content: ".ghost"` / commented-out rules don't; `.btn-primary` never satisfies `.btn`.
+      Non-.css targets recorded as `skipped` + printed as notes — the named-deferred boundary is
+      visible, never a silent drop or a fabricated dead-link. Plus
+      `@/design-language/check-spec-file` + `bin/check-design-spec` (exit 0/1/2, mirrors
+      check-wireframe; shim smoke-verified both directions). TDD: RED first; 20 new tests; suite
+      397 → 417.)
+- [x] **Example-presence validation:** the schema rejects a rule with **zero example references**
       (each rule carries ≥1 example). Structural-presence only — verifying the example still matches
       live UI is `spec-truthfulness` (named-deferred).
-- [ ] `translate-design-language` skill (uses `/frontend-design`) — an **optional accelerator** that
+      **Done — `b2659452`** (`missing-example` finding; an empty `example:` value does NOT
+      satisfy presence — it surfaces as `empty-field` + `missing-example`, both tested).
+- [x] `translate-design-language` skill (uses `/frontend-design`) — an **optional accelerator** that
       drafts/maintains the spec from approved wireframe intent; its engine conformance is exercised
       **only when `/frontend-design` is present.**
+      **Done — `4650ee66`** (`skills/translate-design-language/SKILL.md`, same enforcement shape
+      as the wireframe skill: manual hand-author path is the default and needs NO engine; the
+      accelerator gates on `preflightEngine('translate-design-language')`; engine output gets
+      zero trust — judged by the SAME `bin/check-design-spec` gate; skipped non-CSS links are
+      read aloud as visible v1 scope).
 
 **Acceptance (two paths):** **(scaffold, required)** an operator can hand-author a spec; static
 link-liveness flags a **dead selector** with **no app boot** — engine absent; **and the schema
diff --git a/plugins/design-control/src/__tests__/design-language/check-spec-file.test.ts b/plugins/design-control/src/__tests__/design-language/check-spec-file.test.ts
new file mode 100644
index 00000000..d3362e0a
--- /dev/null
+++ b/plugins/design-control/src/__tests__/design-language/check-spec-file.test.ts
@@ -0,0 +1,155 @@
+/**
+ * File-level + CLI-core tests for `check-design-spec` (Phase 2).
+ *
+ * `checkDesignSpecFile` composes the two axes — markdown schema validation +
+ * static link-liveness — over a spec FILE, resolving css paths relative to the
+ * spec's own directory. `runCheckDesignSpec` is the tested CLI core behind
+ * `bin/check-design-spec` (the shim only dispatches), mirroring the
+ * check-wireframe exit contract: 0 green / 1 findings-or-error / 2 usage.
+ *
+ * Real-fs temp fixtures per .claude/rules/testing.md.
+ */
+
+import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { afterEach, describe, expect, it } from 'vitest';
+import { checkDesignSpecFile, runCheckDesignSpec } from '@/design-language/check-spec-file';
+
+const tempDirs: string[] = [];
+
+function makeFixtureDir(): string {
+  const dir = mkdtempSync(join(tmpdir(), 'design-language-cli-'));
+  tempDirs.push(dir);
+  return dir;
+}
+
+afterEach(() => {
+  while (tempDirs.length > 0) {
+    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
+  }
+});
+
+interface CapturedIo {
+  readonly out: string[];
+  readonly err: string[];
+  readonly io: { out(line: string): void; err(line: string): void };
+}
+
+function captureIo(): CapturedIo {
+  const out: string[] = [];
+  const err: string[] = [];
+  return { out, err, io: { out: (line) => out.push(line), err: (line) => err.push(line) } };
+}
+
+const GREEN_SPEC = `# Design language: fixture
+
+### rule: ink-primary
+- kind: palette
+- css: studio.css .btn-primary
+- example: dashboard compose button
+- do: Use the ink palette for primary actions.
+`;
+
+function writeGreenFixture(dir: string): string {
+  writeFileSync(join(dir, 'studio.css'), '.btn-primary { color: navy; }\n');
+  const specPath = join(dir, 'design-language.md');
+  writeFileSync(specPath, GREEN_SPEC);
+  return specPath;
+}
+
+describe('checkDesignSpecFile', () => {
+  it('passes a hand-authored spec whose links are live', () => {
+    const specPath = writeGreenFixture(makeFixtureDir());
+    const result = checkDesignSpecFile(specPath);
+    expect(result.findings).toEqual([]);
+    expect(result.ok).toBe(true);
+    expect(result.spec.rules).toHaveLength(1);
+  });
+
+  it('combines schema findings and liveness findings in one result', () => {
+    const dir = makeFixtureDir();
+    writeFileSync(join(dir, 'studio.css'), '.real { color: ink; }\n');
+    const specPath = join(dir, 'design-language.md');
+    writeFileSync(
+      specPath,
+      `### rule: no-example
+- kind: palette
+- css: studio.css .real
+- do: x
+
+### rule: dead-link
+- kind: component
+- css: studio.css .ghost
+- example: somewhere
+- do: x
+`,
+    );
+    const result = checkDesignSpecFile(specPath);
+    const rules = result.findings.map((f) => f.rule);
+    expect(rules).toContain('missing-example');
+    expect(rules).toContain('dead-link-selector');
+    expect(result.ok).toBe(false);
+  });
+
+  it('throws loud on an unreadable spec file (never a clean verdict)', () => {
+    expect(() => checkDesignSpecFile(join(makeFixtureDir(), 'absent.md'))).toThrow();
+  });
+});
+
+describe('runCheckDesignSpec — exit contract', () => {
+  it('exit 0 + green line on a passing spec', () => {
+    const specPath = writeGreenFixture(makeFixtureDir());
+    const { out, io } = captureIo();
+    expect(runCheckDesignSpec([specPath], io)).toBe(0);
+    expect(out.join('\n')).toContain('0 findings');
+  });
+
+  it('exit 1 + findings on stderr for a dead selector', () => {
+    const dir = makeFixtureDir();
+    writeFileSync(join(dir, 'studio.css'), '.real { color: ink; }\n');
+    const specPath = join(dir, 'design-language.md');
+    writeFileSync(
+      specPath,
+      `### rule: dead
+- kind: palette
+- css: studio.css .ghost
+- example: somewhere
+- do: x
+`,
+    );
+    const { err, io } = captureIo();
+    expect(runCheckDesignSpec([specPath], io)).toBe(1);
+    expect(err.join('\n')).toContain('dead-link-selector');
+  });
+
+  it('exit 1 + descriptive error on an unreadable file', () => {
+    const { err, io } = captureIo();
+    expect(runCheckDesignSpec([join(makeFixtureDir(), 'absent.md')], io)).toBe(1);
+    expect(err.length).toBeGreaterThan(0);
+  });
+
+  it('exit 2 on usage error', () => {
+    const { err, io } = captureIo();
+    expect(runCheckDesignSpec([], io)).toBe(2);
+    expect(err.join('\n')).toContain('usage');
+  });
+
+  it('reports skipped non-css targets visibly while staying green', () => {
+    const dir = makeFixtureDir();
+    writeFileSync(join(dir, 'styles.ts'), 'export const x = 1;\n');
+    const specPath = join(dir, 'design-language.md');
+    writeFileSync(
+      specPath,
+      `### rule: css-in-js
+- kind: component
+- css: styles.ts .btn
+- example: somewhere
+- do: x
+`,
+    );
+    const { out, io } = captureIo();
+    expect(runCheckDesignSpec([specPath], io)).toBe(0);
+    expect(out.join('\n')).toContain('not validated in v1');
+  });
+});
diff --git a/plugins/design-control/src/__tests__/design-language/link-liveness.test.ts b/plugins/design-control/src/__tests__/design-language/link-liveness.test.ts
new file mode 100644
index 00000000..f3bc414f
--- /dev/null
+++ b/plugins/design-control/src/__tests__/design-language/link-liveness.test.ts
@@ -0,0 +1,147 @@
+/**
+ * Static link-liveness tests (Phase 2, axis B).
+ *
+ * Each rule's `css: <path> <selector>` link must resolve to an author-written
+ * CSS file in which the selector is DEFINED — checked statically against
+ * source with NO app boot (the check is pure file reads; the acceptance's
+ * "flags a dead selector with no app boot — engine absent" lands here).
+ *
+ * Scope is author-written CSS only: non-.css targets (CSS-in-JS, hashed
+ * CSS-Modules, utility frameworks) are NOT validated in v1 (named-deferred) —
+ * they are recorded as skipped, visibly, never silently dropped and never
+ * fabricated into a dead-link finding.
+ *
+ * Real-fs temp fixtures per .claude/rules/testing.md — never mock the fs.
+ */
+
+import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { afterEach, describe, expect, it } from 'vitest';
+import { checkLinkLiveness } from '@/design-language/link-liveness';
+import type { ParsedDesignSpec } from '@/design-language/types';
+
+const tempDirs: string[] = [];
+
+function makeFixtureDir(): string {
+  const dir = mkdtempSync(join(tmpdir(), 'design-language-liveness-'));
+  tempDirs.push(dir);
+  return dir;
+}
+
+afterEach(() => {
+  while (tempDirs.length > 0) {
+    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
+  }
+});
+
+function specWithLink(path: string, selector: string): ParsedDesignSpec {
+  return {
+    rules: [
+      {
+        id: 'probe',
+        kind: 'palette',
+        cssLinks: [{ path, selector }],
+        examples: ['an example'],
+        dos: ['guidance'],
+        donts: [],
+      },
+    ],
+  };
+}
+
+describe('checkLinkLiveness — live selectors pass', () => {
+  it('passes a class selector defined in the referenced file', () => {
+    const dir = makeFixtureDir();
+    writeFileSync(join(dir, 'studio.css'), '.btn-primary { color: navy; }\n');
+    const result = checkLinkLiveness(specWithLink('studio.css', '.btn-primary'), dir);
+    expect(result.findings).toEqual([]);
+    expect(result.ok).toBe(true);
+  });
+
+  it('finds a selector defined inside an @media block', () => {
+    const dir = makeFixtureDir();
+    writeFileSync(
+      join(dir, 'studio.css'),
+      '@media (min-width: 80rem) {\n  .desktop-rail { width: 16rem; }\n}\n',
+    );
+    expect(checkLinkLiveness(specWithLink('studio.css', '.desktop-rail'), dir).ok).toBe(true);
+  });
+
+  it('finds a selector that appears with a pseudo-class in source', () => {
+    const dir = makeFixtureDir();
+    writeFileSync(join(dir, 'studio.css'), '.chip:hover { outline: 1px solid; }\n');
+    expect(checkLinkLiveness(specWithLink('studio.css', '.chip'), dir).ok).toBe(true);
+  });
+
+  it('finds a descendant selector sequence regardless of whitespace', () => {
+    const dir = makeFixtureDir();
+    writeFileSync(join(dir, 'studio.css'), '.masthead   nav a { text-decoration: none; }\n');
+    expect(checkLinkLiveness(specWithLink('studio.css', '.masthead nav a'), dir).ok).toBe(true);
+  });
+
+  it('resolves the css path relative to the spec base dir, including subdirectories', () => {
+    const dir = makeFixtureDir();
+    mkdirSync(join(dir, 'styles'));
+    writeFileSync(join(dir, 'styles', 'chrome.css'), '.masthead-rule { border-top: 2px solid; }\n');
+    expect(checkLinkLiveness(specWithLink('styles/chrome.css', '.masthead-rule'), dir).ok).toBe(true);
+  });
+});
+
+describe('checkLinkLiveness — dead links flagged (no app boot)', () => {
+  it('flags a selector that is not defined anywhere in the file', () => {
+    const dir = makeFixtureDir();
+    writeFileSync(join(dir, 'studio.css'), '.btn-primary { color: navy; }\n');
+    const result = checkLinkLiveness(specWithLink('studio.css', '.btn-ghost'), dir);
+    expect(result.ok).toBe(false);
+    expect(result.findings.some((f) => f.rule === 'dead-link-selector' && f.ruleId === 'probe')).toBe(
+      true,
+    );
+  });
+
+  it('flags a missing css file', () => {
+    const dir = makeFixtureDir();
+    const result = checkLinkLiveness(specWithLink('nope.css', '.btn'), dir);
+    expect(result.findings.some((f) => f.rule === 'dead-link-file')).toBe(true);
+  });
+
+  it('does not let a longer ident satisfy a shorter selector (.btn vs .btn-primary)', () => {
+    const dir = makeFixtureDir();
+    writeFileSync(join(dir, 'studio.css'), '.btn-primary { color: navy; }\n');
+    expect(checkLinkLiveness(specWithLink('studio.css', '.btn'), dir).ok).toBe(false);
+  });
+
+  it('a selector appearing only in a comment is dead', () => {
+    const dir = makeFixtureDir();
+    writeFileSync(join(dir, 'studio.css'), '/* .ghost was retired */\n.real { color: ink; }\n');
+    expect(checkLinkLiveness(specWithLink('studio.css', '.ghost'), dir).ok).toBe(false);
+  });
+
+  it('a selector appearing only inside a declaration string is dead', () => {
+    const dir = makeFixtureDir();
+    writeFileSync(join(dir, 'studio.css'), '.real::before { content: ".ghost"; }\n');
+    expect(checkLinkLiveness(specWithLink('studio.css', '.ghost'), dir).ok).toBe(false);
+  });
+
+  it('a selector appearing only as a property value token is dead', () => {
+    const dir = makeFixtureDir();
+    writeFileSync(join(dir, 'studio.css'), '.real { background: url(.ghost/x.png); }\n');
+    expect(checkLinkLiveness(specWithLink('studio.css', '.ghost'), dir).ok).toBe(false);
+  });
+});
+
+describe('checkLinkLiveness — v1 scope boundary (named-deferred, visible)', () => {
+  it('records a non-.css target as skipped — no finding, never silent', () => {
+    const dir = makeFixtureDir();
+    writeFileSync(join(dir, 'styles.ts'), 'export const btn = css`color: navy;`;\n');
+    const result = checkLinkLiveness(specWithLink('styles.ts', '.btn'), dir);
+    expect(result.findings).toEqual([]);
+    expect(result.ok).toBe(true);
+    expect(result.skipped).toHaveLength(1);
+    expect(result.skipped[0]).toMatchObject({
+      ruleId: 'probe',
+      reason: 'non-css-target',
+      link: { path: 'styles.ts', selector: '.btn' },
+    });
+  });
+});
diff --git a/plugins/design-control/src/__tests__/design-language/schema.test.ts b/plugins/design-control/src/__tests__/design-language/schema.test.ts
new file mode 100644
index 00000000..70f527e9
--- /dev/null
+++ b/plugins/design-control/src/__tests__/design-language/schema.test.ts
@@ -0,0 +1,231 @@
+/**
+ * Schema tests for the design-language spec convention (Phase 2).
+ *
+ * The spec is a HAND-AUTHORABLE markdown artifact — these tests pin the parse +
+ * structural-validation contract: rules declared under `### rule: <id>` headings
+ * with bullet fields (`kind:` / `css:` / `example:` / `do:` / `don't:`). The
+ * example-presence acceptance is here: a rule with ZERO example references is
+ * rejected (structural presence only — example truthfulness is named-deferred).
+ *
+ * Nothing in this module touches the engine or the filesystem: the schema is
+ * pure text → structure (link-liveness is the separate, fs-backed axis).
+ */
+
+import { describe, expect, it } from 'vitest';
+import { parseDesignSpec } from '@/design-language/schema';
+import { RULE_KINDS } from '@/design-language/types';
+
+const VALID_SPEC = `# Design language: deskwork studio
+
+## Palette
+
+### rule: ink-primary
+- kind: palette
+- css: styles/studio.css .btn-primary
+- example: dashboard compose button uses .btn-primary
+- do: Use the ink palette for every primary action.
+- don't: Never introduce raw hex blues outside the palette tokens.
+
+## Signature components
+
+### rule: masthead
+- kind: component
+- css: styles/studio.css .masthead
+- css: styles/chrome.css .masthead-rule
+- example: every page renders the double-rule masthead
+- example: entry-review header
+- do: Every top-level page opens with the masthead.
+`;
+
+function findingsFor(markdown: string) {
+  return parseDesignSpec(markdown).findings.map((f) => f.rule);
+}
+
+describe('parseDesignSpec — valid hand-authored spec', () => {
+  it('parses a diverse valid spec with zero findings', () => {
+    const result = parseDesignSpec(VALID_SPEC);
+    expect(result.findings).toEqual([]);
+    expect(result.ok).toBe(true);
+    expect(result.spec.rules).toHaveLength(2);
+  });
+
+  it('captures rule fields: id, kind, css links, examples, guidance', () => {
+    const result = parseDesignSpec(VALID_SPEC);
+    const [ink, masthead] = result.spec.rules;
+    expect(ink.id).toBe('ink-primary');
+    expect(ink.kind).toBe('palette');
+    expect(ink.cssLinks).toEqual([{ path: 'styles/studio.css', selector: '.btn-primary' }]);
+    expect(ink.examples).toEqual(['dashboard compose button uses .btn-primary']);
+    expect(ink.dos).toEqual(['Use the ink palette for every primary action.']);
+    expect(ink.donts).toEqual(['Never introduce raw hex blues outside the palette tokens.']);
+
+    expect(masthead.id).toBe('masthead');
+    expect(masthead.kind).toBe('component');
+    expect(masthead.cssLinks).toHaveLength(2);
+    expect(masthead.cssLinks[1]).toEqual({ path: 'styles/chrome.css', selector: '.masthead-rule' });
+    expect(masthead.examples).toHaveLength(2);
+    expect(masthead.donts).toEqual([]);
+  });
+
+  it('accepts a descendant (multi-token) selector in a css link', () => {
+    const result = parseDesignSpec(`### rule: nav-item
+- kind: component
+- css: styles/studio.css .masthead nav a
+- example: top nav
+- do: Keep nav items inside the masthead.
+`);
+    expect(result.findings).toEqual([]);
+    expect(result.spec.rules[0].cssLinks[0]).toEqual({
+      path: 'styles/studio.css',
+      selector: '.masthead nav a',
+    });
+  });
+
+  it('treats prose lines and non-field bullets as inert prose', () => {
+    const result = parseDesignSpec(`### rule: spacing-scale
+- kind: spacing
+- css: styles/studio.css .stack
+- example: entry list stacking
+
+Background prose explaining the scale.
+
+- Note: this bullet is prose, not a field (capitalised key).
+- do: Use the 4px base scale.
+`);
+    expect(result.findings).toEqual([]);
+    expect(result.spec.rules[0].dos).toEqual(['Use the 4px base scale.']);
+  });
+
+  it('exports the closed kind vocabulary', () => {
+    expect(RULE_KINDS).toEqual(['palette', 'type', 'spacing', 'component']);
+  });
+});
+
+describe('parseDesignSpec — example-presence (acceptance: zero examples rejected)', () => {
+  it('rejects a rule with zero example references', () => {
+    const result = parseDesignSpec(`### rule: ink-primary
+- kind: palette
+- css: styles/studio.css .btn-primary
+- do: Use the ink palette.
+`);
+    expect(result.ok).toBe(false);
+    expect(result.findings.some((f) => f.rule === 'missing-example' && f.ruleId === 'ink-primary')).toBe(
+      true,
+    );
+  });
+
+  it('an empty example value does not satisfy example-presence', () => {
+    const findings = findingsFor(`### rule: ink-primary
+- kind: palette
+- css: styles/studio.css .btn-primary
+- example:
+- do: Use the ink palette.
+`);
+    expect(findings).toContain('empty-field');
+    expect(findings).toContain('missing-example');
+  });
+});
+
+describe('parseDesignSpec — structural rejections', () => {
+  it('flags a document with no rules at all', () => {
+    expect(findingsFor('# Design language\n\nProse only.\n')).toContain('no-rules');
+  });
+
+  it('flags a missing kind', () => {
+    expect(
+      findingsFor(`### rule: ink
+- css: styles/studio.css .btn
+- example: a button
+- do: x
+`),
+    ).toContain('missing-kind');
+  });
+
+  it('flags a kind outside the closed vocabulary', () => {
+    expect(
+      findingsFor(`### rule: ink
+- kind: colour
+- css: styles/studio.css .btn
+- example: a button
+- do: x
+`),
+    ).toContain('unknown-kind');
+  });
+
+  it('flags a rule with no css link (every rule links to live CSS)', () => {
+    expect(
+      findingsFor(`### rule: ink
+- kind: palette
+- example: a button
+- do: x
+`),
+    ).toContain('missing-css-link');
+  });
+
+  it('flags a css link without a selector as malformed', () => {
+    expect(
+      findingsFor(`### rule: ink
+- kind: palette
+- css: styles/studio.css
+- example: a button
+- do: x
+`),
+    ).toContain('malformed-css-link');
+  });
+
+  it('flags a rule with neither do nor don’t guidance', () => {
+    expect(
+      findingsFor(`### rule: ink
+- kind: palette
+- css: styles/studio.css .btn
+- example: a button
+`),
+    ).toContain('missing-guidance');
+  });
+
+  it('flags duplicate rule ids', () => {
+    expect(
+      findingsFor(`### rule: ink
+- kind: palette
+- css: styles/studio.css .btn
+- example: a button
+- do: x
+
+### rule: ink
+- kind: palette
+- css: styles/studio.css .btn
+- example: a button
+- do: x
+`),
+    ).toContain('duplicate-rule-id');
+  });
+
+  it('flags a rule heading without an id', () => {
+    expect(findingsFor('### rule:\n- kind: palette\n')).toContain('malformed-rule-heading');
+  });
+
+  it('flags an unknown lowercase field key (typo guard, allowlist-shaped)', () => {
+    const findings = findingsFor(`### rule: ink
+- kind: palette
+- css: styles/studio.css .btn
+- exmaple: a button
+- do: x
+`);
+    expect(findings).toContain('unknown-field');
+    expect(findings).toContain('missing-example');
+  });
+
+  it('excludes invalid rules from spec.rules but keeps valid siblings', () => {
+    const result = parseDesignSpec(`### rule: broken
+- kind: palette
+
+### rule: fine
+- kind: type
+- css: styles/studio.css .serif
+- example: body copy
+- do: Use the serif stack for prose.
+`);
+    expect(result.ok).toBe(false);
+    expect(result.spec.rules.map((r) => r.id)).toEqual(['fine']);
+  });
+});
diff --git a/plugins/design-control/src/design-language/check-design-spec-cli.ts b/plugins/design-control/src/design-language/check-design-spec-cli.ts
new file mode 100644
index 00000000..ebace3ed
--- /dev/null
+++ b/plugins/design-control/src/design-language/check-design-spec-cli.ts
@@ -0,0 +1,12 @@
+/**
+ * Process entry for `bin/check-design-spec`. All behavior lives in
+ * {@link runCheckDesignSpec} (tested directly); this file only wires argv and
+ * the process exit code.
+ */
+
+import { runCheckDesignSpec } from '@/design-language/check-spec-file';
+
+process.exitCode = runCheckDesignSpec(process.argv.slice(2), {
+  out: (line) => console.log(line),
+  err: (line) => console.error(line),
+});
diff --git a/plugins/design-control/src/design-language/check-spec-file.ts b/plugins/design-control/src/design-language/check-spec-file.ts
new file mode 100644
index 00000000..91797e63
--- /dev/null
+++ b/plugins/design-control/src/design-language/check-spec-file.ts
@@ -0,0 +1,82 @@
+/**
+ * File-level entry to the design-language spec check — the enforcement seam
+ * the `/design-control:translate-design-language` skill (and the
+ * `bin/check-design-spec` shim) route EVERY spec draft through, hand-authored
+ * or engine-accelerated alike. Mirrors `@/authoring/lint-file` for wireframes:
+ * a thin composition of the existing axes, no parallel validation path.
+ */
+
+import { readFileSync } from 'node:fs';
+import { dirname, resolve } from 'node:path';
+import { checkLinkLiveness, type SkippedLink } from '@/design-language/link-liveness';
+import { parseDesignSpec } from '@/design-language/schema';
+import type { DesignSpecFinding, ParsedDesignSpec } from '@/design-language/types';
+
+export interface DesignSpecCheckResult {
+  /** True iff findings is empty (skipped links stay green but visible). */
+  readonly ok: boolean;
+  readonly spec: ParsedDesignSpec;
+  /** Schema findings followed by link-liveness findings. */
+  readonly findings: readonly DesignSpecFinding[];
+  readonly skipped: readonly SkippedLink[];
+}
+
+/**
+ * Check a design-language spec FILE: read it, validate the markdown schema,
+ * then check link-liveness with css paths resolved against the spec file's
+ * own directory. Fails loud on an unreadable file — a missing spec is an
+ * error, never a clean verdict.
+ */
+export function checkDesignSpecFile(filePath: string): DesignSpecCheckResult {
+  const absolute = resolve(filePath);
+  const markdown = readFileSync(absolute, 'utf8');
+  const parsed = parseDesignSpec(markdown);
+  const liveness = checkLinkLiveness(parsed.spec, dirname(absolute));
+  const findings = [...parsed.findings, ...liveness.findings];
+  return { ok: findings.length === 0, spec: parsed.spec, findings, skipped: liveness.skipped };
+}
+
+/** Line-oriented output sink, injected so the CLI core is testable. */
+export interface CliIo {
+  out(line: string): void;
+  err(line: string): void;
+}
+
+const USAGE = 'usage: check-design-spec <design-language-spec.md>';
+
+/**
+ * CLI core behind `bin/check-design-spec`. Exit-code contract (the skill's
+ * gate, same shape as check-wireframe):
+ *   0 — spec green (zero findings; skipped links are reported but green)
+ *   1 — findings present, or the file could not be read (descriptive error;
+ *       never a fabricated verdict)
+ *   2 — usage error
+ */
+export function runCheckDesignSpec(argv: readonly string[], io: CliIo): number {
+  if (argv.length !== 1) {
+    io.err(USAGE);
+    return 2;
+  }
+  const filePath = argv[0];
+  let result: DesignSpecCheckResult;
+  try {
+    result = checkDesignSpecFile(filePath);
+  } catch (error) {
+    io.err(error instanceof Error ? error.message : String(error));
+    return 1;
+  }
+  for (const skip of result.skipped) {
+    io.out(
+      `note: rule "${skip.ruleId}" link "${skip.link.path} ${skip.link.selector}" is a non-CSS target — not validated in v1 (CSS-in-JS / utility-framework / CSS-Modules liveness is named-deferred).`,
+    );
+  }
+  if (result.ok) {
+    io.out(`${filePath}: spec green — 0 findings (${result.spec.rules.length} rule(s))`);
+    return 0;
+  }
+  for (const finding of result.findings) {
+    io.err(`${finding.rule}${finding.ruleId ? ` (rule: ${finding.ruleId})` : ''}: ${finding.message}`);
+  }
+  io.err(`${filePath}: ${result.findings.length} finding(s)`);
+  return 1;
+}
diff --git a/plugins/design-control/src/design-language/index.ts b/plugins/design-control/src/design-language/index.ts
new file mode 100644
index 00000000..0d0f0520
--- /dev/null
+++ b/plugins/design-control/src/design-language/index.ts
@@ -0,0 +1,29 @@
+/**
+ * Public surface of the design-language spec convention (Phase 2):
+ * markdown schema (axis A, pure) + static link-liveness (axis B, fs-backed)
+ * + the file-level composition behind `bin/check-design-spec`.
+ */
+
+export {
+  RULE_KINDS,
+  type CssLink,
+  type DesignRuleKind,
+  type DesignSpecFinding,
+  type DesignSpecFindingRule,
+  type DesignSpecParseResult,
+  type DesignSpecRule,
+  type ParsedDesignSpec,
+} from '@/design-language/types';
+export { parseDesignSpec } from '@/design-language/schema';
+export {
+  checkLinkLiveness,
+  cssDefinesSelector,
+  type LivenessResult,
+  type SkippedLink,
+} from '@/design-language/link-liveness';
+export {
+  checkDesignSpecFile,
+  runCheckDesignSpec,
+  type CliIo,
+  type DesignSpecCheckResult,
+} from '@/design-language/check-spec-file';
diff --git a/plugins/design-control/src/design-language/link-liveness.ts b/plugins/design-control/src/design-language/link-liveness.ts
new file mode 100644
index 00000000..efe9ddcd
--- /dev/null
+++ b/plugins/design-control/src/design-language/link-liveness.ts
@@ -0,0 +1,170 @@
+/**
+ * Static link-liveness for design-language spec rules (Phase 2, axis B).
+ *
+ * Each rule's `css: <path> <selector>` link must point at an author-written
+ * CSS file in which the selector is DEFINED. The check is STATIC — pure file
+ * reads against source, no app boot, no engine (round-6 M1: "authoring
+ * artifacts only / no capture dependency").
+ *
+ * Scope (v1, named-deferred boundary): only `.css` targets are validated.
+ * Utility-framework, CSS-in-JS, and hashed CSS-Modules resolution are NOT
+ * validated in v1 — such links are recorded as `skipped` (visible in the
+ * result and in CLI output), never silently dropped and never fabricated into
+ * a dead-link verdict. Liveness ≠ truthfulness: a resolving selector does not
+ * prove the live CSS still matches the rule's described intent
+ * (`spec-truthfulness`, named-deferred).
+ *
+ * "Defined in source" is implemented as: the selector appears, ident-boundary
+ * exact, inside some selector prelude of the file — preludes are the text
+ * runs that precede `{` after comments and string literals are stripped and
+ * at-rule preludes are excluded (their blocks are descended into, so a rule
+ * inside `@media` counts; `content: ".ghost"` and commented-out rules do not).
+ */
+
+import { readFileSync } from 'node:fs';
+import { resolve } from 'node:path';
+import type {
+  CssLink,
+  DesignSpecFinding,
+  ParsedDesignSpec,
+} from '@/design-language/types';
+
+/** A link excluded from v1 validation, recorded visibly. */
+export interface SkippedLink {
+  readonly ruleId: string;
+  readonly link: CssLink;
+  readonly reason: 'non-css-target';
+}
+
+export interface LivenessResult {
+  /** True iff findings is empty (skipped links do not fail the check). */
+  readonly ok: boolean;
+  readonly findings: readonly DesignSpecFinding[];
+  readonly skipped: readonly SkippedLink[];
+}
+
+/** Strip CSS comments and the CONTENTS of string literals (delimiters stay). */
+function stripCommentsAndStrings(css: string): string {
+  let out = '';
+  let i = 0;
+  while (i < css.length) {
+    const ch = css[i];
+    if (ch === '/' && css[i + 1] === '*') {
+      const end = css.indexOf('*/', i + 2);
+      i = end === -1 ? css.length : end + 2;
+      continue;
+    }
+    if (ch === '"' || ch === "'") {
+      out += ch;
+      i += 1;
+      while (i < css.length && css[i] !== ch) {
+        i += css[i] === '\\' ? 2 : 1;
+      }
+      if (i < css.length) {
+        out += ch;
+        i += 1;
+      }
+      continue;
+    }
+    out += ch;
+    i += 1;
+  }
+  return out;
+}
+
+/**
+ * Collect selector preludes: text runs preceding `{`, at every nesting depth,
+ * excluding at-rule preludes (which are descended into, not matched against).
+ * Prelude buffers reset on `{`, `}`, and `;` so declaration text never leaks
+ * into selector position.
+ */
+function collectSelectorPreludes(css: string): string[] {
+  const preludes: string[] = [];
+  let buffer = '';
+  for (const ch of stripCommentsAndStrings(css)) {
+    if (ch === '{') {
+      const prelude = buffer.trim();
+      if (prelude !== '' && !prelude.startsWith('@')) {
+        preludes.push(prelude);
+      }
+      buffer = '';
+      continue;
+    }
+    if (ch === '}' || ch === ';') {
+      buffer = '';
+      continue;
+    }
+    buffer += ch;
+  }
+  return preludes;
+}
+
+/** True for characters that extend a CSS ident (would change the selector). */
+function isIdentChar(ch: string | undefined): boolean {
+  return ch !== undefined && /[A-Za-z0-9_-]/.test(ch);
+}
+
+/**
+ * True iff `selector` appears ident-boundary exact inside some selector
+ * prelude of `css`. Whitespace in a multi-token (descendant) selector is
+ * normalized on both sides before matching.
+ */
+export function cssDefinesSelector(css: string, selector: string): boolean {
+  const query = selector.trim().replace(/\s+/g, ' ');
+  if (query === '') {
+    return false;
+  }
+  for (const prelude of collectSelectorPreludes(css)) {
+    const haystack = prelude.replace(/\s+/g, ' ');
+    let from = 0;
+    while (true) {
+      const at = haystack.indexOf(query, from);
+      if (at === -1) {
+        break;
+      }
+      if (!isIdentChar(haystack[at - 1]) && !isIdentChar(haystack[at + query.length])) {
+        return true;
+      }
+      from = at + 1;
+    }
+  }
+  return false;
+}
+
+/**
+ * Check every rule's css links against source. Paths resolve relative to
+ * `baseDir` (the spec file's directory). Missing file → `dead-link-file`;
+ * selector not defined → `dead-link-selector`; non-.css target → skipped.
+ */
+export function checkLinkLiveness(spec: ParsedDesignSpec, baseDir: string): LivenessResult {
+  const findings: DesignSpecFinding[] = [];
+  const skipped: SkippedLink[] = [];
+  for (const rule of spec.rules) {
+    for (const link of rule.cssLinks) {
+      if (!link.path.toLowerCase().endsWith('.css')) {
+        skipped.push({ ruleId: rule.id, link, reason: 'non-css-target' });
+        continue;
+      }
+      const absolute = resolve(baseDir, link.path);
+      let css: string;
+      try {
+        css = readFileSync(absolute, 'utf8');
+      } catch {
+        findings.push({
+          rule: 'dead-link-file',
+          message: `Rule "${rule.id}" links to "${link.path}" which does not resolve to a readable file (looked at ${absolute}).`,
+          ruleId: rule.id,
+        });
+        continue;
+      }
+      if (!cssDefinesSelector(css, link.selector)) {
+        findings.push({
+          rule: 'dead-link-selector',
+          message: `Rule "${rule.id}" links to selector "${link.selector}" which is not defined in "${link.path}".`,
+          ruleId: rule.id,
+        });
+      }
+    }
+  }
+  return { ok: findings.length === 0, findings, skipped };
+}
diff --git a/plugins/design-control/src/design-language/schema.ts b/plugins/design-control/src/design-language/schema.ts
new file mode 100644
index 00000000..d50fa8c7
--- /dev/null
+++ b/plugins/design-control/src/design-language/schema.ts
@@ -0,0 +1,231 @@
+/**
+ * Markdown schema parser/validator for the design-language spec convention
+ * (Phase 2, axis A — pure text → structure; NO filesystem, NO engine).
+ *
+ * Convention (hand-authorable):
+ *   - a rule is declared by an ATX heading whose text is `rule: <id>`
+ *     (any heading level); the rule's section runs to the next heading;
+ *   - fields are single-line bullets `- <key>: <value>` with the CLOSED key set
+ *     `kind` / `css` / `example` / `do` / `don't`;
+ *   - `css: <path> <selector>` — first token is the file path, the remainder is
+ *     the selector (descendant selectors allowed);
+ *   - other prose (paragraphs, capitalised-key bullets) is inert.
+ *
+ * Validation per rule: kind from the closed vocabulary; ≥1 css link; ≥1
+ * example (structural presence only — example truthfulness is the
+ * named-deferred `spec-truthfulness`); ≥1 do/don't guidance line. A lowercase
+ * single-word bullet key outside the closed set is an `unknown-field` finding
+ * (typo guard) — silently dropping a misspelled `example:` would otherwise
+ * fabricate a missing-example rejection with no visible cause.
+ */
+
+import {
+  RULE_KINDS,
+  type CssLink,
+  type DesignRuleKind,
+  type DesignSpecFinding,
+  type DesignSpecParseResult,
+  type DesignSpecRule,
+} from '@/design-language/types';
+
+const HEADING_RE = /^#{1,6}\s+(.*)$/;
+const RULE_HEADING_RE = /^rule:\s*(.*)$/;
+/** A field bullet: lowercase single-word key (apostrophe allowed: `don't`). */
+const FIELD_BULLET_RE = /^[-*]\s+([a-z][a-z']*)\s*:\s*(.*)$/;
+
+const KNOWN_KEYS = ['kind', 'css', 'example', 'do', "don't"] as const;
+type FieldKey = (typeof KNOWN_KEYS)[number];
+
+function isKnownKey(key: string): key is FieldKey {
+  return (KNOWN_KEYS as readonly string[]).includes(key);
+}
+
+function isRuleKind(value: string): value is DesignRuleKind {
+  return (RULE_KINDS as readonly string[]).includes(value);
+}
+
+/** A rule section under one `rule:` heading, before validation. */
+interface RawRuleSection {
+  readonly id: string;
+  readonly headingLine: number;
+  kind?: string;
+  readonly cssLinks: CssLink[];
+  readonly examples: string[];
+  readonly dos: string[];
+  readonly donts: string[];
+}
+
+interface FieldSink {
+  readonly section: RawRuleSection;
+  readonly findings: DesignSpecFinding[];
+}
+
+function recordField(sink: FieldSink, key: FieldKey, value: string, line: number): void {
+  const { section, findings } = sink;
+  if (value === '') {
+    findings.push({
+      rule: 'empty-field',
+      message: `Field "${key}:" has an empty value.`,
+      ruleId: section.id,
+      line,
+    });
+    return;
+  }
+  switch (key) {
+    case 'kind':
+      section.kind = value;
+      return;
+    case 'css': {
+      const spaceAt = value.search(/\s/);
+      if (spaceAt === -1) {
+        findings.push({
+          rule: 'malformed-css-link',
+          message: `css link "${value}" names a file but no selector — expected "css: <path> <selector>".`,
+          ruleId: section.id,
+          line,
+        });
+        return;
+      }
+      section.cssLinks.push({
+        path: value.slice(0, spaceAt),
+        selector: value.slice(spaceAt).trim(),
+      });
+      return;
+    }
+    case 'example':
+      section.examples.push(value);
+      return;
+    case 'do':
+      section.dos.push(value);
+      return;
+    case "don't":
+      section.donts.push(value);
+      return;
+  }
+}
+
+function validateSection(section: RawRuleSection, findings: DesignSpecFinding[]): DesignSpecRule | undefined {
+  const problems: DesignSpecFinding[] = [];
+  const at = { ruleId: section.id, line: section.headingLine };
+  if (section.kind === undefined) {
+    problems.push({ rule: 'missing-kind', message: `Rule "${section.id}" has no "kind:" field.`, ...at });
+  } else if (!isRuleKind(section.kind)) {
+    problems.push({
+      rule: 'unknown-kind',
+      message: `Rule "${section.id}" has kind "${section.kind}" — expected one of: ${RULE_KINDS.join(', ')}.`,
+      ...at,
+    });
+  }
+  if (section.cssLinks.length === 0) {
+    problems.push({
+      rule: 'missing-css-link',
+      message: `Rule "${section.id}" links to no live CSS — every rule needs ≥1 "css: <path> <selector>".`,
+      ...at,
+    });
+  }
+  if (section.examples.length === 0) {
+    problems.push({
+      rule: 'missing-example',
+      message: `Rule "${section.id}" carries zero example references — every rule needs ≥1 "example:".`,
+      ...at,
+    });
+  }
+  if (section.dos.length === 0 && section.donts.length === 0) {
+    problems.push({
+      rule: 'missing-guidance',
+      message: `Rule "${section.id}" has neither a "do:" nor a "don't:" guidance line.`,
+      ...at,
+    });
+  }
+  findings.push(...problems);
+  if (problems.length > 0 || section.kind === undefined || !isRuleKind(section.kind)) {
+    return undefined;
+  }
+  return {
+    id: section.id,
+    kind: section.kind,
+    cssLinks: section.cssLinks,
+    examples: section.examples,
+    dos: section.dos,
+    donts: section.donts,
+  };
+}
+
+/**
+ * Parse + structurally validate a design-language spec. Pure: text in,
+ * structure + findings out. `spec.rules` carries only the structurally-valid
+ * rules; every defect is a finding (never a silent drop).
+ */
+export function parseDesignSpec(markdown: string): DesignSpecParseResult {
+  const findings: DesignSpecFinding[] = [];
+  const sections: RawRuleSection[] = [];
+  const seenIds = new Set<string>();
+  let current: RawRuleSection | undefined;
+
+  const lines = markdown.split('\n');
+  for (let i = 0; i < lines.length; i += 1) {
+    const line = lines[i].trimEnd();
+    const lineNo = i + 1;
+    const heading = HEADING_RE.exec(line.trim());
+    if (heading !== null) {
+      current = undefined;
+      const ruleHeading = RULE_HEADING_RE.exec(heading[1].trim());
+      if (ruleHeading === null) {
+        continue;
+      }
+      const id = ruleHeading[1].trim();
+      if (id === '') {
+        findings.push({
+          rule: 'malformed-rule-heading',
+          message: `Rule heading at line ${lineNo} has no id — expected "rule: <id>".`,
+          line: lineNo,
+        });
+        continue;
+      }
+      if (seenIds.has(id)) {
+        findings.push({
+          rule: 'duplicate-rule-id',
+          message: `Rule id "${id}" is declared more than once.`,
+          ruleId: id,
+          line: lineNo,
+        });
+        continue;
+      }
+      seenIds.add(id);
+      current = { id, headingLine: lineNo, cssLinks: [], examples: [], dos: [], donts: [] };
+      sections.push(current);
+      continue;
+    }
+    if (current === undefined) {
+      continue;
+    }
+    const bullet = FIELD_BULLET_RE.exec(line.trim());
+    if (bullet === null) {
+      continue;
+    }
+    const key = bullet[1];
+    if (!isKnownKey(key)) {
+      findings.push({
+        rule: 'unknown-field',
+        message: `Unknown field "${key}:" — known fields are: ${KNOWN_KEYS.join(', ')}.`,
+        ruleId: current.id,
+        line: lineNo,
+      });
+      continue;
+    }
+    recordField({ section: current, findings }, key, bullet[2].trim(), lineNo);
+  }
+
+  if (sections.length === 0) {
+    findings.push({
+      rule: 'no-rules',
+      message: 'The spec declares no rules — expected ≥1 "rule: <id>" heading.',
+    });
+  }
+
+  const rules = sections
+    .map((section) => validateSection(section, findings))
+    .filter((rule): rule is DesignSpecRule => rule !== undefined);
+
+  return { ok: findings.length === 0, spec: { rules }, findings };
+}
diff --git a/plugins/design-control/src/design-language/types.ts b/plugins/design-control/src/design-language/types.ts
new file mode 100644
index 00000000..77f3afdc
--- /dev/null
+++ b/plugins/design-control/src/design-language/types.ts
@@ -0,0 +1,89 @@
+/**
+ * Shared types for the design-language spec convention (Phase 2).
+ *
+ * A design-language spec is a HAND-AUTHORABLE markdown artifact — the visual
+ * *letter* reference of the design-control discipline (the lo-fi wireframe is
+ * the UX *spirit*). The schema is allowlist-shaped like the rest of this
+ * plugin: a closed kind vocabulary, a closed field-key set (typos surface as
+ * findings, never silently drop), and per-rule structural requirements —
+ * ≥1 live-CSS link, ≥1 example reference, ≥1 do/don't guidance line.
+ *
+ * Extracted so the pure-text schema axis (`schema.ts`) and the fs-backed
+ * link-liveness axis (`link-liveness.ts`) share one taxonomy without a cycle
+ * (mirrors `@/lint/types`).
+ */
+
+/**
+ * Closed vocabulary of rule kinds, single-sourced as a `const ... as const`
+ * array (mirroring `ENGINE_METHODS` / `FAILURE_MODES`): palette / type /
+ * spacing tokens + the signature-component vocabulary.
+ */
+export const RULE_KINDS = ['palette', 'type', 'spacing', 'component'] as const;
+
+export type DesignRuleKind = (typeof RULE_KINDS)[number];
+
+/**
+ * A rule's link to live CSS: a path to an author-written CSS file (relative to
+ * the spec file) plus the selector the rule is anchored to. The selector may be
+ * multi-token (descendant combinators); the path is the first whitespace-free
+ * token of the `css:` field value.
+ */
+export interface CssLink {
+  readonly path: string;
+  readonly selector: string;
+}
+
+/** One structurally-valid rule parsed out of a design-language spec. */
+export interface DesignSpecRule {
+  /** The id from the `### rule: <id>` heading. */
+  readonly id: string;
+  /** Kind from the closed {@link RULE_KINDS} vocabulary. */
+  readonly kind: DesignRuleKind;
+  /** ≥1 live-CSS link (the link-liveness axis verifies each). */
+  readonly cssLinks: readonly CssLink[];
+  /** ≥1 example reference (structural presence only; truthfulness deferred). */
+  readonly examples: readonly string[];
+  /** `do:` guidance lines. */
+  readonly dos: readonly string[];
+  /** `don't:` guidance lines. */
+  readonly donts: readonly string[];
+}
+
+/** Finding taxonomy across both axes (schema structure + link-liveness). */
+export type DesignSpecFindingRule =
+  // axis A — markdown schema structure
+  | 'no-rules'
+  | 'malformed-rule-heading'
+  | 'duplicate-rule-id'
+  | 'missing-kind'
+  | 'unknown-kind'
+  | 'missing-css-link'
+  | 'malformed-css-link'
+  | 'missing-example'
+  | 'missing-guidance'
+  | 'unknown-field'
+  | 'empty-field'
+  // axis B — static link-liveness against author-written CSS source
+  | 'dead-link-file'
+  | 'dead-link-selector';
+
+export interface DesignSpecFinding {
+  readonly rule: DesignSpecFindingRule;
+  readonly message: string;
+  /** The spec rule the finding is about, when rule-scoped. */
+  readonly ruleId?: string;
+  /** 1-based markdown source line, when known. */
+  readonly line?: number;
+}
+
+/** The parsed spec: structurally-valid rules only (invalid rules are findings). */
+export interface ParsedDesignSpec {
+  readonly rules: readonly DesignSpecRule[];
+}
+
+export interface DesignSpecParseResult {
+  /** True iff findings is empty. */
+  readonly ok: boolean;
+  readonly spec: ParsedDesignSpec;
+  readonly findings: readonly DesignSpecFinding[];
+}


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
