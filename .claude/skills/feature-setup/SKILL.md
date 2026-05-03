---
name: feature-setup
description: "Create feature infrastructure: git branch, worktree, docs directory, and documentation files."
user_invocable: true
---

# Feature Setup

1. **Determine feature slug and read definition:**
   - If invoked with an argument, use that as the slug
   - Otherwise, ask the user for the feature slug
   - Check for `/tmp/feature-definition-<slug>.md` — if it exists, use its contents
   - If no definition file exists, create blank templates and suggest running `/feature-define` first

2. **Create branch and worktree:**
   ```bash
   git worktree add ~/work/deskwork-work/<slug> -b feature/<slug>
   ```
   - Run from the main repository directory
   - If worktree already exists, report it and skip

3. **Create docs directory:**
   ```bash
   mkdir -p docs/1.0/001-IN-PROGRESS/<slug>
   ```

4. **Create documentation files:**
   - `docs/1.0/001-IN-PROGRESS/<slug>/prd.md` — PRD from definition file or template. **Include `deskwork.id` frontmatter** (a fresh UUID v4) so the file is registered with deskwork's content index from creation. The frontmatter shape:
     ```yaml
     ---
     deskwork:
       id: <uuid>
     title: <feature-slug>
     date: <today YYYY-MM-DD>
     author: <author from .deskwork/config.json>
     ---
     ```
   - `docs/1.0/001-IN-PROGRESS/<slug>/workplan.md` — workplan from definition file or template. No `deskwork.id` frontmatter — the workplan is implementation tracking, not a deskwork-managed document. (If a future workplan revision warrants review, ingest at that point.)
   - `docs/1.0/001-IN-PROGRESS/<slug>/README.md` — status table with phases
   - `docs/1.0/001-IN-PROGRESS/<slug>/implementation-summary.md` — draft template
   - Use the Write tool for each file

5. **Register the PRD with deskwork for editorial review:**
   - The PRD is the document operator will iterate on; the workplan is tracking. Per project workflow, the PRD goes through deskwork's review/iterate/approve cycle BEFORE implementation begins. (Documented in `.claude/CLAUDE.md` under "Feature lifecycle.")
   - Read `.deskwork/config.json` to determine the site/collection slug for the project's content collection.
   - Run `deskwork ingest --site <site-slug> docs/1.0/001-IN-PROGRESS/<feature-slug>/prd.md` — backfills the calendar with this PRD as a Drafting-state entry. Ingest is the right shape because the file already exists with `deskwork.id` frontmatter.
   - Run `deskwork review-start --site <site-slug> <feature-slug>` to enqueue the PRD for editorial review. The slug deskwork uses is the feature slug (matching the docs directory name).
   - Capture the studio review URL: post-Phase-34a, longform PRD review lives at `/dev/editorial-review/entry/<entry-uuid>` (entry-keyed; the PRD's `deskwork.id` from frontmatter).

6. **Report results:**
   - Branch name, worktree path, docs path, files created
   - **Studio review URL** for the PRD — this is the next operator action: review the PRD via the studio, leave margin notes, iterate via `/deskwork:iterate` until approved.
   - Next steps in canonical order:
     1. Operator iterates the PRD via deskwork until the workflow state is `applied`
     2. Run `/feature-issues` to file GitHub issues from the (now-stable) workplan
     3. Run `/feature-implement` to begin implementation — `/feature-implement` will refuse to proceed if the PRD's deskwork workflow is not `applied`
