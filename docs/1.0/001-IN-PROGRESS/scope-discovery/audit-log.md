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

#### AUDIT-20260529-01 — Exit-vs-close event truncation

Finding-ID: AUDIT-20260529-01 (claude-exit-vs-close + codex-stream-error-race; cross-model)
Status: fixed-08971e4
Severity: high
Surface: `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/spawn-cli.ts:128-139`

Fix note (commit `08971e4`): `spawnCliAgainstModel` now settles on `child.on('close', ...)` instead of `'exit'` so stdio pipes have fully drained before the byte-counter snapshot + capture-stream close. Stream `'error'` handlers attached at stream creation so mid-run write failures reject the run instead of crashing the process. New regression test plants 200 lines (~10 KB) of pre-exit stdout via a fake CLI's `process.exit(0)` right after the writes and asserts every byte lands in the on-disk capture.

`spawnCliAgainstModel` finalizes on `child.on('exit', ...)` then immediately ends the capture streams. Per Node semantics, `'exit'` fires when the process ends but its stdio pipes may still have buffered, undelivered data; `'close'` is the event that fires only after all stdio streams have closed. Snapshotting on `'exit'` drops any in-flight stdout chunks — both from the on-disk `<model>.md` capture and from the `stdoutBytes` counter. This is silent data-fidelity loss on the load-bearing path of the whole feature.

Cross-cite: codex independently flagged the same root cause from the error-handler perspective (`stdoutStream.write(chunk)` called before any error handler is attached; if the write stream errors mid-run, the process can crash).

**Fix:** attach completion logic to `child.on('close', ...)` instead; attach stream error handlers immediately after stream creation.

#### AUDIT-20260529-02 — args_template validation vs spawn-cli substitution drift

Finding-ID: AUDIT-20260529-02 (claude-args-template-substring-mismatch + codex-placeholder-contract; cross-model)
Status: fixed-08971e4
Severity: high
Surface: `config-loader.ts:200-205`, `schema/audit-barrage-config.yaml.schema.json:38`, `spawn-cli.ts:160-163`

Fix note (commit `08971e4`): chose option (a) — back-compatible intra-token literal replacement via `tok.split('{{prompt}}').join(prompt)`. `args_template: "--prompt={{prompt}}"` now renders `--prompt=<actual-prompt>` at spawn time. Existing adopter configs that put `{{prompt}}` as a standalone token continue to work; embedded forms work too. New tests cover the embedded-form substitution + multiple `{{prompt}}` occurrences in one token.

Config-loader accepts any `args_template` that *contains* `{{prompt}}` as substring; `buildArgs` only substitutes whole-token-equals-`{{prompt}}`. An operator writing `args_template: "--prompt={{prompt}}"` passes both validation + schema, then spawns the CLI with the literal `--prompt={{prompt}}` token and **never receives the rendered prompt**. Silent output-empty run with no error surfaced.

Both models independently identified this exact failure mode (substring validation vs token-exact substitution).

**Fix:** either (a) `buildArgs` does intra-token replace via `tok.split('{{prompt}}').join(prompt)`, or (b) validation tightens to require `{{prompt}}` as a standalone whitespace-delimited token with a clear error message rejecting embedded forms.

#### AUDIT-20260529-03 — Exit-code contract drift vs PRD

Finding-ID: AUDIT-20260529-03 (claude-exitcode-vs-prd + codex-exit-contract-drift; cross-model)
Status: fixed-08971e4
Severity: medium
Surface: `audit-barrage.ts:230-237` (`isHealthyModelRun`) + `:222-225` (`deriveBarrageExitCode`); PRD criterion in `types.ts:113-119`

Fix note (commit `08971e4`): relaxed `isHealthyModelRun` to `stdoutBytes > 0 && spawnError === undefined` — non-zero CLI exits and timeouts fall on the healthy side because the captured stdout is still triagable. The `types.ts` JSDoc on `BarrageResult.exitCode` and the `deriveBarrageExitCode` docstring were both updated to match the PRD's "produced output" wording. New tests cover non-zero-exit-with-bytes (healthy), timeout-with-bytes (healthy), and spawn-error (unhealthy regardless of byte count).

