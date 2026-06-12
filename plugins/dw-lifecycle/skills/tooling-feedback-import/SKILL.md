---

> **RETIRED.** `dw-lifecycle` has been superseded by `stack-control`. This skill is preserved for historical reference only and is no longer maintained. Use [stack-control](../../../stack-control/) skills instead.

# /dw-lifecycle:tooling-feedback-import

Close the dogfood-feedback loop: walk every `docs/<v>/001-IN-PROGRESS/<slug>/tooling-feedback.md` (or one named feature when `--slug` is given), find TF entries with closure-marked status (`addressed-<sha>`, `superseded-by-<TF-NN>`, or `verified-<date>`), and promote them into the scope-discovery audit-log as `AUDIT-<YYYYMMDD>-<NN>` entries. Each promoted entry cross-references back to the source TF entry; the TF entry gains an `imported-as: AUDIT-<id>` watermark so the workflow is idempotent.

The default mode is dry-run — the skill prints what it would import without writing. Use `--apply` to perform the writes.

## Steps

1. Confirm the target feature(s). Default: all in-progress features under `docs/<v>/001-IN-PROGRESS/`. Optional: `--slug <name>` restricts to one feature.

2. Run a dry-run pass first so you can sanity-check the intended imports before they're written:

```
dw-lifecycle tooling-feedback-import [--slug <slug>] [--quiet]
```

3. Review the dry-run report on stderr. Each line names the TF entry, its feature slug, the audit-id it would receive, and its literal closure status.

4. Apply the imports:

```
dw-lifecycle tooling-feedback-import --apply [--slug <slug>] [--quiet]
```

5. Verify both sides:
   - the audit-log gains one `AUDIT-<YYYYMMDD>-<NN>` entry per promoted TF
   - each TF entry gains an `imported-as: AUDIT-<id>` line directly before its `**Status:**` line
   - re-running the skill is a no-op (the watermark is the idempotency check)

## Flags

| Flag | Meaning |
|---|---|
| `--slug <slug>` | Restrict to one feature's tooling-feedback.md. Default: scan every in-progress feature. |
| `--apply` | Perform the writes. Default is dry-run; nothing is written without `--apply`. |
| `--dry-run` | Explicit dry-run. Default behavior; the flag exists for symmetry. Mutually exclusive with `--apply`. |
| `--repo-root <path>` | Override the repo root. Default: cwd. |
| `--audit-log <path>` | Override the audit-log path. Default: `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md`. |
| `--today <YYYYMMDD>` | Override "today" for deterministic numbering — useful for audits filed against a specific historical date. |
| `--quiet` | Suppress the informational stderr summary. |

## Closure-status grammar

The status line must look like one of:

| Pattern | Meaning |
|---|---|
| `**Status:** addressed-<sha>` | A fix landed in commit `<sha>` (7–40 hex chars). |
| `**Status:** superseded-by-TF-<NN>` | The entry was rolled into a later TF entry. |
| `**Status:** verified-<date>` | The fix was re-exercised post-release. `<date>` is either `YYYY-MM-DD` or `YYYYMMDD`. |

Open entries (no closure marker) are NOT imported. They stay in the TF log until they reach closure.

## Numbering

`AUDIT-<YYYYMMDD>-<NN>` is sequential per-date. The skill reads the audit-log to find the highest `<NN>` already used for today's date, then numbers the new entries starting at `<NN>+1`. This is safe to run multiple times per day — the counter advances without colliding.

## Idempotency

After a successful `--apply`, each promoted TF entry carries an `imported-as: AUDIT-<id>` line. The skill skips entries that already carry this watermark on subsequent runs. The audit-log is never duplicated.

## Error handling

- **Audit-log missing.** Exit 2 with the resolved path in the error message. Run `/dw-lifecycle:setup` (or check the feature workplan's audit-log path) so the file exists.
- **Unknown TF status format.** The entry stays open; the skill skips it. Use the grammar above; freeform status text is intentionally NOT recognized.
- **--apply + --dry-run together.** Exit 2 with a usage hint — they're mutually exclusive.

## When to use

Reach for tooling-feedback-import when:
- A friction entry's fix lands in a commit and you're updating the TF entry to `**Status:** addressed-<sha>`.
- A TF entry is superseded by a later one and you want both visible in the audit-log lineage.
- Post-release verification confirms a fix and the TF entry is updated to `**Status:** verified-<date>`.

Pairs with `/dw-lifecycle:doctor` — the `tooling-feedback-stale` rule surfaces TF entries that have been open longer than the configured threshold (default 14 days). When the doctor fires, the next step is typically `/dw-lifecycle:tooling-feedback-import --apply` (if the entry has reached closure) or operator triage on the TF entry (if it hasn't).
