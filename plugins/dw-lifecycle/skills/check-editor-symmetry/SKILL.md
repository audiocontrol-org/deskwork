---
name: check-editor-symmetry
description: "Cross-module fleet matrix of canonical-primitive adoption across parallel top-level modules"
---

# /dw-lifecycle:check-editor-symmetry

Cross-module symmetry gate. Reads `.dw-lifecycle/scope-discovery/adopter-manifests.yaml` and renders a fleet matrix: ROWS are adopter-manifest conventions, COLUMNS are parallel top-level modules under the configured module-root, CELLS are status glyphs (`✓` full adoption / `⚠` partial / `✗` missing / `—` not applicable). The output answers "is this primitive adopted consistently across every parallel module?" — a question single-file scans like `/dw-lifecycle:check-adopters` can't answer at a glance.

Stdout always emits the rendered markdown table. `--write` additionally persists the artifact to `.dw-lifecycle/scope-discovery/editor-symmetry.md` for committed-doc review.

## This is the REGISTERED-PATTERN inventory check

`check-editor-symmetry` is a pure **inventory** verb — it matches against the catalog the operator (or `install-seed`) authored in `adopter-manifests.yaml`. A green matrix (all rows showing `✓` across every module column) means "no parallel-module symmetry breakages against the things you registered." It says nothing about cross-module patterns the catalog doesn't yet describe (e.g. a sibling-shared pattern that lives in every module's source but doesn't yet have a registered canonical primitive).

To find NOVEL cross-module asymmetries (per-module shapes that diverge from siblings without being covered by a registered canonical primitive), run `/dw-lifecycle:scope-inventory <slug>` — the discovery layer's outlier handler can surface modules whose shape distribution differs from sibling-module centroids, and the synthesis-layer clustering pass can group those into `discovered_candidates:`. Authoring an adopter-manifest entry for a freshly-discovered cross-module pattern promotes it from "discovered candidate" to "registered convention" the next check-editor-symmetry run will track.

Cell-status results carried into the synthesized manifest (the regime-holdout-detector's `editor-symmetry` source bucket) inherit `status_provenance` from the underlying adopter-manifest entry — `blessed` / `cursed` source-status + `operator-authored` / `install-seed` provenance-source. Novel-candidate signals appear via the discovery handlers in `scope-inventory`, not here. See [`discovery-agents/README.md`](../../src/scope-discovery/discovery-agents/README.md) (in the plugin source) for the full agent fleet split.

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

**When a green matrix is NOT enough.** If parallel modules are suspected to be diverging on a shape that isn't yet registered as a canonical primitive, check-editor-symmetry will NOT detect it — by design. Run `/dw-lifecycle:scope-inventory <slug>` to invoke the discovery layer; the outlier handler will surface per-module shape distributions, and the synthesis layer will cluster sibling-divergent patterns into `discovered_candidates:`. Promote the cluster into `adopter-manifests.yaml` (status: `blessed`) and re-run check-editor-symmetry to track it.
