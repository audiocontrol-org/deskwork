---
name: check-deprecations
description: "Informational per-codebase scan surfacing @deprecated files plus the importers still holding them in place (stackctl check-deprecations) — splits deprecated files into blocked (importers > 0) and safe-to-delete (importers === 0); scoped to the enclosing stack-control installation; always exits 0 (never blocks on importers)"
---

# /stack-control:check-deprecations

Thin adapter over the `stackctl check-deprecations` verb (the vendor-neutral core; this skill adds nothing the CLI can't do — it sequences and reports). Walks the source tree for file-level `@deprecated` JSDoc tags + inline `// DEPRECATED:` markers, counts remaining importers per deprecated file, and splits the result into **blocked** (importers > 0 — deletion is blocked until every importer migrates) and **safe-to-delete** (importers === 0 — the next refactor commit can remove the file). Scoped to the codebase you are in (the nearest-enclosing stack-control installation).

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl` verb it calls, never in a git hook. The skill travels with the plugin install.

## Informational, never blocks

Unlike the other registry-driven gates, this verb is the **dual** — "someone marked this for deletion; here's who's still holding it in place" — which is information, not a regression to block. It **always exits 0** on a successful scan (exit 2 only on I/O / parse error). The operator drains the queue when ready; the gate's job is to make "ready" observable.

## When to use

- After marking a file `@deprecated`, to see who still imports it.
- Before a deletion-cleanup pass, to find the safe-to-delete queue.
- Periodically, to track which migrations are unblocking.

## Steps

1. **Run the scan from inside the codebase you want scanned:**

   ```bash
   stackctl check-deprecations          # render the queue to stdout + summary line
   stackctl check-deprecations --write  # also write the committed artifact
   stackctl check-deprecations --json   # machine-readable output for tooling
   ```

   Useful flags (each validated; an unknown flag exits 2):
   - `--root <path>` — override the scan root (default: the resolved installation).
   - `--module-root <path>` — module root for the `@/` alias importer detection (default `src`).
   - `--artifact <path>` — override the committed artifact path (default `.stack-control/scope-discovery/deprecation-queue.md`).
   - `--quiet` — summary line only.

2. **Read the output:** the **blocked** section names every remaining importer with `file:line`; the **safe-to-delete** section lists files with zero importers.

3. **Drain the queue:** migrate importers off a blocked file until it drops to safe-to-delete, then remove the file in a refactor commit.

## Notes

- Markers are file-level only (top-of-file JSDoc `@deprecated`, or `// DEPRECATED:` within the first 20 lines). Symbol-level deprecation is out of scope.
- A deprecated file's own internal re-exports / self-references do not count as external importers.
