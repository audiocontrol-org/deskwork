Confirmed both load-bearing facts against source. Emitting findings.

### `group list` is the sole verb left unguarded against extra positionals — silently swallows typos that every sibling verb (including read-only `show`) now refuses

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   low
Surface:    `packages/cli/src/commands/group.ts:127-128` (dispatch) and `:161-184` (`handleList`)

The AUDIT-20260530-94 fix added `assertExactPositional` to seven verbs (show, create, update, add-member, remove-member, archive, restore) but `handleList` was not touched: `run` dispatches `case 'list'` with only `booleans.has('include-archived')` (`:127-128`) and `handleList` never receives or inspects `rest` (`:161-166`). So `deskwork group <root> list garbage` silently discards `garbage` and lists all groups — exactly the "quiet partial-effect / operator typo swallowed" shape the fix set out to close.

The new function's own docstring (`:88-93`) frames the rationale as *"for state-mutating verbs the project convention is to refuse loudly,"* which would arguably exempt `list`. But that rationale doesn't match what was implemented: `handleShow` is read-only and **was** guarded (`:191`). So the line drawn is not "mutating vs read" — it's "every verb except `list`." That asymmetry is the defect: a user who fat-fingers `group list mygroup` (meaning `group show mygroup`) gets a full list with no error, while the same stray positional on any other verb exits 2. The new `extra-positional-refused.test.ts` covers all seven guarded verbs but not `list`, so the gap is unguarded by tests too. Fix: either call `assertExactPositional(rest, 0, 'list')` (threading `rest` into `handleList`), or correct the docstring to state that `list` is intentionally exempt and why — the current docstring asserts a "state-mutating" boundary the code doesn't actually follow.

---

### `remove-member` extra-positional test uses `/extra/`, which is trivially satisfied by the boilerplate word "extras:" — the assertion proves nothing about the offending argument

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   low
Surface:    `packages/cli/test/group/extra-positional-refused.test.ts:91-99` (the `remove-member` case)

Every other case in this file asserts that the *offending* positional is named in stderr using a string that cannot collide with the message boilerplate: `/extra-arg/`, `/accidental/`, `/spurious/`, `/oops/`, `/g-other/`, `/g-also/`. The `remove-member` case is the exception: it passes the extra arg literally as `'extra'` and asserts `expect(res.stderr).toMatch(/extra/)` (`:97-98`). But `assertExactPositional` always emits the literal token `extras:` in its message (`group.ts:105`), so `/extra/` matches that boilerplate regardless of whether the offending argument was echoed at all. The third assertion therefore adds zero signal beyond the `/extras/` assertion on the line above it — a regression that dropped the per-arg echo (or echoed the wrong arg) would still pass this test green.

This is the same class the project's `ui-verification.md` § "spec-compliance probes" names: an assertion that verifies the mechanism's incidental output rather than the contract it claims. The offending arg is JSON-stringified into the message (`extras.map((e) => JSON.stringify(e))`, `group.ts:105`), so the precise, collision-free assertion is `/"extra"/` (quoted), or simply rename the extra arg to a distinct token as the other six cases do. Low severity because the gate itself works; the finding is that this one test under-verifies what its siblings correctly verify.

---

### `withJournalRollback` rolls back the sidecar but never the journal — a non-atomic / partial journal-append failure leaves a corrupt journal fragment with the sidecar reverted, the inverse of the inconsistency it set out to fix

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   medium
Surface:    `packages/core/src/sidecar/with-journal-rollback.ts:91-116` (helper) + the six mutator call sites

The helper's contract is "snapshot the sidecar, run mutate (sidecar-write + journal-append), restore the sidecar on throw." The only failure path it compensates is one where the sidecar write succeeded and the journal append failed *before mutating the journal* — which is precisely the failure mode the regression test induces (`mutator-rollback-on-journal-fail.test.ts:103-113` pre-creates `review-journal/history` as a file so the journal's `mkdir` throws ENOTDIR with nothing written). But the name `withJournalRollback` and the header's framing ("compensating-write helper for the sidecar-write + journal-append sequence") imply the *journal* is what gets rolled back. It isn't — the journal file is never snapshotted or touched. If `appendJournalEvent` fails *after* writing partial bytes (disk-full mid-write, interrupted append, a serializer that writes-then-throws), the journal retains a corrupt/partial line that nothing cleans up, while the sidecar is reverted to its pre-mutation state. That is sidecar-says-unchanged / journal-says-partially-mutated — an inconsistency in the opposite direction from the one being closed, and it is entirely unguarded by the test (which only exercises the pre-write mkdir failure).

