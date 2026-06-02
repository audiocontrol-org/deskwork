---
name: scope-inventory
description: "Fan parallel discovery agents over a feature's PRD + module-root and emit a validated scope-manifest.yaml"
---

# /dw-lifecycle:scope-inventory

Inventory the surfaces a feature will touch BEFORE implementation begins. Fans the four universal discovery agents (UI route enumerator, pattern matrix, clone-detector reader, PRD-themed pattern hunter) plus any Phase 4 config-activated agents (regime-holdout detector, editor-symmetry scanner, adopter-manifest checker) in parallel and writes a schema-validated `scope-manifest.yaml` plus per-agent evidence JSON. The manifest is the source of truth the implementer reads before writing code.

## Inventory vs. discovery — read the manifest with this in mind

The skill name says **inventory** because the action is "inventory the surfaces a feature touches." Internally, the agent fleet does TWO different things in one pass:

1. **Inventory of registered patterns.** Matches the source tree against vocabularies the project has authored — `anti-patterns.yaml`, `adopter-manifests.yaml`, `clones.yaml`, the pattern-matrix catalog, `@deprecated` markers. A finding here means "the registry said to look for this shape, and it's still in the tree." Provenance on these findings is `registered-pattern` (or one of the scanner-specific tags); `status_provenance.provenance_source` is `operator-authored` / `install-seed`.
2. **Discovery of novel candidates.** Surfaces shapes the catalog doesn't yet know about — negative-space (the discovered_candidates stub), coverage-gap (G3), outlier (G4), semantic (G6), and the synthesis-layer unmatched-shape clustering pass (G5). Provenance is one of `negative-space` / `coverage-gap` / `outlier` / `semantic` / `discovered-candidate`. The mediation layer additionally surfaces architectural-scale cluster summaries under `discovered_candidates:` on the manifest.

A green inventory run reports zero holdouts against registered patterns. It does NOT mean "no novel anti-patterns exist" — that's a separate signal carried by `discovered_candidates:` plus the per-finding provenance. The operator-trust failure mode this distinction closes: *"a green discovery report read as evidence of no novel shapes, when it's really evidence of no already-registered matches."* See [`discovery-agents/README.md`](../../src/scope-discovery/discovery-agents/README.md) (in the plugin source) for the agent-by-agent split.

## Steps

1. Confirm the feature `slug` (required) and the PRD path (defaults to `docs/<v>/001-IN-PROGRESS/<slug>/prd.md`).
2. Identify the module-root the scan should walk. Default is `src/`; override with `--module-root` when the project's source tree lives elsewhere.
3. Shell out to the helper. Run from the worktree root (the helper resolves config relative to it):

```
dw-lifecycle scope-inventory <slug> [--prd-path <path>] [--module-root <path>] \
                                    [--out <path>] [--evidence-trail]
```

The helper:
   - Fans the four universal agents in parallel.
   - Checks Phase 4 gate files (`.dw-lifecycle/scope-discovery/{anti-patterns,adopter-manifests,editor-symmetry.md}`) and activates the relevant config-driven agents only when their activator file is present — agents not activated pay zero scan cost.
   - Runs the synthesis pass in-process, dedupes `(file, id)` cross-cuts, and renders the strawman manifest.
   - Runs the orchestrator-agent mediation layer (orchestrator-agent mediation) to cluster raw findings into architectural-scale candidate summaries; non-empty clusters land under `discovered_candidates:` on the manifest.
   - Validates the manifest against `scope-manifest.yaml.schema.json` before writing.
   - Writes the manifest to `--out` (default: `docs/<v>/001-IN-PROGRESS/<slug>/scope-manifest.yaml`) and emits per-agent JSON + a `synthesis.md` digest under `scope-inventory/runs/<stamp>-<runId>/` when `--evidence-trail` is set.

4. Report: the manifest path, the modules emitted, the agents that ran (with skipped agents listed by name), the count of registered-pattern matches vs. novel candidates surfaced, and any synthesis warnings.

## Reading the report

The manifest's per-finding output distinguishes three operator-visible categories:

| Category | Manifest location | Signal |
|---|---|---|
| Registered-pattern match | `regime_holdouts.*` entries where `status_provenance.source_status` is `blessed` / `cursed` and `provenance_source` is `operator-authored` / `install-seed` | The catalog said to look for this shape; the scanner found it. Fix in-place or extend `exceptions:`. |
| Discovered candidate (architectural) | `discovered_candidates:` array entries | The mediation layer surfaced a shape cluster the catalog doesn't currently cover. Operator dispositions architecture-scale; orchestrator-agent translates to line-level edits. |
| Novel-shape candidate (per-handler) | `regime_holdouts.*` entries whose `status_provenance.provenance_source` is `orchestrator-agent` / `llm-judge-proposed`, OR per-handler findings with provenance `negative-space` / `coverage-gap` / `outlier` / `semantic` / `discovered-candidate` | A per-handler signal of a shape not yet registered. Triage to `blessed` / `cursed` / `ignore` via `/dw-lifecycle:implement`'s mediation flow, or hand-edit the relevant catalog. |

