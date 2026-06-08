# Contract: `stackctl curate`

Ensure a live document is well-formed, well-ordered, and properly archived; recognize the up-to-date seam (FR-008). A composable primitive whose invocation context is intentionally undecided. Default **dry-run** (FR-009).

## Invocation

```
stackctl curate --doc <path> [--apply]
```

| Flag | Required | Purpose |
|---|---|---|
| `--doc <path>` | yes | The governable document. |
| `--apply` | no | Apply mechanical fixes (reorder; compose archive). Default is dry-run (report only). |

## Behavior (four checks)

1. **Well-formed** (FR-003): resolve grammar + parse. A parse failure or identifier-invariant violation **fails loud** with the offending span; curate does **not** attempt a partial fix.
2. **Well-ordered** (FR-004): compare Unit order to the declared order key. On `--apply`, reorder mechanically — **without changing any identity** (FR-005).
3. **Properly archived** (composes `archive --apply`, FR-006): report Units whose `status ∈ terminalStatuses` that are still in the live document as belonging in the archive. On `--apply`, **moves** them to the archive.

On `--apply`, curate simply **reorders first, then archives** (it writes the live document for the reorder, then composes `archive --apply`) as a single operation. The **scoped durability promise** (FR-010) holds: an interrupted or failed `curate --apply` is **recoverable to the last committed state** — any inconsistency is recoverable via version control (revert to the last commit + re-run) and detectable via the coherence check below; content not yet committed at interruption is the operator's responsibility (commit before a mutating `--apply`). The contract does **not** promise the whole operation is atomic; the write/recovery protocol is an implementation concern.
4. **Up-to-date** (FR-008, seam only): if the grammar declares a reconciliation hook, report it as `declared, not yet executed`; **never run it**. If undeclared, the check is silent. Either way the other three checks still run.

**Coherence (FR-006):** `curate` **owns the coherence check** — it cross-references the provenance ledger against the archive file's identifier markers and reports any mismatch (e.g. ledger/marker staleness from a manual identifier edit) as a **report-line NOTICE, not a fail-loud failure** (manual identifier edits are the operator's responsibility — FR-006). This is the surface that asserts SC-007's "ledger matches archive contents" invariant.

## Exit codes

- `0` — curate complete (clean, or dry-run report, or apply succeeded).
- `1` — apply write failure.
- `2` — usage/config error, ungovernable document, parse failure, or identifier-invariant violation (the fail-loud cases).

## Outcomes verified

- After `--apply`, the document parses against its grammar, Units are in declared order, and archivable Units have been moved to the archive (SC-002).
- Reordering changes no identity (SC-004).
- A declared reconciliation hook is reported, not executed (clarification 2026-06-07).
