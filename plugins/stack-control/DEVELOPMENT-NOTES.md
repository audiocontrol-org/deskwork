# Development Notes

---

## 2026-06-10: Ship stack-control v0.40.0, per-plugin configs, backlog import, and spec 012

> First entry in stack-control's own per-plugin journal (the repo-root `DEVELOPMENT-NOTES.md` remains the monorepo historical archive; this journal starts here per the per-plugin config scoping done this session).

**Goal:** Get the stack-control program onto main and adopter-usable; then exercise it as an adopter and use it to spec the next feature.

**Accomplished:**
- **PR #437** — opened the whole stack-control program (357 commits) against main; resolved the two main-merge conflicts (marketplace lockstep → 0.39.0, journal union); merged.
- **Released v0.40.0** — bump → tag → CI publish via OIDC → `assert-published` + marketplace smoke, all green. Verified stack-control is adopter-installable end-to-end (sparse copy outside the monorepo → first-run `npm install` → `setup --apply` → working verbs).
- **PR #438** — release hygiene: added `stack-control:stackctl` to the marketplace smoke; added `backlog.md` to the shim's `RUNTIME_DEPS` probe.
- Installed stack-control from the marketplace (real adopter path) and dogfooded `session-start`.
- **PR #439** — restructured to **per-plugin scoped configs** (deskwork, deskwork-studio, stack-control; not dw-lifecycle); removed the global repo-root config; relocated stack-control's backlog to the default `.stack-control/backlog`.
- **PR #445** — imported the 10 stack-control GitHub issues into the backlog (TASK-12..21) with `gh-<n>` backlinks; closed the issues with migration comments.
- **Spec 012 (backlog → feature-rigor promotion seam)** — authored via `/stack-control:define` through the full Spec Kit chain: specify → clarify (operator resolved 3 scope forks) → plan → tasks → analyze. Resolved the one HIGH analyze finding (the backend had no mutation path; verified `backlog.md task edit --add-label/--append-notes` and specified `backend.edit()`). `execute-check: runnable`. Not yet PR'd.

**Didn't Work:**
- **`session-end` auto-derived "Commits: 0"** — the merge-base/base-branch boundary logic doesn't fit the single-long-lived-branch model (this branch keeps merging to main, so merge-base ≈ HEAD). The real session had many commits across 4 merge-to-main cycles. Quantitative below is hand-corrected. (TF-09 family — captured.)
- **gh GraphQL mutations intermittently 401'd** all session (`pr create`, `pr checks`, `release list`) while REST worked — used REST endpoints throughout.
- **CI `test` check is red** (pre-existing deskwork-studio screenshot tests) — not from this work; main has shipped red across v0.38/v0.39/v0.40.

**Course Corrections:**
- [PROCESS] Per-plugin config scope changed mid-conversation: first "all but dw-lifecycle" + keep-root-as-default, then operator revised to **no global config** → redone as per-plugin-only.
- [PROCESS] "some new issues" → clarified by operator to "**all stack-control** issues (not all issues)"; confirmed the confident-10 boundary before closing anything.
- [COMPLEXITY] Discovered FR-024 (within-root path guard) blocks a plugin-rooted config from referencing repo-root artifacts → surfaced the stack-control journal/audit-log fork to the operator (chose plugin-local fresh; repo-root docs stay as archive).

**Insights:**
- The marketplace install + per-plugin scoping proved the plugin works as released; dogfooding surfaced real friction (over-long filename, import-all, session-end boundary) now durably captured in the backlog + tooling-feedback.
- Using `define` on TASK-15 dogfooded the very seam it specs; T021 will record the origin link (TASK-15 → specs/012) that the feature itself creates — the dangling-thread gap, closed by its own first use.

**Quantitative (hand-corrected — auto-derivation read 0; see Didn't Work):**
- PRs merged to main this session: **4** (#437 program, #438 hygiene, #439 per-plugin configs, #445 backlog import); **release v0.40.0** published (all 3 npm packages + marketplace).
- Spec 012 authoring commits on branch (unmerged): **6** (`930c440c`..`0016bb7d` + the session-end skeleton `6cc10fff`).
- Backlog: 11 → **21 items** (10 imported); spec 012 authored + runnable.
- Tooling friction captured this session: **3** in `tooling-feedback.md` (import-all, TF-09 prereq, filename length) + the session-end boundary bug noted above.
