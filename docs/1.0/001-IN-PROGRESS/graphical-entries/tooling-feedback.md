# Tooling Feedback — graphical-entries (scope-discovery dogfood)

Running log of friction, pathologies, and improvement opportunities in the scope-discovery + duplication tooling, captured during graphical-entries implementation as the v1 dogfood signal. Each entry is one observable friction point with a Repro / Workaround / Suggested-fix shape; the log is append-only (entries are never deleted — closed ones get a `Status` line + closing-commit reference).

## How to operate this log

- File entries the moment friction surfaces — don't batch them; the cumulative set teaches more than a single end-of-feature "audit."
- Use the category legend below; pick severity by impact on the operator (`high` blocks work or hides bugs; `medium` slows work meaningfully; `low` is a papercut).
- Never delete an entry. Closed entries stay in the log with their closing-commit SHA + a one-line summary of the fix.
- Each entry's body is **Repro → Workaround used → Suggested fix** — operator-recognizable shapes, not just "make it better."
- Promote an entry to a GitHub issue when it needs explicit triage (architecture-level concern, recurring pattern across audits, design decision). TF entries that stay tooling-internal stay in this log.

## Category legend

- **A** — anti-patterns registry
- **AM** — adopter-manifests registry
- **CL** — clones.yaml + clone-detector
- **GATE** — pre-commit / hook ergonomics
- **DSC** — discovery agents / synthesis
- **MISC** — everything else (build, packaging, agent dispatch hygiene, ergonomics)

## Severity legend

- **high** — blocks work or hides bugs
- **medium** — slows work meaningfully
- **low** — papercut

## Status summary

| TF | Status | Closing commit |
|---|---|---|
| TF-001 | Open | — |
| TF-002 | Open | — |
| TF-003 | Open | — |
| TF-004 | Closed | dw-lifecycle v0.24.2 — bin shim now probes the full declared-deps set (tsx + yaml + zod + ajv + ajv-formats + jscpd); `repair-install.sh` gained `plugin_declared_deps()` probe logic |
| TF-005 | Closed | dw-lifecycle v0.24.2 — `wrap-prompt` + `validate-return` CLI subcommands shipped; round-trip verified |
| TF-006 | Closed | dw-lifecycle v0.24.1 — `modules` minItems relaxed; bootstrap manifest now valid |
| TF-007 | Closed | dw-lifecycle v0.24.1 — `dw-lifecycle orchestrator-turn --feature <slug>` CLI subcommand shipped |
| TF-008 | Open | — |
| TF-009 | Open | — |
| TF-010 | Open | — |

## How to add an entry

1. Hit friction or pathology or notice an improvement opportunity.
2. Pick a category (A / AM / CL / GATE / DSC / MISC) and severity (high / medium / low).
3. Append a new section at the bottom (or insert by topic if it pairs with an existing entry) with the next TF-NNN id.
4. Include: Repro (what happened), Workaround used (what unblocked), Suggested fix (the operator-recognizable shape of a fix, not just "make it better").
5. Commit alongside the work that surfaced it.

---

## TF-001 · GATE · high · `install-scope-discovery-hooks` reports success but hooks silently skipped when husky's `.husky/_` dispatcher isn't bootstrapped

**Repro:**

1. In a fresh worktree without `node_modules/` (no `npm install` run yet), with `package.json` containing `"husky": "^9.x"` and a `prepare` script invoking husky, run `dw-lifecycle install-scope-discovery-hooks` (v0.23.0).
2. The skill reports `mode=husky`, writes (or confirms) `.husky/pre-commit` with the managed scope-discovery block, and updates `.dw-lifecycle/scope-discovery/hooks-installed.json`. Output looks like success.
3. `git config --get core.hooksPath` returns `.husky/_`.
4. `ls .husky/_` — directory doesn't exist (husky's npm `prepare` script never ran).
5. `git commit -m 'anything'` succeeds with **zero hook invocations** (git silently skips missing hooks-path dirs). The dogfood gate chain doesn't fire.

Surfaced in this worktree during the 2026-05-25 dogfood install: three commits (`7bdf026`, `1e31f06`, `2a17d8d`) committed cleanly with the managed block already in place; the pre-commit hook was a no-op because `.husky/_` wasn't bootstrapped.

**Workaround used:**