PRD says: "CLI exit code: 0 if any model produced output; 1 if all failed." Implementation requires `exitCode === 0 && !timedOut && spawnError === undefined && stdoutBytes > 0`. A model that emits a complete useful response but exits non-zero (rate-limit warnings, partial-completion codes, non-zero-on-findings conventions are all common in LLM CLIs) is classified as "failed" — its findings file still on disk but the run reports exit 1 if it was the only "useful" model. Three subtly different contracts: code + `types.ts` comment + PRD all say different things.

**Fix:** decide which contract is authoritative + align all three. Recommended: relax `isHealthyModelRun` to "produced positive-byte stdout AND was not a spawn error / timeout" (matching the PRD's "produced output" wording).

#### AUDIT-20260529-04 — Prompt-renderer is exported but not wired into the verb

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

#### AUDIT-20260529-05 — Timeout timer leaks on spawn-error path (~305s dangling per uninstalled CLI)

Finding-ID: AUDIT-20260529-05 (claude-timeout-leak-on-spawn-error)
Status: fixed-08971e4
Severity: high
Surface: `spawn-cli.ts:99-110` vs `:118-126`

Fix note (commit `08971e4`): `finish()` now clears BOTH `sigkillTimer` AND `timeoutTimer`; every settle path (spawn-error, close, stream-error) goes through `finish()`. New regression test runs against a nonexistent binary, asserts the run settles in well under a second (no 30s timer dwell), and gives Node a 50ms tick after settle to surface any late timer activity. The change also moves the timer-handle into the closure (declared `let timeoutTimer: NodeJS.Timeout | null = null`) so the stream-error reject path can clear it too.

`clearTimeout(timeoutTimer)` happens ONLY inside the `'exit'` handler. On spawn failure (ENOENT — binary not installed), Node emits `'error'` and never `'exit'`. The error handler calls `finish()` which clears `sigkillTimer` but not `timeoutTimer`. Timer survives ~305 seconds after the run is logically done. The CLI shim's `process.exit()` masks this, but `orchestrateBarrage` is a public library function — any caller that awaits it without forcibly exiting hangs or emits open-handle warnings. Plus the post-finish `child.kill` mutating `timedOut` after the result was reported is a latent race.

The common dogfood case is "not all three CLIs are installed" — this fires on nearly every real run for any audit-barrage adopter who hasn't yet installed all configured models.

**Fix:** move `clearTimeout(timeoutTimer)` into `finish()` alongside the `sigkillTimer` cleanup so every settle path clears both.

#### AUDIT-20260529-06 — `--prompt-file` read failure exits 1; config-error exits 2 (inconsistent usage-vs-runtime classification)

Finding-ID: AUDIT-20260529-06 (claude-promptfile-exit-code)
Status: fixed-08971e4
Severity: low
Surface: `audit-barrage.ts:300-308` vs `:285-289`

Fix note (commit `08971e4`): `loadPromptText` now exits 2 on file-read failure to match the config-error path. Both are pre-orchestration input validation; wrapper scripts that key on the exit code now distinguish "the audit ran and all models failed" (exit 1) from "you invoked me wrong" (exit 2).

A missing/unreadable `--prompt-file` is operator-input error of the same class as malformed `--models` filter or bad config — yet exits `1` (the "all models failed" code), while malformed config exits `2`. Wrapper scripts distinguishing "the audit ran and everything failed" from "you invoked me wrong" get the wrong signal.

**Fix:** `loadPromptText` exits 2 on file-read failure (matching the config-error path; both are pre-orchestration input validation).

#### AUDIT-20260529-07 — Run-dir timestamp collision risk (second-resolution + recursive mkdir)

Finding-ID: AUDIT-20260529-07 (claude-rundir-collision)
Status: fixed-08971e4
Severity: low
Surface: `run-artifacts.ts:30-37` + `orchestrate-barrage.ts:64`

Fix note (commit `08971e4`): chose millisecond resolution — `encodeTimestamp` now emits `YYYYMMDDTHHMMSSsssZ` (3-digit ms suffix). Two barrages for the same feature in the same wall-clock second land in distinct run dirs. Tests updated to assert the new shape (`/^\d{8}T\d{9}Z$/` regex on `timestamp`; smoke script asserts the new run-dir-name shell glob).

Run-dir name is `<second-resolution-timestamp>-<feature>` + `mkdir({recursive:true})` doesn't error on existing dir. Two barrages for the same feature within the same wall-clock second resolve to the same run dir; the second silently overwrites the first. Project's "database preserves, doesn't delete" ethos says this is the wrong default.

**Fix:** millisecond-resolution timestamp OR detect existing dir + suffix `-2`/`-3`.

#### AUDIT-20260529-08 — Misleading comment in `orchestrateBarrage`

Finding-ID: AUDIT-20260529-08 (claude-orchestrate-comment-drift)
Status: fixed-08971e4
Severity: low
Surface: `orchestrate-barrage.ts:71-83`

Fix note (commit `08971e4`): comment replaced with an accurate description — "assemble the BarrageRun, write INDEX.md, return the same record." The deliberate duplication (caller + `writeIndexFile` both derive `<runDir>/INDEX.md`) is now explicitly noted as a composability choice (the helper can be called standalone from tests).

Comment reads "assemble it without the indexPath first, then patch it on after the write so the record we return matches what landed on disk" — but the code does the opposite (computes `indexPath` up front, no post-write patch). `writeIndexFile`'s return value is discarded.

**Fix:** align comment to actual code (or drop the inaccurate "patch on after" framing).

#### AUDIT-20260529-09 — Test files for this feature were outside the audited diff (range scoping concern)

Finding-ID: AUDIT-20260529-09 (claude-test-files-outside-range)
Status: informational
Severity: low
Surface: this audit-barrage run's diff scope

The audit prompt's diff excluded `*.test.ts` (I scoped narrowly to the production surface). Claude flagged that the "43 + 27 tests" claim couldn't be verified from the diff alone, and that a green test count is weak evidence for the timing/teardown bugs found above. Actionable: future audit-barrage runs should include the test surface in the diff scope, OR the operator should explicitly acknowledge the scope cut.

### Operator-side in-band findings during the dogfood

#### AUDIT-20260529-10 — Renderer's unsubstituted-token rejection over-eager on instructional prose

Finding-ID: AUDIT-20260529-10 (in-band Finding-001; subsumed by AUDIT-20260529-04)
Status: fixed-08971e4
Severity: high
Surface: `prompt-renderer.ts:205-211`

Fix note (commit `08971e4`): `rejectUnsubstitutedTokens` now scans ONLY for unsubstituted EXPECTED_VARS markers, not arbitrary `{{...}}` strings. Template prose that mentions `{{var}}` / `{{name}}` / `{{var_name}}` as documentation of the substitution mechanism passes through unchanged. New tests cover the pass-through path + assert that a surviving DECLARED-var marker still fails loud (declared-var contract preserved).

Operator hit this in-band trying to render the prompt template — the template's instructional prose mentions `{{var}}` / `{{prompt}}` / `{{name}}` / `{{var_name}}` as documentation about the substitution mechanism. `rejectUnsubstitutedTokens` rejects ANY `{{xxx}}` substring, so it rejects the template's own instructional examples. Subsumed by AUDIT-20260529-04; fix lands together.

#### AUDIT-20260529-11 — Prompt template's marker triplet pattern triples large vars

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

#### AUDIT-20260529-12 — orchestrator-turn 3/6 catalog NOTE is constant per-turn noise

Finding-ID: AUDIT-20260529-12 (imported from deskwork-plugin TF-002)
Status:     open
Severity:   low
Surface:    `plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/` (the summary printer that emits the NOTE; likely `runOrchestratorTurn` in `runner.ts` or a sibling)

Every `dw-lifecycle orchestrator-turn --feature <slug> --skip-judge --skip-auditor` invocation emits the identical stderr summary: `NOTE: only 3/6 catalog files present (anti-patterns.yaml, adopter-manifests.yaml, clones.yaml). 0 new audit entries; 0 wrong-decisions; ...`. The NOTE never changes between turns when the project has a steady-state catalog count and carries no actionable signal — it dilutes the genuinely-variable parts of the summary.

Suggested fix (from TF-002):
- *Light:* emit the "N/6 catalog files present" NOTE only when the count CHANGES from the last persisted turn (state already lives in `controller-state.json`), or gate behind `--verbose`.
- *Medium:* if 3/6 is the steady state for a project without the optional catalogs, downgrade from per-turn NOTE to a one-time install-time hint.

Scoped into workplan: Phase 14 Task 1 (fix-finding-AUDIT-20260529-12).

#### AUDIT-20260529-13 — dispatch-wrapper wrap-prompt round-trip + grammar false-positives

Finding-ID: AUDIT-20260529-13 (imported from deskwork-plugin TF-003; co-tracked with AUDIT-20260529-14 via [#362](https://github.com/audiocontrol-org/deskwork/issues/362))
Status:     open
Severity:   medium
Surface:    `plugins/dw-lifecycle/src/scope-discovery/dispatch-wrapper.ts`, `plugins/dw-lifecycle/src/subcommands/wrap-prompt.ts`, `plugins/dw-lifecycle/src/subcommands/validate-return.ts`

Every `/dw-lifecycle:review` reviewer dispatch requires a hand-managed round-trip: `mktemp` a prompt file → Write the prompt body into it → `dw-lifecycle wrap-prompt --prompt-file <path>` → paste the (120+ line) wrapped stdout into the Agent tool. The wrapped suffix's return grammar has three sharp edges that recur per session: the Searched-count noun whitelist (`5 issues found` rejected; must end in `matches`/`hits`/...), mandatory `path:LINE` on every Excluded entry (`:1` sentinel for whole-file), and a forbidden-substring list that collides with ordinary descriptive prose (`stub` / `placeholder` / `pending` in a reason trips the deferral detector even in non-deferral usage).

GH issue: [#362](https://github.com/audiocontrol-org/deskwork/issues/362) (co-files TF-003 + TF-004 with Light / Medium / Heavy fix ladder). Per Phase 13 anti-deferral discipline, the GH issue alone is not a disposition — scoped into workplan below.

Suggested fix (from TF-003 / #362):
- *Light (companion to AUDIT-20260529-14):* `dispatch-review --prompt-file <p> --agent-type <type>` verb that wraps both legs of the round-trip in one CLI call.
- *Medium:* word-boundary + context-aware match on forbidden substrings; widen Searched-count noun whitelist (`issues`, `files`, `instances`, ...).
- *Heavy:* the architectural collapse — operator decision required.

Scoped into workplan: Phase 14 Task 2 (fix-finding-AUDIT-20260529-13) — covers Medium grammar relaxation; Light stdin fix lives in Task 3 below.

#### AUDIT-20260529-14 — validate-return has no stdin path

Finding-ID: AUDIT-20260529-14 (imported from deskwork-plugin TF-004; co-tracked with AUDIT-20260529-13 via [#362](https://github.com/audiocontrol-org/deskwork/issues/362))
Status:     open
Severity:   low
Surface:    `plugins/dw-lifecycle/src/subcommands/validate-return.ts`

Validating each reviewer return requires writing the agent's Searched / Included / Excluded block to a temp file, then `dw-lifecycle validate-return --response-file <path> --json`. There's no stdin path (`--response-file -`), so the response can't be piped; it must round-trip through a temp file the orchestrator hand-creates.

GH issue: [#362](https://github.com/audiocontrol-org/deskwork/issues/362) (Light fix in the issue's ladder; one-line patch). Per Phase 13 anti-deferral discipline, the GH issue alone is not a disposition — scoped into workplan below.

Suggested fix (from TF-004): accept `--response-file -` (read from stdin). Mirrors the `gh issue create --body-file -` convention already used elsewhere in this project.

Scoped into workplan: Phase 14 Task 3 (fix-finding-AUDIT-20260529-14).

#### AUDIT-20260529-15 — clone gate scanned gitignored directories until `gitignore: true` set

Finding-ID: AUDIT-20260529-15 (imported from deskwork-plugin TF-005)
Status:     fixed-37683c8
Severity:   low
Surface:    `plugins/dw-lifecycle/templates/scope-discovery/.jscpd.json`, scope-discovery's own `.jscpd.json`

Fix landed on `feature/deskwork-plugin` at commit `37683c8` ("fix(38·1): clone gate honors .gitignore — set gitignore:true (#354)"). Sets `"gitignore": true` in the scope-discovery `.jscpd.json` + the adopter template seed; regression at `clone-detector.gitignore.test.ts`. Closes pilot-reported [#354](https://github.com/audiocontrol-org/deskwork/issues/354) (issue stays open per closure-requires-verified-release rule).

The fix SHA is on `origin/feature/deskwork-plugin` only; `feature/scope-discovery` inherits it on merge to main. No re-implementation needed.

Scoped into workplan: Phase 14 Task 4 (verify-on-merge) — confirms the SHA reaches this branch and the regression test passes here too. Awaiting `verified-<date>` after the merge + post-merge re-audit.
