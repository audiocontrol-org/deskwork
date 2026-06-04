## Migrating to v0.37.0+ (Phase 12 — audit-barrage default flips to `{{prompt-stdin}}`)

v0.37.0 ships a structural fix for [#397](https://github.com/audiocontrol-org/deskwork/issues/397) (`spawn E2BIG: prompt passed via argv overflows ARG_MAX on large diffs`). The plugin-shipped `audit-barrage-config.yaml` now uses `{{prompt-stdin}}` for all three default models (`claude`, `codex`, `gemini`); the audit prompt is delivered via child stdin instead of an argv element. Bypasses the OS per-arg limit (~256KB on macOS, ~128KB MAX_ARG_STRLEN on Linux) so bootstrap `HEAD~10` ranges with hundreds of KB of diff no longer fail at spawn time with a silent `barrage-outage` forward-progression.

### What changed

- `plugins/dw-lifecycle/templates/audit-barrage-config.yaml` defaults: `"-p {{prompt-stdin}}"` (claude), `"exec {{prompt-stdin}}"` (codex), `"{{prompt-stdin}}"` (gemini). Both placeholders remain valid in `args_template`; the spawn helper picks the delivery path off the placeholder. The two are mutually exclusive per entry.
- `spawn-cli.ts` now catches synchronous `spawn E2BIG` and surfaces a structured classifier naming `{{prompt-stdin}}` + the issue + this file. The argv (`{{prompt}}`) path is unchanged for small payloads — only the failure-mode reporting is upgraded.

### Adopters who customized to `{{prompt}}` explicitly

If you copied the v1 config into `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml` and customized — or if you've left the override file un-customized and rely on the plugin default — you have two paths:

1. **Recommended — switch to `{{prompt-stdin}}`.** Replace each `{{prompt}}` placeholder in your `args_template:` lines with `{{prompt-stdin}}`. All three default CLIs (`claude -p`, `codex exec`, `gemini`) read prompts from stdin without additional flags. Live-verify by running `dw-lifecycle audit-barrage` against a feature's recent work; the run-dir's INDEX.md will show all models exited cleanly even on multi-MB diffs.
2. **Stay on argv (`{{prompt}}`) with explicit acknowledgment.** Acceptable when your diffs are bounded small. Re-running against a large diff will now fail loud with the structured classifier (instead of a silent barrage-outage) — the message names this migration path so future-you can flip when the friction shows up.

### When to expect a `spawn E2BIG` classifier in practice

- Fresh scope-discovery opt-in where `last-hook-run.json` is absent and `implement-hook` defaults the range to `HEAD~10..HEAD`.
- Any `--from <ref>` with a large merge commit in the included range.
- Feature branches whose substantive diff alone exceeds your platform's per-arg limit.

The classifier message includes the exact prompt byte count, so cross-referencing your `audit-runs/<timestamp>-<feature>/` to find the offending payload is mechanical.

## Migrating to v0.36.0+ (Phase 25 — `editor-symmetry` → `module-symmetry` rename)

v0.36.0 also lands Phase 25's terminology cleanup: every adopter-facing `editor-symmetry` surface in the `dw-lifecycle` plugin is renamed to `module-symmetry`. The audiocontrol pilot named the parallel-top-level-module concept `editor` because its modules are Roland-sampler editor packages; every non-audiocontrol adopter mentally translates `editor` → `module`. Phase 25 pays the schema-stability cost so the plugin reads project-neutral out of the box.

### What changed (load-bearing surfaces)

- **CLI verb:** `dw-lifecycle check-module-symmetry` is the canonical name. `dw-lifecycle check-editor-symmetry` survives as a deprecation-warning alias for ONE release cycle. The alias's stderr line names the canonical verb + the removal target (v0.37.0). Adopter pre-commit hooks + muscle memory keep working.
- **Slash-command:** `/dw-lifecycle:check-module-symmetry` is the canonical name. `/dw-lifecycle:check-editor-symmetry` survives as a deprecation alias command file that routes the same skill.
- **Scope-inventory flag:** `dw-lifecycle scope-inventory --module-symmetry-out` is the canonical flag. `--editor-symmetry-out` survives as a deprecation alias; same removal target.
- **scope-manifest.yaml schema field:** `regime_holdouts.editor_symmetry:` → `regime_holdouts.module_symmetry:`. The strict scope-manifest schema validator now rejects the legacy field name (no alias on the YAML side — Task 2 chose single-rename over alias for the schema surface). Existing YAMLs need migration; see below.
- **Source identifiers + file names:** internal `EditorSymmetry*` types, `discoverEditors` / `editorsTargetedByGlob` / `editorForPath` functions, and `editor-symmetry-{matrix,report}.ts` / `util/editors.ts` source files renamed to `Module*` / `discover*` / `module*` / `util/modules.ts` equivalents. The etymology paragraph in `util/modules.ts` preserves the rename's history.
- **`editor-symmetry.md` artifact filename:** PRESERVED verbatim (wire-format; travels on its own deprecation arc per the comment in `plugins/dw-lifecycle/src/scope-discovery/check-module-symmetry.ts:14-18`). Adopter `--write` paths and committed artifact paths are unaffected.

### Migration: existing `scope-manifest.yaml` files

Phase 25 ships a new doctor rule `legacy-editor-symmetry-field-rename` that detects the legacy field on `dw-lifecycle doctor` runs. The rule walks BOTH `docs/<v>/<status>/<slug>/scope-manifest.yaml` (per-feature) AND `.dw-lifecycle/scope-discovery/scope-manifest.yaml` (per-project root) and reports each affected file with the line numbers + the literal key-replacement instruction. The migration is mechanical:

```bash
dw-lifecycle doctor                          # detects legacy editor_symmetry: keys; reports paths + lines
# Then, for each affected file, edit the YAML and replace:
#   regime_holdouts.editor_symmetry:         → regime_holdouts.module_symmetry:
#   regime_holdouts.<summary>.by_source.editor_symmetry:  → ...by_source.module_symmetry:
# The field VALUES (list + integer) are unchanged — only the key name moves.
dw-lifecycle doctor                          # re-run to confirm zero legacy-editor-symmetry-field-rename findings
```

`--fix` wiring for scope-discovery doctor rules is NOT YET available; the operator runs the rewrite manually (one key-replacement per file). Adopters who want the auto-rewrite can pipe the doctor's path list through `sed -i`-equivalent rewrites locally; the rule's repair-hint message contains the exact key-replacement instruction.

### Migration: pre-commit hook wiring + skill bodies that called `check-editor-symmetry`

Adopters who hand-wired `dw-lifecycle check-editor-symmetry` into a `.husky/` hook OR project-local skill body: leave it; the deprecation-alias path keeps working for one release cycle, and the alias's stderr warning will prompt the rename on every invocation. Update at your leisure (canonical name + removal target are both named in the warning). Removal target v0.37.0.

### Audiocontrol pilot

Per Phase 25 Task 2's strategic decision, the audiocontrol pilot project (the protocol's original implementation, source-of-truth at `~/work/audiocontrol-work/audiocontrol-scope-discovery-protocol/`) renames in lockstep — same migration path as any other adopter. The pilot's tracker issue is separately coordinated; the deskwork plugin's behavior is identical for the pilot and for any other adopter.

