---
slug: installation-isolation
targetVersion: ""
---

# Audit log — installation-isolation

## 2026-06-11 — audit-barrage lift (20260611T071134811Z-installation-isolation-after_clarify)

### AUDIT-20260611-01 — Untracked-fold diff entries carry absolute filesystem paths, breaching the installation-relative payload promise

Finding-ID: AUDIT-20260611-01 (claude-01 + claude-05 + claude-07 + codex-01 + codex-03; cross-model)
Status:     fixed-36847495
Severity:   high
Surface:    src/govern/payload-implement.ts:310-318 (untracked fold `git diff --no-index` invocation)

The committed arm was converted to `git -C <installation> diff --relative` so payload paths are installation-relative (asserted in `govern-installation-anchor.test.ts` — "committed arm is installation-scoped with installation-relative paths"). The untracked fold was not: it calls `spawnSync('git', ['-C', installationRoot, 'diff', '--no-index', '--no-color', '--', '/dev/null', abs])` with `abs = join(installationRoot, rel)`, and `git diff --no-index` echoes the paths exactly as given — so every untracked file enters the payload as `a/Users/orion/work/...`. The evidence is in this very payload: the trailing hunk reads `diff --git a/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/.git-govern-base.tmp`. This contradicts the quickstart's US3 promise ("payload paths installation-relative"), leaks the operator's local filesystem layout to every external model CLI in the barrage, and produces finding anchors (`Surface:` lines) that don't join with the committed arm's relative paths. The existing test only pins the committed arm's relative shape and checks the untracked fold by substring (`toContain('u-inner.ts')`), which an absolute path also satisfies — so the gap is invisible to the suite. Fix: pass the repo-relative `rel` (cwd is already `-C installationRoot`) instead of `abs`, and extend the T008 test to assert the fold's `a/`-prefix is installation-relative.

### AUDIT-20260611-02 — govern's own scratch file `.git-govern-base.tmp` folds into the payload it governs — governance plumbing without an exclusion or gitignore entry

Finding-ID: AUDIT-20260611-02 (claude-02 + codex-04; cross-model)
Status:     fixed-9c78581c
Severity:   medium
Surface:    src/govern/payload-implement.ts:265-272 (untracked enumeration + exclusion filters); evidence: the final hunk of this audited payload (`.git-govern-base.tmp`, one line containing the diff base SHA)

AUDIT-20260611-08 established the principle that governance bookkeeping must not ride into the payload it governs, and this diff correctly threads the backlog store into `excludePaths` from the installation record (the untracked `task-47` backlog file in the working tree is correctly absent from this payload). But the same self-reference class has another member that slipped through: the govern wrapper's base-recording scratch file `.git-govern-base.tmp` is untracked, not gitignored, lives at the installation root, and is excluded by nothing — so it folded into this payload as its last hunk. Blast radius: every implement-mode governance run on this repo ships its own plumbing to the model fleet as if it were audited work product; models can (as here) burn a finding on it, and the payload's "empty" detection can be defeated by plumbing alone (a run with no real changes but a fresh base file would assemble a non-empty payload). Fix: either gitignore `.git-govern-base.tmp` (matching the existing `.git-commit-msg.tmp` convention in `file-handling.md`) or add it to the governance-plumbing exclusion set alongside the backlog store in `resolveGovernExcludePaths` / the assembler's filters.

### AUDIT-20260611-03 — Cross-tree feature arm's untracked fold is unbounded, and its comment claims a warn-on-skip that does not exist

Finding-ID: AUDIT-20260611-03
Status:     fixed-af928a1f
Severity:   medium
Surface:    src/govern/payload-implement.ts:437-462 (`assembleCrossTreeFeatureArm`, untracked fold loop)

The main installation fold enforces `DEFAULT_UNTRACKED_FOLD_BUDGET` (256 KB) with a logged `skippedOverBudget` ledger. The cross-tree arm's fold deliberately drops the budget, and the in-code justification misstates the resulting behavior: *"the 256KB working-tree budget is not re-applied here — any skip is warned, never silent."* The only skip in the loop is the binary/empty check; there is no size-based skip at all, so nothing exists to warn about — an arbitrarily large untracked file under a cross-tree feature root (a stray fixture, a copied run artifact, a large data file dropped next to spec.md) folds in full. Blast radius: a single oversized artifact silently inflates the governed payload past model context — precisely the failure shape the operator just captured as backlog task-47 ("bloats the payload past model context"). The "spec artifacts are documents" assumption is a hope, not an invariant. Fix: apply the same budget with a warn (or a separate, generous document budget), so the skip the comment promises actually exists; alternatively correct the comment and add a hard size guard that raises `GovernPayloadError` per FR-005 rather than shipping a truncation-prone payload.

