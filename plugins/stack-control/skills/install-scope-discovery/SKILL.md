---
name: install-scope-discovery
description: "Bootstrap scope-discovery in the enclosing stack-control installation (stackctl install-scope-discovery) — seeds the empty-but-valid clones / anti-patterns / adopter-manifests / deprecation-queue registries, copies the JSON schemas the doctor rules diff against, and creates the scope-discovery config.yaml under <installation>/.stack-control/scope-discovery/. Idempotent + non-destructive."
---

# /stack-control:install-scope-discovery

Thin adapter over the `stackctl install-scope-discovery` verb. Bootstraps the per-codebase scope-discovery config directory under the **nearest-enclosing stack-control installation** (the directory whose `.stack-control/config.yaml` encloses your cwd), or an explicit `--at <dir>` root.

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl` verb it calls, never in a git hook. The skill travels with the plugin install — there is no separate `install-*-hooks` invocation (OQ-6: no hook-install machinery exists).

## When to use

- Once per codebase, before the first `stackctl check-clones` / `scope-summary` / `scope-doctor` run.
- After adopting a new stack-control installation that should run scope-discovery.

## Steps

1. **Run from inside the codebase you want to bootstrap:**

   ```bash
   stackctl install-scope-discovery            # default: enclosing installation
   stackctl install-scope-discovery --at <dir> # explicit installation/scan root
   stackctl install-scope-discovery --dry-run  # plan only; no writes
   stackctl install-scope-discovery --force     # overwrite existing files
   ```

2. **Read the exit code:** `0` = install completed (incl. idempotent no-ops); `2` = invalid args, write failure, or no enclosing `.stack-control` installation (run `stackctl setup` first).

3. **What it writes** under `<installation>/.stack-control/scope-discovery/`:
   - `clones.yaml`, `anti-patterns.yaml`, `adopter-manifests.yaml`, `deprecation-queue.yaml` — empty-but-valid, `schemaVersion: 1`.
   - `config.yaml` — the scope-discovery config (its own `schema_version`, per-agent flags, tunables).
   - `schema/*.schema.json` — the JSON schemas the doctor rules diff against.

## Notes

- Idempotent + non-destructive: re-runs are all-skipped; `--force` overwrites; `--dry-run` writes nothing.
- Writes are scoped to the enclosing installation only — a nested child installation is never touched (cross-installation isolation).
