---
name: session-end
description: "Wrap up a session by updating feature docs, writing a journal entry, and committing documentation changes."
user_invocable: true
---

# Session End

Perform all end-of-session documentation updates:

1. **Update feature README.md** status table:
   - Read: `docs/1.0/001-IN-PROGRESS/<feature-slug>/README.md`
   - Update phase statuses based on what was accomplished this session

2. **Update workplan.md**:
   - Check off completed acceptance criteria
   - Add any new tasks discovered during the session
   - Note any phase changes

3. **Write DEVELOPMENT-NOTES.md entry** using the template:
   ```
   ## YYYY-MM-DD: [Session Title]
   ### Feature: [feature-slug]
   ### Worktree: [slug]
   ### Goal / Accomplished / Didn't Work / Course Corrections / Quantitative / Insights
   ```
   - Tag each course correction: [COMPLEXITY] [UX] [FABRICATION] [DOCUMENTATION] [PROCESS]
   - Include approximate quantitative data (messages, commits, corrections)
   - Be honest about mistakes

4. **Append USAGE-JOURNAL.md entry** if the session exercised the deskwork plugin or studio in earnest:
   - Read `USAGE-JOURNAL.md` for format and tone (see the file's header for guidance)
   - Append a new dated section: `## YYYY-MM-DD: [Session usage-arc title]`
   - Capture install/acquisition friction, lifecycle skill behavior, studio interactions, anything that surprised the operator (positively or negatively)
   - Tag concrete items with **friction** / **fix** / **insight** when they cut clearly
   - Quote the operator directly where the wording sharpens a finding
   - This is user-research material, not a development log — it captures the *adopter experience* of using deskwork to do real work, distinct from DEVELOPMENT-NOTES.md's "what we built" focus
   - If the session was infrastructure-only and didn't exercise the plugin, note that briefly and skip — but reflect on whether something *should* have been exercised

5. **Update/close GitHub issues**:
   - Comment on issues that had progress
   - Close issues that are complete

6. **Commit all documentation changes**:
   - Stage: README.md, workplan.md, DEVELOPMENT-NOTES.md, USAGE-JOURNAL.md (when updated)
   - Commit message: `docs: session end — [brief summary]`
   - Push to feature branch
