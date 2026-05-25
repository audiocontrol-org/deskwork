---
slug: scope-discovery
targetVersion: "1.0"
date: 2026-05-25
designSpec: docs/superpowers/specs/2026-05-24-scope-discovery-design.md
canary: graphical-entries (sequencing-coupled: v1 ships BEFORE graphical-entries enters implementation)
---

# Workplan: scope-discovery

**Goal:** Canonize the audiocontrol-piloted Scope Discovery Protocol into the `dw-lifecycle` plugin: CODE in plugin / CONFIG in project per THESIS Consequence 3; auto-invoke in existing skills with opt-out; opt-in scaffolds for hook + agent-prompt mirrors. v1 acceptance signal = paper-test coverage > ~80% against the `graphical-entries` canary.

Design spec: `docs/superpowers/specs/2026-05-24-scope-discovery-design.md`. Audiocontrol pilot source-of-truth: `~/work/audiocontrol-work/audiocontrol-scope-discovery-protocol/`.

## Phase 1: Plugin-side scanner core (clone-detector)

**Deliverable:** clone-detector + jscpd-runner + clones.yaml parser/writer ported from pilot; gutted-stub self-check passing.

### Task 1: Port clone-detector + jscpd-runner

- [x] Copy `tools/scope-discovery/{clone-detector,jscpd-runner,clones-yaml}.ts` from audiocontrol pilot to `plugins/dw-lifecycle/src/scope-discovery/`
- [x] Adjust import paths for dw-lifecycle's module layout
- [x] Resolve any audiocontrol-specific assumptions; generalize

### Task 2: clones.yaml schema + validator

- [x] Author `plugins/dw-lifecycle/src/scope-discovery/schema/clones.yaml.schema.json`
- [x] Author `clones-yaml.refactor.ts` parse-time validator (Step 0a × 4 branches + Step 0b × 3 branches) — already satisfied by Task 1's verbatim port; `parseClonesYamlDetailed` invokes `validateRefactorPreconditions` at line 207.

### Task 3: Adversarial validator harness

- [x] Port `clone-detector.validate.ts` (4 scenarios incl. gutted-stub) verbatim — split into 8 vitest files in `plugins/dw-lifecycle/src/__tests__/scope-discovery/` per the 300–500-line cap.
- [x] Validator runs via `npm --workspace @deskwork/plugin-dw-lifecycle run test -- scope-discovery`

