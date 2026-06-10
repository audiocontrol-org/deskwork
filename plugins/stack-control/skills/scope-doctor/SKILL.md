---
name: scope-doctor
description: "Run the scope-discovery doctor rules against the enclosing stack-control installation (stackctl scope-doctor) — flags config-missing, schema-stale, clones/anti-patterns schema violations, refactor-incomplete refactor entries, override drift, missing catalog status, orphaned provenance, and legacy field renames. Read-only; reserved --fix."
---

# /stack-control:scope-doctor

Thin adapter over the `stackctl scope-doctor` verb. Runs the scope-discovery doctor rule set scoped to the nearest-enclosing stack-control installation. Named `scope-doctor` (not `doctor`) to stay distinct from any future generic doctor verb.

## When to use

- After installing scope-discovery, to confirm the registries + config are well-formed.
- Before a PR, to surface schema drift, incomplete refactor entries, or orphaned provenance.

## Steps

1. **Run from inside the codebase:**

   ```bash
   stackctl scope-doctor          # report findings
   stackctl scope-doctor --json   # machine-readable findings
   stackctl scope-doctor --at <dir>
   ```

2. **Read the exit code:** `0` = no error-severity findings (warnings may be present); `1` = ≥1 error-severity finding; `2` = invalid args or no enclosing installation.

3. **Rules run** (read-only): `scope-discovery-config-missing`, `scope-discovery-schema-stale`, `clones-yaml-schema-violation`, `anti-patterns-yaml-schema-violation`, `clones-yaml-refactor-incomplete`, `override-drift`, `catalog-entry-missing-status`, `provenance-orphaned-entries`, `legacy-editor-symmetry-field-rename`.

## Notes

- `--fix` is reserved + validated; the current rule set is read-only (no rule mutates), so the rules report and the operator applies repairs by hand from the per-finding hint.
