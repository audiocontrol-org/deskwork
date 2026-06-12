# Contract: Incremental per-phase audit unit + payload exclusion (threads 3/4; FR-006/007/008/009)

Shrinks the audit unit from whole-feature to a completed tasks.md phase, and removes the self-referential generator from the rendered payload.

## `incremental-audit.ts` — unit resolution (D6; FR-007)

### `resolvePhaseUnit(args): AuditUnit`

```text
args:
  tasksPath: string        // the feature's tasks.md
  phaseId: string          // a "## Phase N: User Story M" header id
  diffBase: string         // the ref the phase's work started from
```

**Behavior:**
- Parses the `## Phase N: …` grammar (verified present in every tasks.md) to find the phase's task IDs.
- Resolves `diffScope` = the commits/files that phase produced (between `diffBase` and the phase's last commit).
- Returns `{ granularity: 'phase', phaseId, diffScope, auditLogSection }`.

### `resolveComposingFeatureUnit(args): AuditUnit`

For the whole-feature `after_implement` pass (FR-008 composition):
- `diffScope` excludes any phase whose code is unchanged since that phase's unit-audit reached `converged` (carried), and includes changed + cross-cutting code.
- Returns `{ granularity: 'feature', phaseId: undefined, diffScope, auditLogSection }`.

**Invariants (tested RED-first):**
- A per-phase unit's `diffScope` contains only that phase's files (not the whole feature) — SC-006.
- The composing feature unit excludes a converged-and-unchanged phase's files and includes a changed phase's files.
- The same `runConvergenceLoop` / protocol governs a `phase` unit as a `feature` unit (the boundary changes the payload, not the protocol) — FR-007.

## `payload-implement.ts` — payload exclusion (D7; FR-006)

**Changes:**
- **Drop the `audit_log_excerpt` fold** from the audited material: the rendered payload no longer embeds the feature's own prior audit-log. (The audit-log is still read by the dampener/gate for findings — only the *audited payload* the models read excludes it.)
- **Bound the untracked-file fold** to the unit's path scope: only untracked files within the `AuditUnit.diffScope` paths are folded; unrelated parked-feature scaffolds are excluded.

**Invariants (tested RED-first):**
- Rendered payload for a feature with a populated audit-log contains zero bytes of that audit-log's content — SC-005.
- Rendered payload with an unrelated untracked parked scaffold excludes it; an in-scope untracked file is still folded — SC-005.

## Reliability invariants preserved (FR-009)

The per-phase payload flows through the SAME 014 primitives — model pinning, derived timeout (`max(floor, secs_per_kb × payload_kb)`), mechanical read-only, terminal states, liveness watchdog. The smaller payload only changes the derived timeout downward; no guarantee is weakened.

**Invariant (tested):** a per-phase payload produces a derived timeout < the whole-feature payload's derived timeout for the same lane, and the watchdog/terminal-state path is unchanged.
