---
name: scope-widen
description: "Re-run the discovery agents against an operator complaint mid-implementation and surface the NEW surfaces the original scope-inventory missed (stackctl scope-widen) — additive delta against the prior manifest; default dry-run, --apply to merge"
---

# /stack-control:scope-widen

Thin adapter over the `stackctl scope-widen` verb (the vendor-neutral core; this skill adds nothing the CLI can't do — it sequences and reports). Use mid-implementation when an operator complaint reveals that the original `scope-inventory` missed a surface. The verb appends the complaint to the PRD body as a synthetic section (the on-disk PRD is never modified), re-runs the four universal discovery agents against the augmented PRD, deltas the new manifest against the prior one on disk, and surfaces the ADDITIONS — the sibling surfaces the complaint exposed.

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl` verb it calls, never in a git hook. The skill travels with the plugin install.

## When to use

- Mid-implementation, when the operator says "this also affects X" and X wasn't in the original `scope-manifest.yaml`.
- After a surface emerges that the upfront inventory's PRD didn't name, so the implementer can reconcile it against the planned scope.

## Steps

1. Confirm the feature `slug` (required) and have the operator's complaint as a single quoted string.
2. Run the verb from the worktree root:

   ```bash
   stackctl scope-widen "<complaint>" --slug <slug> \
                        [--prd-path <path>] [--manifest <path>] \
                        [--module-root <path>] [--apply] \
                        [--evidence-trail on|off]
   ```

   The verb:
   - Loads the prior manifest (fails loud with an actionable hint if it is missing — run `scope-inventory` first).
   - Re-runs the four universal agents against the complaint-augmented PRD.
   - Synthesizes a new manifest, validates it against the schema, and computes the PURELY ADDITIVE delta (entries present in the new manifest but absent from the prior one). Removals are NOT surfaced — the operator's prior curation is preserved.
   - **Default is DRY-RUN:** prints the delta and leaves the on-disk manifest untouched.
   - With `--apply`: merges the delta into the prior manifest (existing entries preserved verbatim; `generated_by` is NOT downgraded back to `strawman`).

3. Report: the delta (new routes / modules / themes / regime-holdouts), whether it was applied, and the evidence-trail path when `--evidence-trail on`.

## Exit codes

- `0` — delta computed (manifest updated when `--apply`).
- `1` — schema-validation failure on the re-synthesized manifest.
- `2` — CLI parse error / missing prior manifest or PRD / agent failure.

## Notes

- The complaint becomes themed keywords without bespoke parsing: it is appended to the PRD body so the PRD-themed pattern hunter tokenizes it alongside the PRD.
- Evidence lands under `scope-inventory/widen-runs/<stamp>-<runId>/` (sibling to `scope-inventory`'s `runs/`) — the complaint, the augmented PRD, per-agent JSONs, the synthesizer notes, the delta, the new manifest, and the CLI args.
