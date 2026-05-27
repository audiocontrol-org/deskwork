---
name: check-clones
description: "Run the jscpd-backed clone detector against the project; surface NEW clone groups against the committed baseline"
---

# /dw-lifecycle:check-clones

Walks the project's source tree with `jscpd` (configured via `.jscpd.json` at the repo root), compares the detected clone groups against the committed baseline at `.dw-lifecycle/scope-discovery/clones.yaml`, and reports NEW + DROPPED groups since the baseline. Exits 1 when at least one NEW clone group surfaces (the hook-friendly contract); exits 0 otherwise; exits 2 on I/O / parse / jscpd-crash error.

## Backward-compat alias

This skill was renamed from `/dw-lifecycle:detect-clones` to `/dw-lifecycle:check-clones` per the Phase 6 Task 2 verb-naming pass (canonical name aligns with the other `check-*` gate verbs). The legacy subcommand name is preserved as a forever-back-compat alias — pre-commit hooks installed by earlier versions of `install-scope-discovery-hooks` continue to invoke `dw-lifecycle detect-clones --gate-mode` without modification. New installations emit `dw-lifecycle check-clones --gate-mode`. To migrate an existing hook, re-run `/dw-lifecycle:install-scope-discovery-hooks --replace`.

## Steps

1. Confirm the project's `.dw-lifecycle/scope-discovery/clones.yaml` exists. First-time scaffolding goes via `/dw-lifecycle:install-scope-discovery`, which seeds an empty baseline; the first check-clones run with `--refresh-baseline` populates it.
2. Shell out to the helper:

```
dw-lifecycle check-clones [--root <path>] [--quiet] [--json] \
                          [--baseline <path>] [--refresh-baseline] \
                          [--diff] [--gate-mode]
```

The helper:
   - Spawns `jscpd` with the project's `.jscpd.json` config (or the project default if the file is absent).
   - Parses the JSON report into stable, content-hashed clone-group records.
   - Loads the baseline at `--baseline` (default `.dw-lifecycle/scope-discovery/clones.yaml`); refuses to silently overwrite a malformed-but-present baseline (AUDIT-20260524-14).
   - Computes the diff: `newGroups` (in detected, not in baseline) + `droppedGroups` (in baseline, not in detected).
   - Default mode: prints the human-readable headline + per-group block with paste-ready `dw-lifecycle batch-dispose ...` hints for each NEW group; exits 1 if any NEW groups exist, else 0.
   - `--refresh-baseline`: rewrites the baseline atomically, carrying forward operator-curated dispositions for surviving groups; emits the `summary: N dropped, M new (net X)` line and exits 0.
   - `--diff`: prints only NEW + DROPPED group sections (strict subset of default output); useful for CI diff jobs.
   - `--json`: emits structured output instead of human text.
   - `--gate-mode`: accepted for symmetry with the other `check-*` verbs; no-op in effect (check-clones already exits 1 on NEW groups by default — the hook contract).

3. Report: the resolved baseline path, the headline group counts (total / NEW / DROPPED), and any baseline-write summary.

## Flags

| Flag | Meaning |
|---|---|
| `--root <path>` | Override `.jscpd.json`'s `path:` field. Default: read from config. |
| `--quiet` | Suppress per-clone output; print the headline summary + exit. |
| `--json` | Emit JSON instead of human text. |
| `--baseline <path>` | Override the clones.yaml path. Defaults to `.dw-lifecycle/scope-discovery/clones.yaml`. |
| `--refresh-baseline` | Rewrite the baseline from this run, preserving operator-authored dispositions for surviving groups. See also `/dw-lifecycle:refresh-clones-baseline` (the ergonomic verb that injects this flag). |
| `--diff` | Print only NEW + DROPPED group sections; the full per-group listing is omitted. |
| `--gate-mode` | No-op for `check-clones` (it's already gate-by-default). Accepted for symmetry with the other `check-*` verbs. |

## Error handling

- **jscpd binary missing.** Helper exits 2 with the spawn error. Confirm jscpd is on PATH (it ships as a dependency of `@deskwork/plugin-dw-lifecycle`).
- **Malformed baseline.** Parse error exits 2 — the detector refuses to silently overwrite operator-curated dispositions. Hand-fix the YAML and re-run, OR explicitly remove the file to regenerate from scratch.
- **First-run.** Baseline missing on disk causes the detector to write the initial baseline with every detected group at `disposition: pending` and exit 0. The first commit thereafter should include the populated `clones.yaml`.
- **NEW clone groups.** Default + `--gate-mode` exit 1 with the per-group block printed; each NEW group includes a paste-ready `dw-lifecycle batch-dispose ...` hint. The operator triages via `/dw-lifecycle:dispose-clone` (single id) or `/dw-lifecycle:batch-dispose` (multiple ids with a shared disposition).

## When to use

Run check-clones manually when triaging the project's clone footprint, validating a refactor commit, or producing a paste-ready hint set for a batch disposition. The pre-commit hook installed by `/dw-lifecycle:install-scope-discovery-hooks` runs the same verb with `--gate-mode` on every commit, so the manual invocation is mostly for triage / one-off audits.

Pairs with `/dw-lifecycle:dispose-clone`, `/dw-lifecycle:batch-dispose`, `/dw-lifecycle:check-disposition-survivor`, and `/dw-lifecycle:refresh-clones-baseline`. The clone-detector's output cites these verbs as the next-step actions; the skills are composable per the UNIX-style design.
