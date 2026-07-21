---
name: sidecar
description: "Elect and run the per-installation sidecar daemon that uplinks telemetry to the fleet control plane and receives commands over SSE, and store an operator-issued enrollment credential for self-enroll (stackctl sidecar run | set-enrollment) — specs/036-fleet-control-plane, specs/037-instance-observability. Wraps `stackctl sidecar`."
---

# /stack-control:sidecar

Thin adapter over the `stackctl sidecar` verb. It fronts the two subactions
of the fleet-control-plane sidecar daemon: the runnable local process that
elects itself for this installation, spools local telemetry, and uplinks to
the fleet control plane; and storing the operator-issued enrollment
credential this host uses to self-enroll.

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
- **Lost election:** writes `sidecar: lost election — pid <n> already elected
  for this installation (<reason>)` to **stderr** (naming the already-elected
  owner when its pid is known) and exits 0 — another sidecar already owns this
  installation. Conceding is the normal, expected outcome (not an error), but it
  is announced rather than silent so a running-but-not-elected process is never
  mistaken for the winner.
- **`--plane-url <url>`** is optional. When omitted, the daemon falls back to
  the `STACKCTL_CP_URL` environment variable. (A config-file `plane.url`
  resolution is a known gap — the installation config-loader does not yet
  parse a `plane` block.)
- **Auto-enrolls when needed.** On startup the daemon resolves its effective
  telemetry token: if a token is already in this installation's custody, it's
  used as-is. If none is in custody but a plane URL resolved AND a host
  enrollment credential is present (from `set-enrollment`, below), the daemon
  self-enrolls (`POST /v1/enroll`) and persists the returned per-instance
  token into custody before uplinking. If neither a custody token nor an
  enrollment credential is available, the uplink stays idle — the local
  socket receiver still runs and spools to the WAL (no crash; "spool now,
  transmit when reachable").
- An unknown flag, a missing `--plane-url` value, or a stray positional is a
  usage error (exit 2).

Every connection this daemon opens is **sidecar-outbound** — commands arrive
over a held-open SSE stream the sidecar itself opens; telemetry leaves via
HTTP POST (contracts/sidecar-plane-protocol.md § C1). The plane can never dial
the sidecar.

## `set-enrollment` — store the enrollment credential

```bash
stackctl sidecar set-enrollment --token <cred>
```

Stores the operator-issued enrollment credential (minted by
[`/stack-control:plane`](../plane/SKILL.md) `issue-enrollment`) into
**host-level** custody — shared across every installation on this host, once
per host. A later `sidecar run` on any installation on this host reads it to
self-enroll. Never echoes the credential value; re-running overwrites the
prior value (provisioning and rotation are the same operation).

- `--token <cred>` is required; a missing value, a missing flag, an unknown
  flag, or a stray positional is a usage error (exit 2).

## Fail-loud cases (exit 2)

- Missing/unrecognized subaction (`run` | `set-enrollment` are the only two).
- `run` with `--plane-url` missing its value.
- `set-enrollment` without `--token`, or with `--token` missing its value.
- Any unknown flag or stray positional on either subaction.
