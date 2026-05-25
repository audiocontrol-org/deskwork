---
name: check-editor-symmetry
description: "Cross-module fleet matrix of canonical-primitive adoption across parallel top-level modules"
---

# /dw-lifecycle:check-editor-symmetry

Cross-module symmetry gate. Reads `.dw-lifecycle/scope-discovery/adopter-manifests.yaml` and renders a fleet matrix: ROWS are adopter-manifest conventions, COLUMNS are parallel top-level modules under the configured module-root, CELLS are status glyphs (`✓` full adoption / `⚠` partial / `✗` missing / `—` not applicable). The output answers "is this primitive adopted consistently across every parallel module?" — a question single-file scans like `/dw-lifecycle:check-adopters` can't answer at a glance.

Stdout always emits the rendered markdown table. `--write` additionally persists the artifact to `.dw-lifecycle/scope-discovery/editor-symmetry.md` for committed-doc review.

## Steps

1. Confirm `.dw-lifecycle/scope-discovery/adopter-manifests.yaml` exists with at least one manifest entry. Empty registry exits 0 with no work.
2. Confirm the module-root (defaults to `src/`). The matrix's columns are the top-level subdirectories of this root — typically one column per parallel module / package.
3. Shell out to the helper:

```
dw-lifecycle check-editor-symmetry [--registry <path>] [--root <path>] \
                                   [--module-root <path>] \
                                   [--write] [--artifact <path>] [--quiet]
```

The helper:
   - Reuses `computeMatrix` from `editor-symmetry-matrix.ts` and the renderer from `editor-symmetry-report.ts`.
   - For each row (adopter-manifest entry) × column (module) cell, evaluates adoption status against the entry's `expected_adopters_glob` constrained to that column.
   - Prints the rendered markdown table to stdout.
   - With `--write`, ALSO writes the rendered table to `.dw-lifecycle/scope-discovery/editor-symmetry.md` (or `--artifact <path>`). The pre-commit hook (Phase 8) runs WITHOUT `--write`; operators refresh the artifact ad-hoc when the registry changes.

4. Report: the rows/cols counts, the cell-status tally (✓ / ⚠ / ✗ / —), the artifact path (if written), and exit code.

## Flags

| Flag | Meaning |
|---|---|
| `--registry <path>` | Override the registry path. Defaults to `.dw-lifecycle/scope-discovery/adopter-manifests.yaml`. |
| `--root <path>` | Override the scan root. Defaults to `.`. |
| `--module-root <path>` | Override the module-root (matrix columns). Defaults to `src/`. |
| `--write` | Persist the rendered table to the artifact path. Default behavior prints to stdout only. |
| `--artifact <path>` | Override the artifact path. Defaults to `.dw-lifecycle/scope-discovery/editor-symmetry.md`. |
| `--quiet` | Suppress informational status lines. The matrix table still prints. |

## Error handling

- **Registry missing or empty.** Helper exits 0 with no work — an empty registry is a healthy no-op. Author entries in `adopter-manifests.yaml` to populate the matrix.
- **Malformed YAML.** Parser throws with descriptive keypath; same JSON-Schema-backed contract `check-adopters` uses.
- **Module-root contains no subdirectories.** Helper exits 0 with an empty matrix — the project has no parallel modules to compare. Confirm the `--module-root` is correct.
- **`⚠` or `✗` cell on a row.** Exit 1: at least one column is missing or partially adopting the convention. The matrix is the actionable report; pick the offending cell, fix the module's adoption (add the canonical import) or extend the entry's `exceptions:` list with operator justification.
- **`--write` I/O failure.** Helper exits 2 with the resolved artifact path; check directory existence + write permissions.

## When to use

Run check-editor-symmetry whenever a new canonical primitive is added to `adopter-manifests.yaml` (the matrix immediately shows which parallel modules are aligned and which lag), and as part of `/dw-lifecycle:scope-inventory` Phase 4 activation (the editor-symmetry-scanner agent activates on registry presence and contributes to the `regime_holdouts:` synthesis). Re-run with `--write` to refresh the committed `editor-symmetry.md` artifact after a wave of refactors brings modules into alignment. Pairs with `/dw-lifecycle:check-adopters` (per-file holdout detection, same registry) and `/dw-lifecycle:check-anti-patterns` (legacy-shape detection underneath the canonical-primitive contract).
