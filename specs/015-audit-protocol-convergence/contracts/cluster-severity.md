# Contract: Cluster severity computation + adjudication (thread 1; FR-001/002/003)

The lift's severity surface. Replaces max-of-cluster (`extract-barrage-findings.ts:mergeCluster`) with agreement-based computation + an adjudication stage. The dampener's read-contract (one `Severity:` line per finding) is UNCHANGED.

## `cluster-severity.ts`

### `computeClusterSeverity(perLane: PerLaneSeverity[]): ClusterSeverityDecision`

Pure function. No I/O.

**Behavior:**
- `perLane.length === 0` → throw (a cluster always has ≥1 lane; absence is a defect, fail loud — Constitution V).
- `perLane.length === 1` → `{ rule: 'single-model', gateCountedSeverity: perLane[0].severity, perLane }`. (004 FR-003: a single-model HIGH still blocks.)
- `perLane.length >= 2` → `{ rule: 'agreement', gateCountedSeverity: highestLevelWithAtLeastTwoAtOrAbove(perLane), perLane }`.

**`highestLevelWithAtLeastTwoAtOrAbove`**: walk severity levels high→low (`blocking > high > medium > low > informational`); return the first level where `count(perLane where rank(severity) >= rank(level)) >= 2`. If no level has ≥2 (e.g. two lanes both `informational` vs one outlier — cannot happen with ≥2 lanes since every lane is ≥ `informational`), return `informational`.

**Invariants (tested RED-first):**
- `gateCountedSeverity` rank ≤ `max(perLane rank)` — de-inflation never raises severity.
- `[high, medium]` → `medium` (the 014 plateau case de-inflates).
- `[high, high]` → `high` (genuine ≥2-lane HIGH still blocks — SC-003).
- `[high, high, low]` → `high` (≥2 at high).
- `[high, medium, medium]` → `medium` (only 1 at high; ≥2 at medium).
- `[blocking, high]` → `high` (≥2 at high — both are ≥ high; not ≥2 at blocking).
- single `[high]` → `high` (single-model preserved).

### Disagreement floor (AUDIT-20260612-02)

The agreement rule de-inflates intra-cluster DISagreement, but a **wide spread** — the dominant lane ≥2 severity levels above the agreement floor, e.g. `[high, informational] → informational` — would let a genuine HIGH one lane caught and another rated near-absent collapse to `informational`. That is the *inverse* of SC-003 (unbounded LOWERING into a gate that may feed an unattended build), and it tensions with D1's "don't over-suppress a real HIGH another lane missed."

So `mergeCluster` routes a wide-spread `agreement` cluster (where `rank(dominant lane) − rank(agreement floor) ≥ 2`) through `adjudicate` on the **dominant lane's** body, instead of accepting the floor. A 1-level spread (`[high, medium] → medium`) is intentional agreement and is NOT routed. This bounds the lowering at adjudication (kept when the body reads reachable+high-blast; calibrated to ≤ medium only on low-blast/unreachable/fix-debt) — never a silent floor to `informational`.

**Invariants (tested RED-first):**
- `[high, informational]` with a neutral body → adjudicated, severity stays `high` (NOT `informational`); `rule === 'adjudicated'`.
- `[high, informational]` on low-blast/unreachable evidence → adjudicated DOWN to `medium` (not `informational`, not `high`).
- `[high, medium]` (1-level spread) → stays the agreement floor `medium`; `rule === 'agreement'` (not routed).

## `adjudicate-findings.ts`

### `adjudicate(finding: ExtractedFinding): ClusterSeverityDecision`

Applied to findings flagged as **residual single-lane inflations** — `rule === 'single-model'` (or `agreement` result still HIGH from one dominant lane) AND classified as a consistency-seam / prior-round fix-code finding. Re-scores on on-disk evidence only (no model spawn).

**Inputs (all already on disk):** the finding `body` (blast-radius/reachability prose), the `perLaneSeverities`, and a `fixDebt` classification (does the finding cite code introduced by a prior round's fix?).

**Behavior:**
- Produces `{ rule: 'adjudicated', gateCountedSeverity, perLane, adjudicationBasis }`.
- `gateCountedSeverity` is calibrated DOWN from the single lane's label when the body self-assesses low/latent blast radius AND the finding is unreachable via the public path AND/OR it is fix-debt on the prior round — the 014 AUDIT-19/-21 shape.
- `adjudicationBasis` records the three signals and the resulting calibration (mandatory; never silent — Constitution V; SC-002).
- MUST NOT downgrade a finding whose body asserts a reachable, high-blast-radius defect (no suppression of real signal — SC-003).

**Invariants (tested RED-first):**
- A single-lane HIGH whose body says "currently unreachable" + is fix-debt → adjudicated to ≤ medium, with basis recorded.
- A single-lane HIGH whose body describes a reachable data-loss defect → stays high (basis records "reachable; not calibrated down").
- The basis string is always non-empty for `rule === 'adjudicated'`.

## Persistence (FR-002; `audit-barrage-lift.ts`)

The lift writes, per finding:
- the gate-counted `Severity:` line (= `gateCountedSeverity`) — dampener reads this, unchanged contract;
- a recorded per-lane breakdown (`PerLaneSeverity[]`) and the `rule` (+ `adjudicationBasis` when adjudicated).

The dampener (`check-barrage-dampener.ts`) is NOT modified — it counts the gate-counted `Severity:` line raw, exactly as today.
