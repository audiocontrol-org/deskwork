# Phase 1 Data Model: Low-friction insight capture

The feature operates on the existing governed `design-inbox` document; it introduces **no new persisted store**. Entities below describe the inbox entry shape and the operation inputs.

## Entity: Inbox entry (a governed-document Unit)

The unit of the `design-inbox` grammar (a `### <title>` heading + body). Reused as-is.

| Field | Source | Rules |
|---|---|---|
| `identifier` | the `### <title>` heading text | Unique across the live doc **and** the archive ledger (enforced by the engine's identifier validator). Non-empty. |
| `status` | the `**Status:**` body bullet | One of `captured` \| `promoted` \| `dropped` (grammar `statusVocabulary`). `promoted`/`dropped` are terminal. |
| `body` | lines between this heading and the next | Free markdown. Conventional fields: **Surfaced**, **Context**, **Idea**, **Provisional home**. On `promote`: a recorded **target reference** line is appended. On `drop`: a recorded **reason** line is appended. |

### Status lifecycle

```text
            capture                 promote
   (none) ───────────▶ captured ───────────▶ promoted  (terminal)
                          │
                          │  drop
                          └───────────────▶ dropped   (terminal)

   terminal ──(archive/curate)──▶ moved to DESIGN-INBOX-archive.md (+ ledger), recoverable via unarchive
```

- A new entry is created in `captured`.
- `promote`/`drop` are only valid from a non-terminal (`captured`) entry; from a terminal state they are refused (fail-loud).
- Lean-keeping (existing `archive`/`curate`) relocates terminal entries; `unarchive` restores by identifier.

## Operation inputs

### Capture (`inbox capture`)

| Input | Required | Notes |
|---|---|---|
| title | yes | becomes the entry identifier; rejected if empty or duplicate |
| idea (body) | yes | the idea content; rejected if empty/whitespace-only |
| surfaced / context / provisional-home | no | optional structured body fields; defaulted/omitted if absent |
| status | no | defaults to `captured` |

Outcome: a new `captured` entry appended; whole doc re-validated; atomic write; **zero-write on any validation failure**.

### Promote (`inbox promote`)

| Input | Required | Notes |
|---|---|---|
| identifier | yes | must reference an existing, non-terminal entry |
| target reference | yes | the graduation destination — a spec dir / roadmap item id / GitHub issue ref. **Recorded only** (not validated against the target, not created here — FR-014). |

Outcome: status → `promoted`; target reference recorded in the body; re-validate; atomic write. Target artifact creation is a *separate* step via the existing creators (`roadmap add`, `gh`, `speckit-specify`).

### Drop (`inbox drop`)

| Input | Required | Notes |
|---|---|---|
| identifier | yes | must reference an existing, non-terminal entry |
| reason | yes | recorded with the entry |

Outcome: status → `dropped`; reason recorded; re-validate; atomic write.

### List (`inbox list`)

Read-only. Returns the current entries and their statuses. Never writes.

## Validation rules (all fail-loud — Principle V)

- Inbox file missing or not governable → descriptive error (never auto-create/repair).
- Capture with empty title or empty idea → refused.
- Capture producing a duplicate identifier or otherwise-invalid document → refused, doc unchanged.
- Promote/drop targeting an absent or already-terminal entry → refused.
- Promote without a target reference, or drop without a reason → refused (usage error, exit 2).

## Reused engine surfaces (no change)

- `loadDocument` / `loadDocumentFromSource` — parse + full validation (identifier uniqueness, order-key domain, referential integrity, acyclicity).
- atomic write via `writeFileSync` after candidate validation (zero-write-on-failure).
- `archive` / `unarchive` / `curate` engines — terminal-entry lean-keeping + restore + reorder, keyed on `terminalStatuses`.
