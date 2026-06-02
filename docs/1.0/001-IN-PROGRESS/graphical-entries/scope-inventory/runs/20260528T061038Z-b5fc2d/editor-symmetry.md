# Cross-module symmetry matrix

Rows are adoption conventions declared in `.dw-lifecycle/scope-discovery/adopter-manifests.yaml`; columns are parallel top-level modules under `src/`. Cells show adoption status: `✓ N/N` = all files in the module matching the manifest glob import the canonical path; `⚠ A/E (H holdout(s))` = partial adoption with `H` files holding out; `✗` = the module was targeted by the glob but has zero matched files or zero adopters; `⏳ A/E (T tracked)` = adopter set has only tracked-holdouts (deferred-but-known migrations, each with a `tracked_holdouts:` entry naming the follow-up issue; gate-passing, NOT masked as ✓); `—` = the manifest does not target this module (n/a).

No adopter-manifest entries are registered yet; the matrix is empty.

Each refactor commit that PROMOTES a primitive to a shared location SHOULD append an entry to `.dw-lifecycle/scope-discovery/adopter-manifests.yaml`. Run `dw-lifecycle check-editor-symmetry --write` to refresh this file from the registry.

