# Audit Log — feature/scope-discovery

This document is the feature-local audit log for `feature/scope-discovery`.

How to operate this log:

- Treat new or updated entries as actionable work, not bookkeeping.
- The audit log is the source of truth for current finding state.
- Never delete findings. Update entries in place under the same `Finding-ID`.
- `fixed-<sha>` means a fix landed; `verified-<date>` requires re-exercising the surface.
- If work is deferred, change `Status:` to `acknowledged-<ref>` with the issue, workplan section, or operator-approved plan.

Status quick-reference:

- `open` — reported; not yet resolved
- `acknowledged-<ref>` — accepted but deferred
- `fixed-<sha>` — fix landed, awaiting verification rerun
- `verified-<date>` — fix re-checked against the original surface
- `withdrawn-<date>` / `superseded-by-<finding-id>` — closed without deletion
- `informational` — observation only; no remediation required

Canonical grep queue:

- unfinished work: `grep -nE "^Status:[[:space:]]+(open|acknowledged|fixed-)" docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md`
- new findings: `grep -nE "^Status:[[:space:]]+open" docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md`
- awaiting verification: `grep -nE "^Status:[[:space:]]+fixed-" docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md`

---

## 2026-05-25 Branch Implementation Audit

### The anti-patterns scanner is non-functional in the branch’s own adversarial validator slice

Finding-ID: AUDIT-20260525-01
Status:     withdrawn-2026-05-25
Severity:   blocking
Surface:    `plugins/dw-lifecycle/src/scope-discovery/check-anti-patterns.ts`, `plugins/dw-lifecycle/src/subcommands/check-anti-patterns.ts`

Resolution note (2026-05-25T21:28Z): re-ran the exact command cited in the finding's evidence — `npm --workspace @deskwork/plugin-dw-lifecycle run test -- scope-discovery` — and observed `Test Files 17 passed (17) / Tests 65 passed (65)`. Narrowed re-run against `scope-discovery/anti-patterns` returned 16/16 tests passing across 3 test files. The 14-failure state the finding describes does not reproduce. Hypothesis: the audit landed in commit `fdf5313` (audit-log infrastructure) BEFORE the anti-patterns vitest files (`anti-patterns.{core,excludes,canonical-file}.test.ts`) landed in Phase 2 Task 1 commit `8dda47c` — the audit was likely written against an intermediate state where the subcommand was wired but the test files weren't fully ported. Withdrawing on re-verification grounds rather than deferring; if the symptom resurfaces, file a new finding with current SHA + repro environment so the load-bearing slice can be debugged in its actual broken state.

The branch’s load-bearing verification gate fails because the new anti-patterns scanner behaves as if the registry is empty across positive-match and malformed-registry scenarios. The command path under test is the real adopter-facing subcommand (`dw-lifecycle check-anti-patterns`), so this is not an isolated harness mismatch; it is the feature’s own end-to-end validation slice saying the Phase 2 Family A gate is not working.

Evidence:

- Independent verification run on this branch:

```text
npm --workspace @deskwork/plugin-dw-lifecycle run test -- scope-discovery
```

- Result: `14` failing tests, all in the anti-patterns validator files:
  - [anti-patterns.core.test.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/__tests__/scope-discovery/anti-patterns.core.test.ts:103)
  - [anti-patterns.excludes.test.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/__tests__/scope-discovery/anti-patterns.excludes.test.ts:118)
  - [anti-patterns.canonical-file.test.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/__tests__/scope-discovery/anti-patterns.canonical-file.test.ts:102)
- The observed stdout in multiple positive-match cases is the empty-registry shape:
  - `anti-patterns: registry empty; nothing to scan.`
- The harness invokes the real CLI dispatcher through [anti-patterns-harness.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/__tests__/scope-discovery/util/anti-patterns-harness.ts:76), which shells into [cli.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/cli.ts:27) and then [subcommands/check-anti-patterns.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/subcommands/check-anti-patterns.ts:9).
- The scanner’s exit-code contract says `1 = matches` and `2 = infra error`; returning `0` with the empty-registry message in the positive-match and malformed-registry scenarios contradicts that contract at [check-anti-patterns.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/scope-discovery/check-anti-patterns.ts:28) and [check-anti-patterns.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/scope-discovery/check-anti-patterns.ts:331).

Expected vs actual:

- Expected: populated anti-pattern registries produce findings (`exit 1`) or parse errors (`exit 2`) under the branch’s own adversarial scenarios.
- Actual: the command returns the empty-registry success shape (`exit 0`) in those same scenarios.

Fix guidance:

- Do not advance the feature past “Phase 2 not started” while `check-anti-patterns` fails its own end-to-end validator slice.
- Debug the command path first, not the prose: the problem is somewhere between registry load and CLI dispatch, because the real subcommand path is what the failing tests exercise.

### The shipped clone-detector runtime still depends on a devDependency that adopter installs omit

Finding-ID: AUDIT-20260525-02
Status:     fixed-d4ca597
Severity:   high
Surface:    `plugins/dw-lifecycle/package.json`, `plugins/dw-lifecycle/bin/dw-lifecycle`, `plugins/dw-lifecycle/src/scope-discovery/jscpd-runner.ts`

Fix note (commit `d4ca597`, 2026-05-25): moved `jscpd: ^4.0.0` from `devDependencies` to `dependencies` in `plugins/dw-lifecycle/package.json`. The adopter shell's `npm install --omit=dev --workspaces=false` now installs jscpd into the plugin's own node_modules tree, so `npx jscpd` at the adopter project's CWD resolves to a controlled version rather than triggering a network download. 401/401 tests still pass after the move. Awaiting `verified-<date>` on a real adopter install run; the workspace dev path masks this regression by definition.

The clone-detector runtime still shells out to `jscpd`, but the plugin’s first-run adopter install omits devDependencies. In workspace development this is masked by the monorepo environment; in adopter mode the runtime either fails outright or relies on `npx` to fetch tooling at runtime, which is not a controlled plugin dependency model.

Evidence:

- Runtime invocation uses `npx jscpd` at [jscpd-runner.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/scope-discovery/jscpd-runner.ts:72) and [jscpd-runner.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/scope-discovery/jscpd-runner.ts:84).
- `jscpd` is declared only in `devDependencies` at [package.json](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/package.json:17).
- The adopter shell installs with `npm install --omit=dev --workspaces=false` at [bin/dw-lifecycle](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/bin/dw-lifecycle:51).

Expected vs actual:

- Expected: every runtime dependency needed by `dw-lifecycle detect-clones` is installed by the plugin’s own adopter bootstrap.
- Actual: the engine required by the runtime path is excluded from the adopter install set.

Fix guidance:

- Make `jscpd` a real runtime dependency if the plugin shell is expected to supply it.
- If the intended model is “adopter must bring jscpd,” encode that contract explicitly in install/doctor flows and stop pretending the plugin is self-sufficient.

### The implementation still defaults project-owned scope-discovery config to `docs/scope-discovery/*`, contradicting the feature’s core `.dw-lifecycle/scope-discovery/` contract

