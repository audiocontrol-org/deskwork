---
name: check-deprecations
description: "Informational scan surfacing @deprecated files plus the importers still holding them in place"
---

# /dw-lifecycle:check-deprecations

Informational gate that surfaces "this file is marked `@deprecated`; here are the importers still holding it in place." When the importer count reaches zero, the operator can safely delete the file in the next refactor commit. Default behavior is a soft signal — `0 markers found` is healthy, non-zero importer counts are tracked status, not gate failures.

**Status (v1): SUBCOMMAND SHELL ONLY.** The underlying deprecation-scan port from the audiocontrol pilot is tracked at [#287](https://github.com/audiocontrol-org/deskwork/issues/287) and is NOT shipped in this version. Until that lands, the subcommand validates its flags, reports an empty registry (`0 deprecated files, 0 blocked, 0 safe-to-delete`), and exits 0. The shell lets operators wire the verb into their tooling NOW (skill prose, hook scaffolds, documentation) without blocking on the full scan port; when #287 lands the scan logic back-fills without changing the CLI contract.

## Steps

1. Confirm the scan root (defaults to `.`). Override via `--root` when source lives elsewhere. Pre-#287: `--root` is accepted as a no-op so adopter wiring is forward-compatible.
2. Shell out to the helper:

```
dw-lifecycle check-deprecations [--root <path>] [--write] \
                                [--artifact <path>] [--quiet] [--json]
```

The helper (pre-#287 behavior):
   - Prints a one-line empty-registry status to stdout citing #287 for context.
   - With `--quiet`, suppresses the status line entirely.
   - With `--json`, emits `{ "blocked": [], "safeToDelete": [], "deprecation_count": 0 }`.
   - Exits 0 unconditionally (informational gate; "0 markers" is not a failure).

Post-#287 (when the scan port lands): walks the scan root for files declaring `@deprecated`, computes the importer set per file, classifies as `blocked` (importers > 0) or `safeToDelete` (importers === 0), and surfaces both lists. `--write` will additionally render markdown to `docs/scope-discovery/deprecation-queue.md` (or `--artifact <path>`).

3. Report: the registry-empty status line (or, post-#287, the deprecation count + blocked / safe-to-delete tally), and exit code.

## Flags

| Flag | Meaning |
|---|---|
| `--root <path>` | (No-op until #287) Override the scan root. Defaults to `.`. |
| `--write` | (No-op until #287) Persist the rendered markdown to the artifact path. |
| `--artifact <path>` | (No-op until #287) Override the artifact path. Defaults to `docs/scope-discovery/deprecation-queue.md`. |
| `--quiet` | Suppress the empty-registry status line. |
| `--json` | Emit structured JSON instead of text. |

## Error handling

- **Invalid CLI arg.** Helper exits 2 with the offending arg and a usage hint.
- **Pre-#287: any other failure.** None expected — the v1 shell only validates flags + prints a status line; it does no I/O beyond stdout.
- **Post-#287: scan failures.** Tracked at [#287](https://github.com/audiocontrol-org/deskwork/issues/287); the deferral rationale + scan-port plan live there. Operators tracking that issue's resolution will receive updated error-handling guidance when the port lands.

## When to use

Pre-#287: include the verb in skill prose, documentation, and hook scaffolds — its empty-registry happy path is intentionally forward-compatible so the wiring doesn't need to change when the scan ports. Post-#287: run check-deprecations as part of refactor-PR triage (the deprecation queue is the actionable list of "what can I delete next?") and as a periodic codebase-health audit (a growing `blocked:` list is a signal that deprecation messages are being ignored). Companion to `/dw-lifecycle:check-anti-patterns` (legacy-shape detection — what should be REPLACED) and `/dw-lifecycle:check-adopters` (canonical-primitive adoption — what should be USING the replacement); check-deprecations answers the third question: "what can be DELETED now?"
