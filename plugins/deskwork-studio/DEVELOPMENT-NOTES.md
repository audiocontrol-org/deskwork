# Development Notes

---

## 2026-06-10: Seed deskwork-studio backlog from GitHub issues

**Goal:** Migrate open GitHub issues scoped to deskwork-studio proper into the local stack-control backlog.

**Accomplished:**
- Imported all 97 open GitHub issues from audiocontrol-org/deskwork via `stackctl backlog import-github --apply`
- Removed 53 non-studio issues (stack-control, dw-lifecycle, scope-discovery, audit-barrage, general tooling)
- Left 44 deskwork-studio-proper issues in the backlog (review surface, scrapbook, marginalia, graphical entries, dashboard UX/bugs)
- Closed all 44 GitHub issues with a backlog-tracking comment

**Didn't Work:**
- Initial import pulled all 97 issues indiscriminately — no label/topic filter in `import-github`; manual removal script required

**Course Corrections:**
- [PROCESS] First import brought in non-studio issues; had to write a removal script and apply it

**Insights:**
- `import-github` is repo-scoped with no filter option; for monorepos with multiple concerns, a post-import cull script is the workaround until label-filtering lands
- `grep -o 'gh-[0-9]*'` matches zero-digit `gh-` from compound tokens like `gh-runtime`; use `grep -oE 'gh-[0-9]+'` instead

**Quantitative (auto-derived from git; verify before publishing):**
- Commits: 1
  - chore(deskwork-studio): seed backlog with 44 open deskwork-studio GitHub issues
- Files changed: 44
- Backlog touched: (none)
