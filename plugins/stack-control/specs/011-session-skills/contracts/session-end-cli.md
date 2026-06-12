# Contract: `stackctl session-end`

Capture-only close. Records the journal entry, captures tooling friction, runs an advisory clone-snapshot, surfaces progressed backlog items, and commits + pushes the doc changes. **No refuse-to-end gates** (capture-only posture, Clarification OQ-2).

## Invocation

```
stackctl session-end [--at <dir>] [--since <sha>] [--no-push] [--json]
```

- `--at <dir>` — explicit installation/root override (FR-015/FR-020).
- `--since <sha>` — explicit session-boundary SHA (else: merge-base with the base branch → `HEAD~N` fallback; research D5).
- `--no-push` — compose + commit but skip the push (escape hatch; default is commit **and** push, FR-010).
- `--json` — machine-readable `SessionEndReport`.

## Behavior

1. Resolve the installation (009 port). **No match → exit 1** directing to `stackctl setup` (FR-014).
2. Assemble the journal entry (resolved `journal` path): auto-derive the mechanical/quantitative sections from `git log <boundary>..HEAD` (commits, files-changed, **backlog items touched** by commit reference); emit empty narrative slots for the agent (FR-006, research D5). Always write an entry, even sparse (FR-006). Shape follows the configured journal template else the documented default (FR-013).
3. Capture tooling friction into the resolved `tooling_feedback` path (append-only) **if any surfaced**; skip cleanly otherwise (FR-007).
4. Run the advisory clone-snapshot over the resolved `clone_scope`; surface new duplication. Skip with a note if scope unconfigured or tool absent (FR-008; never blocks).
5. Surface backlog items that **progressed** (commit-referenced; research D6) as evidence. **0 status transitions; no GitHub-issue query** (FR-009/SC-006).
6. Stage the resolved doc working files, commit doc-only (warn — not block — on uncommitted non-doc changes, FR-011), and **push** with bounded retry/backoff unless `--no-push`. A push failure is surfaced (record committed locally; close reported not-fully-complete), never reported clean (FR-010).
7. Print the `SessionEndReport`.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Close captured + committed (+ pushed unless `--no-push`). |
| 1 | Fail-loud: outside any installation, or a working file could not be written/resolved. |
| 2 | Usage error. |
| 3 | Committed locally but **push failed** (record is safe; surfaced for the operator to retry). |

## Invariants

- **Capture-only**: never refuses to close on open findings / TBDs (Clarification OQ-2).
- **No auto-transition** of backlog items; **no GitHub-issue** read/write (SC-006).
- Journal entry is **always** written (empty-but-honest beats skipped; FR-006).
- Runs to completion in a plain shell with no Claude Code surface (SC-007).
