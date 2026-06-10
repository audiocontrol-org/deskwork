---
name: scope-export
description: "Emit a previously-produced scope-manifest.yaml to stdout (stackctl scope-export --slug <slug> | --manifest <path>) as raw YAML or --json, resolving the manifest path per-codebase against the enclosing stack-control installation. For downstream consumers (skill prose, CI, operator scripts)."
---

# /stack-control:scope-export

Thin adapter over the `stackctl scope-export` verb. Reads a previously-produced `scope-manifest.yaml` (written by `scope-inventory`) and emits it for downstream consumers that don't want to know the on-disk path. The manifest base root resolves per-codebase to the nearest-enclosing stack-control installation.

## When to use

- A CI pipeline or operator script needs the feature's scope manifest without hardcoding the path.
- You want the manifest as JSON for tooling.

## Steps

1. **Run with a slug (default path) or explicit manifest path:**

   ```bash
   stackctl scope-export --slug <feature-slug>          # raw YAML
   stackctl scope-export --slug <feature-slug> --json   # parsed JSON
   stackctl scope-export --manifest <path>              # explicit path
   ```

   Flags (each validated; unknown → exit 2):
   - `--repo-root <path>` — override the base root (default: enclosing installation).
   - `--at <dir>` — override the installation walk-up start dir.
   - `--quiet` — suppress the informational stderr status line.

2. **Default path:** `docs/1.0/001-IN-PROGRESS/<slug>/scope-manifest.yaml`, relative to the resolved base root.

3. **Exit codes:** `0` = emitted; `2` = invalid args / no install / missing manifest / malformed YAML (when `--json`).

## Notes

- Raw-YAML output preserves comments + ordering; `--json` re-serializes (formatting lost).