Finding-ID: AUDIT-20260525-03
Status:     fixed-f05de65
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/scope-discovery/clone-detector.ts`, `plugins/dw-lifecycle/src/scope-discovery/check-anti-patterns.ts`, schema docs

Fix note (commit `f05de65`, 2026-05-25): migrated default registry/baseline paths from `docs/scope-discovery/<file>.yaml` to `.dw-lifecycle/scope-discovery/<file>.yaml` across 11 files: 4 scanner CLI files (`clone-detector.ts`, `check-anti-patterns.ts`, `check-adopters.ts`, `check-refactor-preconditions.ts`), 3 schema JSON descriptions, 3 production header docstrings (`clones-yaml.ts`, `clones-yaml.parse.ts`, `adopter-manifests-registry.ts`), and `schema/README.md`. Default-path change is invisible to the test suite (tests stage per-fixture configs in tmpdirs and pass `--baseline`/`--registry` explicitly); 401/401 still pass. One fixture comment at `adopter-manifests.core.test.ts:79` references the old path inside a synthetic `reason:` field — left as-is because the literal value is not load-bearing for the scanner's behavior. Awaiting `verified-<date>` when the Phase 8 install-scope-discovery skill exercises the new path end-to-end on a fresh adopter.

The design and feature docs say scope-discovery CONFIG is project-owned under `<projectRoot>/.dw-lifecycle/scope-discovery/`, but the implemented defaults still point at `docs/scope-discovery/*`. That means the plugin code is not reading from the location the feature explicitly promises adopters.

Evidence:

- Design contract: project-owned CONFIG lives under `.dw-lifecycle/scope-discovery/` at [2026-05-24-scope-discovery-design.md](/Users/orion/work/deskwork-work/scope-discovery/docs/superpowers/specs/2026-05-24-scope-discovery-design.md:25), [2026-05-24-scope-discovery-design.md](/Users/orion/work/deskwork-work/scope-discovery/docs/superpowers/specs/2026-05-24-scope-discovery-design.md:50), and [2026-05-24-scope-discovery-design.md](/Users/orion/work/deskwork-work/scope-discovery/docs/superpowers/specs/2026-05-24-scope-discovery-design.md:285).
- Feature PRD repeats the same contract at [prd.md](/Users/orion/work/deskwork-work/scope-discovery/docs/1.0/001-IN-PROGRESS/scope-discovery/prd.md:21).
- Implemented clone-detector default baseline still points at `docs/scope-discovery/clones.yaml` at [clone-detector.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/scope-discovery/clone-detector.ts:69).
- Implemented anti-pattern scanner default registry still points at `docs/scope-discovery/anti-patterns.yaml` at [check-anti-patterns.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/scope-discovery/check-anti-patterns.ts:49).
- The schema/readme layer mirrors the old `docs/scope-discovery/*` contract rather than the new plugin-owned config location at [schema/README.md](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/scope-discovery/schema/README.md:7) and [anti-patterns.yaml.schema.json](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/scope-discovery/schema/anti-patterns.yaml.schema.json:5).

Expected vs actual:

- Expected: plugin defaults, schema docs, and feature design all agree on `.dw-lifecycle/scope-discovery/`.
- Actual: the code and schema docs still default to the pilot-era `docs/scope-discovery/*` paths.

Fix guidance:

- Move the implementation defaults to `.dw-lifecycle/scope-discovery/` before the install/migration flows are built on top of the wrong path.
- Treat the schema/readme text as part of the contract surface; leaving those on the old path will keep reproducing the mismatch even after code fixes.

### The feature docs still claim Phase 6 CLI work is “Not started” even though multiple Phase 6 subcommands are implemented and wired

Finding-ID: AUDIT-20260525-04
Status:     fixed-743f44c
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/scope-discovery/README.md`, `workplan.md`, `plugins/dw-lifecycle/src/cli.ts`

Fix note (commits `69449ff` + `743f44c`, 2026-05-25): reconciled the workplan Phase 6 checklist + README status table against the actual implemented surface. The original fix at `69449ff` reflected the six Phase-1–4 verbs in the docs and introduced the `[~]` notation for "subcommand registered; --gate-mode flag pending." The follow-up Phase 6 sub-burndown commit `743f44c` lands the `--gate-mode` flag across all four check-* subcommands (`check-anti-patterns`, `check-adopters`, `check-refactor-preconditions`, plus the no-op-for-symmetry on `detect-clones`), flips the four `[~]` items to `[x]`, and checks the Phase 6 `--gate-mode` acceptance criterion. The earlier sibling commits `6dcd1d8`/`247a419`/`31f461f`/`aa6d680` landed `batch-dispose` + `check-disposition-survivor` and flip those two Phase-6 Task-3 items to `[x]`. `check-deprecations` stays unchecked pending the deprecation-scan port tracked at [#287](https://github.com/audiocontrol-org/deskwork/issues/287); the remaining Phase-6 verbs (`scope-widen`, `scope-summary`, `dispose-clone`, `refresh-clones-baseline`, install/migrate/uninstall, `validate-scope-discovery`, `scope-export`) are scoped for follow-up dispatches.

The implementation now contains several Phase 6 CLI subcommands, but the feature README still presents Phase 6 as “Not started,” and the Phase 6 checklist in the workplan still leaves those same commands unchecked. That creates planning-state drift: the branch’s code surface and its operator-facing feature docs disagree about what has landed.

Evidence:

- The README phase table still says `Phase 6 | CLI subcommands (~20 new verbs) | Not started` at [README.md](/Users/orion/work/deskwork-work/scope-discovery/docs/1.0/001-IN-PROGRESS/scope-discovery/README.md:24).
- The CLI dispatcher already registers five scope-discovery verbs at [cli.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/cli.ts:29):
  - `detect-clones`
  - `check-anti-patterns`
  - `check-adopters`
  - `check-refactor-preconditions`
  - `scope-inventory`
- The workplan Phase 6 checklist still leaves the corresponding commands unchecked at [workplan.md](/Users/orion/work/deskwork-work/scope-discovery/docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md:164) through [workplan.md](/Users/orion/work/deskwork-work/scope-discovery/docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md:175), even though earlier phases already cite working command-level acceptance evidence for some of them at [workplan.md](/Users/orion/work/deskwork-work/scope-discovery/docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md:36), [workplan.md](/Users/orion/work/deskwork-work/scope-discovery/docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md:96), and [workplan.md](/Users/orion/work/deskwork-work/scope-discovery/docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md:98).

Expected vs actual:

- Expected: feature status docs reflect the branch’s actual implementation state, especially for major phase rollups and operator-facing command surfaces.
- Actual: the code says “some CLI work has landed,” while the docs still say “Phase 6 not started.”

Fix guidance:

- Update the README phase table to reflect partial Phase 6 progress rather than “Not started.”
- Reconcile the Phase 6 checklist with the commands already implemented, leaving only the genuinely unshipped verbs unchecked.

---

## 2026-05-25 Audiocontrol pilot tooling-feedback import

The audiocontrol `feature/akai-harmonization` branch's `docs/1.0/001-IN-PROGRESS/akai-harmonization/tooling-feedback.md` enumerates 16 friction entries (TF-001..TF-016) from the scope-discovery pilot. Triaged 2026-05-25 against our port state:

- ✅ Already in our port (verified by grep): TF-001 (`from:` string|list in adopter-manifests-registry.ts:121), TF-005 (`parseModuleRelevance` import in prd-themed-pattern-hunter), TF-006 (paste-ready PRD skeleton in synthesis-warnings), TF-010 (`--quiet` flag on check-adopters).
- ✅ Closed by closure of an existing GH issue: TF-003 (paste-ready batch-dispose hint) — already tracked under [#284](https://github.com/audiocontrol-org/deskwork/issues/284) Phase 6 batch-dispose port; the hint string update lands when batch-dispose lands.
- ✅ Out of scope for dw-lifecycle plugin (host-application concerns): TF-004 (pre-commit gate consolidation) belongs in the install-scope-discovery-hooks Phase 8 deliverable — addressed there.
- ❌ Open gaps imported as new findings below: TF-002, TF-013, TF-014 (amended to #284), TF-015 (amended to #285), TF-016.

### TF-002 — anti-pattern registry lacks `canonical_file` field

Finding-ID: AUDIT-20260525-05
Status:     fixed-d849a6f
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/scope-discovery/anti-patterns-registry.ts`, `schema/anti-patterns.yaml.schema.json`

Fix note (commit `d849a6f`, 2026-05-26): renamed the auto-exclusion field from `canonical_implementation_file` (the pre-#288 name from an earlier scaffolding round in this branch) to `canonical_file` per the issue spec; field is OPTIONAL on every entry, existing entries don't need migration. Behavior: byte-exact path matching against the candidate file's CWD-relative POSIX path (no glob, no directory expansion); silent auto-exclusion (no log line); union semantics with `excludes_paths:` (both apply when set together). Scan-start guard still fails loud with the entry id + missing path when `canonical_file:` points at a path that doesn't exist. Adversarial coverage: 6/6 scenarios in `anti-patterns.canonical-file.test.ts` pass — including a new issue-#288-derived scenario that plants `canonical_file: 'modules/foo/canonical.tsx'`, places a canonical-shape regex match inside it, and asserts a sibling holdout at `modules/bar/holdout.tsx` STILL surfaces (auto-exclusion is scoped to the named file only, not a directory). Schema description updated to document the byte-exact + union semantics for adopters' editors. Awaiting `verified-<date>` once an adopter uses the field on a real primitive-relocation refactor.

Pilot reference: audiocontrol PR #462, commit `fddbad06` (TF-002 closure). Fixed in: [#288](https://github.com/audiocontrol-org/deskwork/issues/288).

### TF-013 — clone-detector regen silently wipes operator dispositions

Finding-ID: AUDIT-20260525-06
Status:     fixed-aa6d680
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/scope-discovery/check-disposition-survivor.ts`, `plugins/dw-lifecycle/src/subcommands/check-disposition-survivor.ts`

Fix note (commit `aa6d680`, 2026-05-25): landed the "Heavy" option from the pilot — a `dw-lifecycle check-disposition-survivor` gate that compares HEAD's baseline (via `git show HEAD:<baseline>`) against the working-tree baseline and fails the commit (exit 1) on any `keep-with-reason`/`refactor`/`ignore-with-justification` → `pending` transition. `--allow-disposition-loss` accepts the losses with an explicit warning for the operator-conscious case. The exported `findDestructiveTransitions()` is the pure comparator; the gutted-stub teeth check in `disposition-survivor.test.ts` proves a stub comparator returning `[]` would silently pass the failure mode this gate exists to prevent. 9 scenarios cover: no-loss, single keep-with-reason loss, multi-loss, --allow-disposition-loss override, refactor loss, ignore-with-justification loss, pending → pending no-op, pending → keep-with-reason operator improvement, and the gutted-stub teeth check. Closes #289. Phase 8 will wire the gate into the install-scope-discovery-hooks pre-commit chain.

Pilot reference: audiocontrol PR #463, commit `6a1f8365`. Audit-log entry AUDIT-20260524-14 (in scope-discovery-protocol repo).

Awaiting `verified-<date>` once Phase 8's hook installer wires the gate into a real adopter's pre-commit chain.

### TF-014 — `batch-dispose` requires IDs already in clones.yaml; refresh-baseline is a separate prereq step

Finding-ID: AUDIT-20260525-07
Status:     fixed-6dcd1d8
Severity:   low
Surface:    `plugins/dw-lifecycle/src/scope-discovery/batch-dispose.ts`

Fix note (commit `6dcd1d8`, 2026-05-25): landed the Light option from the pilot's proposal — when batch-dispose rejects an unknown id, the stderr message now names the `dw-lifecycle detect-clones --refresh-baseline` prereq so the operator's recovery path is obvious. Specifically: `error: batch-dispose: id <X> not in <baseline>; run \`dw-lifecycle detect-clones --refresh-baseline\` first to add it as pending, then re-run this command.` The fix is covered by the "unknown id fails HARD" scenario in `batch-dispose.test.ts` which asserts the stderr substring `dw-lifecycle detect-clones --refresh-baseline`. Closes #284 (paste-ready hint loop) by commits `247a419` (clone-detector hint update) + `6dcd1d8` (batch-dispose port + TF-014 fix) + `31f461f` (subcommand wire-up).

Awaiting `verified-<date>` once a real adopter hits the unknown-id path end-to-end.

### TF-015 — anti-pattern regex authoring trips on prefix-matching

Finding-ID: AUDIT-20260525-08
Status:     acknowledged-#285 (amended)
Severity:   low
Surface:    Future pattern-type dispatcher work

`\b` boundary doesn't help with `-` in CSS class names — sibling classes sharing a prefix silently over-match. The gutted-stub teeth check catches "returns empty" but NOT "matches sibling classes that share a prefix." Pilot's suggested Medium fix: add optional `negative_match_classes:` array; validator auto-generates negative scenarios. Amended onto [#285](https://github.com/audiocontrol-org/deskwork/issues/285) (pattern-type dispatcher) since both deal with anti-pattern schema/dispatcher evolution.

### TF-016 — primitive-extraction dispatches recurrently land integration-layer regressions

Finding-ID: AUDIT-20260525-09
Status:     acknowledged-#290
Severity:   medium
Surface:    `plugins/dw-lifecycle/templates/scope-discovery/dispatch-wrapper-prelude.md`, `plugins/dw-lifecycle/src/scope-discovery/dispatch-wrapper.ts`

Open in pilot. Three audit cycles in one session (2026-05-24) caught integration-layer regressions after primitive-extraction dispatches: CSS class-name conflicts, invalid ARIA contracts, callback-index drift, wire-format regressions, silent 0-index clamps. Common shape: primitive's API surface changes (different value type, ARIA role, state contract); consumer adapter passes through what the legacy primitive accepted; semantic correctness is lost in the contract delta.

The Phase 5 `dispatch-wrapper-prelude.md` skill-prose template (just shipped in `85f416d`) is the natural home for the Light + Medium options:
- Light: extend the prelude with a "Primitive-extraction dispatch hygiene" section.
- Medium: ship `primitive-extraction-checklist.md` template.
- Heavy: extend `wrap()` to inject the integration-layer audit prelude when the agent type is `ui-engineer` (mirrors the existing refactor-marker auto-prelude pattern).

Deferred to: [#290](https://github.com/audiocontrol-org/deskwork/issues/290).

### The standard scope-discovery test slice is red because clone-detector subprocess coverage now overruns Vitest's default timeout budget across multiple scenarios

Finding-ID: AUDIT-20260525-10
Status:     verified-2026-05-26
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/__tests__/scope-discovery/clone-detector.*.test.ts`, `detect-clones.gate-mode.test.ts`

Resolution note (2026-05-25T11:30Z): the symptom described here IS the cross-file jscpd-subprocess contention flake tracked at [#297](https://github.com/audiocontrol-org/deskwork/issues/297). Commit `0aace86` (PR [#298](https://github.com/audiocontrol-org/deskwork/pull/298)) routes all `clone-detector.*.test.ts` files to a single-fork vitest pool via `poolMatchGlobs`, eliminating the cross-worker contention that drove the timeouts. Re-ran the exact verification commands cited in this finding's evidence: `npm --workspace @deskwork/plugin-dw-lifecycle run test -- scope-discovery` returns `Test Files 48 passed (48) / Tests 401 passed (401)`; full-suite `npm test` returns `Test Files 67 passed (67) / Tests 737 passed (737)`. Zero timeouts; zero failing tests. Same intermediate-state-snapshot hypothesis as AUDIT-20260525-01: the audit was filed between #297's reporting and `0aace86`'s landing. Awaiting `verified-<date>` after the fix lives in a few CI runs / parallel-load contexts without resurfacing. If the symptom returns under a different code state, file a new finding with current SHA + repro environment.

Verification note (2026-05-26): independent audit rerun on this branch stayed green across the formerly failing clone-detector surface. `npm --workspace @deskwork/plugin-dw-lifecycle run test -- shortcuts` returned `183/183`; `npm --workspace @deskwork/plugin-dw-lifecycle run test -- scope-discovery` returned `Test Files 92 passed (92) / Tests 957 passed (957)`. The previously red clone-detector files (`error`, `refresh`, `baseline`, `polish`, `batch-dispose`, and `check-clones.gate-mode`) all completed within budget on the same run, so this finding is now verified on the feature branch.

The branch's current load-bearing verification command fails because the clone-detector subprocess scenarios are now exceeding Vitest's default `5000ms` per-test timeout in multiple files. This is no longer isolated to one or two edge cases; the timeout budget is unstable across the main clone-detector coverage surface.

Evidence:

- Independent verification run on this branch:

```text
npm --workspace @deskwork/plugin-dw-lifecycle run test -- scope-discovery
```

- Aggregate result: `9` failing tests, all plain timeouts, with the rest of the slice green (`42` files passed, `392` tests passed).
- Reproduced timeout sites:
  - [clone-detector.error.test.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/__tests__/scope-discovery/clone-detector.error.test.ts:113)
  - [clone-detector.refresh.test.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/__tests__/scope-discovery/clone-detector.refresh.test.ts:1)
  - [clone-detector.baseline.test.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/__tests__/scope-discovery/clone-detector.baseline.test.ts:1)
  - [clone-detector.polish.test.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/__tests__/scope-discovery/clone-detector.polish.test.ts:1)
  - [clone-detector.batch-dispose.test.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/__tests__/scope-discovery/clone-detector.batch-dispose.test.ts:74)
  - [detect-clones.gate-mode.test.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/__tests__/scope-discovery/detect-clones.gate-mode.test.ts:1)
- Every failing case reports the same runtime failure:
  - `Test timed out in 5000ms.`
- The affected tests all route through the real CLI + `jscpd` subprocess path, so this is an end-to-end runtime-budget problem rather than an in-process assertion mismatch.

Expected vs actual:

- Expected: the standard scope-discovery test slice completes green under the repository's default per-test timeout budget.
- Actual: a broad subset of clone-detector scenarios now exceed the default timeout and turn the standard verification command red.

Fix guidance:

- Treat this as a load-bearing verification defect until the timeout budget is made deterministic again.
- Either reduce clone-detector subprocess runtime materially, or give the long-running clone-detector scenarios explicit per-test timeout budgets that match the real `jscpd` cost instead of relying on the global default.

---

## 2026-05-26 #287 — deprecation-scan port

### `check-deprecations` ships as a subcommand shell, not a real scanner

Finding-ID: AUDIT-20260526-01
Status:     fixed-4da4660
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/scope-discovery/check-deprecations.ts`, `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/regime-holdout-detector.ts`

Resolution note (2026-05-26): ported the audiocontrol pilot's `tools/scope-discovery/deprecation-scan.ts` + `deprecation-report.ts` into dw-lifecycle. Closes [#287](https://github.com/audiocontrol-org/deskwork/issues/287). Three new files land:

- `plugins/dw-lifecycle/src/scope-discovery/deprecation-scan.ts` — walks `.ts` / `.tsx` files for top-of-file `@deprecated` JSDoc tags + `// DEPRECATED:` line comments within the first 20 lines; resolves importers via `@/` alias (configurable `moduleRoot`, default `src`) + basename-relative path forms.
- `plugins/dw-lifecycle/src/scope-discovery/deprecation-report.ts` — markdown / summary / JSON renderers. Default artifact path `.dw-lifecycle/scope-discovery/deprecation-queue.md` (the `--write` target; sibling to `editor-symmetry.md`).
- `plugins/dw-lifecycle/src/scope-discovery/schema/deprecation-queue.yaml.schema.json` — informational JSON Schema for the seeded YAML placeholder (the scanner discovers markers in source — the YAML is reserved for future baseline persistence à la `clones.yaml`).

The pre-port shell's CLI surface (`--root`, `--write`, `--artifact`, `--quiet`, `--json`) is preserved verbatim. New flag: `--module-root <path>` for projects where the `@/` alias root differs from `src` (the audiocontrol pilot's `modules/<editor>/src/` layout works by passing the literal root).

The regime-holdout-detector now uses the real scanner: blocked importers become `source: 'deprecation'` findings; `meta.deprecation_count` populates from the real importer count instead of `0`. Safe-to-delete files do NOT surface as regime-holdout findings (they're work-ready dispositions, not drift).

`install-scope-discovery` seeds `deprecation-queue.yaml` (with `schemaVersion: 1` and an empty `deprecations: []`) alongside the other three YAML seeds.

Tests: 23 new vitest scenarios cover flag-parse, programmatic-main, scan scenarios (blocked / safe-to-delete / self-importer skip / inline-marker / alias-vs-relative importer / quiet / json / write / write+artifact), CLI surface (`--help`, unknown flag), and a gutted-stub self-check that gives the harness teeth (a no-op scanner returning the pre-port shell's empty-registry shape is REJECTED by the blocked-finding probe). install-scope-discovery's test gains a fourth seed-file assertion (`deprecation-queue.yaml`). Full `scope-discovery` slice: 411 passed (411).

Awaiting `verified-<date>` after the commit lands on the branch + the operator re-runs `dw-lifecycle check-deprecations` against a real codebase.

Evidence:

- The pre-port subcommand shell at `plugins/dw-lifecycle/src/scope-discovery/check-deprecations.ts` printed `check-deprecations: registry empty; nothing to scan. (deprecation-scan port pending — see https://github.com/audiocontrol-org/deskwork/issues/287)` regardless of source-tree state.
- The regime-holdout-detector's `collectDeprecationFindings` returned `[]` unconditionally (`// TODO(#287): replace stub with call to scanDeprecations(...)`).

Expected vs actual:

- Expected: `check-deprecations` walks the source tree and surfaces real `@deprecated` files + remaining importers.
- Actual (pre-port): empty-registry placeholder regardless of input.

Fix guidance:

- Issue [#287](https://github.com/audiocontrol-org/deskwork/issues/287) tracks the port. The dispatch landed the port verbatim from the pilot with the path-default rewrite and the configurable `moduleRoot` addition.

### The #287 port landed, but several comments and test names still describe `check-deprecations` as a stubbed Phase 4 shell

Finding-ID: AUDIT-20260526-02
Status:     fixed-16734ac
Severity:   low
Surface:    `plugins/dw-lifecycle/src/subcommands/check-deprecations.ts`, `plugins/dw-lifecycle/src/__tests__/scope-discovery/discovery-agents/regime-holdout-detector.test.ts`, `regime-holdout-detector.fixtures.ts`

Fix note (2026-05-26): updated three surfaces to reflect the post-port `4da4660` reality:
1. `subcommands/check-deprecations.ts:7-10` — replaced the "SUBCOMMAND SHELL" comment with a description of the shipped scanner (walks `.ts`/`.tsx` for `@deprecated` JSDoc tags + `// DEPRECATED:` line comments, resolves importers via configurable `@/` alias + basename-relative path forms).
2. `regime-holdout-detector.test.ts:15-17` — replaced the "deprecation gate STUBBED in Phase 4" docstring with "deprecation gate live — port landed in commit 4da4660" framing.
3. `regime-holdout-detector.test.ts:153-191` — flipped scenario 5's assertions from `deprecation_count === 0` + `deprecationFinding === undefined` to `deprecation_count >= 1` + `deprecationFinding defined`. Updated scenario 6's mixed-sources block similarly.
4. `regime-holdout-detector.fixtures.ts:239` — updated `DEPRECATED_IMPORTER_CONTENT` to use a relative path (`./components/OldEnvelope`) instead of the `@/components/OldEnvelope` alias form. The fixture's `--module-root modules` arg means the deprecated file's `@/`-alias is `@/foo-editor/src/components/OldEnvelope`; the pre-port fixture worked only because the stub returned 0 unconditionally. The relative form exercises the basename-relative resolver and survives both layouts.

9/9 regime-holdout-detector scenarios pass post-edit. The implementation is real and the audit rerun verified it, but some developer-facing prose still describes `check-deprecations` as an unported stub. That drift is now misleading because it points future readers at a problem that no longer exists.

Evidence:

- The dispatch shim comment still says the underlying command "is currently a SUBCOMMAND SHELL" and that the full port is pending issue #287 at [subcommands/check-deprecations.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/subcommands/check-deprecations.ts:7).
- The regime-holdout-detector tests still encode the old deferred contract:
  - test name says `deprecation gate stubbed in Phase 4 → deprecation_count === 0` at [regime-holdout-detector.test.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/__tests__/scope-discovery/discovery-agents/regime-holdout-detector.test.ts:153)
  - assertions still expect `payload.meta.deprecation_count` to be `0` and no deprecation findings at [regime-holdout-detector.test.ts](/Users/orion/work/deskwork-work/scope-discovery/plugins/dw-lifecycle/src/__tests__/scope-discovery/discovery-agents/regime-holdout-detector.test.ts:180)
- Meanwhile the real port is on-branch in commit `4da4660`, and the full verification run on 2026-05-26 passed `92/92` files and `957/957` tests.

Expected vs actual:

- Expected: developer-facing comments and tests describe the current contract, namely that `check-deprecations` is a real scanner and the regime-holdout detector consumes its findings.
- Actual: multiple comments and at least one test block still narrate the pre-port stub behavior.

Fix guidance:

- Update the stale subcommand comment to describe the shipped scanner rather than the pre-port shell.
- Replace the old stub-era regime-holdout-detector scenarios with post-port expectations that exercise real deprecation findings, so the tests document the current contract instead of the defunct one.


## 2026-05-29 — Phase 12 audit-barrage self-dogfood

First audit-barrage run against the audit-barrage feature itself (Tasks 1-3 implementation). The acceptance-signal target was "one barrage run surfaces ≥1 finding that the in-band self-audit + SDD review cycle didn't catch." **Met overwhelmingly: 13 distinct findings across 2 successful models, 4 with cross-model agreement.** ALL of these would have shipped without this audit (1966/1966 tests passed; tsc clean; live 3-CLI round-trip returned PROBE-OK).

Run dir: `.dw-lifecycle/scope-discovery/audit-runs/20260529T061616Z-audit-barrage/` (gitignored — see INDEX.md in worktree).

Per-model durations: claude 195s / 13495 stdout bytes (8 findings + 1 framing finding); codex 28s / 3379 bytes (4 findings); gemini failed (exit 1, "exhausted capacity on this model" — operator-level quota; not an audit-barrage bug).

### Cross-model agreement (HIGH-confidence findings, both models found the same bug)

### AUDIT-20260529-01 — Exit-vs-close event truncation

Finding-ID: AUDIT-20260529-01 (claude-exit-vs-close + codex-stream-error-race; cross-model)
Status: fixed-08971e4
Severity: high
Surface: `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/spawn-cli.ts:128-139`

Fix note (commit `08971e4`): `spawnCliAgainstModel` now settles on `child.on('close', ...)` instead of `'exit'` so stdio pipes have fully drained before the byte-counter snapshot + capture-stream close. Stream `'error'` handlers attached at stream creation so mid-run write failures reject the run instead of crashing the process. New regression test plants 200 lines (~10 KB) of pre-exit stdout via a fake CLI's `process.exit(0)` right after the writes and asserts every byte lands in the on-disk capture.

`spawnCliAgainstModel` finalizes on `child.on('exit', ...)` then immediately ends the capture streams. Per Node semantics, `'exit'` fires when the process ends but its stdio pipes may still have buffered, undelivered data; `'close'` is the event that fires only after all stdio streams have closed. Snapshotting on `'exit'` drops any in-flight stdout chunks — both from the on-disk `<model>.md` capture and from the `stdoutBytes` counter. This is silent data-fidelity loss on the load-bearing path of the whole feature.

Cross-cite: codex independently flagged the same root cause from the error-handler perspective (`stdoutStream.write(chunk)` called before any error handler is attached; if the write stream errors mid-run, the process can crash).

**Fix:** attach completion logic to `child.on('close', ...)` instead; attach stream error handlers immediately after stream creation.

### AUDIT-20260529-02 — args_template validation vs spawn-cli substitution drift

Finding-ID: AUDIT-20260529-02 (claude-args-template-substring-mismatch + codex-placeholder-contract; cross-model)
Status: fixed-08971e4
Severity: high
Surface: `config-loader.ts:200-205`, `schema/audit-barrage-config.yaml.schema.json:38`, `spawn-cli.ts:160-163`

Fix note (commit `08971e4`): chose option (a) — back-compatible intra-token literal replacement via `tok.split('{{prompt}}').join(prompt)`. `args_template: "--prompt={{prompt}}"` now renders `--prompt=<actual-prompt>` at spawn time. Existing adopter configs that put `{{prompt}}` as a standalone token continue to work; embedded forms work too. New tests cover the embedded-form substitution + multiple `{{prompt}}` occurrences in one token.

Config-loader accepts any `args_template` that *contains* `{{prompt}}` as substring; `buildArgs` only substitutes whole-token-equals-`{{prompt}}`. An operator writing `args_template: "--prompt={{prompt}}"` passes both validation + schema, then spawns the CLI with the literal `--prompt={{prompt}}` token and **never receives the rendered prompt**. Silent output-empty run with no error surfaced.

Both models independently identified this exact failure mode (substring validation vs token-exact substitution).

**Fix:** either (a) `buildArgs` does intra-token replace via `tok.split('{{prompt}}').join(prompt)`, or (b) validation tightens to require `{{prompt}}` as a standalone whitespace-delimited token with a clear error message rejecting embedded forms.

### AUDIT-20260529-03 — Exit-code contract drift vs PRD

Finding-ID: AUDIT-20260529-03 (claude-exitcode-vs-prd + codex-exit-contract-drift; cross-model)
Status: fixed-08971e4
Severity: medium
Surface: `audit-barrage.ts:230-237` (`isHealthyModelRun`) + `:222-225` (`deriveBarrageExitCode`); PRD criterion in `types.ts:113-119`

Fix note (commit `08971e4`): relaxed `isHealthyModelRun` to `stdoutBytes > 0 && spawnError === undefined` — non-zero CLI exits and timeouts fall on the healthy side because the captured stdout is still triagable. The `types.ts` JSDoc on `BarrageResult.exitCode` and the `deriveBarrageExitCode` docstring were both updated to match the PRD's "produced output" wording. New tests cover non-zero-exit-with-bytes (healthy), timeout-with-bytes (healthy), and spawn-error (unhealthy regardless of byte count).

PRD says: "CLI exit code: 0 if any model produced output; 1 if all failed." Implementation requires `exitCode === 0 && !timedOut && spawnError === undefined && stdoutBytes > 0`. A model that emits a complete useful response but exits non-zero (rate-limit warnings, partial-completion codes, non-zero-on-findings conventions are all common in LLM CLIs) is classified as "failed" — its findings file still on disk but the run reports exit 1 if it was the only "useful" model. Three subtly different contracts: code + `types.ts` comment + PRD all say different things.

**Fix:** decide which contract is authoritative + align all three. Recommended: relax `isHealthyModelRun` to "produced positive-byte stdout AND was not a spawn error / timeout" (matching the PRD's "produced output" wording).

### AUDIT-20260529-04 — Prompt-renderer is exported but not wired into the verb

Finding-ID: AUDIT-20260529-04 (claude-prompt-renderer-orphaned + codex-prompt-seed-override; cross-model + in-band Finding-001)
Status: fixed-08971e4
Severity: high
Surface: `subcommands/audit-barrage.ts:300-307` (`loadPromptText` reads `--prompt-file` raw); `prompt-renderer.ts` (exported but uncalled at runtime); `install-scope-discovery.ts:84-106` (seeds the override unconditionally)

Fix note (commit `08971e4`): chose option (a) — wired the renderer via a NEW sibling CLI verb `dw-lifecycle audit-barrage-render`. New file `subcommands/audit-barrage-render.ts` takes `--feature <slug>`, `--vars-file <path>` (a JSON map of EXPECTED_VARS → values), `--output <path>` (defaults to stdout). Reads + validates the vars JSON (flat string-map), checks the vars `feature_slug` matches the `--feature` flag, runs the renderer (resolves project override vs plugin default), writes the rendered prompt. Registered in `cli.ts`. Operator workflow now: `audit-barrage-render --vars-file ... --output <prompt>` → `audit-barrage --prompt-file <prompt>`. The unsubstituted-token check was refined in the companion AUDIT-20260529-10 fix. Renderer's seed-scaffold concern is moot now that the seeded comment-only scaffold contains no `{{var}}` markers.

The Task 3 prompt-renderer (`renderAuditBarragePrompt`, `EXPECTED_VARS`, `PROMPT_OVERRIDE_PATH`, `DEFAULT_PROMPT_TEMPLATE_PATH`) is referenced ONLY in `prompt-renderer.ts` and its test — **no runtime caller**. The CLI shim reads `--prompt-file` raw and passes the bytes straight through. The Phase 12 Task 3 acceptance criterion "project-overridable prompt template" is only half-met: config override IS wired (`loadAuditBarrageConfig` is called), but prompt override IS NOT.

Codex independently flagged a related issue: install-scope-discovery unconditionally seeds the override prompt file with literal `{{var}}` markers in instructional prose, which `rejectUnsubstitutedTokens` would reject — making the renderer's failure-loud check fire on its own seeded scaffold.

The operator hit this in-band during the dogfood (Finding-001 — couldn't render the prompt via the renderer because the template's instructional prose contains `{{var}}` strings, so the rejectUnsubstitutedTokens check fires on the template itself). Used a hand-substituted prompt instead.

**Fix:** either (a) wire `renderAuditBarragePrompt` into the verb (CLI takes `--render-vars` or auto-detects + renders) and refine the unsubstituted-token check to only reject `EXPECTED_VARS` that didn't get substituted, OR (b) drop the prompt-renderer entirely + document that the operator hand-composes the prompt + passes it via `--prompt-file`.

### Single-model findings (claude only)

### AUDIT-20260529-05 — Timeout timer leaks on spawn-error path (~305s dangling per uninstalled CLI)

Finding-ID: AUDIT-20260529-05 (claude-timeout-leak-on-spawn-error)
Status: fixed-08971e4
Severity: high
Surface: `spawn-cli.ts:99-110` vs `:118-126`

Fix note (commit `08971e4`): `finish()` now clears BOTH `sigkillTimer` AND `timeoutTimer`; every settle path (spawn-error, close, stream-error) goes through `finish()`. New regression test runs against a nonexistent binary, asserts the run settles in well under a second (no 30s timer dwell), and gives Node a 50ms tick after settle to surface any late timer activity. The change also moves the timer-handle into the closure (declared `let timeoutTimer: NodeJS.Timeout | null = null`) so the stream-error reject path can clear it too.

`clearTimeout(timeoutTimer)` happens ONLY inside the `'exit'` handler. On spawn failure (ENOENT — binary not installed), Node emits `'error'` and never `'exit'`. The error handler calls `finish()` which clears `sigkillTimer` but not `timeoutTimer`. Timer survives ~305 seconds after the run is logically done. The CLI shim's `process.exit()` masks this, but `orchestrateBarrage` is a public library function — any caller that awaits it without forcibly exiting hangs or emits open-handle warnings. Plus the post-finish `child.kill` mutating `timedOut` after the result was reported is a latent race.

The common dogfood case is "not all three CLIs are installed" — this fires on nearly every real run for any audit-barrage adopter who hasn't yet installed all configured models.

**Fix:** move `clearTimeout(timeoutTimer)` into `finish()` alongside the `sigkillTimer` cleanup so every settle path clears both.

### AUDIT-20260529-06 — `--prompt-file` read failure exits 1; config-error exits 2 (inconsistent usage-vs-runtime classification)

Finding-ID: AUDIT-20260529-06 (claude-promptfile-exit-code)
Status: fixed-08971e4
Severity: low
Surface: `audit-barrage.ts:300-308` vs `:285-289`

Fix note (commit `08971e4`): `loadPromptText` now exits 2 on file-read failure to match the config-error path. Both are pre-orchestration input validation; wrapper scripts that key on the exit code now distinguish "the audit ran and all models failed" (exit 1) from "you invoked me wrong" (exit 2).

A missing/unreadable `--prompt-file` is operator-input error of the same class as malformed `--models` filter or bad config — yet exits `1` (the "all models failed" code), while malformed config exits `2`. Wrapper scripts distinguishing "the audit ran and everything failed" from "you invoked me wrong" get the wrong signal.

**Fix:** `loadPromptText` exits 2 on file-read failure (matching the config-error path; both are pre-orchestration input validation).

### AUDIT-20260529-07 — Run-dir timestamp collision risk (second-resolution + recursive mkdir)

Finding-ID: AUDIT-20260529-07 (claude-rundir-collision)
Status: fixed-08971e4
Severity: low
Surface: `run-artifacts.ts:30-37` + `orchestrate-barrage.ts:64`

Fix note (commit `08971e4`): chose millisecond resolution — `encodeTimestamp` now emits `YYYYMMDDTHHMMSSsssZ` (3-digit ms suffix). Two barrages for the same feature in the same wall-clock second land in distinct run dirs. Tests updated to assert the new shape (`/^\d{8}T\d{9}Z$/` regex on `timestamp`; smoke script asserts the new run-dir-name shell glob).

Run-dir name is `<second-resolution-timestamp>-<feature>` + `mkdir({recursive:true})` doesn't error on existing dir. Two barrages for the same feature within the same wall-clock second resolve to the same run dir; the second silently overwrites the first. Project's "database preserves, doesn't delete" ethos says this is the wrong default.

**Fix:** millisecond-resolution timestamp OR detect existing dir + suffix `-2`/`-3`.

### AUDIT-20260529-08 — Misleading comment in `orchestrateBarrage`

Finding-ID: AUDIT-20260529-08 (claude-orchestrate-comment-drift)
Status: fixed-08971e4
Severity: low
Surface: `orchestrate-barrage.ts:71-83`

Fix note (commit `08971e4`): comment replaced with an accurate description — "assemble the BarrageRun, write INDEX.md, return the same record." The deliberate duplication (caller + `writeIndexFile` both derive `<runDir>/INDEX.md`) is now explicitly noted as a composability choice (the helper can be called standalone from tests).

Comment reads "assemble it without the indexPath first, then patch it on after the write so the record we return matches what landed on disk" — but the code does the opposite (computes `indexPath` up front, no post-write patch). `writeIndexFile`'s return value is discarded.

**Fix:** align comment to actual code (or drop the inaccurate "patch on after" framing).

### AUDIT-20260529-09 — Test files for this feature were outside the audited diff (range scoping concern)

Finding-ID: AUDIT-20260529-09 (claude-test-files-outside-range)
Status: informational
Severity: low
Surface: this audit-barrage run's diff scope

The audit prompt's diff excluded `*.test.ts` (I scoped narrowly to the production surface). Claude flagged that the "43 + 27 tests" claim couldn't be verified from the diff alone, and that a green test count is weak evidence for the timing/teardown bugs found above. Actionable: future audit-barrage runs should include the test surface in the diff scope, OR the operator should explicitly acknowledge the scope cut.

### Operator-side in-band findings during the dogfood

### AUDIT-20260529-10 — Renderer's unsubstituted-token rejection over-eager on instructional prose

Finding-ID: AUDIT-20260529-10 (in-band Finding-001; subsumed by AUDIT-20260529-04)
Status: fixed-08971e4
Severity: high
Surface: `prompt-renderer.ts:205-211`

Fix note (commit `08971e4`): `rejectUnsubstitutedTokens` now scans ONLY for unsubstituted EXPECTED_VARS markers, not arbitrary `{{...}}` strings. Template prose that mentions `{{var}}` / `{{name}}` / `{{var_name}}` as documentation of the substitution mechanism passes through unchanged. New tests cover the pass-through path + assert that a surviving DECLARED-var marker still fails loud (declared-var contract preserved).

Operator hit this in-band trying to render the prompt template — the template's instructional prose mentions `{{var}}` / `{{prompt}}` / `{{name}}` / `{{var_name}}` as documentation about the substitution mechanism. `rejectUnsubstitutedTokens` rejects ANY `{{xxx}}` substring, so it rejects the template's own instructional examples. Subsumed by AUDIT-20260529-04; fix lands together.

### AUDIT-20260529-11 — Prompt template's marker triplet pattern triples large vars

Finding-ID: AUDIT-20260529-11 (in-band Finding-002)
Status: fixed-08971e4
Severity: medium
Surface: `templates/audit-barrage-prompt.md`

Fix note (commit `08971e4`): `templates/audit-barrage-prompt.md` redesigned to drop the marker triplet pattern. Each declared var now has exactly ONE substitution site (descriptive markdown section header + bare `{{var}}` line beneath it). A 60 KB `diff` now appears once in the rendered output (60 KB, not 180 KB). New test asserts each value's unique sentinel appears exactly once via `rendered.split(value).length - 1 === 1`. The renderer's substitution machinery did not need to change (already a literal `split().join()` — with one occurrence per var in the template, correct by design).

The template wraps each substitution as:
```
<!-- {{var}} -->
{{var}}
<!-- {{var}} -->
```

Substitution replaces all three occurrences (the two HTML comment markers + the bare token), so the value appears in the rendered output 3 times. For small vars (`feature_slug`) this is harmless; for `diff` at 60 KB this triples to 180 KB. The operator's naive `.split().join()` substitution hit this; the prompt-renderer presumably has the same shape (need to verify).

**Fix:** template convention should use a single substitution site (e.g. fenced code block) rather than marker triplets — OR the renderer must be more precise about which occurrences to substitute (only the bare-token line, not the marker comments).

### Acceptance signal verification

**Acceptance signal: ≥1 finding the in-band self-audit + SDD review cycle didn't catch.**
- In-band self-audit (orchestrator-loop): didn't run formally; the operator's own pre-commit + tsc + test pass equivalent gates.
- SDD review cycle: the Task 2 + Task 3 dispatches went through `dw-lifecycle wrap-prompt --agent-type typescript-pro` + `dw-lifecycle validate-return`; agents shipped the work; no review-cycle findings surfaced.
- All 13 audit-barrage findings above were NOVEL — not caught by tsc, tests, or the dispatch-wrapper's response validation.

**Conclusion: acceptance signal met overwhelmingly.** The audit-barrage feature works as designed; its first dogfood against itself surfaced 4 cross-model HIGH-confidence bugs + 9 single-model findings, all of which would have shipped without the audit-barrage's existence.

Next steps (out of scope for Task 6 itself; track separately):
- Fix AUDIT-20260529-01..05 in a follow-up task before Phase 12 completes (the HIGH findings are blocking-adjacent per claude's framing).
- AUDIT-20260529-06..09 are polish; fix in follow-ups or surface as GH issues.
- AUDIT-20260529-10..11 are the prompt-renderer / template design issues uncovered in-band; fold into the Task 4/7 follow-up that wires the renderer properly.

### Closure note (2026-05-29; commit `08971e4`)

All 11 findings now carry `Status: fixed-08971e4` (or `informational` for AUDIT-20260529-09). The follow-up task referenced above ran in the same session as Phase 12 Tasks 4/5/7 — one coherent commit covers every fix + the remaining Phase 12 deliverables.

Awaiting `verified-<date>` on a post-release dogfood re-run (`/dw-lifecycle:audit-barrage` against the post-fix diff to confirm the fixed shapes don't regress and that the new prompt-renderer wiring produces a usable prompt end-to-end).

## 2026-05-29 — deskwork-plugin TF log import (scope-discovery items)

Source: `docs/1.0/001-IN-PROGRESS/deskwork-plugin/tooling-feedback.md` on `feature/deskwork-plugin`. Per project rule `.claude/rules/agent-discipline.md` § "scope-discovery v1 — dogfood feedback via tooling-feedback.md", scope-discovery-related TF entries from sibling features import into this audit-log as `AUDIT-YYYYMMDD-NN`. Hygiene-related TF entries (deskwork-plugin TF-001 `session-end-hygiene` scoping bug → [#361](https://github.com/audiocontrol-org/deskwork/issues/361); hygiene-feature TF-001 `validate-return` refactor-cue substring) are claimed by `feature/hygiene` per operator decision 2026-05-29 and are intentionally NOT imported here.

Mapping:
- TF-002 (DSC · low) → AUDIT-20260529-12
- TF-003 (MISC · medium) → AUDIT-20260529-13
- TF-004 (MISC · low) → AUDIT-20260529-14
- TF-005 (CL · low) → AUDIT-20260529-15

Fix scoping into Phase 14 — Friction-fix sweep (`workplan.md`).

### AUDIT-20260529-12 — orchestrator-turn 3/6 catalog NOTE is constant per-turn noise

Finding-ID: AUDIT-20260529-12
Status:     fixed-245f8ae
Severity:   low
Surface:    `plugins/dw-lifecycle/src/scope-discovery/orchestrator-turn.ts` (the assembler's `decorateSummaryWithCatalogPresence` decoration site)

Imported from deskwork-plugin TF-002 (`docs/1.0/001-IN-PROGRESS/deskwork-plugin/tooling-feedback.md` on `feature/deskwork-plugin`).

Fix note (commit `245f8ae`, 2026-05-29; Phase 14 Task 1): the assembler now threads the prior turn's `catalogPresentCount` (NEW optional field on `TurnHistoryEntry`) into `decorateSummaryWithCatalogPresence`. The NOTE is emitted only when the count is undefined (first turn / legacy state), changed from the prior turn, OR a new `--verbose` flag forces it. The WARNING case (count === 0) stays always-on. Tests at `plugins/dw-lifecycle/src/__tests__/scope-discovery/orchestrator-loop/catalog-note-noise.test.ts` cover the 8 scenarios (first-turn, steady-state, count-rise, count-fall, verbose-override, zero-WARNING, full-6/6-no-NOTE, count-persistence). Awaiting `verified-<date>` after a few real dogfood turns confirm the NOTE actually goes quiet on steady state.

Every `dw-lifecycle orchestrator-turn --feature <slug> --skip-judge --skip-auditor` invocation emits the identical stderr summary: `NOTE: only 3/6 catalog files present (anti-patterns.yaml, adopter-manifests.yaml, clones.yaml). 0 new audit entries; 0 wrong-decisions; ...`. The NOTE never changes between turns when the project has a steady-state catalog count and carries no actionable signal — it dilutes the genuinely-variable parts of the summary.

Suggested fix (from TF-002):
- *Light:* emit the "N/6 catalog files present" NOTE only when the count CHANGES from the last persisted turn (state already lives in `controller-state.json`), or gate behind `--verbose`.
- *Medium:* if 3/6 is the steady state for a project without the optional catalogs, downgrade from per-turn NOTE to a one-time install-time hint.

Scoped into workplan: Phase 14 Task 1 (fix-finding-AUDIT-20260529-12).

### AUDIT-20260529-13 — dispatch-wrapper wrap-prompt round-trip + grammar false-positives

Finding-ID: AUDIT-20260529-13
Status:     fixed-8365973
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/scope-discovery/dispatch-grammar.ts`, `plugins/dw-lifecycle/src/scope-discovery/dispatch-wrapper.ts`

Imported from deskwork-plugin TF-003 (`docs/1.0/001-IN-PROGRESS/deskwork-plugin/tooling-feedback.md` on `feature/deskwork-plugin`). Co-tracked with AUDIT-20260529-14 via [#362](https://github.com/audiocontrol-org/deskwork/issues/362).

**Follow-up landed in commit `b5c362e` (Phase 14 Task 2 review integration):** the Track 2 review surfaced that the GRAMMAR_INSTRUCTION prelude's Gotchas item 3 still showed `renderSwimStub` as a FAIL example after Phase 14 Task 2 relaxed the bare-noun match — agents reading the prelude would falsely believe descriptive `stub` trips. The prelude was rewritten to document context-aware behavior (ambiguous nouns require deferral collocation; bare identifiers pass; comment-marker form `TODO`/`FIXME`/`XXX` still trips). See AUDIT-20260529-16.

Fix note (commit `8365973`, 2026-05-29; Phase 14 Task 2 — #362 Medium): widened `SEARCHED_COUNT_NOUN_REGEX` to accept `issues?`/`bugs?`/`findings?`/`errors?`/`warnings?`. Restructured forbidden-phrase matching: ambiguous bare nouns (`stub`, `placeholder`, `pending`, `temporary`, `hack`, `defer`, `deferred`, `todo`, `fixme`, `xxx`) removed from `FORBIDDEN_DEFERRAL_PHRASES`; 6 new context-aware regexes added to `FORBIDDEN_DEFERRAL_REGEXES` for (a) ALL-CAPS comment markers (`TODO`/`FIXME`/`XXX` — case-sensitive), (b) ambiguous noun + deferral collocation (`placeholder for now` / `stub until F3`), (c) deferral verb + ambiguous noun, (d) bare `defer to v2` verb action. Unambiguous deferral phrases (`for now`, `will fix`) stay in PHRASES. Grammar-instruction prelude updated to document the expanded whitelist; rejection examples refreshed. 24 new tests at `dispatch-wrapper-grammar.test.ts`; existing TF-008 noun-whitelist test updated; fixtures' `REGEX_SAMPLE_REASONS` extended to keep parallel with the regex list. Awaiting `verified-<date>` after a few live reviewer dispatches exercise the relaxed grammar end-to-end. Pairs with the Light fix in AUDIT-20260529-14 (already landed at `95927f5`).

Every `/dw-lifecycle:review` reviewer dispatch requires a hand-managed round-trip: `mktemp` a prompt file → Write the prompt body into it → `dw-lifecycle wrap-prompt --prompt-file <path>` → paste the (120+ line) wrapped stdout into the Agent tool. The wrapped suffix's return grammar has three sharp edges that recur per session: the Searched-count noun whitelist (`5 issues found` rejected; must end in `matches`/`hits`/...), mandatory `path:LINE` on every Excluded entry (`:1` sentinel for whole-file), and a forbidden-substring list that collides with ordinary descriptive prose (`stub` / `placeholder` / `pending` in a reason trips the deferral detector even in non-deferral usage).

GH issue: [#362](https://github.com/audiocontrol-org/deskwork/issues/362) (co-files TF-003 + TF-004 with Light / Medium / Heavy fix ladder). Per Phase 13 anti-deferral discipline, the GH issue alone is not a disposition — scoped into workplan below.

Suggested fix (from TF-003 / #362):
- *Light (companion to AUDIT-20260529-14):* `dispatch-review --prompt-file <p> --agent-type <type>` verb that wraps both legs of the round-trip in one CLI call.
- *Medium:* word-boundary + context-aware match on forbidden substrings; widen Searched-count noun whitelist (`issues`, `files`, `instances`, ...).
- *Heavy:* the architectural collapse — operator decision required.

Scoped into workplan: Phase 14 Task 2 (fix-finding-AUDIT-20260529-13) — covers Medium grammar relaxation; Light stdin fix lives in Task 3 below.

### AUDIT-20260529-14 — validate-return has no stdin path

Finding-ID: AUDIT-20260529-14
Status:     fixed-95927f5
Severity:   low
Surface:    `plugins/dw-lifecycle/src/subcommands/validate-return.ts`

Imported from deskwork-plugin TF-004 (`docs/1.0/001-IN-PROGRESS/deskwork-plugin/tooling-feedback.md` on `feature/deskwork-plugin`). Co-tracked with AUDIT-20260529-13 via [#362](https://github.com/audiocontrol-org/deskwork/issues/362).

Fix note (commit `95927f5`, 2026-05-29; Phase 14 Task 3): `--response-file -` now reads from stdin via a new `readResponseSource(responseFile, stdin)` helper. UTF-8 bytes accumulated to EOF; empty stdin throws `EmptyStdinError` (CLI surfaces as exit 2 with the message `validate-return: stdin was empty (...). Pipe the response body in or pass a real file path.`). File-path mode unchanged. 7 tests cover the contract; end-to-end smoke verified with `printf | dw-lifecycle validate-return --response-file - --agent-type reviewer --json`. Awaiting `verified-<date>` after the next live reviewer dispatch uses the pipe form end-to-end.

Validating each reviewer return requires writing the agent's Searched / Included / Excluded block to a temp file, then `dw-lifecycle validate-return --response-file <path> --json`. There's no stdin path (`--response-file -`), so the response can't be piped; it must round-trip through a temp file the orchestrator hand-creates.

GH issue: [#362](https://github.com/audiocontrol-org/deskwork/issues/362) (Light fix in the issue's ladder; one-line patch). Per Phase 13 anti-deferral discipline, the GH issue alone is not a disposition — scoped into workplan below.

Suggested fix (from TF-004): accept `--response-file -` (read from stdin). Mirrors the `gh issue create --body-file -` convention already used elsewhere in this project.

Scoped into workplan: Phase 14 Task 3 (fix-finding-AUDIT-20260529-14).

### AUDIT-20260529-15 — clone gate scanned gitignored directories until `gitignore: true` set

Finding-ID: AUDIT-20260529-15
Status:     verified-2026-05-29
Severity:   low
Surface:    `plugins/dw-lifecycle/templates/scope-discovery/.jscpd.json`, scope-discovery's own `.jscpd.json`

Imported from deskwork-plugin TF-005 (`docs/1.0/001-IN-PROGRESS/deskwork-plugin/tooling-feedback.md` on `feature/deskwork-plugin`).

Fix originated on `feature/deskwork-plugin` at commit `37683c8` ("fix(38·1): clone gate honors .gitignore — set gitignore:true (#354)"). Cherry-picked onto `feature/scope-discovery` at commit `884851e` to close the cross-branch verification loop without waiting for `feature/deskwork-plugin → main` merge. Sets `"gitignore": true` in the scope-discovery `.jscpd.json` + the adopter template seed; regression at `clone-detector.gitignore.test.ts` (4 tests; 1.2s — gitignored dir skipped, tracked clone still caught). Closes pilot-reported [#354](https://github.com/audiocontrol-org/deskwork/issues/354) (the GH issue stays open per the closure-requires-verified-release rule until verified post-release).

Verified live (2026-05-29): `npx vitest run src/__tests__/scope-discovery/clone-detector.gitignore.test.ts` exits 0 with 4/4 green; pre-commit clone-gate ran cleanly on the cherry-pick commit.

Cross-branch chemistry note: when `feature/deskwork-plugin` eventually merges to main, the `37683c8` patch content will be a duplicate of what `884851e` already applied here. Git resolves by patch ID — no conflict expected.

## 2026-05-29 — Three-track review integration (post-Phase-14 commits)

Track 1: `tsc --noEmit` clean; plugin vitest 2150/2150; `dw-lifecycle check-open-findings --feature scope-discovery` exit 0; `dw-lifecycle check-clones --gate-mode` exit 0 (no NEW groups).

Track 2 (spec-compliance, `feature-dev:code-reviewer` dispatch): 1 finding.
Track 3 (code-quality, `feature-dev:code-reviewer` dispatch in parallel): 5 findings (4 actionable + 1 informational).

All 5 dispatched through the post-Phase-14 dispatch wrapper. Track 2's first response was REJECTED by the validator (`4 commits reviewed, 1 finding` — comma in the count phrase breaks the modifier regex); response was hand-corrected to a parseable Searched line (`17 files`) and re-validated cleanly. Both responses then validated through the AUDIT-14 stdin pipe (`cat <file> | dw-lifecycle validate-return --response-file - --agent-type reviewer --json`) — dogfooded the AUDIT-13 + AUDIT-14 fixes end-to-end.

Per the agent-discipline rule, the 4 actionable findings landed inline in a follow-up commit; the informational one is recorded as `informational` with no required fix.

### AUDIT-20260529-16 — GRAMMAR_INSTRUCTION prelude Gotchas item 3 stale after Phase 14 Task 2

Finding-ID: AUDIT-20260529-16
Status:     fixed-b5c362e
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/scope-discovery/dispatch-wrapper.ts:347-360`

Track 2 review-finding (confidence 82). After Phase 14 Task 2's grammar relaxation, the prelude's Gotchas item 3 still showed `renderSwimStub is the focus-off stub button` as a FAIL example and claimed "the parser's substring match doesn't distinguish proper-noun usage from deferral usage." Post-relaxation, that example PASSES (bare `stub` no longer trips without a deferral collocation). Future agents reading the prelude would over-avoid descriptive `stub` / `placeholder` in Excluded reasons or be surprised when the FAIL example actually passes.

Fix: rewrote item 3 to document context-aware behavior — ambiguous nouns require deferral collocation (`for now`, `until v#`, `until we`, `until the next <unit>`, etc.); descriptive prose passes (`placeholder text shown until the user types`, `renderSwimStub is the focus-off button`, `defer to the spec`). The case-sensitive `TODO`/`FIXME`/`XXX` comment markers are called out explicitly. Updated TF-009 test in `validate-return.test.ts` (the prior assertions about `swim-stub` workaround + `PURPOSE` are stale; new assertions check `context-aware`, `Ambiguous nouns`, `deferral collocation`, `renderSwimStub` example, `defer to the spec` example).

### AUDIT-20260529-17 — open-findings-gate version-candidate list is narrower than the rest of the tool

Finding-ID: AUDIT-20260529-17
Status:     fixed-b5c362e
Severity:   high
Surface:    `plugins/dw-lifecycle/src/scope-discovery/promote-findings/open-findings-gate.ts:66-69`

Track 3 review-finding. The gate hardcoded two candidate paths (`docs/1.0/001-IN-PROGRESS/<slug>` + `docs/0.x/001-IN-PROGRESS/<slug>`) while `orchestrator-turn.ts:findFeatureDirectory` walks every top-level `docs/*/001-IN-PROGRESS/` dir dynamically. Real features at `docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/` and `docs/0.16.0/001-IN-PROGRESS/open-issue-tranche-cleanup/` would throw `FeatureRootNotFoundError` instead of returning a gate verdict — disorienting for the operator.

Fix: replaced the hardcoded candidate list with a `findFeatureRoot` walk that `readdir`s every top-level directory under `docs/`, looks for `001-IN-PROGRESS/<slug>`, and returns the first match. Updated `FeatureRootNotFoundError` to report the actual versions walked (not the hardcoded fallback). 4 new test scenarios at `open-findings-gate.test.ts`: docs/0.19.0/, docs/0.16.0/, arbitrary version (`2.0`), mixed-docs case with README.md + 003-COMPLETE/ subdirs to skip. Live smoke confirmed: gate now returns exit 0 for `studio-mobile-first` and `open-issue-tranche-cleanup`.

### AUDIT-20260529-18 — grammar false-negative: ambiguous-noun + intervening modifier slips deferral detection

Finding-ID: AUDIT-20260529-18
Status:     fixed-b5c362e
Severity:   high
Surface:    `plugins/dw-lifecycle/src/scope-discovery/dispatch-grammar.ts:144`

Track 3 review-finding. Phase 14 Task 2's ambiguous-noun regex required adjacency between the noun and the deferral collocation: `\b(?:stub|placeholder|...)\s+(?:for\s+now|until|...)\b/i`. The reviewer flagged that an intervening modifier word slips the matcher — `placeholder approach until we figure out the right shape` doesn't trip because `approach` separates `placeholder` from `until`. Same gap for `stub implementation until v2`, `placeholder code path until the next sprint`, etc.

Fix: widened the regex to allow `{0,2}` modifier tokens between the noun and the collocation, AND extended the `until` deferral context to include `until we` + `until the next <sprint|milestone|phase|release|version|cycle|iteration>` (the specific shapes the reviewer flagged as gaps). Kept the descriptive cases passing: `placeholder text shown until the user types` does NOT trip because `the user` is not in the `until` deferral suffix; `stub function tested elsewhere` does NOT trip because there's no deferral collocation. 5 new positive tests + 2 new negative tests at `dispatch-wrapper-grammar.test.ts`.

### AUDIT-20260529-19 — grammar false-positive: `defer to <noun phrase>` trips legitimate idioms

Finding-ID: AUDIT-20260529-19
Status:     fixed-b5c362e
Severity:   high
Surface:    `plugins/dw-lifecycle/src/scope-discovery/dispatch-grammar.ts:148`

Track 3 review-finding. Phase 14 Task 2's defer-verb regex included bare `to` in the alternation: `\bdefer(?:red|ring)?\s+(?:to|until|...)\b/i`. This caught the canonical `defer to v2` deferral but also caught legitimate idioms: `defer to the operator` (let the operator decide), `defer to the spec` (rely on the canonical spec), `defer to the existing abstraction` (use the existing code). The pattern is a common natural-English construction agents would use in Excluded reasons.

Fix: narrowed to require a version (`v\d`), phase (`F\d` / `phase \d`), or `the next <unit>` target after `to`: `to\s+(?:v\d|F\d|phase\s+\d|the\s+next\s+(?:milestone|sprint|phase|release|version|cycle|iteration))`. `until` retained as an unambiguous deferral preposition. New tests: 3 positive (`defer to v2`, `defer to F3`, `defer to phase 5`) + 3 negative (`defer to the operator`, `defer to the spec`, `defer to the existing abstraction`) + 1 past-tense regression (`deferred to v2`).

### AUDIT-20260529-20 — whitespace-only stdin surfaces as confusing DispatchRejected instead of EmptyStdinError

Finding-ID: AUDIT-20260529-20
Status:     fixed-b5c362e
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/subcommands/validate-return.ts:62`

