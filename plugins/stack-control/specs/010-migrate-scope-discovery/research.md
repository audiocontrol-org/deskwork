# Phase 0 Research: Migrate scope-discovery into stack-control

Decisions resolving the Technical Context unknowns. Each: Decision / Rationale / Alternatives considered.

## R1 — Per-codebase clone-scoping mechanism (the new behavior)

**Decision**: Default the clone detector's scan boundary to the **resolved nearest-enclosing stack-control installation root** (009's `config/resolve-paths.ts` walk-up), not `process.cwd()`/whole-repo. Concretely: `jscpd`'s `path`/`--root` is set to the resolved installation root; any nested child installation subtree (a directory containing its own `.stack-control` config) is added to the `jscpd` `ignore` list so the parent's scan excludes it (009 FR-021 nearest-enclosing-config rule). The existing explicit `--root <path>` override is retained for the non-default case (FR-005 acceptance scenario 3). The current `clone-detector.ts` line `const REPO_ROOT = process.cwd()` is the defect being replaced.

**Rationale**: Reuses ONE resolution model (the boundary every other governed verb already resolves against per 009), so "what codebase am I in" has a single answer. It directly kills the canonical false positive (audit-barrage vendored from dw-lifecycle into stack-control reported as a clone). Smaller scan tree is also a performance win. Honors FR-005/006/007/008.

**Alternatives considered**: (a) explicit per-codebase `path` arg required each run — rejected (FR-006 mandates default, not opt-in); (b) a separate `roots:` list authored in scope-discovery config — rejected as a second resolution model competing with 009's installation walk-up (operator chose Q1 option A: the 009 model); (c) per-plugin-dir heuristic (scan from the plugin folder) — rejected: not generalizable to non-plugin adopters and not the installation boundary other verbs use.

## R2 — Dependency set + schema-validation strategy

**Decision**: Add `jscpd` ^4 to `plugins/stack-control/package.json` (clone detection; already proven in dw-lifecycle). For the registry/manifest JSON Schemas, add `ajv` ^8 + `ajv-formats` ^3 and port the `.schema.json` files + `schema/manifest-validator.ts` as-is (they are authored as JSON Schema and validated via ajv in dw-lifecycle). Do NOT add `ts-morph` or `ast-grep` — confirmed they are not dw-lifecycle runtime deps; the `ast-grep`/`ts-morph` anti-pattern *pattern types* are handled by the self-contained `discovery-agents/pattern-handlers/*` (glob, regex, semantic, coverage, negative-space, outlier handlers). `zod` is used elsewhere in dw-lifecycle but is NOT required for this surface unless a ported module imports it (resolve per-module during the port; prefer ajv for the schema files to avoid dual validation stacks).

**Rationale**: Minimizes new dependency surface while preserving the proven validation path. ajv matches the on-disk JSON Schema artifacts (re-deriving them as hand-written validators would be risky and violate integration-first — the proven instance is the ajv+schema pair). stack-control's existing config-loaders do manual structural validation, but those validate a tiny fixed config; the registry schemas are richer and already expressed as JSON Schema.

**Alternatives considered**: (a) hand-port all schema validation to stack-control's manual-validation idiom — rejected: high risk, re-deriving proven validators; (b) adopt `zod` for everything — rejected: the schema files are JSON Schema, not zod; would mean rewriting all schemas. Open sub-decision recorded for the port: if a specific ported module already uses zod and the cost to convert is trivial, keep zod locally; otherwise standardize on ajv for the registry/manifest schemas.

## R3 — Migration delta: IN scope / ALREADY migrated / OUT of scope

**Decision**: Precise buckets (so the port neither re-migrates nor pulls in the audit-orchestration loop):

- **IN SCOPE (migrate, port-and-generalize):** clone detection (`clone-detector`, `jscpd-runner`, `clones-yaml*`, `dispose-clone`, `batch-dispose`, `refresh-clones-baseline`, `check-disposition-survivor`); refactor preconditions (`check-refactor-preconditions*`, `refactor-preconditions-prompt`); discovery (`scope-inventory*`, `scope-widen*`, `synthesis*`, `schema/manifest-validator`); discovery agents (`discovery-agents/*` — ui-route-enumerator, pattern-matrix + pattern-handlers, prd-themed-pattern-hunter, prd-relevance, clone-detector-reader, adopter-manifest-checker, regime-holdout-detector, codebase-state-metrics*, synthesis-discovered-candidates, shared, types); registries + checks (`anti-patterns-*`, `adopter-manifests-*`, `check-anti-patterns`, `check-adopters`, `check-deprecations`, `deprecation-*`, `module-symmetry-*`, `check-module-symmetry`); dispatch (`dispatch-wrapper*`, `dispatch-grammar`); install/doctor/export (`install-scope-discovery` minus hook bits, `doctor-rules/*` scope-discovery-relevant, `scope-export`, `summary`, `validate-scope-discovery`); the not-yet-migrated `util/*` (audit-log-parser, catalog-status, git-ancestry, glob, modules, registry-yaml).
- **ALREADY MIGRATED (do NOT re-migrate):** `audit-barrage/*`; `promote-findings/{check-barrage-dampener, checkpoint-filter, extract-barrage-findings, slush-remaining}`; `util/{atomic-write-file, feature-root, typeguards}`.
- **OUT OF SCOPE (separate audit-barrage/govern machinery — NOT this feature):** `controller/*`, `orchestrator-loop/*`, `orchestrator-turn*`, `orchestrator-turn-inputs`, `mediation/*`, `escalation/*`, `recovery/*`, `llm/*` (auditor/judge), and the *remainder* of `promote-findings/*` (apply, audit-log-editor/walker, auto-flip, auto-position, close-shipped, cross-reference, proposal-file, substantive-reason-validator, tdd-enforcement, workplan-*); plus `workplan-archive/*` and `tooling-feedback-import` (workplan/feedback tooling, not clone/scope-discovery).
- **DROPPED entirely (OQ-6):** `migrate-from-pilot*`, `uninstall-everything-hook-related`, and the hook-install portions of `install-scope-discovery`.

