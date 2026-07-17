# Contract: Local Socket Protocol (CLI ↔ sidecar)

**Feature**: `specs/036-fleet-control-plane` | **Settles**: PT-001, FR-002/003/005/007/010

The interface every `stackctl` invocation uses to emit telemetry. **This is the contract that must never degrade the tool** — every rule below serves that.

## Transport

- **POSIX**: Unix domain socket. **Windows**: named pipe. One Node `net` path API for both.
- **Endpoint** lives in the ephemeral machine-local store (`XDG_RUNTIME_DIR` / `$TMPDIR` / `\\.\pipe\`), keyed `sha256(realpath.native(installationRoot))[0:16]`.
- **Never under the installation root.** UDS paths cap at ~107 usable bytes (Linux) / ~103 (macOS); an installation can be arbitrarily deep. Hashing into a short runtime dir keeps the macOS worst case ~76/103.
- **Authorization is the `0700` parent directory.** Socket mode `0600` is defense-in-depth only — POSIX makes no guarantee about socket-file permissions and BSD-derived systems (macOS) may ignore them.
- **localhost TCP is rejected**: needs a token and port allocation, and is reachable by any local process/user.

## C1 — The CLI never blocks (FR-002/003)

| Condition | Required behavior |
|---|---|
| No sidecar reachable | Connect fails **immediately**. Invocation continues: output, exit code, wall-clock **unchanged**. A sidecar is spawned for *subsequent* invocations. |
| Sidecar up, plane unreachable | CLI **unaffected and never informed**. The sidecar absorbs and spools. |
| Plane hangs | CLI completes at normal speed — **there is no network operation in the interactive path to time out**. |
| Sidecar dies mid-run | Run **continues executing**; retries the local connection **without blocking**; resumes telemetry and commandability when it returns. Reports as **temporarily uncommandable**, never healthy. |

**No timeout constant exists for the CLI path.** A timeout implies waiting; the CLI never waits.

## C2 — The token never crosses this socket

The CLI **never** transmits the bearer token. The sidecar reads it from its own `0600` file.

**Why this is load-bearing, not hygiene:** Windows named pipes get a NULL default DACL that Microsoft documents as granting read access to Everyone and the anonymous account, and libuv does not expose `SECURITY_ATTRIBUTES`. With the token on the wire that is credential disclosure; with the token never sent, it degrades to a low-severity telemetry-visibility note, and pipe-squatting becomes a fail-open non-event.

## C3 — Version handshake (FR-010)

The sidecar outlives the CLI that spawned it, so an upgraded CLI may meet a stale sidecar. First frame carries a protocol version.

- Match → proceed.
- Mismatch → **defined restart path**; the invocation is **never failed** (C1 dominates).

## C4 — Buffering asymmetry (FR-007)

| Caller | Buffer |
|---|---|
| **Long-running commandable run** (`execute`, `govern`) | Small bounded in-memory buffer covering a sidecar restart gap (bound → PT-014) |
| **Short verb** | **None.** Drops on a sidecar-unavailable socket. |

A 200ms process exits long before a sidecar returns; buffering it is ceremony. Long-term durability is the sidecar's job (WAL); this buffer covers only the restart gap.

## C5 — Socket closure is the liveness primitive (FR-025/026/028)

Closure with no preceding end-of-invocation event ⇒ **`abnormally-disconnected`, termination reason unknown**. **Never** "crashed".

**A sidecar restart closes every socket at once while nothing has died.** A sidecar concluding "all my runs crashed" on restart would be maximally wrong at the worst possible moment. Hence the bounded reconciliation window (PT-010): a run that re-announces was never dead; one that does not is presumed gone when the window closes.

## C6 — Spawn (PT-002)

- **Election: bind-wins.** Whoever binds the socket/pipe is the sidecar; `EADDRINUSE` ⇒ someone else won ⇒ loser exits silently. Atomic at the OS level, so the election is authoritative rather than advisory.
- **CLI-side advisory debounce** avoids thundering-herd spawns; it is not the guard.
- **Stale socket:** `ECONNREFUSED` against an existing socket file ⇒ verify liveness by **PID + process start-time** (start-time defeats PID reuse) ⇒ unlink ⇒ re-bind.
- **Spawn flags:** `detached: true`, `stdio: 'ignore'`, `unref()`, **and `windowsHide: true`**.
  - `windowsHide` is **mandatory, not cosmetic**: Node documents that a detached Windows child gets its own console window that cannot be disabled afterward. Every canonical snippet omits it — none of them are about background daemons. Without it, every spawn pops a window.
- **The CLI never waits for the sidecar to become ready.**

## Frames

Newline-delimited JSON. Framing, field names, and the exact version-handshake shape are pinned by RED tests at task time.

| Direction | Frame |
|---|---|
| CLI → sidecar | `hello` (protocol version), `event` (raw, un-redacted — redaction is the sidecar's job), `register-run`, `end-invocation` |
| sidecar → CLI | `hello-ack` (version accept/reject), `command` (to commandable runs only), `ack` |

**Raw events cross this socket by design.** The sidecar is the redaction boundary (FR-047) and redaction precedes spooling (FR-048), so raw data never reaches disk. It does cross a local socket — which C2's "no token" rule and the `0700` parent directory bound.

## Test obligations (RED first)

1. Fail-open: no sidecar ⇒ unchanged output, exit code, wall-clock (SC-001/002).
2. Plane hanging ⇒ CLI at normal speed.
3. Concurrent spawn ⇒ **exactly one** sidecar.
4. Stale socket file ⇒ recovered; PID reuse ⇒ **not** mistaken for a live sidecar.
5. Version mismatch ⇒ restart path fires, invocation **not** failed.
6. Socket closure ⇒ `abnormally-disconnected`, **never** `crashed`.
7. **Sidecar restart with N healthy runs ⇒ 0 false death conclusions** (SC-005).
8. Short verb ⇒ **no** buffer; long run ⇒ buffer covers the restart gap.
9. Token **never** appears in any frame on this socket.

Real sockets and real processes — a mock cannot be cruel. Injected `Clock` + `ProcessProbe` keep timing tests deterministic and fast.
