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
