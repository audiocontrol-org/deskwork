# session-start and session-end are orthogonal to the workflow — always available, never blocked

`/stack-control:session-start` (read-only boot orientation) and
`/stack-control:session-end` (capture-only close) are **orthogonal to the lifecycle
workflow**. They MUST **always be available** and MUST **never refuse, block, or
gate** on workflow/lifecycle state. They report; they never enforce. This is an
operator decision (2026-06-23) recorded here so no future session adds a blocking
gate to either.

## The rule

1. **No refusal in session-start / session-end.** Neither skill may exit non-zero,
   halt, or otherwise withhold its function because of workflow state — no
   "refuse to start until X", no "refuse to end until Y". session-start always
   orients and stops; session-end always captures + commits/pushes the journal.
2. **Advisory surfacing is allowed; gating is not.** Surfacing a divergence at boot
   or close — counts, snapshots, "item M is merged but its status is still
   `in-flight`", open-finding tallies — is fine and encouraged, AS a non-blocking
   advisory the operator can act on or ignore. The moment it can *prevent* the skill
   from completing, it has crossed the line this rule forbids.
3. **Enforcement gates live at WORKFLOW waypoints, never at session boot/close.** A
   refuse-to-proceed gate belongs on the lifecycle steps (`execute`, `review`,
   `complete`, `close`, the compass precondition) — the places that advance the
   work — never on the always-on entry/exit a fresh or closing agent needs.

## Why

session-start is the orientation a fresh agent ALWAYS needs to act correctly;
session-end is the capture a closing agent ALWAYS needs to preserve continuity.
Blocking either strands the operator: an agent that cannot orient because some item
is in a bad state, or cannot journal/commit its work because a gate refuses, is
worse off than one that proceeds with an advisory. The lifecycle is enforced where
the work moves, not at the doorways.

## How to apply

- When tempted to add a gate that refuses session-start/session-end on workflow
  state, STOP — make it a non-blocking advisory line instead, and put any actual
  refusal on the relevant workflow waypoint.
- This is the explicit constraint on the ship-stage backstop gate
  (`multi:feature/ship-stage`): the "merged-but-status-in-flight" refusal lives at
  the close step + a review/doctor check, and session-start/session-end only
  *surface* the divergence, never block on it.

## Cross-references

- `.claude/rules/enforcement-lives-in-skills.md` — session-start fires its guards as
  a NON-BLOCKING advisory snapshot (the same discipline, stated per-skill).
- `multi:feature/ship-stage` — the ship feature whose backstop gate this rule bounds.
