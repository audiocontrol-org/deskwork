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

### Result — latency / finding-depth calibration: PENDING live run (NOT fabricated)

The latency-within-timeout and finding-depth bars require spawning the **real** `claude` CLI with the sonnet pin against a real rendered per-phase payload. This dev/CI environment has **no model-family CLIs installed** (the same constraint the govern OUTAGE path is built for), so the live latency/depth numbers were **not measured**. Per the project no-fabrication rule, no latency or depth figures are recorded here that were not observed.

**Decision (recorded, no silent fleet change):** sonnet is added to `templates/audit-barrage-config.yaml` as a **commented, operator-selectable override-profile lane** (disabled by default, NOT in the shipped fleet). Enabling it is gated on a recorded live calibration that meets all three FR-011 bars on a per-phase payload. The read-only bar is already met (above); the latency + finding-depth bars are pending the live run. This is the override-profile-first path (D8): the default fleet stays `opus` + `codex`; sonnet is opt-in pending evidence.

**To complete the calibration (operator, on a host with the claude CLI):**
1. Render a representative per-phase payload (`stackctl govern --mode implement --phase <id>` produces one).
2. Spawn the sonnet lane under plan-mode; record wall time, derived timeout, finding count + depth, and tool-call count.
3. If latency ≤ derived timeout AND findings are verified-depth AND on-task → uncomment the lane and record the evidence here; else record the rejection + its numbers.

## SC-001..008 runbook

See `### T034` (appended after the full-suite green run).
