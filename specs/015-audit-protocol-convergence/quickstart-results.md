# Quickstart results — Audit-protocol convergence (spec 015)

Validation evidence for the SC-001..008 runbook and the US5 sonnet calibration.

## US5 (T028) — sonnet re-calibration on a per-phase payload (FR-011 / D8)

**The re-admission bar (FR-011, verbatim):**
1. **Latency** within sonnet's derived timeout (`max(floor, ceil(secs_per_kb × payload_kb))`, with the 014 margin) at the target per-phase payload size.
2. **Finding depth** — verified, live-probe findings (not haiku-style zero-depth informational output).
3. **On-task** — zero mutations (mechanically guaranteed by plan-mode) and no runaway tool-loop.

**Method:** spawn sonnet (`model: claude-sonnet-4-6`) under `--permission-mode plan` on a representative per-phase payload (US4 shrinks the unit — the lever that the 2226 s / off-task disqualifier on the 69 KB whole-feature unit was coupled to). Record wall time vs the derived timeout, finding depth, and on-task behavior. Admit to an operator-selectable override profile (mirroring the fable thoroughness override) only when all three bars are met; record the admit/reject decision with its evidence — no silent fleet change.

### Result — mechanical read-only (SC-007 read-only half): VERIFIED in-repo

The read-only disqualifier is mechanically closed. `src/__tests__/scope-discovery/audit-barrage/sonnet-readonly-probe.test.ts` (T027) proves, with a falsifiable cooperative-fixture probe:
- the sonnet lane's assembled argv carries `--permission-mode plan` before the prompt (every spawn is launched read-only — `buildArgs`, 014 FR-003);
- a model honoring plan-mode produces **zero new files / zero commits / zero pushes** across the probe;
- the `none`-lane control mutates the repo, so the probe is real (a dropped enforcement fragment fails the test).

The 2226 s / off-task incident's read-only half (014's live violation) is therefore mechanically impossible for the sonnet lane.

### Result — latency / finding-depth calibration: LIVE RUN (2026-06-12), all three bars MET

The earlier note that this environment had "no model-family CLIs installed" was **wrong** — the `claude` CLI (2.1.174) is present and working (the govern barrage spawned it for opus three times this session). The live calibration was therefore run, not deferred.

**Method (as specified):** the lane's EXACT `args_template` (`-p --model claude-sonnet-4-6 --permission-mode plan --output-format stream-json --verbose`, prompt on stdin) was spawned on a real rendered **per-phase-scale payload** — `PROMPT.md` from run `20260612T022215287Z` (the barrage's own render of the `1674561` commit diff), **12,677 bytes (12.38 KB)**. Wall time, the stream-json event stream (depth + tool-calls), and a git-status before/after (mutation check) were recorded. Derived timeout for this lane + payload: `max(floor 300, ceil(13 × 12.38)) = max(300, 161) = ` **300 s**.

