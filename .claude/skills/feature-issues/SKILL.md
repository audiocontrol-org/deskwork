---
name: feature-issues
description: "Create GitHub issues from a completed workplan: parent feature issue, implementation issues, then update workplan with links."
user_invocable: true
---

# Feature Issues

1. **Identify feature:**
   - Extract slug from worktree/branch
   - Read: `docs/1.0/001-IN-PROGRESS/<slug>/workplan.md`
   - Read: `docs/1.0/001-IN-PROGRESS/<slug>/prd.md`

2. **Determine GitHub link base:**
   - Format: `https://github.com/audiocontrol-org/deskwork/blob/feature/<slug>/path`

3. **Create parent feature issue:**
   ```bash
   gh issue create \
     --title "Feature Name" \
     --body "## Overview
   [Problem statement from PRD]

   ## Documentation
   - PRD: [GitHub link]
   - Workplan: [GitHub link]

   ## Implementation Phases
   - [ ] Phase 1: [title]
   ..." \
     --label "enhancement"
   ```

4. **Create implementation issues** (one per phase):
   ```
   Part of #<parent-number>

   ## Acceptance Criteria
   - [ ] [criterion from workplan]
   ```

5. **Update workplan** with GitHub Tracking section linking all issues.

6. **Report results** — list all created issues with URLs.
