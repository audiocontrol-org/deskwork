---
name: backlog
description: "Structured slush pile for found-mid-work bugs/gaps, kept deliberately separate from the curated ROADMAP.md. Capture a found bug/gap in ONE move (capture ≠ scope) and return to your task; list the pile; seed it once from open GitHub issues; route audit-barrage parked residuals into it. Triage/inspection delegate to backlog.md's native board/show/cleanup. Wraps `stackctl backlog` (backed by backlog.md)."
---

# /stack-control:backlog

A low-friction, structured **slush pile** for work you trip over mid-task — a bug, a gap, a follow-up that is real but out of the current scope. It is deliberately **separate from the curated `ROADMAP.md`**: the roadmap stays a small, hand-curated DAG; the backlog absorbs the flood of found work so the roadmap never has to.

Unlike `inbox`/`roadmap` (in-tree governed documents), `backlog` is an **external-backend adapter** verb: it shells out to **backlog.md** (the `backlog` binary, pinned in the plugin), which owns the task-file format (git-diffable YAML-frontmatter markdown under `backlog/`) and the native triage/inspection surface. The verb stamps project conventions (type, labels, provenance) and otherwise gets out of the way.

> Per `.claude/rules/enforcement-lives-in-skills.md`, the capture discipline lives in this skill body + the `stackctl backlog` verb — not in a rule or a git hook.

**Which backlog the verb targets:** when `STACKCTL_BACKLOG_DIR` is unset, the verb resolves the enclosing **stack-control installation** — the nearest ancestor with a `.stack-control/config.yaml` — and operates on its configured backlog store (the `backlog` binary runs in the store's parent dir). This is the landing of `design:gap/project-relative-doc-discovery`. Run [`/stack-control:setup`](../setup/SKILL.md) once to create an installation; a missing store is **auto-scaffolded on first use** (announced). Outside any installation the verb **fails loud** directing you to `stackctl setup` (no bundled-copy fallback). `STACKCTL_BACKLOG_DIR` still overrides resolution for an explicit, one-off target.

## The discipline (why this exists)

1. **Capture is instant and one-move.** When you trip over found work mid-task, record it in one command and return to what you were doing. Do **not** stop to triage.
2. **Capture ≠ scope.** A plain capture applies **no priority and no triage** — classifying, prioritizing, and any promotion to `ROADMAP.md` is a separate, later, operator-driven pass. Never let "capture this" expand into "scope this now."
3. **The pile is separate from the roadmap.** No `backlog` action ever writes `ROADMAP.md`. Reviewing the pile never conflates it with the curated roadmap.
4. **One pile, three intake sources.** Ongoing agent `capture`, a one-time GitHub-issue snapshot (`import-github`), and audit-barrage parked residuals (`import-slush` + the rewired `slush-findings`) all feed the **same** pile, which is the single burn-down queue.
5. **Default to capturing.** If unsure whether found work is in scope, capture it and keep going — captures are durable, git-diffable, and cheap; a lost bug is not.

## Capture (one move, mid-task)

```bash
plugins/stack-control/bin/stackctl backlog capture "<title>" \
  --type bug|gap \
  [--ref "<url-or-locator>"] \
  [--body "<detail>"]
```

- `<title>` is required (non-empty); `--type` is required and must be `bug` or `gap`.
- Stamps the project label `agent-found` + a `type:<value>` label (backlog.md has no native type field), records `--ref` if given, and applies **no priority** (capture ≠ scope).
- Exit 0 prints the created item id; an empty title or an invalid `--type` is refused (exit 2) with nothing written; `ROADMAP.md` and every pre-existing item are left byte-for-byte unchanged.

## Review the pile (read-only)

```bash
plugins/stack-control/bin/stackctl backlog list
```

Prints each item's id + status + type and **writes nothing**, presented as a tier distinct from `ROADMAP.md`.

**Triage / detailed inspection are delegated to backlog.md's native commands — NOT re-wrapped** (faithful tool adoption):

```bash
backlog board            # kanban view
backlog task <id> --plain # show one item
backlog cleanup          # archive completed items
```

## Seed from open GitHub issues (one-time, idempotent)

```bash
plugins/stack-control/bin/stackctl backlog import-github          # dry-run: report the would-import set
plugins/stack-control/bin/stackctl backlog import-github --apply  # create one imported-issue item per open issue
```

- Creates one `imported-issue` item per currently-open issue, backlinked `ref=gh-<number>`, carrying the issue's labels + body. GitHub is **never mutated** (read-only snapshot).
- **Idempotent** — re-running skips issues already represented (`gh-<n>`), creating zero duplicates.
- Fail-loud: a missing/unauthenticated `gh` → exit 2 with remediation (run `gh auth login`).

## Route audit-barrage residuals into the pile

When the cross-model audit-barrage convergence loop parks (dampens) a residual MEDIUM/LOW finding, it flows into the backlog instead of living indefinitely as a parked audit-log status. The dampener **decision** stays in governance; only the destination changed.

```bash
# One-time backfill of existing acknowledged-slush-pile entries:
plugins/stack-control/bin/stackctl backlog import-slush --feature <slug>          # dry-run
plugins/stack-control/bin/stackctl backlog import-slush --feature <slug> --apply  # migrate
```

- Each parked finding becomes a `migrated-finding` item (priority from severity; provenance = feature slug + finding id; ref → audit-log entry), and its audit-log entry records `Status: migrated-to-backlog <task-id>` — leaving the audit-log a clean open/fixed ledger.
- **HIGH-severity findings are NEVER slushed/migrated.** Idempotent.
- Ongoing routing happens automatically via `stackctl slush-findings` (the dampener-engaged path now writes backlog items, not `acknowledged-slush-pile`). `--burn-down` is removed — **working the backlog IS the burn-down**.

## Exit codes

- `0` — success / no-op (including a dry-run that wrote nothing).
- `2` — usage error (unknown subaction/flag, missing required value, empty title, invalid type) OR a fail-loud failure: a missing `backlog`/`gh` binary or a non-zero backend exit, with remediation. Never a silent skip or empty success.
