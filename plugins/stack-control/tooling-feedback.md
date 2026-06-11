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
