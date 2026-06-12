# Quickstart / Validation: Migrate scope-discovery into stack-control

Runnable scenarios that prove the feature end-to-end. Each maps to Success Criteria. Run from a tmp project fixture unless noted; all verbs are `stackctl <verb>` in a plain shell (no Claude Code surface).

**Prerequisites**: `npm install` (adds `jscpd` + the schema-validation lib); a fixture repo with at least two stack-control installations (each a dir with a `.stack-control/config.yaml`); `dw-lifecycle` present and its scope-discovery baseline committed.

## Scenario 1 — Per-codebase clone scoping by default (SC-001, SC-002)

1. In fixture repo, seed codebases A and B with an identical ≥50-token block duplicated across them; add an intra-A duplicate too.
2. From within A: `stackctl check-clones` (no `--root`).
3. **Expect**: output lists the intra-A duplicate; lists ZERO A↔B cross-codebase matches. Exit 0 (or 1 in `--gate-mode` only for a NEW intra-A group).
4. Confirm the audit-barrage vendored into stack-control is NOT reported as a clone of its dw-lifecycle origin (SC-002).

## Scenario 2 — Disposition lifecycle + NEW-gating (SC-005, SC-006)

1. `stackctl check-clones --gate-mode` with a fresh intra-codebase duplicate not in baseline → **expect** NEW surfaced, exit 1.
2. `stackctl dispose-clone <id> --as keep-with-reason --reason "intentional"` → re-run gate → **expect** that group no longer trips the gate, exit 0.
3. `stackctl dispose-clone <id> --as refactor --reason "x"` WITHOUT `--canonical-side`/`--tests-proof` → **expect** refusal naming the missing precondition, exit 1 (SC-005-style fail-loud).
4. `stackctl refresh-clones-baseline` after renaming a member file → **expect** curated dispositions preserved.

## Scenario 3 — Upfront discovery + widen (FR-015/016/017)

1. `stackctl scope-inventory <feature>` over the fixture → **expect** a schema-valid `ScopeManifest` with discovered surfaces + provenance + a run-evidence dir.
2. Seed a novel-shape candidate; re-run → **expect** it surfaces under `candidates` and the result is NOT reported all-clear.
3. `stackctl scope-widen "must also handle X"` → **expect** an additional surface absent from the first manifest.

## Scenario 4 — Registry checks no-op empty, fire when seeded (SC-008)

1. With empty `anti-patterns.yaml` → `stackctl check-anti-patterns` → **expect** clean, config-activated agents contribute nothing.
2. Seed a `glob`/`regex`/`ast-grep`/`ts-morph` entry + a matching file → `--gate-mode` → **expect** the holdout surfaced, exit per declared severity.
3. Seed an `adopter-manifests.yaml` entry + a non-importing file → `stackctl check-adopters` → **expect** the holdout flagged.

## Scenario 5 — Dispatch wrapper + gutted-stub self-check (SC-007)

1. Feed the wrapper a return with `searched > included` and no `excluded` enumeration → **expect** rejection naming the missing enumeration.
2. Feed an `excluded.reason` containing "for now" → **expect** rejection naming the phrase.
3. `stackctl validate-scope-discovery` against a deliberately gutted gate stub → **expect** the harness FAILS (gutted-stub self-check trips), exit 1.

## Scenario 6 — Install / customize / doctor (SC-003, SC-004)

1. From a clean fixture: `stackctl install-scope-discovery` → **expect** `.stack-control/scope-discovery/` created with empty-but-valid registries + schemas + `config.yaml`, recorded against the installation; re-run → zero changes (idempotent, SC-004).
2. `stackctl customize <scanner>` → edit the override → **expect** the runtime resolves the override over the default.
3. Point `doctor` at a malformed registry → **expect** it flags the file + rule, no mutation without `--fix`.

## Scenario 7 — Governance implement-mode runs the clone step (SC-011)

1. `stackctl govern --mode implement` over a change introducing a NEW intra-codebase clone → **expect** the clone-detection step runs and surfaces the NEW clone (per-codebase). Confirm no TODO placeholder remains in the govern path.

## Scenario 8 — Install-drift advisory (US8 / R6)

1. Point `stackctl install-drift` at a local `.specify` extension copy that differs from its plugin source → **expect** a non-blocking stale warning naming the extension; an in-sync copy → silent.

## Scenario 9 — dw-lifecycle untouched (SC-010)

1. Run the full migrated stack-control suite + verbs; then run `dw-lifecycle`'s own scope-discovery tests and a `check-clones` in its tree → **expect** dw-lifecycle's tests pass and its baseline/config are byte-for-byte unchanged.

## Scenario 10 — Plain-shell reachability (SC-009)

1. In a shell with no Claude Code session/plugin surface, run each verb above → **expect** completion through `stackctl` alone.