Track 3 review-finding. Phase 14 Task 3's empty-stdin guard used `body.length === 0`, which only catches truly-empty stdin. A whitespace-only pipe (e.g. `echo "" | dw-lifecycle validate-return --response-file - --agent-type reviewer` — the common operator-typo case) produces a non-empty body of just `\n`, which then fails downstream inside `parseReturn` with a `DispatchRejected` on missing blocks. The operator sees a generic "missing required block(s)" message instead of the actionable `EmptyStdinError` hint to pipe the response body in.

Fix: changed `body.length === 0` to `body.trim().length === 0` — whitespace-only stdin now throws `EmptyStdinError` cleanly. 4 new test scenarios at `validate-return-stdin.test.ts`: newline-only, CRLF-only, multi-newline-with-tab, and a positive case (`'  x  '` with surrounding whitespace passes through with leading/trailing whitespace preserved).

### AUDIT-20260529-21 — assembler does a redundant second `loadLoopState` to read `priorPresentCount`

Finding-ID: AUDIT-20260529-21
Status:     informational
Severity:   low
Surface:    `plugins/dw-lifecycle/src/scope-discovery/orchestrator-turn.ts:638-651`

Track 3 review-finding (informational). The orchestrator-turn assembler loads `LoopState` independently at the top to read the prior catalog count, and the library `runOrchestratorTurn` ALSO loads `LoopState` internally inside `loop-turn.ts:329`. Two reads of the same file in normal sequential execution. The reviewer flagged it as informational: "not a functional bug in single-process sequential execution" but creates "unnecessary I/O coupling."

