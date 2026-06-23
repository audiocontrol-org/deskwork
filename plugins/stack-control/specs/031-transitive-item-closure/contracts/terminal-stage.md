# Contract: the post-ship terminal stage (`closed` phase + status)

Adds one terminal phase after `shipped` and the rules that surface it and gate it.

## Status vocabulary (grammar)

- `grammars/roadmap.peg`: `statusVocabulary` gains `closed`; `terminalStatuses`
  becomes `[shipped, cancelled, retired, closed]`.
- Effect: `close-related`/`advance` (which read the grammar-derived terminal set)
  accept `closed` as a valid terminal/closing context uniformly.

## Phase model (WORKFLOW.md)

- Add `phase:closed` after `phase:shipped`; `closed` is terminal (no `next`).
- The `shipped → closed` transition's effect is the operator-confirmed cascade
  (carried by `advance --to closed`; see close-cascade contract).

## Phase derivation

- `src/workflow/phase-derivation.ts` maps roadmap status → phase **by name**.
- The `status === 'shipped' → last-phase` special-case is **removed** (clean break,
  not a fallback): `shipped` derives to `phase:shipped`, `closed` to `phase:closed`.
- Consequence: a `shipped` item is no longer the lifecycle's terminal; status /
  compass / session-start report it as not-yet-closed, with `closed` as the pending
  next move (FR-013 — the "don't forget" surface).

## Compass rules

- `compass <id> --intent <…>`: `shipped → closed` is a legitimate next move
  (verdict `on-course`).
- Entering `closed` from any phase other than `shipped` is refused (non-zero verdict).
- `closed` is terminal: no legitimate outgoing move (a side-state-like terminal, but
  reached on-rail, distinct from `cancelled`/`retired`).

## Install-agnostic invariant (FR-017/FR-018)

- NO stage (including `closed`) carries a post-install/release validation entrance
  criterion. The only post-ship "validation" is the operator-confirm guard at
  `advance --to closed --apply`.
- No `tasks.md`-resident validation step is implied; governance never waits on a
  publish-dependent task (the offing deadlock cannot be expressed).

## Exit codes (advance/compass)

- `advance --to closed`: `0` success; `1` fail-loud (not `shipped`, unresolved
  cascade `unknownIds`); `2` usage error.
- `compass`: `0` on-course/behind; non-zero on `ahead`/`off-rail` (e.g. `closed` from
  a non-`shipped` phase).