**Rationale**: The spec scopes this feature to the clone-detection + discovery + registry + dispatch surface; the audit-finding orchestration loop is part of audit-barrage/govern (already partially migrated). Pulling it in would re-migrate work and bloat the delivery. The IN/ALREADY/OUT split is the contract the tasks decompose against.

**Alternatives considered**: migrate the entire `src/scope-discovery/` tree wholesale — rejected: re-migrates audit-barrage and conflates two separate features; the spec and the existing stack-control contents make the boundary explicit.

## R4 — 500-line cap offenders (Principle VI)

**Decision**: Three IN-SCOPE files exceed 500 lines and are split during the port: `discovery-agents/codebase-state-metrics.ts` (725 → split gather/types already partially separate; extract further), `batch-dispose.ts` (522 → extract the apply/render helpers), `scope-inventory.ts` (505 → extract the run-evidence/agent-fan-out helper). The other two offenders (`orchestrator-turn.ts` 704, `tooling-feedback-import.ts` 640) are OUT of scope (R3) and not ported.

**Rationale**: Honors the ≤500-line cap without an exception. Splits are mechanical (extract cohesive helpers), preserving behavior; each split is covered by the module's RED test.

**Alternatives considered**: justify a cap exception in Complexity Tracking — rejected: the operator's cap is firm and the splits are cheap.

## R5 — Scope-discovery config home + 009 alignment

**Decision**: Scope-discovery's config + registries + baseline live under the installation's `.stack-control/scope-discovery/` directory (`config.yaml` with its own `schemaVersion`, `clones.yaml`, `anti-patterns.yaml`, `adopter-manifests.yaml`, `migration-map.yaml`, generated reports). They are **created lazily-and-announced** by the verb that first needs them (009 FR-016 model), NOT pre-scaffolded by installation `setup` and NOT added to the 009 `WorkingFileKey` set (009 FR-001 explicitly leaves scope-discovery registries as operation-produced). The codebase-boundary + any config-location resolution reuse 009's `config/resolve-paths.ts`. `install-scope-discovery` becomes a convenience that eagerly creates the empty-but-valid set for an operator who wants it up front (idempotent, non-destructive — 009 setup semantics).

**Rationale**: Keeps one installation model (009), avoids a competing config system, and matches 009's explicit decision that scope-discovery registries are lazily created, not part of the scaffolded installation-level working files. Honors FR-027/FR-028.

**Alternatives considered**: extend `config.yaml`'s `paths` (the 009 `WorkingFileKey` set) with scope-discovery entries — rejected: 009 FR-001 deliberately excludes operation-produced registries from the scaffolded set; a separate `scope-discovery/config.yaml` keeps the concerns and schema-versioning independent.

## R6 — Install-drift advisory home (resolves deferred OQ-5)

**Decision**: Build the install-drift advisory (FR-033 / US8) **in this feature** as a `stackctl` advisory verb whose logic lives in a skill/CLI body (compare each locally-sourced `.specify` extension copy to its plugin source via re-derived hash / content diff; warn, never block). Surface it from session-start when the native `multi/session-skills` lands (a thin call into this verb), rather than duplicating the logic there. This keeps the full surface in one delivery (operator: no partial feature delivery) while leaving the *session-start wiring* to the session-skills feature.

**Rationale**: Honors the no-partial-delivery decision — the capability ships here as a reachable verb, not a deferred stub. Putting the logic behind a CLI verb (per `enforcement-lives-in-skills.md`) means the future session surface just calls it. Avoids the "intended-but-unbuilt, invisible to next agent" hazard the operator named.

**Alternatives considered**: defer the whole advisory to `multi/session-skills` — rejected: that re-introduces partial delivery; the logic is independent of the session surface and belongs with the rest of scope-discovery's install/health machinery. (If the operator later decides the verb should not exist standalone, that is a one-line de-registration — but it ships built, not deferred.)
