---
name: validate-scope-discovery
description: "Run the full scope-discovery adversarial harness suite via vitest"
---

# /dw-lifecycle:validate-scope-discovery

Run the scope-discovery adversarial harness suite end-to-end in a single invocation. Spawns vitest against the `scope-discovery` test pattern under the `@deskwork/plugin-dw-lifecycle` workspace and forwards the exit code verbatim. Identical contract to `npm test -- scope-discovery`; the wrapper exists for discoverability + skill-prose ergonomics, not for re-shaping vitest's output.

## Steps

1. Confirm `@deskwork/plugin-dw-lifecycle` is installed (either as part of the marketplace install, or as the workspace package when running from inside the deskwork repo). The wrapper spawns vitest from the plugin's workspace root.
2. Shell out to the helper:

```
dw-lifecycle validate-scope-discovery [--quiet]
```

The helper:
   - Resolves the plugin's workspace root (three levels above the source file's directory).
   - Spawns `npx vitest run scope-discovery` from that root.
   - Wires the child's stdout / stderr through to the parent terminal so vitest's reporter is the operator-facing output.
   - With `--quiet`, passes `--reporter=dot` for a compact single-line-per-file summary.
   - Forwards vitest's exit code verbatim (0 all-passed, 1 one or more failures or crash, 2 invalid args).

3. Report: the exit code; on failure, vitest's per-test diagnostics are already on stdout / stderr from the child.

## Flags

| Flag | Meaning |
|---|---|
| `--quiet` | Pass `--reporter=dot` to vitest for a compact summary. Default uses vitest's default reporter (per-test detail). |
| `--help` / `-h` | Print help + exit 0. |

## Error handling

- **Vitest binary missing.** Spawn fails; helper exits non-zero with the spawn error. Confirm `npx vitest` resolves in the plugin's workspace.
- **Test failure(s).** Vitest exits 1; the wrapper forwards verbatim. The failing scenarios' diagnostics are on stdout / stderr from vitest's reporter — read those, fix the failing implementation (or update the test if intent has legitimately changed), then re-run.
- **Vitest crash.** Vitest exits 1; the wrapper forwards verbatim. Crash traces are on stderr from the child — typical cause is a syntax error in a test file or an unhandled rejection.
- **Invalid wrapper arg.** Exit 2 with the offending arg and a usage hint.

## When to use

Run validate-scope-discovery as the "did the protocol still hold together?" smoke gate at three moments: (1) after porting / extending any scope-discovery scanner, agent, or wrapper — the gutted-stub self-checks across the suite catch regressions that pass at the unit level but fail at the protocol level; (2) before tagging a release that touches scope-discovery internals — the full suite is the release-blocking smoke; (3) when wiring a new project into the protocol via `/dw-lifecycle:install-scope-discovery` — the suite verifies the plugin's own contract before the project takes a dependency. The wrapper is identical in effect to `npm test -- scope-discovery`; reach for the wrapper from skill prose / scripts / docs where the cross-platform npm-invocation is awkward.
