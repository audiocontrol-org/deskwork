---
slug: audit-protocol-convergence-fixture
targetVersion: ""
---

# Audit log — audit-protocol-convergence-fixture

This fixture replays the 014 rounds-4–7 finding stream that exposed the
convergence plateau (spec 015, US1 / SC-001). Each round surfaced exactly ONE
clustered finding that two lanes rated differently — `opus` rated it `high`,
`codex` rated the same root cause `medium`. Under the retired max-of-cluster
rule the gate-counted severity was `high`, so every round counted a HIGH and the
two-consecutive-raw-0-HIGH branch could never engage (the loop plateaued and
only operator override could terminate it).

Under the cross-lane severity-agreement rule (FR-001 mechanism A) the cluster is
gate-counted at the highest level ≥2 lanes agree on — here `medium` — so each
section raw-surfaces 0 HIGH, two consecutive quiet runs engage the dampener, and
the loop converges with zero overrides. The `Per-lane:` line records the raw
inputs so the de-inflation decision is auditable (FR-002 / SC-002).

## 2026-06-11 — audit-barrage lift (20260611T040000000Z-audit-protocol-round4)

### AUDIT-20260611-01 — Consistency seam between the new severity record and the dampener read-path

Finding-ID: AUDIT-20260611-01 (opus-04 + codex-04; cross-model)
Status:     open
Severity:   medium
Per-lane:   opus=high, codex=medium
Decision:   agreement (gate-counted medium; ≥2 lanes agree at medium, only 1 at high)
Surface:    src/scope-discovery/promote-findings/extract-barrage-findings.ts:262

opus rated this HIGH on blast-radius grounds; codex rated the same seam MEDIUM,
noting it is reachable only through an internal path. The agreement floor counts
it MEDIUM.

## 2026-06-11 — audit-barrage lift (20260611T050000000Z-audit-protocol-round5)

### AUDIT-20260611-02 — Fix-code from round 4 introduces an un-covered branch

Finding-ID: AUDIT-20260611-02 (opus-05 + codex-05; cross-model)
Status:     open
Severity:   medium
Per-lane:   opus=high, codex=medium
Decision:   agreement (gate-counted medium; ≥2 lanes agree at medium, only 1 at high)
Surface:    src/scope-discovery/promote-findings/cluster-severity.ts:40

A single-lane HIGH on the prior round's fix-code; the other lane rated it MEDIUM.

## 2026-06-11 — audit-barrage lift (20260611T060000000Z-audit-protocol-round6)

### AUDIT-20260611-03 — Adjudication basis string formatting nit

Finding-ID: AUDIT-20260611-03 (opus-06 + codex-06; cross-model)
Status:     open
Severity:   medium
Per-lane:   opus=high, codex=medium
Decision:   agreement (gate-counted medium; ≥2 lanes agree at medium, only 1 at high)
Surface:    src/scope-discovery/promote-findings/adjudicate-findings.ts:30

## 2026-06-11 — audit-barrage lift (20260611T070000000Z-audit-protocol-round7)

### AUDIT-20260611-04 — Loop-driver telemetry field naming

Finding-ID: AUDIT-20260611-04 (opus-07 + codex-07; cross-model)
Status:     open
Severity:   medium
Per-lane:   opus=high, codex=medium
Decision:   agreement (gate-counted medium; ≥2 lanes agree at medium, only 1 at high)
Surface:    src/govern/convergence-loop.ts:1
