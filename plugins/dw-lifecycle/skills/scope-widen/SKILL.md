---
name: scope-widen
description: "Re-run discovery against an operator complaint and surface the new surfaces the original scope-inventory missed"
---

# /dw-lifecycle:scope-widen

Mid-implementation, the operator notices the original `scope-inventory` missed a surface — "we missed the foowidget views", "the patches integration wasn't on the inventory". Invoke `/dw-lifecycle:scope-widen "<complaint>"` with a free-text complaint and the orchestrator re-runs the four universal discovery agents with the complaint appended to the PRD body, surfacing the delta (what the new run found that wasn't in the prior manifest).

Default behavior is DRY-RUN: the delta is printed + an evidence trail is written, but the existing `scope-manifest.yaml` is NOT touched. Pass `--apply` to merge the delta into the manifest.

## Inventory vs. discovery — same split as scope-inventory

scope-widen runs the SAME agent fleet as `/dw-lifecycle:scope-inventory`, so the same inventory-vs-discovery distinction applies to the delta:

- **Registered-pattern matches in the delta** = the original scan saw the same registry entries, but the complaint widened the in-scope module set so additional files matched. Provenance is `registered-pattern`; `status_provenance.provenance_source` is `operator-authored` / `install-seed`.
- **Discovered candidates in the delta** = the orchestrator-agent's mediation layer surfaced an architectural-scale candidate cluster that the original scan didn't produce (typically because the complaint shifted the PRD's thematic vocabulary). Entries land under `discovered_candidates:` in the new manifest.
- **Novel-shape candidates in the delta** = per-handler findings (`negative-space`, `outlier`, `coverage-gap`, `semantic`) flagging shapes not in the registered catalog. Provenance tags are non-`registered-pattern`.

Treat a non-empty `discovered_candidates:` delta or a non-zero `candidate_count` shift the same way you treat them on a first scope-inventory run: triage the candidates before promoting them via `--apply`. A zero delta against registered patterns is NOT a green light when novel-shape findings appeared.

## Steps

1. Confirm the feature `slug` and the complaint text. The complaint must be quoted on the shell — it's a single positional argument.
2. Default paths: the prior manifest at `docs/<v>/001-IN-PROGRESS/<slug>/scope-manifest.yaml` and the PRD at `docs/<v>/001-IN-PROGRESS/<slug>/prd.md`. Override with `--manifest` and `--prd-path` if either lives elsewhere.
3. Shell out to the helper:

```
dw-lifecycle scope-widen "<complaint>" --slug <slug> \
    [--manifest <manifest-path>] [--prd-path <prd-path>] \
    [--module-root <path>] [--apply] [--evidence-trail on|off] [--quiet]
```

The helper:
   - Reads the prior manifest from disk and validates it against the manifest schema.
   - Reads the PRD, appends a `## Operator complaint (scope-widen)` section with the complaint text verbatim, and writes the augmented PRD to a per-run evidence directory. The on-disk PRD is never modified.
   - Re-runs the four universal discovery agents (`ui-route-enumerator`, `pattern-matrix`, `clone-detector-reader`, `prd-themed-pattern-hunter`) against the augmented PRD. The PRD-themed pattern hunter tokenizes the complaint alongside the PRD body — operator words automatically become themed keywords without bespoke parsing. The pattern-matrix and clone-detector agents read the source tree directly; their findings shift only if the complaint changes which workspace modules `modulesInScopeForFeature` decides are in scope.
   - Runs the synthesis pass in-process to produce a new manifest.
   - Computes the delta as the set difference (new entries not present in the prior manifest); themes are keyed by their TERM, not the rendered "<term> (N occurrences)" string, so occurrence-count shifts don't false-positive as additions.
   - In dry-run mode (default), prints the delta summary to stderr and exits 0 without touching the manifest.
   - With `--apply`, merges the delta into the prior manifest and writes the merged YAML back. The merge is purely additive: pre-existing entries are preserved verbatim; the manifest's `generated_by` (e.g. `curated`) stays whatever the operator left it. The `regime_holdouts.meta` counts are recomputed from the merged section lengths.

4. Emit the evidence trail under `docs/<v>/001-IN-PROGRESS/<slug>/scope-inventory/widen-runs/<stamp>-<runId>/` containing the complaint text, the augmented PRD, per-agent JSONs, the synthesizer notes, the new manifest, and the delta JSON.
5. Report: the delta summary (per-section addition counts, split into registered-pattern vs. novel-candidate buckets), the evidence-trail path, whether `--apply` ran, and any synthesizer warnings.

## Flags

| Flag | Meaning |
|---|---|
| `"<complaint>"` (positional) | Free-text operator complaint. Required. Must be quoted on the shell. |
| `--slug <slug>` | Feature slug (kebab-case). Required. |
| `--manifest <path>` | Override prior-manifest path. Defaults to `docs/<v>/001-IN-PROGRESS/<slug>/scope-manifest.yaml`. |
| `--prd-path <path>` | Override PRD path. Defaults to `docs/<v>/001-IN-PROGRESS/<slug>/prd.md`. |
| `--repo-root <path>` | Override repo root (default: cwd). |
| `--module-root <path>` | Source-tree root for code-emitting agents. Defaults to `src/`. |
| `--apply` | Merge the delta into the prior manifest and write back. Without `--apply`, the run is dry-run-only. |
| `--evidence-trail on\|off` | Default `on` — persist per-agent JSONs + synthesizer notes + new-manifest YAML under `widen-runs/<stamp>-<runId>/`. `off` still writes the complaint + delta + args; only the per-agent dump is skipped. |
| `--quiet` | Suppress the stderr delta-summary + evidence-trail-path lines. |

## Error handling

- **Prior manifest missing.** Helper exits 2 and tells the operator to run `/dw-lifecycle:scope-inventory --slug <slug>` first. scope-widen cannot delta against an absent baseline.
- **Prior manifest fails schema.** Helper exits 2 and reports the per-keypath validation errors. Either the manifest has drifted from the schema (re-run scope-inventory to regenerate) or the schema itself changed under the operator (file an issue).
- **PRD missing.** Helper exits 2 — the agents need the PRD body to tokenize. Re-create the PRD or pass an explicit `--prd-path`.
- **Synthesizer schema failure.** Helper exits 1 (distinguishing from infra-error exit 2) and reports the failing keypath. The re-synthesized manifest fails schema validation; the upstream agent finding is the source.
- **Clone-detector baseline missing.** Helper exits 2 with an actionable hint: `dw-lifecycle check-clones --refresh-baseline` to generate.

## When to use

Use scope-widen when the operator notices, mid-implementation, that the original inventory missed a surface — typically prompted by a code-review comment, a friction-log entry, or just discovery during implementation that "we should have looked at X too." The complaint becomes the input; the verb's output is the set of new surfaces the original scan missed.

Run with the default dry-run mode first to inspect the delta. The delta surfaces under the per-run evidence directory as `delta.json`; review it before re-running with `--apply` to merge into the manifest. If the delta is noisy (false positives from the PRD-themed tokenizer picking up complaint words that aren't really new surfaces), refine the complaint phrasing and re-run; the merge is non-destructive (the prior manifest is unchanged in dry-run).

Do NOT use scope-widen to RESTART discovery from scratch — that's `/dw-lifecycle:scope-inventory`. scope-widen is purely additive; it never removes entries the operator curated. If the prior manifest needs to be rebuilt, delete it and re-run scope-inventory.

When the delta contains novel-shape candidates (non-`registered-pattern` provenance, or non-empty `discovered_candidates:` delta), prefer triaging those into the catalog (via `/dw-lifecycle:implement`'s mediation flow or hand-edits) BEFORE running with `--apply` — otherwise the merged manifest will carry the candidates without an operator disposition, and subsequent runs will keep re-surfacing them.
