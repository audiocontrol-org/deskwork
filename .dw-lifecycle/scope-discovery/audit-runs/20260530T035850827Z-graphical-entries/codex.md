### Corrupt member sidecars are misreported as missing

Finding-ID: AUDIT-BARRAGE-codex-01
Status:     open
Severity:   medium
Surface:    `packages/studio/src/pages/entry-review/data.ts:176-183`

`loadGroupMembersBundle` catches every `readSidecar` failure and records the UUID as missing. That conflates a genuinely absent sidecar with schema parse failures, permission errors, malformed JSON, or other storage bugs. The result is an inline “missing” row instead of an explicit render/load failure, which violates the repo’s “no silent fallbacks” discipline and can hide data corruption from the operator.

A reasonable fix is to distinguish not-found errors from other `readSidecar` failures. Only absent sidecars should enter `missingMemberUuids`; validation, parse, and I/O failures should propagate with an actionable message.

### Missing-member rows lose declared member order

Finding-ID: AUDIT-BARRAGE-codex-02
Status:     open
Severity:   medium
Surface:    `packages/studio/src/pages/entry-review/data.ts:176-183`, `packages/studio/src/pages/entry-review/members-section.ts:263-271`

The loader splits resolved members and missing UUIDs into separate arrays, then `renderListBody` renders all resolved rows before all missing rows. That means a group declared as `[missing-a, real-b, missing-c]` displays as `[real-b, missing-a, missing-c]`, even though the contract says list mode preserves `group.members[]` insertion order.

This matters because the group membership list is operator-authored ordering. The renderer needs an ordered member-item structure that carries either `{kind: "resolved", entry}` or `{kind: "missing", uuid}` per original UUID position, then list mode can render that sequence directly.
