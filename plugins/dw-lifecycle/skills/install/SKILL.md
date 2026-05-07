---
name: install
description: "Bootstrap dw-lifecycle in a host project: probe structure, write .dw-lifecycle/config.json"
---

# /dw-lifecycle:install

Bootstrap dw-lifecycle in a host project. The helper currently probes only the docs-version layout (`docs/<version>/<status>/...`), previews the resulting config with `--dry-run`, then writes `.dw-lifecycle/config.json`.

This is a Phase-0 skill — every other dw-lifecycle skill assumes the config exists.

## Steps

1. Resolve the project root (default: current working directory).
2. Refuse to run if `.dw-lifecycle/config.json` already exists; surface the existing config path and stop.
3. Probe the project:
   - Detect `docs/<version>/<status>/<slug>/` shape if present (set `docs.byVersion: true` and seed `knownVersions`)
   - Keep the remaining fields at their helper defaults for this release (`branches.prefix`, `worktrees.naming`, `journal.path`, `tracking.platform`)
4. Preview the helper output with the operator. `--dry-run` is the current confirm surface.
5. Invoke the helper:

```
dw-lifecycle install <project-root> --dry-run
```

Review the emitted config JSON with the operator. If the probed defaults don't match the host project's conventions (different status-directory names, different known-version list, custom worktree naming, etc.), pass `--config-overlay <path>` with a JSON file whose fields are deep-merged onto the probed config:

```jsonc
// /tmp/dw-overlay.json
{
  "docs": {
    "statusDirs": { "waiting": "002-BLOCKED" },
    "knownVersions": ["1.0", "2.0"]
  },
  "worktrees": { "naming": "<repo>-feat-<slug>" }
}
```

```
dw-lifecycle install <project-root> --config-overlay /tmp/dw-overlay.json --dry-run
dw-lifecycle install <project-root> --config-overlay /tmp/dw-overlay.json
```

The overlay's plain-object keys recurse; arrays and primitives replace wholesale. The merged config is then validated like any other input.

If no overlay is needed, run:

```
dw-lifecycle install <project-root>
```

The helper writes `.dw-lifecycle/config.json` with the resolved values.

6. Report: config path, which fields were detected vs. defaulted vs. overlaid, peer-plugin status (run `dw-lifecycle doctor` to surface).

## Error handling

- **Config already exists.** Surface path and stop. No overwrite.
- **Not a git repository.** Surface the error from `git rev-parse`. dw-lifecycle requires a git repo.
- **No GitHub remote.** Skill warns; config gets written with `tracking.platform: "github"` but operator must update remote before `/dw-lifecycle:issues` can run.
