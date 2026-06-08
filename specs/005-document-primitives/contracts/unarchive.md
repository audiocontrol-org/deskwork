# Contract: `stackctl unarchive`

The symmetric reversal of `archive` (FR-007): return a named archived Unit to the live document. Default **dry-run** (FR-009).

## Invocation

```
stackctl unarchive --doc <path> --id <identifier> [--apply]
```

| Flag | Required | Purpose |
|---|---|---|
| `--doc <path>` | yes | The governable document. |
| `--id <identifier>` | yes | Identifier of the archived Unit to restore. |
| `--apply` | no | Perform the move. Default is dry-run. |

## Behavior

1. Resolve grammar; fail loud if ungovernable (FR-001).
2. Locate `--id` via its **ledger entry** (keyed by identifier — FR-006); **fail loud if absent** (FR-010) — this includes the case where the **provenance ledger is itself absent, empty, or unreadable** (no entries to search → cannot locate the Unit to restore), as well as the case where the ledger exists but has no entry for `--id`. (A corrupt archive **body** with the ledger still readable does NOT fail loud here — the ledger locates the Unit; body corruption is a `curate` coherence NOTICE, FR-006.) The ledger entry is sufficient to find the Unit — its span in the archive file is recovered by scanning for the matching identifier marker and reading to the next same-level structural marker: for a heading-keyed grammar the reserved-level heading and its body; for a row-keyed grammar the matching row in the archive's single archived-Unit table (FR-002 boundary rule + FR-006 archive file structure make this unambiguous; the ledger lives in its own section, never confused with a Unit row; **no stored position** is needed).
3. **Collision guard**: if `--id` already exists in the live document, **fail loud** (FR-005 uniqueness, FR-007). Zero writes.
4. **Dry-run** (default): report the planned restore (identifier, declared-order reinsertion position derived from the grammar **relative to the live document's current neighbors**). **Zero writes.**
5. **`--apply`**: first, assert the **committed-working-tree precondition** (FR-006) — the target live document **and** its sibling archive file MUST be committed (clean) in version control; if either has uncommitted changes, **fail loud** ("commit or stash `<path>` before --apply") with **zero writes** (FR-006/FR-010); this is what makes the durability promise's revert-to-last-commit recovery restore the exact pre-op state. Then **lift** the Unit (identifier marker → next same-level marker) from the archive file — i.e. **remove** it from the archive (unarchive is **not** an append-only archive write; it deletes the named Unit and its ledger entry from the archive file) — and reinsert it into the live document at its **declared-order position relative to the live document's current neighbors** (FR-004) — touching **only that Unit**; `unarchive` does **not** reorder the rest of the document (that is `curate`'s job); remove its ledger entry; re-assert coherence (FR-006).

## Exit codes

- `0` — complete (dry-run or apply).
- `1` — write failure / coherence violation.
- `2` — usage/config error (missing flag, ungovernable, locate failure — `--id` not in archive **or** the ledger is absent/empty/unreadable, **identity collision**, **uncommitted target on `--apply`**).

## Outcomes verified

- An archive→unarchive round-trip leaves the document content-equivalent — the Unit returns at its declared-order position relative to the live document's current neighbors with body and identity intact, not byte-identical — and well-ordered IFF the live document was already well-ordered before the round-trip (a single-Unit reinsertion preserves an existing order discipline but does not impose order; `curate` does that) (SC-007).
- Identity is unchanged by the round-trip (SC-004).
