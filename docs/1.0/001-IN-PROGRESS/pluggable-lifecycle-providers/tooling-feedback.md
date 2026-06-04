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
