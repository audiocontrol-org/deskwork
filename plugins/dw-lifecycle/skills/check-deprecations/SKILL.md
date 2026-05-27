---
name: check-deprecations
description: "Informational scan surfacing @deprecated files plus the importers still holding them in place"
---

# /dw-lifecycle:check-deprecations

Informational gate that surfaces "this file is marked `@deprecated`; here are the importers still holding it in place." When the importer count reaches zero, the operator can safely delete the file in the next refactor commit. Default behavior is a soft signal — `0 markers found` is healthy, non-zero importer counts are tracked status, not gate failures.

The scanner walks the source tree for two file-level deprecation markers:

- **JSDoc tag** — `@deprecated [message]` inside the FIRST top-of-file docblock (the canonical form).
- **Inline marker** — `// DEPRECATED: <message>` line comment within the first 20 lines (alternative form).

For each deprecated file, the scanner counts external importers (any TS/TSX file importing the deprecated path via its `@/` alias or a relative path matching its basename). Files with zero importers land in `safe-to-delete`; files with importers land in `blocked` with every importer's `file:line` named.

## Steps

1. Confirm the scan root (defaults to `.`). Override via `--root` when source lives elsewhere.
2. Confirm the module root used to compute `@/` aliases (defaults to `src`). Override via `--module-root` when the project layout diverges (e.g. `modules/<editor>/src` in multi-editor repos).
3. Shell out to the helper:

```
dw-lifecycle check-deprecations [--root <path>] [--module-root <path>] \
                                [--write] [--artifact <path>] [--quiet] [--json]
```

The helper:

- Walks the scan root for `.ts` / `.tsx` files with a file-level deprecation marker.
- Resolves importers for each marker (alias form + basename-relative form, with `.js` / `.ts` / `.tsx` extension shapes all accepted).
- Skips self-imports (a deprecated file's own re-exports do NOT count).
- Renders a markdown report grouping files into `blocked` (importers > 0) and `safe-to-delete` (importers === 0).
- Prints the markdown to stdout (always, unless `--quiet`), followed by a one-line summary (`check-deprecations: N deprecated file(s); B blocked, S safe to delete.`).
- With `--write`, also writes the markdown to `.dw-lifecycle/scope-discovery/deprecation-queue.md` (or `--artifact <path>`).
- With `--json`, emits structured JSON (`{ total, deprecation_count, filesVisited, blocked: [...], safeToDelete: [...] }`) instead of the markdown body.
- Exits 0 on a successful scan regardless of findings; exits 2 only on invalid args or I/O failure.

4. Report the summary line + (when `--write` was passed) the artifact path. Operators consult the rendered markdown to drain the safe-to-delete queue.

## Flags

| Flag | Meaning |
|---|---|
| `--root <path>` | Override the scan root. Defaults to `.`. |
| `--module-root <path>` | Module root used to compute the `@/` alias when resolving importers. Defaults to `src`. |
| `--write` | Persist the rendered markdown to the artifact path. |
| `--artifact <path>` | Override the artifact path. Defaults to `.dw-lifecycle/scope-discovery/deprecation-queue.md`. |
| `--quiet` | Suppress the markdown body; print only the summary line. |
| `--json` | Emit structured JSON instead of text. |

## Error handling

- **Invalid CLI arg.** Helper exits 2 with the offending arg and a usage hint.
- **I/O failure** (unreadable source file, write-artifact failure): exits 2 with a descriptive stderr.

## Output shape

```
# Deprecation queue

_Total: 1 deprecated file(s); 1 blocked; 0 safe to delete._

## Blocked (importers > 0): 1

### `src/legacy/old-helper.ts`

- deprecation: `@deprecated use src/lib/new-helper.ts instead`
- importers: 1
    - `src/consumer.ts:1`

## Safe to delete (importers === 0): 0

_None._
```

## When to use

Run `check-deprecations` as part of refactor-PR triage (the deprecation queue is the actionable list of "what can I delete next?") and as a periodic codebase-health audit (a growing `blocked:` list signals deprecation messages being ignored).

Companion to `/dw-lifecycle:check-anti-patterns` (legacy-shape detection — what should be REPLACED) and `/dw-lifecycle:check-adopters` (canonical-primitive adoption — what should be USING the replacement); check-deprecations answers the third question: "what can be DELETED now?"

## Notes

- The v1 scanner is **file-level only**. Symbol-level deprecations (one `@deprecated` function in a file with many live exports) are out of scope; the scanner exists to drive the "delete this file when importers reach 0" lifecycle.
- The empty `.dw-lifecycle/scope-discovery/deprecation-queue.yaml` seeded by `install-scope-discovery` is a placeholder for a future enhancement that persists scan baselines (mirroring `clones.yaml`). v1 does NOT read it; markers in source are the source of truth.
