Verified. The read path (`read.ts:28`) does silently skip malformed events — confirming the rule's premise — and it **re-throws** non-ENOENT directory errors (`read.ts:19`), whereas the new doctor rule **swallows** them. The journal-history path is hardcoded as a bare string in four places now. Here are my findings.

---

### Workplan Task 1.11 is an all-unchecked stub that contradicts its own audit-log `fixed-2fb0bac9` status

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md` (new Task 1.11 block) vs `docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md` (AUDIT-20260601-11 entry)

The same diff that marks the audit-log entry `Status: fixed-2fb0bac9 (Status flip landed in 2fb0bac9 …)` also adds Task 1.11 to the workplan with **every checkbox unchecked** — all five steps are `- [ ]`, and the acceptance criteria still carry the literal template placeholder `Failing test exists at \`(to be filled in by Step 1 implementer)\``. So the durable state again says two contradictory things: the audit log says AUDIT-20260601-11 is fixed-and-closed, the workplan says it is an untouched stub. This is *precisely* the workplan-vs-audit-log inconsistency that AUDIT-20260601-11 was itself filed about (AUDIT-07 closed in the workplan while open in the log) — now regressed in the inverse direction for the meta-finding's own task.

Compounding this: Task 1.11's template ("Step 1: write failing test exercising the bug … Step 2: confirm test fails against current code") was generated mechanically and never adapted. AUDIT-20260601-11 is a docs-only status-line flip — there is no code bug to write a failing test against, and indeed no test was written (the fix was the one-line status edit in 2fb0bac9). The unchecked TDD template is therefore both internally incoherent and unfollowable as written.

A reasonable fix: either check off Task 1.11's steps and rewrite its acceptance criteria to reflect what AUDIT-11 actually required (a docs status-flip, verified by reading the audit-log line — not a vitest run), or mark it explicitly as a docs-only finding that the TDD task shape does not apply to. Leaving it as a placeholder stub means the next barrage/import pass that scans the workplan for incomplete tasks will re-flag AUDIT-11 as active while the log says it is closed — the exact re-triage failure AUDIT-11 warned about.

---

### `entry-anchor-shape` swallows non-ENOENT directory-read errors and reports "clean", diverging from the sibling read path that throws

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   medium
Surface:    `packages/core/src/doctor/rules/entry-anchor-shape.ts:97-117` (the `readdir` try/catch)

The rule's directory read catches every error and returns an empty findings array:

```ts
try { names = await readdir(journalDir); }
catch (err) {
  const error = err as NodeJS.ErrnoException;
  if (error.code === 'ENOENT') return [];
  // Directory-level read failure — nothing useful this rule can say.
  return [];   // <-- swallows EACCES, ENOTDIR, EIO, etc.
}
```

The sibling reader `packages/core/src/journal/read.ts:14-20` handles the identical situation by re-throwing anything that is not ENOENT. So a permission error (EACCES) or an I/O fault on the journal directory makes `readJournalEvents` fail loudly, but makes this *safety-net data-integrity rule* report zero findings — i.e. "no malformed anchors found." For a rule whose entire stated purpose is to be the durable safety net that surfaces unreadable legacy data the operator can't otherwise see, silently reporting "clean" on an IO failure is the fallback-hides-failure shape the project guidelines forbid ("Never implement fallbacks … throw … Errors let us know that something isn't implemented"). It is also self-inconsistent: a transient permission glitch produces a green doctor run that the operator will trust.

A reasonable fix is to mirror `read.ts`: return `[]` only on ENOENT, and either re-throw the non-ENOENT error or emit it as an `error`-severity finding ("could not read journal directory: …") so the operator sees that the check could not run rather than that it ran and found nothing.

---

### Tests never drive the rule through the real journal writer, so a writer/path divergence would leave the safety net silently blind

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   medium
Surface:    `packages/core/test/doctor/entry-anchor-shape.test.ts:65-92` (`writeJournalFile` helper) + all 9 cases; `packages/core/src/doctor/rules/entry-anchor-shape.ts:99-106` (hardcoded path literal)

Every test in `entry-anchor-shape.test.ts` persists fixtures via `writeJournalFile`, which hand-writes JSON to `join(root, '.deskwork', 'review-journal', 'history', …)` — the *same string literal* the rule itself hardcodes at `entry-anchor-shape.ts:101-105`. The test therefore proves only that "the rule reads from the directory the rule reads from"; it cannot catch a divergence between the rule's assumed journal layout and the real `appendJournalEvent` writer. The path happens to match today (`journal/append.ts:11` and `journal/read.ts:12` use the same literal), but it is now the **fourth** independent hardcoded copy of `.deskwork/review-journal/history` with no shared constant. If a future migration relocates the journal (the codebase already has a `review-journal/ingest` and `review-journal/pipeline` layout per `doctor/migrate.ts:37,70`, so layout churn is a live precedent), `read.ts`/`append.ts` move together but this rule keeps reading the old path, finds zero files, and reports "clean" forever — the safety net goes silently blind exactly when malformed data would be accumulating.

The clone-exhaustiveness test (`clone-spatial-anchor-exhaustiveness.test.ts`) does round-trip through the public `addEntryAnnotation`/`listEntryAnnotationsRaw` writer, which is the right shape; the doctor-rule test does not. A reasonable fix: extract the journal-history path into one shared resolver in `@/journal` and import it from `read.ts`, `append.ts`, and the rule; and add one test case that writes a malformed anchor *through the real append path* (or as close as the writer allows) and asserts the rule still surfaces it — so the rule and writer are pinned to the same layout by the test, not by coincidence.

---

### Safety-net rule silently skips malformed anchors when `entryId` or the annotation `id` is absent

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   low
Surface:    `packages/core/src/doctor/rules/entry-anchor-shape.ts:60-78` (`extractCommentAnchorEvent`)

`extractCommentAnchorEvent` returns `null` (skipping the event entirely) when `typeof ev.entryId !== 'string'` or `typeof ann.id !== 'string'`, *before* it ever looks at the `spatialAnchor` shape. These guards exist to populate the finding's `entryId`/`annotationId` details, but they create a blind spot: a legacy comment that has a malformed `spatialAnchor` **and** a missing/non-string `id` (or `entryId`) is exactly the kind of corrupted record this rule is meant to surface, yet it is dropped without a finding. For a rule explicitly framed as the permanent safety net for "bad data is permanent" journal corruption, skipping the most-corrupted records is the wrong default.

The practical risk is low today (no writer exists, so no such records exist), consistent with the rule's own framing. But the cost of robustness is small: when `entryId`/`id` are missing, the rule could still emit a finding using a sentinel like `"<missing-id>"` plus the offending shape, so the operator is told "there is a malformed anchor on an annotation with no usable id in `<journal-path>`" rather than told nothing. As written, the better-formed the surrounding event, the more likely the rule is to report it — which inverts the desired behavior for a data-integrity net.
