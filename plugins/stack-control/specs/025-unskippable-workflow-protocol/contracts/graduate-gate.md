# Contract: Per-phase graduate gate (US1)

The computable gate criterion published in `templates/WORKFLOW.md` and evaluated by the
022 gate-eval. Covers FR-001, FR-001a, FR-002, FR-003, FR-004, FR-005.

## Criterion

- **Kind**: `all-phase-checkpoints-current` (new gate-eval criterion kind).
- **Targets / transitions**:
  - `graduate` (`governing → shipped`) — required for every `tasks.md` phase.
  - `start-governing` (`implementing → governing`) — required for the phases completed so
    far (FR-002).
- **Source of truth**: 021 per-phase checkpoints. The gate criterion is
  `all-phase-checkpoints-current` (this kind) — NOT `record-converged impl`. The
  whole-feature `record-converged impl` signal is the **derived artifact** the criterion's
  success also writes (composed from the checkpoint union, FR-001a), consumed by
  reconcile/reporting — never a second, separately-run criterion and never a separate
  whole-feature govern run (C1, resolved 2026-06-16).

## Evaluation algorithm (deterministic)

1. Enumerate phases from `tasks.md` phase headers for the feature.
2. If zero phases are derivable → **unmet** (NOT trivially met, and NOT a crash). A
   `tasks.md` with no `## Phase` headers can never satisfy a per-phase gate, so the gate is
   unmet — important because the read-only compass evaluates this gate and must not crash on
   a non-phased/legacy feature. (Refined 2026-06-16: the earlier "zero phases → FATAL"
   reserved FATAL for the dangerous masquerade in step 3, which is the case that actually
   needs fail-loud.)
3. For each phase, resolve its authoritative file list.
   - If a phase EXISTS but has no/incomplete file list → **FATAL**, naming the phase (FR-004;
     depends on TASK-70). This is the only fail-loud path: a zero-scope checkpoint would
     masquerade as governed. Never scope a partial/empty payload.
4. For each phase, assert a checkpoint exists AND is current (021 fingerprint matches
   present content).
   - Missing checkpoint → unmet, name the phase.
   - Stale checkpoint (fingerprint mismatch) → unmet, name the phase (FR-003).
5. Met **iff** there is ≥1 phase and all phases have current checkpoints.

(Note: `enumeratePhases` — the primitive the `execute`/`govern` paths use when actively
governing — DOES fail loud on zero phases; the *gate* read here degrades zero-phases to
unmet so the compass stays robust. Both treat a phase-with-no-file-list as FATAL.)

## Inputs / outputs

- **Input**: feature id, `tasks.md`, `.stack-control/govern/phase-checkpoints/<feature>/`.
- **Output**: gate verdict `{met: bool, unmet: [{phase, reason}], fatal?: {phase, reason}}`.
- **No writes** — the gate is a pure read (Principle IV: reads intent, writes nothing back).

## Test obligations (RED-first)

- T: 3-phase feature, checkpoints for 2/3 → unmet, names phase 3 (SC-001).
- T: all 3 current → met.
- T: phase 2 edited after checkpoint → unmet, names phase 2 (SC-002).
- T: phase with no file list → FATAL naming the phase (FR-004).
- T: zero phases → FATAL.
- T: standalone whole-feature record but no per-phase checkpoints → unmet (FR-001).
- T: composed record derives from checkpoint union; no whole-feature payload assembled
  (FR-001a).
