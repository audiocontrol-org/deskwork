# Tooling Feedback — pluggable-lifecycle-providers

Append-only friction log for the Spec-Kit-as-management-layer dogfood. One friction per entry: Repro / Workaround / Suggested-fix. The cumulative log is the integration's de-facto requirements doc — every seam here is a thing the deskwork↔provider bridge must eventually handle.

---

## TF-01 — Spec Kit init writes a root `CLAUDE.md` that coexists with deskwork's `.claude/CLAUDE.md`

- **Repro:** `specify init --here --integration claude` in a repo that already has `.claude/CLAUDE.md`. Spec Kit writes a NEW `CLAUDE.md` at repo root containing a `<!-- SPECKIT START --> ... read the current plan ... <!-- SPECKIT END -->` marker block.
- **Impact:** Two agent-context files now exist (`/CLAUDE.md` + `/.claude/CLAUDE.md`). Claude Code reads `.claude/CLAUDE.md` as project instructions; the root one is Spec Kit's managed context pointer. Low risk of collision but a discoverability/confusion seam.
- **Workaround:** Leave both; they serve different masters. Note the root one is Spec-Kit-managed (it rewrites the SPECKIT block via `/speckit-agent-context-update`).
- **Suggested-fix (for the bridge):** the deskwork↔spec-kit bridge should be aware Spec Kit owns the root `CLAUDE.md` SPECKIT block; don't let deskwork tooling treat it as the canonical project-instruction file.

## TF-02 — Spec Kit installs agent skills into BOTH `.claude/skills/` and `.agents/skills/`

- **Repro:** post-init, `speckit-*` skill dirs appear in `.claude/skills/` (16) AND `.agents/skills/` (the git-* subset, 6). `.agents/skills/` pre-existed with deskwork's own skills (feature-*, session-*, release, analyze-session) — Spec Kit merged additively.
- **Impact:** dual-home skills; the `.agents/` mirror is a Spec-Kit convention for cross-agent portability. No clobber observed.
- **Workaround:** none needed; additive.
- **Suggested-fix:** confirm deskwork's `.agents/` consumers (if any) ignore unknown `speckit-*` entries.

## TF-03 — Spec Kit init recommends gitignoring `.claude/`, which directly contradicts deskwork's commit-`.claude/` convention

- **Repro:** init prints "Consider adding `.claude/` (or parts of it) to `.gitignore` to prevent accidental credential leakage."
- **Impact:** deskwork deliberately commits `.claude/` (rules, settings, agents) — it's how adopters get the discipline. Spec Kit assumes `.claude/` is throwaway local agent state. Conventions collide.
- **Workaround:** do NOT gitignore `.claude/`; keep deskwork's convention.
- **Suggested-fix:** the bridge/install advice must reconcile these — likely gitignore only Spec-Kit's transient bits, never deskwork's committed `.claude/` content.

## TF-04 — None of Spec Kit's scaffolding is gitignored; operator must decide commit-vs-ignore for ~17 new dirs/files

- **Repro:** post-init `git status` shows `.specify/`, `CLAUDE.md`, `.claude/skills/speckit-*` (16), `.agents/skills/speckit-*` (6) all untracked, none ignored. `specs/` not yet created (appears on first `/speckit-specify`).
- **Impact:** committing mixes Spec Kit infra into the deskwork monorepo on the feature branch; ignoring means the management layer isn't reproducible for a fresh clone. Genuine decision, not a default.
- **Workaround:** TBD — operator decision pending (see open question to operator).
- **Suggested-fix:** the bridge should define a canonical "what of the provider's scaffolding does deskwork track" policy.

## TF-05 — Spec Kit's mandatory `before_specify` hook forks a numbered git branch, colliding with deskwork worktrees