The `regime_holdouts.meta.by_status` rollup splits the totals into `actively_enforced_count` (registered-pattern matches under `blessed` / `cursed`) and `candidate_count` (novel + pending). A run with non-zero `candidate_count` OR a non-empty `discovered_candidates:` section means "the catalog is not yet exhaustive — review these for promotion."

## Flags

| Flag | Meaning |
|---|---|
| `--slug <slug>` | Feature slug (kebab-case). Required when not embedded in the positional argument. |
| `--module-root <path>` | Source-tree root for code-emitting agents. Defaults to `src/`. |
| `--out <path>` | Manifest output path. Defaults to `docs/<v>/001-IN-PROGRESS/<slug>/scope-manifest.yaml`. |
| `--prd-path <path>` | PRD location for the PRD-themed pattern hunter. Defaults to the canonical feature PRD path. |
| `--evidence-trail` | Persist per-agent JSON + synthesis digest under `scope-inventory/runs/<stamp>-<runId>/` for replay + audit. |

## Error handling

- **Module-root absent.** Helper aborts: name a real path via `--module-root`, or scaffold the directory before re-running.
- **PRD missing.** PRD-themed pattern hunter cannot tokenize. Helper aborts; create the PRD or pass an explicit `--prd-path`.
- **Schema validation fails.** The synthesis produced a manifest the validator rejected. Helper aborts without writing; the failing keypath is reported so the agent author can fix the upstream schema-typed code, not the manifest.
- **Router strategy ambiguous.** The UI route enumerator detected two competing router signatures (e.g. React-Router + Next.js). Helper aborts asking the operator to disambiguate; configure a single strategy via `customize` or remove the contender. Additional default router strategies (Vue / Next / SvelteKit) are tracked at [#286](https://github.com/audiocontrol-org/deskwork/issues/286).

## When to use

Run scope-inventory once per feature, immediately after `/dw-lifecycle:setup` produces the PRD. The manifest the protocol writes is the single artifact the implementer consults for "what surfaces does this feature touch?" — answering that question by hand is the failure mode the protocol was built to prevent. Re-run scope-inventory when the PRD's scope changes substantially (new themes, new module-roots) so the manifest stays the source of truth.

When the report shows a non-zero `candidate_count` or a non-empty `discovered_candidates:` section, that is the explicit signal that the catalog needs operator triage — DO NOT treat the run as "all clear" just because the registered-pattern findings are zero. The novel-shape candidates are the discovery-side output; ignoring them is the operator-trust failure mode this design exists to close.

## Composed disciplines

Composed from `.claude/rules/agent-discipline.md` (feature `decompose-agent-discipline`); the rules file now points here.

### Log tooling-feedback as friction surfaces (don't batch at the end)

For features exercising scope-discovery, log friction in `docs/<v>/001-IN-PROGRESS/<slug>/tooling-feedback.md` **the moment it surfaces** — one observable friction per entry, each with **Repro / Workaround used / Suggested fix** (the suggested fix names an operator-recognizable shape — often Light / Medium / Heavy options — not a vague "make it better"). Append-only: closed entries get a `Status` line + closing-commit SHA, never deleted. The cumulative log is the v1 ship-gate signal; a single end-of-feature "audit" teaches far less. When a friction entry needs architecture-level triage, promote it to a GH issue + acknowledge in the workplan (per "Just for now is bullshit").

### Reading the report: inventory ≠ discovery (the single hard test)

A green `scope-inventory` (or any `check-*` verb) is evidence of **no source-tree match against the catalog the project already registered** — NOT "no novel anti-patterns / adopter-gaps / deprecation candidates." Parse every report into three operator-visible categories: **registered-pattern matches** (inventory — catalog said to look, scanner found), **discovered candidates** (architectural-scale clusters the catalog doesn't cover, under `discovered_candidates:`), and **novel-shape candidates** (per-handler signals: `pending` status, `negative-space` / `coverage-gap` / `outlier` / `semantic` provenance). The hard test before saying "no findings": **read the stderr `categories:` line AND `synthesis.md`'s category-report section.** If `novel-shape-candidate > 0` OR `discovered-candidate > 0` OR `pendingMetaCount > 0`, the run is NOT all-clear — triage those candidates first. If you catch yourself writing "no anti-patterns found" without naming the category split, STOP — that's the failure mode (KeygroupSummary-shape regressions, [#315](https://github.com/audiocontrol-org/deskwork/issues/315)).