| Bar | Measured | Threshold | Verdict |
|----|----------|-----------|---------|
| **Latency** | **224 s** (`result.duration_ms` 223 686; wall 224 s) | ≤ 300 s derived timeout | ✅ **PASS** (and ~10× under the 2226 s disqualifier on the 69 KB unit — the payload-size coupling D6/D8 predicted) |
| **Finding depth** | **4 findings**, each file:line-anchored with blast-radius + severity-calibration reasoning; one (`runGovern` warning untested) independently corroborates the opus round-3 finding | verified live-probe depth, not haiku zero-depth | ✅ **PASS** |
| **On-task** | **4 tool calls** (Read context, ToolSearch, ExitPlanMode, one Write — which plan-mode BLOCKED; it targeted sonnet's own `~/.claude/plans/` findings artifact, not the repo). `git status` identical before/after → **zero repo mutations**. `is_error:false`, 5 turns, $0.67 | 0 mutations + no runaway tool-loop (disqualifier was 59 tool calls) | ✅ **PASS** |

**Decision (recorded, no silent fleet change):** all three FR-011 bars are met on a per-phase payload, so sonnet is **admitted to the operator-selectable override profile** — its commented lane in `templates/audit-barrage-config.yaml` is re-annotated from "PENDING live calibration" to "calibration PASSED (evidence above); uncomment to opt in." It is **still not added to the default fleet** (which stays `opus` + `codex`): default-fleet promotion is the separate, later decision FR-011/D8 reserves for the operator, and this is a **single-payload sample** — one 12.4 KB per-phase unit. The override-profile-first path holds: the evidence now supports opt-in; broadening the sample (more payload sizes) is advisable before any default-fleet promotion.

**Caveat (sample size):** this is one calibration run on one per-phase payload. It clears the bar decisively (224 s vs 300 s; 4 real findings; 4 tool calls), but a single sample. The latency margin would shrink on a larger per-phase unit (the slope is 13 s/KB, so a ~23 KB unit would derive a 300 s budget exactly); calibrating a couple more payload sizes before default-fleet promotion would harden the latency claim.

## SC-001..008 runbook (T034)

Run: `npm --workspace @deskwork/plugin-stack-control test` (vitest). Full-suite
result: **1310 passed, 8 skipped, 7 failed** — the 7 failures are 3 PRE-EXISTING
environment-only files unrelated to spec 015 (`git-ancestry` + `govern-payload-implement`
fail because this environment's git commit-signing server returns 400 on the
ephemeral test repos they create; `refactor-preconditions` hardcodes a `REAL_SHA`
not present in a fresh clone — the same trio accounts for exactly all 7 failures,
verified by running them in isolation). Every spec-015 test passes. `tsc --noEmit`
clean.

Arithmetic (AUDIT-04 discipline): the post-implementation `1297 passed` rose to
`1301` (+4 net) after the single-lane governance round's fixes — `+2` from the
AUDIT-20260612-01 committed-diff-scope tests, `+3` from the AUDIT-20260612-02
disagreement-floor tests, `−1` from retiring the AUDIT-20260612-05 driver-override
test (the override short-circuit was removed). The later re-govern rounds + dampener
fix took `1301 → 1310` (+9): `+2` claude-03 `skippedOutOfScope` propagation, `+3` the
round-3 `formatScopeExclusionSummary` helper, `+4` the dampener root-cause fix (lift
quiet-section ×2 healthy/degraded, dampener end-to-end + regression ×2). The failed
count is unchanged at 7 across all rounds (same env-only trio: git commit-signing 400
in `git-ancestry` + `govern-payload-implement`, hardcoded SHA in `refactor-preconditions`);
no spec-015 regression at any step.

| SC | Claim | Verifying test(s) | Result |
|----|-------|-------------------|--------|
| SC-001 | A single-lane-inflation stream converges to a clean stop, **0 operator overrides** | `__tests__/govern/convergence-sc001.test.ts` (4-round opus=high/codex=medium lifts MEDIUM → dampener engages; contrast: max-of-cluster HIGH stays BLOCKED) | PASS |
| SC-002 | Every de-inflated cluster is auditable (per-lane raw + gate-counted recorded) | `audit-barrage-lift.test.ts` (Per-lane/Decision lines), `extract-barrage-findings.test.ts` (perLaneSeverities + severityDecision) | PASS |
| SC-003 | A genuine >=2-lane HIGH keeps the gate BLOCKED (zero real HIGHs suppressed) | `cluster-severity.test.ts` ([high,high]->high), `extract-barrage-findings.test.ts`, `adjudicate-findings.test.ts` (reachable data-loss stays high) | PASS |
| SC-004 | Loop terminates with no agent-held iterate/stop decision (100% of runs) | `convergence-loop.test.ts` (stub gate, all branches), `govern-loop-driver.test.ts` (3-round non-converged at ceiling; round-1 converged) | PASS |
| SC-005 | Rendered payload: **zero** bytes of own audit-log + **zero** parked scaffolds | `payload-exclusion.test.ts` (empty audit_log_excerpt + no self-ref prose; in-scope folded / parked excluded) | PASS |
| SC-006 | A per-phase payload is measurably smaller, governed by the same protocol | `incremental-audit.test.ts` (phase diff-scope only), `per-phase-timeout.test.ts` (phase derived timeout < whole-feature), `govern-phase-unit.test.ts` (same loop under phase checkpoint) | PASS |
| SC-007 | sonnet under mechanical read-only cannot mutate the repo + decision recorded | `sonnet-readonly-probe.test.ts` (zero new files under plan-mode; none-lane control mutates) + § US5 live run (224 s < 300 s; 4 depth-findings; 0 mutations) | PASS — all three FR-011 bars met live (2026-06-12); admitted to override profile, default-fleet promotion deferred |
| SC-008 | Raw-counting regression test present + fails under the open-counting revert | `dampener-raw-counting.test.ts` (verified GREEN current / RED under the documented mutation) | PASS |

All eight success criteria are verified by automated tests, except SC-007's
latency/finding-depth half, which is gated on a live `claude` CLI run (recorded
above as pending — no fabricated numbers).
