---
name: refresh-clones-baseline
description: "Rewrite clones.yaml from a fresh jscpd run; carries forward operator-curated dispositions"
---

# /dw-lifecycle:refresh-clones-baseline

Rewrite `.dw-lifecycle/scope-discovery/clones.yaml` from a fresh jscpd run. The underlying implementation is `dw-lifecycle detect-clones --refresh-baseline`; this skill is a thin wrapper carving the refresh mode into its own verb for operator ergonomics — the `batch-dispose` unknown-id hint cites this skill as the recovery path, and skill prose / hook docs reference it without operators having to remember the longer incantation. Per audit-log AUDIT-20260525-07 ("Heavy" option) + workplan Phase 6 Task 3.

The refresh is MUTATING — it rewrites the on-disk baseline. Operator-curated dispositions for clone groups that SURVIVE across the refresh (same content-hashed id) are carried forward; groups whose content changes get new ids and re-enter `pending`. The `/dw-lifecycle:check-disposition-survivor` companion gate fires on the resulting commit to catch any silent non-pending → pending transitions (per [#289](https://github.com/audiocontrol-org/deskwork/issues/289)). Per TF-013.

## Steps

1. Confirm the project's `.dw-lifecycle/scope-discovery/clones.yaml` exists. First-time scaffolding goes via `/dw-lifecycle:install-scope-discovery`, which seeds an empty baseline; the first refresh populates it.
2. Shell out to the helper:

```
dw-lifecycle refresh-clones-baseline [--baseline <path>] [--quiet]
```

The helper:
   - Injects `--refresh-baseline` into the forwarded arg list (idempotent — if the flag is already present, it's not duplicated).
   - Dispatches to `detectClones`, which spawns jscpd, parses the output, dedupes groups by content-hashed id, merges dispositions for surviving groups, and writes the rebuilt baseline atomically.
   - `--baseline <path>` overrides the default `.dw-lifecycle/scope-discovery/clones.yaml`.
   - `--quiet` suppresses per-clone output; only the final summary line prints.
   - `--gate-mode` is INTENTIONALLY NOT ACCEPTED — refresh is mutating by definition; gating semantics don't apply (use `/dw-lifecycle:detect-clones` directly if you want the non-refresh gate behavior).

3. Report: the baseline path written, the count of clone groups (new + carried-forward + dropped), and exit code.

## Flags

| Flag | Meaning |
|---|---|
| `--baseline <path>` | Override the clones.yaml path. Defaults to `.dw-lifecycle/scope-discovery/clones.yaml`. |
| `--quiet` | Suppress per-clone output. Summary line still prints. |
| `--help` / `-h` | Print help + exit 0. |

## Error handling

- **jscpd binary missing.** Helper exits 2 with the spawn error. Confirm jscpd is on PATH (it ships as a dev-dep of `@deskwork/plugin-dw-lifecycle`).
- **Malformed existing baseline.** Parse error exits 2. The refresh path needs the existing baseline to merge dispositions; fix or remove the malformed file before re-running.
- **Disk write failure.** Exit 2 with the resolved path. Check directory existence + write permissions.
- **Disposition survivor companion gate.** This skill's WRITE is the input the survivor gate inspects on the next commit. If the refresh silently drops an operator-curated disposition (e.g. because a clone group's content rolled), the survivor gate fires on the commit. Either restore the disposition explicitly via `/dw-lifecycle:batch-dispose`, or pass `--allow-disposition-loss` to `/dw-lifecycle:check-disposition-survivor` if the reversion is intentional. Tracked at [#289](https://github.com/audiocontrol-org/deskwork/issues/289).
- **Refresh produces empty baseline.** Helper writes an empty document; not an error. But a previously-populated baseline that refreshes to empty is suspicious — confirm the scan root + the project layout haven't changed.

## When to use

Run refresh-clones-baseline whenever the project's clone footprint changes substantially: after a large refactor that retires several clone groups; after adding a new top-level module that wasn't scanned before; after upgrading jscpd or changing its detection parameters. Avoid frivolous refreshes — every refresh is an opportunity for content-hash drift to roll an id and re-enter `pending`, requiring re-disposition. The `/dw-lifecycle:check-disposition-survivor` companion gate protects against silent reversion; treat refresh as a deliberate operator action, not a routine background task. Companion to `/dw-lifecycle:batch-dispose` (the recovery verb when refresh introduces new pending groups that need bulk-disposition) and `/dw-lifecycle:detect-clones` (which scans without rewriting the baseline — the gate-mode verb for pre-commit hooks).