Disposition: recorded as informational, no immediate fix. The cleaner refactor (pass `loopStateOverride` from the assembler into the library so the library uses the assembler's pre-loaded state) widens the library's surface for a UI-side concern (NOTE-noise gating) — not appropriate to land alongside the review integration. If/when the assembler grows additional loop-state-dependent decoration that justifies the cost, the refactor follows then. No workplan task; no GH issue.

### Closure note

All 4 actionable findings (AUDIT-20260529-16/17/18/19/20) land in the same review-integration commit. AUDIT-20260529-21 is informational and requires no fix. Plugin suite at 2170/2170 (2150 baseline + 20 new tests). `tsc --noEmit` clean. Smoke-verified end-to-end:

- `dw-lifecycle check-open-findings --feature scope-discovery` → exit 0
- `dw-lifecycle check-open-findings --feature studio-mobile-first` → exit 0 (NEW: previously would have errored with FeatureRootNotFoundError)
- `dw-lifecycle check-open-findings --feature open-issue-tranche-cleanup` → exit 0 (NEW)

Awaiting `verified-<date>` on each of -16 through -20 after the next batch of dispatch-wrapper-using or gate-using work confirms no regression.

## 2026-05-30 — audit-barrage lift (20260530T071155888Z-scope-discovery)

### AUDIT-20260530-01 — Audit-barrage finding extraction silently downgrades unrecognized severities to `informational` (the LOWEST rank)

Finding-ID: AUDIT-20260530-01 (claude-01 + claude-04 + codex-03; cross-model)
Status:     fixed-2af92b7ee1cdb32df61584a7a2d80c00412fec34
Severity:   high
Surface:    `plugins/dw-lifecycle/src/scope-discovery/promote-findings/extract-barrage-findings.ts:130-136`

`normalizeSeverity` maps any value outside `{blocking, high, medium, low, informational}` to `'informational'` — the lowest rank in `SEVERITY_RANK` (0). The test suite even pins this: `expect(normalizeSeverity('critical')).toBe('informational')` (extract-barrage-findings.test.ts). The single most likely model deviation from the canonical set is `critical` (every model uses it), and the chosen fallback buries it at the bottom of the triage queue. For merged clusters this is doubly harmful: `mergeCluster` picks `max-of-cluster` rank (lines 254-258), so a cluster where one model says `blocking` and another says `critical` collapses the `critical` voice to rank 0, and if BOTH models say `critical`, the merged finding is `informational` — i.e. a cross-model HIGH-confidence agreement on a critical bug surfaces to the operator as `informational`. The whole feature exists to prioritize findings into the work queue; an unknown-severity fallback to the lowest rank actively defeats that. A safer fallback is `high` (fail toward attention, not away from it) or preserving the raw string as a flagged "non-canonical severity" so the operator sees it. The lift verb (audit-barrage-lift.ts:`renderEntry`) writes this normalized value straight into the audit-log `Severity:` line, so the downgrade is persisted.

### AUDIT-20260530-02 — `computeAutoPosition` hard-codes `## Phase` headings; non-Phase workplans throw and HALT the unconditional implement-loop hook

Finding-ID: AUDIT-20260530-02
Status:     fixed-16be1bbec4cc0fe8dd52b914d328c871f0be4951
Severity:   high
Surface:    `plugins/dw-lifecycle/src/scope-discovery/promote-findings/auto-position.ts:96,97,166-170`

`PHASE_HEADING_RE = /^##\s+Phase\b/i` and `PHASE_NUMBER_RE = /^##\s+Phase\s+(\d+)/i` only match headings literally beginning with "Phase". When no such heading exists, `computeAutoPosition` throws `AutoPositionError` (lines 166-170), which `promote-findings --auto` maps to exit 2 (promote-findings.ts:`runPromoteFindings` auto-apply branch). Per the SKILL.md Step 6 failure policy, `promote-findings --auto` non-zero is a **STOP-the-loop event** — and the hook is **unconditional** (no `--skip-audit-barrage-hook` flag). The project's own PM standard (work-level CLAUDE.md / PROJECT-MANAGEMENT.md) explicitly sanctions non-temporal terms "milestone, sprint, **phase**". An adopter whose workplan uses `## Milestone 3` or `## Sprint 2` will therefore: complete a task, fire the barrage, surface ≥1 finding, and then hit a hard loop-stop at the first auto-promote — at every task boundary, forever, with an error that points at the wrong cause ("no parseable Phase headings"). Because the failure only manifests once the barrage surfaces a finding, it won't show up in a clean dogfood and will ambush a real adopter mid-loop. The regex should accept the sanctioned heading vocabulary (Phase/Milestone/Sprint) or the AutoPositionError path should degrade (skip auto-scope, surface a warning) rather than stop the loop, given the hook's unconditional contract.

### AUDIT-20260530-03 — Auto-position task numbering assumes hierarchical `Task <phase>.<minor>` but the scope-discovery workplan itself uses flat `Task N:`

Finding-ID: AUDIT-20260530-03
Status:     fixed-1645d43021ccc45190f7d339e43c80f5dd67e176
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/scope-discovery/promote-findings/auto-position.ts:182-191` (`nextTaskNumberFactory`), `auto-position.ts:153-157` (`currentMaxMinorInPhase`)

`nextTaskNumberFactory` emits `${phaseNumber}.${currentMaxMinorInPhase + 1 + idx}`, deriving the major segment from the `## Phase N` heading and the minor from existing `Task N.M` headings *whose major equals the phase number*. The auto-position tests validate this against fixtures using hierarchical numbering (`### Task 14.1`, `### Task 15.1`, `### Task 15.2`). But the actual scope-discovery workplan under audit uses **flat** numbering: `### Task 1:` … `### Task 6:` under `## Phase 15` (see the workplan.md hunks — every task heading is `### Task <single-int>:`). On that workplan: `collectTaskHeadings` parses `### Task 5:` as major=5/minor=0; the phase is 15; no task has major===15, so `currentMaxMinorInPhase = 0`; new fix-tasks are numbered `Task 15.1`, `Task 15.2`. The result is `### Task 15.1:` interleaved among `Task 1..6` — visually broken, non-monotonic numbering, and inconsistent with the file's own convention. The gate keys on the `(fix-finding-AUDIT-...)` tag rather than the number so it still opens, but the workplan the operator reads is now incoherent. The library's numbering scheme and its test fixtures encode an assumption the project's own workplans violate; the helper should detect the workplan's prevailing task-numbering convention (flat vs hierarchical) instead of assuming `<phase>.<minor>`.

### AUDIT-20260530-04 — `audit-barrage-lift` writes the canonical audit-log non-atomically, risking loss of all preserved history on crash

Finding-ID: AUDIT-20260530-04
Status:     fixed-4335b64a8a4a0fd11d420dfde5fa93cdd0682697
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/subcommands/audit-barrage-lift.ts:333-340`

The apply path reads the full audit-log, concatenates the new section, and writes the whole file back with a single `writeFile(auditLogPath, ...)` (default writer at line 312; the `--apply` branch at 333-340). `writeFile` truncates-then-writes — it is not atomic. If the process is interrupted between truncate and full write (signal, disk-full, operator Ctrl-C mid-hook), the canonical `audit-log.md` is left truncated or empty. This file is precious historical record under the project's own rule ("Content-management databases preserve, they don't delete… deleting from a database wipes them from history"), and the lift's entire contract (Step 5: "preserve all pre-existing entries verbatim") depends on the write succeeding atomically. The fix is the standard write-temp-then-`rename` pattern (rename is atomic on POSIX), so a crash leaves either the old file or the new file, never a truncated one. The same concern applies to `promote-findings --auto`'s workplan write, but the audit-log is the higher-stakes append-only ledger.

### AUDIT-20260530-05 — The `--auto` multi-finding insertion path (the feature's primary case) is untested; all `--auto` tests use a single finding

Finding-ID: AUDIT-20260530-05 (claude-06 + claude-08 + codex-02; cross-model)
Status:     fixed-3ba712dea1a110718764eb3c4597dc3b47945419
Severity:   high
Surface:    `plugins/dw-lifecycle/src/subcommands/promote-findings.ts` (auto-apply branch, items mapped with shared `insertAfterLine`), `__tests__/.../subcommand.test.ts:551-771`

In the auto-apply branch every proposal item is given the **same** `fields.insertAfterLine = position.insertAfterLine` (all findings anchor to one line); ordering and task-number coherence then depend entirely on how `applyProposal` sequences multiple inserts at an identical anchor — code not shown in this diff and therefore unverified. The barrage's whole reason to exist is surfacing **multiple** findings per run (Phase 12 cited "4 cross-model HIGH + 7 single-model"), so multi-finding auto-scope is the primary path. Yet every `--auto` test in subcommand.test.ts exercises exactly one open finding (`AUDIT-20260529-77`): the "writes a workplan insert" test asserts a single `Task 15.2`, and the idempotency test re-runs with one finding. There is no test that two findings at the same anchor produce two correctly-ordered, non-colliding task blocks whose physical order matches their `15.1 / 15.2` numbering, nor that the workplan-aware gate then sees both at positions [0..1]. Per the project's TDD discipline and the audit-log's own "passing the spec test suite ≠ correct implementation" lesson, the load-bearing path needs a ≥2-finding fixture before this is callable from an unconditional loop hook.

### AUDIT-20260530-06 — Feature-root resolution is non-deterministic when a slug exists under multiple version dirs

Finding-ID: AUDIT-20260530-06
Status:     fixed-b67627bef41c1004d92af60c8abe8c81d8d22905
Severity:   low
Surface:    `plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-aware-gate.ts:120-141` (`findFeatureRoot`), `plugins/dw-lifecycle/src/subcommands/audit-barrage-lift.ts:289-305` (`resolveFeatureRoot`)

Both walkers iterate `await readdir(docsRoot)` and return the **first** `docs/<version>/001-IN-PROGRESS/<slug>` match. `readdir` returns entries in arbitrary (filesystem) order, not sorted. If the same slug exists under two version directories (e.g. a feature carried across `docs/1.0/` and `docs/0.19.0/`, which AUDIT-20260529-17 shows is a real layout in this repo), the gate and the lift can each pick a *different* directory, and either can change which one it picks between runs. The gate would then read one feature's audit-log while the lift writes the other's — a split-brain that silently corrupts the closure loop. The walk should sort `topEntries` deterministically (and ideally error if a slug is ambiguous across versions) rather than depend on readdir order. Low because the multi-version-same-slug case is uncommon, but the failure is silent and cross-verb when it happens.

### AUDIT-20260530-07 — Auto-promoted fix tasks are invisible to the new gate

Finding-ID: AUDIT-20260530-07
Status:     fixed-e0b20c1267029aad2654b20e2b650b12cf1d1e5c
Severity:   blocking
Surface:    plugins/dw-lifecycle/src/scope-discovery/promote-findings/tdd-enforcement.ts:204-222, plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-task-renderer.ts:41-46

`findUncheckedTasksInOrder` only recognizes task headings shaped like `### Task 15.2:` because `TASK_HEADING_RE` requires the colon immediately after the numeric task id. The canonical renderer used by `promote-findings --auto` emits `### Task 15.2 (fix-finding-AUDIT-...): ...`, with the fix marker before the colon. That means the hook can insert fix tasks successfully, but `check-open-findings` will not see those tasks as unchecked workplan tasks, so the sanity gate in the hook still refuses.

The tests miss this because their fixtures use `### Task 99.1: Fix ... (fix-finding-...)`, not the renderer’s real heading shape. Update the task-heading parser to accept the canonical rendered heading, and add an integration test that runs `promote-findings --auto` then `check-open-findings` against the resulting workplan.

## 2026-05-30 — audit-barrage lift (20260530T180223318Z-scope-discovery)

### AUDIT-20260530-08 — Lexicographic version-dir sort fixes split-brain but picks the semantically-wrong (older) version and still never errors on ambiguity

Finding-ID: AUDIT-20260530-08
Status:     fixed-6bc39e57574baca67d517b967e4dc45e6c2e33d1
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-aware-gate.ts:112-120`, `plugins/dw-lifecycle/src/subcommands/audit-barrage-lift.ts:174-180`

The AUDIT-20260530-06 fix replaces `await readdir(docsRoot)` with `[...(await readdir(docsRoot))].sort()` in both walkers and picks the first match. This *does* eliminate the cross-verb split-brain (gate and lift now agree, since both apply identical default lexicographic sort), so that half of the finding is genuinely closed. But two problems remain unaddressed by this fix:

1. **The pick is semantically arbitrary and usually wrong.** Default `.sort()` is lexicographic, not semver. With the repo's own real layout (`docs/1.0/`, `docs/0.19.0/`, `docs/0.16.0/` — all cited verbatim in AUDIT-20260529-17), a slug present under both `1.0` and `0.19.0` resolves to `0.19.0` because `'0' < '1'` — i.e. the walker deterministically prefers the *older/archived* version over the active one. Worse, lexicographic ordering breaks within a major: `'0.10.0' < '0.9.0'` (since `'1' < '9'`), so the chosen dir doesn't even track string-version intuition. The closure loop would then read/write the wrong feature's audit-log + workplan — silently.

2. **The original finding explicitly recommended erroring on ambiguity** ("ideally error if a slug is ambiguous across versions"); the fix chose silent-deterministic-pick instead. Determinism without a loud signal means a genuinely-ambiguous slug is resolved by an arbitrary rule the operator never sees. A reasonable fix: when `readdir` yields ≥2 version dirs containing the same slug, throw (or warn loudly and prefer the lexicographically-*greatest* `001-IN-PROGRESS` match, which at least biases toward `1.0` over `0.x`). The frequency is low (multi-version same-slug is uncommon), but the failure is silent and cross-verb when it lands — exactly the shape the finding named.

### AUDIT-20260530-09 — `feature-root-determinism.test.ts` "resolve to the SAME version dir" test asserts nothing meaningful — it does not test the split-brain it's named for

Finding-ID: AUDIT-20260530-09
Status:     fixed-6bc39e57574baca67d517b967e4dc45e6c2e33d1
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/feature-root-determinism.test.ts` (the `'audit-barrage-lift + workplan-aware-gate resolve to the SAME version dir'` case)

This test claims to verify the AUDIT-06 split-brain contract (lift and gate pick the same dir), but its own inline comments concede it can't: *"If the gate picked a DIFFERENT version than the lift, we wouldn't have a way to detect that here — so let me just assert determinism (both calls return the same gate result)."* The actual assertions are `expect(liftExit).toBe(0)`, `expect(gateResult.allowed).toBe(true)` (both versions' audit-logs are empty, so this is trivially true regardless of which dir either verb chose), and `expect(liftStderr).toBeDefined()` — which is a tautology, since a captured-string accumulator is always defined. None of these would fail if the lift wrote `0.x` while the gate read `1.0`. Per the project's own testing rule ("tests that don't test the contract they claim to test"), this is a misleading test: its name and docblock assert split-brain coverage that the body does not provide.

The split-brain contract IS partially covered by the third test (lex-first pick → `0.x`'s open finding makes the gate refuse), so the regression isn't entirely untested — but this middle test should either be made to actually compare the two verbs' chosen paths (e.g. have the lift `--apply` write a distinguishable marker into whichever audit-log it picked, then assert the gate reads that same marker) or be deleted, because as written it provides false confidence.

### AUDIT-20260530-10 — `atomicWriteFile` wraps `writeFile` in a no-op try/catch and its "rename fails" test actually exercises the write-fail path

Finding-ID: AUDIT-20260530-10
Status:     fixed-c6b74da704604a268038b261a1bdd3abb5e04c29
Severity:   low
Surface:    `plugins/dw-lifecycle/src/scope-discovery/util/atomic-write-file.ts:36-41`, `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/atomic-write-file.test.ts` (the `'cleans up the temp file if the rename itself somehow fails'` case)

Two hygiene issues in the otherwise-correct AUDIT-04 atomic-write helper:

1. The `try { await writeFile(tmpPath, content, 'utf8'); } catch (writeErr) { throw writeErr; }` block catches and immediately re-throws with no added behavior — it's a no-op try/catch that obscures the real control flow (the meaningful cleanup is only in the *rename* catch). Drop the write-side try/catch; let the write error propagate directly. The comment above it is the only thing the block contributes, and a comment doesn't need a try/catch to exist.

2. The test named `'cleans up the temp file if the rename itself somehow fails'` does not test a rename failure at all — it targets `does-not-exist/subdir/file.md`, so the *write* throws before any rename is attempted (the test's own comment admits this: "the temp file write throws BEFORE the rename"). The rename-failure cleanup path (`unlink(tmpPath).catch(...)` at lines 47-50) is therefore never exercised by any test, despite being the one branch where the cleanup logic actually matters. The named contract — temp-file cleanup after a *rename* failure — is unverified. Either rename the test to match what it checks, or inject a failing `rename` seam to cover the real branch.

### AUDIT-20260530-11 — `normalizeSeverity('')` now maps empty/missing severity to `high`, conflating a parse artifact with an unknown-but-real severity

Finding-ID: AUDIT-20260530-11
Status:     fixed-13b87d9c12c9660ba87dc847aeae849046667f5d
Severity:   low
Surface:    `plugins/dw-lifecycle/src/scope-discovery/promote-findings/extract-barrage-findings.ts:90-101`

The AUDIT-01 fix correctly raises the unknown-severity fallback from `informational` to `high` ("fail toward attention"), which is the right call for a real-but-non-canonical token like `critical`. But the same fallback — and the new test pinning it (`expect(normalizeSeverity('')).toBe('high')`) — also routes an **empty** severity to `high`. An empty severity field is qualitatively different from `critical`: it's most often a *parse artifact* (the model emitted a malformed finding where the `Severity:` line was absent or unparseable), not a model judgment of high impact. Because merged clusters take max-of-cluster rank, a single malformed empty-severity finding can now inflate an entire cross-model cluster to `high` and jump the triage queue ahead of findings the models actually rated. 

This is defensible as the operator-chosen "fail toward attention" stance, so it's informational-bordering-low rather than a bug — but worth surfacing: consider distinguishing "non-canonical token" (→ `high`, the AUDIT-01 case) from "absent/empty severity" (→ a flagged `needs-severity` marker, or `medium`) so a parser miss doesn't masquerade as a model-asserted high. The graceful-skip path (Task 2 Step 4) already exists for fully-malformed `<model>.md` files; an empty severity inside an otherwise-parseable finding falls through that net and lands at `high` instead.

---

I walked the seven fix commits (severity fallback, Phase/Milestone/Sprint heading vocabulary, flat-vs-hierarchical numbering, atomic write, lex-sort determinism, canonical-ID matching across the gate/renderer/editor/apply-flips quartet, and the permissive task-heading regexes). The canonical-ID matching changes (workplan-aware-gate.ts, workplan-task-renderer.ts, workplan-editor.ts, apply-audit-flips.ts, audit-log-editor.ts) are internally consistent — all five sites now key on `\bAUDIT-\d{8}-\d+`, and the renderer strips the cross-model annotation from the marker while preserving it in the `Closes` line and the audit-log Finding-ID, so the round-trip holds. The auto-position convention detection is correct for the clean flat and hierarchical cases. My four findings are: the lex-sort version pick is deterministic-but-semantically-wrong and still silent on ambiguity (medium), one determinism test is vacuous (medium), and two hygiene issues in the atomic-write helper + an empty-severity conflation (low). No `blocking` findings — the canonical-ID unification genuinely closes the AUDIT-07 gate-blindness regression.

### AUDIT-20260530-12 — Auto-position still cannot see renderer-shaped fix-task headings

Finding-ID: AUDIT-20260530-12
Status:     fixed-1f6612a2579795b84021d450dbf4ee00e7a12bbb
Severity:   high
Surface:    plugins/dw-lifecycle/src/scope-discovery/promote-findings/auto-position.ts:44,170-216; plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-task-renderer.ts:60-61

`workplan-task-renderer` now emits fix tasks as `### Task N.M (fix-finding-AUDIT-...): title`, but `auto-position.ts` still uses `TASK_HEADING_RE = /^###\s+Task\s+(\d+)(?:\.(\d+))?\s*:/i`, which only matches when the colon comes immediately after the task number. The same parser feeds both first-unchecked detection and current task-number calculation at lines 170-216, so already auto-promoted fix tasks disappear from `computeAutoPosition`.

This is the same shape that was fixed for the gate in `tdd-enforcement.ts`, but the auto-position copy was left behind. On a repeated `promote-findings --auto` run, or any run against a workplan that already contains renderer-shaped fix tasks, the helper can insert at the wrong anchor and reuse stale task numbers because it ignores those existing tasks. The fix is to align `auto-position.ts` task-heading parsing with the renderer-output shape and add a regression where `computeAutoPosition` runs after a rendered fix task already exists.

### AUDIT-20260530-13 — Cross-model workplan idempotency canonicalizes only the existing marker side

Finding-ID: AUDIT-20260530-13
Status:     fixed-42e93f47fd2335a00f0bc47d6d32cb50d9517e35
Severity:   high
Surface:    plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-editor.ts:120-149; plugins/dw-lifecycle/src/scope-discovery/promote-findings/apply.ts:150-155; plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-task-renderer.ts:57-63

`findingsAlreadyInserted` now stores canonical marker IDs like `AUDIT-20260530-01`, but the idempotency filter compares those values directly against `ins.findingId` at line 148. `apply.ts` passes `item.finding.findingId` into the insertion unchanged, and cross-model findings carry the full annotated value, e.g. `AUDIT-20260530-01 (claude-01 + codex-03; cross-model)`. Meanwhile, the renderer deliberately writes only the canonical marker in the heading.

That means the recovery path for a cross-model partial apply is still not idempotent: the workplan may already contain `(fix-finding-AUDIT-20260530-01)`, but a re-run with insertion ID `AUDIT-20260530-01 (claude-...; cross-model)` does not match the set and inserts a duplicate task. Canonicalize `ins.findingId` before the `alreadyInserted.has(...)` check and in the tie-breaker map key.

### AUDIT-20260530-14 — Fixed audit tasks remain unchecked in the workplan

Finding-ID: AUDIT-20260530-14
Status:     fixed-49808af899510688b6485077ba9319eed61b9876
Severity:   medium
Surface:    docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md:167-271; docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md:713-768

The diff flips AUDIT-20260530-01 through AUDIT-20260530-07 to `fixed-<sha>` in the audit log, but every corresponding workplan task still has an unchecked acceptance criterion saying the audit-log status must be flipped. Examples are lines 167-169, 184-186, 201-203, and the same pattern continues through line 271.

Because `findUncheckedTasksInOrder` treats any task block with a `- [ ]` checkbox as unchecked, these completed fix tasks still look unfinished to workplan consumers even though the audit log says they are fixed. That can make next-task pickup or live verification operate on stale fix tasks before the real remaining work. Mark those acceptance criteria checked wherever the audit-log status was flipped, or keep the audit-log status open until the workplan task is actually complete.

## 2026-05-30 — audit-barrage lift (20260530T183745619Z-scope-discovery)

### AUDIT-20260530-15 — Duplicated feature-root resolution across gate and lift is the structural root of the split-brain class — the diff patches both copies in lockstep instead of extracting one

Finding-ID: AUDIT-20260530-15 (claude-01 + claude-02 + codex-01 + codex-03; cross-model)
Status:     fixed-e27370c03edc8c0dc4d26b6234fff553953449cf
Severity:   high
Surface:    `plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-aware-gate.ts:112-120` (`findFeatureRoot`) and `plugins/dw-lifecycle/src/subcommands/audit-barrage-lift.ts:174-180` (`resolveFeatureRoot`)

The version-dir resolution logic exists as **two independent copies**. This diff changes both from `[...(await readdir(docsRoot))].sort()` to `[...(await readdir(docsRoot))].sort().reverse()` — byte-for-byte identical edits in two files, with identical comments. That is precisely the failure shape AUDIT-06 (split-brain) and AUDIT-08 (wrong-version pick) keep re-surfacing: the gate and the lift must agree on which `docs/<version>/.../<slug>` they resolve, and the only thing keeping them in agreement is a developer remembering to mirror every change across both functions.

The split-brain *class* of bug isn't closed by making the two copies currently identical — it's closed by making them the same function. The next maintainer who improves one walker (e.g. lands the semver-aware sort the comment promises) and forgets the other re-introduces exactly the cross-verb divergence AUDIT-06 named. The fix is to extract a single `resolveFeatureRoot(docsRoot, slug)` helper (returning the chosen dir + the list of candidate versions for the ambiguity check) and have both the gate and the lift call it. As long as the logic is duplicated, every future audit of this surface has to re-verify that both copies are in sync — a recurring tax the abstraction would eliminate.

### AUDIT-20260530-16 — Phase 15 workplan now mixes flat (`Task 6-12`) and hierarchical (`Task 5.2-5.7`) fix-task numbering, with the flat fix-tasks ordered physically before `Task 4` — the AUDIT-03 incoherence persists in shipped docs

Finding-ID: AUDIT-20260530-16
Status:     fixed-a4aa5db3491e41700b6117c7584c743ac0375709
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md:151-271`

In the workplan hunk, the round-2 fix-tasks for AUDIT-08…14 are numbered **flat** (`### Task 6` … `### Task 12`) and appear *physically above* `### Task 4: Skill-prose convention template` and the round-1 fix-tasks, which use **hierarchical** numbering (`### Task 5.2` … `### Task 5.7`). The resulting file order is `Task 6,7,8,9,10,11,12, 4, 5.2,5.3,5.4,5.5,5.6,5.7, 5` — non-monotonic and using two numbering conventions in the same `## Phase 15`. This is the exact symptom AUDIT-03 ("flat vs hierarchical numbering incoherence") named, and AUDIT-12 explicitly traced it to "round-2's auto-promote landing at the same Phase 5 anchor as round 1."

This diff only flips the checkboxes inside those task blocks (`[ ]→[x]`); it leaves the incoherent ordering and the mixed-convention numbering in place, so the broken workplan ships. The workplan-aware gate keys on *position order* rather than the printed numbers, so the gate itself still functions — the harm is operator legibility and the credibility of the "next N tasks" framing the whole phase rests on (a human reading `Task 12` before `Task 4` cannot trust the numbering to reflect work order). The convention-detection fix (AUDIT-03/AUDIT-12) evidently does not repair a workplan that *already* contains a mixed-convention region; either the existing fix-tasks should be renumbered into one monotonic scheme, or the auto-positioner should refuse to interleave a second numbering convention into a phase that already established one.

### AUDIT-20260530-17 — Workplan closure ticking is best-effort after the audit-log write, so AUDIT-14 can recur on any workplan write failure

Finding-ID: AUDIT-20260530-17
Status:     fixed-7f6b08496130d30dbec29ff9419afb078f88fbc2
Severity:   medium
Surface:    plugins/dw-lifecycle/src/subcommands/apply-audit-flips.ts:403-463

`runApplyAuditFlips` writes the audit-log status first, then separately tries to tick the matching workplan checkbox. If the workplan read/write fails, lines 456-463 only emit a warning and still return success, leaving the audit-log at `fixed-<sha>` while the workplan task remains unchecked.

That is the exact stale-state shape AUDIT-20260530-14 was fixing: `findUncheckedTasksInOrder` will continue to treat the completed fix task as unfinished. Since this command now owns both sides of the state transition, the workplan-side update should either be part of the required apply operation with a non-zero exit on failure, or the command should avoid flipping the audit-log when it cannot also update the corresponding workplan closure criterion.

## 2026-05-31 — audit-barrage lift (20260531T040245407Z-scope-discovery)

### AUDIT-20260531-01 — AUDIT-17 fix surfaces the split-state but its instructed recovery path is untested and may be unreachable

Finding-ID: AUDIT-20260531-01
Status:     fixed-bf0a5de3e82a1d17d65797e22b1533497d6081e3
Severity:   high
Surface:    `plugins/dw-lifecycle/src/subcommands/apply-audit-flips.ts:454-471`

The fix changes the workplan-write catch from "warn + continue" to "stderr + `return 1`", but it does **not** change the write ordering: the audit-log is still written *before* the workplan tick is attempted (the new error text concedes this — "The audit-log was already written; state is split"). So on a workplan-write failure the on-disk inconsistency AUDIT-14/AUDIT-17 named still physically exists; only the exit code changed. Worse, because this happens inside the per-finding loop, an early failure aborts the loop with *some* findings' audit-log entries flipped to `fixed-<sha>` and their workplan ticks never applied, and there is no rollback of the already-written audit-log.

The error message instructs the operator to "re-run apply-audit-flips to confirm the catchup is idempotent" — but whether a re-run actually re-applies the missing workplan ticks depends on unshown logic: does the command re-process an entry whose audit-log status is *already* `fixed-<sha>`, or does it skip it? If already-fixed entries are short-circuited (a common idempotency shape), the workplan checkbox is lost permanently and exit-1 just becomes a recurring failure with no path to green. AUDIT-17 explicitly offered two cures — hard-fail *or* "avoid flipping the audit-log when it cannot also update the workplan." The implementation took the first half (hard-fail) without the transactional ordering that would make the recovery deterministic. A fix should either write the workplan first (so an audit-log flip never lands without its tick) or add a test that drives failure → re-run → confirms the workplan tick lands on the second pass.

### AUDIT-20260531-02 — The new AUDIT-17 test asserts only the immediate error, not the split-state or the recovery contract it claims to handle

Finding-ID: AUDIT-20260531-02
Status:     fixed-bf0a5de3e82a1d17d65797e22b1533497d6081e3
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/apply-audit-flips-cli.test.ts:331-388`

The test named `'returns NON-ZERO exit when the workplan-side write fails (AUDIT-20260530-17)'` asserts exactly two things: `expect(exit).not.toBe(0)` and `expect(stderr.text()).toMatch(/workplan|synthetic/i)`. It never asserts the contract the fix's own error message promises. Specifically it does not verify (a) that the audit-log *was* in fact written before the failure (the "split state" the message tells the operator about — if it wasn't written, the message is misleading), nor (b) that a subsequent re-run actually completes the workplan tick (the recovery the message instructs). Per the project's testing rule — "tests that don't test the contract they claim to test" — this test pins the surface symptom (exit code) while leaving the load-bearing behavior (split-state + idempotent catchup) unverified.

This is the same shape as prior findings on this feature (AUDIT-09's vacuous determinism test, AUDIT-05's single-finding-only coverage): the test exercises the easy assertion and skips the one that would catch a real regression. A failure-then-re-run integration test against the resulting workplan would close both this gap and the recovery-path uncertainty in claude-01.

### AUDIT-20260531-03 — AUDIT-16 marked `fixed` while the physical task order it named remains non-monotonic, and the residual is deferred with a "follow-up if needed" IOU

Finding-ID: AUDIT-20260531-03 (claude-03 + codex-01 + codex-02; cross-model)
Status:     fixed-64d278abde25ed8a3d03e4ace4fa01113e1697dd
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (Task 5.9 block, the renumbered `Task 5.11..5.17` headings, and the new "Out of scope (deferred)" line)

AUDIT-16 gave two acceptable cures: renumber the fix-tasks into "one monotonic scheme," **or** make the auto-positioner refuse to interleave conventions. The diff did the renumber (`Task 6..12` → `Task 5.11..5.17`) so the numbering is now uniformly hierarchical — but the *file order* it produced is `5.11, 5.12, … 5.17, 4, 5.2, … 5.7, 5`, which is numerically jumbled: `5.11` now physically precedes `5.2`. That is not "monotonic"; arguably it reads worse than the pre-fix `Task 6` (at least `6 > 5` was locally increasing). AUDIT-16's core complaint — "a human reading `Task 12` before `Task 4` cannot trust the numbering to reflect work order" — is only half-resolved: a human now reads `5.11` before `5.2`.

The Task 5.9 block self-documents this gap (`Step 4: physical reorder NOT done`) and closes it with **"physical reorder is a follow-up if needed"** — a deferral phrase the project's "Just for now is bullshit" rule forbids unless paired with a GitHub issue, which isn't present. So AUDIT-16 is flipped to `fixed-a4aa5db` in the audit-log while the workplan simultaneously admits the named defect persists and is deferred without a tracking issue. Either complete the monotonic reorder, or file the follow-up as a GH issue and back-link it (per the rule), rather than leaving the deferral in the workplan prose with the audit-log claiming closure.

### AUDIT-20260531-04 — The extracted feature-root helper still ships the documented semver-incorrect sort behind a deferral comment, and no test exercises a lex-vs-semver divergence

Finding-ID: AUDIT-20260531-04
Status:     fixed-01a0a550246f3769ab782768bc9ce7aa1c025d5e
Severity:   low
Surface:    `plugins/dw-lifecycle/src/scope-discovery/util/feature-root.ts:18-22` (docblock) and `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts` (the `'multi-version'` and `'determinism'` cases)

The consolidation is correct in shape, but it carries forward the lex-descending sort with the comment "Not semver-correct (`0.10.0` < `0.9.0` in lex order), but a workable default until semver-aware sort lands." `until … lands` is a deferral phrase with no tracking issue. More concretely, the two version-selection tests only pin cases where lexicographic order and semver order *agree*: `['0.x','1.0','0.19.0'] → 1.0` and `['0.x','1.0','2.0','0.5.0'] → 2.0`. Neither test constructs the divergence case the docblock itself names — e.g. `['0.9.0','0.10.0']`, where lex-descending picks `0.9.0` and semver wants `0.10.0`. So the one piece of behavior the helper documents as *wrong* is the one piece no test exercises; a future "semver-aware sort" change would flip that selection with zero test coverage telling anyone the behavior changed (or pinning the current wrong-but-deterministic result). Add a divergence-case test that pins today's behavior explicitly, so the documented incorrectness is at least falsifiable.

### AUDIT-20260531-05 — Feature-root extraction stops one level short of DRY — both callers still independently construct `docsRoot = join(x, 'docs')`

Finding-ID: AUDIT-20260531-05
Status:     fixed-01a0a550246f3769ab782768bc9ce7aa1c025d5e
Severity:   low
Surface:    `plugins/dw-lifecycle/src/scope-discovery/util/feature-root.ts:53-55` (helper takes `docsRoot`), `plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-aware-gate.ts` (`const docsRoot = join(args.repoRoot, 'docs')`), `plugins/dw-lifecycle/src/subcommands/audit-barrage-lift.ts:181-183` (`const docsRoot = join(rootDir, 'docs')`)

AUDIT-15's framing was "close the *class* of bug, not the instance — divergence is impossible if the logic only lives in one place." The shared helper accepts `docsRoot` rather than `repoRoot`, which means each of the two callers still independently appends the literal `'docs'` path segment. That is a small residual of the exact split-brain shape the extraction set out to eliminate: if the docs-directory location ever becomes configurable (or the segment is renamed), both call sites must change in lockstep again — the same lockstep-edit tax AUDIT-06/08/12/15 kept paying. Having the helper take `repoRoot` (or a `{repoRoot}` arg) and own the `join(repoRoot, 'docs')` itself would put the *entire* resolution path — including the docs segment — in one place. Low severity because the segment is currently a stable literal, but it's worth noting that the consolidation centralized the walk while leaving its root-construction duplicated.

## 2026-05-31 — audit-barrage lift (20260531T041440932Z-scope-discovery)

### AUDIT-20260531-06 — AUDIT-BARRAGE-claude-01 — The AUDIT-04 "fix" reworded but KEPT the forbidden deferral phrase "until a semver-aware sort lands" with no tracking issue

Finding-ID: AUDIT-20260531-06 (claude-01 + claude-02 + claude-04 + claude-05 + claude-06 + codex-01 + codex-02 + codex-03; cross-model)
Status:     fixed-6763491c4452b94802b9244dc30d9849624e126c
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/scope-discovery/util/feature-root.ts:23-30` (the rewritten docblock)

AUDIT-20260531-04's literal complaint was: *"it carries forward the lex-descending sort with the comment 'a workable default **until semver-aware sort lands**' — `until … lands` is a deferral phrase with no tracking issue."* The fix (commit `01a0a55`, now marked `fixed-01a0a55`) rewrote the docblock but the replacement text reads: *"This is documented intentional behavior **until a semver-aware sort lands**; the regression test … pins the current contract."* The exact deferral phrase AUDIT-04 named survives the fix verbatim, and there is still no GitHub issue referenced for the deferred semver-aware sort.

Per this audit's own hard constraint ("If you spot a deferral phrase IN the diff, surface it as a finding") and the project's "Just for now is bullshit" rule (a deferral phrase is only permitted when paired with a tracking issue number it *references*), this docblock is non-compliant. The finding was flipped to `fixed-<sha>` while the precise defect it named still ships. The correct fix is either (a) drop "until a semver-aware sort lands" and state the lex-sort as a flat permanent decision, or (b) file a GitHub issue for semver-aware sorting and cite its number in the docblock.

### AUDIT-20260531-07 — AUDIT-BARRAGE-claude-03 — The AUDIT-01 "recovery" test pre-flips the workplan checkbox manually, masking whether the tool itself auto-recovers the missed tick — it asserts idempotency, not recovery

Finding-ID: AUDIT-20260531-07
Status:     fixed-6763491c4452b94802b9244dc30d9849624e126c
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/apply-audit-flips-cli.test.ts:397-490` (the `'recovers from a workplan write failure on re-run'` case)

AUDIT-01 asked for a test that "drives failure → re-run → **confirms the workplan tick lands on the second pass**." The AUDIT-14 fix established that `tickClosureCriteria` "runs unconditionally on every --apply (including for already-dispositioned entries) so prior runs' missed flips catch up." That means a plain re-run with a working writer — *without any manual intervention* — should itself flip the missed `- [ ]` to `- [x]`. That is the load-bearing recovery contract and the most valuable thing to verify.

Instead, the test performs `writeFileSync(workplanPath, wpManual, ...)` to manually flip the checkbox *before* the second run, then asserts the second run is a no-op (`toContain('- [x] Audit-log Status flipped to')`). Because the checkbox is already `[x]` when the tool re-runs, the test cannot distinguish "the tool recovered the tick" from "the operator recovered the tick and the tool did nothing." The one branch AUDIT-01 flagged as possibly unreachable (does the tool re-process an already-`fixed-<sha>` entry and flip the box?) is exactly the branch the manual pre-flip hides. This is the same vacuous-assertion shape as AUDIT-09's determinism test and AUDIT-02's own complaint. Fix: in the second run, do NOT pre-flip; assert the tool flips the still-`[ ]` checkbox to `[x]` on plain re-run.

## 2026-05-31 — audit-barrage lift (20260531T042521095Z-scope-discovery)

### AUDIT-20260531-08 — The AUDIT-06 deferral-phrase purge is incomplete — the equivalent phrase survives in the companion test file the fix's own docblock cross-references

Finding-ID: AUDIT-20260531-08
Status:     fixed-bb419606f90d1e481b074323328e8e90b63f217c
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts:108-117` (untouched by the diff); cross-referenced from `plugins/dw-lifecycle/src/scope-discovery/util/feature-root.ts:25-27`

AUDIT-06 was flipped to `fixed-6763491` for removing "until a semver-aware sort lands" from `feature-root.ts`. The commit message records the strictest cross-model agreement on this feature (claude×5 + codex×3) flagging that *rewording* a deferral phrase isn't a fix. The diff's new docblock (`feature-root.ts:23-30`) is clean — and it explicitly points the reader at the regression test `feature-root.test.ts > 'picks lex-greatest…'`. But that very test file, at lines 113-116, still reads: *"If a **future semver-aware sort lands**, this test must be updated in lockstep — the test's existence makes the divergence auditable rather than buried behind a deferral comment."*

This is materially the same deferral shape AUDIT-06 named (references the same hypothetical future semver-aware sort, with no tracking issue), one file over, in the artifact the fix cross-references. The purge was scoped to the `.ts` file and left its twin in the `.test.ts` file — the exact "patched one copy, left the other" pattern AUDIT-15 named for this feature. Under the strict canon the 8-voice round closed AUDIT-06 by, the finding is marked fixed while an equivalent phrase ships. Fix: either drop the "if a future semver-aware sort lands" clause from the test docblock (state the lex-greatest contract flatly), or, if the deferral is legitimate, file a GitHub issue for semver-aware sorting and cite its number in both docblocks.

---

### AUDIT-20260531-09 — Doc-prose closure of Task 5.23 will trip the `fix-task-tdd-discipline` doctor rule — its bare `feature-root.test.ts` token resolves to a nonexistent repo-root file

Finding-ID: AUDIT-20260531-09
Status:     fixed-bb419606f90d1e481b074323328e8e90b63f217c
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (Task 5.23 block) vs. `plugins/dw-lifecycle/src/scope-discovery/promote-findings/tdd-enforcement.ts:67-95`

Task 5.23 is marked `[x]` with Step 1 = *"this is a doc-prose finding (no code-side test)."* But its acceptance-criteria line embeds a bare token: *"Regression test `feature-root.test.ts > picks lex-greatest…`"*. `findCompletedFixFindingTasks` matches this task (its heading carries `fix-finding-AUDIT-20260531-06`), and `extractTestFilePath` scans the whole block. I ran the actual extraction against the live workplan:

```
backtick match: null   (the backticked group ends with " > picks…", not at the .test.ts boundary)
plain match:    feature-root.test.ts
resolve@repoRoot exists? false -> <repoRoot>/feature-root.test.ts
```

So `verifyFixTaskTDD` returns `missing-test-file`, and the `fix-task-tdd-discipline` doctor rule (which "walks every `[x]`-checked fix-finding task and flags violations") will report this completed task as a violation. Worse: if the `check-fix-task-tdd` commit-msg gate were enforced on this branch, the `Closes AUDIT-20260531-06` commit could not have landed (same `missing-test-file` extraction) — so either the gate was bypassed/unwired, or it's silently inconsistent with the doctor rule. The root cause is a design gap: the TDD-enforcement grammar has no sentinel for a *legitimately testless* doc-prose finding. Contrast Task 5.24, which cites a full resolvable path (`plugins/…/apply-audit-flips-cli.test.ts`) and passes. Fix: give doc-prose findings a recognized "no-code-test" shape the enforcement primitive treats as valid, OR avoid embedding any bare `*.test.ts` token in a testless task's body (the doctor rule will keep latching onto it).

---

### AUDIT-20260531-10 — AUDIT-06's fix has no automated regression guard — the cited "regression test" exercises sort behavior, not phrase presence

Finding-ID: AUDIT-20260531-10
Status:     fixed-bb419606f90d1e481b074323328e8e90b63f217c
Severity:   low
Surface:    `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (Task 5.23 acceptance criteria) + `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts:118-130`

Task 5.23's acceptance criterion claims the contract is pinned by *"Regression test `feature-root.test.ts > picks lex-greatest, NOT semver-greatest` still pins the contract."* But that test asserts only the *sort outcome* (`['0.9.0','0.10.0'] → 0.9.0`) — which the AUDIT-06 fix did not touch. Nothing in the suite asserts the *absence of a forbidden deferral phrase* in the docblock. If someone re-adds "until X lands" / "for now" to `feature-root.ts`, no test fails; the sort test stays green. The acceptance criterion "No forbidden-deferral phrase in `feature-root.ts`" is a manual claim, not a check.

This is the same vacuous-coverage shape prior rounds named (AUDIT-09's vacuous determinism test, AUDIT-02's surface-symptom-only assertion) and is the structural reason the twin phrase in claude-01 went unnoticed: there is no scanner over committed source for the project's forbidden-deferral canon (the dispatch-wrapper only screens live *agent output*, not files on disk). A reasonable fix is a small doctor rule / unit test that greps the scope-discovery source tree for the banned-phrase canon and fails on a hit — which would close claude-01 and claude-03 together and make "No forbidden-deferral phrase" falsifiable rather than asserted.

## 2026-05-31 — audit-barrage lift (20260531T043555454Z-scope-discovery)

### AUDIT-20260531-11 — Fix-tasks 5.25 and 5.26 reintroduce the exact bare-`*.test.ts` token that AUDIT-09 was closing — they will re-trip the `fix-task-tdd-discipline` doctor rule

Finding-ID: AUDIT-20260531-11
Status:     fixed-9e50b27c00c949dcd14fbb660ad7f87679017b18
Severity:   high
Surface:    `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (Task 5.25 acceptance criteria + Task 5.26 acceptance criteria, added in this diff) vs. `plugins/dw-lifecycle/src/scope-discovery/promote-findings/tdd-enforcement.ts:67-95`

This diff closes AUDIT-20260531-09 (bare `feature-root.test.ts` tokens trip the doctor rule because they resolve to a nonexistent repo-root file) — yet the *sibling tasks added in the same hunk* re-introduce the defect:

- Task 5.25 (heading `fix-finding-AUDIT-20260531-08`, all `[x]`) carries the acceptance line: ``- [x] No forbidden-deferral phrase in `feature-root.test.ts`.`` The backtick group ends cleanly at `.test.ts`, so per AUDIT-09's own documented extraction behavior the backtick matcher captures the bare basename. Its Surface line's full path is disqualified by the `:108-117` suffix (exactly the null-backtick case AUDIT-09 proved), so the bare token wins → `missing-test-file`.
- Task 5.26 (heading `fix-finding-AUDIT-20260531-09`, all `[x]`) is self-contradicting: its acceptance criterion ``- [x] No bare `feature-root.test.ts` token in workplan task bodies (all references now use full paths).`` *is itself a bare `feature-root.test.ts` token*. Its only other `.test.ts` reference (Step 3) ends with ` > picks lex-greatest…`, the same boundary-failure shape AUDIT-09 cited for Task 5.23 — so no clean full-path competitor exists, and the bare token in the acceptance line is captured.

Both tasks are `[x]`-checked, so `findCompletedFixFindingTasks` matches them and `extractTestFilePath` scans their blocks. The result is the same `missing-test-file` the doctor rule flags. Contrast Task 5.27, which cites the full resolvable path with no line-suffix and passes. The fix for AUDIT-09 ("use full paths") was applied to Task 5.23 but not propagated to the new tasks created alongside it. Cure: rewrite every `.test.ts` reference in 5.25/5.26 task bodies as a full repo-relative path with no `:line` suffix and no trailing ` > …`, OR give doc-prose/testless findings a recognized sentinel the enforcement primitive treats as valid (the design gap AUDIT-09 already named).

### AUDIT-20260531-12 — The AUDIT-10 regression guard scans a single file, not the source tree — it does not close the class of bug it was built for

Finding-ID: AUDIT-20260531-12
Status:     acknowledged-slush-pile-2026-05-31
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts:159-199` (the new `feature-root source file contains NO forbidden-deferral phrases` test)

AUDIT-10's recommended cure was "a small doctor rule / unit test that greps the scope-discovery **source tree** … which would close claude-01 and claude-03 together." The implemented guard reads exactly one file (`scope-discovery/util/feature-root.ts`) and a hardcoded *subset* of `FORBIDDEN_DEFERRAL_PHRASES`. Two consequences:

1. **It cannot catch the AUDIT-08 twin-file shape.** AUDIT-08's whole point was that the phrase survived in `feature-root.test.ts` (a sibling file). The new guard explicitly excludes test files (and any file other than `feature-root.ts`), so a forbidden phrase creeping back into the test docblock — the precise regression AUDIT-08 documented — remains unguarded. The "patched one copy, left the other" pattern (AUDIT-15) is structurally preserved, not closed.
2. **The subset drifts from canonical.** The comment concedes it's "a subset of FORBIDDEN_DEFERRAL_PHRASES … if the canonical list grows, this test can be migrated to import it directly." Any phrase in the canonical list but absent from this local copy is silently unguarded, and the two will drift the moment the canonical list changes.

A fix that matched AUDIT-10's framing would walk the `scope-discovery/` tree (excluding the test file holding the data array) and import the canonical phrase set rather than copying a subset.

### AUDIT-20260531-13 — `until.*lands` / `until.*ships` regexes have a multi-line blind spot — a line-wrapped deferral phrase (the exact form AUDIT-08 cited) evades the guard

Finding-ID: AUDIT-20260531-13
Status:     acknowledged-slush-pile-2026-05-31
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts` (the `forbiddenPhrases` array — `'until.*lands'`, `'until.*ships'`)

The phrases are compiled with `new RegExp(phrase, 'i')` — case-insensitive only, no dotall/`s` flag. In a regex, `.` does not match newlines, so `until.*lands` only matches when "until" and "lands" land on the *same physical line*. But the deferral phrase AUDIT-08 named was wrapped across docblock lines (`* future\n * semver-aware sort lands`), and docblock comments line-wrap routinely. So the guard fails exactly where the original regression occurred: a phrase split across two `*`-prefixed comment lines passes the check silently. This is a false-negative blind spot in the very guard meant to make the contract falsifiable. Cure: normalize comment whitespace (strip `*`-prefixes and collapse newlines to spaces) before matching, or use `[\s\S]*?` with bounded distance instead of `.*`, and add the `s` flag.

### AUDIT-20260531-14 — The guard test's own comment is a deferral/IOU shape — "this test can be migrated to import it directly" — inside the enforcer

Finding-ID: AUDIT-20260531-14
Status:     acknowledged-slush-pile-2026-05-31
Severity:   low
Surface:    `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts` (the docblock above the new test: "if the canonical list grows, this test **can be migrated to import it directly**")

The project's "Just for now is bullshit" rule forbids IOU comments that promise future work without a tracking issue. The new test's docblock contains exactly that shape: it documents that the phrase list is a copied subset and that it *can be migrated* to import the canonical list later — with no GitHub issue referenced. It is the same deferral pattern the test enforces against, embedded in the enforcer. Worth noting that the new single-file guard would never catch this (it scans only `feature-root.ts`), so this IOU ships unguarded. Cure: either import the canonical list now, or file an issue and cite its number in the comment.

### AUDIT-20260531-15 — Inconsistent concat-splitting leaves literal forbidden-phrase fragments in the test file, undermining the comment's stated self-trigger defense

Finding-ID: AUDIT-20260531-15
Status:     acknowledged-slush-pile-2026-05-31
Severity:   low
Surface:    `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts` (the `forbiddenPhrases` array)

The comment states the phrases are "assembled via concat so the test file's data array doesn't trigger an accidental self-scan if a future change widens the scope to include test files." But the splitting is applied inconsistently: `'for ' + 'now'`, `'will fix ' + 'later'`, `'follow-up if ' + 'needed'`, etc. are split, while `'until.*lands'`, `'until.*ships'`, and `'deferred to v'` are stored as plain literals. So the file now contains the literal fragment `deferred to v` (and the `until…lands/ships` regex literals) verbatim. If the scan is ever widened to test files as the comment anticipates, this file self-trips on the un-split entries — defeating the exact defense the comment claims. The defensive measure should be applied uniformly to every entry, or dropped in favor of importing the canonical list (which would localize the literals to one canonical source). Low severity because nothing scans this file today, but it's a claim that doesn't match the implementation.

---

Summary: the new regression guard is a step in the right direction but is scoped too narrowly to close the class AUDIT-08/09/10 named (claude-02, claude-03), and — most importantly — the diff's own new fix-tasks 5.25/5.26 re-introduce the bare-`*.test.ts` token that re-trips the doctor rule AUDIT-09 was fixing (claude-01, high). I'd treat claude-01 as the blocking-adjacent item: it means the `fixed-<sha>` flips on AUDIT-08/09 ship alongside workplan tasks the project's own doctor rule will flag as violations.

## 2026-05-31 — audit-barrage lift (20260601T014150238Z-scope-discovery)

Fired against the Phase 17 substantive diff (775fd2a..f5981de — 4 commits: docs scope + failing test + Tasks 2-4 + Tasks 5-6). claude + gemini outputs empty (subscription/auth issues); codex emitted 4 findings. All 4 are real bugs that must be addressed before v0.31.0 ships.

### AUDIT-20260531-16 — Pre-push gate checks the wrong SHA (inverted parent-vs-self direction)

Finding-ID: AUDIT-20260531-16
Status:     fixed-94756787408f4fecd0b28f35b6a4cd5deff425be
Severity:   blocking
Surface:    `plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-implement-hook-coverage.ts:78-91`

The pre-push gate marks a commit as covered when the log contains the commit's `parentSha`. But the hook runs AFTER each commit and writes the current HEAD (= the just-landed commit's SHA) as `tip`. The log entry proving commit A was audited is `tip=A`, not `tip=<parent of A>`. The current implementation enforces "hook ran BEFORE this commit," the opposite of the Phase 17 contract ("hook MUST fire between every pair of task-completion commits — specifically AFTER each commit lands"). Tests at `check-implement-hook-coverage.test.ts:51-62` encode the same inverted model, so they pass while protecting the wrong behavior.

Fix: require `tipsSeen.has(commit.sha)` for each unpushed commit. Update fixtures to expect log tips that match the commits themselves.

### AUDIT-20260531-17 — `allow-no-prior-run` declared but never returned; opted-in fresh project deadlocks

Finding-ID: AUDIT-20260531-17
Status:     fixed-94756787408f4fecd0b28f35b6a4cd5deff425be
Severity:   high
Surface:    `plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-implement-hook-ran.ts:42-83`

The result union declares `allow-no-prior-run`, and the workplan explicitly requires *"first commit after `.dw-lifecycle/scope-discovery/` opt-in … gate allows,"* but `checkImplementHookRan` never returns that state. Once opted in, `marker === null` always becomes `refuse-marker-missing`. Test scenario D at `check-implement-hook-ran.test.ts:105-123` covers the not-opted-in branch, not the boot case the workplan specifies. Fresh-install deadlock: a project that just adds `.dw-lifecycle/scope-discovery/` cannot commit at all until they run `implement-hook` — but `implement-hook` may itself need a commit context to audit.

Fix: when marker is missing AND the hook-run-log is empty, return `allow-no-prior-run` (boot case). Distinguish "no hook has ever run" (boot) from "marker was deleted" (refuse) via the log's emptiness.

### AUDIT-20260531-18 — Marker write failures swallowed; exit-0 returned without the marker

Finding-ID: AUDIT-20260531-18
Status:     fixed-94756787408f4fecd0b28f35b6a4cd5deff425be
Severity:   high
Surface:    `plugins/dw-lifecycle/src/subcommands/implement-hook.ts` writeMarkerSafe + callers

`writeMarkerSafe` catches marker + log-append failures, writes a stderr warning, returns `void`. Callers continue, returning exit 0 on success/skip/outage paths. Violates the contract that every exit-0 path writes `last-hook-run.json` AND appends `hook-run-log.jsonl`. A successful-looking run can leave no persisted state, causing the commit-msg gate to refuse the next commit (or pre-push to fail) while the CLI reported success. Worse: silent persistence failure = invisible Phase-17-teeth bypass.

Fix: make marker write failure surface non-zero. Either bubble the error (return 1) or thread the failure through to the caller so exit code matches actual persistence state.

### AUDIT-20260531-19 — SKILL.md claims hooks are wired but the actual wiring is missing from the diff

Finding-ID: AUDIT-20260531-19
Status:     fixed-94756787408f4fecd0b28f35b6a4cd5deff425be
Severity:   high
Surface:    Missing surface: project `commit-msg` / `pre-push` hook wiring

The workplan and SKILL.md both state `check-implement-hook-ran` is *"wired into the project's commit-msg hook chain"* and `check-implement-hook-coverage` is *"wired into the pre-push hook."* The diff adds the CLI subcommands but no corresponding hook-script changes. Without actual hook installation, Phase 17 ships the verbs but not the mechanized enforcement — the entire teeth premise is unwired. The agent could keep skipping the hook and nothing would refuse.

Fix: update `install-scope-discovery-hooks` (or sibling installer) to emit `commit-msg` and `pre-push` hook entries that invoke the two gates. Mirror the pattern `check-fix-task-tdd-discipline` uses. Tests or fixtures should prove both commands actually get called.

## 2026-05-31 — audit-barrage retro-lift (Phase 16 dogfood, run 20260601T020147844Z)

Fired against the v0.29.3..v0.30.0 range (Phase 16 substantive work) per operator directive — the original Phase 16 ship missed its own barrage. claude + codex produced findings; gemini emitted no output. Cross-model agreement on the most serious finding (claude-01 + codex-01) was already inadvertently closed by Phase 17's wrapper verb. The remaining cross-model agreement (claude-03 + codex-02) on tip.sha timing was a real bug; fixed in this commit.

### AUDIT-20260531-20 — Step 6 bash composition collapses exit-1 (skip) and exit-2 (config error) — cross-model claude-01 + codex-01

Finding-ID: AUDIT-20260531-20
Status:     verified-2026-05-31
Severity:   high
Surface:    `plugins/dw-lifecycle/skills/implement/SKILL.md` Phase-16 Step 6 bash (since replaced by `dw-lifecycle implement-hook` verb in Phase 17)

The Phase 16 Step 6 bash composition used `if ! dw-lifecycle check-barrage-tip; then skip; else fire`. In bash `!` is true for any non-zero, so exit-1 (legitimate "no new diff") and exit-2 (config error) both fell into the skip branch — directly contradicting the SKILL.md failure-path policy that said exit-2 must STOP. Re-creates the silent-skip failure mode #383 was named to close.

Inadvertently closed by Phase 17 Task 3 (`implement-hook` wrapper verb): the wrapper explicitly checks `tipCheck.status === 2` (exit 2 → STOP/return 2) vs `tipCheck.status === 1` (exit 1 → write marker, return 0). The bash composition this finding describes was deleted from SKILL.md by Phase 17 Task 6 and replaced with the single-verb invocation that calls the wrapper. **Verified-2026-05-31 because the failing bash no longer exists in shipped code.**

### AUDIT-20260531-21 — tip.sha written before barrage success; outage runs falsely claim coverage — cross-model claude-03 + codex-02

Finding-ID: AUDIT-20260531-21
Status:     fixed-b0e9a93bec534b2ccc021cb0bda9049b64d9c5dd
Severity:   high
Surface:    `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/orchestrate-barrage.ts` (Phase 16 Task 2 implementation)

`orchestrateBarrage` wrote `<runDir>/tip.sha` immediately after `createRunDir`, BEFORE the LLM CLIs spawned. If every model subsequently failed (zero-byte outputs), the run was an outage per the failure-path policy — but the tip.sha was already written. The next iteration's `check-barrage-tip` saw tip.sha matching HEAD and skipped. Result: the audit-coverage hole #383 was meant to close was re-created for the all-models-failed path.

Additionally (claude-03 angle): the `writeFile` was unwrapped — a filesystem failure (disk full, race) would throw an uncaught exception ABOVE the model-spawn block, aborting the entire barrage with zero captured output. Strictly worse than the documented fail-safe contract.

Fix: capture HEAD at fire-time (preserves the "audited up through X" semantic if commits land during the ~60s barrage) but write tip.sha at completion-time, ONLY when at least one model produced output. Wrap the write in try/catch — write failure degrades to "no tip recorded" → next iteration fail-safes to fire. Three regression tests pin the contract (outage skips tip.sha write; partial outage writes; null resolver skips).

### AUDIT-20260531-22 — Audit diff range decoupled from tip-tracking range — claude-02

Finding-ID: AUDIT-20260531-22
Status:     acknowledged-fixed-by-phase-17-wrapper
Severity:   medium
Surface:    `plugins/dw-lifecycle/skills/implement/SKILL.md` Phase-16 Step 6 (since replaced by `implement-hook` wrapper)

`checkBarrageTip` computes `lastTipSha` but Phase 16's bash never plumbed it to the `diff` var in the prompt. The agent could compute the diff over a different range than the guard checked, silently auditing fewer commits than the guard "knew" were new.

Inadvertently closed by Phase 17's wrapper verb. `runImplementHook` calls `readLatestBarrageTip()` (same lookup as `check-barrage-tip`) and computes `git diff <tip>..<head>` using that range — the audited range and the guarded range are now bound together at the wrapper level. Direct invocation of `audit-barrage` outside the wrapper could still diverge, but the SKILL.md no longer documents that path; operators are directed to use `implement-hook`. **Acknowledged-fixed-by-phase-17-wrapper.**

### AUDIT-20260531-23 — `defaultListRunDirs` swallows all readdir errors — codex-03

Finding-ID: AUDIT-20260531-23
Status:     fixed-46aec320dc31371e16b4ab687850f044bb39fb9c
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/subcommands/check-barrage-tip.ts:108-117`

`defaultListRunDirs` returns `[]` on any readdir failure (ENOENT, EACCES, malformed scaffold). A missing `.dw-lifecycle/scope-discovery/audit-runs/` directory is treated identically to an empty one — both fail-safe to "no prior runs" → fire. That contradicts the documented failure-path policy ("missing audit-runs dir is a config error and should STOP"). The CLI should distinguish ENOENT from a present-but-empty directory; the former should propagate as exit-2 config error.

### AUDIT-20260531-24 — Phase 16 Step 6 bash doesn't enforce STOP policy for disposition failures — claude-06

Finding-ID: AUDIT-20260531-24
Status:     verified-2026-05-31
Severity:   low
Surface:    `plugins/dw-lifecycle/skills/implement/SKILL.md` Phase-16 Step 6 (since replaced)

The Phase 16 bash had no `set -e` or per-command `||` exit-trapping, so `slush-remaining --apply` failure would fall through to `check-open-findings` instead of stopping. Documented policy said STOP, bash didn't encode it. Same shape as claude-01: structural mechanization undermined by unstructured shell.

Inadvertently closed by Phase 17 wrapper: each `invokeDwl` returns `{stdout, stderr, status}` and the wrapper explicitly checks `status !== 0` on every step, returning exit 1 on any failure. The bash composition this finding describes was deleted. **Verified-2026-05-31.**

### AUDIT-20260531-25 — `check-barrage-tip` CLI has no shim-level tests — claude-04

Finding-ID: AUDIT-20260531-25
Status:     fixed-46aec320dc31371e16b4ab687850f044bb39fb9c
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/subcommands/check-barrage-tip.ts` (no matching `__tests__/.../check-barrage-tip-cli.test.ts`)

The Phase 16 Task 3 AC `[x] CLI exit codes match the contract` is marked complete but only the pure-fn library has tests. The CLI shim's `parseFlags` (unknown-flag rejection, `--feature` requires-value, help short-circuit), the `featureRoot === undefined` → exit-2 path, and the `defaultGitRevListCount`'s MAX_SAFE_INTEGER fail-safe are untested. Per the project's TDD discipline + "TDD spec tests have systematic blind spots" memory, an `[x]`-checked AC asserting exit-code behavior with no exit-code test is an over-claim.

Tracking for v0.32.x: add `check-barrage-tip-cli.test.ts` mirroring the `check-barrage-dampener` CLI test pattern. Lower-priority because the library logic IS tested + the bash composition this CLI feeds has been replaced by the typed wrapper.

### AUDIT-20260531-26 — Lexical-sort "most recent run-dir" depends on an unstated naming contract — claude-07

Finding-ID: AUDIT-20260531-26
Status:     fixed-46aec320dc31371e16b4ab687850f044bb39fb9c
Severity:   informational
Surface:    `plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-barrage-tip.ts` (sortedRunDirs lexical sort)

`checkBarrageTip` relies on `[...runDirs].sort()` picking the chronologically-latest run, which only holds if `createRunDir`'s naming uses fixed-width lexically-monotonic timestamps. The naming function is in a separate file (not exercised by current tests). If a future contributor changes the naming to epoch-millis without padding or a locale date format, "most recent" silently picks the wrong dir.

Tracking for v0.32.x: add a test that constructs run-dirs with the *actual* `generateRunDirName` output (not hand-written `2026-05-31-1200-feat` literals) to pin the naming contract.

### AUDIT-20260531-27 — clones.yaml ignore-with-justification reasons inaccurate — claude-05

Finding-ID: AUDIT-20260531-27
Status:     fixed-46aec320dc31371e16b4ab687850f044bb39fb9c
Severity:   low
Surface:    `.dw-lifecycle/scope-discovery/clones.yaml` (groups `f645890d8e9b`, `d2600be96980`, `7cf22ee0c611`, `961b07c6d120`, `e23bc58de99e`)

Phase 16's bulk-disposition of CLI-shim clones used a copy-pasted reason naming "check-barrage-dampener / slush-remaining" specifically — but several groups pair check-barrage-tip with check-open-findings or re-audit-fixed-findings, not the named siblings. The reason claim doesn't match the implementation; same shape as AUDIT-15. Tracking for cleanup: either tailor each reason to its actual members or use a general rule statement.

## 2026-06-01 — audit-barrage lift (20260601T022303926Z-scope-discovery)

### AUDIT-20260601-01 — The actual AUDIT-23 "runner maps to exit-2" behavior has no test

Finding-ID: AUDIT-20260601-01 (claude-01 + claude-02 + claude-03 + codex-01 + codex-02; cross-model)
Status:     fixed-a1324a32f507e15984eafd7aea13a1139982798e
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/subcommands/check-barrage-tip.ts` (new try/catch in `runCheckBarrageTip`, ~lines 187-203) + `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-barrage-tip-cli.test.ts` (the three `runCheckBarrageTip` tests)

The stated AUDIT-23 fix is two-part: (a) `defaultListRunDirs` re-throws non-ENOENT, and (b) "Runner catches and maps to exit-2" (workplan Task 5.34 Step 3). Part (b) is the *new catch block* added to `runCheckBarrageTip` that writes the scaffold-error line and `return 2`. That branch is **uncovered**. The `defaultListRunDirs` EACCES test calls the unit directly; it never goes through `runCheckBarrageTip`. The three `runCheckBarrageTip` tests inject only non-throwing stubs (`listRunDirs: async () => []` and `=> fullPaths`). The one test that asserts exit 2 ("does not resolve to a feature root") exercises the *resolveFeatureRoot* path that fires **before** the try block — not the new catch.

So the regression this fix is supposed to prevent (a permission error reaching the runner and being surfaced as exit-2 rather than silently masked as "no prior runs") has no test that would fail if the catch were deleted. A test injecting `listRunDirs: async () => { throw Object.assign(new Error('denied'), {code:'EACCES'}); }` into `runCheckBarrageTip` and asserting `exit === 2` + the stderr message would close the gap. This matters because AUDIT-25 in the same diff is specifically about "CLI exit codes match the contract with no tests exercising the shim" — and the headline exit-code path of the sibling fix is exactly the one left untested.

### AUDIT-20260601-02 — Task 5.37 (AUDIT-27) is an `[x]`-checked fix-finding task with no test, under a `Closes AUDIT-27` commit

Finding-ID: AUDIT-20260601-02
Status:     open
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (Task 5.37, AC block) vs. commit 46aec320 (`Closes AUDIT-…27`) and the `fix-task-tdd-discipline` doctor rule

Task 5.37 is tagged `(fix-finding-AUDIT-20260531-27)`, is fully `[x]`-checked, and its acceptance criteria read:

```
- [x] Failing test exists at `(no test — resolved by baseline refresh; documented above)`
- [x] `npx vitest run` 2558/2558 green (no test required; nothing to assert)
```

Per the project's own machinery (`.claude/rules/agent-discipline.md` → "Audit findings: scope-don't-defer + TDD enforcement"), `check-fix-task-tdd` "refuses `Closes AUDIT-<id>` commits where the cited workplan task block's test file is missing, empty, or whose vitest exits non-zero," and the `fix-task-tdd-discipline` doctor rule "walks every `[x]`-checked fix-finding task across every feature and flags violations." Task 5.37 has no test file — its cited path is the literal string `(no test — resolved by baseline refresh; documented above)`. So this `[x]`-checked fix-finding task with a `Closes` commit should be flagged by the doctor rule (and arguably should have blocked the commit). Either the gate has a hole for clones.yaml/docs-class findings that it silently passes, or the gate was bypassed.

The same template-vs-finding mismatch weakens 5.35/5.36: "Failing test exists … (passes against the fix)" is self-contradictory for a coverage-gap (5.35) or pin-only (5.36) finding where no bug existed and nothing ever failed. The fix-finding task template assumes every finding is a bug-with-failing-test; AUDIT-25/26/27 are not. The template should grow an explicit non-bug disposition, or these findings shouldn't be forced through the fix-task shape — otherwise the AC checkboxes assert something untrue.

### AUDIT-20260601-03 — AUDIT-27 `fixed-<sha>` cites a commit that doesn't touch the named clone groups

Finding-ID: AUDIT-20260601-03
Status:     open
Severity:   low
Surface:    `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` (AUDIT-20260531-27 → `fixed-46aec320…`) vs. the `.dw-lifecycle/scope-discovery/clones.yaml` hunk in this diff

AUDIT-27 is flipped to `fixed-46aec320dc…`, and that commit's subject claims to close it. But the clones.yaml change in *this* diff is only a `generated_at` bump plus two line-range edits for `check-barrage-tip.ts` members — none of the cited groups (`f645890d8e9b`, `d2600be96980`, `7cf22ee0c611`, `961b07c6d120`, `e23bc58de99e`) are removed or re-worded here. Task 5.37 itself states the resolution was "a baseline refresh during Phase 17 work" — i.e., a *different* commit. So the `fixed-<sha>` provenance points at 46aec320, which is not the commit that actually made the cited groups disappear.

This is the mechanical-flip limitation: `apply-audit-flips` keys on the `Closes` trailer, so attaching `Closes AUDIT-27` to 46aec320 produces a provenance pointer that won't lead a future reader to the change that resolved it. Mildly ironic given AUDIT-27's own shape was "claim doesn't match implementation." Lowest-cost fix: cite the actual baseline-refresh SHA in the audit-log entry, or note in the entry that the resolution predates the close commit.

### AUDIT-20260601-04 — Test comments overclaim what the timestamps exercise

Finding-ID: AUDIT-20260601-04
Status:     fixed-a1324a32f507e15984eafd7aea13a1139982798e
Severity:   low
Surface:    `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-barrage-tip.test.ts` (the AUDIT-26 lexical-sort test)

The comment says the timestamps "exercise … day/hour/minute boundaries" and labels `t4` (`2026-12-31T23:59:59.999Z`) as a "year boundary." Neither holds: the four values cross a day boundary (t1→t2) and a millisecond boundary (t2→t3), but never an hour or minute boundary, and there is no 2027 date so `t4` is simply the latest moment in 2026, not a year boundary. The inline note "highest year > later months" is incoherent (all four are 2026).

The test is a reasonable monotonicity pin, but it only proves the property for these four points under the *current* `generateRunDirName` format. It would not catch a regression that breaks lexical ordering specifically at an hour/minute rollover or across an actual year change, despite the comment asserting those are covered. Either add a `2027-…` timestamp (real year boundary) and an hour/minute-crossing pair, or correct the comment to describe what is actually tested. Comment-vs-code drift here is exactly the "test that doesn't test the contract it claims" smell.

### AUDIT-20260601-05 — Task 5.33 documents fix-landed-before-scoped (retroactive back-fill)

Finding-ID: AUDIT-20260601-05
Status:     open
Severity:   informational
Surface:    `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (Task 5.33 Step 5)

Task 5.33 Step 5 states the AUDIT-21 fix "landed BEFORE the workplan task was scoped (out-of-band TDD-first; tests + fix in same commit)." This is an honest note, but it records the reverse of the discipline the triad in `agent-discipline.md` is built to enforce: scope into the workplan *first*, then implement TDD-first, with `check-open-findings` refusing pickup while a finding is open. Here the commit shipped and the task block was back-filled afterward to match. TDD held *within* the commit (test + fix together), but the scope-first ordering did not.

Surfacing this as a process signal, not a code defect: when a fix is genuinely out-of-band, the audit trail ends up looking like the task block was reverse-engineered from the commit. If that's acceptable for hot fixes, fine — but it's worth the operator deciding explicitly, because the same pattern at scale erodes the "the workplan drives the implementation loop" invariant the closure triad depends on.

## 2026-06-01 — audit-barrage lift (20260601T024117392Z-scope-discovery)

### AUDIT-20260601-06 — Pre-push coverage gate fails OPEN on an empty hook-run-log — defeats its own acceptance criterion and is re-triggerable by log loss

Finding-ID: AUDIT-20260601-06 (claude-01 + codex-01; cross-model)
Status:     fixed-47e326480531076a1cad74829311e43e3b40ef2d
Severity:   blocking
Surface:    `plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-implement-hook-coverage.ts` (new `if (log.length === 0) return { kind: 'allow-no-prior-run' }` block, immediately after `const log = await args.readLog();`)

This diff adds a boot case to the **pre-push** coverage gate: when the hook-run-log is empty, *every* unpushed commit is allowed through (`allow-no-prior-run`), regardless of count. That directly contradicts this feature's stated acceptance criteria — *"Pre-push refuses when any unpushed commit lacks a corresponding hook-run entry"* and *"The refusal lists which commits are unbacked."* For the empty-log case, no commit is refused and nothing is listed. The renamed test (`...AFTER first hook run`, now seeding `logTips: ['some-prior-tip']`) confirms the refusal path is only reachable once the log is non-empty.

Two concrete failure modes follow. (a) **`--no-verify` bypass window:** the pre-push gate was specifically designed to catch commits made with `--no-verify` (which skip the commit-msg gate, so they never append a log entry). On a fresh project the log is empty, so a batch of `--no-verify` commits — the exact thing the gate exists to catch — sails through. The first feature's worth of commits is unguarded. (b) **Re-triggerable fail-open:** because the trigger is purely `log.length === 0`, deleting or truncating `.dw-lifecycle/.../hook-run-log` (an errant `git clean`, a `.dw-lifecycle` reset, or the agent itself) silently reverts the gate to a no-op on the next push. Phase 17's premise is *"no opt-out … the strictness IS the discipline"* and *"the agent should have no discretion"*; a deletable fail-open path is exactly a discretion path.

Note this boot case is also **looser than its sibling**: the commit-msg gate's `allow-no-prior-run` (AUDIT-17 fix) requires *both* marker-missing *and* log-empty, and concerns a single commit; this coverage-gate version triggers on log-empty alone and waves through *all* unpushed commits. A more robust design would gate on a one-time bootstrap sentinel (written by the first successful `implement-hook` run) rather than on log emptiness, so that an emptied log can't re-open the gate and a `--no-verify`-only fresh project still gets caught. At minimum this should be an explicit operator decision recorded in the workplan, because it weakens the AC the task is checked off against.

### AUDIT-20260601-07 — New runner catch block in `check-barrage-tip.ts` introduces an untyped `let` and `as` casts against the project's strict-typing rules

Finding-ID: AUDIT-20260601-07
Status:     fixed-47e326480531076a1cad74829311e43e3b40ef2d
Severity:   low
Surface:    `plugins/dw-lifecycle/src/subcommands/check-barrage-tip.ts` (`runCheckBarrageTip` — `let result;` declaration ~line 187 + `const errno = err as NodeJS.ErrnoException;` in the new catch ~line 200; also the matching `err as NodeJS.ErrnoException` in `defaultListRunDirs`)

The AUDIT-23 fix replaced `const result = await checkBarrageTip(...)` with a bare `let result;` declared above a try/catch and assigned inside the try. `let result;` with no annotation is an evolving-`any` binding — tsc won't flag it, but it sidesteps the project's *"Never bypass typing — No `any`"* rule by leaving the result implicitly typed where it was previously a typed `const`. The new catch block also adds `const errno = err as NodeJS.ErrnoException;`, a net-new `as Type` cast in shipped code despite the explicit *"no `as Type`"* guideline.

Neither is a runtime bug — the message interpolation (`errno.code ?? 'unknown'`, `errno.message ?? err`) is null-safe for non-Error throws. But the cleaner shapes are available and worth using since this region is being touched: hoist the typed result via `let result: CheckBarrageTipResult` (or wrap the call in an IIFE that returns the typed value), and replace the `as` casts with a small `isErrno(err): err is NodeJS.ErrnoException` type guard shared by `defaultListRunDirs` and the runner (both now narrow `unknown` to `ErrnoException` by assertion). Folding both call sites onto one guard also removes the duplicated cast pattern the clones.yaml baseline is already tracking in this file.

For the operator's signal: I checked the `orchestrate-barrage.ts` deferred-write logic (the `anyModelEmitted = stdoutBytes > 0 && spawnError === undefined` guard fails *safe* — an outage or partial-crash run omits `tip.sha` and the next iteration re-fires, which is the correct direction), the two new orchestrate-barrage tests (distinct model names, per-test `tmp`, assertions match the contract), the lexical-sort test (now pinned to real `generateRunDirName` output across a genuine 2026→2027 boundary, closing AUDIT-04's comment-drift), and the `summarize` switch (the new `allow-no-prior-run` case is wired into the allow group, so no fall-through). Those are clean. The two findings above are the only net-new concerns I'd put in front of you.

### AUDIT-20260601-08 — Outage detection treats stderr-only model output as no audit coverage

Finding-ID: AUDIT-20260601-08
Status:     acknowledged-pushback-by-design-shared-isModelRunHealthy-2026-06-01
Severity:   high
Surface:    `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/orchestrate-barrage.ts:106-124`

The new `tip.sha` write is gated on `results.some((r) => r.stdoutBytes > 0 && r.spawnError === undefined)`. That assumes audit coverage exists only when a model emits positive-byte stdout. If a CLI emits its findings or useful failure text to stderr with exit 0, or exits nonzero after producing output the operator still lifts, this code suppresses `tip.sha` and causes the next iteration to re-audit the same range indefinitely.

The finding being fixed was about all-model outage runs falsely claiming coverage. The implementation overcorrects by equating “coverage” with stdout bytes only. Reasonable fix: base the marker on the same success/output contract used by the barrage lift and outage classification, or explicitly count any captured model output that the pipeline considers liftable. The tests added at `orchestrate-barrage.test.ts:205-251` only cover zero-stdout and positive-stdout cases, so they pin the narrow behavior rather than the broader audit-coverage contract.

## 2026-06-01 — audit-barrage lift (20260601T025451417Z-scope-discovery)

### AUDIT-20260601-09 — Sentinel-absent-but-log-present fails OPEN — re-opens the exact AUDIT-06 hole for the migration/clone/this-repo path, with no backfill

Finding-ID: AUDIT-20260601-09 (claude-01 + codex-01 + codex-02; cross-model)
Status:     open
Severity:   blocking
Surface:    `plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-implement-hook-coverage.ts:100-108` (the `if (!hasSentinel) return allow-no-prior-run` block) + `plugins/dw-lifecycle/src/scope-discovery/promote-findings/hook-run-log.ts:97-115` (sentinel written only by `appendHookRunLogEntry`) + the committed `.dw-lifecycle/scope-discovery/hook-run-log.jsonl`

The AUDIT-06 fix replaced the `log.length === 0 → allow` trigger with a sentinel-presence trigger, on the theory that the sentinel "persists thereafter… outlives errant `git clean`s." But the sentinel is written **only** by `appendHookRunLogEntry` (hook-run-log.ts:107-113), so it exists **only on the machine where the new code has run at least once**. It is not committed and not derivable from the committed state. I verified this on the live tree: `git ls-files` shows `hook-run-log.jsonl` and `last-hook-run.json` are tracked, the sentinel `.implement-hook-bootstrapped` is **not on disk, not tracked, and not gitignored**. The committed log already has one entry (tip `393d68ed`), written by the *pre-fix* code that didn't write a sentinel.

Net effect: **right now, on the very repo that shipped this fix, the pre-push gate is fail-open.** `readLog()` returns a non-empty array, but `hasBootstrapSentinel()` returns `false`, so line 101 takes the `allow-no-prior-run` branch and `summarize`'s `startsWith('allow')` returns exit 0 — every unpushed commit, including a `--no-verify` batch, sails through. The same holds for **every fresh clone** and **every project that bootstrapped before the sentinel code shipped**: log non-empty, sentinel absent → fail-open until some future `implement-hook` run happens to write the sentinel locally. That is precisely the "deletable / re-triggerable fail-open … a discretion path" that AUDIT-06 (BLOCKING) was raised to close; the fix relocated the trigger from "log emptiness" to "sentinel absence" but introduced a *new, larger* fail-open surface (clone + migration), and one the gate cannot self-heal from because the sentinel isn't reconstructable. The minimal correct shape is to treat a non-empty log as implying bootstrapped: `hasBootstrapSentinel` (or the gate) should return `true` when the sentinel exists **OR** the log is non-empty, and backfill the sentinel on read. The test suite has the matching blind spot — `check-implement-hook-coverage.test.ts` adds `bootstrapped: false`/`logTips: []` (boot) and `bootstrapped: true`/`logTips: [...]` (mature) but never `bootstrapped: false` + `logTips: ['x']` (the migration/clone case that currently fails open), so the regression is unguarded.

---

### AUDIT-20260601-10 — `check-fix-task-tdd` gate bypass recurs: Tasks 5.42/5.43 ship `Closes AUDIT-<id>` with placeholder/no-test files — same shape as still-open AUDIT-02

Finding-ID: AUDIT-20260601-10
Status:     open
Severity:   high
Surface:    `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (Task 5.42 AC `Failing test exists at (no new test — pure typing cleanup…)`; Task 5.43 AC `Failing test exists at (to be filled in by Step 1 implementer)`) vs. the commit subject `…close AUDIT-20260601-06/07/08`

AUDIT-20260601-02 is still `open` and names exactly this: a `[x]`-checked fix-finding task whose cited test path is a prose placeholder string should be flagged (and arguably blocked) by `check-fix-task-tdd` + the `fix-task-tdd-discipline` doctor rule, which "refuses `Closes AUDIT-<id>` commits where the cited workplan task block's test file is missing, empty, or whose vitest exits non-zero." This diff reproduces the violation twice in the *same commit that closes 06/07/08*. Task 5.43 (Closes AUDIT-08) has every AC checkbox unchecked and a literal `(to be filled in by Step 1 implementer)` test path while Step 5 ("commit with `Closes AUDIT-20260601-08`") is checked `[x]`. Task 5.42 (Closes AUDIT-07) cites `(no new test — pure typing cleanup; existing tests cover the runtime paths)`. Both are `Closes`-trailer commits with no test file.

Either the commit-msg gate has a hole for these placeholder strings (it parses the test path but doesn't reject the parenthetical-prose sentinel), or it was bypassed for this commit. The irony is sharp: the feature is *simultaneously scoping* Task 5.38 to fix AUDIT-02 (the gate-hole finding) while *committing two more instances* of the hole it describes. This isn't a re-litigation of AUDIT-02's disposition — it's evidence the underlying shape regressed in net-new tasks. The fix is to make `check-fix-task-tdd` reject test-path values that aren't real file paths (e.g. anything matching `^\(.*\)$`), and to give the fix-task template an explicit non-bug disposition for pure-typing/pure-docs findings so they don't have to launder through a fake "failing test exists" AC.

---

### AUDIT-20260601-11 — AUDIT-08 disposition is incoherent: commit claims to close it, audit-log keeps it `open`, workplan records a pushback — the finding is not actually addressed

Finding-ID: AUDIT-20260601-11
Status:     open
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` (AUDIT-20260601-08 `Status: open`) + `workplan.md` Task 5.43 Step 1 (`pushed back on the finding's recommendation`) + commit subject `…close AUDIT-…08` + `orchestrate-barrage.ts:122` / `types.ts:96-99`

The AUDIT-08 "fix" does not change the behavior the finding flagged. Task 5.43 Step 1 explicitly records a pushback ("the lifter reads STDOUT only; broadening… would mean the gate writes tip.sha for outputs that aren't actually liftable") and the code change merely centralizes the *unchanged* predicate `stdoutBytes > 0 && spawnError === undefined` into `isModelRunHealthy` (types.ts:96). So the residual concern AUDIT-08 named — a model that emits exit-0 with stderr-only content, or an operator who lifts from a nonzero-exit run, yields no `tip.sha` and re-audits the same range indefinitely — stands unaddressed by design.

That may be a defensible call, but the disposition is recorded three inconsistent ways: the commit subject says **close**, the audit-log entry still says **`Status: open`**, and the workplan models it as a **fix** (Steps 1-5 checked) while its ACs (`Failing test exists at (to be filled in…)`) are all unchecked. Per the project's own closure machinery, a finding you push back on should land as `acknowledged-<ref>`/`wontfix` with a substantive operator-validated reason — not `open` under a commit that claims to close it. As written, a future reader walking `Status: open` entries will re-pick AUDIT-08, re-investigate, and rediscover that it was silently accepted. Pick one disposition and make all three surfaces agree; if the pushback is accepted, the audit-log status and the workplan AC shape must reflect "accepted trade-off," not "fixed."

---

### AUDIT-20260601-12 — `isErrnoException` is an unsound type guard — it asserts `ErrnoException` while only proving `Error`, swapping an `as` cast for a lying `is`

Finding-ID: AUDIT-20260601-12
Status:     open
Severity:   low
Surface:    `plugins/dw-lifecycle/src/subcommands/check-barrage-tip.ts:115-117`

The AUDIT-07 fix replaces `as NodeJS.ErrnoException` with `function isErrnoException(err): err is NodeJS.ErrnoException { return err instanceof Error; }`. `NodeJS.ErrnoException` is `Error & { code?, errno?, syscall?, path? }`; `instanceof Error` establishes only the `Error` half. The guard compiles solely because those extra fields are *optional* — but it returns `true` for any plain `new Error('x')`, narrowing it to a type that promises an `ErrnoException` shape it hasn't verified. That's the same "bypass typing" category AUDIT-07 raised (No `as Type`, no `any`), relocated from an `as` cast to an unsound `is` guard. It happens to be runtime-safe here because both call sites null-guard (`err.code === 'ENOENT'` is just `undefined !== 'ENOENT'` for a non-errno Error; `err.code ?? 'unknown'`), so this is a hygiene/honesty finding, not a bug.

The honest shape is either to narrow to what's actually proven — `function isError(err): err is Error` and read `code` defensively via an `'code' in err` check — or to verify the errno shape: `return err instanceof Error && (typeof (err as { code?: unknown }).code === 'string' || ...)`. As written, the guard's signature overstates its evidence, which is exactly the smell the no-`as` rule exists to prevent; a reviewer trusting the `is ErrnoException` return type elsewhere would assume `.code` is present.

---

### AUDIT-20260601-13 — Run marker `last-hook-run.json` records `findingsCount: 0 / promotedCount: 0` for the run that actually lifted 3 findings (incl. one BLOCKING)

Finding-ID: AUDIT-20260601-13
Status:     open
Severity:   medium
Surface:    `.dw-lifecycle/scope-discovery/last-hook-run.json` (`runDir: …20260601T024117392Z-scope-discovery`, `disposition: fired-and-promoted`, `findingsCount: 0`, `promotedCount: 0`, `slushedCount: 0`)

The committed marker points at runDir `20260601T024117392Z-scope-discovery` with `disposition: "fired-and-promoted"` but all three counts are `0`. That same runDir is the source the audit-log credits for AUDIT-20260601-06/07/08 (the audit-log section header is literally `2026-06-01 — audit-barrage lift (20260601T024117392Z-scope-discovery)`), and one of those findings is BLOCKING. So the marker claims a run that promoted nothing while the audit trail shows that run produced and lifted three findings. Either the count-tallying writes the marker *before* the lift/promote step populates counts, or the counts are sourced from a different (empty) tally than the one that fed the audit-log.

This matters because the marker is the operator-facing "what did the last hook do" summary, and a downstream reader (or a future automation keying on `promotedCount`) would read `0/0/0` as "clean run, nothing to act on" when in fact a blocking finding was lifted. The disposition label `fired-and-promoted` with `promotedCount: 0` is internally contradictory on its face. Worth tracing where `findingsCount`/`promotedCount` are computed in the implement-hook chain and asserting they equal the count of entries the lift actually appended to `audit-log.md` for that runDir; add a test that a run lifting N findings writes a marker with `findingsCount === N`.

---

I walked the three fixes (sentinel boot-case, errno type guard, healthy-run predicate centralization), their tests, the workplan task blocks, the audit-log status flips, and the committed `.dw-lifecycle` artifacts. The `types.ts` centralization itself is clean (single predicate, both call sites converge, no behavior drift), and the `check-barrage-tip.ts` typed `let result: BarrageTipCheckResult` is a real improvement. My highest-confidence concern is **claude-01**: the sentinel fix is fail-open on this exact repo and every fresh clone right now (verified against the live tree), which re-opens the BLOCKING hole it was meant to close.

## 2026-06-01 — audit-barrage lift (20260601T025451417Z-scope-discovery)

### AUDIT-20260601-14 — Sentinel-absent-but-log-present fails OPEN — re-opens the exact AUDIT-06 hole for the migration/clone/this-repo path, with no backfill

Finding-ID: AUDIT-20260601-14 (claude-01 + codex-01 + codex-02; cross-model)
Status:     fixed-b2ab920429b2c3220ba85e1836da69ad5dd257af
Severity:   blocking
Surface:    `plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-implement-hook-coverage.ts:100-108` (the `if (!hasSentinel) return allow-no-prior-run` block) + `plugins/dw-lifecycle/src/scope-discovery/promote-findings/hook-run-log.ts:97-115` (sentinel written only by `appendHookRunLogEntry`) + the committed `.dw-lifecycle/scope-discovery/hook-run-log.jsonl`

The AUDIT-06 fix replaced the `log.length === 0 → allow` trigger with a sentinel-presence trigger, on the theory that the sentinel "persists thereafter… outlives errant `git clean`s." But the sentinel is written **only** by `appendHookRunLogEntry` (hook-run-log.ts:107-113), so it exists **only on the machine where the new code has run at least once**. It is not committed and not derivable from the committed state. I verified this on the live tree: `git ls-files` shows `hook-run-log.jsonl` and `last-hook-run.json` are tracked, the sentinel `.implement-hook-bootstrapped` is **not on disk, not tracked, and not gitignored**. The committed log already has one entry (tip `393d68ed`), written by the *pre-fix* code that didn't write a sentinel.

Net effect: **right now, on the very repo that shipped this fix, the pre-push gate is fail-open.** `readLog()` returns a non-empty array, but `hasBootstrapSentinel()` returns `false`, so line 101 takes the `allow-no-prior-run` branch and `summarize`'s `startsWith('allow')` returns exit 0 — every unpushed commit, including a `--no-verify` batch, sails through. The same holds for **every fresh clone** and **every project that bootstrapped before the sentinel code shipped**: log non-empty, sentinel absent → fail-open until some future `implement-hook` run happens to write the sentinel locally. That is precisely the "deletable / re-triggerable fail-open … a discretion path" that AUDIT-06 (BLOCKING) was raised to close; the fix relocated the trigger from "log emptiness" to "sentinel absence" but introduced a *new, larger* fail-open surface (clone + migration), and one the gate cannot self-heal from because the sentinel isn't reconstructable. The minimal correct shape is to treat a non-empty log as implying bootstrapped: `hasBootstrapSentinel` (or the gate) should return `true` when the sentinel exists **OR** the log is non-empty, and backfill the sentinel on read. The test suite has the matching blind spot — `check-implement-hook-coverage.test.ts` adds `bootstrapped: false`/`logTips: []` (boot) and `bootstrapped: true`/`logTips: [...]` (mature) but never `bootstrapped: false` + `logTips: ['x']` (the migration/clone case that currently fails open), so the regression is unguarded.

---

### AUDIT-20260601-15 — `check-fix-task-tdd` gate bypass recurs: Tasks 5.42/5.43 ship `Closes AUDIT-<id>` with placeholder/no-test files — same shape as still-open AUDIT-02

Finding-ID: AUDIT-20260601-15
Status:     open
Severity:   high
Surface:    `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (Task 5.42 AC `Failing test exists at (no new test — pure typing cleanup…)`; Task 5.43 AC `Failing test exists at (to be filled in by Step 1 implementer)`) vs. the commit subject `…close AUDIT-20260601-06/07/08`

AUDIT-20260601-02 is still `open` and names exactly this: a `[x]`-checked fix-finding task whose cited test path is a prose placeholder string should be flagged (and arguably blocked) by `check-fix-task-tdd` + the `fix-task-tdd-discipline` doctor rule, which "refuses `Closes AUDIT-<id>` commits where the cited workplan task block's test file is missing, empty, or whose vitest exits non-zero." This diff reproduces the violation twice in the *same commit that closes 06/07/08*. Task 5.43 (Closes AUDIT-08) has every AC checkbox unchecked and a literal `(to be filled in by Step 1 implementer)` test path while Step 5 ("commit with `Closes AUDIT-20260601-08`") is checked `[x]`. Task 5.42 (Closes AUDIT-07) cites `(no new test — pure typing cleanup; existing tests cover the runtime paths)`. Both are `Closes`-trailer commits with no test file.

Either the commit-msg gate has a hole for these placeholder strings (it parses the test path but doesn't reject the parenthetical-prose sentinel), or it was bypassed for this commit. The irony is sharp: the feature is *simultaneously scoping* Task 5.38 to fix AUDIT-02 (the gate-hole finding) while *committing two more instances* of the hole it describes. This isn't a re-litigation of AUDIT-02's disposition — it's evidence the underlying shape regressed in net-new tasks. The fix is to make `check-fix-task-tdd` reject test-path values that aren't real file paths (e.g. anything matching `^\(.*\)$`), and to give the fix-task template an explicit non-bug disposition for pure-typing/pure-docs findings so they don't have to launder through a fake "failing test exists" AC.

---

### AUDIT-20260601-16 — AUDIT-08 disposition is incoherent: commit claims to close it, audit-log keeps it `open`, workplan records a pushback — the finding is not actually addressed

Finding-ID: AUDIT-20260601-16
Status:     open
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` (AUDIT-20260601-08 `Status: open`) + `workplan.md` Task 5.43 Step 1 (`pushed back on the finding's recommendation`) + commit subject `…close AUDIT-…08` + `orchestrate-barrage.ts:122` / `types.ts:96-99`

The AUDIT-08 "fix" does not change the behavior the finding flagged. Task 5.43 Step 1 explicitly records a pushback ("the lifter reads STDOUT only; broadening… would mean the gate writes tip.sha for outputs that aren't actually liftable") and the code change merely centralizes the *unchanged* predicate `stdoutBytes > 0 && spawnError === undefined` into `isModelRunHealthy` (types.ts:96). So the residual concern AUDIT-08 named — a model that emits exit-0 with stderr-only content, or an operator who lifts from a nonzero-exit run, yields no `tip.sha` and re-audits the same range indefinitely — stands unaddressed by design.

That may be a defensible call, but the disposition is recorded three inconsistent ways: the commit subject says **close**, the audit-log entry still says **`Status: open`**, and the workplan models it as a **fix** (Steps 1-5 checked) while its ACs (`Failing test exists at (to be filled in…)`) are all unchecked. Per the project's own closure machinery, a finding you push back on should land as `acknowledged-<ref>`/`wontfix` with a substantive operator-validated reason — not `open` under a commit that claims to close it. As written, a future reader walking `Status: open` entries will re-pick AUDIT-08, re-investigate, and rediscover that it was silently accepted. Pick one disposition and make all three surfaces agree; if the pushback is accepted, the audit-log status and the workplan AC shape must reflect "accepted trade-off," not "fixed."

---

### AUDIT-20260601-17 — `isErrnoException` is an unsound type guard — it asserts `ErrnoException` while only proving `Error`, swapping an `as` cast for a lying `is`

Finding-ID: AUDIT-20260601-17
Status:     open
Severity:   low
Surface:    `plugins/dw-lifecycle/src/subcommands/check-barrage-tip.ts:115-117`

The AUDIT-07 fix replaces `as NodeJS.ErrnoException` with `function isErrnoException(err): err is NodeJS.ErrnoException { return err instanceof Error; }`. `NodeJS.ErrnoException` is `Error & { code?, errno?, syscall?, path? }`; `instanceof Error` establishes only the `Error` half. The guard compiles solely because those extra fields are *optional* — but it returns `true` for any plain `new Error('x')`, narrowing it to a type that promises an `ErrnoException` shape it hasn't verified. That's the same "bypass typing" category AUDIT-07 raised (No `as Type`, no `any`), relocated from an `as` cast to an unsound `is` guard. It happens to be runtime-safe here because both call sites null-guard (`err.code === 'ENOENT'` is just `undefined !== 'ENOENT'` for a non-errno Error; `err.code ?? 'unknown'`), so this is a hygiene/honesty finding, not a bug.

The honest shape is either to narrow to what's actually proven — `function isError(err): err is Error` and read `code` defensively via an `'code' in err` check — or to verify the errno shape: `return err instanceof Error && (typeof (err as { code?: unknown }).code === 'string' || ...)`. As written, the guard's signature overstates its evidence, which is exactly the smell the no-`as` rule exists to prevent; a reviewer trusting the `is ErrnoException` return type elsewhere would assume `.code` is present.

---

### AUDIT-20260601-18 — Run marker `last-hook-run.json` records `findingsCount: 0 / promotedCount: 0` for the run that actually lifted 3 findings (incl. one BLOCKING)

Finding-ID: AUDIT-20260601-18
Status:     fixed-b7103a34
Severity:   medium
Surface:    `.dw-lifecycle/scope-discovery/last-hook-run.json` (`runDir: …20260601T024117392Z-scope-discovery`, `disposition: fired-and-promoted`, `findingsCount: 0`, `promotedCount: 0`, `slushedCount: 0`)

The committed marker points at runDir `20260601T024117392Z-scope-discovery` with `disposition: "fired-and-promoted"` but all three counts are `0`. That same runDir is the source the audit-log credits for AUDIT-20260601-06/07/08 (the audit-log section header is literally `2026-06-01 — audit-barrage lift (20260601T024117392Z-scope-discovery)`), and one of those findings is BLOCKING. So the marker claims a run that promoted nothing while the audit trail shows that run produced and lifted three findings. Either the count-tallying writes the marker *before* the lift/promote step populates counts, or the counts are sourced from a different (empty) tally than the one that fed the audit-log.

This matters because the marker is the operator-facing "what did the last hook do" summary, and a downstream reader (or a future automation keying on `promotedCount`) would read `0/0/0` as "clean run, nothing to act on" when in fact a blocking finding was lifted. The disposition label `fired-and-promoted` with `promotedCount: 0` is internally contradictory on its face. Worth tracing where `findingsCount`/`promotedCount` are computed in the implement-hook chain and asserting they equal the count of entries the lift actually appended to `audit-log.md` for that runDir; add a test that a run lifting N findings writes a marker with `findingsCount === N`.

---

I walked the three fixes (sentinel boot-case, errno type guard, healthy-run predicate centralization), their tests, the workplan task blocks, the audit-log status flips, and the committed `.dw-lifecycle` artifacts. The `types.ts` centralization itself is clean (single predicate, both call sites converge, no behavior drift), and the `check-barrage-tip.ts` typed `let result: BarrageTipCheckResult` is a real improvement. My highest-confidence concern is **claude-01**: the sentinel fix is fail-open on this exact repo and every fresh clone right now (verified against the live tree), which re-opens the BLOCKING hole it was meant to close.

## 2026-06-01 — audit-barrage lift (20260601T030312885Z-scope-discovery)

### AUDIT-20260601-19 — `hasBootstrapSentinel` violates command-query separation — a read-path predicate writes a non-gitignored file into the working tree during pre-push

Finding-ID: AUDIT-20260601-19 (claude-01 + claude-03 + codex-03; cross-model)
Status:     open
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/scope-discovery/promote-findings/hook-run-log.ts:130-156` (backfill `writeFile`) + `plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-implement-hook-coverage.ts:100` (gate calls it) + `subcommands/check-implement-hook-coverage.ts:187` (production wiring)

The fix gives `hasBootstrapSentinel` a disk-write side effect: when the sentinel is absent but the log is non-empty it `writeFile`s the sentinel (lines 143-147). That function is named like a pure query (`has…`) and is invoked by the **pre-push gate** (`check-implement-hook-coverage.ts:100` → wired at `subcommands/check-implement-hook-coverage.ts:187`). I verified `git check-ignore -v .dw-lifecycle/scope-discovery/.implement-hook-bootstrapped` exits 1 — the sentinel is **not gitignored**. So the first time an operator on a fresh clone/migration attempts a push, the gate silently creates an *untracked, non-ignored* file in their working tree. That pollutes `git status`, risks accidental `git add .`/commit of the sentinel, and mutates state during an operation operators reasonably expect to be read-only.

Two compounding problems beyond CQS: (1) the backfill is functionally unnecessary for correctness — the `if (log.length > 0) return true` decision is already made by reading the log; the write only "converges" the sentinel, which is the durability the original AUDIT-06 fix wanted, but that durability should be earned by the *write path* (`appendHookRunLogEntry`), not smuggled into a predicate; (2) the `catch {}` on the backfill write (lines 148-151) swallows all errors silently — on a read-only checkout or permission-denied dir, the gate keeps working (correct) but leaves no diagnostic that the sentinel never persisted, so the "converge to present" guarantee silently doesn't hold. Reasonable fix: either gitignore `.implement-hook-bootstrapped` *and* keep the write, or drop the backfill from the predicate entirely (return `log.length > 0`) and let `appendHookRunLogEntry` own all sentinel writes. If the write stays, the function should be renamed to signal the mutation (`ensureBootstrapSentinel`) so callers in any future read-only/dry-run/`--check` context don't unknowingly mutate the tree.

---

### AUDIT-20260601-20 — The gate-level regression test for the migration/clone case is tautological — it stubs the resolved boolean instead of exercising the fix through the gate

Finding-ID: AUDIT-20260601-20
Status:     open
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-implement-hook-coverage.test.ts:137-157` (new test) + `:35` (`makeArgs` stub) + the untested wiring at `subcommands/check-implement-hook-coverage.ts:187`

The new test claims to cover "sentinel absent BUT log has entries (migration/clone case)," but `makeArgs` injects `hasBootstrapSentinel: async () => opts.bootstrapped ?? true` (test line 35), and the test passes `bootstrapped: true` — which is also the default. So the test feeds the gate the **already-resolved** post-fix boolean and asserts the gate refuses uncovered commits. That was already the behavior, already covered by the "mature project" case; the new test re-asserts it and guards nothing new. The actual fix — *deriving* `bootstrapped: true` from a non-empty log when the sentinel file is absent — lives in `hasBootstrapSentinel` (hook-run-log.ts), and the only place that fixed function meets the gate is the CLI glue at `subcommands/check-implement-hook-coverage.ts:187` (`() => hasBootstrapSentinel(repoRootResolved)`), which has no test.

This is the same blind-spot shape the prior cross-model finding already named in the gate's own suite ("never `bootstrapped: false` + `logTips: ['x']`"). The diff adds a test whose *name* describes the dangerous case but whose *injected input* sidesteps it. The honest regression test would not stub `hasBootstrapSentinel` at all for this scenario — it would run the gate against a real (or fake-fs) repo with a non-empty `hook-run-log.jsonl` and no sentinel file, proving the integrated path resolves to refuse. As written, if someone changed the wiring at line 187 to stop calling the fixed function (or passed the old sentinel-only check), every test here would stay green while the BLOCKING fail-open silently returned. The unit test in `hook-run-log.test.ts:139-165` does cover the function in isolation, so the gap is specifically the *integration*, which is exactly where AUDIT-14 said the live regression bit.

---

### AUDIT-20260601-21 — This diff re-commits the two still-open marker/placeholder defects (AUDIT-13/18 and AUDIT-10/15) as fresh instances

Finding-ID: AUDIT-20260601-21 (claude-04 + codex-02; cross-model)
Status:     open
Severity:   high
Surface:    `.dw-lifecycle/scope-discovery/last-hook-run.json` (`findingsCount: 0 / promotedCount: 0 / slushedCount: 0`, `disposition: fired-and-promoted`) + `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` Tasks 5.44-5.48 (`Failing test exists at (to be filled in by Step 1 implementer)`)

Not re-litigating dispositions — flagging that this commit produces **new instances** of two findings already `open` in the log. (1) The marker bug (AUDIT-13/18): `last-hook-run.json` now points at runDir `20260601T025451417Z` — the run whose lift section in this very diff adds AUDIT-09…18, one of them BLOCKING — yet records `0/0/0` with disposition `fired-and-promoted`. The count-vs-reality contradiction the open finding named is reproduced verbatim for the new run, confirming the tally bug is unaddressed and continues to mislead any downstream reader keying on `promotedCount`. (2) The placeholder-AC bug (AUDIT-10/15): Tasks 5.44-5.48 each ship `Failing test exists at (to be filled in by Step 1 implementer)` — five fresh parenthetical-prose test paths generated by the promote-findings template. These tasks are still unchecked, so the `check-fix-task-tdd` gate isn't tripped *yet*, but the diff demonstrates the root cause (template emits non-path placeholder strings) is structurally live and will keep manufacturing gate-bypass candidates until the template is fixed to reject `^\(.*\)$` test-path values. Surfacing so the operator sees the two open findings are accreting instances, not stable.

---

I walked the actual fix (`hasBootstrapSentinel` backfill), both test files, the gate library + its production wiring, and the committed `.dw-lifecycle` artifacts — and verified two claims against the live tree (production wiring at `subcommands/…:187` does pass the fixed function, so the BLOCKING fail-open is genuinely closed at runtime; and the backfilled sentinel is not gitignored). The runtime fix is real and the unit test for `hasBootstrapSentinel` is sound. My highest-confidence concerns are **claude-01** (a query predicate that writes a non-ignored file into the working tree during pre-push) and **claude-02** (the gate-level regression test stubs the very boolean the fix computes, so the integration that AUDIT-14 said bit in production stays unguarded).

### AUDIT-20260601-22 — Audit-log duplicates the same lifted findings under two ID ranges

Finding-ID: AUDIT-20260601-22
Status:     open
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md:1323-1460`

The diff appends the same audit-barrage lift twice for the same runDir `20260601T025451417Z-scope-discovery`: first as AUDIT-20260601-09 through -13, then again as AUDIT-20260601-14 through -18. The bodies are substantively identical, including the same sentinel finding, TDD bypass finding, disposition finding, errno type-guard finding, and marker-count finding.

This creates two open records for each underlying issue and breaks the feature’s tracking surfaces: the workplan only creates fix tasks for AUDIT-09 through AUDIT-13, while AUDIT-14 through AUDIT-18 remain open duplicates with no corresponding task block. The reasonable fix is to keep one canonical lifted section and remove or disposition the duplicate IDs consistently so issue picking, close-shipped-audit-findings, and future audits do not process the same finding twice.

## 2026-06-01 — audit-barrage lift (20260601T030416879Z-scope-discovery)

### AUDIT-20260601-23 — Audit-log `20260601T025451417Z` lift batch is duplicated — AUDIT-09..13 and AUDIT-14..18 are byte-identical pairs under two identical section headers

Finding-ID: AUDIT-20260601-23 (claude-01 + codex-03 + codex-04; cross-model)
Status:     open
Severity:   high
Surface:    `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` (two consecutive sections both headed `## 2026-06-01 — audit-barrage lift (20260601T025451417Z-scope-discovery)`) + `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (Tasks 5.44–5.48)

The diff appends the *same* lift batch to the audit-log twice. There are two sections with the identical header `## 2026-06-01 — audit-barrage lift (20260601T025451417Z-scope-discovery)`. The first contains AUDIT-20260601-09/-10/-11/-12/-13; the second contains AUDIT-20260601-14/-15/-16/-17/-18. The pairs are byte-identical: -09 ≡ -14 (sentinel fail-open, blocking), -10 ≡ -15 (gate bypass), -11 ≡ -16 (AUDIT-08 disposition), -12 ≡ -17 (isErrnoException), -13 ≡ -18 (marker counts). Two barrage runs cannot share one `runDir` timestamp, so this is not two independent runs — it is one batch lifted/appended twice (a lift idempotency bug or a copy-paste during the lift).

This corrupts the closure machinery the whole Phase 17 premise depends on. `check-open-findings` counts `Status: open` entries to gate `/dw-lifecycle:implement` pickup; the duplication inflates the open count from 5 to 10. Worse, `promote-findings` only scoped the *first* copy: workplan Tasks 5.44–5.48 cover AUDIT-09..13, while AUDIT-14..18 have **no** workplan tasks at all (only -14 is closed, via the b2ab9204 commit). So five orphan `open` findings now exist with no fix-task to ever flip them to `fixed-<sha>` through the normal flow — they will sit `open` forever and permanently jam the open-findings gate. The fix: dedup the audit-log section (delete one of the two `20260601T025451417Z` batches), and add an idempotency guard to the lift so a re-run against an already-lifted runDir is a no-op rather than a re-append.

### AUDIT-20260601-24 — AUDIT-09/14 BLOCKING fix is implemented in this diff, but Task 5.44 is fully unchecked and both statuses remain `open` — a future reader re-picks an already-shipped fix

Finding-ID: AUDIT-20260601-24 (claude-02 + claude-03 + codex-01; cross-model)
Status:     open
Severity:   high
Surface:    `plugins/dw-lifecycle/src/scope-discovery/promote-findings/hook-run-log.ts:97-156` (`hasBootstrapSentinel` OR-backfill) vs. `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` Task 5.44 (steps all `[ ]`) and `audit-log.md` (AUDIT-09 + AUDIT-14 both `Status: open`)

The blocking sentinel-fail-open finding's prescribed fix — "treat a non-empty log as implying bootstrapped … and backfill the sentinel on read" — is *present and correct* in this very diff. `hasBootstrapSentinel` returns `true` when the sentinel exists OR `readHookRunLog(...).length > 0`, and backfills the sentinel file (`hook-run-log.ts:140-150`); `hook-run-log.test.ts` adds the matching "returns true AND backfills … (migration/clone)" test. At runtime on this repo (log has 2 entries) the pre-push gate now refuses unbacked commits. The hole is closed.

But the bookkeeping contradicts the code three ways: commit `b2ab9204` closes AUDIT-**14**; the audit-log keeps **both** AUDIT-09 and AUDIT-14 at `Status: open`; and Task 5.44 (the workplan task for AUDIT-09) has every step `[ ]` with a `(to be filled in by Step 1 implementer)` test path. This is the inverse of the AUDIT-16 incoherence: there the commit claimed a close the code didn't make; here the code made the fix but the trail says `open`/unstarted. A future session walking `Status: open` (per the project's own "read the categories before declaring all-clear" rule) will re-pick a BLOCKING item and re-implement a fix that already shipped. Disposition: flip AUDIT-09 and AUDIT-14 to `fixed-b2ab9204…` (they are duplicates of each other — see claude-01) and check off Task 5.44 citing `hook-run-log.test.ts` as the existing test.

