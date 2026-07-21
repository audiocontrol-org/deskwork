# Fleet multi-host enrollment — live two-host acceptance walkthrough

> **Live execution is an operator step.** This walkthrough requires two real
> hosts on a shared tailnet and cannot be run inside an agent session. The
> checklist below was authored and verified against the current source
> (`plugins/stack-control/src/subcommands/plane.ts`,
> `plugins/stack-control/src/subcommands/sidecar.ts`,
> `plugins/stack-control/skills/plane/SKILL.md`,
> `plugins/stack-control/skills/sidecar/SKILL.md`) and against the design
> record (`docs/superpowers/specs/2026-07-20-fleet-multihost-enrollment-design.md`),
> but **no step has been executed and no result has been observed by the
> agent that wrote it.** The "Results" section at the bottom is a blank
> template for the operator to fill in during the real run.

This is the acceptance test the whole feature exists for (design doc §
Testing approach, "Live dogfood"): a real second host, over a real tailnet,
self-enrolling and appearing in the plane's fleet. Per the project rule "no
test infrastructure in CI," this is hand-run, not automated.

## Prerequisites

- [ ] **Two hosts, same tailnet.** Both hosts join the same Tailscale
      network. Confirm with `tailscale status` on each; note host A's
      tailnet IP (`tailscale ip -4` on host A) — host B will dial it.
- [ ] **Both hosts have a checkout of this repository at the feature branch
      carrying this work** (`feature/fleet-control-plane`), or, once this
      feature has shipped, the installed `stack-control` plugin at a version
      that includes it. Multi-host enrollment is unreleased source as of this
      writing — see `.claude/rules/source-engine-for-stack-control-dev.md`:
      run every command below via **`./bin/stackctl`** from each host's
      `plugins/stack-control/` directory, never a bare `stackctl` on `PATH`
      (that resolves to the last-*published* release and will not contain
      this feature).
- [ ] **Node.js available on both hosts** — `./bin/stackctl`'s bin shim
      first-run-installs its own runtime deps (`tsx`, etc.) into
      `plugins/stack-control/node_modules/` on first invocation.
- [ ] **A fixed working directory per command, per host.** The plane and the
      sidecar both resolve their on-disk state from `process.cwd()` at
      invocation time (`locateMachineState(installationRoot)` — this is the
      "installation root" the fleet-registry / token-custody paths are keyed
      from: `sha256(realpath.native(installationRoot))[0:16]`). Pick one
      directory per role per host (see Conventions below) and always invoke
      `./bin/stackctl` from exactly that directory — running the same
      logical role from two different directories on the same host produces
      two *different* installations, not one.

## Conventions used below

| Placeholder | Meaning |
|---|---|
| Host A | The host running the plane. |
| Host B | The remote host enrolling into the plane. |
| `<hostA-tailnet-ip>` | Host A's tailnet IP address (from `tailscale ip -4`). |
| `47800` | The plane's port for this walkthrough — any free port works; the design doesn't fix one. |
| `~stackctl-A-plane/` | Host A's working directory for the **plane** process — a `plugins/stack-control/` checkout. |
| `~stackctl-A-sidecar/` | Host A's working directory for its **own** sidecar (Step 4) — can be the same checkout as the plane, but keep the distinction explicit; both resolve through the same `plugins/stack-control/bin/stackctl`. |
| `~stackctl-B-1/`, `~stackctl-B-2/` | Host B's two separate checkouts/working directories for its two sidecar instances (Steps 3 and 5). |

Every `./bin/stackctl` invocation below is run from `plugins/stack-control/`
inside the relevant working directory.

---

## Step 1 — Host A: start the plane

```bash
cd ~stackctl-A-plane/plugins/stack-control
./bin/stackctl plane serve --port 47800
```

**Observe:**
- Stdout prints `plane: serving on port 47800`.
- The process **holds the terminal open** (Ctrl-C / SIGTERM to stop) —
  leave this terminal running for the rest of the walkthrough.
