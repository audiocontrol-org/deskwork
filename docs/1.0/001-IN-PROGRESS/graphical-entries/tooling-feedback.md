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
| TF-004 | Open | — |
| TF-005 | Open | — |
| TF-006 | Closed | dw-lifecycle v0.24.1 — `modules` minItems relaxed; bootstrap manifest now valid |
| TF-007 | Closed | dw-lifecycle v0.24.1 — `dw-lifecycle orchestrator-turn --feature <slug>` CLI subcommand shipped |

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

**Status (2026-05-28, dw-lifecycle v0.24.1):** **OPEN — code unchanged.** The bin shim at `~/.claude/plugins/marketplaces/deskwork/plugins/dw-lifecycle/bin/dw-lifecycle` is byte-identical between v0.24.0 and v0.24.1 — it still probes only for `tsx` on its `find_tsx` walk, not for the rest of the declared `package.json` dependencies. `repair-install.sh` is similarly unchanged (still scoped to plugin-cache eviction recovery, not dep-set probing). Current install state happens to be healthy (ajv etc. are present in `node_modules/`) because of either the marketplace bump's incidental `npm install` or this worktree's earlier manual `npm install --omit=dev --workspaces=false`. The next adopter with a freshly-evicted cache will hit the same failure shape unless a clean install path that probes all declared deps lands. Re-test gate: empirically reproduce on a node_modules-wiped install of the plugin.


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

**Status (2026-05-28, dw-lifecycle v0.24.1):** **OPEN — code unchanged.** No new CLI subcommand (`wrap-prompt` / `validate-return` or similar) shipped to bridge the orchestrator to the dispatch-wrapper engine. SKILL.md § "Dispatch-wrapper engagement" still describes `wrap(agentType, taskPrompt, { dispatchFn })` as the entry point and says *"The controller (this skill's orchestrating agent) supplies the `dispatchFn` callback that drives the Agent tool"* — which the Claude Code session can't actually do (the Agent tool is a runtime-owned tool-use primitive, not a TypeScript callable). The orchestrator continues to hand-inline GRAMMAR_INSTRUCTION + parse + validate the return manually. The orchestrator-turn CLI (which TF-007 introduced) DOES engage `wrap()` internally for the judge step — but the implementer/reviewer/code-explorer dispatches that this skill prescribes still need a parallel operator-facing entry point.


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