### AUDIT-20260601-25 — The "migration/clone case" test in `check-implement-hook-coverage.test.ts` does not exercise the migration logic its comment claims

Finding-ID: AUDIT-20260601-25
Status:     open
Severity:   low
Surface:    `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-implement-hook-coverage.test.ts` ("refuses when sentinel absent BUT log has entries (migration/clone case)")

The test's comment says it covers the case where "a fresh clone or migrating project will have a non-empty log … but no sentinel file … The gate must NOT fail-open here." But the test injects `bootstrapped: true` into `makeArgs`, with the comment conceding "The injected stub here directly returns the post-backfill state: bootstrapped: true because log is non-empty." So the assertion (`refuse-uncovered-commits`) only re-exercises the already-covered "sentinel present + log non-empty → refuse" path. The actual migration conversion — `hasBootstrapSentinel` turning (sentinel absent, log present) into `true` — is never driven here; it is tested only in `hook-run-log.test.ts`. The gate's *integration* with the real `hasBootstrapSentinel` (where a stub returning `false` for absent-sentinel would fail open) is not pinned.

This is the same comment-vs-code overclaim shape the project already flagged in AUDIT-04 (test comments asserting boundaries the timestamps don't cross). A test whose comment claims to guard the migration fail-open, but whose stub hard-codes the safe answer, would not fail if someone reverted `hasBootstrapSentinel`'s OR-rule. Either inject `bootstrapped: false` + a non-empty `logTips` and assert the gate still refuses (which requires the gate, not the stub, to apply the OR-rule), or correct the comment to state it only covers the post-backfill state.

### AUDIT-20260601-26 — Run marker `last-hook-run.json` writes `0/0/0` for the `20260601T025451417Z` run too — a second confirmed instance of AUDIT-13/18, showing the undercount is systematic, not a one-off

Finding-ID: AUDIT-20260601-26 (claude-05 + codex-02; cross-model)
Status:     open
Severity:   medium
Surface:    `.dw-lifecycle/scope-discovery/last-hook-run.json` (`runDir: …20260601T025451417Z…`, `findingsCount: 0`, `promotedCount: 0`) + `.dw-lifecycle/scope-discovery/hook-run-log.jsonl`

Not re-litigating AUDIT-13/18 (already `open`); flagging that this diff supplies a *second, distinct* instance that strengthens it from "one bad marker" to "the marker is always wrong." AUDIT-13/18 concerned runDir `20260601T024117392Z` (counts `0` but 3 findings lifted). The committed marker in *this* diff points at the newer runDir `20260601T025451417Z` with `disposition: "fired-and-promoted"` and `findingsCount: 0 / promotedCount: 0 / slushedCount: 0` — yet that run is exactly the one whose lift produced AUDIT-09..18 in the audit-log (5+ findings, one BLOCKING). Two consecutive `fired-and-promoted` runs both recording `0` promoted establishes that `findingsCount`/`promotedCount` are wired to a tally that is never populated, not that one run happened to promote nothing.

The fix and a regression test belong to the existing AUDIT-13/18 task (currently Task 5.48, unchecked): assert that an implement-hook run lifting N findings writes a marker with `findingsCount === N` and `promotedCount === N`. The second instance is the evidence that the test must assert non-zero counts against a real lift, not just parse the marker shape.

## 2026-06-01 — audit-barrage lift (20260601T032111359Z-scope-discovery)

### AUDIT-20260601-27 — Counter wiring decouples `findingsCount` from disposition counts, allowing incoherent markers when the lift-stderr regex fails to match

Finding-ID: AUDIT-20260601-27 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02; cross-model)
Status:     open
Severity:   blocking
Surface:    `plugins/dw-lifecycle/src/subcommands/implement-hook.ts:346,355,405` + `implement-hook-counters.ts:18-22` (`parseLiftFindingsCount` defensive `return 0`)