Ran `npm install` in the worktree (377 packages added, husky's `prepare` script bootstrapped `.husky/_` automatically). Re-tested by invoking `bash .husky/pre-commit` directly — all five gates (`detect-clones`, `check-anti-patterns`, `check-adopters`, `check-disposition-survivor`, `check-editor-symmetry`) ran cleanly.

**Suggested fix:**

- **Light:** the skill prints a warning at the end of install when husky-detected AND `.husky/_` doesn't exist: `"husky dispatcher not bootstrapped — run \`npm install\` before committing or hooks will silently skip"`. Documentation note in the canary install path: "the dogfood install assumes `npm install` has been run in the worktree." Cheapest fix; relies on operator reading the warning.
- **Medium:** the skill detects the missing `.husky/_` and runs `npm install` itself (or `npm install --ignore-scripts` plus `npx husky install`) as part of the install flow. Adopter-friendly: a single `install-scope-discovery-hooks` call fully arms the hook chain regardless of whether the worktree has been bootstrapped.
- **Heavy:** ship a post-install verification step that does a synthetic empty commit (`git commit --allow-empty -m 'dw-lifecycle: verify hooks fire'`) on a throwaway test ref, asserts the hook output appears, and rolls back. Surfaces the silently-skipped failure mode immediately and gives the operator a green-light signal.

Recommended: **Medium**. The Light variant relies on operators noticing the warning; the dogfood-handoff already named "every commit on this feature exercises scope-discovery's pre-commit hooks" as a first-class deliverable, so silently-skipped hooks defeats the dogfood contract. Medium completes the install in one operator-recognizable step.

## TF-002 · GATE · medium · `hooks-installed.json` accumulates entries across worktrees (committed manifest pollutes new worktrees)

**Repro:**

1. In worktree A (`/Users/orion/work/deskwork-work/scope-discovery`), run `install-scope-discovery-hooks` on 2026-05-25 at 10:58Z. Manifest at `.dw-lifecycle/scope-discovery/hooks-installed.json` records three files: worktree A's `.husky/pre-commit`, `.claude/agents/code-reviewer.md`, `.claude/agents/codebase-auditor.md` — all with worktree A's absolute paths.
2. Commit the manifest to the scope-discovery branch; eventually merge to main.
3. Create worktree B (`/Users/orion/work/deskwork-work/graphical-entries`) off main. The manifest file is now present in worktree B with worktree A's paths.
4. In worktree B, run `install-scope-discovery-hooks` on 2026-05-25 at 21:59Z. The manifest is updated — but the install **appends** worktree B's entry (`/Users/orion/work/deskwork-work/graphical-entries/.husky/pre-commit`) to the existing file rather than replacing stale entries. Result: a 4-entry manifest mixing two worktrees' paths.

**Workaround used:**

Left the stale entries in place (cosmetic only — they don't affect hook firing, just tracking). The operator-visible manifest now records files that don't exist at the listed paths from this worktree's perspective.

**Suggested fix:**

The manifest is a transactional record of where THIS install put managed files, not a permanent project artifact. Two shapes:

- **Light:** gitignore `.dw-lifecycle/scope-discovery/hooks-installed.json`. Each worktree maintains its own local manifest; nothing leaks across worktrees. Simplest; the cost is loss of audit trail at the commit level (which the journal can carry instead).
- **Medium:** on install, the skill computes the absolute realpath of the target worktree and removes any entries from the manifest whose realpath doesn't resolve under the current target. Net effect: re-running install in a fresh worktree replaces stale cross-worktree entries with this worktree's; manifests stay clean per-install.
- **Heavy:** namespace the manifest by worktree — `.dw-lifecycle/scope-discovery/hooks-installed/<realpath-hash>.json`. Each worktree's install writes its own file. Inspectable + multi-worktree-aware. Heaviest; probably overkill.

Recommended: **Light** (gitignore). The manifest is transactional state, not source-of-truth — exactly the shape that belongs outside version control. Closes the surface; the journal preserves any audit need.

## TF-003 · MISC · medium · `/dw-lifecycle:issues` partial back-fill — phase headings + README Status table + Key Links not updated

**Repro:**

1. Set up a feature via `/dw-lifecycle:setup`; elaborate the workplan with phases.
2. Run `dw-lifecycle issues <slug>` (v0.23.0). The helper creates the parent issue (`#301` in this case) + per-phase issues (`#302`..`#313`) and back-fills two things:
   - PRD frontmatter `parentIssue: "#NNN"`
   - README frontmatter `parentIssue: "#NNN"`
3. What it does NOT back-fill:
   - Workplan phase headings (`## Phase N: <name>`) — no issue link appended; tracking has to be hand-maintained.
   - README's Status table (still shows the `/dw-lifecycle:setup` template placeholder: `| 1 | [Phase 1 name] | Not started |`, no rows for the rest of the phases, no issue column).
   - README's Key Links "Parent Issue: " line (frontmatter is back-filled but the prose-rendered link in Key Links stays blank).

Surfaced in this worktree on 2026-05-25 after invoking `dw-lifecycle issues graphical-entries`: 13 issues created (1 parent + 12 phase), only frontmatter back-filled, all the operator-visible tracking surfaces (workplan phase headings + README Status table + README Key Links parent link) stayed in their pre-issues-filing state.

**Workaround used:**

Hand-edited the workplan to append `· [#NNN](https://github.com/<org>/<repo>/issues/<NNN>)` to each phase heading; rewrote the README's Status table from scratch with a row per phase + issue link column + "Closing" milestone row + status column; hand-filled the Key Links parent issue line + a real description paragraph.

That's ~50 lines of editing per feature, every time `/dw-lifecycle:issues` runs. For features with many phases (this one has 13 rows) the manual back-fill is non-trivial and easy to skip — which leaves the tracking surfaces visibly stale.

**Suggested fix:**

- **Light:** the skill's report at the end of run prints a list of the back-fills the operator still needs to make manually (workplan phase headings, README Status table rows, README Key Links parent link) with the specific edit strings to paste. Cheapest; relies on operator reading + executing.
- **Medium:** the skill itself walks the workplan's `## Phase N: <name>` headings and appends `· [#NNN](<url>)` to each; walks the README's Status table and replaces / extends rows; updates the Key Links parent line. Closes the surface in one operator-recognizable invocation — the same atomic feel as the frontmatter back-fill already has.
- **Heavy:** introduce a `--render-status` flag that re-renders the entire README from a template using the workplan + the issue tree as inputs; gives the operator the option to keep the README purely derived (per-task status badges, completion percentages, etc.). Heavier; couples the feature documentation tightly to the issues skill.

Recommended: **Medium**. The frontmatter back-fill already happens; the operator-visible surfaces (workplan headings, README table, Key Links) are the same kind of back-fill at the prose layer. Closing that gap matches operator expectations ("`/dw-lifecycle:issues` ran; everything tracking-related is now wired up"). Light leaves the documentation drift open every cycle.

## TF-004 · MISC · high · `dw-lifecycle` bin shim fails on first invocation — declared deps not installed; `repair-install.sh` reports healthy

**Status (2026-05-28, dw-lifecycle v0.24.2):** **CLOSED — Light + Medium fixes shipped together.** Bin shim grew 62 → 193 lines; comment at line 21 names the full runtime-deps set (`tsx + yaml + zod + ajv + ajv-formats + jscpd`); line 87 carries the dep-probe loop (`for dep in tsx yaml zod ajv ajv-formats jscpd`). `repair-install.sh` gained `plugin_declared_deps()` (line 181), `plugin_missing_deps()` (line 196), and an inline comment at line 230 explicitly naming this entry's failure mode (*"clone's node_modules missing ajv etc., but --check says healthy"*) — exactly the false-positive surface called out. Empirically re-verified: post-bump install reports `all plugins healthy` via `repair-install.sh --check`, and `dw-lifecycle --help` returns the full subcommand listing without `ERR_MODULE_NOT_FOUND`. Both code-level Light (bin shim) and Medium (repair-install probe) fixes are present.


**Repro:**

1. Fresh-ish marketplace install of deskwork (this session, dw-lifecycle v0.24.0). `~/.claude/plugins/marketplaces/deskwork/plugins/dw-lifecycle/node_modules/` contains tsx, yaml, zod (the shell-script-resolver deps the bin shim greps for) plus some transitive packages.
2. Invoke `~/.claude/plugins/marketplaces/deskwork/plugins/dw-lifecycle/bin/dw-lifecycle --help`.
3. CLI exits 1 immediately with `ERR_MODULE_NOT_FOUND: Cannot find package 'ajv' imported from .../schema/manifest-validator.ts`.
4. Run `~/.claude/plugins/marketplaces/deskwork/scripts/repair-install.sh --check` → reports `all plugins healthy.` (false negative — health check doesn't detect missing transitive deps in plugin's declared `package.json` dependencies).
5. Run repair without `--check` (full repair attempt) → same false-positive `all plugins healthy.` output; no recovery action taken.

The plugin's `package.json` declares `ajv`, `ajv-formats`, `jscpd` as runtime dependencies. None of them were installed. The bin shim's first-run resolver only checks for `tsx`'s presence, not for the rest of the declared deps.

**Workaround used:**

Manually ran `cd ~/.claude/plugins/marketplaces/deskwork/plugins/dw-lifecycle && npm install --omit=dev --workspaces=false` — installed 125 packages including ajv. CLI works after that. Total recovery: one operator-typed npm install command.

But the workaround is recoverable ONLY if the operator notices the failure shape (the `ERR_MODULE_NOT_FOUND: ajv` traceback). Adopters whose agent silently swallows the error — or whose agent reports "dw-lifecycle is broken, can't use scope-discovery" without diagnosing — get stuck. The repair-install false positive is what tips this from a low-friction one-time install bug into a high-friction packaging-UX defect: the operator's diagnostic path (`repair-install.sh --check`) actively lies about the state.

**Suggested fix:**

- **Light:** the bin shim's first-run resolver runs `npm install --omit=dev --workspaces=false` IF any declared dep beyond tsx is missing (probe by checking for ajv specifically OR by checking `node_modules/.ts-node-status` sentinel file the shim writes after a successful install). Closes the surface in one place — the bin shim ALREADY handles the "tsx missing → install" path; this extends the same logic to the full dep set.
- **Medium:** the repair-install.sh check phase walks every plugin's `package.json` dependencies and tests `require.resolve()` (or equivalent ESM resolver probe) for each declared dep. A missing dep flips the plugin's status from "healthy" to "needs repair"; the unconditional-repair phase runs `npm install --omit=dev --workspaces=false` against the plugin. Light handles the first invocation cleanly; Medium fixes the diagnostic story.
- **Heavy:** the marketplace install itself runs `npm install --omit=dev` against every plugin's `package.json` at sparse-clone time (a marketplace post-install hook on `/plugin marketplace add`). Adopters never encounter a "plugin's deps aren't installed" state; the install path is genuinely first-class.

Recommended: **Light + Medium together**. Light makes the first-invocation experience self-healing (the most common adopter scenario); Medium makes the diagnostic path truthful (a stuck operator running `repair-install.sh --check` gets accurate state, not a lie). Heavy is the right end-state but the cost is higher; revisit once the marketplace install hook landscape is fully fleshed out.

Cross-reference: pairs with the project's "Marketplace-scripts contract" rule in `.claude/rules/agent-discipline.md` — the repair-install.sh script's path + flag set + behavior is documented for adopters and the `--check`-reports-healthy false-positive contradicts the contract that `--check` truthfully reports state.

## TF-005 · DSC · high · `dispatch-wrapper` is library-only; orchestrator (Claude session) has no operator-facing way to engage it

**Status (2026-05-28, dw-lifecycle v0.24.2):** **CLOSED — Medium fix shipped.** Two new CLI subcommands wire the orchestrator into the wrap() engine:

```bash
$ dw-lifecycle wrap-prompt --agent-type typescript-pro --prompt-file <path>
# → augmented prompt to stdout (GRAMMAR_INSTRUCTION + refactor prelude if applicable)

$ dw-lifecycle validate-return --response-file <path> --agent-type typescript-pro
# → ValidationResult JSON to stdout; exit 0 valid, exit 1 reject (re-dispatch with correction)
```

Re-tested empirically:

```bash
$ RTN=$(mktemp); printf 'Searched: pattern — 3 matches\nIncluded: foo.ts:1\nExcluded: bar.ts:5 — different primitive (CodeMirror)' > "$RTN"
$ dw-lifecycle validate-return --response-file "$RTN" --agent-type typescript-pro
{ ... "missingBlocks": [], "parseError": null, "forbiddenPhrases": [],
  "refactorPreconditionViolations": [], "skippedAudit": null,
  "summary": "validate-return: response valid for agent-type=typescript-pro" }
validate-return: response valid for agent-type=typescript-pro
$ echo $?
0
```

Both subcommands match the recommended Medium-fix shape exactly: `wrap-prompt` augments the prompt-file with `GRAMMAR_INSTRUCTION` + refactor prelude (when refactor-marker detected) for the orchestrator to feed into Agent dispatch; `validate-return` parses + validates the response with the same rules the library applies; exit codes drive re-dispatch decisions. The hand-inlining workaround retires forward; subsequent implementer / reviewer / code-explorer dispatches in this pilot will engage via CLI piping.



**Repro:**

1. Read `/dw-lifecycle:implement` SKILL.md (v0.24.0) § "Dispatch-wrapper engagement": *"Every sub-agent dispatch fired by this skill — implementer, reviewer, code-explorer, code-architect, parallel fan-out workers — MUST be routed through `wrap()` from `plugins/dw-lifecycle/src/scope-discovery/dispatch-wrapper.ts`."*
2. Open `dispatch-wrapper.ts`. The module-doc explicitly says: *"Library-only — no CLI subcommand. Consumed in TypeScript by other dw-lifecycle skills or by external orchestrators that import `@deskwork/plugin-dw-lifecycle`. ... Callers pass a `dispatchFn` callback — the orchestrator supplies a real dispatcher; the adversarial harness passes synthetic responses."*
3. The orchestrator (the Claude Code session running `/dw-lifecycle:implement`) drives sub-agent dispatch via Claude Code's Agent tool — a tool-use primitive, not a TypeScript callable. There's no way for the orchestrator to "supply a real `dispatchFn`" that calls the Agent tool from inside `wrap()`; the Agent tool is owned by the runtime, not by user code.
4. Net effect: the SKILL.md *says* every dispatch must be routed through `wrap()`, but the orchestrator has no execution path that actually invokes `wrap()`. The contract is unenforceable as documented.

The only viable workaround the orchestrator can execute is to **manually enforce** the wrapper's contract: prepend the GRAMMAR_INSTRUCTION text (Searched / Included / Excluded blocks + forbidden-deferral-phrase list + refactor-preconditions prelude when relevant) to every sub-agent prompt by hand, then parse + validate the sub-agent's response against the same rules in the orchestrator's own logic. That works — but it's exactly the kind of "passive directive that gets systematically ignored" the wrapper's docstring says it was written to replace.

**Workaround used:**

For this implementation pass, the orchestrator is hand-inlining the GRAMMAR_INSTRUCTION text into every dispatched prompt (extracted from `dispatch-wrapper.ts`'s `GRAMMAR_INSTRUCTION` export → pasted verbatim into the dispatch prompt), AND hand-checking the agent's return for the three required blocks before accepting it. The forbidden-deferral phrase list is the built-in `FORBIDDEN_DEFERRAL_PHRASES` from `dispatch-grammar.ts` (no project override file present at `.dw-lifecycle/scope-discovery/forbidden-deferral-phrases.yaml`, so the defaults apply).

**Suggested fix:**

- **Light:** rewrite the SKILL.md § "Dispatch-wrapper engagement" to describe what the orchestrator can ACTUALLY do — "prepend `GRAMMAR_INSTRUCTION` to every dispatch prompt; on return, parse the three blocks and reject responses missing any block / containing a forbidden deferral phrase / matching the skipped-audit shape." Treat `wrap()` as the engine that an orchestrator-side helper reproduces, not as a function the runtime can call. Cheapest; documentation-only; the orchestrator now has a procedure that matches what it can do.
- **Medium:** ship a CLI shim `dw-lifecycle wrap-prompt <agentType> <prompt-file>` that the orchestrator calls before each Agent dispatch. The shim reads the prompt-file, augments via the same code path `wrap()` uses (refactor-marker detection, project-override loading, grammar instruction append), and prints the augmented prompt to stdout for the orchestrator to copy into the Agent call. A companion `dw-lifecycle validate-return <response-file>` parses + validates the sub-agent's response. The orchestrator pipes: (1) prepare augmented prompt via wrap-prompt; (2) Agent tool dispatch with that prompt; (3) validate response via validate-return; (4) on rejection, re-prompt. This is the closest the orchestrator can get to "engaging `wrap()`" given the Agent tool's runtime-owned nature.
- **Heavy:** Claude Code-side primitive — Anthropic ships a sub-agent dispatch wrapper that user-supplied middleware can compose with. Out of scope for this plugin; orthogonal concern.

Recommended: **Light + Medium together**. Light closes the documentation contradiction immediately (operators reading the SKILL.md learn what they CAN do, not what `wrap()`'s signature suggests). Medium is the principled engineering fix: the dispatch-wrapper's enforcement logic stays in one place (the TS library), and the orchestrator engages it through a thin CLI bridge. Without Medium, every orchestrator session re-implements the parse + validate logic by hand and drift inevitably surfaces. Heavy is the right long-term answer but depends on Claude Code primitives the plugin doesn't own.

Cross-reference: the orchestrator's manual-enforcement workaround means this pilot's dispatches WILL have the grammar instruction + forbidden-deferral rejection in place; the friction is on the implementation cost (every dispatch prompt grows by the instruction body — ~50 lines per dispatch — and the orchestrator owns the parse logic in-prompt rather than via library).

## TF-006 · DSC · high · `scope-inventory` baseline pass fails on schema validation (empty `/modules`); blocks `scope-widen` auto-invocation between tasks

**Status (2026-05-28, dw-lifecycle v0.24.1):** **CLOSED — fix verified.** The `modules` minItems constraint was relaxed (Light fix). Re-tested empirically:

```bash
$ dw-lifecycle scope-inventory --slug graphical-entries --quiet
pattern-matrix: unmatched-shape clustering pass is a STUB (stub; tracking #318). The polymorphic dispatcher is shipped; the clustering algorithm lands under issue #318. discovered_candidates returns [] until then.
$ echo $?
0
$ ls docs/1.0/001-IN-PROGRESS/graphical-entries/scope-manifest.yaml
docs/1.0/001-IN-PROGRESS/graphical-entries/scope-manifest.yaml
```

The bootstrap manifest now writes with `modules: []` (valid greenfield state); `discovery_themes` carries occurrence counts; `reference_docs` enumerates PRD + LAYOUT.md as synthesis anchors. Downstream `scope-widen` invocation also runs cleanly against the baseline:

```bash
$ dw-lifecycle scope-widen "Phase 5 introduces multi-lane swimlane dashboard ..." --slug graphical-entries
... scope-widen delta — 0 addition(s):
$ echo $?
0
```

Both the bootstrap state and the next-task between-task auto-invocation now work end-to-end.


**Repro:**

1. From the feature worktree (no prior `scope-manifest.yaml` exists at `docs/1.0/001-IN-PROGRESS/graphical-entries/scope-manifest.yaml`), run:
   ```bash
   dw-lifecycle scope-inventory --slug graphical-entries --quiet
   ```
2. CLI prints:
   ```
   pattern-matrix: unmatched-shape clustering pass is a STUB (Phase 11 G5; tracking #318). The polymorphic dispatcher is shipped; the clustering algorithm lands under issue #318. discovered_candidates returns [] until then.
   scope-inventory: synthesis produced a manifest that fails the manifest schema:
     - /modules: must NOT have fewer than 1 items ({"limit":1})
   ```
3. Exits non-zero. No manifest file is written.
4. Subsequently invoking `scope-widen` (per SKILL.md Step 5 auto-invocation between tasks) fails with:
   ```
   scope-widen: cannot read prior manifest at <path>/scope-manifest.yaml: ENOENT
   Run `dw-lifecycle scope-inventory --slug <slug>` first to produce a baseline manifest, then re-run scope-widen.
   ```

Net effect: the `/dw-lifecycle:implement` SKILL.md's Step 5 ("Auto-invoke scope-widen between tasks") cannot execute against a feature that doesn't already have a hand-maintained baseline `scope-manifest.yaml` — and the canonical bootstrap path (`scope-inventory`) refuses to produce one because the synthesis stage produces a structurally-empty manifest (zero detected modules).

The "structurally-empty modules" outcome is plausibly correct for this feature at this point in time (graphical-entries hasn't shipped any production-side scope-discoverable modules yet — the new dashboard surface is the FIRST thing Phase 5 introduces). But the tool's response is to reject its OWN output as schema-invalid, rather than emit a valid empty-but-bootstrappable manifest the operator can grow.

**Workaround used:**

For this Phase 5 implementation pass, scope-widen auto-invocation between tasks is **skipped** (the SKILL.md error-handling block: *"`scope-widen` fails. Surface the error in the next task's brief; the task still proceeds."*). The implementation continues without the augmented scope context the SKILL says it should carry. The skip is logged here as a known incomplete-trussing surface.

**Suggested fix:**

The root cause is that `/modules` carries a non-empty-minimum constraint (`must NOT have fewer than 1 items`) in the manifest schema, but the synthesis pass legitimately produces zero detected modules for greenfield features. Two paths:

- **Light:** relax the `/modules: minItems: 1` constraint to `minItems: 0` in the manifest schema. A zero-module manifest is structurally valid and represents the bootstrap state. `scope-inventory` writes the empty manifest with a header comment explaining it'll grow as modules are added. `scope-widen` reads the empty manifest, detects no prior modules, treats every shape introduced by the task brief as a "new module" candidate. Cheapest; preserves bootstrap path.
- **Medium:** `scope-inventory` writes a manifest with one synthetic "placeholder" module that names the project name + a `phase: bootstrap` flag. The placeholder satisfies the schema; subsequent inventory runs replace it once real modules are detected. Heavier than necessary; the placeholder is a workaround in the data shape rather than the schema.
- **Heavy:** rework the schema to model "a manifest may have zero modules during bootstrap" as a first-class state with its own subtype (`BootstrapManifest`); add explicit transitions. Significant complexity for a transition that lasts at most one or two tasks.

Recommended: **Light**. The minItems:1 constraint forbids a legitimate state. Removing it costs one schema edit + (likely) one or two downstream call-sites that assume non-empty `modules[]`. The bootstrap path becomes usable; scope-widen between tasks starts working from the first feature task forward.

Cross-reference: the STUB warning about unmatched-shape clustering (Phase 11 G5; #318) is informational — `discovered_candidates: []` is acceptable for now. The schema-validation hard-fail is the actual blocker.

## TF-007 · DSC · medium · Phase 11 orchestrator loop (`runOrchestratorTurn`) is library-only, same surface as TF-005 — un-engageable from the orchestrating Claude session

**Status (2026-05-28, dw-lifecycle v0.24.1):** **CLOSED — Medium fix shipped.** A `dw-lifecycle orchestrator-turn` CLI subcommand now exists; SKILL.md § "Orchestrator loop (per-turn audit/judge stack)" is rewritten to invoke it as `dw-lifecycle orchestrator-turn --feature <slug> [--skip-judge] [--skip-auditor]`. Re-tested empirically:

```bash
$ dw-lifecycle orchestrator-turn --feature graphical-entries --skip-judge --skip-auditor
{ ...TurnReport JSON to stdout... }
orchestrator-turn: NOTE: only 3/6 catalog files present (anti-patterns.yaml, adopter-manifests.yaml, clones.yaml). 0 new audit entries; 0 wrong-decisions; 0 mediation clusters; judge skipped; auditor skipped; 0 escalations queued
$ echo $?
0
```

The CLI verb emits `TurnReport` JSON (conforming to `loop-types.ts`) to stdout, a one-line human summary to stderr, and persists `nextLoopState` to `.dw-lifecycle/scope-discovery/orchestrator-runtime/loop-state.json` automatically — exactly the shape this entry recommended. The flags (`--skip-judge`, `--skip-auditor`, `--judge-input <path>`, `--auditor-input <path>`) let the operator stage the in-band LLM calls explicitly. The orchestrator can now run one turn before each task and one after, surfacing `summary` in the per-task report. Phase 11 trussing is engageable end-to-end.


**Repro:**

1. Read `/dw-lifecycle:implement` SKILL.md § "Phase 11 — Autonomous loop (per-turn audit/judge stack)": *"When `.dw-lifecycle/scope-discovery/` is present in the project, this skill runs an autonomous per-turn audit/judge stack via the `runOrchestratorTurn` library at `plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/loop-turn.ts`."*
2. SKILL.md prescribes: *"Run one orchestrator turn **before each task** (assess what changed since the prior turn) and **after each task** (assess what the just-completed task introduced). Surface the `summary` field in the per-task report; surface `escalationVisibility` whenever its count is non-zero."*
3. Inspect `orchestrator-loop/loop-turn.ts`. The function is TypeScript-only, returns a `TurnReport` object, persists state via `persistLoopState`. No CLI subcommand under `bin/dw-lifecycle` exposes it; no operator-facing entry point exists.
4. The orchestrator (the Claude Code session running `/dw-lifecycle:implement`) cannot invoke `runOrchestratorTurn` directly — same primitive ceiling as TF-005 for `wrap()`.

Net effect: SKILL.md prescribes per-turn library calls (audit-log read, wrong-decision detection, judge pass, mediation, controller, codebase-state metrics, external auditor fire, escalation visibility) that the orchestrator has no execution path to actually trigger. The Phase 11 trussing exists in code but is invisible from the orchestrator's perspective; this pilot's "scope-discovery is engaged" claim is downgraded to "scope-discovery's enforcement-grammar is engaged via hand-prepended prompt; the Phase 11 library loop is NOT engaged."

**Workaround used:**

The orchestrator surfaces this as a known incomplete-trussing limitation in the per-task report (this entry's existence is the surface). No mediation cluster summaries; no LLM-judge passes; no controller cadence adjustments; no external auditor fire. The codebase-state metrics could in principle be approximated by hand-running the underlying scripts (`scripts/probe-*` plus codebase-state-metrics's source data), but the cost would dominate; the workaround is to skip Phase 11 loop engagement entirely and rely on the dispatch-wrapper grammar enforcement (TF-005) + the periodic `/dw-lifecycle:review` invocation (which IS operator-facing and orchestrator-runnable) for review-side coverage.

**Suggested fix:**

Same shape as TF-005:

- **Light:** rewrite the SKILL.md § "Phase 11" section to describe what the orchestrator can actually do — "the in-process library loop is engaged when an embedded TypeScript caller drives the implement skill; the operator-facing orchestrator (Claude Code session) does NOT engage the loop, and the SKILL.md should either ship a CLI shim or scope the Phase 11 section to embedded callers only."
- **Medium:** ship a CLI shim `dw-lifecycle orchestrator-turn --slug <slug>` that the implement skill invokes before/after each task. The shim wraps `runOrchestratorTurn`, prints the `TurnReport.summary` to stdout, surfaces escalation visibility when non-zero, persists `nextLoopState` to disk. The orchestrator pipes the summary line into the per-task report verbatim. Now Phase 11 IS engageable from the orchestrator.
- **Heavy:** rework the implement skill itself to be a TypeScript-orchestrated harness (the embedded caller of TF-005's "Medium" fix) — the operator's `/dw-lifecycle:implement` invokes a long-running orchestrator process that owns sub-agent dispatch via wrap(), runs orchestrator-turns before/after each task, and persists everything. The Claude session's role becomes operator-facing surface only (chat prompts, design decisions, code review). Largest architectural change; resolves TF-005 + TF-007 in one motion.

Recommended: **Medium**. Light is documentation triage; the SKILL.md describes the loop accurately for embedded callers but those don't exist outside test code. Medium is the principled fix: the orchestrator-side loop IS the load-bearing engine that the dispatch-wrapper hooks into for judge/mediation/controller, and exposing it as a CLI is the same shape as `scope-widen`'s existing CLI exposure. Heavy is the right end-state once enough pieces are in place that the orchestrator-as-TypeScript-harness pays for itself.

Cross-reference: paired tightly with TF-005; both describe the same root cause (orchestrator owns Agent tool primitives, can't engage TypeScript libraries directly). A combined "operator-facing CLI shims for scope-discovery's enforcement engines" fix closes both.

## TF-008 · DSC · low · `validate-return` parser strictly requires the literal noun "matches" — semantically equivalent phrasings are rejected

**Repro:**

1. Run a sub-agent dispatch via `wrap-prompt` and instruct the agent to conclude with the REQUIRED RETURN GRAMMAR block.
2. Agent writes a substantively-correct grammar block where the `Searched:` line phrases the count using a descriptive noun:

   ```
   Searched: `class="collapse-chev"` in production markup paths — 2 source-emitter call sites (`swimlane-card.ts`).
   Included: ...
   Excluded: ...
   ```

3. Run `dw-lifecycle validate-return --response-file <path> --agent-type typescript-pro`:

   ```json
   {
     ...
     "parseError": "Malformed Searched: count — expected \"<N> matches\" but got: 2 source-emitter call sites (`swimlane-card.ts`).",
     ...
     "summary": "validate-return: REJECTED (Malformed Searched: count — expected \"<N> matches\" but got: 2 source-emitter call sites (...).)"
   }
   ```

4. Exit code 1; the wrapper rejects what is semantically the same as `2 matches`.

The wrapper's parser at `plugins/dw-lifecycle/src/scope-discovery/dispatch-grammar.ts` requires the literal noun "matches" after the digit count in the `Searched:` line. Descriptive nouns ("source-emitter call sites", "call sites", "occurrences", "instances", "hits", "files") all reject.

This is a real signal-vs-noise tradeoff: enforcing a literal noun is what makes the parser deterministic; loosening to any `<digit>\s+<noun>` shape would risk false positives on partial sentences. But agents naturally write descriptively — "2 source-emitter call sites" is more informative than "2 matches" — and the wrapper's strictness forces a meaning-loss-on-format-strictness tradeoff.

**Workaround used:**

Documented in the orchestrator's session narrative; the implementer's commits landed cleanly and the substantive work was sound (635 passing tests, build exit 0). The wrapper rejection is a return-grammar format-fail, not a work-quality fail. Moving forward to the next dispatch with the same risk surface.

**Suggested fix:**

- **Light:** the GRAMMAR_INSTRUCTION prelude (the text `wrap-prompt` appends to every dispatch) explicitly underlines that "matches" is the REQUIRED noun and shows several rejected phrasings as anti-examples. Cheapest: documentation-only.
- **Medium:** the parser accepts any of a small whitelist of nouns: `matches`, `match`, `hits`, `hit`, `occurrences`, `instances`, `call sites`, `sites`, `files`. Any other noun rejects. Preserves the deterministic shape while letting the agent write naturally.
- **Heavy:** the parser switches to a count-first regex that ignores the noun entirely: `^Searched:\s+<pattern>\s+—\s+(\d+)(?:\s+\S+)*$`. Always takes the first digit as the count. Most permissive; relies entirely on the digit's position. Probably too loose — `Searched: pattern matching ... — 7 issues found` would match `7` even if the digit is mid-sentence.

Recommended: **Light + Medium together**. Light closes the documentation loop (agents see the constraint explicitly); Medium adds a small noun whitelist so the most common natural phrasings pass without weakening the parser's structure. Heavy is too permissive.

Cross-reference: surfaced during Task 5.1A implementer dispatch on 2026-05-28; agent wrote "2 source-emitter call sites" rather than "2 matches". The Light + Medium fix would have accepted the original phrasing.

**Addendum (2026-05-28, second wrapper rejection):** the same format-strictness applies to `Excluded:` entries. The parser rejects an Excluded citation that omits the `:LINE` suffix:

```
parseError: Malformed file:line entry — expected "path/to/file.ts:LINE" but got: packages/studio/test/dashboard-swimlane.test.ts
```

Surfaced when the Task 5.1A code-quality reviewer wrote `Excluded: packages/studio/test/dashboard-swimlane.test.ts — test-file references to .collapse-chev are assertions, not production code under review` (no `:LINE` suffix because the exclusion was "whole file out of scope, no specific line"). The parser strictly enforces the `path:LINE` format on every Excluded entry, even when the exclusion is whole-file. The agent would have needed to write `packages/studio/test/dashboard-swimlane.test.ts:1` (a sentinel line number) to pass.

**Same fix-class as the noun-strictness:** the parser's contract is structural-format-first; semantic-meaning-second. Both rejections preserved the substantive work intact (the agent's review was sound; the grammar block was technically malformed). The Light fix (clearer documentation in the GRAMMAR_INSTRUCTION prelude) closes both. The Medium variant for this addendum: accept `path` without `:LINE` when the exclusion reason names "whole file" / "module" / "directory" / etc. — but the simpler convention is to require a sentinel line (line `:1`) for whole-file exclusions and document that in the prelude.

Combined recommendation for TF-008: ship a **Light** update to the GRAMMAR_INSTRUCTION prelude (1 paragraph) naming both gotchas explicitly:

1. The literal noun `matches` is required after the digit count in the `Searched:` line.
2. Every Excluded entry requires `path:LINE`, even when the exclusion is whole-file (use `:1` as the sentinel).

This is documentation-only; the parser's existing strict contract stays as-is.

## TF-009 · DSC · low · `validate-return` forbidden-phrase list false-positives on project-vocabulary nouns ("stub", "placeholder")

**Repro:**

1. The project uses `swim-stub` as the canonical class name for the focus-off compact button in the multi-lane swimlane dashboard. The corresponding render function is `renderSwimStub`. The mockup uses `.swim-stub` throughout; the Task 5.1 acceptance criteria name it explicitly ("Step 5.1.5: Filtered-out lane stubs — when a lane is visibility-on but focus-off, render a compact swim-stub button between the focused swimlanes").
2. During Task 5.1B implementer dispatch return, the agent wrote the following Excluded line in the grammar block:

   ```
   Excluded: packages/studio/src/pages/dashboard/swimlane-card.ts:330 — renderSwimStub is the focus-off stub button (not a stage-bearing body; no kanban/list bodies to switch between)
   ```

3. Run `validate-return --response-file <path> --agent-type typescript-pro` — REJECTED:

   ```
   parseError: Excluded reason for packages/studio/src/pages/dashboard/swimlane-card.ts:330 contains forbidden deferral phrase "stub" — rewrite the reason to explain why the exclusion is permanent, or move the file:line into Included and fix it.
   forbidden-phrase: "stub" at packages/studio/src/pages/dashboard/swimlane-card.ts:330
   ```

The parser caught "stub" as a forbidden deferral phrase from `FORBIDDEN_DEFERRAL_PHRASES` (which includes both `"stub"` and `"placeholder"`). The substring match correctly fires — `"stub button"` does contain `"stub"`. But the context here is the project's OWN canonical vocabulary for a specific UI primitive, not a deferral or placeholder-pending-future-work.

The agent's correct fix is to rewrite the reason without the word "stub" — e.g., "the focus-off compact button" or "the alternate visibility-off render for a lane." But agents naturally describe affordances using their canonical names, and the wrapper's strict substring-match doesn't distinguish proper-noun-like usage from deferral noun usage.

**Workaround used:**

Documented as TF-009. The Task 5.1B substantive work landed cleanly (661 tests passing, build exit 0, 2 commits); the wrapper rejection is purely on the meta-deliverable layer. Continuing with spec-review + code-quality dispatches with a friction-aware reminder that "stub" and "placeholder" in reasons must be rephrased even when describing legitimate project vocabulary.

**Suggested fix:**

The fundamental tension: the forbidden-phrase list is a load-bearing contract (no `"stub"` / `"placeholder"` in code as deferral); the project's UI vocabulary collides with the list's noun set.

- **Light:** add an example in `GRAMMAR_INSTRUCTION` showing the workaround — *"if you need to reference an affordance whose canonical class name is `.swim-stub` or `.placeholder-tile`, write the EXCLUDED reason without the word; describe the affordance's purpose ('focus-off compact button', 'reserved tile') rather than its class name."* Cheapest; documentation-only.
- **Medium:** project override at `.dw-lifecycle/scope-discovery/forbidden-deferral-phrases.yaml` that drops `stub` and `placeholder` from this project's list (since the project uses them as primitive vocabulary). The risk: deferral usage in *other* contexts ("stub method", "fix later as a placeholder") now passes through. Probably not worth the trade unless the operator confirms the vocabulary collision is more common than deferral misuse.
- **Heavy:** parser-side word-boundary refinement: only flag when the forbidden phrase appears WITHOUT a preceding noun-class context (e.g., a hyphenated class name like `.swim-stub`, a CamelCase function name like `renderSwimStub`). Significantly more complex; risks false-negatives on real deferrals.

Recommended: **Light**. The GRAMMAR_INSTRUCTION prelude is the natural place to surface the contract's gotchas; agents read it on every dispatch. A 2-sentence callout about project-vocabulary collisions makes the rephrasing visible up front instead of after a rejection.

Cross-reference: same parent shape as TF-008 (parser format strictness with semantic equivalent that passes meaning but fails contract). The fix-class is also similar: document the gotcha in the prelude. Both TF-008 and TF-009 would close together with a single GRAMMAR_INSTRUCTION rewrite covering all three gotchas (noun strictness on Searched, `:LINE` requirement on Excluded, project-vocabulary phrase collisions).

## TF-010 · DSC · low · `scope-widen` always emits 0 additions because the unmatched-shape clustering pass is STUB (upstream #318)

**Repro:**

1. From a feature worktree, run an `orchestrator-turn` to confirm the scope-discovery state is clean, then invoke `scope-widen` with a complaint describing concrete new surfaces the current task introduced:

   ```bash
   dw-lifecycle scope-widen "Task 5.1: multi-lane swimlane shell + focus-chip strip + lane-visibility rail + swim-stub introduced new surfaces (bay-shell, swim-head with 5.1A/B/C slots, focus chips, rail-lane, eye-toggle, locked-stage variant, per-lane modifier classes)" --slug graphical-entries --apply
   ```

2. The CLI runs through the discovery agents (parallel dispatch — `ui-route-enumerator`, `pattern-matrix`, `clone-detector-reader`, `prd-themed-pattern-hunter`) and writes their evidence JSON files into `docs/<v>/001-IN-PROGRESS/<slug>/scope-inventory/widen-runs/<timestamp>/`.

3. The synthesis stage prints:

   ```
   pattern-matrix: unmatched-shape clustering pass is a STUB (stub; tracking #318). The polymorphic dispatcher is shipped; the clustering algorithm lands under issue #318. discovered_candidates returns [] until then.
   scope-widen delta — 0 addition(s):
     routes:           +0
     modules:          +0
     themes:           +0
     regime-holdouts:  +0 anti-pattern, +0 adopter-manifest, +0 editor-symmetry, +0 deprecation
   scope-widen: next-manifest categories: registered-pattern=0, discovered-candidate=0, novel-shape-candidate=0
   scope-widen: --apply requested but delta is empty; manifest unchanged.
   ```

4. Exit code 0; manifest unchanged.

Observed across three between-task widen invocations this session (one after each of Tasks 5.1, 5.1A, 5.1B). The discovery agents do real work (the evidence JSON files contain real route enumeration + theme keyword mining), but the synthesis stage can't cluster their output into manifest-shaped candidates without the clustering algorithm, so `discovered_candidates` is always `[]`.

The `/dw-lifecycle:implement` SKILL.md describes the between-task auto-invocation:

> When the completed task introduced NEW shapes / surfaces / primitives not enumerated in the project's existing `scope-manifest.yaml`, invoke `dw-lifecycle scope-widen <slug> "<task brief as complaint>"` to expand the manifest. ... The widened scope-manifest is read by the next task's implementer brief so its dispatch sees the augmented scope context.

In practice for greenfield features (`modules: []` baseline from `scope-inventory`), the manifest never grows — the next implementer brief sees the same empty manifest the previous one did. For projects with already-populated manifests (e.g. audiocontrol), existing entries DO drive enforcement; the STUB just means new shapes won't be added.

This is the *learning* layer of the trussing (teaching the manifest about new patterns). The *enforcement* layer (dispatch-wrapper grammar; audit-log read + wrong-decision detection; mediation + controller; escalation visibility) is entirely independent of the clustering pass — those continued to work end-to-end this session and earned the trussing's keep.

**Workaround used:**

None directly applied — the STUB is upstream-tracked and the dogfood verdict is "informational, acceptable in the meantime." The retroactive workaround that COULD be used once #318 ships: replay `synthesis` against the archived `widen-runs/*` directories from this session to back-fill the manifest with everything Phase 5 introduced (bay-shell, swim-head, focus-chip-strip, view-toggle, list-body, collapse-chev, swim-stub, etc.). The evidence files (`ui-route-enumerator.json`, `prd-themed-pattern-hunter.json`, etc.) are durable input the clustering pass would consume.

The narrow manual escape hatch if learning-layer matters mid-session: hand-author entries into `scope-manifest.yaml` (same shape as `adopter-manifests.yaml`). Bypasses synthesis entirely; not worth doing for Phase 5 where the manifest isn't gating downstream work, but documented here as the operator's option.

**Suggested fix:**

#318 is the upstream tracker; this TF entry isn't a separate fix proposal. It's the dogfood signal that:

1. The STUB's operator-facing behavior is the "no-op widen" pattern — every invocation runs cleanly, prints `0 addition(s)`, leaves the manifest unchanged.
2. The widen-run evidence dirs accumulate even when synthesis can't consume them; they're durable input for #318's algorithm.
3. For greenfield features, the "next implementer sees augmented manifest" promise can't be fulfilled until #318 ships. SKILL.md prose mentioning that promise should either annotate it as gated-on-#318 OR ship a `--no-scope-widen` default for greenfield features (where the no-op runs add session-overhead without signal).

**Suggested closure path:** when #318 ships, retroactively run synthesis against the three archived widen-run dirs from this session:

- `docs/1.0/001-IN-PROGRESS/graphical-entries/scope-inventory/widen-runs/20260528T061143Z-89b7a1/` (Task 5.1)
- `docs/1.0/001-IN-PROGRESS/graphical-entries/scope-inventory/widen-runs/20260528T082055Z-220e45/` (Task 5.1A)
- `docs/1.0/001-IN-PROGRESS/graphical-entries/scope-inventory/widen-runs/20260528T090129Z-4f2251/` (Task 5.1A re-run)
- `docs/1.0/001-IN-PROGRESS/graphical-entries/scope-inventory/widen-runs/20260528T094458Z-a64941/` (Task 5.1B)

If the clustering pass produces the expected swimlane-vocabulary candidates from those evidence sets, that's confirmation that the gap was exactly the algorithm and not the dispatch shape. Close TF-010 with `verified-<date>` against the back-fill commit.

Cross-reference: TF-006 (closed) is incidentally the entry that first surfaced the STUB warning — TF-006 was scoped to the schema-validation hard-fail (`modules: minItems: 1` rejecting greenfield manifests) and treated the STUB as informational context. TF-010 promotes the STUB to its own entry per the project's `capture friction over scope` rule: upstream tracking doesn't substitute for the per-feature dogfood log when the operator-visible behavior is real friction (three no-op invocations across one session).