**Acceptance Criteria:**
- [x] `dw-lifecycle detect-clones` runs clone detector against a fixture project + emits disposition diff (subprocess-based in `clone-detector.baseline.test.ts` et al.; `check-clones` is the Phase 6 rename)
- [x] Schema validator catches malformed `clones.yaml` entries at parse time (`parseClonesYamlStrict` throws `ClonesYamlParseError`; JSON Schema documents the contract for adopters' editors)
- [x] Gutted-stub self-check: harness FAILS if clone-detector's logic is gutted (verified: 7 of 17 scope-discovery tests fail when `detectClones` body is replaced with `process.stdout.write('0 groups; 0 NEW; 0 DROPPED\n'); process.exit(0);`)

## Phase 2: Anti-patterns + refactor-preconditions + adopter-manifests scanners

**Deliverable:** Three additional scanners ported from pilot with their own schemas + validator harnesses.

### Task 1: Anti-patterns scanner + type dispatcher

- [x] Port `check-anti-patterns.ts` + `anti-patterns-registry.ts` + `anti-patterns-report.ts` from pilot
- [x] Pattern type dispatcher supporting `glob` / `regex` / `ast-grep` / `ts-morph` — v1 ships regex-only (matches pilot); follow-up [#285](https://github.com/audiocontrol-org/deskwork/issues/285) tracks glob/ast-grep/ts-morph extension.
- [x] Schema `anti-patterns.yaml.schema.json`

### Task 2: Refactor-preconditions enforcer

- [x] Port `check-refactor-preconditions.ts` + `check-refactor-preconditions.runtime.ts`
- [x] Validator harness covering Step 0a × 4 branches + Step 0b × 3 branches — 8 vitest scenarios incl. gutted-stub adversarial check; uses real dw-lifecycle commit SHA `14d90ae` as `REAL_SHA` preflight target.

### Task 3: Adopter-manifests checker

- [x] Port `adopter-manifests-registry.ts` + `adopter-manifests-report.ts` + `check-adopters.ts`
- [x] Schema `adopter-manifests.yaml.schema.json` — authored from scratch (pilot had no equivalent); covers structural validation, semantic rules stay in `parseRegistry` SSOT.

### Task 4 (follow-up): Anti-patterns canonical_file field

- [ ] Add `canonical_file?: string` field to `AntiPatternEntry` + thread through `isPathExcluded` so the matcher auto-excludes the primitive's own implementation regardless of `excludes_paths:` — surfaced by audiocontrol pilot TF-002 (AUDIT-20260525-05); tracked at [#288](https://github.com/audiocontrol-org/deskwork/issues/288).
- [ ] Update `anti-patterns.yaml.schema.json` to include the field with description.
- [ ] Adversarial scenario asserting `canonical_file` auto-excludes regardless of `excludes_paths:` shape.

**Acceptance Criteria:**
- [x] All three scanners run via `dw-lifecycle check-{anti-patterns,refactor-preconditions,adopters}` — confirmed in `dw-lifecycle --help` subcommand list.
- [x] Schema validators catch malformed YAMLs — `parseRegistry` throws with descriptive messages on shape violations; JSON Schemas document the contract for adopters' editors.
- [x] Adversarial harnesses pass + gutted-stub self-checks engage — anti-patterns: 14/16 fail under gut; refactor-preconditions: 7/8 fail under gut; adopter-manifests: 20/24 fail under gut + cross-cutting `adopter-manifests.validate.test.ts` probe.

## Phase 3: Four universal discovery agents + synthesis pass

**Deliverable:** All four discovery agents + synthesis produce a validated `scope-manifest.yaml`.

### Task 1: ui-route-enumerator (React-Router default, generalizable)

- [x] Port `discovery-agents/ui-route-enumerator.ts` from pilot
- [x] Extract router detection into a strategy interface; React-Router strategy is the default; Vue Router / Next.js / SvelteKit etc. are operator overrides via customize — `RouterStrategy` interface + `DEFAULT_STRATEGIES` registry landed; multi-match throws asking the operator to disambiguate. Vue/Next/SvelteKit default strategies tracked in [#286](https://github.com/audiocontrol-org/deskwork/issues/286).

### Task 2: ast-grep-matrix

- [x] Port `discovery-agents/ast-grep-matrix.ts` from pilot — renamed to `pattern-matrix.ts` (regex-only; no `ast-grep` binary). Runtime discriminator stays `'ast-grep-matrix'` for JSON wire-format stability.
- [x] Curated default pattern list (any-type, ts-ignore, magic numbers); project override at `.dw-lifecycle/scope-discovery/pattern-matrix-patterns.yaml` — built-in catalog ships 4 CLAUDE.md-aligned patterns; the audiocontrol-specific `ac-class-consumer` was dropped; override loader honored (smoke-verified).

### Task 3: clone-detector-reader

- [x] Port `discovery-agents/clone-detector-reader.ts` from pilot
- [x] Reads project's `clones.yaml`; filters by feature scope — `DEFAULT_BASELINE` migrated to `.dw-lifecycle/scope-discovery/clones.yaml`.

### Task 4: prd-themed-pattern-hunter

- [x] Port `discovery-agents/prd-themed-pattern-hunter.ts` from pilot
- [x] Tokenize PRD frontmatter + body; top-N keyword extraction — `tokenizePrd` strips URL/bare-host components before bag-of-words; covered by `prd-themed-pattern-hunter.test.ts` (gutted-stub teeth check confirms a regressed tokenizer leaks URL fragments).

### Task 5: Synthesis pass + scope-manifest schema

- [x] Port `synthesis.ts` + `synthesis-derive.ts` + `synthesis-types.ts` — split per the 300-500 cap: `synthesis.ts` (263) + `synthesis-cli.ts` (230) + `synthesis-derive.ts` (396) + `synthesis-derive-regime.ts` (100).
- [x] Schema `scope-manifest.yaml.schema.json` — ported verbatim with deskwork-scoped `$id`.
- [x] `manifest-validator.ts` enforces schema — ajv 2020 compiler + scenario-ref cross-check + `validateManifestOnce` cached entry point.

**Acceptance Criteria:**
- [x] `dw-lifecycle scope-inventory <slug>` fans the four agents in parallel + writes validated scope-manifest.yaml — smoke-verified against a synthetic-but-substantive PRD against `plugins/dw-lifecycle/src` module-root; produced `kind=code`, 4 agents consumed, 1 module emitted, schema-valid.
- [x] Operator overrides of any individual agent honored — `pattern-matrix.ts`'s YAML override loader at `.dw-lifecycle/scope-discovery/pattern-matrix-patterns.yaml` smoke-verified to replace the built-in catalog. Per-agent override resolution beyond `pattern-matrix` is scaffolded via the `RouterStrategy` interface (#286 tracks the additional default strategies).
- [x] Per-run evidence trail lands at `docs/<v>/001-IN-PROGRESS/<slug>/scope-inventory/runs/<stamp>-<runId>/` — smoke-verified in an isolated tmpdir; trail contains the 4 agent JSONs + `synthesis.md` + `args.json` at the documented path shape.

## Phase 4: Config-activated discovery agents

**Deliverable:** Three config-activated agents (no-op when project config doesn't activate them).

### Task 1: regime-holdout-detector

- [x] Port from pilot; synthesizes the four scan types into `regime_holdouts:` section on the scope manifest — landed at `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/regime-holdout-detector.ts` (commit `362ce6d`). Deprecation gate stubbed; tracked at [#287](https://github.com/audiocontrol-org/deskwork/issues/287).
- [x] Activates only if `anti-patterns.yaml` OR `adopter-manifests.yaml` has entries — orchestrator's `decideActivations` in `scope-inventory.ts` checks file presence; agent prints `scope-inventory: skipped regime-holdout-detector (...)` when none of the three gate files are present.

### Task 2: editor-symmetry-scanner

- [x] Port `check-editor-symmetry.ts` from pilot — landed at `plugins/dw-lifecycle/src/scope-discovery/check-editor-symmetry.ts` (commit `1322841`) with `--module-root` + `--write` + `--quiet` flags; subcommand registered in `cli.ts` as `dw-lifecycle check-editor-symmetry`.
- [x] Activates only if `.dw-lifecycle/scope-discovery/adopter-manifests.yaml` exists with manifest entries — workplan's original phrasing referenced `editor-symmetry.md` (an OUTPUT) as the activator; the pilot-faithful implementation gates on `adopter-manifests.yaml` (the INPUT). Per the Phase 4 pilot map §3; documented in `scope-inventory.ts`'s `decideActivations`.

### Task 3: adopter-manifest-checker integration

- [x] Integrate the Phase 2 adopter-manifest scanner into the `/scope-inventory` agent fleet — landed as a 6th `DiscoveryAgentFinding` variant at `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/adopter-manifest-checker.ts` (commit `0288d15`). Synthesis-derive-regime dedupes `(file, id)` so running both this agent and the regime-holdout-detector's adopter sub-pass doesn't double-count.
- [x] Activates only if `adopter-manifests.yaml` has entries — orchestrator gates on `existsSync` of the registry path; agent prints `scope-inventory: skipped adopter-manifest-checker (...)` when absent.

**Acceptance Criteria:**
- [x] Three agents activate ONLY when project config has the relevant entries — verified via `/tmp/phase4-acceptance-c1-noop.sh` (empty tmpdir, all three skip notes print, no per-agent JSON or `editor-symmetry.md` artifact in evidence trail).
- [x] Agents not activated cost zero (no scan time) — no-op run timed at 0.526s vs activated run at 0.603s (delta 77ms ≈ scan + matrix + JSON write cost); the skip notes print BEFORE the synthesis pass, confirming the gating is upstream of cost.
- [x] `regime_holdouts:` section on scope-manifest populated when active — verified via `/tmp/phase4-acceptance-c2-activated.sh`; the section contains `anti_patterns` (2 entries), `adopter_manifests` (2), `editor_symmetry` (1), `deprecations: []` (stubbed per [#287](https://github.com/audiocontrol-org/deskwork/issues/287)), and `meta.total: 5`.

## Phase 5: Dispatch wrapper + skill-prose convention template

**Deliverable:** Library-API `wrap()` + prelude template; orchestrator skills documented to call `wrap()` explicitly.

### Task 1: Library-API wrap()

- [x] Port `dispatch-wrapper.ts` + `dispatch-grammar.ts` + `dispatch-wrapper.fixtures.ts` from pilot — landed at `plugins/dw-lifecycle/src/scope-discovery/{dispatch-grammar,dispatch-wrapper,refactor-preconditions-prompt}.ts` + `src/__tests__/scope-discovery/dispatch-wrapper.fixtures.ts` (commit `f2cee2f`).
- [x] `wrap(agentType, prompt, options)` injects return-grammar prelude, awaits dispatchFn, parses + validates return, throws `DispatchRejected` on grammar violation — Error subclass (the accepted inheritance exception); library-only (no CLI subcommand).

### Task 2: Forbidden-deferral phrase list

- [x] Default list sourced from `.claude/rules/agent-discipline.md` §"'Just for now' is bullshit" — 21 substring phrases + 7 regex patterns shipped in `dispatch-grammar.ts`.
- [x] Project override at `.dw-lifecycle/scope-discovery/forbidden-deferral-phrases.yaml` — REPLACES built-in list (no merge); schema at `plugins/dw-lifecycle/src/scope-discovery/schema/forbidden-deferral-phrases.yaml.schema.json` (commit `200a4be`).

### Task 3: Refactor-marker auto-prelude

- [x] When dispatched task carries a refactor marker, wrapper appends `REFACTOR_PRECONDITIONS_CHECKLIST` prelude — checked in `wrap()` via `isRefactorContextPromptWith`.
- [x] Marker detection via regex set; configurable per project — built-in defaults: `/refactor/i`, `/extract(?:ion|ing)?/i`, `/clones?\.yaml/i`, `/canonical_side/i`, `/tests_proof/i`; override at `.dw-lifecycle/scope-discovery/refactor-markers.yaml` (replaces built-in list); schema at `plugins/dw-lifecycle/src/scope-discovery/schema/refactor-markers.yaml.schema.json`.

### Task 4: Skill-prose convention template

- [x] Ship `dispatch-wrapper-prelude.md` as plugin asset — landed at `plugins/dw-lifecycle/templates/scope-discovery/dispatch-wrapper-prelude.md` (commit `85f416d`).
- [x] Document its use in orchestrator SKILL.md files — template covers purpose, library API, the enforced grammar, rejection conditions, refactor auto-prelude trigger, both project overrides + schema references.

### Task 5: 43-scenario adversarial harness

- [x] Port `dispatch-wrapper.validate.ts` verbatim; covers all grammar-violation cases incl. two-level gutted-stub — landed at `plugins/dw-lifecycle/src/__tests__/scope-discovery/dispatch-wrapper.test.ts` as 57 vitest cases (42 canned scenarios + 4 gutted-stub self-check + 6 per-marker auto-prelude + 5 project-override tests) (commit `4386782`).

### Task 6 (follow-up): Primitive-extraction dispatch hygiene

- [ ] Extend `dispatch-wrapper-prelude.md` with a "Primitive-extraction dispatch hygiene" section enumerating the integration-layer audit concerns (CSS class-name conflicts, ARIA contract correctness, callback-index drift, wire-format rounding/clamping). Surfaced by audiocontrol pilot TF-016 (AUDIT-20260525-09); tracked at [#290](https://github.com/audiocontrol-org/deskwork/issues/290).
- [ ] Ship `plugins/dw-lifecycle/templates/scope-discovery/primitive-extraction-checklist.md` — Medium-option deliverable, operators copy via `/dw-lifecycle:customize`.
- [ ] (Optional, Heavy) Extend `wrap()` to optionally inject an integration-layer audit prelude when the agent type matches a `ui-engineer`-style marker; mirrors the existing refactor-marker auto-prelude pattern.

**Acceptance Criteria:**
- [x] `wrap()` rejects sub-agent returns missing any `Searched/Included/Excluded` label — exercised by 3 dedicated rejection scenarios + `missingBlocks` set-equality assertion.
- [x] Forbidden-deferral phrases reject; project overrides honored — 21 phrase scenarios + 7 regex scenarios + 5 override-loader tests (REPLACE semantics; built-in phrase no longer rejects under override; override phrase DOES reject; malformed override file throws).
- [x] Refactor-marker auto-prelude engages on every documented marker — 5 `it.each` cases iterate `REFACTOR_CONTEXT_MARKERS`, each asserts `REFACTOR-CONTEXT PRECONDITIONS` appears in the dispatched prompt; non-refactor prompt confirms suppression.
- [x] 43/43 scenarios pass + gutted-stub self-check engages — full plugin suite at 495/495 (438 baseline + 57 new); gutted-stub verification documented: bypassing parser+validator inside `wrap()` produces 38 of 57 failures (proves teeth across both layers + override loaders).

## Phase 6: CLI subcommands

**Deliverable:** All ~20 new CLI verbs land in `plugins/dw-lifecycle/src/subcommands/` + registered in `cli.ts`.

### Task 1: Inventory + widen + summary commands

- [x] `scope-inventory <slug>` — landed in Phase 3; fans 4 universal agents in parallel + Phase 4 config-activated agents.
- [ ] `scope-widen "<complaint>"` — pending.
- [x] `scope-summary [--surface <glob>]` — ported verbatim from audiocontrol pilot (`tools/scope-discovery/summary.ts`). 4-field summary line (`total | pending-touching | pending-intra | dispositioned-touching`), `--json` + `--verbose` + `--clones` override; default clones path generalized to `.dw-lifecycle/scope-discovery/clones.yaml`. 15 vitest scenarios cover the pure compute math, programmatic + CLI surfaces, gutted-stub teeth (all-zero counter must fail mixed-fixture assertion).

### Task 2: Check-* gate commands

- [x] `check-clones [--gate-mode]` — subcommand registered as `detect-clones` in Phase 1; `--gate-mode` flag landed as a no-op-for-symmetry (`detect-clones` already exits 1 on NEW groups by default — the hook contract). Rename `detect-clones` → `check-clones` is a separate Phase 6 follow-up.
- [x] `check-anti-patterns [--gate-mode]` — subcommand registered in Phase 2; `--gate-mode` flag landed. Default is informational (findings → exit 0, full report on stdout); `--gate-mode` flips to hook-friendly exit 1 on findings. **Schema follow-up:** add optional `negative_match_classes:` array per pilot TF-015 (AUDIT-20260525-08); validator auto-generates negative-test scenarios. Pairs with #285 pattern-type dispatcher work.
- [x] `check-deprecations [--write]` — subcommand SHELL landed; deprecation-scan port still tracked at [#287](https://github.com/audiocontrol-org/deskwork/issues/287). Empty-registry happy path (stdout one-line status + #287 link), `--quiet` suppresses, `--json` emits documented shape (`{ blocked: [], safeToDelete: [], deprecation_count: 0 }`), `--write` + `--artifact` are accepted no-ops until #287 lands. Forward-compatible: when #287 lands the scan logic back-fills without changing the CLI contract. 15 vitest scenarios.
- [x] `check-adopters [--gate-mode]` — subcommand registered in Phase 2; `--gate-mode` flag landed (default informational; flag flips to hook-friendly exit 1 on holdouts).
- [x] `check-editor-symmetry [--write]` — landed in Phase 4 with `--write` flag honored; default writes to `docs/<v>/001-IN-PROGRESS/<slug>/scope-inventory/editor-symmetry.md`.
- [x] `check-refactor-preconditions [--gate-mode]` — subcommand registered in Phase 2; `--gate-mode` flag landed (default informational; flag flips to hook-friendly exit 1 on precondition failures).

### Task 3: Disposition + baseline commands

- [x] `dispose-clone <id> --as <refactor|keep-with-reason|ignore-with-justification> [args]` — refuses without Step 0a/0b flags on refactor disposition. Single-id convenience wrapper around `batch-dispose`. `keep-with-reason` + `ignore-with-justification` pass through verbatim; `--as refactor` requires all Step 0a/0b precondition flags (`--canonical-side`, `--canonical-reason`, [`--new-shape-summary` if canonical-side=new], `--tests`, `--tests-proof-sha`, `--tests-proof-demonstration`) AND still refuses to write (refactor's 5 fields don't fit `--reason` shape; the wrapper redirects to manual editing + `dw-lifecycle check-refactor-preconditions`). The flag-presence requirement is a forcing function — the operator who tries `--as refactor` sees the full precondition surface in the error message. 19 vitest scenarios.
- [x] `refresh-clones-baseline` — thin wrapper carving `detect-clones --refresh-baseline` into its own subcommand. Closes the operator-ergonomics loop opened by AUDIT-20260525-07: clone-detector's batch-dispose hint already cites `dw-lifecycle refresh-clones-baseline` as the recovery path, this commit makes the verb resolvable. Forwards `--baseline` + `--quiet` verbatim; `--gate-mode` intentionally NOT accepted (refresh is mutating by definition). 10 vitest scenarios cover the pure `forwardedArgs` injector (idempotency, ordering) + `wantsHelp` detector + CLI `--help`/`-h` surface.
- [x] `batch-dispose <id> --disposition <D> --reason "<text>"` — landed as `dw-lifecycle batch-dispose`. Closes the TODO at `clone-detector.ts:182` (now emits paste-ready `dw-lifecycle batch-dispose ...` command in the hint, no TODO referenced). Closes [#284](https://github.com/audiocontrol-org/deskwork/issues/284); pilot TF-014 (AUDIT-20260525-07) addressed via the Light option — unknown-id error cites the `dw-lifecycle detect-clones --refresh-baseline` prereq so the operator's recovery path is obvious.
- [x] `check-disposition-survivor` — landed as `dw-lifecycle check-disposition-survivor`. Pre-commit gate that fails the commit on any `keep-with-reason`/`refactor`/`ignore-with-justification` → `pending` transition unless the operator passes `--allow-disposition-loss`. Compares HEAD's baseline (via `git show`) against the working tree. Closes [#289](https://github.com/audiocontrol-org/deskwork/issues/289); pilot reference: TF-013 (AUDIT-20260525-06). Phase 8 hook-chain wires it in.

### Task 4: Install / migrate / uninstall commands

- [ ] `install-scope-discovery`
- [ ] `install-scope-discovery-hooks`
- [ ] `install-agent-prompts`
- [ ] `migrate-from-pilot` (audiocontrol-specific)
- [ ] `uninstall-scope-discovery-hooks`

### Task 5: Validator + export commands

- [x] `validate-scope-discovery` — runs all adversarial harnesses. Spawns `npx vitest run scope-discovery` from the dw-lifecycle workspace root; forwards stdout/stderr/exit-code verbatim. `--quiet` switches to the dot reporter. Exit codes mirror vitest (0 all-passed, 1 failure, 2 invalid args). 3 vitest scenarios cover the flag-parse contract; the spawn path is exercised in practice by every existing `npm test -- scope-discovery` run.
- [x] `scope-export [--json]` — emit a previously-produced `scope-manifest.yaml` to stdout. Default path resolves from `--slug` (`docs/1.0/001-IN-PROGRESS/<slug>/scope-manifest.yaml`, matching `scope-inventory`'s default output); `--manifest <path>` overrides explicitly. Default mode emits raw YAML verbatim (preserves comments + formatting); `--json` re-emits via `yaml.parse` + `JSON.stringify`. 10 vitest scenarios.

**Acceptance Criteria:**
- [ ] All ~20 CLI verbs invokable via `dw-lifecycle <verb>` + via skill prose
- [x] `--gate-mode` flag on check-* commands exits non-zero on violations — landed across `check-anti-patterns`, `check-adopters`, `check-refactor-preconditions` (default informational; flag flips to hook-friendly exit 1) and `detect-clones` (already gate-by-default; flag is a no-op for symmetry). 10 new vitest scenarios cover the flag delta.
- [x] `--json` flag on summary/export commands emits structured output — `scope-summary --json` emits `{ surface, clones, total, pending-touching, pending-intra, dispositioned-touching }`; `scope-export --json` emits the parsed manifest re-serialized via `JSON.stringify`; `check-deprecations --json` emits `{ blocked, safeToDelete, deprecation_count, note }`.

## Phase 7: Slash command skill prose

**Deliverable:** SKILL.md + commands/<name>.md files for each of the ~18 new + 5 updated `/dw-lifecycle:*` skills.

### Task 1: New skill prose (18 skills)

- [ ] For each new skill (scope-inventory, scope-widen, scope-summary, check-clones, check-anti-patterns, check-deprecations, check-adopters, check-editor-symmetry, check-refactor-preconditions, dispose-clone, refresh-clones-baseline, install-scope-discovery, install-scope-discovery-hooks, install-agent-prompts, uninstall-scope-discovery-hooks, migrate-from-pilot, validate-scope-discovery, scope-export):
  - [ ] `plugins/dw-lifecycle/skills/<name>/SKILL.md` with operator-facing flow
  - [ ] `plugins/dw-lifecycle/commands/<name>.md` command file

### Task 2: Updated skill prose (5 skills)

- [ ] `/dw-lifecycle:define` — document auto-scope-inventory + `--no-scope-inventory`
- [ ] `/dw-lifecycle:implement` — document auto-scope-widen + dispatch-wrapper engagement + `--no-scope-widen`
- [ ] `/dw-lifecycle:review` — document auto-clone-detector + `--no-clone-check`
- [ ] `/dw-lifecycle:doctor` — document new doctor rules
- [ ] `/dw-lifecycle:customize` — document `scope-discovery <name>` category

**Acceptance Criteria:**
- [ ] All ~23 skills discoverable via slash-command picker
- [ ] Existing skills' auto-invocation documented + opt-out flags surfaced

## Phase 8: Install / migrate / uninstall machinery

**Deliverable:** Install skills functional end-to-end against fixture projects + audiocontrol-specific migration.

### Task 1: install-scope-discovery

- [ ] Bootstrap `.dw-lifecycle/scope-discovery/` config dir; copy README + LAYOUT.md + refactor-preconditions-checklist.md templates from plugin
- [ ] Refuse if already present (idempotent re-run reports + no-op)

### Task 2: install-scope-discovery-hooks

- [ ] Detect `.githooks/pre-commit` presence; offer `--merge` / `--replace` / `--force`
- [ ] Detect Husky in `package.json`; register hook if present
- [ ] Write `hooks-installed.json` with provenance

### Task 3: install-agent-prompts

- [ ] Detect `.claude/agents/{code-reviewer,codebase-auditor}.md` presence; offer `--merge` / `--force`
- [ ] Write Step 0 §verification sections generated from canonical fragment
- [ ] Record in `hooks-installed.json`

### Task 4: migrate-from-pilot (audiocontrol-specific)

- [ ] Reads audiocontrol's existing `tools/scope-discovery/` + `docs/scope-discovery/`
- [ ] Copies CONFIG verbatim to `.dw-lifecycle/scope-discovery/`
- [ ] Diffs CODE against plugin defaults per file
- [ ] Produces per-file contribute-back-vs-customize-override report

### Task 5: uninstall-scope-discovery-hooks

- [ ] Reads `hooks-installed.json`; drift-checks each installed file
- [ ] Removes files; removes manifest entries
- [ ] `--force-uninstall` overrides drift refusal

**Acceptance Criteria:**
- [ ] Greenfield install creates correct dir structure + schema files
- [ ] Hook install works with absent/existing/Husky variants
- [ ] Agent-prompt install works without trampling existing `.claude/agents/` content
- [ ] migrate-from-pilot runs cleanly against audiocontrol's actual state

## Phase 9: Doctor rule additions

**Deliverable:** `/dw-lifecycle:doctor` gains scope-discovery-specific rules with fixers/repair-hints where reasonable.

### Task 1: Config validation rules

- [ ] `scope-discovery-config-missing` — install hint
- [ ] `scope-discovery-schema-stale` — migration steps for stale `schemaVersion`
- [ ] `clones-yaml-schema-violation`, `anti-patterns-yaml-schema-violation` — diff against schema

### Task 2: Refactor-precondition validation

- [ ] `clones-yaml-refactor-incomplete` — Step 0a/0b missing fields; per-branch repair hints

### Task 3: Drift detection rules

- [ ] `mirror-drift` — agent-prompt mirror diverges from canonical fragment; `--fix` regenerates
- [ ] `override-drift` — project per-file scanner override diverges from plugin default by > N lines; operator advisory

### Task 4: Install state rules

- [ ] `hooks-installed-missing` — hooks-installed.json references files that no longer exist; re-install hint

**Acceptance Criteria:**
- [ ] All 7 new doctor rules implemented + tested against fixture projects
- [ ] Repair hints actionable

## Phase 10: Canary install + graphical-entries paper-test deliverable

**Deliverable:** Deskwork-as-adopter install complete; `graphical-entries` exercised end-to-end; paper-test coverage matrix produced. **v1 acceptance signal.**

### Task 1: Install scope-discovery in deskwork

- [ ] `/dw-lifecycle:install-scope-discovery` from `/Users/orion/work/deskwork`
- [ ] `/dw-lifecycle:refresh-clones-baseline` against deskwork codebase; initial dispositioned baseline
- [ ] `/dw-lifecycle:install-scope-discovery-hooks` wires pre-commit gate
- [ ] `/dw-lifecycle:install-agent-prompts` writes Step 0 mirrors

### Task 2: Author deskwork-specific anti-patterns

- [ ] Populate `.dw-lifecycle/scope-discovery/anti-patterns.yaml`:
  - Hardcoded stage references (per DESKWORK-STATE-MACHINE.md Commandment I)
  - Legacy `reviewState` consumers (per Commandment III)
  - Single-pipeline assumptions
  - Studio surfaces that assume `host` is required

### Task 3: Exercise the protocol against graphical-entries

- [ ] `/dw-lifecycle:setup graphical-entries` auto-invokes `/scope-inventory graphical-entries`
- [ ] Operator reviews resulting scope-manifest
- [ ] Trial run of `/scope-widen "<sample-complaint>"` against a deskwork-side complaint

### Task 4: Produce paper-test-graphical-entries.md coverage matrix

- [ ] Enumerate every documented surface graphical-entries will touch
- [ ] For each surface, record whether `/scope-inventory` / `/scope-widen` / anti-patterns scanner / Step 0 enforcement caught it
- [ ] Compute combined coverage percentage
- [ ] Document at `docs/1.0/001-IN-PROGRESS/scope-discovery/paper-test-graphical-entries.md`

**Acceptance Criteria:**
- [ ] Deskwork canary install completes cleanly
- [ ] graphical-entries' `/dw-lifecycle:setup` exercises the protocol end-to-end
- [ ] paper-test coverage matrix produced
- [ ] **Combined coverage > ~80%** — the v1 ship gate
- [ ] No regressions in the existing dw-lifecycle skill set