Pre-fix, the promote branch set `findingsCount = promotedCount` and the slush branch set `findingsCount = slushedCount + skipped`, so the marker's findings count was *derived from* the disposition counts and could never be smaller than them. The fix inverts the dependency: `findingsCount` is now sourced solely from `parseLiftFindingsCount(liftResult.stderr)` (line 346), while `promotedCount`/`slushedCount` are parsed independently from the disposition step's output (lines 382, 405). Both lift-count parsing (`/extracted\s+(\d+)\s+finding/`) and promote-count parsing have a defensive `return 0` on no-match (`implement-hook-counters.ts:20, 54`).

The failure mode: if the lift stderr format drifts (or a future lift writes "extracted N findings" to stdout instead, mirroring the exact stream-mismatch bug #384 was fixing), `parseLiftFindingsCount` silently returns 0 — but the promote branch may still parse `Auto-applied: 4 finding(s)` and write `findingsCount: 0, promotedCount: 4`. That marker asserts the hook promoted more findings than it found, which is impossible and strictly *more* contradictory than the pre-fix bug it replaces. A reasonable fix is a reconciliation invariant before writing the marker — `findingsCount = Math.max(findingsCountFromLift, promotedCount, slushedCount)` — or an assertion that fails loudly when `promotedCount > findingsCount`, so a regex drift surfaces as a crash rather than a quietly-wrong marker.
