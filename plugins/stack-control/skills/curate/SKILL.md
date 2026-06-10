---
name: curate
description: "Keep a live governed document correct: check it is well-formed, well-ordered, and properly archived, recognize (never run) a declared reconciliation seam, and report ledger↔archive coherence. Dry-run first, then apply on confirmation. Wraps `stackctl curate`."
---

# /stack-control:curate

Bring a live governed document back to a correct, tidy state. `curate` runs four checks and (on `--apply`) makes the mechanical fixes:

1. **Well-formed** — the document parses against its grammar and every identifier is valid. A violation fails loud (no partial fix); the operator repairs the document.
2. **Well-ordered** — Units are in the grammar's declared order (an ordered enumeration over the order-key field, tie-broken by identifier). On `--apply`, `curate` reorders mechanically **without changing any identity**.
3. **Properly archived** — terminal-status Units still living in the document are flagged. On `--apply`, `curate` composes `archive` and moves them out.
4. **Up-to-date** — if the grammar declares a reconciliation hook, `curate` reports it as *declared, not yet executed* and **never runs it** (reconciliation execution is outside this primitive's scope). Silent when no hook is declared.

It also reports a **coherence NOTICE** if the provenance ledger and the archive file's markers have drifted (e.g. from a manual identifier edit) — a notice, never a failure; manual edits are the operator's responsibility.

> Per `.claude/rules/enforcement-lives-in-skills.md`, the discipline lives in this skill body + the `stackctl curate` verb it calls.

## Steps

1. **Dry-run first (always).** Report findings; write nothing:

   ```bash
   plugins/stack-control/bin/stackctl curate --doc <path>
   ```

   Read the findings to the operator. "clean" → nothing to do; stop.

2. **Confirm with the operator** before applying — `curate` mutates the live document (reorder) and may move Units to the archive.

3. **Apply.**

   ```bash
   plugins/stack-control/bin/stackctl curate --doc <path> --apply
   ```

   It reorders first, then archives terminal-status Units (composing `archive`).

4. **Report the outcome** — whether it reordered, and how many Units it archived.

## Fail-loud cases (exit non-zero, zero writes)

- Ungovernable document, parse failure, or identifier-invariant violation → usage/config error (exit 2). `curate` does not partial-fix; the operator repairs the document.
- A write failure on `--apply` → exit 1; the document is recoverable from version control.
