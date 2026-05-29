# discovery-agents/

Modules in this directory are referred to collectively as the **discovery-agent fleet** in legacy prose. They are *not* Claude Code sub-agents — they are pure TypeScript modules that `dw-lifecycle scope-inventory` invokes in parallel.

The directory name dates from the audiocontrol pilot, when the protocol's only mode was "fan parallel scanners over the codebase and emit a manifest." the orchestrator loop (#316) introduced the **inventory vs. discovery** distinction, and the agents in this directory now split cleanly along that line. Use the distinction when reading the code, when reading the synthesized manifest, and when reading the operator-facing reports.

## Inventory agents — registered-pattern matchers

These agents match the source tree against vocabularies that the operator (or `install-seed`) authored. A green run reports "no holdouts against the things you registered" — it says nothing about novel shapes the catalog doesn't yet know about.

| Agent | Matches against |
|---|---|
| `pattern-matrix.ts` (runtime tag `ast-grep-matrix`) | `.dw-lifecycle/scope-discovery/pattern-matrix-patterns.yaml` plus the built-in CLAUDE.md catalog. |
| `clone-detector-reader.ts` | `clones.yaml` dispositioned baseline. |
| `adopter-manifest-checker.ts` | `adopter-manifests.yaml` (canonical-primitive expected adopters). |
| `regime-holdout-detector.ts` | Fuses the four registered scans (anti-patterns, adopter-manifests, editor-symmetry, deprecations). |
| `ui-route-enumerator.ts` | Project's router configuration (React Router default; pluggable strategies). |

Findings produced by inventory agents carry `provenance: 'registered-pattern'` (plus the scanner-specific provenance like `coverage-gap` for the coverage-metric handler), and their `status_provenance.provenance_source` reflects the catalog entry's origin (`operator-authored` / `install-seed` / etc.).

## Discovery agents — novel-shape surfacing

These agents surface shapes the catalog does NOT yet know about. They are the answer to the operator-trust failure mode — *"a green inventory report ≠ no novel anti-patterns."*

| Agent | What it surfaces |
|---|---|
| `synthesis-discovered-candidates.ts` (the discovered_candidates stub stub) | Unmatched-shape clustering at the synthesis layer; algorithmic spec tracked at [#318](https://github.com/audiocontrol-org/deskwork/issues/318). |
| Negative-space handler in `pattern-handlers/` | Files matching a glob but NOT containing an expected primitive — the KeygroupSummary canonical repro pattern from [#315](https://github.com/audiocontrol-org/deskwork/issues/315). |
| Outlier handler in `pattern-handlers/` | Statistical anomalies vs. sibling components. |
| Coverage-metric handler in `pattern-handlers/` | Adoption-fraction metrics that surface low-coverage gaps. |
| Semantic handler in `pattern-handlers/` (stub; LLM-augmented; wiring tracked at [#319](https://github.com/audiocontrol-org/deskwork/issues/319)) | LLM-judge-driven semantic match against curated prompt templates. |
| Mediation pass at `mediation/` | Architectural-summary clustering over raw findings; surfaces operator-readable cluster summaries under `discovered_candidates:` on the manifest. |

Findings produced by discovery agents carry one of the non-`registered-pattern` provenance tags (`negative-space`, `outlier`, `coverage-gap`, `discovered-candidate`, `semantic`). When such a finding is auto-promoted into a catalog entry by the orchestrator-agent mediation layer, its `status_provenance.provenance_source` becomes `orchestrator-agent` or `llm-judge-proposed` — distinguishing it from hand-authored catalog entries.

## Why the distinction matters

The operator-trust failure mode the architecture closes: *"a green discovery report read as evidence of no novel anti-patterns, when it's really evidence of no already-registered matches."* The first dogfood-cycle finding ([#315](https://github.com/audiocontrol-org/deskwork/issues/315)) caught this exact failure: a component with zero canonical-primitive consumers + 14 utility-class hits passed every scanner because no catalog entry described its shape.

inventory vs. discovery surfacing resolved the naming alignment via the **hybrid option**: the operator-facing entry-point keeps the name `scope-inventory` (it is the action — "inventory the surfaces a feature touches"); the per-finding provenance + the manifest's `discovered_candidates:` section + the discovery-vs-inventory split documented HERE distinguish registered-pattern matches from novel candidates. No source-tree rename was performed (the cost would have been higher than the readability gain); `pattern-matrix.ts` etc. keep their existing filenames; the JSON wire format's `agent: 'ast-grep-matrix'` discriminator stays invariant.

## How to read a manifest

A scope-manifest.yaml from `scope-inventory` carries findings in three operator-visible categories:

1. **Registered-pattern matches (inventory).** Findings in `regime_holdouts:` whose `status_provenance.provenance_source` is `operator-authored` or `install-seed`, AND whose source-status is `blessed` / `cursed`. These are the things the catalog said to look for, and the scanner found them.
2. **Discovered candidates (architectural-scale).** Entries under `discovered_candidates:` — the orchestrator-agent mediation layer surfaced shape-clusters that the catalog doesn't currently cover. The operator dispositions these at architecture-scale; the orchestrator-agent translates to line-level catalog edits.
3. **Novel-shape candidates (per-handler).** Findings whose `provenance` is one of `negative-space`, `outlier`, `coverage-gap`, `semantic`, `discovered-candidate`. These are the per-handler "I see something not in the catalog" signals.

The `regime_holdouts.meta.by_status` block rolls categories 1 + 3 up into `actively_enforced` vs `candidate` counts. A run with non-zero `candidate_count` OR a non-empty `discovered_candidates:` section is the signal "the catalog is not yet exhaustive; review these for promotion to blessed/cursed."

## See also

- `DESKWORK-STATE-MACHINE.md` for the project-level state machine the dispositions interlock with.
- `.claude/rules/agent-discipline.md` § *"Inventory vs discovery — how to read scope-discovery reports"* for the operator-discipline cue.
- `synthesis-derive.ts` and `synthesis-derive-regime.ts` for the report-rendering code that surfaces the provenance + status distinctions in the manifest YAML.
