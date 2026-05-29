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

- [x] Add `canonical_file?: string` field to `AntiPatternEntry` + thread through `isPathExcluded` so the matcher auto-excludes the primitive's own implementation regardless of `excludes_paths:` — landed in commit `d849a6f`. Surfaced by audiocontrol pilot TF-002 (AUDIT-20260525-05); closes [#288](https://github.com/audiocontrol-org/deskwork/issues/288). Renamed the earlier-scaffolded `canonical_implementation_file` to match the issue spec; byte-exact path matching (no glob), silent auto-exclusion (no log line), union semantics with `excludes_paths:` (both apply together).
- [x] Update `anti-patterns.yaml.schema.json` to include the field with description — description names the byte-exact + union semantics so adopters' editors document the contract inline.
- [x] Adversarial scenario asserting `canonical_file` auto-excludes regardless of `excludes_paths:` shape — `anti-patterns.canonical-file.test.ts` now has 6/6 passing scenarios (5 renamed + 1 new issue-#288-derived: plants `canonical_file: 'modules/foo/canonical.tsx'`, asserts the named canonical is silently skipped AND a sibling holdout at `modules/bar/holdout.tsx` matching the same regex still surfaces — auto-exclusion is scoped to the named file only).

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

- [x] Port from pilot; synthesizes the four scan types into `regime_holdouts:` section on the scope manifest — landed at `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/regime-holdout-detector.ts` (commit `362ce6d`). Deprecation gate stub later replaced with full scanner port (closes [#287](https://github.com/audiocontrol-org/deskwork/issues/287)).
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
- [x] `regime_holdouts:` section on scope-manifest populated when active — verified via `/tmp/phase4-acceptance-c2-activated.sh`; the section contains `anti_patterns` (2 entries), `adopter_manifests` (2), `editor_symmetry` (1), and `deprecations` (originally stubbed pending [#287](https://github.com/audiocontrol-org/deskwork/issues/287); now populated from the real scanner since the port landed), and `meta.total` rolls up across all four sources.

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
- [x] `scope-widen "<complaint>"` — landed (closes [#292](https://github.com/audiocontrol-org/deskwork/issues/292)). Library API + thin subcommand shim + 15 vitest scenarios. Required positional complaint + `--slug`; optional `--manifest`, `--prd-path`, `--apply`, `--evidence-trail`, `--module-root`, `--quiet`. Default behavior is dry-run (prints delta to stderr, exits 0 without modifying the manifest). Complaint injection strategy: appended as `## Operator complaint (scope-widen)` section to a per-run augmented PRD; the PRD-themed pattern hunter tokenizes the complaint alongside the PRD body so operator words become themed keywords without bespoke parsing. Evidence trail under `docs/<v>/001-IN-PROGRESS/<slug>/scope-inventory/widen-runs/<stamp>-<runId>/`. Delta computation is purely additive; theme keys strip the `<term> (N occurrences)` suffix so occurrence-count shifts don't false-positive as additions. `--apply` merges the delta into the manifest; `generated_by` (e.g., `curated`) is preserved. Smarter complaint parsing (noun phrases, identifiers, additional grep patterns) is deferred to Phase 11's orchestrator-agent work; v1 is plumbing.
- [x] `scope-summary [--surface <glob>]` — ported verbatim from audiocontrol pilot (`tools/scope-discovery/summary.ts`). 4-field summary line (`total | pending-touching | pending-intra | dispositioned-touching`), `--json` + `--verbose` + `--clones` override; default clones path generalized to `.dw-lifecycle/scope-discovery/clones.yaml`. 15 vitest scenarios cover the pure compute math, programmatic + CLI surfaces, gutted-stub teeth (all-zero counter must fail mixed-fixture assertion).

### Task 2: Check-* gate commands

- [x] `check-clones [--gate-mode]` — subcommand originally registered as `detect-clones` in Phase 1; renamed to `check-clones` in the Phase 6 verb-naming pass with `detect-clones` preserved as a forever-back-compat alias (both names dispatch to the same handler, so adopter pre-commit hooks installed by pre-rename versions of `install-scope-discovery-hooks` continue to work without modification). Library API renamed `detectClones` → `checkClones`; new hook chains emit `check-clones --gate-mode`; deprecation-hint surfaced in CLI `--help` listing. `--gate-mode` flag landed as a no-op-for-symmetry (check-clones already exits 1 on NEW groups by default — the hook contract). New skill at `plugins/dw-lifecycle/skills/check-clones/SKILL.md` is the canonical procedure; `plugins/dw-lifecycle/skills/detect-clones/SKILL.md` is a thin redirector pointing at the canonical skill. 3 new vitest scenarios — 2 gate-mode-flag-no-op + 1 alias-symmetry (both names produce identical exit codes on the same fixture).
- [x] `check-anti-patterns [--gate-mode]` — subcommand registered in Phase 2; `--gate-mode` flag landed. Default is informational (findings → exit 0, full report on stdout); `--gate-mode` flips to hook-friendly exit 1 on findings. **Schema follow-up:** add optional `negative_match_classes:` array per pilot TF-015 (AUDIT-20260525-08); validator auto-generates negative-test scenarios. Pairs with #285 pattern-type dispatcher work.
- [x] `check-deprecations [--write]` — subcommand SHELL → full scanner port landed. Walks the scan root for file-level `@deprecated` JSDoc tags + `// DEPRECATED:` line comments within the first 20 lines; resolves importers via `@/` alias + basename-relative path forms; classifies as blocked (importers > 0) or safe-to-delete (importers === 0). `--write` emits markdown to `.dw-lifecycle/scope-discovery/deprecation-queue.md`. `--json` emits structured output (`{ total, deprecation_count, filesVisited, blocked: [...], safeToDelete: [...] }`). `--module-root` accepts the `@/` alias root (default `src`; pilot's audiocontrol layout uses `modules/<editor>/src`). Closes [#287](https://github.com/audiocontrol-org/deskwork/issues/287). 23 vitest scenarios including gutted-stub teeth. Regime-holdout-detector now uses the real scanner; `meta.deprecation_count` populates from real importers.
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
- [x] `migrate-from-pilot` (audiocontrol-specific in NAME ONLY — works for any project mirroring the canonical pilot layout) — landed for [#291](https://github.com/audiocontrol-org/deskwork/issues/291). Verb reads the pilot's `tools/scope-discovery/` + `docs/scope-discovery/`; copies CONFIG verbatim into `.dw-lifecycle/scope-discovery/`; diffs CODE per-file against the plugin defaults and categorizes each as identical / pilot-ahead (contribute-back) / pilot-behind (sync from plugin) / diverges (customize-override). Default dry-run; `--apply` materializes CONFIG copies; `--force` overwrites divergent targets; `--report-out <path>` writes markdown report to disk. 38 vitest scenarios.
- [x] `uninstall-scope-discovery-hooks` — landed Phase 8 Task 5 (commit `b71fb8b`). Drift-checks each managed file via sha256; refuses on drift unless `--force-uninstall`; strips managed block from merged installs. 20 vitest scenarios.

### Task 5: Validator + export commands

- [x] `validate-scope-discovery` — runs all adversarial harnesses. Spawns `npx vitest run scope-discovery` from the dw-lifecycle workspace root; forwards stdout/stderr/exit-code verbatim. `--quiet` switches to the dot reporter. Exit codes mirror vitest (0 all-passed, 1 failure, 2 invalid args). 3 vitest scenarios cover the flag-parse contract; the spawn path is exercised in practice by every existing `npm test -- scope-discovery` run.
- [x] `scope-export [--json]` — emit a previously-produced `scope-manifest.yaml` to stdout. Default path resolves from `--slug` (`docs/1.0/001-IN-PROGRESS/<slug>/scope-manifest.yaml`, matching `scope-inventory`'s default output); `--manifest <path>` overrides explicitly. Default mode emits raw YAML verbatim (preserves comments + formatting); `--json` re-emits via `yaml.parse` + `JSON.stringify`. 10 vitest scenarios.

**Acceptance Criteria:**
- [ ] All ~20 CLI verbs invokable via `dw-lifecycle <verb>` + via skill prose
- [x] `--gate-mode` flag on check-* commands exits non-zero on violations — landed across `check-anti-patterns`, `check-adopters`, `check-refactor-preconditions` (default informational; flag flips to hook-friendly exit 1) and `detect-clones` (already gate-by-default; flag is a no-op for symmetry). 10 new vitest scenarios cover the flag delta.
- [x] `--json` flag on summary/export commands emits structured output — `scope-summary --json` emits `{ surface, clones, total, pending-touching, pending-intra, dispositioned-touching }`; `scope-export --json` emits the parsed manifest re-serialized via `JSON.stringify`; `check-deprecations --json` emits `{ total, deprecation_count, filesVisited, blocked: [...], safeToDelete: [...] }` (the post-port shape; the pre-port shell's `{ blocked, safeToDelete, deprecation_count, note }` is a superset).

## Phase 7: Slash command skill prose

**Deliverable:** SKILL.md + commands/<name>.md files for each of the ~18 new + 5 updated `/dw-lifecycle:*` skills.

### Task 1: New skill prose (18 skills)

- [x] For each new skill — broken down per-skill below. 19 of 19 landed (`scope-widen` shipped post-#292 closure; the 4 Phase-8 install-related skills landed in Phase 8 commit 6; `migrate-from-pilot` skill prose landed alongside the subcommand for [#291](https://github.com/audiocontrol-org/deskwork/issues/291)).
  - [x] `scope-inventory` — SKILL.md + commands/scope-inventory.md.
  - [x] `scope-summary` — SKILL.md + commands/scope-summary.md.
  - [x] `scope-export` — SKILL.md + commands/scope-export.md.
  - [x] `check-anti-patterns` — SKILL.md + commands/check-anti-patterns.md.
  - [x] `check-adopters` — SKILL.md + commands/check-adopters.md.
  - [x] `check-refactor-preconditions` — SKILL.md + commands/check-refactor-preconditions.md.
  - [x] `check-editor-symmetry` — SKILL.md + commands/check-editor-symmetry.md.
  - [x] `check-deprecations` — SKILL.md + commands/check-deprecations.md (updated to document the now-real scanner behavior after the #287 port landed).
  - [x] `batch-dispose` — SKILL.md + commands/batch-dispose.md. (Not in the original Phase 7 enumeration; authored because the Phase 6 Task 3 verb landed and it pairs with dispose-clone + check-disposition-survivor.)
  - [x] `dispose-clone` — SKILL.md + commands/dispose-clone.md.
  - [x] `check-disposition-survivor` — SKILL.md + commands/check-disposition-survivor.md. (Not in the original Phase 7 enumeration; authored because the Phase 6 Task 3 verb landed and the pre-commit gate behavior is operator-facing.)
  - [x] `refresh-clones-baseline` — SKILL.md + commands/refresh-clones-baseline.md.
  - [x] `validate-scope-discovery` — SKILL.md + commands/validate-scope-discovery.md.
  - [x] `check-clones` — SKILL.md + commands/check-clones.md authored in the Phase 6 Task 2 rename pass; sibling `detect-clones` SKILL.md + commands/detect-clones.md are thin redirectors documenting the back-compat alias.
  - [x] `scope-widen` — SKILL.md + commands/scope-widen.md landed alongside the Phase 6 verb implementation (closes [#292](https://github.com/audiocontrol-org/deskwork/issues/292)). Mirrors `scope-inventory` skill prose style: Steps + Flags + Error handling + When-to-use sections.
  - [x] `install-scope-discovery` — SKILL.md + commands/install-scope-discovery.md landed Phase 8 commit 6 (this run).
  - [x] `install-scope-discovery-hooks` — SKILL.md + commands/install-scope-discovery-hooks.md landed Phase 8 commit 6.
  - [x] `install-agent-prompts` — SKILL.md + commands/install-agent-prompts.md landed Phase 8 commit 6.
  - [x] `uninstall-scope-discovery-hooks` — SKILL.md + commands/uninstall-scope-discovery-hooks.md landed Phase 8 commit 6.
  - [x] `migrate-from-pilot` — SKILL.md + commands/migrate-from-pilot.md landed alongside the verb implementation (closes [#291](https://github.com/audiocontrol-org/deskwork/issues/291)). Mirrors `scope-inventory` skill prose style: Steps + Flags + CODE-diff legend + Error handling + When-to-use sections.

### Task 2: Updated skill prose (5 skills)

- [x] `/dw-lifecycle:define` — document auto-scope-inventory + `--no-scope-inventory`
- [x] `/dw-lifecycle:implement` — document auto-scope-widen + dispatch-wrapper engagement + `--no-scope-widen` (skill body + commands/implement.md frontmatter updated; references `wrap()` from `plugins/dw-lifecycle/src/scope-discovery/dispatch-wrapper.ts` and `plugins/dw-lifecycle/templates/scope-discovery/dispatch-wrapper-prelude.md`).
- [x] `/dw-lifecycle:review` — document auto-clone-detector + `--no-clone-check`
- [x] `/dw-lifecycle:doctor` — document new doctor rules
- [x] `/dw-lifecycle:customize` — document `scope-discovery <name>` category

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

- [x] Reads the pilot's existing `tools/scope-discovery/` + `docs/scope-discovery/` — refuses with exit 2 + actionable error when `tools/scope-discovery/` is absent (the migration source isn't a scope-discovery pilot).
- [x] Copies CONFIG verbatim to `.dw-lifecycle/scope-discovery/` — four canonical YAMLs (clones, anti-patterns, adopter-manifests, deprecation-queue); `absent-on-pilot` skips for missing files; `--force` overwrites divergent targets; default refuses on divergent target conflict.
- [x] Diffs CODE against plugin defaults per file — set-based line diff produces `addedInPilot` / `removedInPilot` counts; categorizes each file as identical / pilot-ahead / pilot-behind / diverges / pilot-only / plugin-only.
- [x] Produces per-file contribute-back-vs-customize-override report — markdown table with file / status / lines-diff / suggested-action columns + a status-symbol legend; emitted to stdout or `--report-out <path>` on disk.

### Task 5: uninstall-scope-discovery-hooks

- [ ] Reads `hooks-installed.json`; drift-checks each installed file
- [ ] Removes files; removes manifest entries
- [ ] `--force-uninstall` overrides drift refusal

**Acceptance Criteria:**
- [x] Greenfield install creates correct dir structure + schema files — `install-scope-discovery` creates `.dw-lifecycle/scope-discovery/` with 4 templates + 3 empty-array seeds; 15 vitest scenarios verify greenfield + idempotent + dry-run + force + partial restore.
- [x] Hook install works with absent/existing/Husky variants — `install-scope-discovery-hooks` detects Husky vs `.githooks` vs greenfield via `detectHusky` + `chooseMode`; 30 vitest scenarios cover all three branches plus merge / replace / refusal / dry-run.
- [x] Agent-prompt install works without trampling existing `.claude/agents/` content — `install-agent-prompts` refuses to auto-create missing files (exit 2); marker-pair detection prevents duplicate blocks; operator content above/below the block is preserved; 19 vitest scenarios.
- [x] migrate-from-pilot runs cleanly against audiocontrol's actual state — smoke-tested against `~/work/audiocontrol-work/audiocontrol-scope-discovery-protocol/`; produces a categorized report with all four diff statuses surfacing (identical / pilot-ahead / pilot-behind / diverges) plus pilot-only entries for the validate/fixture modules the plugin doesn't ship. Closes [#291](https://github.com/audiocontrol-org/deskwork/issues/291).
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

**Parent issue:** [#316](https://github.com/audiocontrol-org/deskwork/issues/316).
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

- [x] **G1**: Polymorphic pattern catalog — type-handler dispatcher; catalog is data, handlers are code, both extensible per-project. Landed at `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/pattern-handlers/{index,types,regex,negative-space,coverage,outlier,semantic,loader,glob}.ts`; `pattern-matrix.ts` refactored to delegate via `dispatchPattern()`; schema extended to discriminated union; backward-compat: entries without `type` default to `'regex'`.
- [x] **G2**: Negative-match primitive — `{ type: 'negative-space', match_glob, must_contain, threshold, secondary_contains? }` (the operator-named cheapest fix from #315). KeygroupSummary-shape repro pinned by `negative-space.test.ts`; smoke-verified end-to-end on synthetic fixture (file in expected-adopter glob with zero canonical + 11 utility hits → finding fires; healthy sibling does not fire).
- [x] **G3**: Coverage-metric primitive — `glob × shape → ratio` emitted as synthesis-layer metric on `PatternFinding.metrics.{numerator,denominator,ratio}`; per-directory adoption percentage feeds Phase 11 Task 4 codebase-state metrics.
- [x] **G4**: Statistical-outlier primitive — `glob × distance metric → cosine distance per file vs directory-sibling centroid`; z-score thresholded at `threshold_sigma` (default 2.0); supports `token-composition` + `className-composition` distance metrics.
- [x] **G5**: Unmatched-shape clustering pass — synthesis-layer STUB shipped at `synthesis-discovered-candidates.ts` (always emits `[]` + stderr advisory). Algorithm tracked at [#318](https://github.com/audiocontrol-org/deskwork/issues/318) with full spec + acceptance criteria.
- [x] **G6**: Semantic primitive (LLM-augmented) — type registered + dispatched; LLM-invocation STUB returns zero findings + `metrics.stub: 1`. Wiring tracked at [#319](https://github.com/audiocontrol-org/deskwork/issues/319); will share dispatch infrastructure with Phase 11 Task 7 LLM-judge.
- [x] **G7**: Provenance field on findings — `provenance: 'registered-pattern' | 'negative-space' | 'coverage-gap' | 'discovered-candidate' | 'outlier' | 'semantic' | 'prd-theme'`. Added to `PatternFinding` in `discovery-agents/types.ts`; each handler sets its own provenance tag.

### Task 2: The Loop foundation — status markers + disposition lifecycle

The Loop closes by extending existing catalogs with disposition state, not by creating a separate ledger (operator decision 2026-05-26).

- [x] Add `status:` field to every catalog entry type: `pending | blessed | cursed | ignore | tracked-holdout | withdrawn`. Shared module at `plugins/dw-lifecycle/src/scope-discovery/util/catalog-status.ts` defines the type union + `parseCatalogEntryMetadata` + `filterActiveEntries`. Defaults: `blessed` for hand-authored pre-Loop entries (synthesized at parse time so existing registries continue to enforce). Scanners enforce only `blessed` + `cursed`; every other status is skipped.
- [x] Add `provenance:` block to every catalog entry — `{ source: 'operator-authored' | 'orchestrator-agent' | 'llm-judge-proposed' | 'install-seed' | 'promoted-from-candidate', authored_at, authored_by, context, evidence_link }`. Synthesized to `{ source: 'install-seed', authored_at: '1970-01-01T00:00:00Z' }` when absent (back-compat).
- [x] Reversibility primitive: `withdrawn-<finding-id>` status on auto-dispositions overturned by auditor; the parser enforces that `withdrawn` entries MUST carry `provenance.context: 'audit-finding-<id>'`. Entries are NEVER deleted — `withdrawn` preserves history (mirrors the audit-log convention). The bidirectional audit-log linkage (catalog entries ↔ audit-log entries with `affects:` / `audit_history:`) is Phase 11 Task 10's responsibility; this dispatch lands the field shape.
- [x] Cross-surface application: anti-patterns / adopter-manifests / clones / pattern-matrix / deprecations all carry the status + provenance fields uniformly. Schemas updated for each registry. clones.yaml's existing `disposition:` field coexists with `status:`; the mapping (`disposition: pending` → `status: pending`; `keep-with-reason` / `refactor` → `blessed`; `ignore-with-justification` → `ignore`) is fixed and lives in `dispositionToStatus()`. The disposition-survivor gate continues to operate on `disposition:` (clones-specific semantic). Operator-supplied `status:` overrides the disposition-derived default. editor-symmetry's underlying registry is `adopter-manifests.yaml` (the editor-symmetry-scanner consumes it) so it inherits the Loop fields by reference; regime-holdout-detector is a synthesis pass over the four scanners and inherits via the same surface. New doctor rule `catalog-entry-missing-status` warns when entries omit explicit `status:` (one finding per registry naming the omitted entry ids). 30 new vitest scenarios in `loop-foundation.test.ts` cross-cut every parser + scanner + doctor rule; 861/861 plugin tests pass.

### Task 3: Orchestrator-agent mediation surface

Operator dispositions at architecture-scale; the orchestrator-agent translates to line-level catalog edits (operator decision 2026-05-26: ONE user-level concept, the agent figures out novelty vs refinement vs suppression).

- [x] Architectural summary of candidates at scan completion — orchestrator clusters raw findings, writes 1-2-sentence operator-readable summaries to a "discovered_candidates" section of the scope-manifest. Landed at `plugins/dw-lifecycle/src/scope-discovery/mediation/{mediation-types,cluster-candidates,propose-catalog-edits,mediation}.ts`. Clustering is Jaccard n-gram similarity over the matched-excerpt (default threshold 0.7, ngram size 3); `synthesis.ts` invokes `mediate({ findings })` in PHASE 1 and pipes the architectural summaries through `toManifestSection()` into the manifest's `discovered_candidates:` array. Schema updated with the `discovered_candidate_entry` definition; manifest emission populates the section when clusters are present.
- [x] Catalog-edit diff proposal — orchestrator surfaces the line-level catalog changes it would make; operator approves at architecture-level; orchestrator commits the changes. `proposeCatalogEdits()` produces `CatalogEditProposal[]` with unified-diff-style `diff` field, `proposed_entry` (a YAML-compatible plain object), and a non-empty `reason` field naming the cluster + operator's disposition + the operation chosen.
- [x] Append-vs-edit autonomy — orchestrator decides whether a disposition implies a new catalog entry (novelty) or refinement of an existing entry (tightening/widening); the operator never makes this choice manually. Decision (per Phase 11 Task 3 pre-made decision #3): if the cluster's representative excerpt matches an existing entry's `match_regex` via dry-run, propose `edit` against that entry; otherwise propose `append`. Withdrawn entries are skipped (read-only — un-withdrawal requires an audit-finding link). The mediation library is PURE computation (no FS, no network, no module-level state); the call site (scope-inventory / `/dw-lifecycle:implement`) handles I/O. 45 vitest scenarios across `cluster-candidates.test.ts` (26) + `propose-catalog-edits.test.ts` (19); proposed entries round-trip through the actual anti-patterns + adopter-manifests registry parsers (proves the wire format is valid YAML, not just a JS object that looks YAML-shaped). Full plugin suite at 1208/1208.

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

- [x] Drift signal = derivative-toward-worse of codebase-state metrics. Implemented in `plugins/dw-lifecycle/src/scope-discovery/controller/controller-signals.ts#computeDriftAndCorrection`; projection happens through the `MetricsSnapshot` shape (the controller doesn't carry the full Phase 11 Task 4 metrics block — the synthesis pass projects to scalar fields the controller derives from).
- [x] Correction signal = derivative-toward-better of codebase-state metrics. Same module; the per-metric direction inverts depending on toward-better convention (`classification_completeness` increasing = better; `violation_density` decreasing = better; etc.).
- [x] **Auditor-correction-rate**: count of audit-driven catalog edits (provenance.context: `audit-finding-<id>`) per unit work. Implemented in `controller-signals.ts#computeAuditorCorrectionRate`. Counts entries whose `provenance: 'llm-judge-proposed'` OR `context: audit-finding-*`; normalised by max(1, history length) and saturated at 1.0. The TRUTH SIGNAL per the PRD — codebase-state metrics can lie when the catalog is incomplete; auditor-correction rate exposes when the model is undercounting drift.
- [x] Cadence-adjust policy: high drift OR high auditor-correction → tighter cadence, more intensive analysis. Low drift + low auditor-correction → loosen. Implemented in `controller-policies.ts` per-field proposal functions (`proposeFrequencyAdjustment`, `proposeIntensityAdjustment`, `proposeEscalationAdjustment`). Frequency + intensity both respond to drift OR auditor signal; escalation threshold relaxes ONLY when BOTH drift and auditor have been low for the configured window.
- [x] Sensible defaults shipped from day one. `DEFAULT_CONTROLLER_CONFIG` in `controller-config.ts`: cold-start frequency 1.0, cold-start intensity 1.0, cold-start escalation threshold 0.9, ratchet-down rate 0.1 per N=5 turns, anti-thrashing K=3, anti-thrashing damping 0.5. Operators override via `.dw-lifecycle/scope-discovery/controller-config.yaml` (schema at `schema/controller-config.yaml.schema.json`).
- [x] Cold-start behavior: fresh install with no measurements defaults to maximum frequency/intensity; ratchets down as the controller earns confidence. Cold-start branch in `controller.ts#runController` emits cold-start defaults verbatim when `history.length === 0`; convergence test verifies ~10 turns to a stable cadence well below max but above the floor under steady inputs.
- [x] Anti-thrashing: bounded oscillation; the controller observes whether its own adjustments are stable. `controller-policies.ts#detectOscillation` looks back the prior K adjustments on the same field; reversal direction triggers `anti-thrashing-damping` audit entry + 50% damping factor applied to the proposed delta.
- [x] Telemetry: controller decisions are auditable (the operator can inspect "why did frequency go up at scan #47"). Every decision carries a per-field `audit_trail` of `ControllerAdjustment` entries (`{ field, signal_used, prior_value, new_value, reason, adjusted_at }`); state persists at `.dw-lifecycle/scope-discovery/orchestrator-runtime/controller-state.json` (gitignored under the orchestrator-runtime dir) via `controller-state.ts`. Retention bounded at 24 entries (newest-first). 39 vitest scenarios cover cold-start, steady-state, ratchet-down, high-drift, high-auditor-correction, anti-thrashing damping, convergence (~10 cold-start turns to stable), bounds + clamping, config loader + parse-time invariants, state load/persist + retention bound.

### Task 6: `/dw-lifecycle:implement` augmentation — the autonomous loop

The existing implement skill walks the workplan. The augmentation embeds the audit/judge stack and the controller as inline machinery (operator decision 2026-05-26: implement is the entry point; no new `/dw-lifecycle:iterate` skill).

- [x] Per-turn audit/judge stack inside implement — landed at `plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/` as the `runOrchestratorTurn` library (composition of Phase 11 Tasks 2-11). Per-turn cycle:
  1. Read audit log via `llm/audit-log-reader.ts` (durable watermark at `.dw-lifecycle/scope-discovery/orchestrator-runtime/last-audit-read.json`).
  2. Detect wrong-decisions via `recovery/detect-wrong-decisions.ts`; emit reversal proposals via `recovery/reverse-disposition.ts`.
  3. Internal LLM-judge pass via `llm/judge.ts` (in-band, through `wrap()`).
  4. Mediate findings via `mediation/mediation.ts` (cluster + architectural summaries; PHASE 2 catalog-edit proposals when dispositions supplied).
  5. Run controller via `controller/controller.ts`; persist updated history to `controller-state.json` in-flight.
  6. Project codebase-state metrics via `discovery-agents/codebase-state-metrics.ts`.
  7. Fire external auditor via `llm/auditor.ts` (fire-and-forget; emits `audit-request-<id>.json` under `pending-audits/`).
  8. Build escalation visibility surface via `escalation/escalation-visibility.ts`.
- [x] Hook-cadence is workplan-dependent + controller-tuned — `runController` reads codebase-state metrics + auditor-correction-rate signals; emits `frequency / intensity / escalationThreshold` for the NEXT turn. Cold-start defaults to max (1.0/1.0/0.9); ratchet-down on sustained low drift; anti-thrashing damping on oscillation. Tunables in `controller-config.yaml`.
- [x] Termination criteria negotiated per-cycle — the orchestrator-agent driving the implement skill reads `TurnReport` after each turn and decides: goal-achieved (workplan acceptance) → continue; escalation queued + count > 0 → pause for operator; budget/policy-violation → the orchestrator-agent halts and surfaces. No new code surface — termination is read off the report fields.
- [x] Resumability state — `orchestrator-loop/loop-state.ts` persists at `.dw-lifecycle/scope-discovery/orchestrator-runtime/loop-state.json` (audit watermark + last turn id + bounded turnHistory ring). Controller history persists separately at `controller-state.json`; trust-calibration at `trust-calibration.json`; pending escalations at `pending-escalations/<id>.json`; audit requests at `pending-audits/audit-request-<id>.json`. All gitignored under `.dw-lifecycle/scope-discovery/orchestrator-runtime/`.
- [x] Tests: 35 new vitest scenarios at `src/__tests__/scope-discovery/orchestrator-loop/` (loop-config 9 + loop-state 12 + loop-turn end-to-end 14). The end-to-end test plants synthetic catalog + audit-log state on disk, runs `runOrchestratorTurn`, and asserts the composed turn report carries the expected outputs from every wired sub-library.
- [x] SKILL.md updated — `plugins/dw-lifecycle/skills/implement/SKILL.md` carries a "Phase 11 — Autonomous loop" section that documents the per-turn cycle, the `TurnReport` shape, the durable state files, the configuration surface, and the new error-handling cases (judge dispatch failure + wrong-decision-recovery escalation).

### Task 7: LLM-judge / external-auditor / audit-log integration

Multi-source ensemble: internal judge (in-band, every turn) + external auditor (out-of-band, fired by orchestrator every turn, results read next turn) + audit-log (durable memory). Human is escalation-only target (operator decision 2026-05-26: as little human intervention as possible).

- [x] Internal LLM-judge implementation — runs as part of `/dw-lifecycle:implement`'s per-turn cycle; reads recent work + catalog state + open candidates; emits per-decision confidence score + proposed dispositions. Landed at `plugins/dw-lifecycle/src/scope-discovery/llm/judge.ts` with prompt template `templates/scope-discovery/judge-prompt.md`. Library defines the SHAPE of the call; the actual LLM network call is dispatched through Phase 5's `wrap()` so the dispatch grammar + forbidden-deferral phrases + refactor-marker prelude all apply to the judge's reasoning trail.
- [x] External LLM auditor invocation — orchestrator fires a third-party LLM audit prompt each turn; results materialize in the audit log; the orchestrator reads them next turn. Landed at `plugins/dw-lifecycle/src/scope-discovery/llm/auditor.ts` (fire-and-forget; emits `audit-request-<id>.json` under `.dw-lifecycle/scope-discovery/pending-audits/`) with prompt template `templates/scope-discovery/audit-prompt.md`. External auditor process is operator-provided (separate model class; plugin documents the contract).
- [x] Audit-log read automation — orchestrator reads audit-log for updates since last turn as routine; no operator action required. Landed at `plugins/dw-lifecycle/src/scope-discovery/llm/audit-log-reader.ts` with durable watermark at `.dw-lifecycle/scope-discovery/orchestrator-runtime/last-audit-read.json`. Wired into `scope-inventory` as a silent pre-flight (skip when scope-discovery isn't installed; `--no-audit-read` for operator opt-out).
- [x] Judge-vs-auditor independence — different model/prompt scaffolds; auditor cannot self-grade the judge's work. Two distinct templates (`judge-prompt.md` vs `audit-prompt.md`) + two distinct model classes in `llm-judge.yaml` (judge default `claude-sonnet-4`; auditor default `claude-opus-4`). Schema documents the independence rule.
- [x] **Closes [#319](https://github.com/audiocontrol-org/deskwork/issues/319)** — semantic pattern handler upgraded from STUB to wired LLM-judge path via `enrichSemanticFinding()`. Sync `semanticHandler.apply` retained for backward compat with the polymorphic dispatcher; the async wired path is the contract orchestrator-side scope-inventory drives.
- [ ] Confidence calibration — composite signal: judge-confidence × policy-match × skills-exhaustion × auditor-correction-rate; threshold tuned by the controller. (Task 5 controller work; depends on Task 4 metrics + this Task 7 LLM ensemble being in place — both prerequisites land here.)

### Task 8: Wrong-decision recovery primitives

If the orchestrator commits a wrong disposition / catalog edit, the system must detect and recover without operator intervention (where possible).

- [x] Reversible disposition flow + catalog-edit rollback via `withdrawn-<finding-id>` status + trust-calibration updates + systematic-wrongness response landed at `plugins/dw-lifecycle/src/scope-discovery/recovery/` (`recovery-types.ts`, `detect-wrong-decisions.ts`, `reverse-disposition.ts`, `trust-calibration.ts`, `systematic-wrongness.ts`). Detection: catalog entries with `provenance.source: orchestrator-agent` or `llm-judge-proposed` that an audit-log finding cites via `Affects:` with the body containing a disagreement token (`overturn`, `wrong`, `incorrect`, `disagree`, `reverse`) surface as `WrongDecisionEvent`s. Reversal is SOFT — emits `CatalogEditProposal` (per pre-made decision #4) with `status: withdrawn` + `provenance.context: audit-finding-<id>` (the reversibility-primitive invariant from Phase 11 Task 2 + Task 10). Trust calibration: +0.05 per wrong-decision event in the relevant class; -0.01 per correct decision; bounded [0.0, 0.4]; durable state at `.dw-lifecycle/scope-discovery/orchestrator-runtime/trust-calibration.json`. Systematic-wrongness: class-key = `<pattern-type>|<disposition>|<shape-tag>`; threshold N=3 within K=10 events crosses to escalation by default. 56 vitest scenarios across `src/__tests__/scope-discovery/recovery/` cover per-module behavior + an end-to-end recovery scenario (detect → reverse → calibrate → classify → persist → ratchet-down on correct).
- [ ] Initial wrong-decision per session is escalated to human; subsequent ones use calibration-adjusted threshold; if the auditor disagrees AGAIN, escalation re-fires. (Wiring across the orchestrator surface is Task 9 — the primitives this task ships are consumed there.)

### Task 9: Operator escalation surface

Escalation should be rare, high-information, asynchronous-friendly (operator decision 2026-05-26: the rare-but-clear shape).

- [x] Escalation queue — orchestrator writes a pending-escalation artifact when confidence is below threshold; the artifact contains `action_proposed`, `evidence` (summary + links + excerpts), `reasoning`, `question`, and an ordered list of `options`. Implementation at `plugins/dw-lifecycle/src/scope-discovery/escalation/escalation-queue.ts` — `enqueueEscalation(input, opts)` writes a single JSON file under `.dw-lifecycle/scope-discovery/orchestrator-runtime/pending-escalations/<id>.json` via atomic write-then-rename; ids follow the auditor's `YYYYMMDDHHMMSS-<6hex>` format. Validation rejects empty action/reasoning/question, empty options list, and duplicate option ids. Shared parser at `escalation-parse.ts` keeps the queue file under the 500-line cap. Per pre-made decision #1: single JSON files (operator can edit inline; resolution writes a `resolution:` field).
- [x] Resumption mechanics — `readPendingEscalations(opts)` lists open escalations (those with `resolution: null`); `resolveEscalation(id, decision, opts)` reads the pending file, stamps the resolution, atomically writes the resolved file, and unlinks the pending file. Resolved escalations are MOVED to `resolved-escalations/<id>.json` (never deleted; provenance trail per pre-made decision #2). Markdown renderer at `escalation-render.ts` (`renderEscalationMarkdown`) emits an operator-readable view with sections for proposed action, question, reasoning, evidence (summary + links + excerpts), and options with id badges, plus a sentinel-delimited `Operator decision` footer. `extractOperatorDecision(markdown)` reads back the operator's verbatim text between `<!-- BEGIN/END OPERATOR DECISION -->` sentinels; `matchOperatorOptionId(decision, optionIds)` recognizes plain-prose option-id mentions at word boundaries. Double-resolution refused (refuses to overwrite an already-resolved escalation).
- [x] Visibility surface — `escalation-visibility.ts` ships `buildEscalationVisibility(opts)` returning `{ count, rows }` (each row: `id`, `queuedAt`, `actionProposed`, `question`, `quickLink`) for the orchestrator's per-turn report; quick-links default to repo-relative paths, `useAbsolutePaths: true` for terminal-clickable absolutes; `pendingOverride` lets the orchestrator pass an already-read list without a re-read. `renderEscalationVisibility(visibility)` emits an operator-readable markdown block — `### Escalations queued (N)` with bullet-per-row, or `_None._` when the queue is empty (per pre-made decision #4, the report surfaces an empty-queue confirmation). Per-component tests at `src/__tests__/scope-discovery/escalation/{escalation-parse,escalation-queue,escalation-render,escalation-visibility}.test.ts`. 61 vitest scenarios cover round-trip + malformed input + provenance MOVE semantics + sentinel extraction + option-id matching + visibility row shape + quick-link rendering. Plumbing into the per-turn report itself lands with Phase 11 Task 6 (`/dw-lifecycle:implement` augmentation); this dispatch ships the visibility library Task 6 will call.

### Task 10: Provenance + audit-log linkage

Every catalog edit traces back to its origin. Audit-log entries link to specific catalog edits. Cross-references navigable in both directions.

- [x] Provenance field schema standardized across all catalog types — landed in Phase 11 Task 2 (`util/catalog-status.ts`); Task 10 builds on that foundation.
- [x] Audit-log entries gain `affects:` links naming catalog entries they touch — parser lives at `plugins/dw-lifecycle/src/scope-discovery/util/audit-log-parser.ts` and supports BOTH the single-line comma-separated form (legacy / `llm/audit-log-reader.ts` compatible) AND the multi-line YAML bullet form. Cross-reference navigation surfaces `findAuditEntriesAffecting(catalogEntryId)` + `findCatalogEntriesAffectedBy(findingId)` + `auditFindingIdSet(log)` + `citationEntryId(citation)` + `citationRegistry(citation)` library APIs for future operator UIs.
- [x] Catalog entries gain `audit_history:` listing audit-log findings against them — added as optional `auditHistory: readonly string[]` to anti-patterns / adopter-manifests / clones / pattern-matrix entry types. `util/catalog-status.ts` ships `parseAuditHistory(raw, ctx, namespace)` shared parser. Schemas updated across all five JSON schemas (anti-patterns, adopter-manifests, clones, pattern-matrix-patterns, deprecation-queue). Backward compat: pre-Task-10 entries that omit the field parse fine with an empty array.
- [x] Doctor rule: `provenance-orphaned-entries` — catalog entries with provenance pointing at audit-findings that don't exist; surfaces broken cross-references. Three failure modes covered: (1) forward-orphaned (entry's `provenance.context: audit-finding-<id>` lacks an audit-log Finding-ID), (2) backward-orphaned (entry's `audit_history:` lists a non-existent Finding-ID), (3) unmatched audit-log citation (audit-log `Affects:` cites a non-existent catalog entry). Walks `docs/<v>/001-IN-PROGRESS/<slug>/audit-log.md` across in-progress features; unions the Finding-IDs as the lookup surface. Registered in `doctor-rules/index.ts`. 16 vitest scenarios + 27 audit-log-parser scenarios cover the surface.

### Task 11: Cross-surface application

The pattern-type widening + Loop primitives + status/provenance fields apply uniformly to ALL registry-driven scanners, not just `pattern-matrix.ts`.

- [x] anti-patterns.yaml — schema gains `status`, `provenance`; auto-disposition flow integrates. Plumbed in Phase 11 Task 2 (entries gain Loop fields; scanner filters to active via `filterActiveEntries` at the registry boundary).
- [x] adopter-manifests.yaml — same. Plumbed in Task 2; verified in this dispatch's cross-surface test that pending/ignore/withdrawn entries don't surface as findings or matrix rows.
- [x] editor-symmetry — `computeMatrix()` in `editor-symmetry-matrix.ts` now filters adopter-manifest entries via `filterActiveEntries` BEFORE building rows; suppressed-status manifests never become matrix rows. `MatrixRow` carries `status:` so the renderer + regime-holdout-detector see the inherited status without re-reading the entry. The renderer appends a `(status: <s>)` badge for non-`blessed` actively-enforced statuses (today only `cursed`).
- [x] deprecations registry — deprecation markers are embedded in source files (not a YAML catalog), so the regime-holdout-detector synthesizes `blessed` + `install-seed` for deprecation findings to keep the wire shape uniform. Documented in `regime-holdout-detector.ts:IMPLICIT_BLESSED`.
- [x] regime-holdout-detector — fuses the four sources and now stamps `status_provenance: { source_status, provenance_source }` on EVERY finding. Per-source assertion fires if a non-active entry leaks through (invariant: each scanner's registry-boundary filter must be honored). `RegimeHoldoutMeta` gains `actively_enforced_count` + `candidate_count` per-status rollup.
- [x] clones.yaml — `disposition` → `status` mapping landed in Task 2; this dispatch verifies the mapping is honored uniformly with other registries (`filterActiveEntries` on a `ClonesYaml.clones` collection produces the same active subset semantics as on every other catalog).
- [x] **Cross-surface uniformity test** at `plugins/dw-lifecycle/src/__tests__/scope-discovery/cross-surface-loop.test.ts` (11 vitest scenarios). Plants a fixture with five statuses per registry; asserts (a) blessed/cursed entries enforce uniformly across every parser + every scanner; (b) pending entries surface in the registry but are excluded from `filterActiveEntries`; (c) ignore / tracked-holdout / withdrawn entries are suppressed across the regime-holdout-detector + matrix builder + adopter scanner + anti-pattern scanner; (d) the `withdrawn`-with-`audit-finding-<id>` invariant holds on every registry; (e) `regime-holdout-detector` stamps `status_provenance` on every finding with the canonical-status + provenance-source literals.
- [x] Manifest schema updated — `ManifestRegimeHoldoutEntry.status_provenance` (required) + `ManifestRegimeHoldoutMeta.by_status: { actively_enforced, candidate }` (required); JSON schema in `scope-manifest.yaml.schema.json` matches. `scope-widen`'s `mergeDelta` re-derives `by_status` from merged section lengths so merged manifests carry the rollup.

### Task 12: Naming alignment

The operator-trust failure mode (green "discovery" report read as no-novel-anti-patterns) is a naming problem (#315 problem space). Resolved 2026-05-26 via the **hybrid option** (per operator decision): keep `scope-inventory` as the operator-facing entry-point + ensure operator-visible provenance distinguishes registered-pattern matches from discovered candidates.

- [x] Hybrid option selected: keep `scope-inventory` (the orchestrator entry-point); document the internal "inventory agents vs. discovery agents" split via a new `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/README.md`; surface the registered-pattern vs. discovered-candidate vs. novel-shape-candidate distinction in every operator-facing report. No source-tree rename was performed — the cost would have exceeded the readability gain (JSON wire format's `agent: 'ast-grep-matrix'` discriminator + the existing test fixtures stay invariant; library API surface is unchanged).
- [x] SKILL.md prose updates across `scope-inventory`, `scope-widen`, `check-anti-patterns`, `check-adopters`, `check-deprecations`, `check-editor-symmetry` — each skill now carries an explicit "Inventory vs. discovery" thesis paragraph distinguishing registered-pattern matches (the catalog said to look for it; scanner found it) from novel-shape candidates (discovered by negative-space / coverage-gap / outlier / semantic handlers + synthesis-layer clustering). The check-* skills are explicitly framed as REGISTERED-PATTERN inventory checks; each names the discovery-layer escape hatch (`/dw-lifecycle:scope-inventory <slug>`) for surfacing novel candidates.
- [x] Manifest report surface — new module at `plugins/dw-lifecycle/src/scope-discovery/synthesis-report.ts` exports `categorizeFindings(manifest)` + `renderFindingCategoryReport(manifest)` + `renderCategorySummaryLine(manifest)`. The category-derivation honors the `discovery-agents/README.md` rules: `provenance_source ∈ {orchestrator-agent, llm-judge-proposed, promoted-from-candidate}` → novel-shape candidate (regardless of status); `source_status: pending` → novel-shape candidate; `blessed`/`cursed` + `operator-authored`/`install-seed` → registered-pattern match; `discovered_candidates:` clusters → discovered-candidate. The report-rendering integrates into:
  - `scope-inventory`'s `synthesis.md` evidence-trail file — leads with `## Inventory vs. discovery — finding categories` before the existing `## Synthesizer notes`.
  - `scope-inventory`'s stderr summary — adds a `categories: registered-pattern=N, discovered-candidate=N, novel-shape-candidate=N` line.
  - `scope-widen`'s `synthesis.md` evidence-trail + stderr summary.
  - `synthesis-cli.ts` (standalone CLI) — same shape, same evidence wiring.
- [x] Tests: `src/__tests__/scope-discovery/synthesis-report.test.ts` — 10 vitest scenarios covering all three categorization rules + the operator-action advisory + the clean-no-findings rendering + the one-line summary contract.
- [x] Internal "discovery-agents/" directory documented at `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/README.md` — explicitly distinguishes the inventory agents (registered-pattern matchers: pattern-matrix, clone-detector-reader, adopter-manifest-checker, regime-holdout-detector, ui-route-enumerator) from the discovery agents (novel-shape surfacing: synthesis-discovered-candidates, negative-space / outlier / coverage-gap / semantic pattern handlers, mediation pass). No code renames (low-priority; would breach the wire-format invariant for limited readability gain).
- [x] Agent-discipline rule added at `.claude/rules/agent-discipline.md` § "Inventory vs discovery — how to read scope-discovery reports" — documents the three operator-visible categories, the stderr `categories:` line format, the `synthesis.md` category-report section, the operator action when novel-shape-candidate > 0, and the failure mode the rule prevents (KeygroupSummary-shape regression shipping to release because a green inventory report was read as "no anti-patterns").

### Task 13: Multi-content-type generality

Today the tooling walks TypeScript source. Deskwork manages content collections, configs, schemas, anything. The pattern catalog + glob + shape model should be content-type-agnostic.

- [ ] Glob + shape primitives content-type-neutral; no TS-coupling in core types.
- [ ] Per-content-type handlers (`.md`, `.yaml`, `.json`) pluggable into the scan engine.
- [ ] Markdown-specific patterns (e.g., frontmatter shape, heading conventions, link patterns) authorable.

(Likely a scoping-pass decision: deferred initial-ship vs designed-in from start.)

### Task 14: Tooling-feedback closure → audit-log import workflow

The existing `tooling-feedback.md` pattern from Phase 10 v1 ship is a feedback-loop primitive for the TOOLING; this task formalizes the closure workflow.

- [x] TF closure entries (`Status: addressed-<commit>`, `Status: superseded-by-<TF-NN>`, or `Status: verified-<date>`) auto-import into the scope-discovery audit-log as `AUDIT-<date>-<NN>` entries with cross-reference. Implemented at `plugins/dw-lifecycle/src/scope-discovery/tooling-feedback-import.ts`. Default mode is dry-run; `--apply` performs the writes. Numbering reads existing audit-log entries to determine the next per-date counter; idempotency watermark is an `imported-as: AUDIT-<id>` line appended to the TF entry directly before its `**Status:**` line.
- [x] Doctor rule: surface TF entries that have been open > N days without status updates (configurable). Landed at `plugins/dw-lifecycle/src/scope-discovery/doctor-rules/tooling-feedback-stale.ts`. Default threshold 14 days; override via `.dw-lifecycle/scope-discovery/config.yaml` field `tooling_feedback_stale_days: <int>`. Repair hint cites `/dw-lifecycle:tooling-feedback-import --apply` for closure-ready entries, generic triage hint for open ones. Registered in `doctor-rules/index.ts`.
- [x] Skill: `/dw-lifecycle:tooling-feedback-import` — walks closure-marked TF entries; promotes them to audit-log; closes the TF entry with the new audit-log ID as forwarding pointer. SKILL.md + commands/tooling-feedback-import.md authored; subcommand registered in `cli.ts`. 22 vitest scenarios cover parser / closure-status discriminator / dry-run vs --apply / idempotency / per-date numbering / --slug restriction. 8 doctor-rule scenarios cover threshold default + override + malformed-config fallback + open/closure-ready/imported entries. Live smoke against `docs/1.0/001-IN-PROGRESS/graphical-entries/tooling-feedback.md` confirms zero imports + clean exit (the live log has no closure entries yet).

### Acceptance criteria (captured promises; scoping pass decides what ships when)

- [ ] The Loop runs on every `/dw-lifecycle:implement` turn without operator invocation.
- [ ] Orchestrator auto-dispositions candidates at high confidence; escalates at low confidence.
- [ ] Controller measures codebase-state metrics + auditor-correction-rate; adjusts cadence + intensity accordingly; defaults shipped sensibly per Task 5.
- [ ] Wrong-decision events detectable + reversible; trust calibration adjusts in response.
- [ ] Pattern-type vocabulary supports at minimum the 4 v1 operator-named patterns from #315 (Tailwind/utility-class catch-all, hardcoded-color, hover-only-affordance, negative-space-no-canonical-consumer).
- [ ] The full Loop applies uniformly across the registry-driven surfaces (Task 11).
- [ ] Pre-existing user-visible behavior of `/dw-lifecycle:implement` is preserved; no regressions in completed phase tests.
- [x] KeygroupSummary-shape repro fixture (anonymized) commits to test suite + passes (negative-space pattern fires on a synthetic component with ZERO canonical primitives + ≥5 utility-class hits). Landed at `plugins/dw-lifecycle/src/__tests__/scope-discovery/phase-11-acceptance/keygroup-summary-repro.test.ts` with fixture tree at `fixtures/keygroup-summary-repro/` — synthetic `components/KeygroupSummary.tsx` (zero canonical-primitive imports + 18 utility-class hits) + sibling fixtures + planted Phase 11 polymorphic catalog (negative-space + outlier + coverage entries). End-to-end test runs the BEFORE (legacy regex-only) vs. AFTER (Phase 11 loop) comparison; asserts the AFTER state fires >= 1 Phase 11 handler on the repro file + emits a DOGFOOD GAP SIGNAL block to stdout. Acceptance doc at `docs/1.0/001-IN-PROGRESS/scope-discovery/phase-11-acceptance.md`. Full plugin suite at 1295/1295 (baseline 1293; +2 acceptance test scenarios).
- [ ] First dogfood cycle (graphical-entries team) reports the gap is closed via the v1.1 tooling-feedback log.

### Open scoping decisions (intentionally NOT pre-decided)

- Which of Tasks 1–14 ship in v1.1 vs deferred to v1.2 / future?
- Which of G1–G7 pattern types ship at minimum (operator named negative-space as the cheapest fix; G3/G4/G5/G6 are stretch).
- ~~Task 12 naming alignment: which option?~~ Resolved 2026-05-26 via the hybrid option (operator-facing entry-points keep their names; provenance + report rendering surface the distinction; internal discovery-agents/ directory documents the inventory-vs-discovery split).
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

## Dogfood follow-ups (from canary #349)

The graphical-entries canary surfaced four follow-up items from the Phase 6 dogfood cycle (#349). The first three are bugs against shipped scope-discovery surfaces; the fourth is a validation milestone owned by graphical-entries, not scope-discovery.

- [ ] [#350](https://github.com/audiocontrol-org/deskwork/issues/350) — **`validate-return` refactor-cue false-positives.** Substring match fires on filename `clones.yaml` in Included blocks AND on free-text "extracted helper" in declined-work context. Highest-priority friction per canary's #349 §3a ranking (~5min/occurrence × 2 observed). Recommended fix: Light + Medium (context-aware substring + structured `Refactor-closes:` field).
- [ ] [#351](https://github.com/audiocontrol-org/deskwork/issues/351) — **`session-start`/`session-end` helper-subcommand availability check.** When the installed CLI predates the skill's expected helper subcommand (`session-end-hygiene`, `session-start-recommendation`), the skill fails with a generic `Unknown subcommand` error instead of telling the operator to run `/reload-plugins`. Polish-level; per #349 §3b. Recommended fix: Light (skill-side probe + actionable error).
- [ ] [#352](https://github.com/audiocontrol-org/deskwork/issues/352) — **Pre-commit gate chain skipped on docs-only commits.** ~5s/commit × 18 commits = ~90s wasted in one observed session. Polish-level; per #349 §3c. Recommended fix: Light (hook-template short-circuit on staged-files-all-match-`*.md`-in-`docs/`).
- [ ] **#318 validation milestone — cross-feature, owned by graphical-entries.** Run `scope-widen` against graphical-entries Phase 7 Tasks 7.1 (members[] schema delta) AND 7.3 (group review surface) — features with genuinely novel shapes the registered pattern catalog can't yet cover. If `scope-widen` surfaces `discovered_candidate` clusters, #318's clustering pass is validated end-to-end against real-world novel input. If still `0 additions`, there's still a gap to close. Per #349 §2. Tracked at graphical-entries' Phase 7 acceptance criteria; this entry is the scope-discovery side of the cross-reference.

These items are filed for tracking but don't block any scope-discovery acceptance criterion. They feed into the next scope-discovery release cycle (likely a v0.25.1 patch covering #350 + #351 + #352, with #318 validation pending Phase 7 graphical-entries work).

## Phase 12: Multi-model audit barrage

**Parent issue:** [#353](https://github.com/audiocontrol-org/deskwork/issues/353).
**Source:** ROADMAP.md § "Audit-barrage feature shape"; operator design conversation 2026-05-29; canary [#349](https://github.com/audiocontrol-org/deskwork/issues/349) §2 "operator-discipline cost" framing.

**Problem the phase addresses (captured exhaustively per capture-mode rule; scoping is a separate pass):**

The current scope-discovery audit posture has three layers — in-band self-audit (orchestrator-loop, same model + same context), the SDD two-reviewer cycle (spec + quality sub-agent dispatches), and the manually-run codex audit (operator pastes work into a separate Codex session). The codex audit demonstrably finds what Claude misses — different training corpus = independent failure modes — but it requires manual invocation, manual copy-paste, manual finding-by-finding triage. Manual discipline doesn't scale and isn't durable. The audit quality is currently a function of the operator's intermittent capacity to run the audit by hand. This phase ships a third audit surface — automated multi-model audit barrage — that fires installed CLI tools (`claude`, `codex`, `gemini`) in parallel, persists raw per-model output, and surfaces a structured triage step over uniform run artifacts.

The phase is additive — not a replacement for the in-band self-audit or the SDD review cycle. All three surfaces stay active; the barrage adds genetic diversity in audit failure modes.

The phase implements Design A from `ROADMAP.md` § "Audit-barrage feature shape". Design B (auto-fire at lifecycle waypoints + meta-audit synthesizer) and Design C (continuous background daemon) are out-of-scope here; they're tracked in the roadmap for follow-up work after Design A is stable + the operator has accumulated cross-model finding patterns.

**Implementation posture: CLI-based, not API-based.** Three reasons documented in ROADMAP.md: (1) CLIs are usage-based — no per-call cost arithmetic; (2) auth is already configured per-CLI in the operator's environment — no key handling in the plugin; (3) subprocess orchestration is a well-trodden plugin pattern (already in use for `gh`, `git`, `npx tsx`, `jscpd`).

### Task 1: Infrastructure verification

Confirm the three CLIs are installed + authenticated on the operator's machine. Baseline the invocation contracts before designing around them.

- [x] Step 1: Confirm `claude`, `codex`, `gemini` are on PATH on the operator's machine. Document the invocation pattern for each (flags, prompt-as-arg vs prompt-via-stdin vs prompt-via-file). All three resolved; `claude -p`, `codex exec`, `gemini "<prompt>"` per `audit-barrage-cli-notes.md`.
- [x] Step 2: Probe per-CLI behaviors: long prompts (multi-KB), structured output, error reporting (stderr separation), timeouts. 5.4 KB prompts handled by all three; per-CLI timing + stderr/stdout separation documented; claude instruction-adherence caveat on long prompts captured.
- [x] Step 3: Document findings — landed at `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-barrage-cli-notes.md` (105 lines) covering installed versions + per-CLI invocation pattern + common contract + per-CLI timing + auth surface + open items for Phase 12 Tasks 2-3.

**Acceptance Criteria:**
- [x] Per-CLI invocation pattern documented + verified live against the installed binaries (audit-barrage-cli-notes.md).
- [x] At least one full prompt-fire-capture round-trip per CLI verified working end-to-end (small + 5 KB prompts; all exit 0).

### Task 2: CLI verb + subprocess orchestration library

- [x] Step 1: NEW `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/types.ts` (122 lines) — `ModelConfig`, `BarrageInput`, `ModelRunResult`, `BarrageRun`, `BarrageResult` interfaces.
- [x] Step 2: NEW `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/run-artifacts.ts` (147 lines) — `generateRunDirName`, `safeModelName`, `createRunDir`, `writePromptFile`, `writeIndexFile`. ISO basic timestamp; non-alphanumeric/non-hyphen replaced with `_` in model names.
- [x] Step 3: NEW `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/spawn-cli.ts` (180 lines) — `spawnCliAgainstModel`. `{{prompt}}` substitution in args_template via split-before-substitute. `stdin: 'ignore'`; stdout/stderr piped to per-model paths via `fs.createWriteStream`; byte counters via stream listeners. SIGTERM on timeout with 5s SIGKILL grace; spawn errors captured as `spawnError`.
- [x] Step 4: NEW `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/orchestrate-barrage.ts` (85 lines) — `orchestrateBarrage`. Per-model `Promise.all` parallel fire; no early termination; INDEX.md write after all settle.
- [x] Step 5: NEW CLI subcommand `plugins/dw-lifecycle/src/subcommands/audit-barrage.ts` (315 lines) — `parseFlags` + `auditBarrage` main. Hard-coded 3 default models (claude/codex/gemini) with code-comment cite to Task 3 for the YAML loader. `--feature`/`--prompt-file` (REQUIRED); `--models <comma-list>` selects from hardcoded set; `--repo-root`/`--quiet`/`--help`. Exit 0 if ≥1 model produced stdout; 1 if all failed; 2 on usage. Registered `'audit-barrage': auditBarrage` in `cli.ts`.
- [x] Step 6: Tests at `plugins/dw-lifecycle/src/__tests__/scope-discovery/audit-barrage/` — 43 new tests across 4 files (run-artifacts / spawn-cli / orchestrate-barrage / audit-barrage-cli). Fake-CLI subprocesses via `node -e` shims cover happy path, timeout, missing-binary, exit-nonzero, malformed-config-rejection.

**Acceptance Criteria:**
- [x] `dw-lifecycle audit-barrage --feature <slug>` fires three CLI subprocesses in parallel — live verified end-to-end against the real installed claude/codex/gemini; all three returned PROBE-OK; 11.5s wall-time (parallel; dominated by slowest).
- [x] Each subprocess output captured to per-model markdown file under `.dw-lifecycle/scope-discovery/audit-runs/<timestamp>-<feature>/<model>.md` — confirmed in live run dir at `20260529T050950Z-scope-discovery/`.
- [x] `INDEX.md` + `PROMPT.md` + `stderr/<model>.txt` written per run — confirmed; INDEX includes timestamp/feature/per-model exit code/duration/byte counts.
- [x] Tests cover: happy path (3 models all succeed), missing-binary (spawn error captured + others still fire), timeout (SIGTERM + grace), exit-nonzero, prompt template substitution.
- [x] Exit code contract: 0 if ≥1 model produced output; 1 if all failed; 2 on usage error — covered by tests.

### Task 3: Prompt template + model config

- [x] Step 1: NEW `plugins/dw-lifecycle/templates/audit-barrage-prompt.md` — uniform audit prompt with `{{var}}` substitutions for `feature_slug`, `workplan_summary`, `diff`, `audit_log_excerpt`, `commit_subjects`. Asks each model for findings in canonical audit-log entry format; explicit "say nothing if you find nothing" instruction.
- [x] Step 2: NEW `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/prompt-renderer.ts` — reads template (project-override at `.dw-lifecycle/scope-discovery/audit-barrage-prompt.md` takes precedence); substitutes vars via unambiguous `<!-- {{var_name}} -->` markers; surfaces unsubstituted-var errors loud.
- [x] Step 3: NEW `plugins/dw-lifecycle/templates/audit-barrage-config.yaml` — default models block with claude / codex / gemini entries matching Task 1's CLI invocation contracts.
- [x] Step 4: NEW `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/config-loader.ts` — reads YAML (project-override takes precedence); per-entry validation (non-empty name/binary/args_template; args_template must contain `{{prompt}}`; timeout_seconds positive integer; no duplicate names); failure-loud on malformed input.
- [x] Step 5: NEW `plugins/dw-lifecycle/src/scope-discovery/schema/audit-barrage-config.yaml.schema.json` — JSON Schema for editor autocomplete; mirrors anti-patterns.yaml.schema.json pattern.
- [x] Step 6: Extended `install-scope-discovery` to seed `.dw-lifecycle/scope-discovery/audit-barrage-prompt.md` + `audit-barrage-config.yaml` (commented-out scaffolds adopters uncomment + edit).

**Acceptance Criteria:**
- [x] Prompt template + config land in `plugins/dw-lifecycle/templates/`.
- [x] Project-override pattern works end-to-end — config-loader tests cover plugin-default fallback + project-override-takes-precedence + malformed-override rejection.
- [x] Schema enables editor autocomplete on the config YAML.
- [x] `install-scope-discovery` seeds the override files as commented-out scaffolds.

**Live verification:** `subcommands/audit-barrage.ts` rewired to load models via `config-loader.ts` (replacing Task 2's hardcoded list); live invocation against the real installed claude/codex/gemini via the YAML-loaded battery returned 3/3 PROBE-OK. Full plugin suite: 1966/1966 (+27 new for Task 3). Tsc clean.

### Task 4: Skill prose

- [x] Step 1: NEW `plugins/dw-lifecycle/skills/audit-barrage/SKILL.md`. Describes operator workflow end-to-end: when to run, the two-step render-then-fire CLI workflow, override paths, run-dir layout, triage steps.
- [x] Step 2: SKILL.md cross-references `ROADMAP.md` § Audit-barrage so operators see the long-term plan + the discipline rule + the smoke + the CLI invocation notes.
- [x] Step 3: Added `/dwab` (audit-barrage) shortcut to `dw-lifecycle:install-shortcuts` — `audit-barrage` is now in the COMMANDS list with Scheme A mapping `dwab`, Scheme B mapping `dw-ab`, Scheme C algorithmic `dw-audit-barrage`. Command file at `plugins/dw-lifecycle/commands/audit-barrage.md` invokes the skill.

**Acceptance Criteria:**
- [x] `/dw-lifecycle:audit-barrage` discoverable via slash-command picker (command file shipped at `commands/audit-barrage.md`).
- [x] `/dwab` shortcut works (Scheme A entry in `shortcuts/schemes.ts`).
- [x] SKILL.md documents invocation + triage workflow + override paths.

### Task 5: Tests + smoke

- [x] Step 1: Verified per-task tests landed across Tasks 2–4; backfilled gaps — added 23 new tests across audit-barrage surface (intra-token substitution, close-vs-exit byte preservation, timer-leak on spawn-error, healthy-with-nonzero-exit, healthy-with-timeout, spawn-error-unhealthy, single-substitution count, instructional-prose pass-through, EXPECTED_VARS guard, render verb flag-parse + payload-validate).
- [x] Step 2: Cross-cutting tests pass against fake-CLI fixtures; failure modes covered (missing binary, timeout, malformed substitution, override-file-not-readable, run-dir-creation-failure). Full plugin suite at 1995/1995.
- [x] Step 3: NEW `scripts/smoke-audit-barrage.sh` — exercises both verbs end-to-end against fake-CLI shims (deterministic `node` scripts emitting canned finding blocks). Asserts run-dir layout, INDEX content, per-model stdout/stderr separation, render substitution + EXPECTED_VARS marker absence. Local-only; NOT wired into CI per project rule.

**Acceptance Criteria:**
- [x] Full plugin suite passes with audit-barrage tests added (1995/1995).
- [x] `scripts/smoke-audit-barrage.sh` passes end-to-end against fake CLIs (runs locally; emits `OK` on full success).

### Task 6: Live verification + dogfood

- [x] Step 1: Picked self-dogfood — audit-barrage feature itself (Tasks 1-3 implementation; 67 KB rendered prompt against the production scope diff).
- [x] Step 2: Invoked `dw-lifecycle audit-barrage --feature audit-barrage --prompt-file /tmp/audit-barrage-self-dogfood-prompt.md` — 3:16 wall time; 2/3 models produced output (gemini failed: operator-level quota exhausted; not an audit-barrage bug); exit 0.
- [x] Step 3: Walked the run dir at `.dw-lifecycle/scope-discovery/audit-runs/20260529T061616Z-audit-barrage/`; cross-referenced findings — **4 with cross-model agreement** (exit-vs-close truncation, args_template substring/token mismatch, exit-code contract drift vs PRD, prompt-renderer wiring gap).
- [x] Step 4: Lifted 11 findings into `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` as AUDIT-20260529-01..11 with stable IDs + status `open` + per-finding fix guidance.
- [x] Step 5: Friction surfaces from the dogfood itself documented inline in the audit-log entries (AUDIT-20260529-10/11 — operator's hand-rendering workaround + prompt-renderer over-eager check).

**Acceptance Criteria:**
- [x] One live barrage run completed against an in-flight feature (self-dogfood against audit-barrage Tasks 1-3).
- [x] At least one finding the in-band self-audit + SDD review cycle didn't catch — **13 distinct findings** lifted; 4 with cross-model agreement (HIGH-confidence). The genetic-diversity acceptance signal per ROADMAP is met overwhelmingly. ALL 13 findings would have shipped without the audit-barrage's existence (1966/1966 tests passed; tsc clean; SDD review cycle missed every one).
- [x] Tooling-feedback friction items filed — AUDIT-20260529-10 (renderer over-eager check) + AUDIT-20260529-11 (template marker triplet duplication) capture the in-band friction surfaces.

### Task 7: Cross-references + ROADMAP update

- [x] Step 1: Added "Audit-barrage: structured cross-model audit" section to `.claude/rules/agent-discipline.md` — names the new surface + the operator's triage workflow + how it composes with the in-band self-audit + the SDD review cycle (three independent surfaces, additive not replacement) + the Phase 12 self-dogfood data as evidence the surface earns its keep.
- [x] Step 2: Updated `ROADMAP.md` § "Audit-barrage feature shape" — Design A moved to "Recently shipped" with primitives + acceptance-signal evidence; Design B's framing tightened to compose over the v1 primitives.
- [x] Step 3: Audit-barrage moved out of "Active initiatives (in-flight)" and into the "Recently shipped" section of `ROADMAP.md`.
- [x] Step 4: Added audit-barrage section + slash-commands table entry to `plugins/dw-lifecycle/README.md`; updated "Twenty commands total" prose.

**Acceptance Criteria:**
- [x] Agent-discipline rule documents the audit-barrage surface.
- [x] ROADMAP.md reflects Design A shipped + Design B as next.
- [x] Adopter-facing docs: README + skill prose + agent-discipline rule update.

### Phase 12 — Out of Scope (deferred to Design B / Design C per ROADMAP)

- Auto-fire at lifecycle waypoints (`/dw-lifecycle:session-end`, `/dw-lifecycle:complete`, `/release` Pause 5). Design B.
- Meta-audit synthesizer — single LLM call that synthesizes the N raw runs into a ranked-findings block. Design B.
- High-confidence auto-promote to audit-log — findings with M-of-N model agreement auto-lifted as `Status: pending-operator-review`. Design B.
- Continuous background audit daemon — long-running process watching for new commits. Design C.
- Per-model auth handling — by design; the CLIs are expected to be already-authenticated in the operator's environment. The verb fails loud if a configured CLI binary is missing or unauthenticated.
- Replacing the in-band self-audit or SDD review cycle — audit-barrage is ADDITIVE.
- Token-cost optimization — CLIs are usage-based; no per-call budgeting.

### Phase 12 — Open scoping questions (operator decides during PRD iterate)

1. **Should `claude` be one of the three default models?** Cross-context comparison vs correlated failure-modes tradeoff. Including Claude gives a baseline against the in-band self-audit; excluding maximizes diversity from the in-band layer.
2. **Range default behavior for greenfield features (no audit-log watermark).** Fall back to `<base-branch>..<HEAD>`, or require explicit `--range`?
3. **Triage UX for v1 — CLI-only or thin studio surface?** CLI-only is consistent with hygiene's UNIX philosophy; studio surface would be richer but introduces new ground.
4. **Prompt's "what to look for" section — generic ("find bugs, design issues, missed edge cases") vs scope-discovery-specific ("find shapes that should have been caught by registered patterns but weren't")?** Different prompts produce different signal.
5. **Timeout default — 300s (5 min) starting point; needs calibration against real CLI invocation cost.** Live verification (Task 6) will inform.

### Phase 12 — Existing primitives this composes over

- `plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/` — the existing external auditor fire pattern (`fireExternalAudit` in `llm/auditor.ts`) is the closest analog; audit-barrage extends to N parallel CLI fires.
- Hygiene's `close-shipped` 4-source walker — the operator's lifted audit-log findings flow naturally through close-shipped at release time.
- Project override resolution pattern at `.dw-lifecycle/scope-discovery/<file>` — already in use by anti-patterns / adopter-manifests / pattern-matrix overrides.
- `child_process.spawn` subprocess orchestration — already in use for `gh`, `git`, `npx tsx`, `jscpd` invocations across the plugin.
- The audit-log entry format — the canonical `Finding-ID` / `Status` / `Severity` / `Surface` shape every audit-barrage finding maps into.

## Phase 13: Audit-finding lifecycle — anti-deferral discipline + workplan promotion

**Parent issue:** [#355](https://github.com/audiocontrol-org/deskwork/issues/355)
**Source:** Operator design conversation 2026-05-29 surfacing the gap between audit-log findings (Phase 12 audit-barrage's output) and the workplan (the implementation loop's input). Phase 12 self-dogfood demonstrated the failure mode in-session — agent went from "findings lifted" straight to "fix dispatch" without scoping the fixes into the workplan, then a parallel session shipped the fixes ad-hoc.

**Problem the phase addresses (captured exhaustively per capture-mode rule; scoping is a separate pass):**

The current audit-finding workflow is operator-discipline-dependent at every step:

1. Audit fires (in-band / SDD review / audit-barrage) → findings land in `audit-log.md` with `Status: open`
2. Operator manually decides which findings to fix, when, where to scope them
3. Operator manually edits workplan to add fix tasks (or files GH issues OR — most commonly — defers)
4. Operator dispatches the work
5. Fix lands → operator manually flips audit-log `Status: fixed-<sha>`
6. Release → operator manually flips `fixed-<sha>` → `verified-<date>` after re-exercising the surface

Step 2-3 is the binding constraint: audit-log knows the findings exist; workplan doesn't. No tooling bridges them. The pathology codified across multiple project rules (`Just for now is bullshit`, `Operator owns scope decisions`): **agents relentlessly rationalize deferral as "scope discipline" when it's scope erosion**. Filing a GH issue, marking a finding "to address later," scoping a fix "for v2" — these all feel like progress + leave the implementation broken.

The operator's framing, verbatim: *"Filing a bug report isn't good enough. It MUST BE SCOPED INTO THE WORKPLAN, otherwise it won't get picked up by the implementation loop. Unless there's truly a good reason NOT to fix a problem, it should be relentlessly scoped into the workplan, not relentlessly deferred — ESPECIALLY problems with the implementation underway. A broken implementation is not done — it's broken. And, along with the discipline to scope the fix, TDD principles should apply such that a test that exercises the bug is written before the fix is implemented — and the implementation isn't considered a candidate for completion until tests are green."*

Phase 13 ships the structural tooling that makes the operator's discipline mechanical:

- **Scope-into-workplan is the default + the only agent-pickable disposition.** Deferral requires operator-supplied substantive justification + a validator (same shape as hygiene's `promote-deferrals` rejected gaming-phrase list).
- **Workplan fix tasks follow a TDD-first shape** with mechanical enforcement: the test file must exist + pass before the task is marked done. Not a markdown checkbox the agent can flip; a check the doctor + commit-msg gates enforce.
- **The implementation-loop refuses to advance** while any feature has `Status: open` findings. No `--ignore-open-findings` escape in v1 (operator chose rigidity; if proves unworkable, revisit relaxation).
- **Closure-side automation** flips audit-log statuses on `Closes AUDIT-<id>` commits + on post-release re-audit runs.

Phase 13 is the operator-discipline-displacement counterpart to Phase 12. Phase 12 produces the findings; Phase 13 forces them through the workplan into completion.

### Task 1: `/dw-lifecycle:promote-findings` skill + CLI verb

NEW skill + CLI verb that walks `audit-log.md` for `Status: open` entries on the current feature, surfaces them in a batched-proposal cycle (same shape as hygiene's `promote-deferrals` + `triage-issues`), and applies workplan edits + optional `acknowledged-<ref>` / `informational` status flips on operator confirmation.

- [x] Step 1: NEW `plugins/dw-lifecycle/src/scope-discovery/promote-findings/types.ts` — `OpenFinding`, `PromotionProposal`, `WorkplanInsertion`, `DeferralRecord`, `InformationalRecord` interfaces.
- [x] Step 2: NEW `plugins/dw-lifecycle/src/scope-discovery/promote-findings/audit-log-walker.ts` — parses `audit-log.md` for entries with `Status: open` (reusing the existing `audit-log-parser.ts` from the orchestrator-loop); returns the list of open findings on the named feature.
- [x] Step 3: NEW `plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-task-renderer.ts` — generates the TDD-first task block for a finding:
  ```
  ### Task N.M (fix-finding-AUDIT-<YYYYMMDD>-<NN>): <one-line finding title>

  Closes AUDIT-<YYYYMMDD>-<NN>. Surface: <finding's Surface field>.

  - [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
  - [ ] Step 2: confirm test fails against current code (verify the bug repros)
  - [ ] Step 3: implement the fix
  - [ ] Step 4: confirm test passes
  - [ ] Step 5: commit with `Closes AUDIT-<YYYYMMDD>-<NN>` in subject

  **Acceptance Criteria:**
  - [ ] Failing test exists at `<test-file-path>` (cited in Step 1)
  - [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
  - [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
  ```
- [x] Step 4: NEW `plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-editor.ts` — applies the rendered task block to the named feature's `workplan.md` at the operator-chosen position (under existing phase OR as new phase). Preserves file structure; appends at the chosen anchor.
- [x] Step 5: NEW `plugins/dw-lifecycle/src/scope-discovery/promote-findings/substantive-reason-validator.ts` — for the `acknowledged-<ref>` deferral path. Mirrors hygiene's promote-deferrals validator: ≥40 chars; rejects gaming-phrase list (`for now`, `will fix later`, `non-trivial`, `future work`, `deferred to vN`, `not in scope`, `TODO`, `come back to`); requires explicit upstream-blocker reference OR documented scope-cut citation.
- [x] Step 6: NEW `plugins/dw-lifecycle/src/scope-discovery/promote-findings/audit-log-editor.ts` — flips audit-log entry `Status` from `open` to `acknowledged-<ref>` or `informational`. Preserves audit trail; the original entry stays + the status change is the only mutation.
- [x] Step 7: NEW `plugins/dw-lifecycle/src/subcommands/promote-findings.ts` — CLI verb. Flags: `--feature <slug>` (REQUIRED); `--repo-root <path>` (default cwd); `--bucket <name>` (default `open`; future: `acknowledged` to walk deferred findings periodically); `--limit <N>` (default 10 per batch); `--help`. Registers `'promote-findings'` in `cli.ts`.
- [x] Step 8: NEW `plugins/dw-lifecycle/skills/promote-findings/SKILL.md` — adopter-facing prose. Names the default-is-promote shape, the deferral path's substantive-reason validator, the informational disposition's tight contract. Adds `/dwpf` shortcut.
- [x] Step 9: Tests under `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/` covering: open-finding extraction; workplan task rendering (TDD-first shape); substantive-reason validator (accept + reject); workplan-edit application (atomic; no partial state); audit-log status flips (preserves entry body); batched-proposal flow (mock operator confirmation; partial-batch).

**Acceptance Criteria:**
- [ ] `/dw-lifecycle:promote-findings --feature <slug>` walks the feature's `audit-log.md` for `Status: open` entries.
- [ ] Default disposition is "scope into workplan" with the TDD-first task shape rendered; operator confirms placement (phase + task position) only.
- [ ] Deferral path (`acknowledged-<ref>`) requires substantive-reason validator pass; gaming phrases rejected.
- [ ] Informational path requires explicit operator confirmation + rationale in the audit-log entry body.
- [ ] Workplan edit is atomic (no partial state on operator decline mid-batch).
- [ ] Audit-log status flip preserves the entry body (audit trail).

### Task 2: Implementation-loop gate (refuse-to-advance on open findings)

Augment `/dw-lifecycle:implement` to refuse picking up the next task while the current feature has any `Status: open` audit-log findings. Strict; no override flag in v1.

- [x] Step 1: NEW `plugins/dw-lifecycle/src/scope-discovery/promote-findings/open-findings-gate.ts` — pure function `checkOpenFindings({featureSlug, repoRoot}): Promise<OpenFindingsGateResult>`. Returns `{ allowed: true }` when zero open findings; returns `{ allowed: false, openFindings: [...] }` when ≥1.
- [x] Step 2: Wire the gate into the `/dw-lifecycle:implement` skill via a NEW CLI verb `dw-lifecycle check-open-findings --feature <slug>` at `plugins/dw-lifecycle/src/subcommands/check-open-findings.ts` (no `subcommands/implement.ts` exists because `/dw-lifecycle:implement` is a skill not a TS subcommand — the gate is a CLI verb the SKILL.md invokes). On `{ allowed: false }`, emits the refusal message:
  ```
  Cannot advance: feature <slug> has N open audit findings (AUDIT-XX-XX, AUDIT-YY-YY).
  Open findings block task pickup per project rule "broken implementation is not done."
  Run `/dw-lifecycle:promote-findings --feature <slug>` to scope into workplan before continuing.
  ```
  Exits 1. Exit 2 on feature-not-found / argv error.
- [x] Step 3: Updated `plugins/dw-lifecycle/skills/implement/SKILL.md` — new Step 2 documents the gate + the cure (`promote-findings` workflow), Step 5's per-task loop re-runs the gate before each task pickup (findings can accrue mid-session), Error-handling block names the exit-1 (refusal) + exit-2 (config error) shapes. Step numbering renumbered through Step 8.
- [x] Step 4: 18 tests — 7 library scenarios at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/open-findings-gate.test.ts` (allowed-zero-open, allowed-no-auditlog, refused-single, refused-multiple-with-ordering, throws-feature-missing, throws-docs-missing, 0.x version fallback), 11 CLI scenarios at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-open-findings-cli.test.ts` (parseFlags cases + exit-0/1/2 surfaces + refusal-message naming + multi-finding count + --repo-root override). Cited refusal-message assertions verify EVERY open finding ID is named + the `/dw-lifecycle:promote-findings` cure is cited. Plugin suite at 2115/2115 (2097 baseline + 18 new).

**Acceptance Criteria:**
- [x] `/dw-lifecycle:implement` refuses to advance when ≥1 open finding exists on the current feature.
- [x] Refusal message names the open findings + points at `promote-findings`.
- [x] No `--ignore-open-findings` flag in v1. (Per operator decision: err on rigidity; revisit if unworkable.)

**Notes:**

- Smoke-verified live on `feature/scope-discovery` itself: `dw-lifecycle check-open-findings --feature scope-discovery` exits 1 and names AUDIT-20260529-12 + AUDIT-20260529-13 + AUDIT-20260529-14 (the Phase 14 imports from `feature/deskwork-plugin` TF log). The cure is to walk Phase 14 Tasks 1-3 (the fixes) before resuming Phase 13 Task 3+ work, OR run `/dw-lifecycle:promote-findings --feature scope-discovery` (which is a no-op against AUDIT-12/13/14 since Phase 14 already scoped them).
- Side fix landed in the same commit: the existing AUDIT-20260529-01..11 entries (Phase 12 audit-barrage findings) were authored with `#### ...` headers (4-hash). The audit-log parser's `HEADING_LINE_RE = /^###\s+(.+?)\s*$/` only matches 3-hash. Those 11 entries were silently unparseable. Re-leveled to `###` along with AUDIT-20260529-12..15 so the parser sees them all. Functional impact zero (all 11 were Status: fixed-08971e4 or informational, never surfacing as `open`), but parser-correctness fix worth landing.

### Task 3: TDD-enforcement mechanical check

The promoted workplan task's TDD-first shape is operator-readable but agent-bypassable as written. Phase 13 Task 3 adds mechanical enforcement: a task block tagged `(fix-finding-AUDIT-...)` can't be marked done in the workplan unless the cited test file exists + passes.

- [ ] Step 1: NEW `plugins/dw-lifecycle/src/scope-discovery/promote-findings/tdd-enforcement.ts` — `verifyFixTaskTDD({workplanTaskBlock, repoRoot}): Promise<TddCheckResult>`. Parses the task block for the test-file path (cited in Step 1's prose); verifies (a) the file exists + (b) `npx vitest run <test-file-path>` exits 0. Returns `{ valid: true }` or `{ valid: false, reason: '<missing-file | test-failing>' }`.
- [ ] Step 2: NEW doctor rule `fix-task-tdd-discipline` at `plugins/dw-lifecycle/src/scope-discovery/doctor-rules/fix-task-tdd-discipline.ts`. Walks every `[x]` task block tagged `(fix-finding-AUDIT-...)`; invokes `verifyFixTaskTDD`; flags any `[x]` block that doesn't pass the check as a doctor finding. Severity: high.
- [ ] Step 3: Wire the rule into `/dw-lifecycle:doctor`'s rule registry. Document in skill prose.
- [ ] Step 4: NEW commit-msg gate at `plugins/dw-lifecycle/src/scope-discovery/check-fix-task-tdd.ts`. Triggered by commit messages containing `Closes AUDIT-<YYYYMMDD>-<NN>`. Verifies the fix's TDD-first shape: the commit must include the test file referenced in the workplan task block; the test must pass at the commit's tree state. Block the commit if either condition fails.
- [ ] Step 5: Tests covering: TDD-pass scenario; missing-test-file rejection; test-exists-but-fails rejection; doctor rule fires on workplan tasks marked `[x]` without the TDD evidence; commit-msg gate fires on `Closes AUDIT-` commits missing the test.

**Acceptance Criteria:**
- [ ] `/dw-lifecycle:doctor` rule `fix-task-tdd-discipline` fires on `[x]` fix-finding tasks without a passing test.
- [ ] Commit-msg gate refuses `Closes AUDIT-<id>` commits that don't include the test file OR whose test doesn't pass.
- [ ] No bypass flag in v1.

### Task 4: Closure-side automation

Fix commits with `Closes AUDIT-<YYYYMMDD>-<NN>` in subject auto-flip the audit-log status from `open` (or `acknowledged-<ref>`) to `fixed-<sha>`. Post-release re-audit runs flip `fixed-<sha>` → `verified-<date>` for findings that no longer surface.

- [ ] Step 1: Extend hygiene's `close-shipped` (or NEW sibling `close-shipped-audit-findings`) to walk audit-log entries for the release range. For each entry with `Status: fixed-<sha>` where the SHA is in the release, flip to `verified-<date>`.
- [ ] Step 2: NEW post-commit hook (or extension of existing pre-push hook chain) that detects `Closes AUDIT-<id>` in commit subjects + auto-flips the audit-log status to `fixed-<sha>` with the new SHA.
- [ ] Step 3: NEW skill `/dw-lifecycle:re-audit-fixed-findings` that re-runs `/dw-lifecycle:audit-barrage` against the feature post-release; cross-references the new run's findings against the `fixed-<sha>` entries; flips findings that no longer surface to `verified-<date>`; findings that re-surface get the new run-id appended (the fix didn't actually fix).
- [ ] Step 4: Tests covering each automation path; ensure the audit-log preservation rule is honored (no entries deleted; status changes only).

**Acceptance Criteria:**
- [ ] `Closes AUDIT-<id>` commits auto-flip audit-log entries to `fixed-<sha>`.
- [ ] Release process flips `fixed-<sha>` → `verified-<date>` for findings in the release range.
- [ ] Post-release re-audit flips findings that no longer surface; re-surfacing findings stay `fixed-<sha>` with append.
- [ ] Audit-log preservation rule honored (no deletions).

### Task 5: Live verification + dogfood

Run Phase 13's tooling against the audit-barrage's own AUDIT-20260529-01..11 entries (now closed). Validates the lifecycle works end-to-end on real findings. Additionally: take a fresh dogfood pass — fire audit-barrage against the audit-barrage + promote-findings code; route any open findings through `promote-findings`; confirm the workplan gets the fix tasks; confirm the implement-loop refuses to advance; confirm the TDD enforcement fires on a deliberately broken fix.

- [ ] Step 1: Run `/dw-lifecycle:promote-findings --feature scope-discovery` against the post-Phase-12 audit-log. Confirm the 11 AUDIT-20260529 findings are already `fixed-<sha>` (no `open` entries to promote).
- [ ] Step 2: Fresh audit-barrage against Phase 13's promote-findings + tdd-enforcement code. Lift findings; run promote-findings against them.
- [ ] Step 3: Confirm implement-loop gate refuses to advance with open findings.
- [ ] Step 4: Confirm TDD-enforcement gate fires on a deliberately-broken fix attempt.
- [ ] Step 5: Friction-feedback in `tooling-feedback.md`.

**Acceptance Criteria:**
- [ ] One full lifecycle pass completed against Phase 13's own code.
- [ ] Implement-loop gate verified live (refuses advance on open findings).
- [ ] TDD-enforcement gate verified live (refuses fix-task `[x]` mark + commit without passing test).

### Task 6: Cross-references + ROADMAP update

- [ ] Step 1: Add section to `.claude/rules/agent-discipline.md` titled "Audit findings: scope-don't-defer + TDD enforcement". Names the default-is-promote shape; cites the operator's verbatim framing; references the `Just for now is bullshit` sibling rule; documents the implement-loop gate + TDD enforcement.
- [ ] Step 2: Update `ROADMAP.md` § "Audit-barrage feature shape" — add Design A.5 / B prelude noting Phase 13's anti-deferral discipline layer.
- [ ] Step 3: Update `plugins/dw-lifecycle/README.md` with the promote-findings + implement-loop-gate + TDD-enforcement triad.

**Acceptance Criteria:**
- [ ] Agent-discipline rule documents the anti-deferral discipline.
- [ ] ROADMAP and README reflect Phase 13 delivered.

### Phase 13 — Out of Scope

- **Operator-side bypass flag for the implement-loop gate.** Per operator decision: err on rigidity. If proves unworkable in practice, revisit; do NOT pre-build the escape hatch.
- **Auto-flip on `fixed-<sha>` → `verified-<date>` without re-audit.** Closure requires re-audit evidence; the verb runs the audit, not just rubber-stamps from release metadata.
- **Auto-promotion of findings on audit-log changes** (the Design C "audit-finding daemon" shape). Phase 13 is operator-triggered; auto-promotion is a downstream concern.
- **Cross-feature finding-aggregation.** Phase 13 walks one feature's audit-log; aggregating across features is a downstream hygiene concern (extend `debt-report` if needed).
- **Findings from sources other than the audit-log** (commit-side bug reports, GH issue triage, etc.). Phase 13 is audit-log-centric. The same primitives generalize, but cross-source unification is a separate phase.

### Phase 13 — Open scoping questions (operator iterate)

1. **Where does the implement-loop gate's `audit-log.md` live for cross-cutting features?** If the loop is implementing Phase N and an audit on Phase M surfaces a finding, does Phase N's loop refuse? Strict reading: yes, any open finding on the FEATURE blocks the loop. Looser reading: per-phase scoping. Strict is the conservative default per the rigidity principle.
2. **TDD enforcement on findings whose fix is structurally not test-coverable.** A finding like "documentation typo on line 42" doesn't have a meaningful test. Workflow: either (a) fix-task TDD enforcement skips findings whose Surface is doc-only (heuristic by file extension); or (b) operator manually marks the workplan task `(no-test-coverable)` with substantive justification (validator-checked).
3. **Closes-AUDIT commit-msg syntax.** Multiple findings closed in one commit: `Closes AUDIT-X, AUDIT-Y, AUDIT-Z` (comma-separated) vs one trailer per finding. Pick one + document.
4. **Phase 13 against itself.** This phase's own implementation will produce audit findings on its own promote-findings code. The recursion is desired (eat-your-own-dogfood) but creates ordering questions: do we ship Phase 13 Task 1 without the gate before the gate exists? Strict reading: bootstrap by running promote-findings manually for Phase 13's own findings; once Task 2 ships, the gate kicks in.

### Phase 13 — Existing primitives this composes over

- `plugins/dw-lifecycle/src/scope-discovery/llm/audit-log-reader.ts` + `util/audit-log-parser.ts` — already parse audit-log.md; reuse for the open-finding walker.
- Hygiene's `promote-deferrals` substantive-reason validator pattern (`forbidden-deferral-phrases.yaml` overrides) — copy the shape for `acknowledged-<ref>` justification.
- Hygiene's `close-shipped` 4-source evidence walker — extend to walk audit-log entries.
- `/dw-lifecycle:doctor` rule infrastructure — Phase 13 Task 3 ships as a new doctor rule.
- `/dw-lifecycle:check-disposition-survivor` commit-msg gate pattern — Phase 13 Task 3 mirrors the shape for `Closes AUDIT-<id>` commits.
- The orchestrator-loop's external-auditor fire pattern — Phase 13 Task 4's re-audit cycle uses it.
- The `audit-log.md` preservation rule (never delete entries) — Phase 13's status flips are status-only, body preserved.

## Phase 14: Friction-fix sweep — `feature/deskwork-plugin` TF log imports

Scope-discovery-related TF entries from `docs/1.0/001-IN-PROGRESS/deskwork-plugin/tooling-feedback.md` (on `feature/deskwork-plugin`) imported into `audit-log.md` as AUDIT-20260529-12..15. Per operator decision 2026-05-29, hygiene-related TF entries are claimed by `feature/hygiene` and are NOT in scope here. Per Phase 13 anti-deferral discipline, the GH issues #362 (TF-003 + TF-004) and #361 (TF-001, hygiene-owned) are not dispositions on their own — the scope-discovery fixes are scoped into this phase as TDD-first tasks.

Phase 14 is operational (apply the discipline Phase 13 builds) and pre-dates Phase 13 Task 2 landing (the implement-loop refusal gate). Per Phase 13 Open scoping question #4 ("Phase 13 against itself" — bootstrap by running promote-findings manually until Task 2 ships), these tasks are picked up manually for now; once the implement-loop gate exists, future imports flow through it automatically.

### Task 1: Quiet the orchestrator-turn 3/6 catalog NOTE (fix-finding-AUDIT-20260529-12)

The orchestrator-turn summary printer emits the `NOTE: only 3/6 catalog files present (...)` line on every invocation regardless of state, diluting the genuinely-variable parts of the summary. Light fix: gate the NOTE behind a count-changed-from-last-turn check (state already in `controller-state.json`) OR a `--verbose` flag.

- [x] Step 1: Wrote failing test at `plugins/dw-lifecycle/src/__tests__/scope-discovery/orchestrator-loop/catalog-note-noise.test.ts` — 8 scenarios: first-turn-no-prior-state, second-turn-same-count-suppressed, count-rises-NOTE-re-emitted, count-falls-NOTE-re-emitted, verbose-forces-NOTE, zero-catalogs-always-WARNING, full-6-of-6-no-NOTE, catalogPresentCount-persisted-on-history. Red confirmed before impl.
- [x] Step 2: Threaded prior catalog count from `LoopState.turnHistory[0].catalogPresentCount` (NEW optional field on `TurnHistoryEntry`) into `decorateSummaryWithCatalogPresence` at `plugins/dw-lifecycle/src/scope-discovery/orchestrator-turn.ts`. Gate: `(priorPresentCount === undefined || priorPresentCount !== presence.presentCount || verbose) && 0 < presentCount < totalCount`. The WARNING case (count === 0) stays always-on. After the loop library returns its `nextLoopState`, the assembler stamps the current count onto the new history entry via `stampCatalogPresentCount`. NEW `--verbose` flag on `OrchestratorTurnCliArgs` + the subcommand parser.
- [x] Step 3: All 8 noise-gate tests green. Plugin suite at 2123/2123 (2115 baseline + 8 new). `tsc --noEmit` clean. `loop-state.ts:parseHistoryEntry` accepts the new optional field with strict validation (non-negative integer).
- [x] Step 4: Updated `plugins/dw-lifecycle/skills/implement/SKILL.md` (orchestrator-loop section) — `--verbose` documented; default quiet-on-steady-state behavior explained; WARNING gating exemption called out. CLI `--help` (`orchestrator-turn` subcommand) also updated with the flag.

**Acceptance Criteria:**
- [x] Test file exists and passes at the cited path.
- [x] Catalog NOTE is suppressed when the count is unchanged from the last persisted turn.
- [x] `--verbose` (or equivalent) restores the NOTE for debugging.
- [x] `Closes AUDIT-20260529-12` in the commit subject.

**Notes:**
- The library (`runOrchestratorTurn`) already loads its own copy of `LoopState` per-turn; the assembler now loads it independently as well so it has the prior count BEFORE the library mutates state. Tiny perf hit (one extra JSON read); the alternative (plumbing prior count into `TurnInput`) would have widened the library's surface for a UI-side concern.
- Status flip from `open` → `fixed-<sha>` on AUDIT-20260529-12 follows in a separate commit (Phase 13 Task 4's automated `Closes-AUDIT` hook isn't built yet; manual flip until then).

### Task 2: Relax validate-return grammar false-positives (fix-finding-AUDIT-20260529-13)

`validate-return`'s wrapped-return grammar has three sharp edges that recur per reviewer dispatch: Searched-count noun whitelist too narrow; mandatory `path:LINE` on every Excluded entry; forbidden-substring list collides with descriptive prose. Medium fix per [#362](https://github.com/audiocontrol-org/deskwork/issues/362): word-boundary + context-aware match on forbidden substrings; widen Searched-count noun whitelist.

- [x] Step 1: Wrote failing tests at `plugins/dw-lifecycle/src/__tests__/scope-discovery/dispatch-wrapper-grammar.test.ts` — 24 scenarios covering Searched-count noun whitelist widening (`issues`, `bugs`, `findings`, `errors`, `warnings`; singular + plural; with/without trailing modifier; pre-existing nouns regression-guard; unknown noun still rejected) AND forbidden-deferral relaxation (descriptive `placeholder tile`, `stub function`, `pending review`, `temporary buffer`, `hack the planet` all pass; deferral collocations `for now`, `placeholder for now`, `stub for now`, `placeholder until phase 5`, `defer to v2`, `TODO`, `FIXME`, `XXX`, `address in v3`, `fix it later` all trip). Red confirmed (22 failed of 24 before impl).
- [x] Step 2: Widened `SEARCHED_COUNT_NOUN_REGEX` in `plugins/dw-lifecycle/src/scope-discovery/dispatch-grammar.ts` to include `issues?`, `bugs?`, `findings?`, `errors?`, `warnings?`. Error message + `GRAMMAR_INSTRUCTION` prelude both updated to name the new nouns.
- [x] Step 3: Restructured `FORBIDDEN_DEFERRAL_PHRASES` — removed ambiguous bare nouns (`stub`, `placeholder`, `pending`, `temporary`, `hack`, `defer`, `deferred`, `todo`, `fixme`, `xxx`). Added new context-aware regexes to `FORBIDDEN_DEFERRAL_REGEXES`: `\b(?:TODO|FIXME|XXX)\b` (case-sensitive comment markers), `\b(?:stub|placeholder|pending|temporary|hack|hacky|deferred?)\s+(?:for\s+now|until|in\s+(?:v\d|phase|F\d|future)|...)/i` (ambiguous-noun + deferral collocation), `\b(?:leave|use|put|...)\s+(?:a|the)?\s*(?:stub|placeholder|temporary|...)\b\s*(?:in|until|for|pending|to\s+(?:address|fix|...))/i` (deferral verb + ambiguous noun), `\bdefer(?:red|ring)?\s+(?:to|until|...)` (defer verb action).
- [x] Step 4: Re-ran all dispatch-wrapper tests; 24/24 green for new file. Plugin suite at 2150/2150 (2123 baseline + 8 from Phase 14 Task 1 + 7 from Task 3 + 24 from Task 2 − 12 net adjustments to existing tests/fixtures). Updated `validate-return.test.ts` TF-008 noun-whitelist test (removed `5 issues found` from rejection list since now accepted; kept `places`/`spots`/`things`; added positive assertion for new error-message-names-issues). Updated `dispatch-wrapper.fixtures.ts` `REGEX_SAMPLE_REASONS` array — added 6 new entries to keep parallel with the regex list (3 comment-marker samples + 3 ambiguous-noun-with-context samples).
- [x] Step 5: Updated `GRAMMAR_INSTRUCTION` prelude inside `dispatch-wrapper.ts` — now lists the expanded noun whitelist verbatim and updates the rejection examples (`5 issues found` removed; `7 places`/`4 spots`/`3 widgets` retained).

**Acceptance Criteria:**
- [x] Test file exists and passes; new positive + negative cases covered.
- [x] Existing deferral-detection tests still pass (no false-negatives introduced).
- [x] `Closes AUDIT-20260529-13` in the commit subject.

**Notes:**
- Status flip on AUDIT-20260529-13 follows in a separate commit (Phase 13 Task 4 not built yet).
- Forbidden-phrase contract is now: PHRASES = unambiguous-deferral substrings only; REGEXES = context-aware patterns for ambiguous words. Project-supplied overrides at `.dw-lifecycle/scope-discovery/forbidden-deferral-phrases.yaml` still REPLACE the built-in lists (the existing override test continues to pass).

### Task 3: Accept `--response-file -` (stdin) on validate-return (fix-finding-AUDIT-20260529-14)

`validate-return` currently requires a temp-file round-trip for the agent's response block. Light fix per [#362](https://github.com/audiocontrol-org/deskwork/issues/362): accept `--response-file -` (read from stdin). Mirrors the `gh issue create --body-file -` convention used elsewhere.

- [x] Step 1: Wrote failing tests at `plugins/dw-lifecycle/src/__tests__/scope-discovery/validate-return-stdin.test.ts` — 7 scenarios: parseFlags accepts `-`; stdin reads UTF-8 to EOF; multi-chunk stdin (64 KB body); empty stdin throws `EmptyStdinError`; error message names `--response-file` + `stdin`; file-path mode reads from disk; file-path mode does NOT consume stdin. Red confirmed before impl.
- [x] Step 2: Added `readResponseSource(responseFile, stdin)` helper + `EmptyStdinError` class to `plugins/dw-lifecycle/src/subcommands/validate-return.ts`. When `responseFile === '-'`, reads `stdin` via for-await chunk loop, concatenates as UTF-8. Empty stdin throws `EmptyStdinError` with an actionable message ("pipe the response body in or pass a real file path"). File-path mode delegates to `readFile()` as before. CLI shim wired to use the helper; the empty-stdin error surfaces as exit 2.
- [x] Step 3: 7 stdin tests green. Plugin suite at 2130/2130 (2123 baseline + 7 new). `tsc --noEmit` clean. End-to-end smoke: `printf '<grammar block>' | dw-lifecycle validate-return --response-file - --agent-type reviewer --json` exits 0 with valid `ValidationResult` JSON on stdout.
- [x] Step 4: Updated `plugins/dw-lifecycle/skills/implement/SKILL.md` (dispatch-wrapper section) to show the pipe form alongside the file path. CLI `USAGE` (`--response-file <path|->`) names the sentinel + cites the `gh issue create --body-file -` precedent + explains the empty-stdin exit-2 case.

**Acceptance Criteria:**
- [x] Test file exists and passes; stdin + file-path + empty-stdin cases covered.
- [x] `--response-file -` works end-to-end via a piped invocation.
- [x] `Closes AUDIT-20260529-14` in the commit subject.

**Notes:**
- Status flip from `open` → `fixed-<sha>` on AUDIT-20260529-14 follows in a separate commit (Phase 13 Task 4 not built yet).

### Task 4: Verify TF-005 clone-gate gitignore fix lands on merge (fix-finding-AUDIT-20260529-15)

TF-005's fix landed on `feature/deskwork-plugin` at commit `37683c8` (Closes [#354](https://github.com/audiocontrol-org/deskwork/issues/354)). It's not on `feature/scope-discovery` yet; we inherit it when `feature/deskwork-plugin` merges to main and this branch syncs from main. This task is verification-only — no re-implementation.

- [ ] Step 1: After `feature/deskwork-plugin` merges to main, rebase / fast-forward `feature/scope-discovery` from main. Confirm `git merge-base --is-ancestor 37683c8 HEAD` returns success.
- [ ] Step 2: Run `npm --workspace @deskwork/plugin-dw-lifecycle run test -- clone-detector.gitignore` from this worktree; confirm the regression test that lands with `37683c8` passes here too.
- [ ] Step 3: Smoke `dw-lifecycle check-clones` in a sandbox project with a gitignored sibling dir; confirm the dir is skipped (no false positives).
- [ ] Step 4: Flip AUDIT-20260529-15 to `Status: verified-<YYYY-MM-DD>` in the audit-log per Phase 13's `re-audit-fixed-findings` pattern (manually until Task 4 ships).

**Acceptance Criteria:**
- [ ] `feature/scope-discovery` carries `37683c8`.
- [ ] `clone-detector.gitignore.test.ts` passes on this branch.
- [ ] AUDIT-20260529-15 flipped to `verified-<date>`.

### Phase 14 — Out of Scope

- **Hygiene-feature TF entries** (deskwork-plugin TF-001 `session-end-hygiene` → #361; hygiene-feature TF-001 `validate-return` refactor-cue substring). Claimed by `feature/hygiene` per operator decision 2026-05-29. Fixes land on that branch; this phase does not duplicate the work.
- **#362 Heavy fix** (`dispatch-review` verb that collapses the wrap-prompt + validate-return round-trip into one CLI call). Architectural — operator decision required before this lands. Light + Medium (Tasks 2 + 3 above) are independently shippable stepping stones.
- **Per-finding GH issue closure.** Per `Issue closure requires verification in a formally-installed release` rule, #354 / #361 / #362 stay open until verified post-release. This phase posts evidence; closure is the operator's call.

### Phase 14 — Existing primitives this composes over

- `plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/controller-state.json` writer — Task 1 reads the prior turn's catalog-file-count from this persisted state.
- `plugins/dw-lifecycle/src/scope-discovery/dispatch-wrapper.ts` grammar definitions — Task 2 widens the existing rules in place.
- `plugins/dw-lifecycle/src/subcommands/validate-return.ts` argument parsing — Task 3 adds the `--response-file -` branch.
- `clone-detector.gitignore.test.ts` (lands with `37683c8`) — Task 4 confirms green on this branch post-merge.
