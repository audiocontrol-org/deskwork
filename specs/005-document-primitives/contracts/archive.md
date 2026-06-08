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
3. Validate identifier invariants across document ∪ archive; the archived side of the union comes from the **provenance ledger only** (keyed by identifier — FR-005/FR-006), never from scanning the archive's contents; fail loud on violation (FR-005).
4. Select Units with `status ∈ terminalStatuses` (FR-004).
5. **Dry-run** (default): report the selected Units (identifier, status, line span) and the planned archive target. **Zero writes.**
6. **`--apply`** (FR-006/FR-010 durability promise): first, assert the **committed-working-tree precondition** — the target live document **and** its sibling archive file MUST be committed (clean) in version control; if either has uncommitted changes, **fail loud** ("commit or stash `<path>` before --apply") with **zero writes** (FR-006/FR-010). Then cut selected Units by span from the live document; append into the archive's Unit table/section in `<doc>-archive.md` (create with frontmatter if absent), each delimited by the **same reserved-level structural marker** as the live document (FR-002 boundary rule) — a reserved-level section for a heading-keyed grammar, or a row appended into the archive's **single archived-Unit table** (which reproduces the live document's header + separator + column schema) for a row-keyed grammar — so its span stays unambiguous on later extraction (FR-007); add one ledger entry per moved Unit **in the archive file**, in the ledger's **own distinct section separate from the Unit table/sections** (keyed by identifier — no span/position recorded; the boundary is structural). The **durability promise** holds: an interrupted or failed apply **never silently loses content** — *because the committed-working-tree precondition ensured a clean pre-op target* and governed documents are version-controlled, any inconsistency is **recoverable** (revert to the last commit, which restores the exact pre-op state, + re-run) and **detectable** (the `curate` coherence check, step 7). The concrete write/ordering/recovery protocol is an implementation concern (this contract + the RED tests pin it); the contract does **not** promise two-file atomicity.
7. Assert **coherence**: ledger entries match the archive file's **structural markers** exactly (the reserved-level heading for a heading-keyed grammar, the row for a row-keyed grammar) — cross-referencing the ledger against those markers (the only use of that scan; not a generic heading scan, not a uniqueness-union input) (FR-006, SC-007).

## Exit codes

- `0` — scan/archive complete (dry-run, or apply with no refusals).
- `1` — refused / write failure / coherence violation.
- `2` — usage or config error (missing `--doc`, ungovernable document, parse failure, identifier-invariant violation, uncommitted target on `--apply`).

## Outcomes verified

- After `--apply`, the live document contains **zero** archivable Units (SC-001).
- The ledger lives in the archive file; the live document gains **no** bookkeeping (clarification 2026-06-07).
