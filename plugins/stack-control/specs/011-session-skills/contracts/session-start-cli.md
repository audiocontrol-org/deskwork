# Contract: `stackctl session-start`

Read-only boot orientation. Resolves the enclosing installation, gathers orientation, prints a report, and **stops** (no authoring/implementation step fires).

## Invocation

```
stackctl session-start [--at <dir>] [--json]
```

- `--at <dir>` — explicit installation/root override (surface-agnostic invocation context; FR-015/FR-020). Default: cwd-resolved nearest installation.
- `--json` — machine-readable `OrientationReport` instead of the rendered text (for non-Claude-Code adapters).

## Behavior

1. Resolve the installation via `resolveInstallation(--at ?? cwd)` (009 port). **No match → exit 1**, descriptive error naming the start dir and directing to `stackctl setup` (FR-014; never a bundled-copy fallback).
2. Gather (all reads through the resolved config — FR-012):
   - roadmap ready/next + blocked (006 reasoner, resolved `roadmap` path);
   - active-spec chain position (`.specify/feature.json` + artifact set → next `/speckit-*` step; `null` if none — FR-003/FR-005);
   - latest journal entry (resolved `journal` path; `null` if first session — FR-005);
   - open **local backlog** items (`backlog list`; resolved `backlog` path). **No GitHub-issue query** (FR-001).
   - branch-staleness advisory (research D3): behind → advisory line; current → none; undeterminable → clean skip note (FR-016/FR-017).
3. Print the `OrientationReport`. **Take no implementation/authoring action** (FR-002/FR-021).

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Oriented and reported (including all "none"/"skipped" sub-states). |
| 1 | Fail-loud: invoked outside any installation, or a required working file is unreadable/malformed. |
| 2 | Usage error (unknown flag). |

## Invariants

- **Read-only**: 0 on-disk changes; re-running is identical (SC-008).
- **Never blocks on staleness** (advisory only; SC-005).
- **Stops**: prints and returns; never invokes a `/speckit-*` step (FR-021).
- Runs to completion in a plain shell with no Claude Code surface (SC-007).
