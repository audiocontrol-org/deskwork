---
name: session-end
description: "Wrap up a session on the stack-control feature branch: write the development-log journal entry, capture any Spec Kit tooling friction, and commit + push documentation changes."
user_invocable: true
---

# Session End — stack-control feature branch (Spec Kit)

> **Branch-local (temporary).** The old dw-lifecycle closing ceremony (README status table, `workplan.md` check-offs, hygiene recommendation, structural chain) is intentionally **removed** on this branch — `stack-control` is tracked via Spec Kit artifacts, not the dw-lifecycle workplan. The **development log is kept** (it's the useful part). Reconcile at merge.

Perform the closing steps:

1. **Write the `DEVELOPMENT-NOTES.md` entry** (the development log — keep this):
   ```
   ## YYYY-MM-DD: [Session Title]
   ### Feature: pluggable-lifecycle-providers
   ### Worktree: pluggable-lifecycle-providers
   **Goal / Accomplished / Didn't Work / Course Corrections / Quantitative / Insights**
   ```
   - Tag each course correction: `[PROCESS] [UX] [COMPLEXITY] [FABRICATION] [DOCUMENTATION]`.
   - Re-derive quantitative counts from source (`git log` for commits) — no false precision.
   - Be honest about mistakes and unresolved decisions; record the prior session's "next step" so the next session resumes cleanly.

2. **Capture Spec Kit tooling friction (optional, if any surfaced)** — the Spec-Kit-dogfood analog of a usage journal:
   - Append to `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/tooling-feedback.md` (one friction per entry: Repro / Workaround / Suggested-fix).
   - Only if the session actually hit Spec Kit / governance / `stackctl` friction. Skip cleanly if not.

3. **Update / close GitHub issues** that progressed this session (comment with evidence; the operator owns the closing transition).

4. **Commit + push all documentation changes:**
   - Stage the journal + any spec/doc edits made this session.
   - Commit message: `docs(stack-control): session end — [brief summary]` (no AI attribution).
   - **Push** — pushing is the final mile; not pushing is less safe, not more.
