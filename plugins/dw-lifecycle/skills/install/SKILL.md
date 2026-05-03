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

Review the emitted config JSON with the operator, then run:

```
dw-lifecycle install <project-root>
```

The helper writes `.dw-lifecycle/config.json` with the previewed values.

6. Report: config path, which fields were detected vs. defaulted, peer-plugin status (run `dw-lifecycle doctor` to surface).

## Error handling

- **Config already exists.** Surface path and stop. No overwrite.
- **Not a git repository.** Surface the error from `git rev-parse`. dw-lifecycle requires a git repo.
- **No GitHub remote.** Skill warns; config gets written with `tracking.platform: "github"` but operator must update remote before `/dw-lifecycle:issues` can run.
