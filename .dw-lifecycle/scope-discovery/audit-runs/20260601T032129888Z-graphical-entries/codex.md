### `entry-lane-missing` hides sidecar read failures by returning a clean report

Finding-ID: AUDIT-BARRAGE-codex-01
Status:     open
Severity:   medium
Surface:    `packages/core/src/doctor/rules/entry-lane-missing.ts:72-80`

The new rule is an error-level gate for schema tightening, but its audit path catches any thrown error from `readAllSidecarsPartitioned(ctx.projectRoot)` and returns `[]`. The comment says ENOENT is already handled by the reader, so this catch only covers more serious directory-level failures: permissions, an unreadable `.deskwork/entries`, unexpected filesystem errors, etc. Reporting zero findings in those cases makes the gate look clean when the rule actually failed to inspect the project.

That is a silent fallback outside test code and conflicts with the stated purpose of the rule: proving sidecars are ready before missing `lane` becomes fatal. A reasonable fix is to let unexpected read failures propagate, or emit a doctor finding that says the sidecar scan failed. Keep the empty-directory behavior covered by the existing ENOENT test, but do not collapse all read failures into “no missing lanes.”

### Hook summary says zero findings even though the same diff slush-records four audit findings

Finding-ID: AUDIT-BARRAGE-codex-02
Status:     open
Severity:   medium
Surface:    `.dw-lifecycle/scope-discovery/last-hook-run.json:5-8`; `docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md:4469-4519`

The hook metadata records `"disposition": "fired-and-slushed"` but also `"findingsCount": 0`, `"promotedCount": 0`, and `"slushedCount": 0`. In the same diff, the audit log appends four findings from that run, all with `Status: acknowledged-slush-pile-2026-06-01`.

That makes the durable machine-readable summary contradict the human-readable audit log. Any later aggregation that relies on `last-hook-run.json` will conclude this run produced no findings and no slush entries, while the audit log says it produced four. The counts should reflect the actual parsed results, e.g. findings 4, promoted 0, slushed 4, or the disposition should not claim a slush action occurred.