### What stays unchanged

- The `editor-symmetry.md` written artifact filename (wire-format; separate deprecation arc).
- The `editor-symmetry-matrix.yaml` catalog filename path (wire-format).
- Historical references in PRDs, workplans, audit-logs, journal entries, and DEVELOPMENT-NOTES.md (preserved per the audit-log preservation rule — they describe the historical surface they audited).
- All `module-symmetry`-canonical surfaces named above are additive (CLI + slash-command + flag + field name); the legacy names continue to function via deprecation aliases through one full release cycle.

### Why

Per the leaked-domain-terminology pathology that scope-discovery itself exists to surface: a CONFIG primitive named for the audiocontrol pilot's Roland-sampler-editor modules forces every other adopter to mentally translate `editor` → `module` on every read. Phase 25 pays the schema-stability cost (single-rename + doctor-rule migration; CLI verb + flag aliases for one release cycle; skill folder retires entirely; etymology preserved in `util/modules.ts`).

---

## Migrating to v0.36.0+ (Phase 24 — no git-hook enforcement)

v0.36.0 retires the `dw-lifecycle` plugin's git-hook enforcement chain. Adopters who ran `dw-lifecycle install-scope-discovery-hooks` (or `install-agent-prompts`) in v0.35.0 or earlier need to clean up the installed artifacts.

### What changed

Per the no-git-hook-enforcement architectural decision (ADR at `docs/superpowers/specs/2026-06-03-no-git-hook-enforcement.md` + operational rule at `.claude/rules/enforcement-lives-in-skills.md`), `dw-lifecycle` enforcement now lives in skill bodies + CLI verbs that adopters get from `claude plugin install`. The discipline that used to fire from `.husky/{pre-commit,pre-push,commit-msg}` is gone; the equivalent checks now fire from:

