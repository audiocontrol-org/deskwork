# Audit Log — fixture: history-2runs

> Two consecutive barrage lift sections, each with 0 open HIGH findings.
> The most recent run carries an open MEDIUM, so the single-run-clean rule
> (Rule B) does NOT engage, but the n-consecutive-quiet rule (Rule A, last
> 2 runs each 0 HIGH) DOES → `state=converged, rule=n-consecutive-quiet`.
> Used by the convergence-gate tests as a reference shape.

## 2026-06-06 — audit-barrage lift (20260606T120000000Z-demo)

### Earlier run surfaced no high-severity defects

Finding-ID: AUDIT-20260606-01
Status:     open
Severity:   low
Surface:    `fixtures/spec.md:10`

A low-severity nit only.

## 2026-06-06 — audit-barrage lift (20260606T130000000Z-demo)

### Latest run is quiet on HIGH but has a medium

Finding-ID: AUDIT-20260606-02
Status:     open
Severity:   medium
Surface:    `fixtures/spec.md:12`

A medium-severity finding, no HIGH.
