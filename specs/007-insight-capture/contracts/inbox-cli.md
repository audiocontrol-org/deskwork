# Contract: `stackctl inbox` verb

The capture/triage surface for the governed design inbox. Mirrors the `stackctl roadmap` contract: one noun verb, subactions, **dry-run by default, `--apply` to write**, exit `0` success / `2` usage-or-fatal. All mutations re-validate the whole document and are **zero-write-on-failure**.

Universal flag: `--doc <path>` (defaults to the project's governed `DESIGN-INBOX.md`).

## `inbox capture <title> --idea "<text>" [options]`

Capture a new idea in one move. The `roadmap add` analog.

```
stackctl inbox capture "<title>" \
  --idea "<the idea>" \
  [--surfaced "<when/where it came up>"] \
  [--context "<background>"] \
  [--home "<provisional home>"] \
  [--doc <path>] [--apply]
```

- **Args**: `<title>` (required, positional) → the entry identifier.
- **Required flag**: `--idea` (non-empty).
- **Behavior**: appends a new `### <title>` entry with status `captured`; re-validates the whole inbox; writes atomically only on `--apply`.
- **Exit 0**: dry-run prints "would capture …"; with `--apply` prints "captured <title>".
- **Exit 2**: missing `<title>` or `--idea`; empty/whitespace idea; duplicate identifier; any document-validation failure (doc left **unchanged**); inbox missing/ungovernable.

## `inbox promote <title> --to <ref> [options]`

Graduate a captured entry. **Records** the target; does not create it.

```
stackctl inbox promote "<title>" --to "<spec|roadmap-id|issue-ref>" [--doc <path>] [--apply]
```

- **Required flag**: `--to <ref>` — the graduation target reference (recorded, not validated/created here).
- **Behavior**: status `captured → promoted`; records the target reference in the entry body; re-validates; atomic write on `--apply`.
- **Exit 2**: entry absent or already terminal; missing `--to`; validation failure (zero write).

## `inbox drop <title> --reason "<text>" [options]`

Discard a captured entry with a recorded reason.

```
stackctl inbox drop "<title>" --reason "<why>" [--doc <path>] [--apply]
```

- **Required flag**: `--reason` (non-empty).
- **Behavior**: status `captured → dropped`; records the reason; re-validates; atomic write on `--apply`.
- **Exit 2**: entry absent or already terminal; missing `--reason`; validation failure (zero write).

## `inbox list [--doc <path>]`

Read-only. Prints each entry's identifier + status. Never writes. Exit `0` (or `2` if the inbox is missing/ungovernable).

## Lean-keeping (NOT new — existing generic verbs)

Promoted/dropped (terminal) entries are cleared from the live inbox with the existing generic verbs, which already operate on any governed doc:

```
stackctl curate   --doc DESIGN-INBOX.md [--apply]   # reorder + archive terminal entries
stackctl archive  --doc DESIGN-INBOX.md [--apply]   # move terminal entries to DESIGN-INBOX-archive.md (+ ledger)
stackctl unarchive --doc DESIGN-INBOX.md --id "<title>" [--apply]   # restore
```

## Invariants (asserted by tests)

- **Dry-run writes nothing.** Every subaction without `--apply` leaves the inbox byte-for-byte unchanged.
- **Zero-write-on-failure.** Any validation failure during an `--apply` leaves the inbox byte-for-byte unchanged.
- **Fail-loud.** No silent no-op, fabrication, or partial write on any precondition gap.
- **One mechanism.** After this ships, this verb (plus the generic lean-keeping verbs) is the only capture/triage path; the interim hand-append convention is retired.
