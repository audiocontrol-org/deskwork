### AUDIT-20260601-11 is marked fixed in the audit log while its workplan task remains placeholder-open

Finding-ID: AUDIT-BARRAGE-codex-01  
Status:     open  
Severity:   medium  
Surface:    `docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md:4598-4604`; `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md:1539-1556`

The audit log records `AUDIT-20260601-11` as `fixed-2fb0bac9`, but the corresponding workplan task is still a scaffold: every step is unchecked, the test path is `(to be filled in by Step 1 implementer)`, and the acceptance criterion still says `fixed-<sha>`. That leaves the durable project records contradictory: the audit log says the finding is closed, while the implementation tracker says the close work has not been performed.

This matters because the prior issue was explicitly about contradictory durable state. The fix should make Task 1.11 match the actual disposition: either fill in completed steps and acceptance criteria for the status flip, or avoid recording the audit finding as fixed until the workplan close record is complete.

### Doctor rule hides filesystem failures while claiming to surface skipped journal data

Finding-ID: AUDIT-BARRAGE-codex-02  
Status:     open  
Severity:   medium  
Surface:    `packages/core/src/doctor/rules/entry-anchor-shape.ts:105-111`; `packages/core/src/doctor/rules/entry-anchor-shape.ts:120-131`

The new doctor rule is intended to catch malformed anchors that the strict journal read path silently skips, but it also silently returns no findings when the journal history directory cannot be read for any reason other than `ENOENT`, and silently skips individual files that cannot be read or parsed. Those branches turn permission errors, partial corruption, or filesystem issues into an empty report.

That undermines the safety-net purpose described in the file header. If doctor cannot inspect the raw journal, it should emit an actionable finding or throw through whatever existing doctor error-reporting convention applies. Otherwise an operator can receive a clean `entry-anchor-shape` result precisely when the rule had no reliable access to the data it was supposed to audit.
