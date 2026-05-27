---
slug: scope-discovery
phase: 11
acceptance-criterion: KeygroupSummary-shape repro
date: 2026-05-26
---

# Phase 11 acceptance criterion — KeygroupSummary-shape repro

The empirical-validation test that proves the Phase 11 self-correcting discovery loop catches the gap that triggered the whole phase (audiocontrol [#315](https://github.com/audiocontrol-org/deskwork/issues/315)).

## What the test demonstrates

A single end-to-end scenario simulates the dogfood pass that failed in May 2026:

1. **BEFORE state (inventory-only / Phase 1-10).** The legacy regex catalog scans the fixture's `components/KeygroupSummary.tsx` and produces zero findings whose provenance is `negative-space`, `outlier`, or `coverage-gap`. This is the gap: the file was always there; the catalog couldn't see it. (The legacy catalog may match unrelated junk via the `as-type-cast` / `any-annotation` / `magic-number` regexes — those don't count against the gap.)

2. **AFTER state (Phase 11 loop active).** The Phase 11 polymorphic pattern-handler catalog is planted at `.dw-lifecycle/scope-discovery/pattern-matrix-patterns.yaml`. Re-running the pattern-matrix discovery agent fires at least one Phase 11 handler on the same file — in practice, all three:

   - **negative-space**: file matches the `components/**` glob, zero canonical-primitive (`@/components/common/Foo`) imports, secondary utility-class hits clear the threshold.
   - **outlier**: per-directory className-composition outlier — KeygroupSummary's heavy-utility-class signature diverges from its directory siblings (which use `Card` + `ds-*` design-system classes).
   - **coverage**: adoption ratio < 1.0 — 2 of 3 files in the glob consume the canonical primitive; the operator sees the gap as a directory-level metric.

3. **Mediation pass.** The mediation library clusters the raw findings into architectural-scale candidates + emits a `discovered_candidates:` manifest section the orchestrator-agent surfaces to the operator (per Phase 11 Task 3).

4. **Report rendering.** The synthesis-report module categorizes the findings into the three operator-visible buckets (registered-pattern / discovered-candidate / novel-shape-candidate) per Phase 11 Task 12. The discovered-candidate count surfaces with > 0 entries.

5. **Dogfood gap signal.** The test prints a `DOGFOOD GAP SIGNAL` block to stdout naming the before / after counts. The block looks like:

   ```text
   ═══════════════════════════════════════════════════════════════
   DOGFOOD GAP SIGNAL — Phase 11 acceptance criterion
     Source: audiocontrol issue #315 (KeygroupSummary-shape regression)
   ═══════════════════════════════════════════════════════════════
   BEFORE (inventory-only / Phase 1-10):
     0 findings on KeygroupSummary.tsx — the gap.
       (legacy regex catalog produced N hit(s) on the file,
        none of them matching the canonical-primitive-absence shape)

   AFTER (Phase 11 loop active):
     3 findings on KeygroupSummary.tsx — the gap is now caught.
       - negative-space handler: 1 hit(s)
       - outlier handler:        1 hit(s)
       - coverage handler:       1 hit(s)
       - mediation discovered-candidate clusters: N

   Synthesis-report categories: categories: registered-pattern=R, discovered-candidate=D, novel-shape-candidate=C
   ═══════════════════════════════════════════════════════════════
   ```

## How to interpret pass / fail

**PASS:**

- BEFORE: 0 findings with Phase 11 provenance on `KeygroupSummary.tsx`.
- AFTER: >= 1 finding with Phase 11 provenance (negative-space / outlier / coverage-gap) on the same file.
- AFTER: >= 1 discovered-candidate cluster in the mediation output.
- AFTER: the cluster's exemplar files include `KeygroupSummary.tsx`.
- The rendered category report contains the `## Inventory vs. discovery — finding categories` heading and the `Discovered candidates` line with a > 0 count.

Extra findings beyond the minimum = **PASS** (more discovery is better; the assertions use `>=` boundaries).

**FAIL modes — what each one tells you:**

- BEFORE reports a Phase 11 finding: someone planted a Phase 11 override into the legacy-state setup (or the built-in catalog grew a Phase 11 entry). The gap can't be measured against a baseline that already includes the fix.
- AFTER reports zero Phase 11 findings: a regression in one of the new handlers (negative-space / outlier / coverage) — the catch shape no longer fires. Re-run the per-handler tests under `pattern-handlers/` to localize.
- AFTER reports a finding but no discovered-candidate cluster: the mediation layer's clustering pass dropped the input (likely a regression in `cluster-candidates.ts`). The per-handler signal is fine; the architectural-summary view is broken.
- The cluster exists but `KeygroupSummary.tsx` is not in its `exemplar_files`: a regression in `summarizeArchitectural` (mediation.ts) — the file-to-exemplar projection lost the load-bearing landmark.
- The category report is missing the `Discovered candidates` line: a regression in `synthesis-report.ts` (Task 12 surface) — the manifest-to-category projection is broken.

## How to run

```bash
npm --workspace plugins/dw-lifecycle test -- --run phase-11-acceptance
```

The `DOGFOOD GAP SIGNAL` block prints during the test run. With `--reporter=verbose` or a default reporter run, the block lands in stdout under the test's name.

## Where things live

- **Fixture tree:** `plugins/dw-lifecycle/src/__tests__/scope-discovery/phase-11-acceptance/fixtures/keygroup-summary-repro/`
  - `components/KeygroupSummary.tsx` — synthetic component with ZERO canonical-primitive imports + ≥ 14 utility-class hits.
  - `components/HealthySummary.tsx` + `components/SiblingPanel.tsx` — peer files that consume the canonical primitive; provide the directory population for the outlier handler.
  - `pattern-matrix-patterns.yaml` — Phase 11 polymorphic catalog (negative-space + outlier + coverage entries) the AFTER state plants.
  - `adopter-manifests.yaml`, `anti-patterns.yaml` — intentionally empty (the gap is precisely that no manifest existed).
  - `expected-findings.json` — narrative description of what the assertions pin.
- **Test:** `plugins/dw-lifecycle/src/__tests__/scope-discovery/phase-11-acceptance/keygroup-summary-repro.test.ts`

## Why the fixture is synthetic, not a copy

Per `.claude/rules/agent-discipline.md` + the audiocontrol pilot's confidentiality posture: the fixture **reproduces the shape**, not the bytes, of audiocontrol's real KeygroupSummary regression. The shape is what the acceptance criterion measures; the specific bytes don't matter. A synthetic fixture also doesn't drift as audiocontrol's real KeygroupSummary evolves — the test pins the regression class, not the regression instance.

## Why the test does NOT call external LLMs

The semantic handler (G6) + the LLM-judge + the external auditor are STUBs or fire-and-forget operations. The pattern-handler outputs are the deterministic, regression-pinnable layer. Per the brief's pre-made decisions: the test asserts pattern-handler findings, not LLM outputs.

## Cross-references

- Phase 11 PRD: `prd.md` § Phase 11
- Phase 11 workplan: `workplan.md` § Phase 11 acceptance section
- Audiocontrol issue [#315](https://github.com/audiocontrol-org/deskwork/issues/315) — origin of the gap
- Phase 11 parent: [#316](https://github.com/audiocontrol-org/deskwork/issues/316)
- Agent-discipline rule (operator-discipline cue that pairs with this test): `.claude/rules/agent-discipline.md` § "Inventory vs discovery — how to read scope-discovery reports"
