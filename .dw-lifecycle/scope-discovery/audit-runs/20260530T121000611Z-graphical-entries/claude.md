I have enough grounding from the actual source files. Let me write up my findings.

---

### SKILL.md error-handling catalog contradicts the shipped refusal messages AND re-asserts the pre-AUDIT-15 "non-empty members = group" semantic

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   medium
Surface:    `plugins/deskwork/skills/group/SKILL.md` (Error handling section, `show`/`update` bullets) vs `packages/core/src/groups/operations/show.ts:54-60` and `packages/core/src/groups/operations/update.ts:48-54`

The new SKILL.md error catalog documents the `show`/`update` non-group refusal as: `Cannot show group "<slug>": entry has no members. Per the Task 7.1.2 invariant, only entries with a non-empty members[] are groups.` and `update ... Refused with the same "entry has no members" shape as show`. But the actual code throws `Cannot show group "<slug>": entry is not a group (no \`members\` field on the sidecar)...` (show.ts) / `Cannot update group "<slug>": entry is not a group (no \`members\` field on the sidecar)...` (update.ts). The `show.test.ts` and `update.test.ts` assert `/entry is not a group/`, confirming the code — so the SKILL.md is the drifted artifact. An adopter grepping the documented error string will not find it.

Worse than a string mismatch: the quoted SKILL.md sentence *"only entries with a non-empty members[] are groups"* directly re-asserts the exact pre-fix semantic that AUDIT-20260529-15 reversed. That whole fix established that `members: []` IS a group (declared-empty marker) and `members`-absent is the regular entry. The SKILL.md header and `update`-description (fixed by AUDIT-20260529-21) now say the right thing, but the error catalog still carries the old, contradictory framing. The two halves of the same SKILL.md disagree about the core predicate. Note also the catalog inconsistency the doc fails to capture: `show`/`update` emit "entry is not a group", while `add-member`/`remove-member`/`archive`/`restore` emit "entry has no `members` field" — two distinct message families the catalog conflates. Fix: rewrite the `show`/`update` catalog bullets to quote the literal `entry is not a group (no \`members\` field...)` text and drop the "non-empty members[] are groups" clause.

---

### `showGroup` member-enrichment swallows corrupt-sidecar parse/config errors as `missing: true` (same class as AUDIT-23, new surface)

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   medium
Surface:    `packages/core/src/groups/operations/show.ts:66-78` (the per-member `try { readSidecar } catch { ...missing: true }` loop)

The member-enrichment loop wraps `readSidecar(projectRoot, memberUuid)` in a bare `catch {}` that pushes `{ uuid, missing: true }` for ANY failure. `readSidecar` throws on three distinct conditions: (a) the sidecar file genuinely doesn't exist (dangling UUID — the case `missing: true` is meant for), (b) the file exists but is corrupt JSON / fails `EntrySchema` validation, and (c) a lower-level IO error. Cases (b) and (c) are reported identically to (a) — a member whose sidecar is on disk but corrupt is mislabeled as a dangling reference.

This is the same swallow-corruption shape that AUDIT-20260530-23 narrowed in `cancel.ts` (now using an `existsSync` probe so only the genuinely-absent case is recoverable and parse/config/IO errors propagate). `show.ts` did not get the same treatment. The downstream consequence is concrete: doctor's `group-member-missing` rule (Task 7.5.2) acts on `missing: true` members and "prompts to remove the dangling reference" — so a corrupt-but-recoverable member sidecar surfaces as missing, and the operator's repair path is to *delete the reference to it*, compounding the data loss. Fix: mirror the cancel.ts pattern — probe `existsSync(sidecarPath(projectRoot, memberUuid))` first; only the absent case yields `missing: true`; let parse/validation/IO errors propagate so corruption surfaces loudly rather than masquerading as a dangling UUID.

---

### `isPopulatedGroupEntry` is defined and documented as downstream public API but not barrel-exported — unreachable via `@deskwork/core/groups`

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   low
Surface:    `packages/core/src/groups/types.ts:46-49` (definition + doc) vs `packages/core/src/groups/index.ts:11` (`export { isArchivedEntry, isGroupEntry } from './types.ts';`)

`isPopulatedGroupEntry` is defined in `types.ts` with a doc-comment that explicitly names its future consumers: *"used downstream by the multi-lane composed view in Task 7.4 + the informational `group-all-members-cancelled` doctor rule in Task 7.5.3 — both should skip empty groups."* But the package barrel `groups/index.ts` only re-exports `isArchivedEntry` and `isGroupEntry`. The predicate is therefore unreachable through the documented public module path `@deskwork/core/groups`; a Task 7.4/7.5.3 consumer would either have to deep-import `groups/types.ts` (bypassing the barrel contract every other group symbol follows) or re-derive the check inline.

In this diff the function has zero call sites, so it is effectively dead code that the doc-comment advertises as the canonical way to express "group with ≥1 member." That's an invitation for the exact failure the predicate exists to prevent: a future implementer who can't see it via the barrel will write `entry.members.length > 0` inline, re-fragmenting the semantic the two-predicate design was meant to centralize. Fix: add `isPopulatedGroupEntry` to the `groups/index.ts` export (and `groups/operations`/barrel as appropriate), or remove the function + the forward-referencing doc until a consumer lands.

---

### Inconsistent exit codes for a bad `--at` argument: out-of-range exits 1, malformed exits 2

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   low
Surface:    `packages/cli/src/commands/group.ts:233-245` (handleAddMember `--at` parse) and `packages/core/src/groups/operations/add-member.ts:124-135` (out-of-range throw)

The CLI parses `--at` and rejects non-integer / negative values via `fail(..., 2)` (exit 2 = usage error). But a syntactically-valid-but-out-of-range index (e.g. `--at 5` on a 2-member group) passes the CLI gate and is rejected only by the core operation, which throws a plain `Error` routed through `fail(...)` with the default exit 1. The tests encode this split: `refuses --at <negative>` and `refuses --at <not-an-integer>` assert `code === 2`, while `refuses --at <out-of-range>` asserts only `code !== 0` (it is actually 1).

From an operator's or scripting perspective, `--at -1`, `--at 1.5`, and `--at 5` are all "the `--at` argument is bad" — but they yield exit 2, 2, and 1 respectively. A script branching on exit code to distinguish "usage error, fix my invocation" (2) from "runtime/state error" (1) will misclassify the out-of-range case. The range check is arguably a usage error too (the operator supplied an invalid argument value), so the cleaner contract is exit 2 for all three. Fix: either validate the upper bound at the CLI layer against the resolved group's member count and `fail(..., 2)`, or accept the split explicitly and document that out-of-range is a state-dependent (exit-1) condition because the valid range isn't known until the group is read.

---

I walked the new group operations module, the CLI dispatcher, the cancel cascade (noting its on-disk state already carries the AUDIT-22/23 fixes, so I did not re-report those), the `archivedAt` schema delta, and the journal-event additions. I confirmed `source: z.string()` accepts the new `'group-create'` value (no validation break), the `lane` field's `LANE_ID_REGEX` binding closes the traversal vector, the `--at` integer parse is sound, and there is no HTML/XSS surface in this diff (the CLI emits JSON; studio surfaces are later tasks). The four findings above are the ones worth triage; the strongest are the SKILL.md error-catalog drift (#1) and the `showGroup` corrupt-sidecar swallow (#2).
