# Quickstart / Validation: govern-operability

Runnable validation mapped to the spec's Success Criteria (SC). Run from the installation root (`plugins/stack-control/`). These are validation guides, not implementation; the per-FR tests live in `tests/` and land RED-first per phase.

## Prerequisites

- The full vitest suite green: `npm --workspace @deskwork/... test` (or the plugin's `vitest` run).
- The plugin validates and loads.

## SC-001 — converged unchanged tree graduates without re-opening (US3)

Replay the determinism fixture (a finding rated LOW then HIGH across rounds with no code change). Expect: the loop converges; the re-rate does not reset the quiet streak.

## SC-002 — override fires zero barrage runs (US4b)

Run `stackctl govern --mode implement --phase <p> --override "ringing, diminishing returns"` on a phase. Expect: graduates; **zero** new run directories created; audit trail records the override reason, attributable as override (not convergence).

## SC-003 — already-fixed findings produce zero tasks; ≤1 task per signature (US4a)

Run a loop where a finding is fixed mid-loop. Expect: zero backlog tasks for it. Run the same finding across N rounds. Expect: at most one task (signature dedup); flipping to `fixed-<sha>` closes the task.

## SC-004 — degraded lane never counts as clean (US1/US2)

Force a lane to time out (exit 143, zero-byte). Expect: synthesis + lift report the degraded terminal state distinctly from "no findings"; the dampener does not increment the quiet streak. A fully-healthy zero-finding run DOES increment it.

## SC-005 — shared-file N-phase feature governs O(n) (US7)

Govern a fixture feature whose phases 2 and 4 edit different hunks of one shared file. Expect: phase-4 edits do NOT stale phase-2's checkpoint; a same-region edit DOES; total governance is linear in N.

## SC-006 — fresh install governs on the shipped default config (US1)

Using only `templates/audit-barrage-config.yaml` (no local override), run a per-phase barrage on a real payload. Expect: Anthropic lanes complete read-only (no `--permission-mode plan` grounding loop) within the timeout floor; codex emits a liveness pulse within the tight window.

## SC-007 — either-of graduate gate (US6)

Graduate one fixture feature via current per-phase checkpoints; another via a whole-feature convergence record under the full-audit opt-in. Expect: both pass; default with no opt-in requires per-phase.

## SC-008 — no payload-scoping false HIGHs (US5)

Per-phase govern a phase whose impl + test landed in separate commits and whose findings reference a present out-of-window file. Expect: no "diff omits the fix" / "absent/not-imported" false HIGH; a genuinely-missing impl still raises a real HIGH.

## SC-009 — umbrella closed

Confirm all 17 referenced backlog tasks (TASK-60, 145, 146, 149, 154, 263, 288, 289, 290, 291, 292, 293, 294, 316, 317, 318) and the two gap nodes are closed by this feature's completion.
