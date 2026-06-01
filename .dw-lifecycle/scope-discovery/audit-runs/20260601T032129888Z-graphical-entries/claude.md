I'm acting as the `claude` audit reviewer in this barrage. The genuinely-new production surface in the bottom diff (the prior group.ts / `withJournalRollback` work is already triaged as AUDIT-20260601-01..04 and embedded only as a PROMPT.md artifact) is the new `entry-lane-missing` doctor rule plus the `isFirstSite` extraction. I walked those four files. Findings below.

### `entry-lane-missing.audit()` swallows every non-ENOENT read failure and returns `[]`, making a schema-tightening GATE report false-clean

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   medium
Surface:    `packages/core/src/doctor/rules/entry-lane-missing.ts` (the `audit()` try/catch around `readAllSidecarsPartitioned`, ~lines 76-86)

The rule's whole purpose, per its own header, is to be the GATE that lets Step 8.0.2 tighten `resolveEntryTemplate` to throw on a missing `lane`: *"until canary projects report zero `entry-lane-missing` findings, the resolver retains its migration-window default."* That makes a **false-zero the dangerous direction** — a zero count is read as "safe to tighten." But the audit wraps the sidecar read in `try { … } catch { return []; }`. The comment frames the catch as benign ("Nothing useful this rule can say — leave the report empty"), yet any genuine failure (permission error on `.deskwork/entries/`, an I/O fault, a future change in the reader's error contract) is silently converted to "no findings." An operator (or the 8.0.2 implementer) reading a green `entry-lane-missing` cannot distinguish "every entry has a lane" from "the rule couldn't read the directory."

The ENOENT case is already handled by the reader returning `[]` (the empty-project test exercises that), so this catch only ever fires on *unexpected* errors — exactly the ones a gate rule should surface, not bury. Per the project's "fallbacks/swallowed errors are bug-factories" guidance, this should emit a finding (e.g. severity `error`, message naming the read failure) rather than return `[]`, so a read fault blocks the gate instead of opening it. The swallow is also untested — the "empty project" test removes the dir (ENOENT path), never the non-ENOENT path.

### `entry-lane-missing` repair message points operators at two handles that aren't operator-invocable as written

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   medium
Surface:    `packages/core/src/doctor/rules/entry-lane-missing.ts` (the `audit()` `message` builder ~lines 95-110 and the `plan()` `reason` ~lines 125-135)

This is an `error`-severity finding with no auto-repair, so the message text *is* the operator's only path forward — and both handles it names are wrong or unverifiable as invocations. (1) **`/deskwork:lane move <slug> --to <lane-id>`** — lane operations live in the CLI (`packages/cli/src/commands/lane.ts`); there is no `/deskwork:lane` slash skill in the registry (the `deskwork:` skills are add/approve/block/cancel/customize/distribute/doctor/induct/ingest/install/iterate/publish/shortform-start/status — no `lane`). So the `/deskwork:`-prefixed slash form is the wrong invocation surface; the real form would be the CLI `deskwork lane …`. The `move` verb itself is also unconfirmed against `lane.ts`. (2) **`migrateLaneMembership`** is described as something to "run," but it's a `@deskwork/core` function with no named CLI/slash surface — an operator cannot "run" a library export.

This is the phantom-path failure mode the project rules call out (acting on facts the agent invented; quoting commands from memory rather than the documented form). An operator who trips the gate, reads the message, and types `/deskwork:lane move …` gets nothing. Fix: quote the actual invocations verbatim from the lane CLI's documented verbs (or, if `migrateLaneMembership` has no operator surface, wire a `deskwork doctor`-driven repair or name the real command), and confirm a `move`/assign verb exists before naming it. The test at `entry-lane-missing.test.ts` asserts `message`/`reason` *contain* these strings, so it locks the wrong form in rather than catching it — the assertion verifies the literal the code emits, not that the literal is a working command.

### Detection is silently inverted by the very schema tightening this rule gates: once `lane` becomes required, missing-lane sidecars route to `malformed` and the rule reports zero

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   informational
Surface:    `packages/core/src/doctor/rules/entry-lane-missing.ts` (`audit()` reads `partition.entries`, skips `partition.malformed`, ~lines 88-95) + dependency on `EntrySchema.lane` optionality

The rule only inspects `partition.entries` (parseable sidecars) and explicitly leaves `partition.malformed` to sibling rules. That's correct *while* `lane` is optional on `EntrySchema` — a missing-lane sidecar still parses, lands in `entries`, and trips the `entry.lane === undefined` check. But the moment Step 8.0.2 (the step this rule gates for) tightens the schema/resolver so a missing `lane` is invalid, those same sidecars stop parsing, route to `malformed`, and this rule reports **zero** — not because the entries were fixed, but because the detector went blind. The "zero findings" signal the gate depends on becomes ambiguous after the change it's supposed to authorize.

Not a bug in the current sequence (gate fires before the tightening), but the inverse-detection coupling is worth a one-line note in the header so a future contributor who tightens the schema doesn't read a post-tightening green as "all entries migrated." A defensive cross-check (e.g. the rule also counting `malformed` sidecars whose parse error is specifically a missing-lane rejection, or the `malformed`-channel rule naming the missing field) would keep the signal honest across the schema transition.

---

Clean checks worth recording: the `isFirstSite` extraction into `project-scope-gate.ts` is a faithful move (identical body, `lane-config-missing-template.ts` now imports it, runner registers the new rule) — no behavior change, good DRY, the empty-`sites` degenerate returns `true` so the rule still runs. The positive test genuinely verifies the contract (3 sidecars in, exactly the one no-lane entry emits, filtered by `ruleId` so sibling-rule noise can't inflate it) and pins the project-relative `sidecarPath` per the AUDIT-20260530-81 precedent including the `startsWith('/')` guard. The `apply()` no-op is defensible interface-conformance, not dead-code-by-accident. I did not re-report the group.ts / `withJournalRollback` items — those are the prior run's diff, already carried as AUDIT-20260601-01..04.
