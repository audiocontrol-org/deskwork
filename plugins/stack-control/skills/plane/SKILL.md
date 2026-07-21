---
name: plane
description: "Serve the fleet control plane HTTP endpoint, mint host enrollment credentials, and revoke tokens/credentials (stackctl plane serve | issue-enrollment | revoke) — the fleet control plane a single operator's sidecars uplink to (specs/036-fleet-control-plane, specs/037-instance-observability). Wraps `stackctl plane`."
---

# /stack-control:plane

Thin adapter over the `stackctl plane` verb. It fronts the three operator-run
subactions of the fleet control plane: starting the runnable plane HTTP
endpoint, minting a fresh host enrollment credential, and revoking a
telemetry token or an enrollment credential.

> Per `.claude/rules/enforcement-lives-in-skills.md`, this skill body is a thin
> wrapper over `stackctl plane` — it adds no behavior the CLI lacks.

## Transport assumption: always over a tailnet

The plane and every sidecar that uplinks to it are assumed to sit on the same
Tailscale/WireGuard tailnet. The tailnet already encrypts and authenticates
the transport; TLS/mTLS on top of it is out of scope for this verb. `plane
serve` binds plain HTTP — do not expose it beyond the tailnet.

## `serve` — start the plane HTTP endpoint

```bash
stackctl plane serve --port <n>
```

Starts the runnable plane: loads this installation's persisted **fleet
registry** (enrollment credentials, active/revoked tokens, per-instance
bindings) and boots the runtime from it, rooting the durable command store
under the machine-local durable dir. Listens on `--port`. The process stays
alive holding the server open until stopped (Ctrl-C / SIGTERM).

- **No `--token`.** Accepted tokens are no longer provisioned by a CLI flag —
  they come from enrollment (`POST /v1/enroll`), which the registry accrues
  over time as hosts self-enroll.
- **Loopback self-enrollment seed:** on the very first `serve` for this
  installation (the registry has no enrollment credentials yet), the plane
  mints one, registers it in the fleet registry, and writes it into this
  **host's** enrollment custody — the exact credential this host's own
  sidecars read to self-enroll. This is the same path a remote host's
  operator-issued credential takes; there is no privileged shortcut for the
  plane's own host.
- Only `--port` is accepted (an integer in `0..65535`); a missing value, an
  out-of-range port, an unknown flag, or a stray positional is a usage error
  (exit 2).
- `--port 0` binds an ephemeral port; the bound port is printed to stdout on
  startup.

## `issue-enrollment` — mint a host enrollment credential

```bash
stackctl plane issue-enrollment [--label <host>]
```

Mints a fresh enrollment credential, registers it in the fleet registry, and
prints it **once** to stdout — the one secret the operator carries to a
remote host so its sidecar can self-enroll (`sidecar set-enrollment`, below).
Unlike a telemetry token, this credential IS echoed — there is no other
channel for the operator to retrieve it.

- `--label <host>` is optional — an operator-chosen label (e.g. the remote
  host's name) recorded alongside the credential in the registry. Omitted
  labels are recorded as `unlabeled`.
- An unknown flag, a missing `--label` value, or a stray positional is a
  usage error (exit 2).

## `revoke` — revoke a token or an enrollment credential

```bash
stackctl plane revoke (--token <t> | --enrollment <e>)
```

Revokes either a telemetry token (an enrolled instance stops being accepted)
or an enrollment credential (no new host can self-enroll with it). Exactly
one of `--token` / `--enrollment` is required — neither, or both, is a usage
error.

- Like `--token`/`--enrollment`'s value, this is a secret the operator
  already holds (they're revoking it, not retrieving it) — it is never
  echoed back.
- **Restart-effective, not live:** the revocation is written to the fleet
  registry immediately, but a currently-running `plane serve` snapshots its
  accepted set at startup and does not re-read the registry — the revocation
  takes effect at the **next** `plane serve`. Live revocation without a
  restart is a known follow-on, not implemented here.
- Missing both flags, both flags present, a missing value, an unknown flag,
  or a stray positional is a usage error (exit 2).

## Fail-loud cases (exit 2)

- Missing/unrecognized subaction (`serve` | `issue-enrollment` | `revoke` are
  the only three).
- `serve` without `--port`, or with `--port` outside `0..65535`.
- `revoke` with neither `--token` nor `--enrollment`, or with both.
- Any unknown flag or stray positional on any subaction.
