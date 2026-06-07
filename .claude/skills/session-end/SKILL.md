---
name: session-end
description: "Wrap up a session on the stack-control feature branch: write the development-log journal entry, capture any Spec Kit tooling friction, and commit + push documentation changes."
user_invocable: true
---

# Session End — stack-control feature branch (Spec Kit)

> **Branch-local (temporary).** The old dw-lifecycle closing ceremony (README status table, `workplan.md` check-offs, hygiene recommendation, structural chain) is intentionally **removed** on this branch — `stack-control` is tracked via Spec Kit artifacts, not the dw-lifecycle workplan. The **development log is kept** (it's the useful part). Reconcile at merge.

Perform the closing steps:

1. **Advisory clone snapshot — catch this session's duplication (incl. donkey work):**
   - Run `bash .dw-lifecycle/scope-discovery/clone-snapshot.sh` (defaults to `plugins/stack-control`; pass another path to scope a different codebase). It runs jscpd **per-codebase** (the intentional cross-plugin vendored copies are excluded) over `ts/tsx/sh/bash`, so the signal is usable.
   - **This is the surface that catches code written OUTSIDE the `/speckit-implement` flow** — quick fixes, routine edits, refactors. Review any NEW clone group: refactor a genuine new duplication now, or note it in the journal with a justification. Advisory in v1 (does not block); full baseline + NEW-only gating + dispositions arrive with the vendored clone-detector (`design/migrate-scope-discovery`).

2. **Write the `DEVELOPMENT-NOTES.md` entry** (the development log — keep this; note any clone findings from step 1):
   ```
   ## YYYY-MM-DD: [Session Title]
   ### Feature: pluggable-lifecycle-providers
   ### Worktree: pluggable-lifecycle-providers
   **Goal / Accomplished / Didn't Work / Course Corrections / Quantitative / Insights**
   ```
   - Tag each course correction: `[PROCESS] [UX] [COMPLEXITY] [FABRICATION] [DOCUMENTATION]`.
   - Re-derive quantitative counts from source (`git log` for commits) — no false precision.
   - Be honest about mistakes and unresolved decisions; record the prior session's "next step" so the next session resumes cleanly.

3. **Capture Spec Kit tooling friction (optional, if any surfaced)** — the Spec-Kit-dogfood analog of a usage journal:
   - Append to `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/tooling-feedback.md` (one friction per entry: Repro / Workaround / Suggested-fix).
   - Only if the session actually hit Spec Kit / governance / `stackctl` friction. Skip cleanly if not.

4. **Update / close GitHub issues** that progressed this session (comment with evidence; the operator owns the closing transition).

5. **Commit + push all documentation changes:**
   - Stage the journal + any spec/doc edits made this session.
   - Commit message: `docs(stack-control): session end — [brief summary]` (no AI attribution).
   - **Push** — pushing is the final mile; not pushing is less safe, not more.
