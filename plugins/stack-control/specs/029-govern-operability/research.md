# Phase 0 Research: govern-operability

All major decisions were settled in the approved design record (`docs/superpowers/specs/2026-06-19-govern-operability-design.md`) and the `/speckit-clarify` session; this consolidates them in Decision / Rationale / Alternatives form per user story. No open NEEDS CLARIFICATION remain.

## US1 — Fleet reliability

- **Decision**: Promote the no-grounding Anthropic-lane config to the shipped `templates/audit-barrage-config.yaml` (remove `--permission-mode plan`; add `--disallowedTools …` so lanes are read-only by construction; raise the timeout floor). Enable codex liveness via `model_reasoning_summary=detailed` (stderr pulses) and restore the tight liveness window. Update installation config in lockstep.
- **Rationale**: Wall-clock cost is the agentic grounding tool-loop, not token throughput (opus→sonnet swap didn't help — both hit the cap); no-grounding sonnet completed 167–233s on 14–24KB. The fix currently lives only in this project's override (Packaging-is-UX → must ship in the template).
- **Alternatives**: `--json` codex stream extractor (deferred — bigger parser change, only if reasoning-summary pulses prove insufficient); dropping opus (rejected — composition is a separate calibration-backed decision; opus stays, calibrated, escalate only if it can't meet the envelope).
- **T006 — opus no-grounding calibration (RESOLVED with live data 2026-06-20)**: Hypothesis confirmed. A live opus-no-grounding run (`claude -p --model opus --output-format stream-json --verbose --disallowedTools <set>`, stdin-delivered) against the **real Phase-1 barrage payload (25,088 bytes ≈ 25 KB)** completed in **171.97s wall-clock** (100 KB of output produced) — comfortably under the shipped 420s floor, and under 300s. This refutes the "opus is 3–5× slower so it will time out" concern (AUDIT-BARRAGE-claude-03): the proven wall-clock killer was the **agentic grounding tool-loop** (`--permission-mode plan`), not opus's token throughput — the 027-era opus timeout was measured *with* grounding. Removing grounding makes the lane a single text-only pass, and opus pays roughly the same as sonnet there (172s vs sonnet's 167–233s). The template's opus lane (FR-005 composition unchanged) is therefore **calibrated-safe**, not assumed. (Per T006, had opus overrun the envelope it would have been a fleet-composition decision surfaced to the operator — never a unilateral drop; that branch was not reached.)
- **Empirical tool-name correction (Phase-1 govern + opus calibration, 2026-06-20)**: The live `claude -p` runs emit `Permission deny rule "<name>" matches no known tool` for **`MultiEdit`** and **`NotebookRead`** — neither is a tool in this Claude Code version. AUDIT-BARRAGE-codex-01 (HIGH) asked to add `MultiEdit` to the deny-list as an "omitted file-mutating tool"; the empirical evidence refutes the premise — the real repo-mutating tools (`Edit`/`Write`/`NotebookEdit`) were already denied, so no write path was ever open, and denying a non-existent tool is an inert no-op that only pollutes stderr (and is speculative building). The deny-list is now the exact known-tool set: `Bash,Read,Grep,Glob,Edit,Write,WebFetch,WebSearch,Task,NotebookEdit` (the stale `NotebookRead` removed, `MultiEdit` not added). A test regression-locks both stale names OUT.

## US2 — Observability

- **Decision**: Surface per-lane terminal state (completed / timed-out / killed-no-liveness / killed-external / zero-byte) at synthesis + lift; a run with any degraded lane does not increment the dampener quiet-run streak.
- **Rationale**: A SIGTERMed lane leaves a zero-byte artifact indistinguishable from "clean, no findings"; the fleet silently degrades (design-control ran 17 one-model rounds). Degraded ≠ convergence is a correctness prerequisite for US3.
- **Alternatives**: widen the liveness window blindly (rejected — that's the US1 stopgap being removed).

## US3 — Determinism

- **Decision**: Key the dampener on finding identity (the shared finding-signature) and add cross-round severity hysteresis; a previously-seen finding re-rated higher on unchanged code does not reset the quiet streak; a genuinely new HIGH still does.
- **Rationale**: Severity jitter (LOW round 2 → HIGH round 4 on unchanged code) defeats the 2-consecutive-quiet branch (TASK-146/gh-482). Identity is the robust fix; hysteresis the cheap complement.
- **Alternatives**: identity-only or hysteresis-only (rejected — both, per design Decision 3).

## US4 — Loop hygiene

- **Decision (a)**: Lift/slush skip any finding already `fixed-<sha>` (in-loop or prior-commit); defer MEDIUM migration to loop terminal; auto-reconcile a backlog task when its finding flips fixed; add a `backlog done`/close verb; dedup lifted findings by finding-signature across runs.
- **Decision (b)**: `--override` short-circuits the barrage entirely (record reason + graduate, no render/barrage/lift/slush pass); per-invocation only, no persistence (operator decision).
- **Rationale**: The loop must not manufacture work that defeats its own purpose: noise for already-done findings (a), and another audit round when the operator is escaping the ring (b). They compound — (b)'s spurious final pass was a source of (a)'s noise.
- **Alternatives (b)**: route-through-the-gate-then-OPEN (the current defect, rejected); persistent fingerprint-keyed override (rejected by operator — short-circuit + US7 already removes the re-run cost; persisting across code changes is undesirable).

## US5 — Payload correctness

- **Decision**: Per-phase payload = union of the phase's changed files across all its commits (diff-base = pre-phase commit, not HEAD~1). Eliminate out-of-window false HIGHs by widening to referenced-but-out-of-window deps AND instructing the auditor that out-of-window = not-this-phase-scope.
- **Rationale**: Incomplete/over-narrow payloads produced "diff omits the fix" (TASK-263) and "file absent/not-imported" (TASK-316) false HIGHs that forced overrides. Critical-path under default-per-phase.
- **Alternatives**: single lever only (rejected — combine both per design Decision 6).

## US6 — Granularity

- **Decision**: Either-of graduate gate (all-phase-checkpoints-current OR whole-feature record-converged); default stays per-phase; full-audit-at-end is opt-in; amend the 025 "compose, reject augment" clarify record.
- **Rationale**: Restores operator flexibility removed in 025 without changing the default; gives shared-file features an O(n) escape (operator decision 2026-06-19: default per-phase).
- **Alternatives**: default full-audit-at-end (operator rejected); per-feature config with no default (rejected).

## US7 — Staleness

- **Decision**: Fingerprint each phase's own diff hunks (contiguous changed line-ranges, post-image content), not whole-file. A later-phase edit to the same region correctly stales the earlier checkpoint; an unrelated hunk does not.
- **Rationale**: Whole-file fingerprints forced re-governing 1..N−1 at each phase (TASK-289, O(n²)). Critical-path because per-phase stays default.
- **Alternatives**: line-range (subsumed by hunk); per-symbol/AST (rejected — needs language parsing, over-engineered); govern-at-end mode (partially delivered by the US6 opt-in).

## US8 — Process discipline

- **Decision**: Codify TASK-60's structural drivers into the audit/implement skill bodies + barrage prompt templates: channel-enumeration for surface-adding fixes; invariant-first boundary disposition; round-0 self-red-team over the fix diff; fleet-degradation pricing (backed by US2); severity-rubric anchoring (backed by US3).
- **Rationale**: The myopic-convergence round count came from these structural drivers, not the protocol mechanics.
- **Alternatives**: leave as ambient discipline (rejected — it recurs; codify in the surfaces that travel with the install).

## US9 — Hygiene

- **Decision**: Clear the 027 residuals: `!`→get-or-throw helper (TASK-290); document cluster/group in roadmap SKILL.md (TASK-291); uniform list-flag stray-comma guard + remove dead `--part-of` branch (TASK-292); fence-aware `rewriteEdgeLine` (TASK-293); tooling-feedback → GitHub issues (TASK-294/gh-488).
- **Rationale**: Independent low-stakes cleanups deferred during 027 to avoid the staleness cascade; safe to land last.
- **Alternatives**: separate feature (rejected — operator wants the whole umbrella in one burndown).
