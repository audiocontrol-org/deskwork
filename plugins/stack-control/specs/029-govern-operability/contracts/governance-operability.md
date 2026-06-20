# Contracts: govern-operability

CLI/behavior contracts the feature exposes or changes. These are the observable surfaces tests assert against.

## `stackctl govern --override <reason>` (US4 FR-017/018)

- **Before**: routes `--override` through the gate, which runs a full render→barrage→lift→slush pass, then returns OPEN.
- **After**: short-circuits — records the override reason in the audit trail (attributable as an override graduation) and graduates, firing **zero** barrage runs. No render/barrage/lift/slush. No persistence beyond the audit-trail record.
- **Contract test**: invoking `govern --override "x"` produces 0 new run directories/INDEX entries and an audit-trail entry attributable to override.

## `stackctl backlog done <id>` (US4 FR-015) — new verb

- Closes/reconciles a backlog task (the sanctioned close path; replaces hand-editing the store).
- Invoked automatically when a finding flips `fixed-<sha>` for the task that referenced it; also operator-invokable.
- **Contract test**: a finding flipping to `fixed-<sha>` closes its referencing task; `backlog done <id>` closes a task by id.

## Lift/slush never-lift-fixed + dedup (US4 FR-013/014/016)

- Lift/slush skip any finding whose status is `fixed-<sha>` → no task created.
- MEDIUM-residual migration deferred until the loop terminal (converged/overridden).
- Findings deduped by finding-signature across runs → at most one task per signature.
- **Contract test**: a fixed-in-loop finding yields 0 tasks; the same finding across N runs yields ≤1 task.

## Dampener identity + hysteresis (US3 FR-009/010/011/012)

- The dampener counts NEW (previously-unseen by signature) HIGH findings, not raw per-run HIGH count.
- A re-rated already-seen finding on unchanged code does not reset the quiet streak; a new HIGH does.
- **Contract test**: replay fixture (LOW→HIGH re-rate, no code change) converges; new-HIGH fixture blocks.

## Degraded-fleet observability (US1/US2 FR-006/007/008)

- Synthesis + lift report each lane's terminal state distinctly; the degraded set never counts as a quiet run; a fully-healthy zero-finding run does.
- **Contract test**: a forced timed-out lane (exit 143, zero-byte) is surfaced distinctly and does not increment the streak; a healthy zero-finding run does.

## Per-phase payload union + out-of-window (US5 FR-020/021/022)

- Per-phase payload = union of the phase's changed files across all its commits (diff-base = pre-phase).
- Referenced-but-out-of-window deps are included and/or the prompt treats out-of-window as not-this-phase-scope; real missing-impl findings still raised.
- **Contract test**: a multi-commit phase with an out-of-window-but-present reference raises no false "absent/omits-the-fix" HIGH; a genuinely-missing impl still raises a HIGH.

## Either-of graduate gate (US6 FR-023/024/025)

- `gate-eval.ts` graduates on all-phase-checkpoints-current OR whole-feature record-converged; per-phase is the default, full-audit-at-end is opt-in.
- **Contract test**: a feature graduates via current per-phase checkpoints; another via a whole-feature record under opt-in; default with no opt-in requires per-phase.

## Hunk-granularity checkpoint fingerprint (US7 FR-026/027/028)

- `computeScopeFingerprint` hashes the phase's own changed diff hunks (post-image), not whole files.
- An unrelated later-phase hunk in a shared file does NOT stale an earlier checkpoint; a same-region edit DOES.
- **Contract test**: phases 2 and 4 editing different hunks of one file → phase 2 stays current; same-hunk edit → phase 2 stale.

## Barrage config schema (US1 FR-001..005)

- `templates/audit-barrage-config.yaml` Anthropic lanes: no `--permission-mode plan`; `--disallowedTools` read-only set; timeout floor with headroom; codex `model_reasoning_summary=detailed`; tight liveness window. Fleet composition (opus+codex+sonnet) unchanged.
- **Contract test**: the shipped template parses; Anthropic lanes carry no `--permission-mode plan` and a non-empty `--disallowedTools`; codex args include the reasoning-summary flag.

## Process drivers + hygiene (US8/US9)

- US8: audit/implement skill bodies + barrage prompt templates contain the five drivers (channel-enumeration, invariant-first boundary, round-0 self-red-team, fleet-degradation pricing, rubric anchoring).
- US9: `tests/roadmap/cluster.test.ts` has no `!`; roadmap SKILL.md documents cluster/group; list-flag guards uniform + dead `--part-of` branch gone; `rewriteEdgeLine` fence-aware; tooling-feedback names GitHub issues.
- **Contract test**: targeted presence/absence assertions per item (see spec US9 acceptance scenarios).
