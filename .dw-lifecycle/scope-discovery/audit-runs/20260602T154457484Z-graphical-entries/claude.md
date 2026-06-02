I've verified my strongest candidates against the actual codebase, and most are refuted — which is itself signal: the Content-Type map in `scrapbook-file.ts:34-49` correctly handles all five extensions, Hono's `serveStatic` catchall (`server.ts:476-481`) handles MIME for the verbatim-path render, the happy-path attach is covered by the existing `SCREENSHOT_PATH` 200 test, and the bundled client (`screenshot-attach.ts:110`) never emits `replyTo: null`, so the AUDIT-04 rejection is safe. The diff is genuinely clean and well-tested. Here are the residual findings worth surfacing.

### Orphan-promote still leaves an unreferenced file on a record-step failure or concurrent comment-delete — AUDIT-01's fix closed the common path but kept move-before-record

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   medium
Surface:    `packages/studio/src/lib/screenshot-attach.ts:promoteOrphanToEntry` (the `findCommentByIdFolded` guard at ~lines 211-214 → `moveFile` → `attachScreenshotToCommentServer`) and `attachScreenshotToCommentServer` (the second `readSidecar` + `findCommentByIdFolded` at ~lines 133-136)

The AUDIT-01 fix moves the *first* `findCommentByIdFolded` ahead of `moveFile`, which closes the reported unknown-commentId path. But the destructive `moveFile` still runs *before* the journal is written: the order is `moveFile` (irreversible) → cross-entry sidecar write → `attachScreenshotToCommentServer`, and `attachScreenshotToCommentServer` itself re-runs `readSidecar` + `assertSafeAttachmentRelativePath` + a *second* `findCommentByIdFolded` + the annotation append. Two residual windows remain where the orphan is consumed but no annotation references it: (a) a **concurrent comment delete** between the first check (~line 211) and the second check inside attach (~line 134) throws `unknown commentId` *after* the move — the same data-loss shape AUDIT-01 named, just under concurrency; (b) **any throw from the record steps after the move** — the new `assertSafeAttachmentRelativePath` call, the sidecar write, or the annotation append — leaves the file relocated into the entry dir with no annotation, dangling exactly as the original bug did (just in the destination dir rather than lost from the orphan dir).

The invariant the fix comment asserts ("Every 4xx-shaped precondition … is checked before any destructive side-effect") holds only for the *first* comment check; the second check inside `attachScreenshotToCommentServer` runs post-move. The structurally robust fix is to make the move the **last** irreversible step (write the annotation referencing the to-be-written path, then move; or copy → record → unlink-orphan) so a failure anywhere in the record path leaves the orphan recoverable. The probability is low (filename is pre-validated; the concurrency window is small), which is why this is medium not high — but the fix as written doesn't deliver the "no destructive side-effect before all preconditions" invariant it claims, because preconditions are re-checked after the move.

### AUDIT-03 fix is correct, but its rationale cites `X-Content-Type-Options: nosniff` protection that neither image-serving path actually sets

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   low
Surface:    `plugins/deskwork-studio/public/src/entry-review/screenshot-paste-drop.ts` (AUDIT-03 comment) and the audit-log AUDIT-20260602-03 entry; serving paths `packages/studio/src/routes/scrapbook-file.ts:130-134` and `packages/studio/src/server.ts:476-481`

The AUDIT-03 reasoning (audit-log entry and the surrounding discussion) leans on *"browsers that honor `X-Content-Type-Options: nosniff` will refuse to render it"* as the harm that motivates the honest-extension fix. The honest-extension fix is right and worth landing. But neither path that serves these bytes sets `nosniff`: `serveScrapbookFile` (`scrapbook-file.ts:130-134`) sets only `Content-Type`, `Content-Length`, `Cache-Control`; the `serveStatic({ root: ctx.projectRoot })` catchall at `server.ts:476-481` (which serves the verbatim `docs/…/screenshots/*.png` src that `buildAttachmentStrip` emits) sets no `nosniff` either. So the protection the fix's rationale invokes is not in force — a `.png`-extensioned file containing non-image bytes can still be content-sniffed by a sniffing browser when navigated directly via the catchall.

This is a pre-existing posture (the `.png`-only path had the same gap), not a regression introduced here, so it's low. But it's worth recording because the fix's stated reasoning references a header the codebase doesn't emit, which will mislead a future reader into thinking the sniffing vector is already closed. The honest fix value is real (correct Content-Type for legitimate gif/jpg/webp); the nosniff framing is aspirational. A follow-up would add `'X-Content-Type-Options': 'nosniff'` to both image responses so the cited protection actually holds.

### Promote route's array-rejection contract only fires when `content-type: application/json` is present

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   informational
Surface:    `packages/studio/src/routes/api.ts` promote-to-entry handler (the `if (contentType.toLowerCase().includes('application/json'))` guard wrapping the `readJsonObjectBody` call, ~lines 644-651)

AUDIT-05's stated goal is that the promote route reject array bodies the same way every sibling route does via `readJsonObjectBody`. The fix achieves that — but only inside the `content-type includes application/json` branch. A client that sends a JSON array body with a non-JSON content-type (e.g. `text/plain`, or no content-type header) skips the parse entirely, `body` stays `{}`, and the request proceeds as a no-sourceEntry promote — the array is never inspected. So "the two body-parse sites behave identically" is true only under the JSON content-type. The new test (`returns 400 when the body is a JSON array`) sends the `application/json` header, so it doesn't exercise the bypass.

This is informational, not a bug: the body is genuinely optional, and a mistyped content-type producing a silent no-op promote is benign (no sourceEntry → in-entry promote, the common case). I surface it only so the operator knows the array-rejection guarantee is content-type-conditional, not universal — matching `readJsonObjectBody`'s own conditional invocation here.

### Diff advances none of the named feature's acceptance criteria — it is entirely the AUDIT-20260602-01..06 fix batch

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   informational
Surface:    (the entire diff vs. the stated feature scope — Tasks 12.3–12.6 + closing-milestone Task C)

The feature scope under audit names the markup editor (five tools — arrow/box/freehand/text-label/blur-region — plus undo/redo), marked-screenshot persistence with `originalAttachment`, the re-mark workflow with versioned filenames, touch-screen verification, and the closing-milestone TF summary (Tasks C.1–C.4). The diff contains zero code touching any of those: it is the AUDIT-20260602-01..06 fix batch against the screenshot **attach/promote/paste** surfaces, all of which predate Task 12.3. Every acceptance criterion in the prompt remains unaddressed by this diff.

This is legitimate — the commit range is explicitly the audit-fix batch, and the audit-fix workflow (TDD repro → fix → regression-lock → commit, one finding per commit) is followed cleanly throughout, with each fix carrying both a bug-repro and a regression-lock test. I surface it only as a triage signal: a reviewer scanning this diff for markup-editor or TF-summary progress will find none, and the `tooling-feedback.md` closure entry (Task C.2) plus the markup-editor implementation are the outstanding work the next session inherits.
