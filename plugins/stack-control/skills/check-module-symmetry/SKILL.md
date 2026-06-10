---
name: check-module-symmetry
description: "Cross-module fleet matrix of canonical-primitive adoption (stackctl check-module-symmetry) — rows are adopter-manifest conventions, columns are parallel top-level modules; surfaces ✓/⚠/✗/⏳ per cell so partial-adoption gaps across the module fleet are visible; scoped to the enclosing stack-control installation; an empty registry is a clean no-op (exit 0)"
---

# /stack-control:check-module-symmetry

Thin adapter over the `stackctl check-module-symmetry` verb (the vendor-neutral core; this skill adds nothing the CLI can't do — it sequences and reports). Reads the same `<installation>/.stack-control/scope-discovery/adopter-manifests.yaml` that `check-adopters` consumes and produces a fleet matrix: rows = adopter-manifest conventions, columns = parallel top-level modules under the configured module-root. Each cell shows that module's adoption status for that convention, so partial-adoption gaps across the fleet are visible at a glance. Scoped to the codebase you are in (the nearest-enclosing stack-control installation).

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl` verb it calls, never in a git hook. The skill travels with the plugin install.

## Config-activated

An **empty or absent** `adopter-manifests.yaml` makes this a clean no-op: the matrix has zero rows and the verb exits 0.

## Cell glyphs

- `✓ N/N` — every glob-matched file in the module adopts the canonical path (or is exempted).
- `⚠ A/E (H holdout(s))` — partial adoption; `H` files hold out.
- `✗` — the module was targeted by the glob but has zero matched files or zero adopters.
- `⏳ A/E (T tracked)` — only tracked-holdouts remain (deferred-with-an-issue; gate-passing, NOT masked as ✓).
- `—` — the manifest does not target this module (n/a).

## Steps

1. **Run the gate from inside the codebase you want scanned:**

   ```bash
   stackctl check-module-symmetry          # render matrix to stdout
   stackctl check-module-symmetry --write  # also write the committed artifact
   ```

   Useful flags (each validated; an unknown flag exits 2):
   - `--registry <path>` — override the registry (default `<installation>/.stack-control/scope-discovery/adopter-manifests.yaml`).
   - `--root <path>` — override the scan root (default: the resolved installation).
   - `--module-root <path>` — override the module-root the columns are derived from (default `src`).
   - `--artifact <path>` — override the committed artifact path (default `.stack-control/scope-discovery/editor-symmetry.md`).
   - `--quiet` — summary line only.

2. **Read the exit code:** `0` = empty registry OR no ⚠/✗ cells; `1` = at least one ⚠ (partial) or ✗ (missing) cell; `2` = parse / I/O / invalid-args error.

3. **Close gaps** flagged ⚠ / ✗ by running `stackctl check-adopters` for the per-file holdout list and adopting the canonical primitive in those files.

## Notes

- `check-editor-symmetry` is a deprecated alias of this verb, preserved for one release cycle; prefer `check-module-symmetry`.