- `/dw-lifecycle:session-start` — advisory structural snapshot (clones / anti-patterns / adopter holdouts / module-symmetry deltas) at session boot.
- `/dw-lifecycle:implement` — enforcing end-of-task chain (structural + audit-barrage + workplan-aware open-findings gate + apply-flips + fix-task TDD advisory).
- `/dw-lifecycle:session-end` — closing discipline (disposition-survivor + no-bare-TBDs + no-open-findings-without-disposition).
- `/dw-lifecycle:review` — primary PR-readiness surface (Step 0 refactor preconditions + structural chain + fleet symmetry).

### Retired surfaces

The following CLI verbs + skills + doctor rules + artifacts are RETIRED:

- `dw-lifecycle install-scope-discovery-hooks` (subcommand + skill folder)
- `dw-lifecycle uninstall-scope-discovery-hooks` (subcommand + skill folder)
- `dw-lifecycle install-agent-prompts` (subcommand + skill folder)
- `dw-lifecycle check-implement-hook-ran` (commit-msg gate)
- `dw-lifecycle check-implement-hook-coverage` (pre-push gate)
- `dw-lifecycle check-implement-hook-coverage --upstream-base-ref` flag
- `hooks-installed-missing` doctor rule
- `agent-prompt-mirror-drift` doctor rule
- `.dw-lifecycle/scope-discovery/{hooks-installed.json,last-hook-run.json,hook-run-log.jsonl}` working-tree artifacts

### Migration: one-shot adopter cleanup

Run the migration helper:

```bash
dw-lifecycle uninstall-everything-hook-related              # dry-run; reports what would change
dw-lifecycle uninstall-everything-hook-related --apply      # performs the removals
```

The helper:

- Removes `dw-lifecycle`-managed blocks (bounded by `# >>> dw-lifecycle scope-discovery hook >>>` / `# <<< dw-lifecycle scope-discovery hook <<<`) from `.husky/{pre-commit,pre-push,commit-msg}`. Operator-authored content outside the managed blocks is preserved verbatim.
- Deletes `.dw-lifecycle/scope-discovery/hooks-installed.json` (the install manifest), `.dw-lifecycle/scope-discovery/last-hook-run.json` (Phase 22 marker), and `.dw-lifecycle/scope-discovery/hook-run-log.jsonl` (Phase 23 per-SHA log) when present.

If your `.husky/` files contained ONLY the managed block (no operator content), the helper leaves the file with just the shebang line. You can delete the file manually if husky doesn't need the hook present; otherwise the file works as a no-op stub.

If you customized the managed block (e.g., added extra checks INSIDE the marker pair), the helper still removes the entire block — the markers are the contract. Copy your customizations OUT of the managed-block markers BEFORE running the migration if you want to keep them.

### What stays

The CLI verbs that DO the underlying checks — `check-clones`, `check-anti-patterns`, `check-adopters`, `check-disposition-survivor`, `check-module-symmetry` (Phase 25 rename; `check-editor-symmetry` alias preserved one release cycle, removal target v0.37.0), `check-refactor-preconditions`, `check-deprecations`, `audit-barrage`, `audit-barrage-lift`, `promote-findings`, `check-open-findings`, `apply-audit-flips`, `implement-hook`, etc. — all stay. The plugin ships them; the skill bodies invoke them. If you want a project-specific git hook, wire any of them into your own `.husky/<hook>` manually; we don't ship the install machinery anymore.

`install-scope-discovery` (the basic config-dir bootstrap that creates `.dw-lifecycle/scope-discovery/` + seeds empty registries) is preserved — adopters still need it on first install.

`migrate-from-pilot` (audiocontrol-pilot-to-plugin migration) is preserved + updated to skip the retired hook-install step.

### Why

Per the ADR: a discipline that only fires from `.husky/` doesn't exist for an adopter who follows the public install path. Wiring discipline into git hooks distorted our perception of what works (we experienced the gates via our own hand-rolled `.husky/`; adopters experienced nothing). The Phase 24 reframe makes the discipline travel with the plugin install, not as a separate `install-*-hooks` invocation.

### Issues defused

