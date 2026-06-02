### Cascade catch swallows write/journal failures as skipped members

Finding-ID: AUDIT-BARRAGE-codex-01  
Status:     open  
Severity:   medium  
Surface:    `packages/core/src/entry/cancel.ts:209-279`

The cascade loop wraps member lookup, template resolution, and the recursive `cancelEntryWithoutCalendarRegen(...)` call in one broad `try/catch`. That means failures from the recursive transition path are converted into a skipped member with `slug: '(unresolved)'` and `reason: read failed: ...`, even when the failure was not a read failure.

This can hide serious state corruption. For example, the recursive walker writes the member sidecar at `cancel.ts:167` and then appends the journal event at `cancel.ts:168-186`; if the journal append fails, the catch at `272-279` reports the member as skipped even though its sidecar may already be `Cancelled`. The public wrapper then still regenerates the calendar at `328`, leaving a cancelled entry with no durable `stage-transition` event and a result object that claims it was skipped.

A reasonable fix is to narrow the recoverable catch to the specific missing-member/read case the cascade intentionally treats as skippable, and let template/config/write/journal errors propagate with an actionable error. If the product wants distinct recoverable cases beyond missing sidecars, they should be classified explicitly instead of all being labeled `read failed`.
