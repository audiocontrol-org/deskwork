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
2. Locate `--id` via its **ledger entry** (keyed by identifier — FR-006); fail loud if absent (FR-010). The ledger entry is sufficient to find the Unit — its span in the archive file is recovered by scanning for the matching identifier marker and reading to the next same-level structural marker (FR-002 boundary rule + FR-006 archive file structure make this unambiguous; **no stored position** is needed).
3. **Collision guard**: if `--id` already exists in the live document, **fail loud** (FR-005 uniqueness, FR-007). Zero writes.
4. **Dry-run** (default): report the planned restore (identifier, declared-order reinsertion position derived from the grammar). **Zero writes.**
5. **`--apply`**: **lift** the Unit (identifier marker → next same-level marker) from the archive file and reinsert it into the live document at its **declared-order position** (FR-004); remove its ledger entry; re-assert coherence (FR-006).

## Exit codes

- `0` — complete (dry-run or apply).
- `1` — write failure / coherence violation.
- `2` — usage/config error (missing flag, ungovernable, `--id` not in archive, **identity collision**).

## Outcomes verified

- An archive→unarchive round-trip leaves the document content-equivalent and well-ordered — the Unit returns at its declared-order position with body and identity intact, not byte-identical (SC-007).
- Identity is unchanged by the round-trip (SC-004).