- **Repro:** `.specify/extensions.yml` registers `before_specify -> speckit.git.feature` as `optional: false` with `auto_execute_hooks: true`. The hook runs `create-new-feature.sh`, which `git checkout -b <NNN>-<short-name>` — creating and switching to a new numbered branch.
- **Impact:** deskwork runs feature work in a git **worktree pinned to one branch** (`feature/<slug>`). Spec Kit assumes IT owns branch creation. Letting the hook run would switch the worktree off the deskwork branch onto `001-*`, orphaning the pushed feature branch and violating deskwork's "never create a sibling branch in a worktree" convention. This is the core impedance mismatch the feature exists to resolve, surfacing at the very first native step.
- **Workaround (verified):** set `GIT_BRANCH_NAME=feature/pluggable-lifecycle-providers` + pass `--allow-existing-branch`. Dry-run output: `{"BRANCH_NAME":"feature/pluggable-lifecycle-providers", ...}` — no fork, worktree stays put. The spec dir name is independent of the branch and is still generated as `specs/NNN-<short-name>`.
- **Suggested-fix (for the bridge):** the deskwork↔spec-kit adapter must pin `GIT_BRANCH_NAME` to the deskwork feature branch (or disable the `git` extension's branch hooks entirely) so Spec Kit never forks the worktree. Branch + worktree ownership stays with deskwork (design.md §2 "deskwork owns physical substrate"); the provider only authors. FEATURE_NUM degrades to the full branch string when the branch has no numeric prefix — cosmetic, harmless.

## TF-06 — Spec Kit hooks fire at command boundaries (whole-run), not per-task; deskwork governance fits as an `after_implement` extension but loses per-task granularity

- **Repro:** `/speckit-implement` reads `.specify/extensions.yml` `hooks.before_implement` / `hooks.after_implement` and runs each registered hook command (slash-command) once. The implement loop walks the entire `tasks.md` internally (phase-by-phase, marking `[X]`) with NO per-task extension-hook point. Extensions are first-class: `.specify/extensions/<name>/extension.yml` + `commands/` + `.registry`; managed via `specify extension`.
- **Impact (capability):** deskwork's governance (audit-barrage + finding lifecycle) CAN be wired into Spec Kit's native flow as an extension registered on `after_implement` — provider drives execution, deskwork governs automatically. This is the cleaner bridge architecture ("Model 3"): governance-as-extension, no deskwork `implement` in the loop.
- **Impact (limitation):** Spec Kit's hook granularity is whole-run. deskwork today fires audit-barrage at EACH task boundary (its implement-loop end-of-task hook). Ported to Spec Kit's native hooks, governance fires once after the entire feature is implemented — coarser. A per-task cadence would require either deskwork driving the loop (off-roading Spec Kit's implement) or Spec Kit gaining per-task hook points upstream.
- **Knock-on:** if governance fires on `after_implement` against the resulting diff/plan, the normalized-manifest projection (the original slice's core) may be unnecessary for the governance path — that machinery existed to let deskwork's implement walk provider tasks, which Model 3 abandons.
- **Suggested-fix (for the bridge):** build a deskwork Spec-Kit extension exposing a governance command, registered on `after_implement`. Capture whether whole-run governance granularity is acceptable, or whether per-task governance is a hard requirement that Spec Kit's hook model can't meet.

## TF-07 — There IS room to insert a parallel multi-CLI execution extension; community prior art already exists

- **Question explored:** can we insert a Spec Kit extension that drops tranches of parallelizable tasks onto multiple LLM CLIs (fan code-writing across claude + codex)?
- **Finding (capability):** YES. Spec Kit extensions declare `provides.commands` (register new slash-commands) + `hooks` (wire to before_*/after_* lifecycle points) via `extension.yml`; installable via `specify extension add <name> --from <zip-url>`; distributed through catalogs (`default` installable, `community` discovery-only). A custom extension can register a parallel-executor command invoked in place of `/speckit-implement`.
- **Finding (prior art, community catalog — discovery-only, 0 downloads/0 stars, UNPROVEN):**
  - **MAQA — Multi-Agent & Quality Assurance**: "Coordinator → feature → QA agent workflow with parallel worktree-based" execution. Directly the worktree-isolated parallel pattern.
  - **Fleet Orchestrator** (sharathsatish/spec-kit-fleet): parallel cross-phase lifecycle orchestration w/ human gates.
  - **Agent Assign** (xymelon): route spec-kit tasks to specialized agents (task-routing, multi-agent).
- **Shape for deskwork:** a custom extension `provides` an execution command that (1) reads Spec Kit's dependency-annotated `tasks.md` (phases + `[P]` + file paths embedded in task lines — the map already exists), (2) computes tranches (phases serial; `[P]` parallel within a phase), (3) validates non-overlap deterministically via the embedded file paths (Spec Kit's `[P]` is LLM-heuristic, so verify before trusting), (4) dispatches each tranche across multiple LLM CLIs in parallel — reusing deskwork's existing multi-CLI fan-out primitive from audit-barrage — (5) each task in its own git worktree for write isolation, then merges.
- **The hard part is NOT the fan-out (deskwork has it via audit-barrage); it's WRITE coordination:** audit fan-out is read-only; parallel code-writing mutates a shared tree → needs per-task worktree isolation + a merge/conflict step. This is exactly why MAQA is "worktree-based." `[P]` correctness is heuristic but checkable from the embedded file paths.
- **Reframes the feature's value prop (upward):** beyond "deskwork governs a foreign plan," deskwork could be a **parallel, multi-CLI, worktree-isolated execution engine + governor on top of any provider's dependency-annotated plan** — something the providers' own single-agent grinders do NOT offer, and which the community is independently validating as a real need.

## TF-08 — Prior-art study (MAQA, Fleet): validates the insertion point, but NONE do cross-CLI fan-out — that's deskwork's differentiator

Studied the two highest-signal community extensions (both discovery-only, 0 downloads, UNPROVEN — reference architectures, not adoptable deps).

**MAQA** (GenieRobot/spec-kit-maqa-ext) — closest to our north star:
- Integration: registers new slash-commands (`/speckit.maqa.coordinator|.feature|.qa|.setup`) — command registration, not hooks. Confirms TF-07's shape.
- Parallelism: **Claude Code native subagents** deployed to `.claude/agents/` (one model, multiple sub-agent processes). NOT multiple LLM CLIs.
- Worktrees: YES — one worktree per feature (`worktree_base`, default `".."`); coordinator spawns N feature agents in parallel worktrees, merges, re-assesses next batch. Validates the worktree-isolation pattern.
- Scheduling: reads `specs/*/tasks.md`; states todo→in_progress→in_review→done; "a feature only starts when all deps are done" (dependency-respecting batch scheduler). State in `.maqa/state.json`.
- Flow: coordinator → SPAWN[N] feature agents (worktrees) → SPAWN_QA per completed feature (`qa_cadence: per_feature|batch_end`) → merge → re-assess.

**Fleet Orchestrator** (sharathsatish/spec-kit-fleet):
- Integration: new commands (`/speckit.fleet.run`, `/speckit.fleet.review`); chains existing speckit phases with Approve/Revise/Skip/Abort human gates.
- Parallelism: up to 3 **subagents** (single-agent batching), `<!-- parallel-group: N (max 3 concurrent) -->` + `[P]` in tasks.md; file-overlap → sequential. NOT separate CLIs. No worktrees (uses branch-safety + WIP commits).
- Has `models.primary` / `models.review` config (review can differ) but execution is subagents.

**The decisive gap → deskwork's differentiator:** NEITHER does true cross-CLI / cross-model parallel execution. Both parallelize via one model's subagents (Claude). The operator's north-star ambition — drop tranches onto **multiple different LLM CLIs** (claude code AND codex) concurrently — is NOT in the prior art. deskwork already owns that exact primitive (audit-barrage spawns claude+codex in parallel). So deskwork's parallel executor would be differentiated on two axes neither MAQA nor Fleet has: (a) **cross-CLI/cross-model** task execution, and (b) deskwork's **governance back half as the "QA"** (cross-model audit-barrage + finding state machine + scope/clone/debt) instead of a single QA agent.

**Build-vs-adopt verdict:** LEARN from MAQA's blueprint (worktree-per-task, dependency-batch scheduler, coordinator loop, qa_cadence, state.json), BUILD deskwork's own — the differentiators aren't in any prior art and the prior art is unproven/uninstallable anyway. Worktree-isolation has dedicated reference extensions too (Quratulain-bilal/spec-kit-worktree; dango85 Worktrees) worth a closer read when the parallel-executor slice starts.

## TF-09 — Spec Kit's `check-prerequisites.sh --require-tasks` hard-fails on deskwork's `feature/<slug>` branch name

- **Repro:** `/speckit-analyze` (and `/speckit-implement`) run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`, which exits with `ERROR: Not on a feature branch. Current branch: feature/pluggable-lifecycle-providers` — it expects `NNN-feature-name` / `1234-feature-name` / `YYYYMMDD-HHMMSS-feature-name`.
- **Inconsistency:** the *lenient* `--json --paths-only` mode (used by `/speckit-clarify`) tolerated the same branch and returned paths fine; only the strict `--require-tasks` mode enforces the naming. So Spec Kit is internally inconsistent about whether the branch name matters.
- **Impact:** Spec Kit's branch-name assumption (cousin of TF-05) blocks its own prereq-gated commands under a deskwork worktree branch, even though `.specify/feature.json` already records the feature dir authoritatively.
- **Workaround:** proceed via `.specify/feature.json` (`feature_directory: specs/001-speckit-backhalf-slice`); the feature dir is unambiguous without the branch check.
- **Suggested-fix (for the bridge):** the deskwork↔spec-kit adapter must either (a) make Spec Kit resolve the feature dir from `feature.json` instead of branch-name parsing, or (b) teach `check-prerequisites.sh` to accept the deskwork branch pattern, so prereq-gated commands work under deskwork worktrees. Branch ownership stays with deskwork (design.md §2); Spec Kit should never gate on branch *name*.

## TF-10 — Two extension-authoring frictions: namespace-must-match-id, and `add --dev --force` deletes the source when source == install target

- **Repro A (namespace):** an extension with `extension.id: deskwork-governance` whose command is named `speckit.deskwork.govern` fails install with `Validation Error: Command 'speckit.deskwork.govern' must use extension namespace 'deskwork-governance'`. Command names MUST be `speckit.<extension-id>.<cmd>` → `speckit.deskwork-governance.govern` (slash form `/speckit-deskwork-governance-govern`).
- **Repro B (source wipe — DATA LOSS):** authoring the extension source AT the install target `.specify/extensions/deskwork-governance/` and running `specify extension add .specify/extensions/deskwork-governance --dev --force` deletes the source: `--force` removes the target before copying, and target == source → `FileNotFoundError: ... .specify/extensions/deskwork-governance`. Uncommitted source is lost.
- **Impact:** `--dev` COPIES the source INTO `.specify/extensions/<id>/`. The source must live OUTSIDE that tree. Authoring at the target both collides and risks data loss on `--force`.
- **Fix / better design (adopted):** deskwork houses the extension SOURCE in its own plugin tree — `plugins/dw-lifecycle/spec-kit/deskwork-governance/` (a deskwork-shipped, version-controlled artifact). `specify extension add plugins/dw-lifecycle/spec-kit/deskwork-governance --dev` copies it into `.specify/extensions/deskwork-governance/`, which is pure INSTALL OUTPUT (gitignore-able, like a build artifact). This is the correct home anyway: the extension travels with deskwork, not with a project's install state.
- **Suggested-fix (for the bridge):** the deskwork↔spec-kit adapter ships its Spec Kit extension(s) from `plugins/dw-lifecycle/spec-kit/`; install is `specify extension add <plugin-path> --dev`; `.specify/extensions/<id>/` is treated as generated. Commit source ALWAYS before any `--force` install (the wipe is unrecoverable for uncommitted source).

## TF-11 — Seam record (slice 001 research deliverable, FR-007/SC-005): what the governance hook consumed + how the command name resolved

The governance-as-`after_implement`-extension slice landed GREEN (smoke run dir `20260604T231633132Z`; 2/2 model lanes; 5 findings lifted incl. one cross-model HIGH). The two seam facts the durable bridge needs:

- **Context the command consumed from Spec Kit:** *nothing passed by Spec Kit directly.* The `after_implement` hook fires the command with no payload; `govern.sh` self-gathers its context from the repo — `git diff ${GOVERN_DIFF_BASE:-HEAD~1}`, `git log BASE..HEAD --oneline`, and `tail` of the feature `audit-log.md`. Feature slug comes from `GOVERN_FEATURE_SLUG` (default hardcoded — flagged as a real defect, AUDIT-20260604-24, cross-model HIGH: a reusable extension must DERIVE the slug, e.g. from `.specify/feature.json`, not default it). **Bridge implication:** Spec Kit hooks are context-free triggers; the governance command must source its own context. The durable bridge should derive feature identity from `.specify/feature.json` (authoritative), not a hardcoded default or branch name (TF-09).
- **Command-name resolution:** Spec Kit requires the command name to match the extension id namespace — `speckit.<extension-id>.<cmd>` → here `speckit.deskwork-governance.govern`, slash form `/speckit-deskwork-governance-govern` (TF-10). deskwork's own colon-namespaced verbs (`/dw-lifecycle:audit-barrage`) are NOT invoked by the hook; the command body shells out to the deskwork **CLI** (`dw-lifecycle audit-barrage …`) from bash. The two namespaces never collide because Spec Kit owns the hook command name and deskwork's CLI is just a subprocess.

## TF-12 — `after_implement` governance coverage + the dw-lifecycle finding-gate ↔ Spec Kit tasks.md impedance (Feature 1 implement session)

Two frictions surfaced governing a real multi-commit `/speckit-implement` session (Feature 1 MVP).

- **Repro A (diff-base coverage gap):** `govern.sh` diffs `${GOVERN_DIFF_BASE:-HEAD~1}`. After implementing a feature as several atomic commits (here 6), a default-base govern run audits only the LAST commit's diff — so the first governance pass (run after the Phase 1-2 commit) never saw Phase 3 (the US1 core: execute-check, the rehome, the execute skill, the seam guard). The most important surfaces went un-audited until a manual full-feature pass (`GOVERN_DIFF_BASE=<prior-session-tip>`) was fired. The cross-model barrage even flagged this itself (AUDIT-20260605-01: the untracked + single-commit window omits new files).
  - **Workaround:** run governance with an explicit `GOVERN_DIFF_BASE` pointing at the pre-feature tip, not the default `HEAD~1`; and commit before governing so untracked files are in the tracked diff (the `after_implement` hook order — git-commit *then* govern — already does this in the native flow).
  - **Suggested-fix (for the bridge):** the `after_implement` governance should diff against the **feature base** (the branch's merge-base or the spec's first commit), not `HEAD~1`. Derive it from `.specify/feature.json` / the feature branch point so a multi-commit implement session is governed whole, not just its tip commit.

- **Repro B (finding-gate ↔ tasks.md impedance):** governance lifts findings into the feature `audit-log.md`, and the dw-lifecycle `check-open-findings` gate then blocks with "scope them as the next N workplan tasks" and a cure of `dw-lifecycle promote-findings … --apply`. But `promote-findings` targets a dw-lifecycle `workplan.md`; this feature is tracked by Spec Kit `tasks.md`, which `promote-findings` does not understand. The two systems disagree on where "the workplan" is.
  - **Workaround:** disposition findings DIRECTLY in `audit-log.md` (Status `open` → `fixed-<sha>` / `acknowledged-<date>`), fixing the real defects in-session per the scope-don't-defer + TDD discipline, then re-run `check-open-findings` to confirm `zero open`. No `promote-findings` invocation. This satisfies the gate (it reads `audit-log.md` status, not `workplan.md`) but bypasses the advertised cure.
  - **Suggested-fix (for the bridge):** when the plan source is Spec Kit, the finding-scoping cure should target `tasks.md` (append fix tasks in the TDD-first shape), or the gate should accept in-place `audit-log.md` dispositions as the canonical path. Until the scope-discovery migration (`design/migrate-scope-discovery`) rehomes these verbs into `stack-control`, the audit-log-direct disposition is the working path for Spec-Kit-tracked features.

## TF-13 — `specify extension add` install copy is committed (not gitignored), drifts from source, and is never executed by the hook

Surfaced doing the T033 governance README stale-ref cleanup (Feature 1 Polish session).

- **Repro:** `specify extension add <src> --dev --force` copies the source into `.specify/extensions/<id>/`, and that copy is **tracked in git** (it shows in `git grep` / `git status`). The `after_implement` hook command body, however, shells out to the **SOURCE** path (`bash plugins/stack-control/spec-kit/deskwork-governance/scripts/bash/govern.sh`), NOT the installed copy. So the installed `.specify/extensions/.../scripts/bash/govern.sh` is **never executed** — yet it's committed, so it silently drifts from source whenever source changes without a re-install. This session the installed `govern.sh` was a pre-AUDIT-06 version (last session's install predated the AUDIT-06 bounding fix in source); the drift was invisible because the dead copy never runs.
- **Impact:** two hazards. (a) A committed-but-dead artifact that diverges from the live source is a reviewer trap — someone reading `.specify/extensions/.../govern.sh` sees stale logic that isn't what runs. (b) TF-10 recommended treating `.specify/extensions/<id>/` as gitignore-able build output; in practice it's committed here, which is what enables the drift. The two are in tension and should be reconciled.
- **Workaround (this session):** re-ran `specify extension add … --dev --force` from the corrected source to re-sync the installed copy, and confirmed the hook still resolves to the source path (so the drift had no runtime effect — the AUDIT-06 fix was always live via source). Committed the re-sync to remove the dead-drift.
- **Suggested-fix (for the bridge):** decide one of — (a) **gitignore** `.specify/extensions/<id>/` and treat it as pure install output (TF-10's recommendation; re-generated per environment, never committed), OR (b) if it must be committed, add a check that the installed copy matches source (a `--check`/drift-detect mode, or wire the re-sync into the version sweep). Do NOT leave a committed copy that both drifts and never runs. Note also that the smoke (`smoke-governance-after-implement.sh`, T019) and the hook command both already point at SOURCE, confirming source is the single execution path — the installed copy's scripts are vestigial.

## TF-14 — switching the active numbered spec on the long-lived branch requires two hand-edits (no "set active feature" verb)

Surfaced starting Feature 2 (moving the active feature from `specs/003` to `specs/002` on the single long-lived branch).

- **Repro:** the program uses ONE long-lived branch (`feature/pluggable-lifecycle-providers`) with numbered spec dirs. Spec Kit's `get_feature_paths` (`.specify/scripts/bash/common.sh`) resolves the active feature via (1) `SPECIFY_FEATURE_DIRECTORY` env, (2) `.specify/feature.json#feature_directory`, (3) branch-name numeric-prefix lookup. The branch name has no numeric prefix, so resolution relies entirely on `.specify/feature.json`. To switch from 003 → 002 I had to hand-edit BOTH `.specify/feature.json` (drives the speckit scripts) AND the `<!-- SPECKIT START -->…<!-- SPECKIT END -->` marker in `CLAUDE.md` (drives session-start / skill orientation). There is no `stackctl`/speckit verb to "set the active feature."
- **Impact:** friction + a desync footgun — it's easy to update one and forget the other, leaving a fresh agent oriented to one feature while the speckit scripts operate on another (the two were briefly out of sync until I updated both).
- **Workaround:** edited both by hand; verified with `check-prerequisites.sh --json --paths-only` that `FEATURE_DIR` resolved to `specs/002-parallel-execution-engine`.
- **Suggested-fix:** a `stackctl` verb (e.g. `stackctl feature use <NNN-slug>`) that **atomically** updates `.specify/feature.json` + the `CLAUDE.md` marker and validates the spec dir exists — folds naturally into the front door. This is the deliberate multi-numbered-spec-on-one-branch pattern (TF-09-adjacent); the fix is a verb, not abandoning the pattern.

## TF-15 — `check-prerequisites.sh --require-tasks` hard-fails on the branch-name pattern BEFORE consulting `.specify/feature.json` (blocks `/speckit-analyze`)

Surfaced running `/speckit-analyze` for `design/spec-governance` (`specs/004`).

- **Repro:** `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` exits 1 with `ERROR: Not on a feature branch. Current branch: feature/pluggable-lifecycle-providers — Feature branches should be named like: 001-feature-name…`. The plain `--json --paths-only` mode (used by `/speckit-clarify`, `/speckit-plan`, `/speckit-tasks` setup) resolves the active feature via `.specify/feature.json` and works fine; the `--require-tasks` path enforces a stricter branch-NAME numeric-prefix gate that fires *before* (or instead of) the `feature.json` resolution, so it is incompatible with the deliberate one-long-lived-branch convention (TF-14).
- **Impact:** `/speckit-analyze`'s own prerequisite step aborts on a healthy feature whose artifacts (spec/plan/tasks) all exist and whose `feature.json` is correct. The analyze had to proceed using the known paths manually. Same root cause class as TF-14 (branch-name-based feature detection vs. the `feature.json` pointer), but a different, harder failure: a non-zero exit that blocks the step rather than a silent desync.
- **Workaround:** ran the analyze using `specs/004-spec-governance/{spec,plan,tasks}.md` directly (all present; `feature.json` already points at `004`).
- **Suggested-fix:** the `--require-tasks` path should resolve the active feature through the SAME precedence as `--paths-only` (`SPECIFY_FEATURE_DIRECTORY` → `.specify/feature.json` → branch prefix), and only fall back to the branch-name error when ALL three fail. The branch-name pattern must not be a hard gate when `feature.json` resolves. Folds into the same migration that gives `stackctl feature use` (TF-14).

## TF-16 — `specify extension add` COPIES the extension into `.specify/extensions/` with no re-sync or drift detection (live hook silently ran stale, pre-migration code)

Surfaced during the govern consolidation, when the (newly shell-aware) clone detector flagged `.specify/extensions/deskwork-governance/scripts/bash/govern.sh` as a near-identical copy of the plugin source — and `diff` showed the copy was STALE.

- **Repro:** `specify extension add <local-ext-path> --dev` copies the extension into `.specify/extensions/<id>/` and records a `manifest_hash` + `installed_at` in `.specify/extensions/.registry`. Edit the plugin SOURCE afterward (e.g. `plugins/stack-control/spec-kit/deskwork-governance/scripts/bash/govern.sh`); the installed copy does NOT update, and nothing warns. The live `after_implement` hook runs the installed copy, so source edits are silently inert until a manual re-add.
- **Impact:** **a real live regression hid for ~2 days.** The installed `deskwork-governance` copy was frozen pre-`multi/migrate-audit-barrage`: it still shelled `dw-lifecycle` (the "no dw-lifecycle dependency" milestone was not actually live) and lacked this session's fix-dispatch discipline in its command `.md` + the 3 per-agent `SKILL.md` copies. The installer stores a `manifest_hash` but no surface ever re-derives the source hash and compares, so drift is undetectable by the toolkit itself — only the (just-fixed) clone detector caught it, and only because it now scans shell.
- **Workaround:** re-sync with `specify extension add plugins/stack-control/spec-kit/deskwork-governance --dev --force` (overwrites the stale copy; re-stamps `.registry`). Had to also fix the shim's stackctl resolution — a `BASH_SOURCE`-relative path works in the plugin tree but lands on `.specify/bin/stackctl` (nonexistent) from the install copy; switched to repo-root resolution.
- **Suggested-fix:** (1) a `session-start` advisory check that, per locally-sourced installed extension, compares the installed copy to its source (re-derive the manifest hash, or `diff -r`) and warns "stale install — re-run `specify extension add … --force`"; (2) an installed shim must resolve its companion binary robustly across both the plugin tree and the install copy (don't assume a fixed relative depth). Captured as a design idea in `design-inbox.md` (install-drift). The deeper class is "mechanism exists but never fires" — same shape as the clone-coverage gap this session.

## TF-17 — branch rename (`feature/pluggable-lifecycle-providers` → `feature/stack-control`) silently breaks `stackctl govern` feature-slug derivation; must pass `--feature` explicitly

Surfaced resuming the 004 convergence loop after the operator renamed the worktree + branch to `stack-control` mid-session.

- **Repro:** `stackctl govern --mode spec` (and `spec-governance-gate`) derive the feature slug from the branch name (`feature/<slug>`) when `--feature` is absent. The branch is now `feature/stack-control`, but the feature's docs, audit-log, and `audit-runs/` all live under the slug `pluggable-lifecycle-providers`. So a bare `govern --mode spec` would target a non-existent `stack-control` feature (wrong/empty audit-log, wrong run history) instead of the real one. I had to pass `--feature pluggable-lifecycle-providers` on every invocation. Same root-cause class as TF-14/TF-15 (branch-name-based feature detection vs. the deliberate program convention), now triggered by a rename rather than the numeric-prefix gap.
- **Impact:** a silent footgun — the command succeeds but governs the wrong (empty) feature, which would read as "0 findings, converged" on a feature that doesn't exist. Easy to miss if you don't already know the slug ≠ branch. Compounded by a second, smaller friction: `govern --mode spec` defaults `--spec-path` to the `CLAUDE.md` SPECKIT marker, which points at `specs/004-spec-governance/plan.md` (the plan), not `spec.md` — so the spec path must also be passed explicitly to audit the spec rather than the plan.
- **Workaround:** passed `--feature pluggable-lifecycle-providers --spec-path specs/004-spec-governance/spec.md` explicitly on every barrage this session; verified the run-dir + audit-log resolved to the real feature.
- **Suggested-fix:** resolve the feature slug through the same `.specify/feature.json` pointer that `--paths-only` uses (TF-14/15) rather than the branch name — the `feature.json` already names the active feature independent of branch. Folds into the same `stackctl feature use <NNN-slug>` migration. Separately, `govern --mode spec` should default `--spec-path` to `spec.md` in the active feature dir (the marker resolves the dir; pick the spec, not the plan), or fail loud if the marker points at a non-spec artifact. Also a reconcile chore: the stale `feature/pluggable-lifecycle-providers` branch strings now live in `README.md`, `prd.md`, `specs/004-*/{spec,plan}.md`, etc. — update to `feature/stack-control` at merge.

## TF-18 — `govern --mode spec` lift fails AFTER the (expensive) barrage when a new feature has no pre-existing audit-log.md

Surfaced governing the brand-new `design/document-primitives` (005) feature, which had no prior `docs/1.0/001-IN-PROGRESS/document-primitives/` dir.

- **Repro:** `stackctl govern --mode spec --feature <new-slug> …` on a feature with no `docs/1.0/001-IN-PROGRESS/<slug>/audit-log.md`. The barrage **runs to completion** (both model CLIs fire, full token/compute cost incurred, run-dir + `claude.md`/`codex.md` written), THEN `audit-barrage-lift` exits 2: `audit-log not found at …/<slug>/audit-log.md`. The whole govern exits FATAL — the expensive model work is stranded in the run-dir, unlifted.
- **Impact:** a new feature legitimately has no prior audit-log; the first-ever `govern --mode spec` always trips this. Worse, it fails *after* the costly barrage, so the model run is wasted unless you know to lift the existing run-dir by hand. Easy to misread as a hard failure of the whole protocol.
- **Workaround:** pre-create `docs/1.0/001-IN-PROGRESS/<slug>/` + an `audit-log.md` with the standard header, then run `stackctl audit-barrage-lift --apply --feature <slug> --run-dir <the-existing-run-dir>` against the already-fired run (no model re-fire), then `spec-governance-gate`. Recovered both the findings and the cost.
- **Suggested-fix:** `audit-barrage-lift --apply` (or `govern` before firing) should **create the audit-log (mkdir -p + minimal header) when absent** — a first-ever lift on a new feature is the normal case, not an error. At minimum, validate the audit-log path is writable **before** firing the barrage (fail fast, pre-cost), not after. Pairs with TF-17's slug-resolution fix (a new feature's slug also won't match the branch).
