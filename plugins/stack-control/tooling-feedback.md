# Tooling Feedback


## session-end 2026-06-10
- import-github imports ALL open issues (gh issue list --state open, no label/number filter) — importing a subset (e.g. only stack-control issues) is impossible via the verb; had to per-issue 'backlog capture' with gh-<n> refs instead.
- Spec Kit check-prerequisites.sh rejects the single long-lived branch name (TF-09) — /speckit-analyze's prerequisite check aborts; feature dir had to be resolved via .specify/feature.json, not the branch.
- backlog.md derives the task filename from the full title with no length cap — a long imported-issue title produced a 256-byte filename that broke 'git checkout' on Linux (ext4 255-byte limit), failing CI checkout entirely.
- session-end auto-derived 'Commits: 0' on a single long-lived branch — the merge-base/base-branch boundary logic doesn't fit a branch that keeps merging to main (merge-base ≈ HEAD), so it reported 0 commits for a session with many. The quantitative block had to be hand-corrected. Same TF-09 family; session-end needs a boundary mode for the single-branch program (e.g. honor --since, or last-session-tag).

## session-end 2026-06-10
- govern --mode implement FATAL'd at the lift step on EVERY run for spec 012: audit-barrage-lift + spec-governance-gate resolve the audit-log at docs/*/001-IN-PROGRESS/<slug>/, but a Spec Kit feature lives at specs/NNN-slug, so lift exits 2 (feature not found) and no gate verdict is ever computed. The barrage models DID run (run-dir populated with claude.md/codex.md), so findings exist but must be read manually. Manifestation of backlog TASK-14 (feature resolution is docs-layout-only).
- Wrapping govern in a background bash run + tee masked its real exit code: the wrapper/echo exit 0 was mistaken for a gate-open verdict when govern actually exited 2 (lift FATAL). Never wrap a gate verb such that its own exit code is obscured; read the verb's exit directly.
- gh GraphQL mutations 401'd this session (pr merge, pr checks) while REST worked — merged PR #451 via 'gh api -X PUT repos/.../pulls/451/merge'. Recurring gh-GraphQL-401 pattern noted in prior journals.

## session-end 2026-06-10
- GitHub->backlog migration via 'backlog capture ... --ref gh-N' WITHOUT --body silently dropped issue bodies; capture accepts a gh-ref with no body and says nothing, and closing the source issues NOT_PLANNED orphaned the only copy of each body in a closed issue. 9 husks (TASK-12/13/14/16/17/18/19/20/21) recovered from the closed issues this session. Root cause: the migration should use import-github (which copies bodies) OR capture should refuse/warn on a gh-ref with no --body.
- backlog promote has no inverse (un-promote / re-home) verb; correcting a mis-promote requires native 'backlog task edit --remove-label promoted --notes' by hand. Filed TASK-23.
- backlog promote pending-create advisory resolves target.path against cwd, not the install root: a false 'does not yet exist' when run from plugins/stack-control for a specs/ dir at repo root. TASK-22.
- stackctl backlog verbs fail 'no installation found' when cwd is the repo root (installation is plugins/stack-control); had to cd into the installation dir to run promote. Resolution is cwd-enclosing-only.

## session-end 2026-06-11
- stackctl roadmap/backlog fail from repo root: <repo>/.stack-control/ holds audit-barrage-config.yaml but no config.yaml, so nearest-installation resolution only succeeds under plugins/stack-control — dual-layout (repo-root scope-discovery config vs plugin-dir installation) is confusing; repro: run 'stackctl roadmap add ...' from repo root → exit 1 'no stack-control installation found'
- Spec Kit check-prerequisites.sh rejects the long-lived program branch name (TF-09 recurrence at /speckit-analyze): 'ERROR: Not on a feature branch. Current branch: feature/audit-protocol' — worked around via .specify/feature.json resolution per the documented convention; the script's branch gate keeps fighting the one-branch-per-program layout