GH [#401](https://github.com/audiocontrol-org/deskwork/issues/401) (over-build pathology), [#402](https://github.com/audiocontrol-org/deskwork/issues/402) (bookkeeping ratchet), [#403](https://github.com/audiocontrol-org/deskwork/issues/403) (gate-amplified scope errors) — all dispositioned by removing the gate surfaces that caused them. Removing those surfaces eliminated the `--no-verify` bypasses they had previously forced on bookkeeping commits.

---

## Migrating to v0.16.0 (open-issue tranche cleanup)

v0.16.0 ships the open-issue-tranche-cleanup feature. The behavior changes adopters should know about:

### Single document evolves; scrapbook accumulates approved snapshots (Issue #222 / T1)

Pre-T1, an entry's "primary file" depended on the entry's stage: Ideas → `scrapbook/idea.md`, Planned → `scrapbook/plan.md`, Outlining → `scrapbook/outline.md`, Drafting/Final → `index.md`. The studio review surface, the iterate CLI, and the entry resolver all key on stage to decide which file to read.

Post-T1, **`index.md` is always "the document under review"**. The studio renders `index.md` regardless of currentStage; the iterate helper reads/writes `index.md` regardless of stage; and on `/deskwork:approve` at any stage transition, the backend atomically copies `index.md` → `scrapbook/<priorStage>.md` (lowercased) before mutating the sidecar. The scrapbook accumulates frozen snapshots; `index.md` is the live document.

**Adopter impact:**

- **Sidecar `artifactPath`** field used to point at the per-stage file (`docs/<slug>/scrapbook/outline.md` etc. for early stages). It now points at `<dir>/index.md` for all entries. Run `deskwork doctor --fix=all` to migrate sidecars automatically — the new `legacy-stage-artifact-path` rule copies the legacy file's content into `<dir>/index.md` and updates the sidecar. The legacy file is preserved (it's now a snapshot).
- **First iterate at the new stage** is responsible for transforming `index.md` itself (e.g. outline → draft body). The prior stage's content is preserved at `scrapbook/<priorStage>.md` as a reference — the agent can read it, but should rewrite `index.md`.
- **Marginalia comments** authored against the prior stage's `index.md` are **archived on approve** (Issue #200). They're preserved in the audit trail (`listEntryAnnotationsRaw`) but no longer render in the active marginalia sidebar of the new stage. Comments made in the new stage start fresh — anchor stability across document evolution under stage transition is unsolvable on the backend; archive-on-approve sidesteps it cleanly.
- **`--kind` flag on `deskwork iterate`** narrows in role: for longform/outline it's metadata for the journal record (the `stage` field), no longer a file router. For shortform it still selects the legacy workflow-object code path.

If a previous approve run left a `scrapbook/<stage>.md` file with operator-edited content that diverges from the entry's `index.md`, the next approve will refuse with a clear error rather than overwrite the snapshot. Resolve by deciding which copy is canonical, leave the other under `scrapbook/`, and re-run.

### `/deskwork:ingest` defaults to `Drafting`, not `Ideas` ([#206](https://github.com/audiocontrol-org/deskwork/issues/206))

Pre-v0.16.0, ingesting a markdown file whose frontmatter had no `state:` field landed it in **Ideas**. As of v0.16.0, the default is **Drafting**.

Rationale: `/deskwork:ingest` is for backfilling existing content with body text already on disk. `/deskwork:add` is the path for capturing new ideas (no body text yet). Defaulting ingested files to Ideas conflated the two — ingested files are by definition past the "thought, no words yet" Ideas-stage shape and belong in Drafting.

**Adopter impact:**

- If your ingest workflows previously relied on the `Ideas` default and used `/deskwork:approve` cycles to advance entries to Drafting: the next ingest after upgrading lands in Drafting directly. The old default was the bug; the change is in the direction of correctness.
- If you specifically want an ingested file in `Ideas`, pass `--state Ideas` explicitly, or set `state: ideas` in the file's frontmatter — both still win over the default.
- Frontmatter state: anything → behavior unchanged (frontmatter still wins over the default).

### `/deskwork:ingest` semantic distinction (companion clarification)

- `/deskwork:add` — capture a new idea with no body text yet. Lands in Ideas.
- `/deskwork:ingest` — backfill an existing markdown file (with body text). Defaults to Drafting; overridable per the rules above.

If a file has no body text yet, the right path is `/deskwork:add`, not `/deskwork:ingest --state Ideas`. The ingest path is for content that already exists.

---

## Migrating to v0.12.0 (post-v0.11.1 dogfood fixes)

v0.12.0 is a corrective release that fixes a cluster of issues surfaced by dogfooding v0.11.1's entry-centric redesign on real calendars. **No breaking changes**; everything below is upgrade housekeeping.

### TL;DR

