### `deskwork induct --to` still rejects non-editorial stages

Finding-ID: AUDIT-BARRAGE-codex-01
Status:     open
Severity:   high
Surface:    packages/cli/src/commands/induct.ts:87-103,114

The core `inductEntry` API is now template-aware, but the CLI keeps an editorial-only `isLinearPipelineTarget(flags.to)` guard and hardcoded error text listing `Ideas, Planned, Outlining, Drafting, Final, Published`. A visual-lane operator trying `deskwork induct icon-set --to Sketched` is rejected before the request reaches the template-aware core helper, even though `Sketched` is valid for the entry’s bound template.

The comment also explicitly documents that non-editorial stages fail the CLI guard, which violates the feature goal that universal verbs consult the bound pipeline template rather than hardcoded stage literals. The CLI should read the sidecar, resolve the entry template, validate `--to` against `template.linearStages`, and use template-aware off-pipeline detection for the default `priorStage` path instead of checking only `Blocked` / `Cancelled`.

### Unassigned or stale-lane entries can still disappear from regenerated calendars

Finding-ID: AUDIT-BARRAGE-codex-02
Status:     open
Severity:   high
Surface:    packages/core/src/calendar/render.ts:72-79,181-200

The multi-lane renderer puts entries whose `lane` is missing or not present in `entriesByLane` into `orphanLane`, then renders that whole bucket with `EDITORIAL_FALLBACK`. `bucketize` only pushes entries whose `currentStage` exists in the supplied stage list, so an unassigned or stale-lane entry at a non-editorial stage like `Sketched`, `Approved`, `Shipped`, or `Archived` is silently omitted from `calendar.md`.

That recreates the shape #247 was meant to close: a sidecar UUID can vanish from regenerated output because no rendered bucket exists for its stage. The unassigned path needs either a visible catch-all section grouped by raw `currentStage`, or a loud error/doctor finding that prevents calendar regeneration from pretending all entries were rendered.

### Lane migration silently skips unreadable or invalid sidecars

Finding-ID: AUDIT-BARRAGE-codex-03
Status:     open
Severity:   medium
Surface:    packages/core/src/doctor/lane-migration.ts:145-158

`migrateLaneMembership` catches sidecar read failures, JSON parse failures, and `EntrySchema.safeParse` failures, then `continue`s without recording the file in `entriesExamined` or returning any failure details. That means a malformed or unreadable sidecar is not migrated, not counted, and not surfaced to the operator, while the result can still report a clean-looking migration summary.

This conflicts with the stated migration contract to back-fill every sidecar and with the project’s no-silent-fallback discipline. The migration should fail with the path and parse/schema details for invalid sidecars, or return an explicit failures list that the caller treats as a non-clean migration result.