## session-end 2026-06-11
- Spec Kit branch-gate assumes a NNN-/timestamp feature branch: check-prerequisites.sh (speckit-analyze) fails loud ('Not on a feature branch') and the before_specify git.feature hook wants to create a new branch — both incompatible with a session-pinned existing branch (feature/audit-protocol). Workaround: ran specify/plan/tasks/analyze directly against the .specify/feature.json-resolved dir and bypassed the branch hook. Suggested-fix: resolve the feature dir from feature.json regardless of branch name (relates to #122 / design:fix/spec-governance-gate-branch).
- stackctl session-start/session-end fail loud at the repo root because /home/user/deskwork/.stack-control/ holds only audit-barrage-config.yaml (no config.yaml) — the installation lives under plugins/stack-control. Workaround: run from plugins/stack-control (or --at). Suggested-fix: clearer fail-loud message naming the nearest installation it DID find below the cwd.
- Installation resolution: session-start / session-end / backlog all fail-loud from the repo root because the only .stack-control/config.yaml files live under plugins/<name>/. The natural agent cwd is the repo root, so every lifecycle verb needs --at plugins/stack-control or a manual cd. Repro: from repo root, run any of these verbs with no flag -> 'no stack-control installation found'. Workaround: cd into plugins/stack-control. Suggested-fix: either a root-level installation that points at the plugin install, or have the verbs walk DOWN into a single unambiguous plugins/<name>/.stack-control when none is found at/above cwd.
- backlog wrapper has no status-edit verb: stackctl backlog exposes capture/list/import-github/import-slush/promote but no way to transition an item's board status (To Do -> Done). A found-and-fixed-in-same-branch item (TASK-25 this session) cannot be marked Done through the wrapper; backlog.md native edit needs the project dir wired (npx backlog -> 'No Backlog.md project found'). Suggested-fix: add 'stackctl backlog edit <id> -s <status>' (or a done/start shortcut) routing to backlog.md with the installation's backlog dir.

## session-end 2026-06-11
- backlog capture does not dedupe by --ref against existing items (only import-github checks gh-<n> refs): the 2026-06-11 roadmap-migration pass created 5 duplicate items (TASK-31/33/34/35/36 duplicating TASK-21/19/20/18/17, same gh refs) that needed a manual dedupe+archive pass. Suggested-fix: capture (or a shared backend guard) warns or refuses when --ref matches an existing item.
- direct backlog.md CLI invocations are cwd-sensitive in a way stackctl-wrapped calls are not: 'backlog task edit' succeeded from plugins/stack-control once, then later returned 'No Backlog.md project found' from the same cwd; reliable invocation required cd into .stack-control/ (the store parent). Workaround: always run the raw backlog binary from the store parent dir; stackctl backlog subactions are unaffected.

## session-end 2026-06-11
- gh pr merge + gh pr checks returned 401 Unauthorized while gh pr create / gh pr view / gh api worked with the same keyring token; merged PR 454 via gh api -X PUT .../pulls/454/merge. Upstream gh CLI quirk — route to a gh issue if it recurs.
- Claude Code Skill tool returned only the launch banner (no skill body injection) for stack-control:execute, stack-control:define, and speckit-deskwork-governance-govern; worked around by reading SKILL.md from the plugin cache and following it manually.
- speckit-specify's mandatory before_specify git.feature hook conflicts with the program's one-long-lived-branch convention; skipped per TF-09 precedent (no NNN- branches exist for specs 001-014). The hook's mandatory flag vs the convention should be reconciled in extensions.yml.
- Spec Kit check-prerequisites.sh rejects the long-lived branch name; SPECIFY_FEATURE env override required for every prerequisite check (known TF-09, still live friction in the execute path).

## session-end 2026-06-12
- jscpd v4 writes no JSON report over a source-less or trivial tree, so the implement-mode clone step hard-errors on minimal installation fixtures — every govern test fixture needs two ~30-line source files as ballast (hit twice this session: govern-orchestration + govern-phase-unit fixtures)
- root-level 'npx vitest run' umbrellas every workspace without their configs and reports phantom failures (209 in packages/cli), and a root 'npm --workspaces test' hung behind day-old stale vitest processes — there is no fast sanctioned whole-tree health check; proved cross-package isolation via 'git diff --stat <base> -- packages plugins/dw-lifecycle' instead
- origin/main shipped govern-payload-self-reference's excerpt test red (asserts pre-015 excerpt threading against the post-015 signature — the string lands in pathScope); found while verifying merge failures against a pristine main worktree

## session-end 2026-06-13
- stack-control:define on Codex still has no clean native `/speckit-*` bridge in this repo's current Spec Kit setup: the project is initialized for `claude`, the visible `specify` CLI exposes workflows/templates but not a Codex-facing per-step command surface, and the mandatory `before_specify` git.feature hook still conflicts with the one-long-lived-branch layout. Workaround: create the new feature dir directly, repoint `.specify/feature.json` + `CLAUDE.md`, author `spec.md` / `plan.md` / `tasks.md` + supporting artifacts manually under the skill contract, and confirm each stage with `stackctl spec-check`. Suggested-fix: give stack-control a Codex-native define path that still honors the Spec Kit chain without requiring manual pointer surgery.

## session-end 2026-06-14
- Long-running `stackctl govern --phase 1` under the Codex-only fleet can look dead from the parent command channel even while a lane is still actively auditing: in the latest `021` run, `codex` finished quickly, `codex-gpt5` emitted no new parent stdout for long stretches, and only the run-dir artifacts (`stderr/codex-gpt5.txt`, then `codex-gpt5.md`, then `INDEX.md`) proved progress. Workaround: inspect the newest `.stack-control/audit-runs/<timestamp>-...-phase-1/` mtimes and byte growth directly instead of trusting the wrapper session output. Suggested-fix: have `stackctl govern` print periodic heartbeat/progress lines from run-dir state so lane activity and completion are observable without manual artifact inspection.
- The current govern convergence message is easy to misread when the newest run clears fresh HIGHs but the dampener still blocks on the previous two-run window. Example from `021`: `spec-governance gate ... BLOCKED — Not dampened: 1 of the last 2 runs surfaced HIGH+ findings`, even after the current run’s new findings had narrowed materially. Workaround: inspect the newest run’s per-lane markdown artifacts before assuming the current pass still introduced a new HIGH. Suggested-fix: include both facts explicitly in the terminal summary: “current run HIGH+=0/1, dampener window still blocked by previous run(s).”

## session-end 2026-06-15
- Per-phase govern cascade instability: govern.ts/incremental-audit.ts are in many phases' scopes, so every fix re-stales 4-6 phase checkpoints, making whole-feature gate-open a moving target (TASK-60 adjacent).
- boundary-too-large is a recurring cross-phase audit generator (HIGH at the US2/whole-feature level, spec/quickstart require it); overriding it repeatedly fights the spec — needs the structural negotiation/boundary reorder (TASK-117).

## session-end 2026-06-16
- stackctl spec-check --spec <path> fails with FATAL 'not found' when run from the repo root with an installation-relative path (specs/NNN-slug); requires the plugins/stack-control-prefixed path. The --spec resolver is not cwd/repo-root tolerant. Repro: from repo root, stackctl spec-check --spec specs/022-... -> FATAL; --spec plugins/stack-control/specs/022-... -> ok. Workaround: always pass the plugin-prefixed path.
- The before_specify speckit.git.feature hook (mandatory, optional:false) does git checkout -b NNN-slug, creating a per-spec branch that contradicts this program's session-pinned one-long-lived-branch convention (specs 015-022 all live on feature/stack-control). Workaround: run create-new-feature.sh in --dry-run to compute FEATURE_NUM only, stay on feature/stack-control. The mandatory hook vs program convention conflict is unresolved (related TF-09); a faithful run of /speckit-specify would create a stray branch.

## session-end 2026-06-16
- govern --mode implement FATALs 'feature not found' on the session-pinned branch (derives slug from feature/<branch>=stack-control, looks for specs/<NNN>-stack-control); after_implement hook passes no --feature. Captured in spec 024 FR-011.
- Authoring a spec via speckit-specify does not set the roadmap node's spec: pointer -> the spec dir is briefly an orphan (manual-capture gap, hit twice this session: 023 and 024). Captured in spec 024 FR-008 (capture fused to authoring).
- roadmap reconcile still proposes in-flight->shipped from tasks-completion, disagreeing with the workflow's derived 'governing' phase (no convergence record). reconcile should defer to the workflow phase. Captured in spec 024.

## session-end 2026-06-16
- Per-phase governance should fire at each phase boundary, not as one whole-feature pass at the end (boundary-too-large). Mechanization scoped in multi:feature/unskippable-workflow-protocol.
- govern.ts is ~1000 lines (well over the 300-500 cap); barrage findings keep landing there. Needs decomposition.

## session-end 2026-06-16
- speckit before_specify hook (speckit.git.feature) is mandatory (optional:false) but creates a per-spec branch, which conflicts with this program's one-long-lived-branch convention (TF-09). Every /stack-control:define must skip a 'mandatory' hook. Suggested: a stack-control define-mode that suppresses/no-ops the branch-creation hook on one-branch installations, so the agent isn't forced to deviate from a mandatory hook each spec.

## session-end 2026-06-17
- Per-phase govern run RETROACTIVELY over a finished feature manufactures scoping-artifact false-positives: governing phase N (scoped to phase-N files, whole-history diff base) cannot see fixes that live in other phases' files, so it reports them 'absent/unverified' (025 phase-1 re-govern claude-01 flagged the govern.ts featureCheckpointKey fix as missing though it was committed + tested). Per-phase also MULTIPLIES the auditor oscillation (8 phases x N rounds). The cadence is designed to run DURING implementation, not as a retroactive sweep. Captured as TASK-154 / multi:feature/audit-barrage-convergence.
- session-end + govern boundary resolution is unreliable on the long-lived feature/stack-control branch: after a merge to main, merge-base resolves to ~HEAD so auto-derived 'Commits' would be 0; had to pass --since <prior-session-end-sha> explicitly. (TASK-39/TASK-59 territory.)

## session-end 2026-06-17
- design-record path is ambiguous between repo-root docs/superpowers/specs/ (legacy ADRs live there) and the installation-anchored plugins/stack-control/docs/superpowers/specs/ that the design-to-spec gate actually resolves (relative to install root). Repro: /stack-control:design step 1 says write to 'docs/superpowers/specs/<date>-<slug>-design.md'; I wrote to repo root and the gate read 0/7 (file-not-found) until moved under plugins/stack-control/. Workaround: write under the installation root. Suggested-fix: the design skill should state the install-anchored path explicitly, or link-design should warn when the resolved record path does not exist.

## session-end 2026-06-18
- define compass-gate path (roadmap node already exists) does not auto-record the spec: correspondence on the node, so the freshly-authored spec dir is left orphaned until manually linked (reconcile flags it; no unorphan verb — related to TASK-133). define's capture-fusion only creates the node+spec link on the node-MISSING branch.

## session-end 2026-06-18
- .stack-control/state/ (front-door session markers) is not gitignored — transient per-session marker files show as untracked and can be accidentally committed; needs a gitignore entry.

## session-end 2026-06-18
- roadmap: no verb to edit a node's prose body — correcting a falsified node description (skill-surface-mediation) required hand-editing ROADMAP.md. advance/reclassify/defer mutate structured fields only; the descriptive paragraph has no governed edit path.
- backlog: no verb to annotate/append a note to an item — recording the corrected diagnosis on TASK-241 required hand-editing the task .md file. capture/list/import/promote/close exist; there is no 'add note' verb, and close-related only transitions status.

## session-end 2026-06-19
- 027 implementation was dominated by govern TOOLING friction, not feature code: ~9 barrage runs for 2 of 6 phases + 4 overrides. Three compounding causes — (1) shared-file checkpoint staleness: any fix touching roadmap.ts re-staled earlier phases, forcing repeated re-governance (O(n^2)); (2) audit-barrage severity NON-DETERMINISM: HIGH oscillated 2->0->2 and LOW->HIGH on identical unchanged code, defeating the convergence dampener; (3) per-phase scoping excludes a file split out during implementation (cluster.ts) from its own audit payload, so the no-grounding claude lane raised FALSE HIGHs it could not disconfirm. Tracked: multi:gap/govern-per-phase-friction-burndown + TASK-289/263. Key win: the fast no-grounding claude lane (--disallowedTools, replacing --permission-mode plan) made the fleet reliably COMPLETE (167s vs >300s timeout) and restored cross-model agreement.

## session-end 2026-06-19
- stackctl backlog has no sanctioned status/close/Done verb, and the Backlog.md backend is mediated (026 interceptor refuses direct CLI) — so a completed backlog item (TASK-295) cannot be closed through the interface. Captured as TASK-297.
- govern's advisory clone-step aborted govern on any non-TS adopter repo (hardcoded jscpd --format typescript,tsx; zero files -> no report -> throw). Customer-blocking (TASK-295/#487). Fixed non-fatal-on-zero-files; the advisory step should arguably have been non-fatal from the start.

## session-end 2026-06-20
- spec-check / check-prerequisites resolve --spec and paths relative to cwd; running from the repo root instead of the installation dir (plugins/stack-control) gives a confusing 'spec dir not found' FATAL. A clearer error naming the installation-root expectation, or installation-relative --spec resolution, would remove a stumble in the define chain.

## session-end 2026-06-20
- Per-phase govern re-stale loop: US2/US3/US4 all edit check-barrage-dampener.ts + audit-barrage-lift.ts in overlapping regions, so each later phase re-stales the earlier ones' checkpoints (US7 hunk-fingerprints only help for DIFFERENT-region edits). Cost dominated the session (many re-govern cycles). TASK-353.
- No-grounding claude/sonnet audit lane intermittently times out (>420s floor) on larger per-phase payloads (029 phase-3), producing degraded rounds that block convergence. TASK-354.
- Implement-audit barrage plateaus into a finding-GENERATOR on the dampener/signature code (narrow defensive edges each round: line-ranges, markdown code-spans, tip.sha validation) — needed an operator-approved --override to exit the plateau (the spec-audit-diminishing-returns pattern, but for implement-mode).
- findingSignature was authored with a LITERAL NUL byte separator (Edit-tool fumble) -> git saw the file as binary -> the auditor couldn't read it ('opaque' HIGH). A doctor/CI check for NUL bytes / binary-detected .ts source would catch this class.
- Per-phase --override regressed FR-017 (override now runs a barrage instead of short-circuiting) after the override-checkpoint fix; the override-short-circuit unit test still passes -> test/real-path gap. Needs a test that reproduces the real bypass.

## session-end 2026-06-20
- Per-phase govern of 029's own US4 (Phase 4) hit a 4-round cross-model entanglement: govern.ts + audit-barrage-lift files are shared across phases, so each fix re-staled earlier per-phase checkpoints (override-refresh of phases 2/3 was the workaround), and the override/graduation TWO-WRITE atomicity (convergence record + phase checkpoint) surfaced as a diminishing-returns plateau resurfacing under new finding IDs each round. The convergent structural fix was record-first ordering + accurate per-write FATAL messages (the half-write is non-advancing; shipped gate fail-closed via all-phase-checkpoints-current); true 2-file transactional commit is mechanism beyond US4's promise. US5 payload-scoping (pre-phase diff-base union) + US7 hunk-fingerprinting are the root fixes for the shared-file re-stale friction.

## session-end 2026-06-21
- Driving the full speckit authoring chain through the define front door required 6 separate front-door enter/exit brackets (one per /speckit-* step: specify, clarify, plan, checklist, tasks, analyze). A chain-level bracket for one define authoring session would cut the ceremony.
- Setting the spec pointer on an EXISTING roadmap node is non-obvious: roadmap add --spec errors on the uniqueness invariant; the working verb is workflow link-spec (parallel to link-design). The define skill's node-exists branch does not instruct setting the spec pointer, so a node can stay spec-pointerless (TASK-244 class).

## session-end 2026-06-22
- 030 dogfood: the unit suite (2460 green) + a passing govern both masked that the feature's CORE (end-govern-pipeline) was never wired into the CLI — tests exercised the pipeline in isolation, never the CLI→pipeline seam, so 'victory' was declarable on an unbuilt mechanism. Need a CLI-drives-pipeline integration test as a ship gate.
- Dev-time skill/engine skew: the cached /stack-control:execute + :extend skills (0.52.2) drive the OLD per-phase govern (govern --phase), which the post-030 source engine rejects — so the sanctioned execute front door cannot govern the very branch that deletes per-phase. Surfaced again this session.

## session-end 2026-06-22
- Completed-work task-checkoff drift blocked the next protocol step: last session's T085 completed T031/T033/T034/T063/T064 but never ticked their tasks.md boxes, so the whole-feature govern refused on the 'tasks-complete spec' compass gate this session. The govern-at-end gate reads literal checkbox state; nothing reconciles 'work done' vs 'box ticked'. A graduate/govern preflight that reports which unchecked tasks have green gate-tests (candidates for checkoff) would have surfaced this in seconds instead of a multi-step investigation.
- 030 clean break left the execute SKILL.md (front door) documenting the deleted per-phase 'govern --phase' model; no 030 task covered updating the skill/WORKFLOW to govern-at-end. check-front-door passed (62 ops) because it validates verb/skill parity + help, not whether skill PROSE references a removed command. A skill-body anti-pattern lint (skill mentions a flag/verb the engine rejects) would catch front-door prose drift.

## session-end 2026-06-22
- backlog capture dedups by --ref: filing multiple distinct findings that share one audit-log path collapses to a single TASK (returns 'already captured for ref ...'). Workaround: give each a unique #anchor ref (e.g. audit-log.md#AUDIT-...-08). Consider keying dedup on title+ref, or warning instead of silently returning the existing id.

## session-end 2026-06-23
- backlog done writes status Done but backlog list still renders Done items inline, which can read as 'still open' to a grep — list could separate or flag closed items

## session-end 2026-06-23
- Validating the installed v0.54.0 surfaced that the dw-lifecycle retirement left ~34 skills with unparseable YAML frontmatter (dangling --- opener + a > **RETIRED** notice, no closing fence) → they load with empty metadata and trip the reload "1 error during load". Pre-existing (0.53.2 cache had 34 too); retired plugin; clean fix = give retired skills minimal valid frontmatter or drop the dangling opener.

## session-end 2026-06-25
- roadmap reasoner has no single-node inspect/show subaction (known: next/blocked/blocks/order/graph/add/advance/... but no 'show'); verifying one node after add/edit requires a full graph dump or session-start grep
- check-front-door rejects '--at <dir>' unlike sibling verbs (session-start/backlog/govern accept it); must cd into the installation dir to run it — anchoring-flag inconsistency

## session-end 2026-06-25
- stackctl workflow compass requires a roadmap <item>; a backlog burn-down (point-fixes with no feature node) has no item to orient on, so 'use the compass to close out' has no target — closure for ad-hoc backlog/issue work happens via backlog done + gh issue close, not the roadmap compass/close path.

## session-end 2026-06-29
- compass 'off-rail' verdict prints '(off-rail; the front door creates the node)', but the design/execute compass preconditions REFUSE off-rail and direct to 'capture it first' — no front door creates the node. An off-rail spec needs a manual 'roadmap add' capture before /stack-control:design. The hint is misleading; either fix the message or have the design front door auto-capture the node on entry.

## session-end 2026-06-29
- CI publish-npm/check 'test' job intermittently red on a vitest-worker timeout ('Timeout calling onTaskUpdate') under load — 2680/2682 pass but the run exits non-zero, producing a false-red merge gate (hit on PR #516; cleared on re-run). Recurring; consider raising vitest pool/teardown timeout or sharding the suite in CI.