- After upgrading, re-run `deskwork doctor --fix=all` (or wipe `.deskwork/entries/` and re-run; both work). The migration now reads the legacy ingest journal's `sourceFile` into a new `Entry.artifactPath` field, and pulls iteration counts + review state from the legacy pipeline-workflow records instead of leaving them empty.
- The studio's per-entry review surface (`/dev/editorial-review/<entry-uuid>`) now exposes the entry-stage universal verbs — Approve, Block, Cancel, Induct — as buttons that POST to `/api/dev/editorial-review/entry/<uuid>/<action>`. Previously the URL fell through to the legacy workflow renderer with no entry-stage actions.
- The CLI's `deskwork --help` now matches the Phase 30 verb structure: retired verbs are no longer listed in the active surface; the new universal verbs (`block`, `cancel`, `induct`, `status`) are flagged as skill-only.
- The 9 retired-verb source files are deleted from the CLI tree. The retirement gate at `commands/retired.ts` still prints the migration message for any operator who tries them.
- `scripts/repair-install.sh` no longer enumerates plugin versions from `$PATH`, and filters registry walks by `scope`/`projectPath` so other-project installs don't bleed into the current cwd.
- A local dev workflow lands: `npm run dev --workspace @deskwork/studio` boots the studio with Vite-mounted-in-Hono and HMR. See `packages/studio/README.md#local-development`.

### Adopter actions

After upgrading the marketplace install:

```bash
deskwork doctor --fix=all
```

Doctor walks the legacy `.deskwork/review-journal/ingest/*.json` and `pipeline/*.json` records and patches entry sidecars in-place. If the migration found stale ingest paths (the source file was moved after ingest), doctor reports a `file-presence` failure with the recorded path — update either the file location or the sidecar's `artifactPath` field.

### Issues closed in v0.12.0

