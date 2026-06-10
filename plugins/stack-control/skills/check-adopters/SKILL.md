---
name: check-adopters
description: "Find per-codebase files that should import a canonical primitive but don't (stackctl check-adopters) — walks adopter-manifests.yaml, flags glob-matched files that hold out from the canonical `from` path, honoring exceptions and tracked-holdouts; scoped to the enclosing stack-control installation; an empty or absent registry is a clean no-op (exit 0); --gate-mode exits 1 on holdouts"
---

# /stack-control:check-adopters

Thin adapter over the `stackctl check-adopters` verb (the vendor-neutral core; this skill adds nothing the CLI can't do — it sequences and reports). The dual of anti-patterns: anti-patterns find LEGACY shapes that should be REPLACED; adopter manifests find FILES that should be USING a canonical primitive but aren't. Walks `<installation>/.stack-control/scope-discovery/adopter-manifests.yaml` and, for each manifest entry, finds files matching the entry's `expected_adopters_glob` that do NOT import the canonical `from` path (and are not declared exceptions or tracked-holdouts). Scoped to the codebase you are in (the nearest-enclosing stack-control installation).

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl` verb it calls, never in a git hook. The skill travels with the plugin install.

## Config-activated

An **empty or absent** `adopter-manifests.yaml` makes this a clean no-op: the verb exits 0 and contributes nothing. The check only does work once the registry has at least one actively-enforced manifest entry.

## When to use

- After promoting a primitive to a shared location, to find files still on the old import.
- Before opening a PR, to confirm new files adopted the canonical primitive.
- During `/stack-control:govern --mode implement`.

## Steps

1. **Run the gate from inside the codebase you want scanned:**

   ```bash
   stackctl check-adopters              # informational: prints holdouts, exits 0
   stackctl check-adopters --gate-mode  # exit 1 on any real holdout (pre-commit friendly)
   ```

   Useful flags (each validated; an unknown flag exits 2):
   - `--registry <path>` — override the registry (default `<installation>/.stack-control/scope-discovery/adopter-manifests.yaml`).
   - `--root <path>` — override the scan root (default: the resolved installation).
   - `--json` — machine-readable output for tooling.
   - `--quiet` — summary line only when there are zero real holdouts; the full report still prints when holdouts exist.

2. **Read the exit code:** `0` = empty registry OR no real holdouts OR holdouts without `--gate-mode`; `1` = real holdouts under `--gate-mode`; `2` = parse / I/O / invalid-args error.

3. **Address each holdout** by switching the file to the canonical `from` import. Files genuinely opted-out belong in the manifest's `exceptions:`; deferred-but-known migrations belong in `tracked_holdouts:` with a mandatory tracking issue — those are gate-passing and surfaced in their own section.

## Notes

- Tracked-holdouts pass the gate (they're deferred-with-an-issue), but they're reported separately so the work-to-do count stays visible.
- A consumer importing via ANY of the manifest's `from:` paths counts as an adopter (supports cross-module primitive promotion during a transition).
