# Research: Anchor Unification (016)

No NEEDS CLARIFICATION markers remained after `/speckit-clarify` (two questions resolved; third derived). This document records the design decisions the plan rests on, with rationale and alternatives.

## R1 — Domain model: complete isolation, no overlap

- **Decision**: A domain = the directory containing `.stack-control/` plus all descendants. Domains MUST NOT overlap. No verb consults any file outside its resolved domain (config, context files, audit logs, stores). Enforcement at creation (`setup` refuses inside an existing domain) AND at resolution (walk-up that finds a second marker above the resolved one fails loud naming both roots).
- **Rationale**: Operator decree (spec § Clarifications 2026-06-12): *"COMPLETE ISOLATION between stack control domains … NO OVERLAPPING domains. Complete isolation is the ONLY way to keep plugin behavior sane."* Mechanically, no-overlap turns "which installation applies?" from a precedence question into an invariant violation — there is never more than one candidate.
- **Alternatives considered**: (a) nearest-first nested resolution with config inheritance chain — rejected by decree (cross-domain behavior); (b) git-toplevel shared config — rejected by decree (repo-global behavior); (c) creation-time-only enforcement — rejected: markers can appear via git operations/copies that never ran `setup`, so resolution must also detect.
- **Cost note**: overlap detection extends the walk-up past the first marker to the filesystem root. One extra `existsSync` per ancestor directory; negligible, and it runs only on the resolution path that already walks.

## R2 — One shared anchor seam (`src/config/anchor.ts`)

- **Decision**: New module exporting `resolveAnchor({ at?: string, startDir?: string })` → `{ domainRoot, config }`, wrapping `resolveInstallation` + overlap detection. Every verb (and every *sub-step* of govern) receives the anchor as a value resolved ONCE per invocation — no sub-step calls `process.cwd()`-based resolution independently.
- **Rationale**: The defect class (TASK-56, TASK-40, TASK-53, TASK-22) is N call sites each hand-rolling resolution from ambient cwd. A single seam makes "two sub-steps disagree" structurally impossible (FR-001) — environmental design over instruction, per the thesis. The isolation probe then pins the seam.
- **Alternatives considered**: (a) fix each call site in place without a shared seam — rejected: the divergent-sibling shape is exactly what produced TASK-52, and a tenth verb would regress; (b) a process-global resolved-anchor singleton — rejected: hidden state, untestable, and breaks `--at`-per-invocation semantics in tests.

## R3 — Retire the toplevel context-file consultation; extract `resolve-spec-path.ts`

- **Decision**: Spec-pointer resolution consults ONLY the domain's context file. The two-base loop (installation + git toplevel, govern.ts ~225–233) is removed. The match is anchored to the full pointed path, validated to exist, and failure is loud (marker text + base named). Extracted to `src/govern/resolve-spec-path.ts` (also relieves govern.ts's over-cap).
- **Rationale**: The toplevel layer is cross-domain consultation (prohibited by R1) and is what made TASK-50's wrong-base join reachable. Existence-validation independently kills the silently-audit-a-stale-spec failure.
- **Alternatives considered**: (a) keep the toplevel base but validate existence — rejected: still cross-domain, still selects a stale toplevel copy when it exists (the AUDIT-20260612-03 "bad case"); (b) anchor the regex but keep both bases — same objection.
- **Migration note**: the monorepo-root CLAUDE.md retains its human-facing pointer prose; it simply stops being a *resolver input*. The domain's own CLAUDE.md (`plugins/stack-control/CLAUDE.md`) carries the marker — already true in this repo.

## R4 — Config: two-level resolution + setup seeding

- **Decision**: Barrage config resolves domain override → plugin-shipped template default, nothing else (current loader already does this — verified; no repo-root/env source exists). Changes: (a) `stackctl setup` seeds `audit-barrage-config.yaml` into the new domain as an owned copy of the plugin template; (b) every governed run reports the resolved source (`domain-override` | `plugin-default`); (c) a malformed domain config fails loud (no silent fall-through to default).
- **Rationale**: TASK-55's pain was the *surprise* (operator believed tuned settings applied; defaults did). Under isolation the fix is making the domain's config exist intentionally from birth + making the in-effect source visible. Divergence between domains is by design.
- **Alternatives considered**: (a) inheritance chain — rejected by decree; (b) report-only without seeding — rejected: first-run still burns a round before the operator learns; (c) hard-require a domain config (no plugin default) — rejected: breaks every existing domain and contradicts "no new requirement to create configs" for pre-existing ones (spec US2 scenario 2 keeps the default path, reported).

