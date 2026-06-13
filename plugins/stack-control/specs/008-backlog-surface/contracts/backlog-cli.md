# Contract: `stackctl backlog` verb

The capture + intake surface for the backlog slush pile. Unlike `inbox`/`roadmap` (in-tree `document-model`), `backlog` is an **external-backend adapter** verb: it shells to the `backlog.md` CLI (`backlog` binary), which owns the task-file format and native triage/inspection. The verb stamps project conventions (type, labels) and delegates.

Conventions: imports are **dry-run by default, `--apply` to write**; exit `0` success/no-op, `2` usage-or-fatal. **Fail-loud (Principle V)**: a missing `backlog` or `gh` binary, or a non-zero backend exit, raises a descriptive error naming the dependency + remediation — never a silent skip, fallback, or empty success.

## `backlog capture <title> --type <bug|gap> [options]`

Capture found work in one move. Does NOT triage (capture ≠ scope).

```
stackctl backlog capture "<title>" \
  --type bug|gap \
  [--ref "<url-or-locator>"] \
  [--body "<detail>"]
```

- **Args**: `<title>` (required, positional, non-empty).
- **Required flag**: `--type` ∈ {`bug`, `gap`}.
- **Behavior**: creates a backlog item via the adapter, stamping the project label (`agent-found`) + the type; records `--ref` if given. No priority/triage is applied.
- **Exit 0**: prints the created item id.
- **Exit 2**: missing/empty `<title>`; missing/invalid `--type`; backend or dependency failure (with remediation).
- **Invariant**: `ROADMAP.md` and all pre-existing backlog items are left unchanged (FR-004, FR-006).

## `backlog list`

Read-only. Lists captured items (id + status + type) for review as a tier distinct from the roadmap. Writes nothing.

- **Exit 0**: prints the items.
- **Exit 2**: backend/dependency failure.
- Detailed inspection + triage are delegated to backlog.md native commands (NOT re-wrapped): `backlog board`, `backlog show <id>`, `backlog cleanup`.

## `backlog import-github [--apply]`

One-time, idempotent snapshot of currently-open GitHub issues into the pile. GitHub is **never mutated**.

```
stackctl backlog import-github            # dry-run: report what would be imported
stackctl backlog import-github --apply    # create items
```

- **Behavior**: reads `gh issue list --json number,title,body,labels,url`; creates one item per open issue with `type=imported-issue`, `ref=gh-<number>`, carried labels, and the issue body. Implemented in `tsx` (not a shell pipeline) so `#`/markdown control chars in bodies are safe (FR-015).
- **Idempotent**: an issue whose `gh-<number>` ref already exists is skipped — re-run creates zero duplicates (FR-012).
- **Exit 0**: dry-run prints the would-import set (writes nothing); `--apply` prints created/skipped counts.
- **Exit 2**: `gh` missing/unauthenticated, or backend failure (with remediation). No partial-success masking.
- **Invariant**: no GitHub mutation (no close, label change, or comment) — FR-010.

## `backlog import-slush [--feature <slug>] [--apply]`

One-time backfill of existing `acknowledged-slush-pile-*` audit-log entries into the pile (FR-021).

- **Behavior**: reads the feature's `audit-log.md`, finds parked entries, creates one `migrated-finding` item each (severity→priority, provenance + audit-log ref), and records `migrated-to-backlog <task-id>` on the audit-log entry.
- **Idempotent**: entries already carrying `migrated-to-backlog` are skipped.
- **Exit 0**: dry-run reports the set; `--apply` writes items + audit-log dispositions.
- **Exit 2**: feature/audit-log not found; backend failure.

## Ongoing slush routing (the `slush-findings` rewire — not a `backlog` subaction)

`stackctl slush-findings` keeps its dampener DECISION; only the destination of a parked flip changes (FR-016/FR-017):

- Parked MEDIUM/LOW finding → a `migrated-finding` backlog item (severity→priority; provenance = feature slug + barrage finding id; ref → audit-log entry).
- The audit-log entry records `migrated-to-backlog <task-id>` instead of `acknowledged-slush-pile-<date>`.
- HIGHs are **never** parked (unchanged, FR-018).
- `--burn-down` is **removed** — the backlog IS the burn-down queue (FR-022).

## Invariants (asserted by tests)

- **Fail-loud.** Missing `backlog`/`gh` binary or non-zero backend exit → descriptive error + non-zero exit; never a silent no-op or empty success (FR-023/024).
- **Imports are idempotent.** Re-running `import-github` / `import-slush` creates zero duplicates (FR-012/FR-021).
- **Dry-run writes nothing.** `import-*` without `--apply` makes no changes.
- **GitHub is read-only.** `import-github` never mutates GitHub (FR-010).
- **Roadmap untouched.** No `backlog` subaction writes `ROADMAP.md` (FR-004, FR-025).
- **HIGHs never slushed.** The rewire preserves the existing invariant (FR-018).
- **Real-binary integration.** Adapter/import tests spawn the real `backlog` binary against tmp fixtures (never mock the filesystem).
