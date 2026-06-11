---
slug: installation-isolation
targetVersion: ""
---

# Audit log — installation-isolation

## 2026-06-11 — audit-barrage lift (20260611T071134811Z-installation-isolation-after_clarify)

### AUDIT-20260611-01 — Untracked-fold diff entries carry absolute filesystem paths, breaching the installation-relative payload promise

Finding-ID: AUDIT-20260611-01 (claude-01 + claude-05 + claude-07 + codex-01 + codex-03; cross-model)
Status:     fixed-38d80b39
Severity:   high
Surface:    src/govern/payload-implement.ts:310-318 (untracked fold `git diff --no-index` invocation)

The committed arm was converted to `git -C <installation> diff --relative` so payload paths are installation-relative (asserted in `govern-installation-anchor.test.ts` — "committed arm is installation-scoped with installation-relative paths"). The untracked fold was not: it calls `spawnSync('git', ['-C', installationRoot, 'diff', '--no-index', '--no-color', '--', '/dev/null', abs])` with `abs = join(installationRoot, rel)`, and `git diff --no-index` echoes the paths exactly as given — so every untracked file enters the payload as `a/Users/orion/work/...`. The evidence is in this very payload: the trailing hunk reads `diff --git a/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/.git-govern-base.tmp`. This contradicts the quickstart's US3 promise ("payload paths installation-relative"), leaks the operator's local filesystem layout to every external model CLI in the barrage, and produces finding anchors (`Surface:` lines) that don't join with the committed arm's relative paths. The existing test only pins the committed arm's relative shape and checks the untracked fold by substring (`toContain('u-inner.ts')`), which an absolute path also satisfies — so the gap is invisible to the suite. Fix: pass the repo-relative `rel` (cwd is already `-C installationRoot`) instead of `abs`, and extend the T008 test to assert the fold's `a/`-prefix is installation-relative.

### AUDIT-20260611-02 — govern's own scratch file `.git-govern-base.tmp` folds into the payload it governs — governance plumbing without an exclusion or gitignore entry

Finding-ID: AUDIT-20260611-02 (claude-02 + codex-04; cross-model)
Status:     fixed-99b744d4
Severity:   medium
Surface:    src/govern/payload-implement.ts:265-272 (untracked enumeration + exclusion filters); evidence: the final hunk of this audited payload (`.git-govern-base.tmp`, one line containing the diff base SHA)

AUDIT-20260611-08 established the principle that governance bookkeeping must not ride into the payload it governs, and this diff correctly threads the backlog store into `excludePaths` from the installation record (the untracked `task-47` backlog file in the working tree is correctly absent from this payload). But the same self-reference class has another member that slipped through: the govern wrapper's base-recording scratch file `.git-govern-base.tmp` is untracked, not gitignored, lives at the installation root, and is excluded by nothing — so it folded into this payload as its last hunk. Blast radius: every implement-mode governance run on this repo ships its own plumbing to the model fleet as if it were audited work product; models can (as here) burn a finding on it, and the payload's "empty" detection can be defeated by plumbing alone (a run with no real changes but a fresh base file would assemble a non-empty payload). Fix: either gitignore `.git-govern-base.tmp` (matching the existing `.git-commit-msg.tmp` convention in `file-handling.md`) or add it to the governance-plumbing exclusion set alongside the backlog store in `resolveGovernExcludePaths` / the assembler's filters.

### AUDIT-20260611-03 — Cross-tree feature arm's untracked fold is unbounded, and its comment claims a warn-on-skip that does not exist

Finding-ID: AUDIT-20260611-03
Status:     fixed-22f8b606
Severity:   medium
Surface:    src/govern/payload-implement.ts:437-462 (`assembleCrossTreeFeatureArm`, untracked fold loop)

The main installation fold enforces `DEFAULT_UNTRACKED_FOLD_BUDGET` (256 KB) with a logged `skippedOverBudget` ledger. The cross-tree arm's fold deliberately drops the budget, and the in-code justification misstates the resulting behavior: *"the 256KB working-tree budget is not re-applied here — any skip is warned, never silent."* The only skip in the loop is the binary/empty check; there is no size-based skip at all, so nothing exists to warn about — an arbitrarily large untracked file under a cross-tree feature root (a stray fixture, a copied run artifact, a large data file dropped next to spec.md) folds in full. Blast radius: a single oversized artifact silently inflates the governed payload past model context — precisely the failure shape the operator just captured as backlog task-47 ("bloats the payload past model context"). The "spec artifacts are documents" assumption is a hope, not an invariant. Fix: apply the same budget with a warn (or a separate, generous document budget), so the skip the comment promises actually exists; alternatively correct the comment and add a hard size guard that raises `GovernPayloadError` per FR-005 rather than shipping a truncation-prone payload.

