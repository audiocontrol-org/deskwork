# Data Model — Audit-Protocol Reliability (specs/014)

No new persistent stores. The feature hardens invariants on existing entities; the deltas below are the contract-relevant fields and state rules each story reads or adds.

## ModelRunResult (existing — `audit-barrage/types.ts:150–159`)

- Fields used: `timedOut: boolean`, `stdoutBytes: number`, exit-code sentinels (−1 timeout/signal, −2 spawn failure).
- **US1 invariant**: a configured model with `stdoutBytes === 0` is *degraded* regardless of `timedOut`; a model with partial output (`stdoutBytes > 0` then timeout) is *not* zero-output-degraded and must not be reported as such. "Emitting model" := `stdoutBytes > 0`.
- **New (additive)**: fleet-floor evaluation input — `emittingCount` vs `floor = min(requestedFloor, configuredFleetSize)`.

## Barrage summary / run reporting (existing seam — `audit-barrage.ts:284–314`)

- **US1 invariant**: when `emittingCount < 2`, the summary names each zero-output model and states cross-model agreement is unavailable; when the fleet is fully healthy, no degradation text appears (no cry-wolf).
- Exit semantics: unchanged defaults (OUTAGE=1, else 0); floor shortfall (opt-in / govern default) → loud failure naming expected vs actual.

## Barrage config resolution (existing — `config-loader.ts`)

- States: `default` (no override), `override` (stack-control file), and **new observable**: `legacy-present` (a `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml` exists). `legacy-present` is orthogonal to the other two and always produces the stderr notice; it never changes which config wins.

## Finding cluster (existing — `extract-barrage-findings.ts:205–269`)

- **US3 invariant**: union key = heading agreement (mechanism proxy). Surface agreement alone never unions. `crossModelAgreement = true` only on clusters whose members share a root cause AND ≥2 source models.
- Per-cluster output: every source finding's mechanism is represented — an entry's body never documents fewer mechanisms than its `sourceFindingIds` carry (post-US3 this is trivially true: distinct mechanisms are distinct entries).

## Dampener decision / flips (existing — `slushRemaining` result)

- **US4 change (additive)**: each flip carries its located status-line position from the dampener's own walk.
- **Invariant**: `applied set ≡ flips set`. Outcomes per flip: migrated, or verb-level loud failure naming the finding. There is no third (silent) outcome. Dry-run N ⇒ apply N on an unchanged audit-log; a changed audit-log between dry-run and apply fails loud (staleness), never misapplies.

## Govern implement payload (existing — `payload-implement.ts:115–183`)

- Composition: committed diff + scoped untracked fold + context blocks.
- **US5 invariants**: (a) the resolved feature root's `audit-log.md` / governance bookkeeping appears in NEITHER the committed-diff arm NOR the untracked fold; (b) the untracked fold excludes other features' roots and the feature's audit-log — the feature's own files and non-feature files (new source modules) fold in; each other-feature drop is warned and recorded in the additive `skippedOtherFeature` ledger field (AUDIT-20260611-01 amended the original "fold ⊆ files under the feature under audit" inclusion form, which silently dropped untracked source files); (c) the labeled `audit_log_excerpt` context block (013/TASK-25) is the ONLY audit-log content in the payload.

## Scope-discovery installation state (existing — `.stack-control/scope-discovery/`)

- **US6 state rule**: absent state encountered by scope-widen ⇒ auto-seed via the install-scope-discovery primitive (announced) ⇒ state present (legitimate empty baseline). Widen then proceeds; "no registered clones" over a seeded-empty baseline is a true result, not a fallback.

## Feature root (existing — 013's `resolveFeatureRoot`)

- **US7 rule**: manifest path, prd path, inventory/widen run-dirs, widen EVIDENCE dirs, and the provenance doctor walk all derive from the resolved root (`specs/NNN-slug` or legacy), never from a constructed `docs/1.0/001-IN-PROGRESS` literal. Legacy resolution behavior is byte-compatible with today (ported contract tests).

## Backlog task file (existing — backlog.md format)

- **US8 fault states**: `healthy` | `malformed-frontmatter`. Read path (`list`): malformed ⇒ stderr warning naming the file, item omitted, verb continues (exit 0). Integrity paths (`exists`, import idempotency): malformed ⇒ `BacklogError` naming the file ⇒ exit 2 (existing mapping). All-malformed store: list = zero items + warnings (distinguishable from clean-empty); imports fail loud.