The fix as shipped is correct for the tested failure mode and is a reasonable generalization of the AUDIT-79 lane pattern, so this is not a blocking defect. But the operator should know the protection is one-sided: it assumes journal-append is all-or-nothing. Two reasonable hardenings: (a) rename to something like `withSidecarRollbackOnJournalFailure` so the name states what is actually restored (the journal-rollback name is an over-claim per the project's naming-reveals-intent guidance), and (b) if journal-append is in fact non-atomic, the helper should also capture and restore the journal-history file, or document in the header that journal atomicity is a precondition. As written, the docstring's "best-effort" caveat applies only to the *restore* side, not to the unaddressed partial-journal-write case.

---

### `withJournalRollback`'s snapshot/restore clobbers a concurrent successful write to the same sidecar

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   informational
Surface:    `packages/core/src/sidecar/with-journal-rollback.ts:108-116`

The helper reads the sidecar body synchronously into `snapshot` (`:113`), then `await`s `mutate()`. On failure it overwrites the file with the captured `snapshot.body` (`restoreSidecar`, `:71-83`). If a second mutation against the same group UUID interleaves — snapshots the same original body, writes its own update successfully, and the first mutation's journal append *then* fails — the first mutation's rollback restores the stale original body, silently discarding the second mutation's committed write. The same race applies to the `create` rollback's `unlinkSync` (`:75`), which could delete a file a concurrent create just wrote.

deskwork is a single-operator CLI with no documented concurrent-invocation model, so the practical likelihood is low and I would not block on it. I surface it because the helper is now a shared primitive (`packages/core/src/sidecar/`) that the header invites other entry mutators to adopt ("any sidecar-write-followed-by-journal-append call site"); a future caller in a server context (the studio writes to the same tree) could hit this. If the studio ever performs group mutations in-process, this becomes a real lost-update window. Worth a one-line note in the header that the helper assumes no concurrent mutation of the same UUID.

---

### clones.yaml regeneration replaced operator-authored "why not extract" rationales with terse one-liners, weakening the audit trail for future revisit decisions

Finding-ID: AUDIT-BARRAGE-claude-05
Status:     open
Severity:   informational
Surface:    `.dw-lifecycle/scope-discovery/clones.yaml:116-127` (ids `7fd4d02355a8`, `40b2115a7171`)

Two `keep-with-reason` dispositions lost their substantive justification in this refresh. The prior reason for the group/pipeline and group/lane dispatcher clones was a specific paragraph — *"Extracting these into a shared helper would lose per-verb-family argument validation specificity (each verb's flag set differs in non-trivial ways), and the verb-family boundary is the operator-facing unit"* — which records the actual engineering reason the clone is intentional. The replacements are *"Sibling verb-dispatch convention across group/lane/pipeline CRUD modules; shared shape is deliberate, not duplication"* and *"Sibling per-verb update-handler shape … parallel emit/fail handling is deliberate, not duplication."* These assert the conclusion ("deliberate, not duplication") but drop the *why-not-extract* argument that lets a future reader decide whether the disposition still holds as the code evolves.

This isn't a disposition-survivor violation (no `keep-with-reason → pending` transition, so the gate is satisfied) and it's a curation call, not a bug. But per the project's "no IOU / preserve the rationale" posture, the terser reasons are a small regression in the durable record: the next contributor evaluating whether to finally extract a shared dispatcher helper now has less of the original reasoning to push against. Consider retaining the per-verb-family specificity sentence in at least one of the two reasons so the rationale survives the line-number churn that triggered the re-hash.
