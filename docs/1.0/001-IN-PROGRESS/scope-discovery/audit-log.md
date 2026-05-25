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
