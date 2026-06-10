# Tooling Feedback


## session-end 2026-06-10
- import-github imports ALL open issues (gh issue list --state open, no label/number filter) — importing a subset (e.g. only stack-control issues) is impossible via the verb; had to per-issue 'backlog capture' with gh-<n> refs instead.
- Spec Kit check-prerequisites.sh rejects the single long-lived branch name (TF-09) — /speckit-analyze's prerequisite check aborts; feature dir had to be resolved via .specify/feature.json, not the branch.
- backlog.md derives the task filename from the full title with no length cap — a long imported-issue title produced a 256-byte filename that broke 'git checkout' on Linux (ext4 255-byte limit), failing CI checkout entirely.
- session-end auto-derived 'Commits: 0' on a single long-lived branch — the merge-base/base-branch boundary logic doesn't fit a branch that keeps merging to main (merge-base ≈ HEAD), so it reported 0 commits for a session with many. The quantitative block had to be hand-corrected. Same TF-09 family; session-end needs a boundary mode for the single-branch program (e.g. honor --since, or last-session-tag).