### AUDIT-20260611-04 — Four independent `git rev-parse --show-toplevel` derivations introduced in one diff, with divergent error/realpath handling

Finding-ID: AUDIT-20260611-04
Status:     fixed-d108a6c7
Severity:   medium
Surface:    src/config/installation.ts:42-55; src/scope-discovery/util/feature-root.ts:105-118 (`deriveDistinctGitToplevel`); src/subcommands/govern.ts (`currentToplevel`); src/govern/payload-implement.ts:393-403 (toplevel derivation in `assembleCrossTreeFeatureArm`)

This diff adds the "derived external anchor" pattern (FR-004) in four places, each as its own private `spawnSync('git', ['-C', ..., 'rev-parse', '--show-toplevel'])` with subtly different post-processing: `feature-root.ts` and `installation.ts` realpath-compare and return null/skip on realpath failure; `govern.ts#currentToplevel` does no realpath comparison at all (it compares `top !== installationRoot` by string, which misses the macOS `/var` vs `/private/var` aliasing the other three sites explicitly handle); `payload-implement.ts` realpaths with a fallback-to-raw. The `govern.ts` string comparison is a live behavioral wrinkle: when the installation root IS the toplevel but the two spellings differ (symlinked cwd), `resolveSpecPath` pushes the toplevel as a second base and reads the same CLAUDE.md twice — harmless today, but it shows the copies are already drifting on day one. This is exactly the split-brain class the diff itself fixes elsewhere (clone-detector-reader's private baseline literal, research row 3). Fix: extract one `deriveGitToplevel(base)` helper (with the realpath-aware "distinct from base" variant) and adopt it at all four sites; the project's own check-clones discipline will otherwise flag this on the next baseline refresh.

### AUDIT-20260611-05 — A single `stackctl govern` run in a legacy-debris repo emits the three-part US5 notice once per spawned child verb, not once per operator invocation

Finding-ID: AUDIT-20260611-05
Status:     fixed-1b47e470
Severity:   low
Surface:    src/config/installation.ts:33-34 (`legacyNoticeFired` module-level latch); src/govern/protocol.ts:205-280 (protocol spawns audit-barrage, lift, slush-findings as child processes)

The once-per-invocation guarantee is implemented as a module-level boolean, which holds per *process*. Govern's protocol spawns the barrage, the lift, and the slush as separate CLI processes, each of which resolves the installation and each of which re-fires the notice — so the operator-visible behavior of one `stackctl govern` invocation in a repo with legacy debris is up to four copies of the same three-line warning interleaved with protocol output. The contracts' wording ("once per invocation") is tested only at single-verb granularity (`installation-isolation-legacy.test.ts` runs one CLI per row), so the multi-emission shape is unpinned and unobserved. Blast radius is cosmetic-to-noisy (no wrong behavior, no wrong writes), hence low — but cry-wolf repetition is the exact failure mode the "no cry-wolf" clause in R6 targets. A cheap fix: have the protocol set an env latch (e.g. `STACKCTL_LEGACY_NOTICE_SEEN=1`) for child spawns, honored by the resolver alongside the in-process boolean.

### AUDIT-20260611-06 — Govern render step still inherits cwd for prompt override resolution

Finding-ID: AUDIT-20260611-06
Status:     fixed-ba6b3feb
Severity:   medium
Surface:    src/govern/protocol.ts:189-198; src/subcommands/audit-barrage-render.ts:190-236; src/scope-discovery/audit-barrage/prompt-renderer.ts:109-114

`runProtocol()` threads `--at args.repoRoot` into `audit-barrage` and `audit-barrage-lift`, but the preceding `audit-barrage-render` invocation gets no anchor at all. That subcommand defaults `repoRoot` to its process cwd, and the renderer loads `.stack-control/audit-barrage-prompt.md` relative to that root. So `stackctl govern --at <installation>` run from an outer repo can silently render with the outer/default prompt instead of the installation’s prompt override.

The blast radius is medium: this does not directly write state outside the installation, but it is still stack-control-owned governance configuration bleeding across installation boundaries, and it changes what the model fleet audits. The protocol should pass the resolved installation to render as well, either via the existing read-only `--repo-root` flag or a consistent `--at` render contract.

## 2026-06-11 — audit-barrage lift (20260611T120507248Z-installation-isolation-after_clarify)

### AUDIT-20260611-09 — Commit-subjects metadata is not installation-scoped — outer-repo commits leak into the governed payload and invite spurious model findings

Finding-ID: AUDIT-20260611-09 (claude-01 + claude-03 + codex-02; cross-model)
Status:     fixed-3a6c27bd
Severity:   medium
Surface:    src/govern/payload-implement.ts:334 (`const commitSubjects = git(installationRoot, ['log', `${base}..HEAD`, '--oneline'])`)

The committed arm was correctly re-anchored: `git -C <installation> diff --relative` both rel-ifies AND filters to the installation subtree, and the test 'committed arm is installation-scoped with installation-relative paths' (src/__tests__/govern-installation-anchor.test.ts:44-66) pins that `outer-change.txt` never appears in the diff. But `commitSubjects` kept its pre-isolation shape — `git log <base>..HEAD --oneline` with NO pathspec — so in a nested layout (this very repo: installation at plugins/stack-control inside the monorepo), every commit in range that touches ONLY the outer tree still ships its subject line to the model fleet, with zero corresponding hunks in the payload. Blast radius: (a) the payload's own framing tells models to "call out a missing surface that should be in the diff but isn't" — a subject with no hunks is precisely that bait, so this is a per-run spurious-finding generator across the whole fleet; (b) outer-repo commit messages (activity the isolation invariant says is not part of the audited unit) leak off-box. The anchor test can't catch it because its one commit touches both trees, so the subject is legitimately present either way. Fix: path-limit the log the same way the diff is limited — `git -C <installation> log <base>..HEAD --oneline -- .` — and, when a cross-tree feature arm exists, additionally include the feature root's pathspec (the arm's commits should keep their subjects) so subjects and hunks stay joined. Add a test commit touching only the outer tree and assert its subject is absent.
```

```

### AUDIT-20260611-10 — scope-widen / scope-inventory write evidence under a cross-tree feature root with no announcement — the R4 announce norm applies only to govern

Finding-ID: AUDIT-20260611-10 (claude-02 + claude-05 + codex-01; cross-model)
Status:     fixed-af90b3f7
Severity:   medium
Surface:    src/scope-discovery/scope-widen.ts:286-343 (featureRoot resolution + `stageRun` → `makeRunDir({featureRoot})`); src/scope-discovery/scope-inventory.ts:309-330; src/scope-discovery/util/feature-root.ts:103-130 (the new derived-toplevel layer 2)

The new two-layer `resolveFeatureRoot` deliberately lets the feature root resolve at the derived git toplevel — OUTSIDE the installation — for the transitional layout. govern handles that case loudly: the assembler warns `feature anchor outside the installation: <path> (designated anchor — artifacts land there)` (payload-implement.ts:320-323, pinned by the labeled-arm test). But scope-widen and scope-inventory, which WRITE under the feature root (widen-run dirs, the augmented PRD via `stageRun`/`makeRunDir({featureRoot})`, evidence trails, default `--out`), thread the same resolver and emit nothing when the resolved root lies at the toplevel. The probe harness even codifies the silence: the scope-widen row exempts `docs/` from the outer-tree snapshot as "the designated feature anchor" with no corresponding announcement assertion (installation-isolation-probe.test.ts, ROWS row 2). Blast radius: for an adopter mid-transition (spec artifacts still at the monorepo root, installation below), a verb invoked with `--at <installation>` silently creates run dirs and files in the OUTER tree — sanctioned by FR-008's anchor exemption, but invisible, which is exactly the "state lands somewhere the operator didn't watch" shape this feature exists to make loud, and asymmetric with the announce-once norm R4/SC-006 establishes for govern. Fix: when `resolveFeatureRoot` returns a root whose rel-ification against the installation escapes (`../`), emit the same one-line designated-anchor announcement from scope-widen/scope-inventory before writing, and pin it next to the existing layer-2 tests.
```

```

### AUDIT-20260611-11 — Constitution amendment states "the repo-root parameter is retired" unqualified, while protocol.ts now load-bears on render's surviving --repo-root

Finding-ID: AUDIT-20260611-11
Status:     fixed-47a46c83
Severity:   low
Surface:    .specify/memory/constitution.md:158-165 (installation-anchor invariant wording) vs src/govern/protocol.ts:190-207 (render threading via `--repo-root`)

The constitution's new Additional Constraint says external-tool anchors are "never accepted as free parameters that can place stack-control state (the repo-root parameter is retired)" — no qualifier. The implementation's actual rule (R2, restated in the govern-installation-anchor test comment at src/__tests__/govern-installation-anchor.test.ts:330-338) is narrower: retired on state-WRITING verbs only; `audit-barrage-render` keeps `--repo-root`, and the AUDIT-20260611-06 fix makes that surviving flag the protocol's only carrier for the render anchor. A future agent acting on the constitution as written — the document explicitly framed as the governance-level record new verbs "inherit by default" — would retire render's flag and sever the carrier. Blast radius is contained because the end-to-end anchor test pins `renderLine` containing `--repo-root`, so the regression fails loudly in CI rather than shipping; that containment is why this is low rather than high. Fix: one clause in the constitution ("retired on state-writing verbs; read-side verbs may keep a read-only repo-root") or, longer-term, migrate render to the same `--at` contract so the qualifier becomes unnecessary.
```

```

### AUDIT-20260611-12 — govern-spec.sh retired GOVERN_REPO_ROOT but its env-only interface gained no replacement carrier for the advice it gives

Finding-ID: AUDIT-20260611-12
Status:     fixed-47a46c83
Severity:   low
Surface:    spec-kit/spec-governance/scripts/bash/govern-spec.sh:16-23 (env-var interface header)

The header now reads `GOVERN_REPO_ROOT RETIRED … pass --at <dir>` — but the script's documented interface is environment variables (GOVERN_SPEC_PATH, GOVERN_PLAN_PATH, GOVERN_CHECKPOINT, …), and no GOVERN_AT (or pass-through argument) was added in this diff. A caller of the shim that previously used GOVERN_REPO_ROOT for testability/explicit anchoring has no env-level way to follow the header's own remediation; the only working path is "cd into the installation first", which the header does not say. Blast radius is mild: setting the retired variable produces the loud FATAL from govern.ts (good — never a silent no-op), and the normal Spec Kit flow already runs with the installation as cwd per this repo's conventions, so the in-tree flow is unaffected — hence low. Fix: either document "run with cwd inside the installation" as the shim's anchoring contract in the same header block, or add an explicit pass-through (the shim forwarding `--at "$GOVERN_AT"` when set) so the remediation the header names is actually expressible through the interface the header documents.
```

## 2026-06-12 — audit-barrage lift (20260612T053439377Z-installation-isolation-after_clarify)

### AUDIT-20260612-01 — `payload-implement.ts` grew to 577 lines — past the project's hard 300–500-line refactor cap

Finding-ID: AUDIT-20260612-01
Status: migrated-to-backlog TASK-48
Severity:   low
Surface:    src/govern/payload-implement.ts (whole file, 577 lines; the diff adds ~250 lines: `mergeSubjectLines` + `assembleCrossTreeFeatureArm` + the cross-tree integration block at 334-370)

The project's CLAUDE.md states "Files must be under 300–500 lines — refactor larger files." This diff pushes `payload-implement.ts` from ~340 to 577 lines (verified with `wc -l`), and the file now carries two separable units: the installation-arm assembler and the entire cross-tree feature arm (`assembleCrossTreeFeatureArm`, ~140 lines, with its own toplevel derivation, its own untracked fold, and its own subjects log — a near-clone of the main fold's loop structure at lines 270-330 vs 470-540). `src/subcommands/govern.ts` also sits at 503, just over the cap. Blast radius: maintainability debt that compounds — the duplicated fold loop (binary skip + budget skip + `--no-index` render appears twice with slightly different filters) is exactly the divergence shape AUDIT-20260611-04 just closed for git-toplevel derivations; the next budget-semantics fix has to land in two places or silently diverge. A reasonable fix: extract the cross-tree arm (and ideally the shared untracked-fold loop) into `src/govern/payload-cross-tree.ts`, parameterizing the per-file filters.

---

### AUDIT-20260612-02 — Isolation fixtures' walk-up is unbounded — a real installation above the OS tmpdir silently re-anchors "refusal" rows into writes against real operator state

Finding-ID: AUDIT-20260612-02 (claude-02 + claude-03 + claude-07 + codex-01; cross-model)
Status: migrated-to-backlog TASK-49
Severity:   medium
Surface:    src/__tests__/_isolation-harness.ts:100-104 (`makeMarkerlessFixture` comment "no `.stack-control/config.yaml` anywhere above the tmpdir"); src/config/installation.ts:92-113 (walk-up terminates only at the filesystem root)

`resolveInstallation` walks from `startDir` all the way to `/` (verified: the loop breaks only when `parent === dir`). The marker-less and nested fixtures live under `mkdtempSync(join(tmpdir(), …))`, and the harness *asserts in a comment* — but never verifies — that no installation exists above the tmpdir. On a machine where any ancestor of the tmpdir carries `.stack-control/config.yaml` (e.g. a developer who once ran `stackctl setup` in `/tmp` on Linux, or a misplaced marker at `$HOME` if tmpdir ever resolves under it), every US2 refusal row resolves that real installation instead: the refusal tests fail loudly (good), but the verbs first **write real state into that operator installation** — `backlog capture` creates a task file, `install-scope-discovery` seeds scope-discovery state — which is precisely the "state lands somewhere the operator didn't watch" shape this feature exists to prevent, now produced by its own test suite. Blast radius is gated on an unlikely host configuration, hence low — but the failure mode mutates non-fixture state, which is worse than a flake. Fix: in `makeMarkerlessFixture` (and `makeNestedFixture`), assert `findInstallation(tmpdir()) === null` and fail with an explanatory message before running any verb, or write a marker-less sentinel that a test-only walk-up boundary respects.

---

### AUDIT-20260612-03 — `resolveSpecPath`'s unanchored regex joins a mid-string `specs/…` match against the wrong base — the new toplevel layer widens the exposure to exactly the transitional layout this feature supports

Finding-ID: AUDIT-20260612-03
Status: migrated-to-backlog TASK-50
Severity:   medium
Surface:    src/subcommands/govern.ts:193-219 (the two-base loop + `/specs\/[^\s]+\.md/` at line 214, `join(base, dirname(m[0]), 'spec.md')` at 215)

The regex matches anywhere in the line, so a SPECKIT marker that points *into* the installation — `plugins/stack-control/specs/<feat>/plan.md`, the natural pointer shape for a monorepo-root CLAUDE.md after a US6 relocation — matches starting at `specs/`, dropping the `plugins/stack-control/` prefix, and line 215 joins the truncated path against the *toplevel* base, yielding `<toplevel>/specs/<feat>/spec.md`. The pre-diff code had the same regex, but the new loop (lines 202-216) is what adds the toplevel CLAUDE.md as a consulted base, so the wrong-base join is newly reachable whenever the installation itself lacks a CLAUDE.md (mid-transition: relocated specs, root pointer updated to the full nested path, installation pointer not yet written — a state T017 passed through). Blast radius: in the common case the joined path doesn't exist and govern fails loudly downstream with a confusing ENOENT naming a path nobody wrote; in the bad case — an adopter who *copied* rather than `git mv`'d during migration, leaving a stale pre-relocation `specs/<feat>/spec.md` at the toplevel — `govern --mode spec` resolves cleanly and the barrage **audits the stale spec revision** with no signal anything is wrong, in a flow explicitly designed for unattended convergence loops. Fix: validate the match resolves to an existing file before accepting it (falling through to the next base / the FATAL otherwise), and anchor the regex so the matched path is taken whole (e.g. match the full token between whitespace and verify it starts the path you join).

---

### AUDIT-20260612-04 — `backlog capture`/`import-github` are in the R5 state-writing set but expose no `--at` — the constitution's "explicitly named via `--at <dir>`" contract is unimplementable for them

Finding-ID: AUDIT-20260612-04
Status: migrated-to-backlog TASK-51
Severity:   low
Surface:    .specify/memory/constitution.md:158-167 (installation-anchor invariant wording) vs src/__tests__/installation-isolation-cwd.test.ts:131 ("backlog has no --at by contract"); src/subcommands/backlog.ts

The constitution 1.3.0 amendment states every state-writing verb anchors state "inside the nearest-enclosing installation (or an explicitly named one via `--at <dir>`)" with no per-verb qualifier — and names the isolation probe as the invariant's "permanent enforcement." But the backlog verbs, which the probe and refusal suites both treat as state-writing rows, accept no `--at`; the cwd test codifies the gap as contract ("backlog has no --at by contract") and quietly runs only two of the three cwd variants for it. An operator — or an unattended agent reading the constitution as the inheritance document it announces itself to be ("new verbs inherit this invariant by default") — has no way to anchor a capture from an outer repo except `cd`, and an agent that tries `backlog capture --at <dir>` per the constitution hits an unknown-flag error. Blast radius is contained because the failure is loud (unknown flag / refusal), never a misplaced write — hence low. Fix: either add `--at` to the backlog dispatcher (it already threads `startDir` through `backlogRoot()`/`resolveInstallationBacklog()`, so the plumbing landed in this very diff at src/backlog/root.ts:30-44) or add the same one-clause qualifier to the constitution that AUDIT-20260611-11 added for read-side repo-root.

---

### AUDIT-20260612-05 — The `FATAL —` wording class is gated on `not-found` in two verbs but applied to *every* resolver error in five others

Finding-ID: AUDIT-20260612-05
Status: migrated-to-backlog TASK-52
Severity:   low
Surface:    src/subcommands/backlog.ts:301-305 and src/scope-discovery/install-scope-discovery.ts:221-228 (gated) vs src/scope-discovery/scope-widen.ts:281, src/scope-discovery/scope-inventory.ts:312, src/subcommands/slush-findings.ts:135, src/subcommands/audit-barrage.ts:365, src/subcommands/audit-barrage-lift.ts:403 (unconditional)

Two of the converted verbs carefully scope the new US2 wording: backlog.ts checks `err.code === 'not-found'` with the explicit comment "other installation errors keep their existing wording + codes (frozen contracts)," and install-scope-discovery does the same. The other five catch blocks wrap **whatever** `resolveCodebaseBoundary` throws — including malformed-config parse errors, escape/collision errors, anything from `loadInstallationConfig` — in the same `<verb>: FATAL — ` prefix. So the same underlying condition (say, a corrupt `config.yaml`) renders as `backlog: <message>` from one verb and `scope-widen: FATAL — <message>` from another, and the "uniform wording class" the US2 tests pin is uniform only for the not-found case the tests happen to exercise. Blast radius: cosmetic-to-mild — no placement or exit-code consequence, but any tooling or skill body that pattern-matches `FATAL — ` as "no installation, run stackctl setup" will mis-classify config-corruption errors from five verbs, and the two-verbs-gate/five-verbs-don't split is the same divergent-sibling shape AUDIT-20260611-04 closed for git derivations. Fix: lift the `not-found → 'FATAL — '` prefix decision into one shared helper next to `resolveCodebaseBoundary` and use it at all seven sites.

---

### AUDIT-20260612-06 — `backlog import-slush` still resolves its audit log from raw cwd

Finding-ID: AUDIT-20260612-06
Status: migrated-to-backlog TASK-53
Severity:   medium
Surface:    src/subcommands/backlog.ts:89-96,155-177

The backlog store side now resolves through `resolveInstallationBacklog()` in `ensureBacklogProject()`, but `import-slush` then resolves the feature audit log with `const cwd = process.cwd(); resolveFeatureRoot({ repoRoot: cwd, ... })`. From an installation subdirectory, the store will be scaffolded/written under the enclosing installation, while the audit-log lookup searches only under the subdirectory and fails to find normal installation-root `specs/` or `docs/` features. That leaves one state-writing backlog import path outside the “cwd never decides placement” model.

The blast radius is medium: the common installation-root invocation works, and the failure is loud rather than an outer-tree write, but the same command no longer behaves invariantly from subdirectories, and `import-slush` is a mutating backlog import surface. Reasonable fix: have `ensureBacklogProject` expose the resolved installation/start root, or resolve it once in `runBacklogCli`, and pass that root into `resolveAuditLog` instead of using `process.cwd()`.
