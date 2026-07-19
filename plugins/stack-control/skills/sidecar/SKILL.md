---
name: sidecar
description: "Elect and run the per-installation sidecar daemon that uplinks telemetry to the fleet control plane and receives commands over SSE (stackctl sidecar run) — specs/036-fleet-control-plane. Wraps `stackctl sidecar`."
---

# /stack-control:sidecar

Thin adapter over the `stackctl sidecar` verb. It fronts the one subaction of
the fleet-control-plane sidecar daemon (specs/036-fleet-control-plane): the
runnable local process that elects itself for this installation, spools local
telemetry, and uplinks to the fleet control plane.

> Per `.claude/rules/enforcement-lives-in-skills.md`, this skill body is a thin
> wrapper over `stackctl sidecar` — it adds no behavior the CLI lacks.

## `run` — elect + run the sidecar daemon

```bash
stackctl sidecar run [--plane-url <url>]
```

Elects the sidecar for the current installation via the bind-wins local-socket
protocol (contracts/local-socket-protocol.md § C6) and, on a **WON** election,
stays alive holding the local socket + the plane uplink open until SIGINT/
SIGTERM, then stops gracefully. Only one sidecar can be elected per
installation at a time.

- **Won election:** prints `sidecar: elected — listening at <socketPath>` and
  blocks until a stop signal.
- **Lost election:** exits silently (exit 0) — another sidecar is already
  elected for this installation; this is the normal, expected outcome, not an
  error.
- **`--plane-url <url>`** is optional. When omitted, the daemon falls back to
  the `STACKCTL_CP_URL` environment variable. (A config-file `plane.url`
  resolution is a known gap — the installation config-loader does not yet
  parse a `plane` block.)
- An unknown flag, a missing `--plane-url` value, or a stray positional is a
  usage error (exit 2).

Every connection this daemon opens is **sidecar-outbound** — commands arrive
over a held-open SSE stream the sidecar itself opens; telemetry leaves via
HTTP POST (contracts/sidecar-plane-protocol.md § C1). The plane can never dial
the sidecar.

## Provisioning the credential

The sidecar authenticates to the plane with a bearer token. See
[`/stack-control:plane`](../plane/SKILL.md) `provision-token` for placing that
token into this installation's machine-local custody before running `sidecar
run` against a plane that enforces auth.

## Fail-loud cases (exit 2)

- Missing/unrecognized subaction (`run` is the only one).
- `--plane-url` with a missing value.
- Any unknown flag or stray positional.
