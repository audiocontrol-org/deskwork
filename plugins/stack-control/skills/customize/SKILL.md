---
name: customize
description: "Copy a scope-discovery plugin default into the project override location (stackctl customize scope-discovery <name>) under <installation>/.stack-control/scope-discovery/<name>.ts so the operator can edit it; the runtime resolver then prefers the override over the plugin default — no fork required."
---

# /stack-control:customize

Thin adapter over the `stackctl customize` verb. Copies a scope-discovery plugin default into the project override location so the operator can tailor it; the runtime resolver picks the edited copy automatically (no fork).

## When to use

- You need to tweak a scope-discovery module's behavior for one codebase without forking the plugin.

## Steps

1. **Run with the category + module name:**

   ```bash
   stackctl customize scope-discovery <name>          # copy the default to the override location
   stackctl customize scope-discovery <name> --force  # overwrite an existing override
   stackctl customize scope-discovery <name> --at <dir>
   ```

2. **Where the override lands:** `<installation>/.stack-control/scope-discovery/<name>.ts`. The runtime resolver (`resolveScopeDiscoveryModule`) prefers this override over the plugin default at `plugins/stack-control/src/scope-discovery/<name>.ts`.

3. **Exit codes:** `0` = copied (or skipped when present without `--force`); `2` = invalid args / no install / unknown module / I/O error.

## Notes

- Non-destructive: an existing override is left in place unless `--force`.
- The `override-drift` doctor rule (run via `/stack-control:scope-doctor`) surfaces an advisory when an override diverges substantially from the plugin default — re-read the default and decide whether to converge.
