# Contract: audit-log scaffold-on-first-lift

**Surface**: `plugins/stack-control/src/subcommands/audit-barrage-lift.ts` (the `:273-274` abort becomes a scaffold)

## Behavior (assertions a test pins)

1. **scaffold on absent** — given a resolved feature root with NO `audit-log.md`, when lift runs with a non-empty run-dir, it creates `<root>/audit-log.md` with the canonical shape:

   ```
   ---
   slug: <slug>
   targetVersion: "<v>"     # from legacy-docs resolution; omitted or "" for speckit (no version axis)
   ---

   # Audit log — <slug>
   ```

   then appends the run section (`## <ISO-date> — audit-barrage lift (<run-dir-basename>)`) and the findings — no `return 2` abort.

2. **idempotent header** — given an existing `audit-log.md`, lift does NOT rewrite the header; it appends the run section only (unchanged behavior).

3. **explicit run-dir re-lift (FR-008)** — given a barrage already fired but un-lifted (run-dir present, tip unchanged), lift against that explicit run-dir lands the findings; the no-new-diff guard does not strand them.

4. **fail-loud preserved** — a genuinely unresolvable feature (neither layout) still fails loud (the scaffold only triggers once a root resolved, not as a fallback for an unresolved feature).

5. **atomic write** — the scaffold uses the existing `atomicWriteFile` path (`audit-barrage-lift.ts:44`), not a bare write.

## Non-goals

- Does not change the run-section format or the dampener's `BARRAGE_HEADER_RE` parsing.
- Does not scaffold from `setup`/`define` (lift is the universal choke — research D4).
