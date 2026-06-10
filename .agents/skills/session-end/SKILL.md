---
name: session-end
description: "Wrap up a session on the stack-control feature branch: write the development-log journal entry, capture any Spec Kit tooling friction, and commit + push documentation changes."
---

# Session End — stack-control feature branch (Spec Kit)

> Branch-local for `feature/pluggable-lifecycle-providers`. The old dw-lifecycle closing ceremony (README status table, `workplan.md` check-offs, hygiene/structural chain) is removed — stack-control is tracked via Spec Kit artifacts. The development log is kept.

1. Append a `DEVELOPMENT-NOTES.md` entry (Goal / Accomplished / Didn't Work / Course Corrections `[PROCESS][UX][COMPLEXITY][FABRICATION][DOCUMENTATION]` / Quantitative / Insights). Re-derive counts from `git log`; record the next step so the next session resumes cleanly.
2. If Spec Kit / governance / `stackctl` tooling friction surfaced, append to `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/tooling-feedback.md` (Repro / Workaround / Suggested-fix). Skip if none.
3. Comment on / close GitHub issues that progressed (operator owns the closing transition).
4. Commit + **push** the documentation changes (`docs(stack-control): session end — …`, no AI attribution).
