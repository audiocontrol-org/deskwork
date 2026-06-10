---
name: scope-inventory
description: "Fan the parallel discovery agents over a feature's PRD + module-root and emit a schema-validated scope-manifest.yaml (stackctl scope-inventory) — upfront surface discovery BEFORE implementation; surfaces novel/unmatched shapes deterministically so a green run is NOT read as 'no novel anti-patterns'"
---

# /stack-control:scope-inventory

Thin adapter over the `stackctl scope-inventory` verb (the vendor-neutral core; this skill adds nothing the CLI can't do — it sequences and reports). Inventory the surfaces a feature will touch BEFORE implementation begins: it fans the four universal discovery agents (UI route enumerator, pattern matrix, clone-detector reader, PRD-themed pattern hunter) — plus any config-activated agents whose registry gate files are present — in parallel, runs the synthesis pass in-process, validates the strawman manifest against `scope-manifest.yaml.schema.json`, and writes the manifest plus per-agent evidence JSON. The manifest is the source of truth the implementer reads before writing code.

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl` verb it calls, never in a git hook. The skill travels with the plugin install.

## Inventory ≠ discovery — read the manifest with this in mind

The skill name says **inventory** because the action is "inventory the surfaces a feature touches." But the agent fleet does TWO different things in one pass:

1. **Inventory of registered patterns.** Matches the source tree against vocabularies the project has authored — `anti-patterns.yaml`, `adopter-manifests.yaml`, `clones.yaml`, the pattern-matrix catalog. A finding here means "the registry said to look for this shape, and it's still in the tree."
2. **Discovery of novel candidates.** Surfaces shapes the catalog does NOT yet know about — the synthesis-layer unmatched-shape clustering pass (`discovered_candidates:`), plus the per-handler negative-space / coverage-gap / outlier signals, plus `regime_holdouts` and `codebase_state_metrics`.

**A green inventory run reports zero holdouts against the REGISTERED catalog. It does NOT mean "no novel anti-patterns exist."** That is a separate signal carried by `discovered_candidates:` and the per-finding provenance. This is the project's "inventory ≠ discovery" rule (FR-017): the operator-trust failure mode it closes is *"a green discovery report read as evidence of no novel shapes, when it's really evidence of no already-registered matches."*

## Steps

1. Confirm the feature `slug` (required) and the PRD path (defaults to `docs/<v>/001-IN-PROGRESS/<slug>/prd.md`).
2. Identify the module-root the scan should walk. Default is `src/`; override with `--module-root` when the project's source tree lives elsewhere.
3. Run the verb from the worktree root (it resolves config relative to the enclosing stack-control installation):

   ```bash
   stackctl scope-inventory --slug <slug> [--prd-path <path>] [--module-root <path>] \
                            [--out <path>] [--evidence-trail]
   ```

   The verb:
   - Fans the four universal agents in parallel.
   - Activates config-driven agents only when their gate file is present under `.stack-control/scope-discovery/` (`anti-patterns.yaml`, `adopter-manifests.yaml`, `editor-symmetry.md`) — agents not activated pay zero scan cost.
   - Runs the synthesis pass in-process, dedupes `(file, id)` cross-cuts, folds the deterministic unmatched-shape clusters into `discovered_candidates:`, and validates the manifest against the schema before writing.
   - Writes the manifest to `--out` (default: `docs/<v>/001-IN-PROGRESS/<slug>/scope-manifest.yaml`) and emits per-agent JSON + a `synthesis.md` digest under `scope-inventory/runs/<stamp>-<runId>/` when `--evidence-trail` is set.

4. **Read the stderr `categories:` line and the synthesis output before declaring all-clear.** The run prints a category summary line (`stackctl scope-inventory: <category summary>`) and, with `--evidence-trail`, a `synthesis.md` that leads with the inventory-vs-discovery breakdown. **If the novel-shape / discovered-candidate counts are > 0, it is NOT all-clear** — those candidates need triage even when the registered-catalog match count is zero (FR-017 + the project's "inventory ≠ discovery" rule).

5. Report: the manifest path, the modules emitted, the agents that ran (skipped agents listed by name), the registered-match vs. novel-candidate split, and any synthesis warnings.

## Exit codes

- `0` — manifest written + schema-validated.
- `2` — CLI parse error / missing PRD / agent failure / schema-validation failure (the verb couldn't produce a manifest at all, so this is "didn't do the work," not "findings to triage").

## Notes

- The manifest's `discovered_candidates:` section is sourced from the deterministic pattern-matrix unmatched-shape clustering pass — no LLM. A non-empty section means the catalog is not yet exhaustive; review those clusters for promotion to a registered pattern.
- A `kind: code` manifest requires at least one module; pass `--module-root` (or check the feature's siblings exist under it) if the run advises an empty `modules:` array.
