# Development Notes

---

## 2026-06-10: Sync with main (v0.40.0); seed the deskwork-plugin backlog from GitHub issues

**Goal:** Bring `feature/deskwork-plugin` up to date with main, then stand up the plugin's stack-control session workflow: orient, and import all open deskwork-plugin-proper GitHub issues into the local backlog (closing them on GitHub).

**Accomplished:**
- Merged `origin/main` (423 commits, through v0.40.0 + stack-control PR #439) into the branch. Three conflicts resolved: `audit-barrage-config.yaml` (kept both comment blocks; `models:` identical), `DEVELOPMENT-NOTES.md` (append-only journal — kept both sides), `package-lock.json` (took main's, regenerated via `npm install`). `@deskwork/core` green post-merge (1042 tests / 114 files).
- Oriented via `/stack-control:session-start` against the per-plugin installation at `plugins/deskwork/.stack-control` (new in main's c350efb8): clean slate — empty roadmap, no active spec, empty backlog.
- Triaged all 128 open repo issues; imported the 36 deskwork-plugin-proper ones (core/CLI verbs, doctor rules, ingest/iterate/approve defects, skill-level UX) into the local backlog as TASK-1…36, each with full issue body + `gh-<n>` ref (importer-compatible, so a future `import-github` won't duplicate). Closed all 36 on GitHub with per-issue comments naming their backlog task id. Studio, dw-lifecycle, scope-discovery, and cross-plugin issues (~92) left open.

**Didn't Work:**
- `backlog import-github` couldn't do the scoped import (all-or-nothing, would have pulled 128 issues) — worked around with a per-issue `capture` loop. Logged as tooling friction.
- First close-script attempt was denied by the permission classifier for hardcoding the issue→task mapping from output order; rewrote it to read the mapping from the task files' frontmatter on disk. Right call — the disk is the source of truth.
- `@deskwork/cli` has 1 failing test (`customize-skill.test.ts` — `npm pack` of `packages/studio` fails). Studio is out of scope per operator; failure pre-exists the merge resolution. Not pursued.

**Course Corrections:**
- [PROCESS] Operator scoped the session mid-flight: deskwork-studio is outside our purview; only the deskwork plugin proper. Drove the issue triage boundary (studio surfaces stayed on GitHub).

**Insights:**
- Per-plugin stack-control installations mean the cwd decides which backlog/roadmap a verb hits — running from the monorepo root fails loud (no installation there). Session verbs must run from inside `plugins/deskwork`.
- Issue triage judgment call worth remembering: #202 (scrapbook file-size cap) imported because `core/scrapbook.ts` lives in `packages/core`, even though its sibling offender is a studio client file.

**Quantitative (re-derived from git log 372c64cc..HEAD, session-authored commits only; the auto-derived "0 commits" was a boundary artifact of the just-merged main):**
- Commits: 3 — e7785e26 (merge of origin/main), 61005763 (backlog import: 36 files, +2531), 698e0261 (session-end record)
- Backlog touched: TASK-1…TASK-36 created (status To Do; 0 transitions)
- GitHub: 36 issues closed with backlog pointers; ~92 left open as out-of-scope
- Uncommitted (deliberately): in-progress content-tree work in `packages/core` (6 files) — predates this session's tasks, untouched by the merge
