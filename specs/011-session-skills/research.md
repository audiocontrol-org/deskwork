# Research: session-skills (Phase 0)

Decisions grounded in the existing code (the Explore code-map), 009's config+resolution contract, and the two concrete session-skill instances. No NEEDS CLARIFICATION remained after `/speckit-clarify` (all four open questions resolved); these decisions are technical-approach choices, each traced to real source.

## D1 — Two thin verbs over a pure `src/session/` module

- **Decision**: `session-start` and `session-end` are registered in `src/cli.ts` `SUBCOMMANDS` (`Record<string, (args: string[]) => Promise<void>>`, cli.ts:27–53), each delegating to a thin `runSessionStartCli` / `runSessionEndCli`. All logic lives in pure, separately-tested `src/session/*` functions injected into the handlers.
- **Rationale**: matches every existing verb (`runInboxCli`/`runBacklogCli`); keeps each file under the 500-line cap (Principle VI); the pure functions are unit-testable without spawning the CLI.
- **Alternatives**: one monolithic `session.ts` (rejected — cap + testability); a class hierarchy (rejected — Principle VI composition-over-inheritance).

## D2 — Decoupling = consume 009's `src/config/` port; extend its key set

- **Decision**: both verbs resolve every working file through 009's shared port — `resolveInstallation(startDir)` (upward walk to nearest `.stack-control/config.yaml`, nearest-wins, fail-loud) and `resolvePaths(root, config)` (per-file override > base_dir > audience-split default). session-skills **extends** the config's `WorkingFileKey` union and `ResolvedPaths` with three keys it owns: `journal`, `tooling_feedback`, `clone_scope` (camelCase `toolingFeedback`, `cloneScope` in memory).
- **Rationale**: this is the #122 decoupling — no hardcoded paths/branch/slug. 009's spec FR-001 declares the managed set **extensible** ("a capability that needs a new installation-level working file adds it to setup's set as it migrates in"); session-skills is exactly that capability and the **second real consumer** that proves the port (Principle II). One config per installation, not a parallel one.
- **Alternatives**: a separate `session-config.yaml` (rejected — two configs per installation violates 009's "one source the read-side resolves against"); hardcoded paths (rejected — the entire reason the pair is native, #122).
- **Sequencing**: see plan § Dependency-sequencing note — build-order vs 009 is an operator/roadmap call, not a DEFINE blocker (spec is to the contract).

## D3 — Branch-staleness base resolution (resolves OQ-1)

- **Decision**: base = the branch's configured **upstream** (`git rev-parse --abbrev-ref --symbolic-full-name @{upstream}`) if set; else the **repository default branch** (`git symbolic-ref --quiet refs/remotes/origin/HEAD`, falling back to `origin/main`/`origin/master` detection). Behind-count via `git rev-list --left-right --count <base>...HEAD`. When neither base resolves, or HEAD is detached, **skip cleanly with an explicit note** (FR-017) — never error the boot.
- **Rationale**: least-surprising + portable (Clarification OQ-1). Reuses the `execSync('git …')` precedent in `src/repo.ts` (repo.ts:4–37); adds upstream/default-branch/ahead-behind helpers there (or a sibling `src/session/git.ts`).
- **Alternatives**: always `origin/main` (rejected — ignores a branch that tracks something specific); a configured-per-installation base (rejected — OQ-1 picked upstream-else-default; a config key can be added later if needed, captured not built).

## D4 — Chain-position inference from Spec Kit artifacts

- **Decision**: session-start reads `.specify/feature.json` (`feature_directory`) — Spec Kit's own active-feature pointer — then inspects which artifacts exist in that dir (`spec.md`, `plan.md`, `research.md`, `tasks.md`, `checklists/`, `contracts/`) and maps the present-set → the next `/speckit-*` step (e.g. plan-but-no-tasks → `/speckit-tasks`; tasks present → `/speckit-analyze` / `/speckit-implement`). No active feature (or missing `feature.json`) → report "no active spec" and proceed (FR-005).
- **Rationale**: uses the authoring tool's own pointer rather than inventing a parallel "active feature" notion (Principle VIII); concretely Spec-Kit-based, consistent with the constitution's "build against Spec Kit first, generalize later" (the provider port is deferred). Mirrors the branch-local session-start's chain-position step.
- **Alternatives**: parse the git branch name for a feature slug (rejected — the single-long-lived-branch convention means the branch name doesn't encode the active feature; that's exactly the dw-lifecycle coupling being removed); a stack-control-specific active-feature file (rejected — duplicates `feature.json`).

## D5 — Journal entry: auto-derive mechanical, leave narrative (resolves OQ-4)

- **Decision**: session-end auto-derives the **mechanical/quantitative** sections from `git log <boundary>..HEAD` — commit count + subjects, files-changed, and **backlog items touched** (IDs referenced in commit messages) — and emits **empty narrative slots** (Goal / Accomplished / Didn't-Work / Course-Corrections / Insights) for the agent to fill; the assembled entry is operator-editable before the commit. The session boundary SHA is resolved priority-ordered (explicit flag → merge-base with the base branch → `HEAD~N` fallback), mirroring dw-lifecycle's `session-end-hygiene` boundary logic. The entry shape follows the project's **configured journal template** when present, else a documented default (FR-013) — never a baked-in deskwork taxonomy.
- **Rationale**: Clarification OQ-4; honors the project's quantitative-reporting rule (numbers re-derived from source, never fabricated) and avoids the model inventing narrative it didn't live.
- **Alternatives**: fully auto-generate including narrative (rejected — fabrication risk, OQ-4 B declined); fully manual skeleton (rejected — loses the honest auto-derived counts, OQ-4 C declined).

## D6 — "Progressed backlog items" from commit references

- **Decision**: session-end surfaces backlog items **referenced in the session's commits** (backlog IDs, e.g. `TASK-N`, parsed from `git log <boundary>..HEAD` subjects+bodies), cross-referenced against the backlog `list()` (`src/backlog/backend.ts` — `BacklogItem.id`/`status`). It surfaces them as evidence and performs **0 status transitions** (operator owns the transition, FR-009/SC-006). No GitHub-issue query anywhere.
- **Rationale**: the backlog backend exposes `list()` + `status` but **no changed-since API** (code map item 3); deriving from commit refs is mechanical + re-derivable and mirrors dw-lifecycle's issues-touched-from-`#NNN`, retargeted to backlog IDs. Whether 008 grows a first-class changed-since surface is flagged (plan § Scope-coordination note), not built here.
- **Alternatives**: diff two `list()` snapshots across the session (rejected — session-start is read-only and stores no snapshot; brittle); add a changed-since API to the backlog backend now (rejected — 008-owned, speculative here).

## D7 — Clone-snapshot reuse + configured scope

- **Decision**: session-end shells to the existing clone-snapshot capability scoped to the installation's configured `clone_scope` path, surfaces new duplication, and is **advisory** (never blocks; FR-008). When `clone_scope` is unconfigured or the snapshot tool is absent, **skip with a note** (edge case) rather than fail.
- **Rationale**: the spec defers the vendored, per-codebase-scoped detector to `design:feature/migrate-scope-discovery`; until then session-end consumes the interim `.dw-lifecycle/scope-discovery/clone-snapshot.sh` against the configured scope. Per-codebase scoping comes from the config, not a hardcoded path.
- **Alternatives**: vendor the full clone-detector now (rejected — that's the migrate-scope-discovery feature's scope); skip the snapshot entirely (rejected — it's the surface that catches this-session duplication, US2 value).

## D8 — Commit + push with a clean local-record guarantee

- **Decision**: session-end stages the resolved doc working files (journal + tooling-friction + any session doc edits), commits doc-only (warning — not blocking — when non-doc changes are uncommitted, FR-011), and **pushes** with bounded retry/backoff. A push failure is **surfaced** (the record is committed locally; the close is reported as not-fully-complete) rather than reported clean (edge case; FR-010).
- **Rationale**: pushing is the final mile (the ephemeral worktree is reclaimed); the warn-don't-absorb keeps the doc commit clean (matches dw-lifecycle session-end error handling). Reuses the `execSync`/`execFileSync` git precedent.
- **Alternatives**: commit-without-push (rejected — unpushed record is lost on container reclaim, FR-010); absorb non-doc changes into the doc commit (rejected — pollutes the close commit).

## D9 — In-repo dogfood resolution

- **Decision**: the in-repo `plugins/stack-control` installation resolves its session working files through the repo-root `.stack-control/config.yaml` (009's dogfood artifact), whose `paths` overrides record the real scattered layout: `journal` → `DEVELOPMENT-NOTES.md` (repo root), `tooling_feedback` → `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/tooling-feedback.md`, `clone_scope` → `plugins/stack-control`.
- **Rationale**: proves the decoupling on a real messy tree (the same dogfood strength 009 relies on); the three new keys' overrides are added to the dogfood config when this feature implements.
- **Alternatives**: a session-skills-specific dogfood config (rejected — one config per installation, D2).

## D10 — Skills are documentation-thin adapters

- **Decision**: `skills/session-start/SKILL.md` and `skills/session-end/SKILL.md` quote the CLI verb (`stackctl session-start` / `session-end`) and document when to run + the report-and-stop / capture-only discipline — adding **no behavior** the CLI lacks (FR-019). Mirrors `skills/inbox/SKILL.md` + `skills/backlog/SKILL.md`.
- **Rationale**: CLI-first/surface-agnostic (FR-018; constitution Principle VIII): the CLI is the vendor-neutral core, the skill is one adapter.
- **Alternatives**: logic in the skill body (rejected — would make the skill the only path, violating FR-018/SC-007).
