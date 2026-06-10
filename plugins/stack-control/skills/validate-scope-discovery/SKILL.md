---
name: validate-scope-discovery
description: "Run the full scope-discovery adversarial harness suite (stackctl validate-scope-discovery) — spawns the local vitest over every src/__tests__/scope-discovery/*.test.ts in the stack-control plugin, including the gutted-stub self-check that proves the dispatch-wrapper gates still have teeth; forwards vitest's exit code"
---

# /stack-control:validate-scope-discovery

Thin adapter over the `stackctl validate-scope-discovery` verb (the vendor-neutral core; this skill adds nothing the CLI can't do — it sequences and reports). Runs the scope-discovery adversarial harness in one invocation: every test under `src/__tests__/scope-discovery/*.test.ts` in the stack-control plugin, via the plugin's LOCAL vitest (resolved by walking up to `node_modules/.bin/vitest`).

The harness includes the dispatch-wrapper gutted-stub self-check — the load-bearing proof that the grammar parser AND the semantic validator are both still wired in. A deliberately-gutted gate makes that self-check FAIL (non-zero exit), which is exactly the regression signal this verb exists to surface.

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl` verb it calls, never in a git hook. The skill travels with the plugin install.

## When to use

- Before opening a PR that touched any scope-discovery module, to confirm the protocol still holds together.
- After editing the dispatch-wrapper grammar, validator, or override loaders.
- As a periodic "are the gates still load-bearing?" check.

## Steps

1. **Run the harness from anywhere inside the plugin workspace:**

   ```bash
   stackctl validate-scope-discovery          # full reporter
   stackctl validate-scope-discovery --quiet  # compact dot reporter
   ```

2. **Read the exit code:** `0` = every scope-discovery scenario passed (gates intact); `1` = one or more scenarios failed, or vitest crashed (a gutted/broken gate trips here); `2` = invalid CLI args.

## Notes

- This verb spawns vitest as a child process; it does NOT run vitest from inside vitest. Run it from a normal shell, not from within a test.
- A failing run that names a gutted-stub self-check means a dispatch-wrapper gate lost its teeth — restore the gate, do not silence the test.
