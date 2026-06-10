# Audit Log — 008-backlog-surface (TEST FIXTURE)

A sample audit-log used by the slush backfill/migration tests (T023). It carries
an audit-barrage lift section with two `acknowledged-slush-pile-<date>` parked
entries (MEDIUM + LOW — the ones the backfill migrates) and one HIGH that is
`Status: open` and must NEVER migrate. The non-barrage ledger section below the
fold must stay byte-for-byte unchanged by a migration (FR-025).

## 2026-05-30 — convergence ledger (NON-BARRAGE — must stay byte-unchanged)

### AUDIT-20260530-01 — a previously fixed finding
Finding-ID: AUDIT-20260530-01
Severity: MEDIUM
Status: fixed-abc1234
Detail: A converged finding retained as historical ledger. Not a barrage-lift
entry, so the slush backfill must never touch it.

## 2026-06-08 — audit-barrage lift (20260608-1200-008-backlog-surface)

### AUDIT-20260608-01 — capture path lacks an explicit non-empty title guard
Finding-ID: AUDIT-20260608-01
Severity: MEDIUM
Status: acknowledged-slush-pile-2026-06-08
Detail: The capture wiring relied on the backend to reject an empty title rather
than guarding it up front. Parked by the dampener; a real gap to burn down.

### AUDIT-20260608-02 — list output ordering is unspecified
Finding-ID: AUDIT-20260608-02
Severity: LOW
Status: acknowledged-slush-pile-2026-06-08
Detail: `list` ordering follows the backend's grouping with no documented sort.
Cosmetic; parked by the dampener.

### AUDIT-20260608-03 — import path could in principle write back to GitHub
Finding-ID: AUDIT-20260608-03
Severity: HIGH
Status: open
Detail: A HIGH-severity finding. HIGHs are NEVER slushed (FR-018) — this entry
must remain `Status: open` and must never become a migrated-finding backlog item.
