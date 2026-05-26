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
- [ ] `scope-widen "<complaint>"` — DEFERRED to a design-heavy follow-up; tracked at [#292](https://github.com/audiocontrol-org/deskwork/issues/292). The verb semantics need 2-3 mockup alternatives via `/frontend-design` before implementation (proposal-vs-direct-write, single-vs-multi-complaint, integration with `/dw-lifecycle:implement`).
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

- [x] `install-scope-discovery` — landed Phase 8 Task 1 (commit `2737132`). Idempotent bootstrap of `.dw-lifecycle/scope-discovery/`; copies 4 templates + seeds 3 empty registries. 15 vitest scenarios.
- [x] `install-scope-discovery-hooks` — landed Phase 8 Task 2 (commit `6cda930`). Auto-detects Husky vs `.githooks` vs greenfield; writes non-short-circuiting gate chain; manifest at `hooks-installed.json`. 30 vitest scenarios.
- [x] `install-agent-prompts` — landed Phase 8 Task 3 (commit `48fdfdb`). Appends Step 0 fragment to `.claude/agents/code-reviewer.md` + `codebase-auditor.md`; refuses to auto-create agent files. 19 vitest scenarios.
- [ ] `migrate-from-pilot` (audiocontrol-specific) — DEFERRED, tracked at [#291](https://github.com/audiocontrol-org/deskwork/issues/291). Out of scope for Phase 8 (audiocontrol-specific; the four universal install verbs cover the bulk of adopters).
- [x] `uninstall-scope-discovery-hooks` — landed Phase 8 Task 5 (commit `b71fb8b`). Drift-checks each managed file via sha256; refuses on drift unless `--force-uninstall`; strips managed block from merged installs. 20 vitest scenarios.

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

- [ ] For each new skill — broken down per-skill below. 13 of 18 landed; the 5 install-related skills (scope-widen, install-scope-discovery, install-scope-discovery-hooks, install-agent-prompts, uninstall-scope-discovery-hooks, migrate-from-pilot) are deferred to Phase 8 because their behavior is defined by Phase 8 Task 1–5 (install / migrate / uninstall machinery) which has not yet landed — authoring skill prose before the helpers exist would either invent the contract or violate the "no fallbacks / no future-dispatch promises" rule from `agent-discipline.md`.
  - [x] `scope-inventory` — SKILL.md + commands/scope-inventory.md.
  - [x] `scope-summary` — SKILL.md + commands/scope-summary.md.
  - [x] `scope-export` — SKILL.md + commands/scope-export.md.
  - [x] `check-anti-patterns` — SKILL.md + commands/check-anti-patterns.md.
  - [x] `check-adopters` — SKILL.md + commands/check-adopters.md.
  - [x] `check-refactor-preconditions` — SKILL.md + commands/check-refactor-preconditions.md.
  - [x] `check-editor-symmetry` — SKILL.md + commands/check-editor-symmetry.md.
  - [x] `check-deprecations` — SKILL.md + commands/check-deprecations.md (documents pre-#287 shell behavior + the deferral).
  - [x] `batch-dispose` — SKILL.md + commands/batch-dispose.md. (Not in the original Phase 7 enumeration; authored because the Phase 6 Task 3 verb landed and it pairs with dispose-clone + check-disposition-survivor.)
  - [x] `dispose-clone` — SKILL.md + commands/dispose-clone.md.
  - [x] `check-disposition-survivor` — SKILL.md + commands/check-disposition-survivor.md. (Not in the original Phase 7 enumeration; authored because the Phase 6 Task 3 verb landed and the pre-commit gate behavior is operator-facing.)
  - [x] `refresh-clones-baseline` — SKILL.md + commands/refresh-clones-baseline.md.
  - [x] `validate-scope-discovery` — SKILL.md + commands/validate-scope-discovery.md.
  - [ ] `check-clones` — DEFERRED. The Phase 6 rename of `detect-clones` → `check-clones` is itself deferred (Task 2 line cites it as a separate Phase 6 follow-up); authoring prose for a verb whose name is not yet final would create rot. Author when the rename lands.
  - [ ] `scope-widen` — DEFERRED, tracked at [#292](https://github.com/audiocontrol-org/deskwork/issues/292). Subcommand semantics need design via `/frontend-design`; prose blocked on that.
  - [x] `install-scope-discovery` — SKILL.md + commands/install-scope-discovery.md landed Phase 8 commit 6 (this run).
  - [x] `install-scope-discovery-hooks` — SKILL.md + commands/install-scope-discovery-hooks.md landed Phase 8 commit 6.
  - [x] `install-agent-prompts` — SKILL.md + commands/install-agent-prompts.md landed Phase 8 commit 6.
  - [x] `uninstall-scope-discovery-hooks` — SKILL.md + commands/uninstall-scope-discovery-hooks.md landed Phase 8 commit 6.
  - [ ] `migrate-from-pilot` — DEFERRED, tracked at [#291](https://github.com/audiocontrol-org/deskwork/issues/291). Audiocontrol-specific; prose blocked on subcommand implementation.

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
- [x] Greenfield install creates correct dir structure + schema files — `install-scope-discovery` creates `.dw-lifecycle/scope-discovery/` with 4 templates + 3 empty-array seeds; 15 vitest scenarios verify greenfield + idempotent + dry-run + force + partial restore.
- [x] Hook install works with absent/existing/Husky variants — `install-scope-discovery-hooks` detects Husky vs `.githooks` vs greenfield via `detectHusky` + `chooseMode`; 30 vitest scenarios cover all three branches plus merge / replace / refusal / dry-run.
- [x] Agent-prompt install works without trampling existing `.claude/agents/` content — `install-agent-prompts` refuses to auto-create missing files (exit 2); marker-pair detection prevents duplicate blocks; operator content above/below the block is preserved; 19 vitest scenarios.
- [ ] migrate-from-pilot runs cleanly against audiocontrol's actual state — DEFERRED, tracked at [#291](https://github.com/audiocontrol-org/deskwork/issues/291).
- [x] Uninstall drift-checks each managed file via sha256; refuses to remove drifted files unless `--force-uninstall`; strips managed block from merged installs; 20 vitest scenarios.

## Phase 9: Doctor rule additions

**Deliverable:** `/dw-lifecycle:doctor` gains scope-discovery-specific rules with fixers/repair-hints where reasonable.

### Task 1: Config validation rules

- [x] `scope-discovery-config-missing` — install hint; fires when a project's feature docs reference scope-discovery but the config dir is absent. Landed at `plugins/dw-lifecycle/src/scope-discovery/doctor-rules/scope-discovery-config-missing.ts` (commit `29a1a17`).
- [x] `scope-discovery-schema-stale` — migration steps for stale `schemaVersion`; checks clones.yaml / anti-patterns.yaml / adopter-manifests.yaml each for missing / mismatched `schemaVersion`. Plugin's current version published as `CURRENT_SCHEMA_VERSION = 1` in `doctor-rules/types.ts`. Seed YAMLs from `install-scope-discovery` now carry `schemaVersion: 1`. Commit `29a1a17`.
- [x] `clones-yaml-schema-violation` — runs `parseClonesYamlStrict` against the project's clones.yaml; reports shape-error findings with a schema diff hint. Does NOT double-report on refactor-precondition errors (those go to the dedicated rule). Commit `29a1a17`.
- [x] `anti-patterns-yaml-schema-violation` — same shape via `loadRegistry`; reports the registry parser's namespaced error with a schema pointer. Commit `29a1a17`.

### Task 2: Refactor-precondition validation

- [x] `clones-yaml-refactor-incomplete` — walks clones.yaml looking for `disposition: refactor` entries; each missing Step 0a / Step 0b field becomes its own doctor finding with a per-branch repair hint (7 branch types covered: canonical_side / canonical_reason / new_shape_summary-required / new_shape_summary-empty-on-non-new / tests / tests_proof / tests_proof.sha). Commit `1fd6eab`.

### Task 3: Drift detection rules

- [x] `agent-prompt-mirror-drift` — compares the Step 0 fragment in `.claude/agents/code-reviewer.md` + `codebase-auditor.md` against the canonical template; whitespace-normalized body compare; suppressed when `agent-prompt-overrides.md` is present. Repair hint: `install-agent-prompts --force`. Commit `275faef`.
- [x] `override-drift` — operator advisory when a per-file scope-discovery override diverges from the plugin default by > 50 non-blank lines OR exported-symbol surface differs. Heuristic intentionally coarse; operator decides whether to converge. Commit `275faef`.

### Task 4: Install state rules

- [x] `hooks-installed-missing` — reads `hooks-installed.json`; warns when any managed file in the manifest no longer exists. Repair hints surface BOTH re-install and clean-uninstall paths. Commit `20fc0fa`.

**Acceptance Criteria:**
- [x] All 8 new doctor rules implemented + tested against fixture projects — 54 new vitest scenarios across 8 rule-test files; tests use on-disk tmpdir fixtures (no mock fs).
- [x] Repair hints actionable — each rule's message names the exact `/dw-lifecycle:*` skill or file path the operator should target. Smoke against this repo fires `scope-discovery-config-missing` with a recognisable install hint.

## Phase 10: Canary install + graphical-entries paper-test deliverable

**Deliverable:** Deskwork-as-adopter install complete; `graphical-entries` exercised end-to-end; paper-test coverage matrix produced. **v1 acceptance signal — measured 60.9%; ship gate REFRAMED from coverage percentage to dogfood feedback per operator decision 2026-05-25.**

### Task 1: Install scope-discovery in deskwork

- [x] `dw-lifecycle install-scope-discovery` — landed commit `7761a1f`. Creates `.dw-lifecycle/scope-discovery/` with 7 files (4 templates + 3 empty-array seed registries).
- [x] `dw-lifecycle detect-clones --refresh-baseline` — landed commit `2aa89aa`. Initial baseline scoped to `plugins/dw-lifecycle/src/` (37 groups); expanded to whole-repo in commit `0a77a26` (105 groups across packages/ + plugins/). Friction surfaced: `.jscpd.json` config-path mismatch — symlink workaround in place, tracked at [#293](https://github.com/audiocontrol-org/deskwork/issues/293).
- [x] `dw-lifecycle install-scope-discovery-hooks` — landed commit `0a77a26`. Husky-mode detected; writes `.husky/pre-commit` with 5-gate chain + `hooks-installed.json` manifest. Friction surfaced: hook hardcodes `dw-lifecycle` binary which predates scope-discovery subcommands (tracked at [#294](https://github.com/audiocontrol-org/deskwork/issues/294)) + writes `check-editor-symmetry --gate-mode` (unsupported flag, tracked at [#295](https://github.com/audiocontrol-org/deskwork/issues/295)). Hook patched to invoke `npx tsx` and skip the broken flag; documented in commit.
- [x] `dw-lifecycle install-agent-prompts` — landed commit `e2b1750`. Step 0 sections appended to `.claude/agents/{code-reviewer,codebase-auditor}.md`; recorded in `hooks-installed.json`.

### Task 2: Author deskwork-specific anti-patterns

- [x] Populate `.dw-lifecycle/scope-discovery/anti-patterns.yaml` — landed commit `77d457e`. Four entries:
  - `hardcoded-stage-name-array` (per DESKWORK-STATE-MACHINE.md Commandment I) — 5 findings across packages/.
  - `review-state-write` (per Commandment III) — 0 active findings (1 false-positive on doc comment, excluded).
  - `host-required-throw` (per "collections, not websites") — 0 findings.
  - `single-pipeline-shape-assumption` — 0 findings (the live code already uses lane-aware framing in prose).

### Task 3: Exercise the protocol against graphical-entries

- [x] `dw-lifecycle scope-inventory --slug graphical-entries` ran against design-spec PRD substitute — landed commit `09c8510`. Output:
  - `docs/1.0/001-IN-PROGRESS/scope-discovery/scope-inventory-graphical-entries.yaml` (445-line manifest, kind=code).
  - 6 agents activated in ~0.45s, 6 findings, 1 warning (PRD lacks References section).
  - Evidence trail at `docs/1.0/001-IN-PROGRESS/graphical-entries/scope-inventory/runs/20260525T110802Z-1cdd0f/` with all per-agent JSONs + synthesis.md + editor-symmetry.md.
- [ ] `scope-widen` trial — deferred per [#292](https://github.com/audiocontrol-org/deskwork/issues/292) (verb itself not implemented in v1).

### Task 4: Produce paper-test-graphical-entries.md coverage matrix

- [x] 35 documented surfaces enumerated — landed commit `d715179` at `docs/1.0/001-IN-PROGRESS/scope-discovery/paper-test-graphical-entries.md`.
- [x] Per-detector coverage:
  - scope_inventory_caught: **33/35 = 94.3%**
  - scope_widen_caught: deferred (#292)
  - anti_patterns_caught: **4/35 = 11.4%** (starter set per Task 2 brief)
  - step0_enforcement_caught: **27/35 = 77.1%**
- [x] **Combined non-deferred coverage: 60.9%.** Operator decision 2026-05-25: ship v1 at measured coverage; reframe gate.
- [x] 7 operator action items surfaced; 4 already filed as GH issues (#293, #294, #295, #296); 3 are pending operator triage (anti-pattern starter set expansion, scope-widen design at #292, spec References section).

### Task 5: v1 ship + dogfood handoff to graphical-entries

- [x] Tooling-feedback template authored at `plugins/dw-lifecycle/templates/scope-discovery/tooling-feedback.md` — mirrors audiocontrol pilot pattern (categories A/AM/CL/GATE/DSC/MISC; severity high/medium/low; Repro/Workaround/Suggested-fix; append-only).
- [x] Pre-created `docs/1.0/001-IN-PROGRESS/graphical-entries/tooling-feedback.md` from template (empty of entries; graphical-entries team fills as friction surfaces).
- [x] Pre-created `docs/1.0/001-IN-PROGRESS/graphical-entries/dogfood-handoff.md` — operator-facing one-page handoff README naming the dogfood goal, where to start, escalation criteria (TF-vs-GH-issue), closure protocol.
- [x] Agent-discipline rule added: `.claude/rules/agent-discipline.md` § "scope-discovery v1 — dogfood feedback via tooling-feedback.md" documents the workflow for future implementers (template path, escalation, closure import to audit-log).

**Acceptance Criteria:**
- [x] Deskwork canary install completes cleanly — 4 install commands all exit 0; friction issues filed transparently.
- [x] graphical-entries' scope-inventory exercises the protocol end-to-end — Task 3 deliverable.
- [x] paper-test coverage matrix produced — Task 4 deliverable.
- [x] Combined coverage > ~80% — REFRAMED as v1 ship gate. Measured 60.9% in paper-test (Phase 10 Task 4). Operator decision 2026-05-25: ship v1 at measured coverage; dogfood gate replaces percentage gate. graphical-entries implementation team logs friction in docs/1.0/001-IN-PROGRESS/graphical-entries/tooling-feedback.md; v1 hardens via audit cycle on that log (mirror of audiocontrol pilot pattern that produced TF-001..TF-016).
- [x] No regressions in the existing dw-lifecycle skill set — `validate-scope-discovery` runs 401 tests, 398 pass; 3 pre-existing flakes on clone-detector tmpdir-jscpd-spawn timeouts (5s default vitest timeout vs ~1.7s actual per-test cost — unrelated to Phase 10 changes; the same tests pass individually with `--testTimeout=30000`).

## Phase 11: Pattern discovery loop with self-correcting controller

**Source:** Issue [#315](https://github.com/audiocontrol-org/deskwork/issues/315) (first real-world dogfood-cycle finding). Operator design conversation 2026-05-26.

**Problem the phase addresses (captured exhaustively per capture-mode rule; scoping is a separate pass):**

The current scope-discovery surface is **INVENTORY masquerading as DISCOVERY**. The agents match against a fixed hardcoded vocabulary and surface only what's pre-registered. Concrete dogfood failure: an editor component consumed ZERO canonical design-system primitives + ≥14 utility-class hits, survived every scanner run + every audit, was caught only when the operator inspected a screenshot. The structural gap is general: any project using scope-discovery has a registry that can grow stale; the tooling cannot surface novel anti-patterns; the operator-trust failure mode is "green discovery report read as evidence-of-no-novel-anti-patterns."

The phase introduces:
- **Pattern-type vocabulary widening** beyond positive-match regex.
- **The Loop** — a continuous discovery cycle with status-marked catalog entries, orchestrator-mediated dispositions, and a measurement-driven self-correcting controller.
- **Autonomous orchestration** via `/dw-lifecycle:implement` augmented with per-turn audit/judge stack + LLM-judge in-band + external LLM auditor + audit-log memory.
- **Wrong-decision recovery primitives** so the orchestrator can self-correct without dragging the human into every decision.

### Task 1: Pattern-type vocabulary widening (G1–G7)

Today only `type: regex` is expressible. Add type-handler dispatcher in the scan engine; ship as polymorphic catalog with per-project YAML override (existing Phase 3 design supports this for the catalog file but not the type space).

- [ ] **G1**: Polymorphic pattern catalog — type-handler dispatcher; catalog is data, handlers are code, both extensible per-project.
- [ ] **G2**: Negative-match primitive — `{ type: 'negative-space', match_glob, must_contain, threshold }` (the operator-named cheapest fix from #315).
- [ ] **G3**: Coverage-metric primitive — `glob × shape → ratio`; per-directory adoption percentage.
- [ ] **G4**: Statistical-outlier primitive — `glob × distance metric → anomaly score per file`.
- [ ] **G5**: Unmatched-shape clustering pass — synthesis-layer; cluster un-matched content by shape similarity, rank by frequency.
- [ ] **G6**: Semantic primitive (LLM-augmented) — opt-in; gated on cheaper signals.
- [ ] **G7**: Provenance field on findings — `provenance: 'registered-pattern' | 'negative-space' | 'coverage-gap' | 'discovered-candidate' | 'outlier' | 'semantic' | 'prd-theme'`.

### Task 2: The Loop foundation — status markers + disposition lifecycle

The Loop closes by extending existing catalogs with disposition state, not by creating a separate ledger (operator decision 2026-05-26).

- [ ] Add `status:` field to every catalog entry type: `pending | blessed | cursed | ignore | tracked-holdout | withdrawn`.
- [ ] Add `provenance:` block to every catalog entry — `{ source: 'operator-authored' | 'orchestrator-agent' | 'llm-judge-proposed' | 'install-seed' | 'promoted-from-candidate', authored_at, authored_by, context, evidence_link }`.
- [ ] Reversibility primitive: `withdrawn-<finding-id>` status on auto-dispositions overturned by auditor; existing audit-log convention extends to catalog entries.
- [ ] Cross-surface application: anti-patterns / adopter-manifests / editor-symmetry / deprecations / pattern-matrix / regime-holdout-detector ALL gain the status + provenance fields uniformly.

### Task 3: Orchestrator-agent mediation surface

Operator dispositions at architecture-scale; the orchestrator-agent translates to line-level catalog edits (operator decision 2026-05-26: ONE user-level concept, the agent figures out novelty vs refinement vs suppression).

- [ ] Architectural summary of candidates at scan completion — orchestrator clusters raw findings, writes 1-2-sentence operator-readable summaries to a "discovered_candidates" section of the scope-manifest (or sibling artifact).
- [ ] Catalog-edit diff proposal — orchestrator surfaces the line-level catalog changes it would make; operator approves at architecture-level; orchestrator commits the changes.
- [ ] Append-vs-edit autonomy — orchestrator decides whether a disposition implies a new catalog entry (novelty) or refinement of an existing entry (tightening/widening); the operator never makes this choice manually.

### Task 4: Codebase-state metrics

The controller can only adjust based on what it measures. These are observable properties of the codebase; their derivatives become drift/correction signals.

- [ ] **Classification completeness**: fraction of distinct shapes that are catalogued (blessed/cursed/ignore) vs uncatalogued.
- [ ] **Coverage**: per BLESSED pattern, fraction of expected adopters actually adopting.
- [ ] **Violation density**: per CURSED pattern, hit count + concentration (per-directory).
- [ ] **Surface uniformity / outlier presence**: variance in shape across sibling files per directory.
- [ ] **Catalog stability**: edit rate over time.
- [ ] **Discovered-candidate rate**: new shapes surfacing per unit code change.
- [ ] **Disposition latency**: time candidates remain `pending` before triage.

### Task 5: Self-correcting controller

Cadence + intensity are NOT pre-decided. The controller observes drift / correction / auditor-correction signals; adjusts itself.

- [ ] Drift signal = derivative-toward-worse of codebase-state metrics.
- [ ] Correction signal = derivative-toward-better of codebase-state metrics.
- [ ] **Auditor-correction-rate**: count of audit-driven catalog edits (provenance.context: `audit-finding-<id>`) per unit work. The TRUTH SIGNAL — codebase-state metrics can lie when the catalog is incomplete; auditor-correction rate exposes when the model is undercounting drift.
- [ ] Cadence-adjust policy: high drift OR high auditor-correction → tighter cadence, more intensive analysis. Low drift + low auditor-correction → loosen.
- [ ] Sensible defaults shipped from day one (operator decision 2026-05-26: don't pre-decide; ship defaults + telemetry + parameter tuning).
- [ ] Cold-start behavior: fresh install with no measurements defaults to maximum frequency/intensity; ratchets down as the controller earns confidence.
- [ ] Anti-thrashing: bounded oscillation; the controller observes whether its own adjustments are stable.
- [ ] Telemetry: controller decisions are auditable (the operator can inspect "why did frequency go up at scan #47").

### Task 6: `/dw-lifecycle:implement` augmentation — the autonomous loop

The existing implement skill walks the workplan. The augmentation embeds the audit/judge stack and the controller as inline machinery (operator decision 2026-05-26: implement is the entry point; no new `/dw-lifecycle:iterate` skill).

- [ ] Per-turn audit/judge stack inside implement:
  1. Read audit log (catch external auditor updates since last turn).
  2. Internal LLM-judge pass — judges recent work (last commit, last sub-agent dispatch, last catalog edit) for missed candidates / drift / refinement opportunities.
  3. Decide next action via skills + policies + metrics.
  4. Take ONE action.
  5. Fire external LLM auditor prompt (queued for next turn's audit-log read).
- [ ] Hook-cadence is workplan-dependent + controller-tuned (NOT pre-decided per operator 2026-05-26): initial setpoint emerges from workplan metadata + risk markers; controller tunes from there.
- [ ] Termination criteria negotiated per-cycle (NOT pre-decided per operator 2026-05-26): goal-achieved (workplan + acceptance criteria) | escalation (orchestrator queues a needs-human-decision) | budget (cost-cap per cycle) | hard-policy-violation (immediate halt). The orchestrator and operator agree on the cycle's termination contract at the start of each invocation.
- [ ] Resumability state: durable in catalogs + audit log + new `.dw-lifecycle/orchestrator-runtime/` for true mid-flight scratch (operator decision 2026-05-26: durability-first; ephemeral scratch is the exception).

### Task 7: LLM-judge / external-auditor / audit-log integration

Multi-source ensemble: internal judge (in-band, every turn) + external auditor (out-of-band, fired by orchestrator every turn, results read next turn) + audit-log (durable memory). Human is escalation-only target (operator decision 2026-05-26: as little human intervention as possible).

- [ ] Internal LLM-judge implementation — runs as part of `/dw-lifecycle:implement`'s per-turn cycle; reads recent work + catalog state + open candidates; emits per-decision confidence score + proposed dispositions.
- [ ] External LLM auditor invocation — orchestrator fires a third-party LLM audit prompt each turn; results materialize in the audit log; the orchestrator reads them next turn.
- [ ] Audit-log read automation — orchestrator reads audit-log for updates since last turn as routine; no operator action required.
- [ ] Judge-vs-auditor independence — different model/prompt scaffolds; auditor cannot self-grade the judge's work.
- [ ] Confidence calibration — composite signal: judge-confidence × policy-match × skills-exhaustion × auditor-correction-rate; threshold tuned by the controller.

### Task 8: Wrong-decision recovery primitives

If the orchestrator commits a wrong disposition / catalog edit, the system must detect and recover without operator intervention (where possible).

- [ ] Reversible disposition flow: auditor disagreement transitions catalog entry to `pending`; provenance gains `overturned_by: <auditor-finding-id>`.
- [ ] Catalog-edit rollback via `withdrawn-<finding-id>` status — entries are never deleted (preservation rule mirrors audit-log).
- [ ] Trust-calibration updates per auditor-correction event — orchestrator confidence threshold rises after wrong decisions; ratchets down as auditor-correction-rate falls.
- [ ] Systematic-wrongness response: if a CLASS of decisions is consistently wrong, controller routes that class to escalation by default until evidence improves.
- [ ] Initial wrong-decision per session is escalated to human; subsequent ones use calibration-adjusted threshold; if the auditor disagrees AGAIN, escalation re-fires.

### Task 9: Operator escalation surface

Escalation should be rare, high-information, asynchronous-friendly (operator decision 2026-05-26: the rare-but-clear shape).

- [ ] Escalation queue — orchestrator writes a `pending-decision` artifact when confidence is below threshold; the artifact contains the proposed action, the evidence, the orchestrator's reasoning, the question for the operator.
- [ ] Resumption mechanics — next `/dw-lifecycle:implement` invocation reads queued decisions; operator's response in chat (or in-place edit of the artifact) is the input.
- [ ] Visibility surface — orchestrator's per-turn report includes (a) actions taken silently (count + brief summary), (b) escalations queued (with quick-link to the pending-decision artifact), (c) controller adjustments made.

### Task 10: Provenance + audit-log linkage

Every catalog edit traces back to its origin. Audit-log entries link to specific catalog edits. Cross-references navigable in both directions.

- [ ] Provenance field schema standardized across all catalog types.
- [ ] Audit-log entries gain `affects:` links naming catalog entries they touch.
- [ ] Catalog entries gain `audit_history:` listing audit-log findings against them.
- [ ] Doctor rule: `provenance-orphaned-entries` — catalog entries with provenance pointing at audit-findings that don't exist; surfaces broken cross-references.

### Task 11: Cross-surface application

The pattern-type widening + Loop primitives + status/provenance fields apply uniformly to ALL registry-driven scanners, not just `pattern-matrix.ts`.

- [ ] anti-patterns.yaml — schema gains `status`, `provenance`; auto-disposition flow integrates.
- [ ] adopter-manifests.yaml — same.
- [ ] editor-symmetry.md — same (or its underlying registry).
- [ ] deprecations registry — same.
- [ ] regime-holdout-detector — fuses the above with the new types from Task 1.
- [ ] clones.yaml — already has dispositions; align with the new provenance schema for consistency.

### Task 12: Naming alignment

The operator-trust failure mode (green "discovery" report read as no-novel-anti-patterns) is a naming problem (#315 problem space). Decide and apply.

- [ ] Option: rename "discovery agents" → "inventory agents"; add separate `scope-discover` surface for the Loop. OR
- [ ] Option: keep names; make provenance visible enough at the operator surface that the distinction can't be missed. OR
- [ ] Option: hybrid — keep `scope-inventory` (the orchestrator entry-point); rename internal "discovery agents" terminology to "inventory agents"; the Loop's surface becomes the architectural discovery layer.

(Decision deferred to scoping pass per operator 2026-05-26.)

### Task 13: Multi-content-type generality

Today the tooling walks TypeScript source. Deskwork manages content collections, configs, schemas, anything. The pattern catalog + glob + shape model should be content-type-agnostic.

- [ ] Glob + shape primitives content-type-neutral; no TS-coupling in core types.
- [ ] Per-content-type handlers (`.md`, `.yaml`, `.json`) pluggable into the scan engine.
- [ ] Markdown-specific patterns (e.g., frontmatter shape, heading conventions, link patterns) authorable.

(Likely a scoping-pass decision: deferred initial-ship vs designed-in from start.)

### Task 14: Tooling-feedback closure → audit-log import workflow

The existing `tooling-feedback.md` pattern from Phase 10 v1 ship is a feedback-loop primitive for the TOOLING; this task formalizes the closure workflow.

- [ ] TF closure entries (`Status: addressed-<commit>` or `Status: superseded-by-<TF-NN>`) auto-import into the scope-discovery audit-log as `AUDIT-<date>-<NN>` entries with cross-reference.
- [ ] Doctor rule: surface TF entries that have been open > N days without status updates (configurable).
- [ ] Skill: `/dw-lifecycle:tooling-feedback-import` — walks closure-marked TF entries; promotes them to audit-log; closes the TF entry with the new audit-log ID as forwarding pointer.

### Acceptance criteria (captured promises; scoping pass decides what ships when)

- [ ] The Loop runs on every `/dw-lifecycle:implement` turn without operator invocation.
- [ ] Orchestrator auto-dispositions candidates at high confidence; escalates at low confidence.
- [ ] Controller measures codebase-state metrics + auditor-correction-rate; adjusts cadence + intensity accordingly; defaults shipped sensibly per Task 5.
- [ ] Wrong-decision events detectable + reversible; trust calibration adjusts in response.
- [ ] Pattern-type vocabulary supports at minimum the 4 v1 operator-named patterns from #315 (Tailwind/utility-class catch-all, hardcoded-color, hover-only-affordance, negative-space-no-canonical-consumer).
- [ ] The full Loop applies uniformly across the registry-driven surfaces (Task 11).
- [ ] Pre-existing user-visible behavior of `/dw-lifecycle:implement` is preserved; no regressions in completed phase tests.
- [ ] KeygroupSummary-shape repro fixture (anonymized) commits to test suite + passes (negative-space pattern fires on a synthetic component with ZERO canonical primitives + ≥5 utility-class hits).
- [ ] First dogfood cycle (graphical-entries team) reports the gap is closed via the v1.1 tooling-feedback log.

### Open scoping decisions (intentionally NOT pre-decided)

- Which of Tasks 1–14 ship in v1.1 vs deferred to v1.2 / future?
- Which of G1–G7 pattern types ship at minimum (operator named negative-space as the cheapest fix; G3/G4/G5/G6 are stretch).
- Task 12 naming alignment: which option?
- Task 13 multi-content-type: designed-in or deferred?
- LLM-judge cost ceilings + model selection.
- Task 9 escalation-surface UX (artifact format, edit-in-place vs chat-resume).

### Risks and unknowns

- LLM-judge cost predictability — per-turn LLM calls multiply across long sessions.
- Auditor-correction-rate noise — false positives in the truth signal would push the controller toward over-tight cadence; needs validation discipline.
- Thrashing — controller's cadence adjustments oscillating; anti-thrashing must be measurable.
- Catalog-state explosion — large `pending` ledger; needs ranking + bounded triage surface.
- Performance — per-turn audit/judge stack overhead; needs profiling baseline before architecture lock-in.
- Confidence calibration cold-start — first session has no measurements; defaults must be conservative without paralyzing the orchestrator.

### Existing primitives to build on (not greenfield)

- `clones.yaml` dispositions — closest existing analog of status-marked catalog with operator-curated triage.
- audit-log workflow + statuses (open / acknowledged / fixed / verified / withdrawn) — provides the disposition state machine + provenance pattern.
- `tooling-feedback.md` pattern — feedback-loop primitive ready to extend.
- dispatch-wrapper (Phase 5) — sub-agent dispatch mediation; extension point for the orchestrator-agent.
- pattern-matrix YAML override (Phase 3) — already supports per-project pattern catalog; needs schema extension for new types.
- agent-discipline rule § "scope-discovery v1 — dogfood feedback via tooling-feedback.md" — already documents the closure-feedback workflow.
