---
name: plane
description: "Provision the fleet control plane's accepted bearer token, or serve the plane HTTP endpoint (stackctl plane provision-token | serve) — the fleet control plane a single operator's sidecars uplink to (specs/036-fleet-control-plane). Wraps `stackctl plane`."
---

# /stack-control:plane

Thin adapter over the `stackctl plane` verb. It fronts the two operator-run
subactions of the fleet control plane (specs/036-fleet-control-plane): placing
the accepted bearer token into an installation's machine-local custody, and
starting the runnable plane HTTP endpoint the fleet's sidecars uplink to.

> Per `.claude/rules/enforcement-lives-in-skills.md`, this skill body is a thin
> wrapper over `stackctl plane` — it adds no behavior the CLI lacks.

## `provision-token` — place the accepted bearer token

```bash
stackctl plane provision-token --token <value>
```

Writes `<value>` into **this installation's** machine-local token custody
(`.stack-control`'s sibling durable dir, 0600, never committed) — the same
credential `plane serve --token` later accepts and every sidecar presents on
its uplink (contracts/sidecar-plane-protocol.md § C6). Provisioning and
rotation are the **same operation**: re-running it overwrites the prior value.

- PT-015 (research.md): a single-operator fleet (FR-078) provisions the token
  by an explicit operator-run verb — no join-code exchange, no automatic
  enrollment.
- **The token is a credential.** This verb never echoes it to stdout/stderr,
  on success or failure — only a confirmation message is printed.
- Revocation is **plane-side** (removing the token from the plane's accepted
  set) — a separate concern this verb does not cover.
- Missing `--token`, an unknown flag, or a stray positional is a usage error
  (exit 2).

## `serve` — start the plane HTTP endpoint

```bash
stackctl plane serve --port <n> --token <accepted-bearer>
```

Starts the runnable plane: seeds its accepted-token set with the single
`--token` mapped to this installation's id, roots the durable command store
under the machine-local durable dir, and listens on `--port`. The process
stays alive holding the server open until stopped (Ctrl-C / SIGTERM).

- Both `--port` (an integer in `0..65535`) and `--token` are required; a
  missing value, an out-of-range port, an unknown flag, or a stray positional
  is a usage error (exit 2).
- `--port 0` binds an ephemeral port; the bound port is printed to stdout on
  startup. The token itself is never echoed.
- **Known seam:** the accepted-token source is a single `--token` — a
  multi-installation fleet needs a per-installation accepted-token registry
  (not yet built); the runtime already accepts a full token map, so widening
  `serve` later is additive, not a rewrite.

## Fail-loud cases (exit 2)

- Missing/unrecognized subaction (`provision-token` | `serve` are the only
  two).
- `provision-token` without `--token`.
- `serve` without `--port` or `--token`, or with `--port` outside
  `0..65535`.
- Any unknown flag or stray positional on either subaction.
