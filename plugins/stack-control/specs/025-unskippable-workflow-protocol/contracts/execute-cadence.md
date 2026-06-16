# Contract: Execute per-phase cadence (US2 / US3)

Non-discretionary post-conditions the `/stack-control:execute` skill body runs at each
`tasks.md` phase boundary. Covers FR-006, FR-007, FR-008, FR-009, FR-010, FR-011.

## Per-phase boundary sequence (ordered, non-discretionary)

For each `tasks.md` phase, in order, after its tasks complete:

1. **Govern** — run `govern --phase <id>`.
   - Writes the 021 checkpoint for the phase.
   - 021 already FATALs if an earlier required checkpoint is missing (per-phase ordering,
     FR-007). `execute` MUST NOT begin phase N+1 until phase N's checkpoint is current.
   - If the single phase's payload exceeds the fleet envelope → **FATAL**
     `boundary-too-large`, pointing at TASK-75 right-sizing. Never auto-split (FR-008).
2. **Commit** — `git commit` the phase's work.
   - The commit MUST land locally first so completed work is never lost (FR-009).
   - One logical change per commit (Principle VII).
3. **Push** — `git push` the branch to its remote (FR-010).
   - On failure (offline / auth / pre-push hook) → **fail loud**, surface the error, leave
     the local commit intact, do NOT continue silently, do NOT use `--no-verify` (FR-011).

## Invariants

- The cadence is a skill-body post-condition, NOT an agent choice (FR-006). No branch
  offers to skip/defer it (ties to US5).
- Per-phase payloads are within the fleet envelope by construction → `boundary-too-large`
  is a non-event on the sanctioned path (FR-008, SC-006).
- Runs in the implementation session (feature worktree); the orchestrator session never
  runs `execute` (spec Assumptions; two-session rule).

## Test obligations (RED-first)

- T: 3-phase fixture — a current checkpoint exists after each phase before the next begins
  (SC-003).
- T: phase-1 checkpoint missing → execute refuses to start phase 2 (FR-007).
- T: each boundary produces a commit AND a push (SC-003); zero operator reminders.
- T: simulated push failure → surfaced loud, local commit intact, no `--no-verify`
  (FR-011, SC-007).
- T: single oversized phase → FATAL `boundary-too-large` pointing at right-sizing; no
  auto-split (FR-008, SC-006).
