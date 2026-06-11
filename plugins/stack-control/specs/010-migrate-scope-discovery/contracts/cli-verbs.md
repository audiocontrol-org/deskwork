# Phase 1 Contract: stackctl scope-discovery verbs

The vendor-neutral core (FR-034): every capability is a `stackctl <verb>`; `/stack-control:*` skills are thin adapters. Each verb validates its own flags (no silently-ignored flag) and exits with a documented code. Per-codebase scoping is the DEFAULT for clone verbs — no `--root` needed (R1/FR-006). Skills are named `/stack-control:<verb>`.

## Exit-code convention

| Code | Meaning |
|---|---|
| 0 | Success / clean (no gate violation) |
| 1 | Gate violation (NEW clone, holdout in gate-mode, refused disposition, malformed input) |
| 2 | I/O / parse / engine crash error |

## Clone detection & disposition

| Verb | Key flags | Contract |
|---|---|---|
| `check-clones` | `[--root <path>]` `[--gate-mode]` `[--diff]` `[--baseline <path>]` `[--json]` `[--quiet]` | Default boundary = resolved installation root (R1); reports clone groups, NEW vs baseline. `--gate-mode` exits 1 on any NEW. NEVER scans whole-repo by default (FR-005/006/008). |
| `dispose-clone` | `<id> --as <refactor\|keep-with-reason\|ignore-with-justification> --reason <text>` + refactor: `--canonical-side`, `--canonical-reason`, `--tests-proof <sha>`, `--tests-demonstration <text>` | Writes a disposition. REFUSES `--as refactor` without Step 0a+0b fields (FR-011) → exit 1 naming the missing precondition. |
| `batch-dispose` | `--ids <id,...> --as <d> --reason <text>` | Bulk single-(disposition,reason) apply (FR-014). |
| `refresh-clones-baseline` | `[--root <path>]` | Re-runs detector; carries forward curated dispositions incl. across renames (FR-013). |
| `check-disposition-survivor` | (diff context) | Detects silent non-pending→pending disposition regressions. |
| `check-refactor-preconditions` | `[--gate]` | Validates Step 0a/0b completeness on `refactor` entries (FR-011). |

## Discovery

| Verb | Key flags | Contract |
|---|---|---|
| `scope-inventory` | `<feature-slug>` `[--no-<agent>]` | Fans universal (+ config-activated) agents over the boundary; writes schema-valid `ScopeManifest` + run evidence (FR-015). Surfaces `candidates` distinctly (FR-017). |
| `scope-widen` | `"<complaint>"` | Surfaces siblings missed by the prior inventory; reconciles against existing manifest (FR-016). |
| `scope-summary` | `[--surface <glob>]` | Per-surface pending vs dispositioned clone tally (FR-030). |
| `scope-export` | `[--json]` | Emits clones + anti-patterns + holdouts + summary for external consumption (FR-030). |

## Registry-driven checks (config-activated)

| Verb | Key flags | Contract |
|---|---|---|
| `check-anti-patterns` | `[--gate-mode]` | Scans per registered `patternType`; honors `severity` in gate-mode (FR-020). No-ops on empty registry (FR-019). |
| `check-adopters` | `[--gate-mode]` | Flags non-importing files in each `adopterGlob`; honors exceptions/holdouts (FR-021). |
| `check-module-symmetry` | `[--write]` | Cross-module adoption matrix (FR-022). Keeps `check-editor-symmetry` as a deprecation alias (one cycle). |
| `check-deprecations` | `[--write]` | `@deprecated` modules + their remaining importers (FR-023). |

## Dispatch discipline

| Verb | Key flags | Contract |
|---|---|---|
| `dispatch-wrapper` (lib + CLI) | (validates a dispatch return) | Enforces Searched/Included/Excluded grammar; rejects missing enumeration + forbidden-deferral phrases (FR-024); appends preconditions prelude on refactor-marked tasks (FR-025). |
| `validate-scope-discovery` | | Runs the adversarial validator harnesses incl. gutted-stub self-check; exit 1 if a gate is gutted (FR-026). |

## Install / customize / doctor

| Verb | Key flags | Contract |
|---|---|---|
| `install-scope-discovery` | `[--at <dir>]` | Eagerly creates empty-but-valid registries + schemas + `config.yaml` under `.stack-control/scope-discovery/`; idempotent, non-destructive (FR-027, 009 setup semantics). NO hook-install machinery (OQ-6). |
| `customize <name>` | | Copies a plugin-default scanner/agent into the project as an override; runtime resolves override > default (FR-029). |
| `doctor` (scope-discovery rules) | `[--fix]` | Validates registries/baseline vs schemas; flags refactor-incomplete + override/mirror drift (FR-031). Reports by default; mutates only on `--fix`. |
| `install-drift` (advisory) | | Compares local `.specify` extension copies to plugin source; warns (non-blocking) on stale (FR-033 / US8 / R6). |

## Governance wiring

| Surface | Contract |
|---|---|
| `govern --mode implement` | Runs the per-codebase `check-clones` step as part of the chain; surfaces NEW intra-codebase clones (FR-032). Replaces the current TODO placeholder in `subcommands/govern.ts` + `govern/protocol.ts`. |

## Cross-cutting invariants

- Every verb runs to completion in a plain shell with no Claude Code surface present (FR-034 / SC-009).
- Malformed baseline/registry → exit 2 with a message naming the file + reason; never false-clean (FR-035 / SC-005-analog).
- No verb reads, writes, or disturbs `dw-lifecycle`'s scope-discovery files (isolation invariant / SC-010).