- This is the **first** `plane serve` for this installation, so it silently
  seeds a loopback enrollment credential: mints one, adds it to the fleet
  registry, and writes it into host A's **host-level** enrollment custody at
  `<durableBase>/stack-control/enrollment-credential` (shared by every
  installation on host A — `openEnrollmentCustody` /
  `locateHostState().durableDir`, `plane.ts` `buildServeRuntime`). There is
  no separate log line for this seed step; its effect is verified indirectly
  in Step 4 when host A's own sidecar self-enrolls without ever running
  `sidecar set-enrollment`.
  - `<durableBase>` is platform-specific: macOS
    `~/Library/Application Support`; Linux
    `${XDG_STATE_HOME:-~/.local/state}`; Windows `%LOCALAPPDATA%`.

- [ ] **Checked:** plane is up, `serving on port 47800` printed, terminal
      left open.

## Step 2 — Host A: issue an enrollment credential for host B

In a second terminal on host A, same working directory:

```bash
cd ~stackctl-A-plane/plugins/stack-control
./bin/stackctl plane issue-enrollment --label hostB
```

**Observe:**
- Stdout prints two lines:
  ```
  plane: minted enrollment credential (label: hostB)
  <the credential itself, printed once>
  ```
- Copy the credential (second line) — **this is the one secret carried to
  host B.** It is never echoed again after this run.

- [ ] **Checked:** credential printed, copied to a safe place for the next
      step.

## Step 3 — Host B: store the credential and run the sidecar

Copy the credential from Step 2 to host B out-of-band (over the tailnet's
own trust, e.g. an operator-typed paste — this is the one manual secret
transfer in the whole flow).

```bash
cd ~stackctl-B-1/plugins/stack-control
./bin/stackctl sidecar set-enrollment --token <credential-from-step-2>
```

**Observe:** stdout prints exactly `sidecar: enrollment credential stored`
(the credential itself is never echoed back). This writes into host B's
**host-level** enrollment custody — shared by every installation on host B,
so Step 5's second checkout will not need to run this again.

Then, in the same directory:

```bash
STACKCTL_CP_URL=http://<hostA-tailnet-ip>:47800 ./bin/stackctl sidecar run
```

(`--plane-url http://<hostA-tailnet-ip>:47800` works identically — it is the
same value, just passed as a flag instead of the env var; `--plane-url`
takes precedence over `STACKCTL_CP_URL` when both are given.)

**Important:** the plane URL is host A's **tailnet** address, not
`127.0.0.1` — host B is a different machine.

**Observe:**
- Stdout prints `sidecar: elected — listening at <socketPath>` (a won
  election — the normal case for the first sidecar on this installation).
- The daemon self-enrolls silently: it finds no telemetry token yet in its
  own per-installation custody, finds the enrollment credential just stored,
  `POST`s `/v1/enroll`, and persists the returned per-instance token —
  **there is no stdout/stderr line for this exchange** (confirmed against
  `src/sidecar/token-resolution.ts` — the enroll call never logs on success
  or failure by design). The "elected" line above, plus the plane-side check
  in Step 4, are the only externally-visible confirmations.
- Leave this process running.

- [ ] **Checked:** `enrollment credential stored` printed.
- [ ] **Checked:** `sidecar: elected — listening at ...` printed; process
      left running.

## Step 4 — Host A: confirm host B's instance appears in `/v1/instances`

