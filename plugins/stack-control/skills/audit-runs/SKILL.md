---
name: audit-runs
description: "Bounded retention for the audit-barrage run dirs under .stack-control/audit-runs (stackctl audit-runs) — list the accumulated run dirs with their sizes, or prune them by keep-last-N or older-than-T-days (dry-run unless --apply). The barrage never deletes its run dirs, so they grow without bound; this is the sanctioned sweep."
---

# /stack-control:audit-runs

Thin adapter over the `stackctl audit-runs` verb (the vendor-neutral core; this skill adds nothing the CLI can't do — it sequences and reports). The audit-barrage persists every run (`PROMPT.md`, `INDEX.md`, per-model output, `stderr/`) under `<install>/.stack-control/audit-runs/<stamp>-<slug>/` as the lift source + manual-triage evidence, and **never deletes them** — they grow without bound (run dirs accumulate to hundreds / hundreds of MB). They are gitignored, so they never pollute git, but they do consume disk. This verb is the sanctioned retention sweep.

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl audit-runs` verb it calls, never in a git hook. The skill travels with the plugin install.

## When to use

- When `.stack-control/audit-runs/` has grown large and you want to reclaim disk after a feature's govern loops have shipped.
- Periodically, to keep only the most recent N runs (the older ones have already been lifted into the audit-log; the run dirs are forensic evidence, not the source of truth).

## List (read-only)

```bash
stackctl audit-runs list
```

Reports the run-dir count, the total size, and each run dir with its size (newest first). Read-only — never deletes.

## Prune (mutating — dry-run by default)

Pick **exactly one** retention rule:

```bash
stackctl audit-runs prune --keep-last 20            # keep the 20 newest, prune the rest
stackctl audit-runs prune --older-than-days 30      # prune anything older than 30 days
```

Both forms are **dry-run by default** — they name the run dirs that would be pruned and the disk they would free, and delete nothing. Add `--apply` to perform the deletion:

```bash
stackctl audit-runs prune --keep-last 20 --apply
```

- A foreign directory (one whose name does not carry the run-dir timestamp grammar) is **never** a prune candidate — only the barrage's own run dirs are touched.
- `--keep-last` and `--older-than-days` are mutually exclusive; pass exactly one (neither/both → exit 2).
- `--at <dir>` resolves the installation enclosing `<dir>` instead of the cwd.

## Exit codes

- `0` — listed, or pruned (including a clean "nothing to prune").
- `1` — fail-loud: run outside any installation.
- `2` — usage error (unknown subaction, missing/both retention flags, bad integer).
