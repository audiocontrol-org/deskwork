---
name: unarchive
description: "Return a named archived item to its live governed document at its declared-order position, removing its provenance-ledger entry. The reversibility half of archive. Dry-run first, then apply on confirmation. Wraps `stackctl unarchive`."
---

# /stack-control:unarchive

Bring one archived item back into its live governed document — the symmetric reversal of `/stack-control:archive`. The item is located by its identifier via the provenance ledger, lifted out of `<doc>-archive.md`, and reinserted into the live document at the position the grammar's declared ordering relation gives it **relative to the document's current neighbors** (it touches only that one item; it does not reorder the rest — that is `/stack-control:curate`'s job). Its ledger entry is removed.

> Per `.claude/rules/enforcement-lives-in-skills.md`, the discipline lives in this skill body + the `stackctl unarchive` verb it calls — it travels with the plugin install, not a git hook.

## Preconditions

- The document is **governable** (declares a resolvable grammar).
- The item to restore is recorded in the archive's provenance ledger (it was archived earlier). An identifier with no ledger entry cannot be located.
- The document is committed (version control is the recovery path if an apply is interrupted).

## Steps

1. **Dry-run first (always).** Report the planned restore; write nothing:

   ```bash
   plugins/stack-control/bin/stackctl unarchive --doc <path> --id "<identifier>"
   ```

   It reports the item and its recorded status. Read it back to the operator.

2. **Confirm with the operator.** Only proceed on confirmation — `unarchive` mutates both the live document and the archive.

3. **Apply.**

   ```bash
   plugins/stack-control/bin/stackctl unarchive --doc <path> --id "<identifier>" --apply
   ```

   The item is reinserted into the live document at its declared-order position and removed from the archive (its ledger entry too). An archive→unarchive round-trip returns the item with its body and identity intact (content-equivalent, not byte-identical).

4. **Report the outcome.** State the restored identifier and the archive path.

## Fail-loud cases (exit non-zero, zero writes)

- **Locate failure** — the ledger is absent/empty/unreadable, or has no entry for `--id` → usage/config error (exit 2).
- **Identity collision** — the identifier already exists live → exit 2 (the document ∪ archive uniqueness invariant forbids it).
- A write failure → exit 1; both files are recoverable from version control.