`/v1/instances` requires a valid bearer token (any accepted telemetry token
in the fleet registry — it is not scoped to the caller's own instance). The
only accepted tokens right now are per-instance telemetry tokens minted at
enrollment; there is **no CLI verb that prints one back out** (`sidecar
set-enrollment` stores the *enrollment* credential, not a telemetry token,
and `openTokenCustody` — `src/machine-state/token.ts` — has no read-out
verb). To get a working consumer token without inventing new plumbing, run a
sidecar for one of host A's **own** installations — it self-enrolls off the
loopback credential Step 1 seeded, exactly like host B did — then read that
sidecar's persisted token file directly off disk.

**4a. Run a host-A sidecar** (third terminal on host A):

```bash
cd ~stackctl-A-sidecar/plugins/stack-control
STACKCTL_CP_URL=http://127.0.0.1:47800 ./bin/stackctl sidecar run
```

**Observe:** `sidecar: elected — listening at <socketPath>` (same as Step
3 — this uses `127.0.0.1` because it's on the same host as the plane).
Leave it running.

**4b. Compute this installation's token-file path and read it** (a fourth
terminal on host A, any directory):

```bash
cd ~stackctl-A-sidecar/plugins/stack-control   # the SAME dir 4a was run from
KEY=$(node -e "
const { realpathSync } = require('fs');
const { createHash } = require('crypto');
const root = realpathSync(process.argv[1]);
console.log(createHash('sha256').update(root).digest('hex').slice(0, 16));
" "$(pwd)")
# macOS:
TOKEN_FILE="$HOME/Library/Application Support/stack-control/$KEY/bearer-token"
# Linux, instead:
# TOKEN_FILE="${XDG_STATE_HOME:-$HOME/.local/state}/stack-control/$KEY/bearer-token"
LOCAL_TOKEN=$(cat "$TOKEN_FILE")
echo "$LOCAL_TOKEN"
```

This reproduces `locate.ts`'s `storeKey()` (`sha256(realpath.native(installationRoot))[0:16]`)
and `token.ts`'s `bearer-token` filename exactly — it is not a workaround,
it is reading the same file the daemon itself reads/writes.

- [ ] **Checked:** `$TOKEN_FILE` exists and `$LOCAL_TOKEN` is a non-empty
      string.

**4c. Query `/v1/instances`:**

```bash
curl -s -H "Authorization: Bearer $LOCAL_TOKEN" \
  http://127.0.0.1:47800/v1/instances
```

**Observe:** HTTP `200`, JSON body `{"instances":[...]}` (shape:
`src/plane/http/instance-api.ts`). Confirm the array contains **two**
entries — one for host A's own sidecar (4a) and one for host B's (Step 3),
distinguishable by their `host`/`path` fields.

- [ ] **Checked:** `200` status.
- [ ] **Checked:** response body contains an instance entry for host B
      (matches host B's hostname/checkout path).
- [ ] **Checked:** response body contains an instance entry for host A's own
      sidecar (4a).

**If you want a lighter-weight sanity check before doing 4a–4c:** just watch
the plane's own terminal (Step 1) — nothing is logged per-request today, so
this is only a fallback if `/v1/instances` genuinely cannot be queried; the
curl round-trip above is the actual falsifiable check and should be
preferred.

## Step 5 — Host B: a second instance under the same host credential

Proves "many instances per host, one credential" — no second
`set-enrollment` needed, since Step 3 already stored it at the host level.

```bash
cd ~stackctl-B-2/plugins/stack-control          # a DIFFERENT checkout/dir than Step 3
STACKCTL_CP_URL=http://<hostA-tailnet-ip>:47800 ./bin/stackctl sidecar run
```

**Observe:** `sidecar: elected — listening at <socketPath>` (a second, WON
election — one sidecar per *installation*, and this is a different
installation root than Step 3's).

Re-run Step 4c's curl (same `$LOCAL_TOKEN`, same command):

```bash
curl -s -H "Authorization: Bearer $LOCAL_TOKEN" \
  http://127.0.0.1:47800/v1/instances
```

- [ ] **Checked:** `sidecar: elected` printed for the second checkout.
- [ ] **Checked:** `/v1/instances` now shows **three** entries (host A's own
      + host B's two).

## Step 6 — Negative: a foreign-identity uplink is refused 403

This exact scenario is already covered by the automated, non-mocked (real
`node:http` + real `fetch`) end-to-end test
`tests/fleet/plane-enroll-e2e.test.ts`, test `'the enrolled token is refused
403 for a DIFFERENT identity'` (asserts `expect(bad.status).toBe(403)`).
This step re-confirms it live.

**Primary re-confirmation — run the real test suite live**, from either
host (it spins up its own real plane instance and doesn't touch the
walkthrough's running processes):

```bash
cd plugins/stack-control
npm test -- plane-enroll-e2e
```

- [ ] **Checked:** `plane-enroll-e2e.test.ts` passes, including the
      403 case.

**Optional — reproduce the 403 directly against the live walkthrough plane**,
using host B's real telemetry token from Step 3 but claiming an identity it
was not bound to at enroll time. This needs a full wire-shaped telemetry
envelope (`validateTelemetryEvent` requires every field, not just
`installationId`/`host`/`path` — mirrors `makeRawEvent` in
`plane-enroll-e2e.test.ts`). Run on host B, in the Step 3 directory (so
`$LOCAL_TOKEN`-equivalent below is host B's own token, read the same way as
Step 4b but against host B's own installation dir):

```bash
cd ~stackctl-B-1/plugins/stack-control
HOSTB_TOKEN=<token read from host B's bearer-token custody, same recipe as Step 4b>
EVENT_ID=$(npx tsx -e "import { mintUuidV7 } from './src/fleet/types.js'; console.log(mintUuidV7())")
WALL_CLOCK=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "http://<hostA-tailnet-ip>:47800/v1/ingest" \
  -H "Authorization: Bearer $HOSTB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"envelope\":{\"eventId\":\"$EVENT_ID\",\"installationId\":\"foreign-id\",\"invocationId\":\"invocation-1\",\"runId\":\"r-negative\",\"installationSequence\":1,\"invocationSequence\":1,\"schemaVersion\":1,\"type\":\"run.started\",\"wallClock\":\"$WALL_CLOCK\",\"monotonicOffsetMs\":12,\"classification\":\"durable\",\"host\":\"foreign-host\",\"path\":\"/foreign/path\",\"sessionId\":null},\"snapshot\":{}}"
```

**Observe:** `403`, with a body shaped like (design doc § Problem):
```json
{"error":"forbidden","reason":"installation-mismatch","detail":"a token may only act for its own installation."}
```

- [ ] **Checked (optional):** direct curl returns `403`.

## Cleanup

- [ ] Stop both host-B sidecars (SIGINT in their terminals).
- [ ] Stop host A's own sidecar (4a).
- [ ] Stop the plane (Step 1's terminal).
- [ ] Optionally revoke the issued enrollment credential so it can't mint
      further host-B instances:
      `./bin/stackctl plane revoke --enrollment <credential-from-step-2>`
      — note per the SKILL doc this is **restart-effective, not live**: it
      takes effect at the *next* `plane serve`, not immediately.

---

## Results (operator fills in after the live run)

**Date run:**
**Host A:** (hardware/OS, tailnet IP)
**Host B:** (hardware/OS, tailnet IP)

| Step | Result | Notes |
|---|---|---|
| 1 — plane serve | ☐ pass / ☐ fail | |
| 2 — issue-enrollment | ☐ pass / ☐ fail | |
| 3 — set-enrollment + sidecar run (host B) | ☐ pass / ☐ fail | |
| 4 — `/v1/instances` shows host B | ☐ pass / ☐ fail | |
| 5 — second host-B instance | ☐ pass / ☐ fail | |
| 6 — foreign-identity 403 | ☐ pass / ☐ fail | |

**Deviations from the script (if any):**

**Friction encountered (candidates for `stack-control:backlog` / tooling-feedback):**

---

## Sources verified against

- `plugins/stack-control/skills/plane/SKILL.md`
- `plugins/stack-control/skills/sidecar/SKILL.md`
- `plugins/stack-control/src/subcommands/plane.ts`
- `plugins/stack-control/src/subcommands/sidecar.ts`
- `plugins/stack-control/src/machine-state/locate.ts`
- `plugins/stack-control/src/machine-state/token.ts`
- `plugins/stack-control/src/machine-state/enrollment-custody.ts`
- `plugins/stack-control/src/plane/runtime.ts` (auth guard, bearer parsing)
- `plugins/stack-control/src/plane/runtime-handlers.ts` (`/v1/instances` handler)
- `plugins/stack-control/tests/fleet/plane-enroll-e2e.test.ts` (negative-path test + envelope shape)
- `docs/superpowers/specs/2026-07-20-fleet-multihost-enrollment-design.md`
- `.claude/rules/source-engine-for-stack-control-dev.md`
