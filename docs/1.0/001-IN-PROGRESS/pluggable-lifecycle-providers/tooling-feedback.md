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