## R5 — `--at` on the backlog dispatcher

- **Decision**: One `--at <dir>` flag parsed at the `backlog` dispatcher level, threaded as `startDir` into `backlogRoot()`/`resolveInstallationBacklog()` (plumbing already accepts it) and into import-slush's audit-log resolution. The cwd test's "backlog has no --at by contract" carve-out is deleted; backlog rows join the same three-variant (root / subdir / `--at`-from-outside) matrix as other state-writing verbs.
- **Rationale**: Ratified in clarify (Q1). Constitution stays uniform; new verbs inherit.
- **Alternatives considered**: constitution qualifier — rejected by operator.

## R6 — import-slush, promote advisory: derive from the anchor

- **Decision**: `import-slush` resolves the feature audit log via the invocation's anchor (`resolveFeatureRoot({ repoRoot: anchor.domainRoot })`), not `process.cwd()`. `promote`'s pending-create advisory joins target paths against `anchor.domainRoot`.
- **Rationale**: Direct instances of the FR-001 seam (TASK-53, TASK-22); both are one-line consumers once R2 exists.
- **Alternatives considered**: none credible — these are straightforward wrong-base bugs.

## R7 — govern exclusion/slush: same anchor, loud divergence, in-repo seam test

- **Decision**: govern computes its anchor once (already does: `installation.root`) and passes it into `resolveGovernExcludePaths` and the slush step — no `process.cwd()` resolution inside sub-steps. If the slush/backlog sub-step cannot operate against that anchor, govern fails LOUD (the non-fatal exit-1 skip is retired). The payload assembler is changed so a resolved exclusion that would be filtered as out-of-repo is an error, not inert (FR-003). A new test exercises `runGovern → resolveGovernExcludePaths → assembler` against a committed in-repo store WITHOUT `STACKCTL_BACKLOG_DIR`.
- **Rationale**: TASK-40's channel is "exclusion resolved against the wrong root, then silently filtered inert." With one anchor the wrong root can't happen; with inert-is-an-error a future regression is loud; with the seam test the integration is pinned (the finding explicitly flagged the seam as structurally untested).
- **Alternatives considered**: warning-not-error on inert exclusion — rejected (Principle V / FR-012; a warning in an unattended loop is a skip).
- **`STACKCTL_BACKLOG_DIR` interaction** (spec edge case): the env override names the store explicitly; the exclusion then excludes the *override* store. If that store is outside the repo frame, there is nothing in-frame to exclude — and the committed in-repo store (if one ALSO exists at the anchor) must still be excluded; the implementation excludes both candidates: the active store and the anchor's committed store path.

## R8 — One wording-class helper

- **Decision**: `classifyResolverError(err)` in the anchor module: `not-found` → the `FATAL — ` + `stackctl setup` class; every other resolver error → verb-prefixed verbatim message, no class. All eight current emission sites consume it (two already-gated sites keep behavior; six unconditional sites change for non-not-found errors only).
- **Rationale**: TASK-52; one decision point is the only durable fix for divergent siblings. The not-found wording is a frozen adopter contract — unchanged.
- **Alternatives considered**: documenting the convention — rejected (advice, not interlock).

## R9 — Fixture self-guard

- **Decision**: `makeMarkerlessFixture`/`makeNestedFixture` assert at initialization that the walk-up from the OS tmpdir resolves NO installation, failing with an explanatory message before any verb under test runs. (The new overlap detection from R1 reuses the same primitive.)
- **Rationale**: TASK-49 — the harness must be incapable of writing real operator state on any host (FR-010); a comment is not a check.
- **Alternatives considered**: sandboxing writes via env override in fixtures — insufficient: refusal *rows* intentionally run without the override.

## R10 — Constitution amendment 1.3.0 → 1.4.0

- **Decision**: Amend the installation-anchor Additional Constraint: add the domain definition, the no-overlap invariant, domain-complete configuration (override → plugin default, nothing else), and delete the implicit nested-installation allowance. Same change as the implementation (Governance: amendment + behavior land together). MINOR bump (materially expanded guidance).
- **Rationale**: The decree is constitutional in nature; leaving the constitution at "nearest-enclosing" while code refuses overlap would put spec and code in contradiction.
- **Alternatives considered**: leaving the constitution untouched — rejected per Governance section (compliance is checked at planning; drift is the failure mode the document exists to prevent).
