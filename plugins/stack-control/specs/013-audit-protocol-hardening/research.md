# Research: Audit-Protocol Hardening — Layout-Aware Resolution

Phase 0 of `/speckit-plan`. Every decision below is grounded in a read of the **current** code (not the backlog's stale assumptions); file:line anchors are given so each is re-verifiable.

## Verified current state (the ground truth the plan builds on)

- **The single resolver is `resolveFeatureRoot`** — `src/scope-discovery/util/feature-root.ts:68-104`. It walks `<docs>/<version>/001-IN-PROGRESS/<slug>` only (`:94-103`), sorted lex-descending over version dirs. Extracted per AUDIT-20260530-15 specifically so a layout change is one edit.
- **The must-fix call site** — `src/subcommands/spec-governance-gate.ts:120` `resolveFeatureRoot({ repoRoot, slug })` → `:127` `auditLogPath = join(featureRoot, 'audit-log.md')` → `:128-130` fail-loud if absent. A `specs/NNN-slug/` feature never resolves, so the gate cannot evaluate it.
- **Helper-callers** (fixed for free by widening the helper): `spec-governance-gate.ts`, `audit-barrage-lift.ts`, `slush-findings.ts`, `backlog.ts`.
- **Direct-path constructors** (the broader rigid-path class, FR-003): `scope-inventory-cli.ts`, `scope-widen-cli.ts`, `scope-inventory.ts`, `scope-widen.ts`, `scope-export.ts`, `doctor-rules/provenance-orphaned-entries.ts` build `docs/1.0/001-IN-PROGRESS/<slug>/...` literally.
- **Lift abort (US2)** — `audit-barrage-lift.ts:273-274` writes "audit-log not found" and `return 2` (no scaffold).
- **Canonical audit-log shape** — frontmatter `slug:` + `targetVersion:`, then `# Audit log — <slug>`; lift appends `## <ISO-date> — audit-barrage lift (<run-dir-basename>)` sections (`audit-barrage-lift.ts:232`). The dampener parses these via `BARRAGE_HEADER_RE` (`check-barrage-dampener.ts:20`).

## Decisions

### D1 — Widen the one shared resolver, not the call sites
- **Decision**: add `specs/NNN-<slug>/` resolution inside `resolveFeatureRoot`; leave the four helper-callers untouched (they inherit the fix).
- **Rationale**: the helper exists precisely to be the single chokepoint (AUDIT-20260530-15); editing call sites would re-open the split-brain that extraction closed.
- **Alternatives rejected**: per-caller layout handling (reintroduces split-brain); a parallel `resolveSpecRoot` (two resolvers to keep in lockstep — the same bug).

### D2 — Resolver input stays slug-driven; map slug → `specs/NNN-<slug>`
- **Decision**: the resolver keeps taking a bare `slug`. For the `specs/` branch it matches a child dir whose name is exactly `<slug>` OR matches `^\d+-<slug>$` (numeric Spec Kit prefix). The `docs/` branch is unchanged.
- **Rationale**: every caller already passes a slug; keeping the contract uniform avoids touching call sites (supports D1). Spec-mode `govern` derives the slug from `--feature`/branch just like implement-mode.
- **Edge**: numeric-prefix ambiguity (two `specs/` dirs sharing a suffix) → **fail loud naming the candidates** (Principle V; no silent "pick highest").
- **Alternatives rejected**: pass the already-resolved spec dir from `.specify/feature.json` (cleaner for spec-mode but changes the caller contract and splits the input shape across modes — defer; not needed for the blocker).

### D3 — Two-layout precedence (FR-005): `specs/` first, then `docs/`
- **Decision**: search the `specs/` layout first; on no match, fall through to the `docs/<version>/001-IN-PROGRESS/` walk. First match wins; precedence is documented in the resolver doc-comment and the contract.
- **Rationale**: new work lives in `specs/`; biasing toward the active layout mirrors the existing lex-greatest-version bias toward the active version (`feature-root.ts:20-30`). Collisions are unlikely in practice (a feature lives in one layout), but the order must be deterministic, not filesystem-iteration-order.
- **Alternatives rejected**: `docs/` first (legacy bias, wrong for the now-dominant layout); error on any cross-layout collision (too strict — a legacy slug that coincidentally matches a new spec suffix should still resolve deterministically).

### D4 — US2 scaffold writes the canonical header at the resolved root
- **Decision**: when the resolved `audit-log.md` is absent, `audit-barrage-lift` creates it with frontmatter (`slug`, `targetVersion`) + `# Audit log — <slug>` (the exact shape at `audit-barrage-lift.ts:232` consumers expect), then proceeds to append the run's section — replacing the `return 2` abort. `targetVersion` for a `specs/` feature is sourced from the resolution (or omitted/defaulted if the `specs/` layout has no version axis — decided in the contract).
- **Rationale**: auto-scaffold-on-first-use is the pattern the backlog store already uses; the dampener's `BARRAGE_HEADER_RE` only needs the `## <date> — audit-barrage lift (...)` sections, so a minimal valid header suffices.
- **Alternatives rejected**: a separate `audit-log init` verb (extra step defeats unattended execution); scaffolding in `setup`/`define` (those don't run for every feature path; lift is the universal choke).

### D5 — FR-003 cross-consumer reconciliation: audit/governance consumers IN; scope-discovery direct paths SCOPED to a follow-on
- **Decision**: this feature widens the helper (fixing gate/lift/slush/backlog feature-root resolution) and reconciles any **audit-log/governance** direct-path construction in those four. The `scope-inventory`/`scope-widen`/`scope-export`/`provenance-orphaned-entries` direct `docs/1.0/001-IN-PROGRESS/...` constructions — which target `scope-manifest.yaml`/`prd.md`, **not** the audit-log, and are not on the governance blocker path — are **scoped to a follow-on backlog item**, captured so they are not lost (FR-003's "explicitly scoped" branch).
- **Rationale**: the operator narrowed 013 to the governance blocker; pulling the entire scope-discovery path surface in would re-broaden it. Those verbs also legitimately may still operate on docs-layout scope-discovery features.
- **Action**: file a backlog `gap` for "reconcile scope-* + doctor direct `001-IN-PROGRESS` path constructions to the layout-aware helper" and reference it from the spec's follow-on note.

### D6 — RED-first, two concrete instances (Principles I + II)
- **Decision**: each change ships a test seen failing on current code first: (a) `feature-root.test.ts` gains a `specs/NNN-slug` resolution case + a precedence case + a neither-layout fail-loud case, while keeping the lex-greatest-version case green (backward-compat guard); (b) an `audit-barrage-lift` test asserts scaffold-on-missing-audit-log.
- **Rationale**: the widened resolver is trusted only once **two** concrete layouts flow through it (Principle II); the lex-greatest test is the regression wall (Principle I).
