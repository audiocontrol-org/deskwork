### AUDIT-20260601-07 remains open in the durable audit log even though the workplan records it as closed

Finding-ID: AUDIT-BARRAGE-codex-01  
Status:     open  
Severity:   medium  
Surface:    `docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md:4537-4544`; `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md:1482-1497`

The workplan entry says “Closes AUDIT-20260601-07” and records the schema/type/test fix as complete, but the audit log entry added in the same diff still has `Status:     open`. The workplan acceptance criteria also leaves “Audit-log Status flipped to fixed-<sha>” unchecked, so the durable state now says both “closed by implementation” and “still open” depending on which project record is read.

This matters because the audit log is the source later barrage/import tooling will scan for unresolved findings. Leaving `AUDIT-20260601-07` open after committing the fix means the same issue can be re-triaged as active despite the code and tests having moved. A reasonable fix is to update the audit-log status to the actual fixed commit SHA once known, or avoid wording the workplan as “Closes” until the audit record is updated in the same close-shipped step.
