---
name: check-disposition-survivor
description: "Pre-commit-style gate that fails when an operator-curated clone disposition (keep-with-reason / refactor / ignore-with-justification) silently reverts to pending in the working tree (stackctl check-disposition-survivor) — compares HEAD's clones.yaml against the working tree and refuses the silent loss unless --allow-disposition-loss"
---

# /stack-control:check-disposition-survivor

Thin adapter over the `stackctl check-disposition-survivor` verb. It is the architectural floor that catches the SILENT loss path: a clone group whose id stays the same but whose operator-curated disposition reverts to `pending`. The detector's regen path can wipe dispositions in failure modes the unit-level merge contract doesn't catch; this gate ensures such a destructive diff can never reach a commit without an explicit operator override.

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl` verb it calls, never in a git hook. An adopter who wants this as a hard pre-commit gate wires the verb into their own `.husky/pre-commit` — the plugin gives you the verb; the wiring is your project's call.

## When to use

- Before committing a clones.yaml change, to confirm no disposition silently reverted to `pending`.
- After a `refresh-clones-baseline` run, as a belt-and-suspenders check that the refresh carried dispositions forward.

## Steps

1. **Run from inside the codebase, with the working-tree clones.yaml modified but not yet committed:**

   ```bash
   stackctl check-disposition-survivor
   stackctl check-disposition-survivor --allow-disposition-loss   # operator-conscious override
   ```

   Flags (each validated; an unknown flag exits 2):
   - `--allow-disposition-loss` — accept the losses with a warning naming the affected ids.
   - `--baseline <path>` — override baseline path (default: per-codebase `.stack-control/scope-discovery/clones.yaml`).
   - `--head-ref <ref>` — git ref the working tree is compared against (default `HEAD`).
   - `--repo <path>` — override repo root (default cwd).

2. **Read the exit code:** `0` = no destructive transitions (or override accepted, or no baseline to diff); `1` = one or more non-pending → pending reverts detected; `2` = I/O / parse / git error.

## Notes

- Per-codebase default: the baseline is the nearest-enclosing stack-control installation's clones.yaml, resolved and expressed repo-relative for `git show`.
- Entries that legitimately disappear (id removed) or change id (content roll) are NOT flagged — those are visible in the standard clone-detector diff. This gate's narrow job is the silent same-id revert.
- The override path (`--allow-disposition-loss`) still prints a warning naming every accepted transition, so the loss is auditable.
