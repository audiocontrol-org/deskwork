# Contract: `stackctl archive`

Move terminal-status Units out of a live document into its sibling archive (FR-006). Default **dry-run** (FR-009).

## Invocation

```
stackctl archive --doc <path> [--apply]
```

| Flag | Required | Purpose |
|---|---|---|
| `--doc <path>` | yes | The governable document. |
| `--apply` | no | Perform the move. Default is dry-run (report only). |

## Behavior

1. Resolve grammar (grammar-declaration contract); fail loud if ungovernable (FR-001).
2. Parse → Units; fail loud on parse failure with offending span (FR-003).
3. Validate identifier invariants across document ∪ archive; fail loud on violation (FR-005).
4. Select Units with `status ∈ terminalStatuses` (FR-004).
5. **Dry-run** (default): report the selected Units (identifier, status, line span) and the planned archive target. **Zero writes.**
6. **`--apply`**: cut selected Units by span; append to `<doc>-archive.md` (create with frontmatter if absent), each keeping its identifier as heading; add one ledger entry per moved Unit **in the archive file** (FR-006).
7. Assert **coherence**: ledger entries match archived Units exactly (FR-006, SC-007).

## Exit codes

- `0` — scan/archive complete (dry-run, or apply with no refusals).
- `1` — refused / write failure / coherence violation.
- `2` — usage or config error (missing `--doc`, ungovernable document, parse failure, identifier-invariant violation).

## Outcomes verified

- After `--apply`, the live document contains **zero** archivable Units (SC-001).
- The ledger lives in the archive file; the live document gains **no** bookkeeping (clarification 2026-06-07).