- [#137](https://github.com/audiocontrol-org/deskwork/issues/137) — `repair-install.sh` re-restored orphan caches when PATH was stale.
- [#138](https://github.com/audiocontrol-org/deskwork/issues/138) — `repair-install.sh` restored project-scope entries from other projects.
- [#139](https://github.com/audiocontrol-org/deskwork/issues/139) — `deskwork --help` listed retired verbs, omitted universals.
- [#140](https://github.com/audiocontrol-org/deskwork/issues/140) — Migration derived sidecar paths from a slug heuristic, ignoring real path in ingest journal.
- [#141](https://github.com/audiocontrol-org/deskwork/issues/141) — Migration didn't carry over review-workflow state.
- [#146](https://github.com/audiocontrol-org/deskwork/issues/146) — Studio per-entry review surface used the legacy renderer; no entry-stage actions.

---

## Migrating to v0.11.0 (entry-centric pipeline redesign)

> **Version note:** `v0.11.0` is a placeholder used throughout this section. The actual release version is set at tag time — check the [GitHub releases page](https://github.com/audiocontrol-org/deskwork/releases) for the canonical version string and substitute it where you see `v0.11.0` below.

The Phase 30 redesign reshapes deskwork's editorial calendar around a single eight-stage state machine per entry, retires nine per-stage skills in favor of universal verbs, and moves source-of-truth from `calendar.md` plus a separate review-workflow store onto per-entry sidecar JSON files. This release is a major version bump because adopter calendars need a one-shot schema migration, several skill names have changed, and the review-surface URL shape has changed.

### TL;DR

- One-shot schema migration: `deskwork doctor --check` to dry-run, then `deskwork doctor --fix=all` to apply.
- Nine skills retired; their behavior moves into nine universal verbs. See the verb mapping table below.
- The review surface moved from `/dev/editorial-review/<workflow-uuid>` to `/dev/editorial-review/entry/<entry-uuid>`. The legacy workflow-uuid path still resolves during the migration window.
- Frontmatter fields deskwork writes are now nested under a `deskwork:` namespace (`deskwork.id`, `deskwork.stage`, `deskwork.iteration`).
- Pinned installs of v0.10.x and earlier continue to work unchanged. Move forward on your own schedule.

### What changed under the hood

#### Eight-stage entry-centric pipeline

Before, the calendar tracked seven stages and a separate review-workflow store carried review state. The two stores could disagree — an approved+applied workflow would still render its entry as `Drafting` because the calendar stage didn't reflect workflow events. The `Review` stage was unreachable in practice, and `Paused` was treated as a process flag rather than a stage.

After, every entry has exactly one stage from a single state machine:

- **Linear pipeline:** Ideas → Planned → Outlining → Drafting → Final → Published
- **Off-pipeline:** Blocked (resumable interruption) and Cancelled (abandoned, rare resume)

Source-of-truth is the per-entry sidecar at `.deskwork/entries/<uuid>.json`. The `calendar.md` file is regenerated from sidecars by `deskwork doctor` and is purely a human-readable projection — editing it directly is no longer the supported flow.

#### Universal verbs replace per-stage skills

Nine skills are retired:

`/deskwork:plan`, `/deskwork:outline`, `/deskwork:draft`, `/deskwork:pause`, `/deskwork:resume`, `/deskwork:review-start`, `/deskwork:review-cancel`, `/deskwork:review-help`, `/deskwork:review-report`.

Their behavior is consolidated into universal verbs that work at every stage:

- `/deskwork:add` — create a new Ideas entry (rewritten on the new schema; same name and surface).
- `/deskwork:iterate` — within-stage edit cycle (snapshot → journal entry → sidecar update). The first iterate at Planned auto-scaffolds `plan.md`; the first at Outlining auto-scaffolds `outline.md`; the first at Drafting auto-scaffolds `index.md`.
- `/deskwork:approve` — graduate to the next stage. Universal across the pipeline: Ideas → Planned, Planned → Outlining, Outlining → Drafting, Drafting → Final.
- `/deskwork:publish` — Final → Published. The only graduation event from Final.
- `/deskwork:block` — move an entry off-pipeline (replaces pause). Resumable.
- `/deskwork:cancel` — abandon an entry (rare). Resumable but expected to be infrequent.
- `/deskwork:induct` — universal teleport that replaces resume. Brings an entry back into the pipeline from Blocked, Cancelled, or a revoked Final.
- `/deskwork:status` — per-entry state summary (replaces `review-help` and the per-entry view of `review-report`).
- `/deskwork:doctor` — orchestrates helper validation and dispatches LLM-as-judge sub-agents for content checks.

#### Verb mapping (old → new)

| Old skill | New verb |
|---|---|
| `/deskwork:plan` | first `/deskwork:iterate` at Planned (auto-scaffolds `plan.md`) followed by `/deskwork:approve` |
| `/deskwork:outline` | first `/deskwork:iterate` at Outlining (auto-scaffolds `outline.md`) |
| `/deskwork:draft` | first `/deskwork:iterate` at Drafting (auto-scaffolds `index.md`) |
| `/deskwork:pause` | `/deskwork:block` |
| `/deskwork:resume` | `/deskwork:induct` |
| `/deskwork:review-start` | first `/deskwork:iterate` at any stage |
| `/deskwork:review-cancel` | `/deskwork:cancel` (or `/deskwork:induct` to retract back to a prior stage) |
| `/deskwork:review-help` | `/deskwork:status` |
| `/deskwork:review-report` | `/deskwork:status` (per-entry view) |

If you accidentally invoke a retired CLI subcommand, the retired-verb gate in `deskwork doctor` prints a stable migration message pointing at the new verb.

#### URL changes

The studio's review surface changed key:

- **Before:** `/dev/editorial-review/<workflow-uuid>` (workflow-uuid keyed)
- **After:** `/dev/editorial-review/entry/<entry-uuid>` (entry-uuid keyed; namespaced under `entry/` to avoid path collision with the legacy route)

The legacy workflow-uuid path still resolves during the migration window so existing bookmarks and dashboard links keep working. New links generated by the studio use the entry-uuid form.

#### Frontmatter changes

Frontmatter fields deskwork writes into adopter-owned markdown are now nested under a `deskwork:` namespace:

```yaml
---
title: My post
deskwork:
  id: 01943c00-7e9d-7c00-9b5a-1234567890ab
  stage: Drafting
  iteration: 3
---
```

The doctor's frontmatter-sidecar validator catches drift between artifact frontmatter and the sidecar. If your content-collection schema rejected the new shape, permit it with `deskwork: z.object({...}).passthrough()` (or top-level `.passthrough()`).

### Adopter checklist

#### 1. Update the marketplace

```
/plugin marketplace update deskwork
/reload-plugins
```

#### 2. Read this section end-to-end

The migration is non-destructive (a sidecar-write + calendar regeneration), but the verb-rename surface affects every project-internal skill or documentation page that mentions retired verbs. Read this section before running the migration so you know what to update.

#### 3. Dry-run the schema migration

From the project root:

```bash
deskwork doctor --check
```

The dry-run reports legacy schema detection and prints the number of entries that would be migrated. Nothing is written to disk in `--check` mode.

#### 4. Run the schema migration

```bash
deskwork doctor --fix=all
```

This:

- Writes per-entry sidecars to `.deskwork/entries/<uuid>.json`.
- Regenerates `.deskwork/calendar.md` from the sidecars.
- Appends `entry-created` journal events for the migrated entries.

The migration is idempotent — re-running on an already-migrated tree is a no-op.

#### 5. Verify post-migration

```bash
deskwork doctor
```

A clean migration reports `clean (no findings...)`. If `doctor` surfaces findings, follow its recommended fixes (each finding includes a `--fix=<rule>` suggestion).

#### 6. Commit the migration

```bash
git add .deskwork/
git commit -m "chore: migrate calendar to entry-centric schema"
```

The sidecars are tracked in git alongside the existing `.deskwork/` artifacts.

#### 7. Update custom skill prose

Any project-internal skills (`.claude/skills/<name>/SKILL.md`) that reference retired verbs need updating. Use the verb mapping table above. Common patterns:

- A skill that ran `/deskwork:plan` after creating a new entry now runs `/deskwork:iterate` and then `/deskwork:approve` to graduate from Planned to Outlining.
- A skill that paused work via `/deskwork:pause` now uses `/deskwork:block`.
- A skill that resumed paused work via `/deskwork:resume` now uses `/deskwork:induct`.
- Help / status output that mentioned `/deskwork:review-help` or `/deskwork:review-report` should point at `/deskwork:status`.

The retired-verb gate prints a stable migration message that you can also surface in your own automation if you want to defer the rename.

#### 8. Update content-collection schemas if needed

If your renderer (Astro, Next, etc.) validates frontmatter against a schema, ensure it permits the `deskwork:` namespace. Either:

```ts
deskwork: z.object({}).passthrough()
```

…or mark the whole frontmatter object `.passthrough()` to allow any deskwork-namespaced fields without explicit declaration.

### What did NOT change

- `.deskwork/config.json` is untouched. No config migration.
- `deskwork.id` UUIDs on existing entries are preserved across the migration.
- Frontmatter fields you (the adopter) own — title, date, tags, slug, etc. — are not touched.
- The marketplace install path, the bin shim mechanism, and the studio boot path are unchanged from v0.10.x.
- Pinned installs to v0.10.x or earlier still work; they continue to use the seven-stage architecture.

### Where to file issues

If migration fails or produces unexpected results, open an issue at <https://github.com/audiocontrol-org/deskwork/issues> with:

- Your prior version (the one you're upgrading from).
- Output of `deskwork doctor --check` from before migration.
- Output of `deskwork doctor --fix=all` from the migration attempt.
- The shape of your `.deskwork/calendar.md` (the legacy form, before the migration regenerates it).
- Any project-internal skills that reference retired verbs, if the breakage is on the skill side rather than the schema side.

---

> **Sections below describe historical migrations on the v0.9.x vendor/symlink architecture.** That architecture was retired in v0.10.0 by the Phase 26 npm pivot — see the PRD §444 "Extension: npm-publish architecture pivot" for the rationale (three install-blockers in three releases all rooted in workspace-dep resolution against Claude Code's marketplace install path). Current architecture: plugin shells `npm install --omit=dev @deskwork/<pkg>@<version>` on first invocation; `vendor/`, `materialize-vendor.sh`, and `marketplace.json source.ref` pinning are all retired. Read the historical sections below as version-specific upgrade notes, not as descriptions of current shape.

## Migrating to v0.9.3+ (marketplace.json source-shape change)

v0.9.3 changed each plugin's `marketplace.json` `source` field from a relative path (`./plugins/deskwork`) to a `git-subdir` source pinned at the release tag — necessary so adopters install the materialized-vendor commit (Issue [#88](https://github.com/audiocontrol-org/deskwork/issues/88)). For most adopters the change is invisible: `/plugin marketplace update deskwork` followed by `/plugin install deskwork@deskwork` works as expected.

If `command -v deskwork` returns empty after the upgrade despite Claude Code reporting the plugin loaded, you've hit the upgrade-path edge case tracked in Issue [#89](https://github.com/audiocontrol-org/deskwork/issues/89): Claude Code's `installed_plugins.json` registry retains a stale `installPath` from the old source shape, but disk now has the plugin elsewhere. Workaround:

1. Edit `~/.claude/plugins/installed_plugins.json` and remove the `deskwork@deskwork` (and `deskwork-studio@deskwork`) entries.
2. Edit `<projectRoot>/.claude/settings.local.json` and remove `deskwork@deskwork` from `enabledPlugins` (or set its value to `true`) — earlier `/plugin uninstall` may have left it `false`.
3. Re-run `/plugin install deskwork@deskwork` (and `/plugin install deskwork-studio@deskwork`), then `/reload-plugins`.

Fresh adopters (those without a pre-v0.9.3 install in their plugin cache) do not hit this — the issue is migration-only.

---

## Migrating to v0.9.0 (source-shipped re-architecture)

Phase 23 of the deskwork-plugin work retired the precompiled `bundle/` directory in favor of source-shipped plugins that build at first run. v0.9.0 is the first release on this architecture. This page captures what existing adopters see when they upgrade.

### TL;DR

- One-time `npm install` (~30s) on the first `/deskwork:*` skill invocation after the marketplace update. Subsequent invocations are fast.
- Existing `.deskwork/config.json` works unchanged. No data migration.
- If you previously edited a file under `bundle/` to customize behavior, that surface is gone — migrate the change to the override resolver via `/deskwork:customize <category> <name>`.
- Pins to v0.8.x or earlier still work; they continue to use the old bundle-based architecture.

### What changed under the hood

**Before (≤ v0.8.x):** plugins shipped precompiled ESM bundles at `plugins/<plugin>/bundle/server.mjs` and `packages/cli/bundle/cli.mjs`. The bin wrapper preferred a workspace symlink, fell back to `node bundle.mjs`. Marketplace installs ran the bundle directly with no `npm install` on the operator's side.

**After (v0.9.0+):** plugins ship source. Workspace packages are vendored under `plugins/<plugin>/vendor/<pkg>/` — symlinked in dev clones, materialized to real directory copies at release time by `scripts/materialize-vendor.sh`. The bin wrapper detects a missing `node_modules` (the marketplace-install case) and runs `npm install --omit=dev` once before exec'ing the source via `tsx`. Studio client assets (`/static/dist/*.js`) are produced by an on-startup esbuild pass that writes to `<pluginRoot>/.runtime-cache/dist/`. No precompiled artifacts in the tree.

The full mechanism is documented in [`RELEASING.md`](./RELEASING.md#vendor-materialize-mechanism).

### Adopter checklist

#### 1. Update the marketplace

Same as any other update:

```
/plugin marketplace update deskwork
/reload-plugins
```

#### 2. Expect a one-time install on first invocation

The first time you run `/deskwork:install`, `/deskwork-studio:studio`, or any other `/deskwork:*` skill after the update, the bin wrapper runs `npm install --omit=dev` inside the plugin tree. You'll see:

```
deskwork: first run — installing dependencies (one-time)...
```

(or `deskwork-studio: first run — ...` from the studio plugin). This takes ~30s on a typical machine and is a one-time cost per plugin per update. Subsequent invocations skip the install entirely.

If the install fails (network outage, disk full, etc.), the wrapper exits non-zero with the npm error attached. Re-running the same command after fixing the cause picks up where it left off.

#### 3. Existing configs work unchanged

`.deskwork/config.json`, the editorial calendar markdown files, frontmatter `deskwork.id` UUIDs, and review workflow state on disk are all untouched by the architecture change. No migration helper to run, no schema bump.

#### 4. Replace `bundle/` monkeypatches with overrides

If you locally edited a file under `plugins/<plugin>/bundle/` (or `packages/<pkg>/bundle/`) to customize behavior — re-skin the dashboard, alter a doctor rule, change a render shape — that file no longer exists. The replacement is the override resolver added in Phase 23f.

To migrate:

```
/deskwork:customize templates dashboard      # re-skin the dashboard
/deskwork:customize doctor orphan-frontmatter-id   # alter a doctor rule
```

The skill copies the plugin default into `<projectRoot>/.deskwork/<category>/<name>.ts`. Edit that copy. The runtime resolver picks it up automatically — no plugin fork, no rebuild. Overrides survive plugin upgrades because they live in your project, not the plugin cache.

See [`plugins/deskwork/skills/customize/SKILL.md`](./plugins/deskwork/skills/customize/SKILL.md) for the full list of overridable templates and rules, plus the safety rules around the override module's signature.

#### 5. Pinned releases continue to work

If your install pinned to a specific tag (e.g. `audiocontrol-org/deskwork#v0.8.7`), nothing changes — that tag still resolves to the bundle-based architecture and runs the same way it always did. Move to v0.9.0+ on your schedule.

When you do move forward, drop the pin or update it to the new tag:

```
/plugin marketplace add audiocontrol-org/deskwork#v0.9.0
```

…and proceed through the checklist above.

### Where to file issues

If anything in the migration path doesn't work for you, open an issue at <https://github.com/audiocontrol-org/deskwork/issues> with:

- Your prior pin (if any) and the version you're moving to.
- The exact command you ran and the full output (especially any `npm install` errors from the first-run path).
- Whether you had local `bundle/` edits, and what they did.