### AUDIT-20260611-04 — Four independent `git rev-parse --show-toplevel` derivations introduced in one diff, with divergent error/realpath handling

Finding-ID: AUDIT-20260611-04
Status:     fixed-4f621846
Severity:   medium
Surface:    src/config/installation.ts:42-55; src/scope-discovery/util/feature-root.ts:105-118 (`deriveDistinctGitToplevel`); src/subcommands/govern.ts (`currentToplevel`); src/govern/payload-implement.ts:393-403 (toplevel derivation in `assembleCrossTreeFeatureArm`)

This diff adds the "derived external anchor" pattern (FR-004) in four places, each as its own private `spawnSync('git', ['-C', ..., 'rev-parse', '--show-toplevel'])` with subtly different post-processing: `feature-root.ts` and `installation.ts` realpath-compare and return null/skip on realpath failure; `govern.ts#currentToplevel` does no realpath comparison at all (it compares `top !== installationRoot` by string, which misses the macOS `/var` vs `/private/var` aliasing the other three sites explicitly handle); `payload-implement.ts` realpaths with a fallback-to-raw. The `govern.ts` string comparison is a live behavioral wrinkle: when the installation root IS the toplevel but the two spellings differ (symlinked cwd), `resolveSpecPath` pushes the toplevel as a second base and reads the same CLAUDE.md twice — harmless today, but it shows the copies are already drifting on day one. This is exactly the split-brain class the diff itself fixes elsewhere (clone-detector-reader's private baseline literal, research row 3). Fix: extract one `deriveGitToplevel(base)` helper (with the realpath-aware "distinct from base" variant) and adopt it at all four sites; the project's own check-clones discipline will otherwise flag this on the next baseline refresh.

### AUDIT-20260611-05 — A single `stackctl govern` run in a legacy-debris repo emits the three-part US5 notice once per spawned child verb, not once per operator invocation

Finding-ID: AUDIT-20260611-05
Status:     fixed-54652401
Severity:   low
Surface:    src/config/installation.ts:33-34 (`legacyNoticeFired` module-level latch); src/govern/protocol.ts:205-280 (protocol spawns audit-barrage, lift, slush-findings as child processes)

The once-per-invocation guarantee is implemented as a module-level boolean, which holds per *process*. Govern's protocol spawns the barrage, the lift, and the slush as separate CLI processes, each of which resolves the installation and each of which re-fires the notice — so the operator-visible behavior of one `stackctl govern` invocation in a repo with legacy debris is up to four copies of the same three-line warning interleaved with protocol output. The contracts' wording ("once per invocation") is tested only at single-verb granularity (`installation-isolation-legacy.test.ts` runs one CLI per row), so the multi-emission shape is unpinned and unobserved. Blast radius is cosmetic-to-noisy (no wrong behavior, no wrong writes), hence low — but cry-wolf repetition is the exact failure mode the "no cry-wolf" clause in R6 targets. A cheap fix: have the protocol set an env latch (e.g. `STACKCTL_LEGACY_NOTICE_SEEN=1`) for child spawns, honored by the resolver alongside the in-process boolean.

### AUDIT-20260611-06 — Govern render step still inherits cwd for prompt override resolution

Finding-ID: AUDIT-20260611-06
Status:     fixed-91210169
Severity:   medium
Surface:    src/govern/protocol.ts:189-198; src/subcommands/audit-barrage-render.ts:190-236; src/scope-discovery/audit-barrage/prompt-renderer.ts:109-114

`runProtocol()` threads `--at args.repoRoot` into `audit-barrage` and `audit-barrage-lift`, but the preceding `audit-barrage-render` invocation gets no anchor at all. That subcommand defaults `repoRoot` to its process cwd, and the renderer loads `.stack-control/audit-barrage-prompt.md` relative to that root. So `stackctl govern --at <installation>` run from an outer repo can silently render with the outer/default prompt instead of the installation’s prompt override.

The blast radius is medium: this does not directly write state outside the installation, but it is still stack-control-owned governance configuration bleeding across installation boundaries, and it changes what the model fleet audits. The protocol should pass the resolved installation to render as well, either via the existing read-only `--repo-root` flag or a consistent `--at` render contract.
