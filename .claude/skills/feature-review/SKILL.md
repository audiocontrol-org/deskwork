---
name: feature-review
description: "Delegate code review of recent changes to code-reviewer agent and report findings."
user_invocable: true
---

# Feature Review

1. **Determine review scope:**
   - `git diff --stat` for uncommitted changes
   - `git diff --cached --stat` for staged changes
   - `git log main..HEAD --oneline` for committed changes
   - `git diff --name-only main..HEAD` for changed file list

2. **Gather context:**
   - Read changed files
   - Read workplan for acceptance criteria context

3. **Delegate to code-reviewer:**
   - List of changed files with full paths
   - What the changes accomplish (from workplan)
   - Project guidelines from `.claude/CLAUDE.md`
   - Report format: issues found, severity (critical/warning/info), file, line, recommendation

4. **Report findings:**
   - Summary: N issues found (X critical, Y warnings, Z info)
   - Each issue: file, line, description, recommendation
   - Overall: ready to ship / needs fixes

5. **Do NOT fix issues** — this skill only reports.
