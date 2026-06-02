# Audit-barrage — multi-model audit prompt template

You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface bugs, design issues, missed edge cases, and code-quality concerns in the work product captured in the diff below.

You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.

## Feature under audit

graphical-entries

## Feature scope (workplan / PRD summary)

- [ ] Step 12.3.1: "Save markup" exports the composed canvas (base + markup) as PNG to `<entryDir>/scrapbook/screenshots/<comment-id>-<timestamp>-marked.png`.
- [ ] Step 12.3.2: The raw capture stays at `<comment-id>-<timestamp>.png` (untouched).
- [ ] Step 12.3.3: Comment annotation's `attachments[]` array updated to reference the marked file path.
- [ ] Step 12.3.4: Attachment metadata gains `originalAttachment: <raw-file-path>` so the operator can re-mark the raw or compare versions.

### Task 12.4: Studio rendering of marked attachments

- [ ] Step 12.4.1: Comment renders the marked version by default with a small "original" toggle in the chrome.
- [ ] Step 12.4.2: Clicking the marked version opens a full-size lightbox; clicking the toggle in the lightbox swaps to raw.

### Task 12.5: Re-mark workflow

- [ ] Step 12.5.1: Operator can re-mark an existing screenshot: opens the markup editor pre-loaded with the raw + prior markup (loaded as separate layer for further editing).
- [ ] Step 12.5.2: Save creates a new file (e.g. `<comment-id>-<timestamp>-marked-v2.png`); the comment's `attachments[]` updates to the new version; prior versions preserved in the journal.

### Task 12.6: Integration test + mobile verification

- [ ] Step 12.6.1: Tmp-fixture: capture a fixture screenshot; mark with each of the 5 tools; save; verify the marked file persists alongside raw; verify the comment renders both versions.
- [ ] Step 12.6.2: Touch-screen verification: run a Playwright test against an iPhone-class viewport; assert each tool works with touch input (no hover-only interaction).

**Acceptance Criteria:**

- [ ] Markup editor supports all five tools (arrow / box / freehand / text-label / blur-region) + undo / redo.
- [ ] Marked screenshot persists alongside the raw capture; comment annotation references both via `attachments[]` + `originalAttachment`.
- [ ] Re-mark workflow preserves prior markup versions in the journal.
- [ ] Touch-screen markup works without hover-only interactions.

## Closing milestone: scope-discovery v1 dogfood TF summary + audit handoff

**Deliverable:** Final TF entry in `tooling-feedback.md` summarizing the dogfood result (what worked / what didn't / what needs follow-up); closing comment on the feature PR linking the log; handoff to the scope-discovery team to import as `AUDIT-<date>-<NN>` entries in their audit log. Per PRD § Secondary deliverable.

### Task C.1: Aggregate TF entries + identify patterns

- [ ] Step C.1.1: Walk every TF-NNN entry in `tooling-feedback.md`; tabulate by category (A / AM / CL / GATE / DSC / MISC) + severity (high / medium / low).
- [ ] Step C.1.2: Identify recurring patterns — same root cause surfacing in multiple TF entries; promote those to GH issues if not already filed.
- [ ] Step C.1.3: Tabulate dispositions: how many TF entries closed by an in-flight fix during this feature vs how many remain open at feature-close.

### Task C.2: Write final TF summary

- [ ] Step C.2.1: Append the closure entry to `tooling-feedback.md` (next TF-NNN id) with title shape `TF-NNN · MISC · n/a · Dogfood closure summary`.
- [ ] Step C.2.2: Body: what worked (which protocol layers caught friction proactively); what didn't (which surfaces fell through to operator catch); what needs follow-up (recurring patterns justifying a v1.1 audit cycle).
- [ ] Step C.2.3: Include a one-line summary per still-open TF entry naming the gap; list closed TF entries with their closing-commit SHAs.

### Task C.3: Closing comment on the feature PR

- [ ] Step C.3.1: Comment on the graphical-entries PR linking `tooling-feedback.md` + naming the total TF count + how many promoted to GH issues.
- [ ] Step C.3.2: Tag the deskwork team for the audit-log import.

### Task C.4: Audit-log handoff

- [ ] Step C.4.1: The deskwork team imports the closure into `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` as `AUDIT-<date>-<NN>` entries — mirror of how the audiocontrol pilot's TF-001..TF-016 imported into AUDIT-20260525-05..09.
- [ ] Step C.4.2: Each AUDIT entry references its source TF entry + summarizes the friction shape + the suggested fix.
- [ ] Step C.4.3: The aggregated audit-log entries become the v1.1 workplan input for scope-discovery.

**Acceptance Criteria:**

- [ ] `tooling-feedback.md` carries a TF closure summary entry.
- [ ] The feature PR has a closing comment with TF count + promoted-issue count.
- [ ] The scope-discovery team has imported AUDIT entries derived from this feature's TF log.


## Commit subjects in the audited range

docs(graphical-entries): close AUDIT-20260602-01..06 — Tasks 1.12..1.17
fix(graphical-entries): remove dead disjunct in promote-route error mapping — AUDIT-20260602-06
fix(graphical-entries): route promote through readJsonObjectBody — AUDIT-20260602-05
fix(graphical-entries): reject non-string replyTo in new-comment parser — AUDIT-20260602-04
fix(graphical-entries): MIME-derived extension on paste/drop screenshots — AUDIT-20260602-03
fix(graphical-entries): validate relativePath shape on attach — AUDIT-20260602-02
fix(graphical-entries): validate commentId before orphan-file move in promote-route — AUDIT-20260602-01


## Recent audit-log excerpt (prior findings on this feature)

Use this to avoid re-reporting findings that have already been triaged. If a finding was previously dispositioned (`closed`, `won't-fix`, `accepted-trade-off`), don't re-litigate the disposition; only surface a new instance if the underlying shape regressed.

A reasonable fix is to mirror `read.ts`: return `[]` only on ENOENT, and either re-throw the non-ENOENT error or emit it as an `error`-severity finding ("could not read journal directory: …") so the operator sees that the check could not run rather than that it ran and found nothing.

---

## 2026-06-02 — audit-barrage lift (20260602T152049423Z-graphical-entries)

### AUDIT-20260602-01 — Orphan-promote moves + deletes the file BEFORE validating the comment exists — unknown-commentId (a handled 404 path) destroys the operator's screenshot

Finding-ID: AUDIT-20260602-01
Status:     fixed-c25d914a
Severity:   high
Surface:    `packages/studio/src/lib/screenshot-attach.ts:promoteOrphanToEntry` (the `await moveFile(orphanPath, writtenPath)` line through the trailing `attachScreenshotToCommentServer` call, ~lines 200-235)

`promoteOrphanToEntry` performs its destructive side effects in the wrong order. The sequence is: check orphan exists → `readSidecar` (entry) → `mkdir destDir` → collision check → **`await moveFile(orphanPath, writtenPath)`** (rename, which deletes the orphan) → write cross-entry sidecar → **then** `attachScreenshotToCommentServer`, which is the FIRST place the comment's existence is checked (`findCommentByIdFolded` → `throw 'unknown commentId'`). The route explicitly maps that throw to a 404 (`api.ts` promote handler, `if (msg.includes('unknown commentId')) return c.json(..., 404)`), so unknown-commentId is a *normal, expected* error path — not a corruption case.

On that path the file has already been renamed out of `screenshots-orphan/` into the entry's `scrapbook/screenshots/` dir (and a `.meta.json` sidecar possibly written), but no `edit-comment` annotation references it. The operator gets a 404 and assumes nothing happened; on retry the orphan is gone, so the route now returns `404 orphan screenshot not found` — the screenshot is unrecoverable from the orphan path and dangles unreferenced in the entry dir. The promote-route test `returns 404 when the commentId is not present` (screenshot-promote-route.test.ts) passes precisely because it never asserts the orphan survived — it confirms the 404 but not the data-loss side effect.

The fix is to validate the comment exists *before* moving the file: call `findCommentByIdFolded` (or factor the existence check out of `attachScreenshotToCommentServer`) immediately after `readSidecar`, and only proceed to `moveFile`/sidecar-write/attach once every precondition that can produce a 4xx has been checked. Add a test asserting the orphan still exists after a 404-commentId promote.

---

### AUDIT-20260602-02 — `attachScreenshotToCommentServer` stores `relativePath` verbatim with no path-shape validation, defeating the render layer's documented security boundary

Finding-ID: AUDIT-20260602-02
Status:     fixed-2a44aa07
Severity:   medium
Surface:    `packages/studio/src/lib/screenshot-attach.ts:attachScreenshotToCommentServer` (~lines 120-150); `packages/studio/src/routes/api.ts` attach route (~lines 565-595); `plugins/deskwork-studio/public/src/entry-review/sidebar-render.ts:buildAttachmentStrip` (~lines 279-322)

The attach route accepts `relativePath` and the helper validates only `typeof newRelativePath !== 'string' || newRelativePath.length === 0` — no traversal / shape check. The path is appended verbatim to `attachments[]`, persisted to the journal, and later `buildAttachmentStrip` does `img.setAttribute('src', path)` verbatim against the studio's static-file handler. The render docstring asserts *"the persistence layer's filename regex (`screenshot-persistence.ts`) is the security boundary against malformed filenames"* — but the attach route never routes through that regex. The screenshot was validated when it was first *persisted* (Step 8.3.3); the attach route then re-accepts an arbitrary client-supplied string with no guarantee it corresponds to that persisted file. A client could PATCH `attachments: ["../../../../etc/passwd"]` and the render serves it as an `<img src>` resolved by the static handler. Note the promote route *does* call `assertSafeScreenshotFilename(filename)`, so the two attach paths have inconsistent validation rigor.

The blast radius is bounded (operator-only dev tooling), but the studio binds to the Tailscale interface by default, so a tailnet peer is in reach, and the inconsistency means the render's stated invariant is false. A reasonable fix: validate `relativePath` in `attachScreenshotToCommentServer` against the same project-relative-screenshots shape the persistence layer enforces (must resolve under `<entryDir>/scrapbook/screenshots/` after normalization; reject `..` segments and absolute paths), so both the attach and promote routes share one boundary.

---

### AUDIT-20260602-03 — Paste/drop always synthesizes a `.png` filename regardless of the actual image MIME type

Finding-ID: AUDIT-20260602-03
Status:     fixed-069d100b
Severity:   medium
Surface:    `plugins/deskwork-studio/public/src/entry-review/screenshot-paste-drop.ts:persistAsOrphan` (~the `const filename = \`${timestamp}-${hash}.png\`` line) and `IMAGE_TYPES` allowlist

`IMAGE_TYPES` permits `image/png`, `image/jpeg`, `image/gif`, and `image/webp`, but `persistAsOrphan` hard-codes `.png` into the synthesized filename for every accepted blob. A dropped or pasted JPEG/GIF/WebP is written to disk as `<timestamp>-<hash>.png` containing non-PNG bytes. The studio's static handler will set `Content-Type: image/png` from the `.png` extension while serving JPEG/GIF bytes; browsers that honor `X-Content-Type-Options: nosniff` will refuse to render it, and the on-disk artifact has a lying extension that confuses any later tooling (re-mark workflow, doctor rules, manual inspection). The animation is also lost for GIF/WebP if anything keys behavior off the extension.

The fix is to derive the extension from the blob's MIME type (`image/jpeg → .jpg`, `image/gif → .gif`, `image/webp → .webp`, default `.png`) when synthesizing the filename. The server-side filename regex must then accept those extensions too — worth confirming `screenshot-persistence.ts` allows non-`.png` extensions, otherwise the allowlist of four image types is effectively a lie and the code should narrow `IMAGE_TYPES` to PNG-only to match what it can actually persist.

---

### AUDIT-20260602-04 — New-comment body parser silently drops a non-string `replyTo` instead of rejecting it, unlike the sibling `attachments` validation

Finding-ID: AUDIT-20260602-04
Status:     fixed-d84cc66f
Severity:   medium
Surface:    `packages/studio/src/routes/entry-annotation-body.ts` (the `comment` branch, the new `attachments` + `replyTo` handling, ~lines 84-120)

The new `attachments` handling correctly *rejects* a malformed shape: a non-array yields `err('comment.attachments must be an array of strings')` and a non-string member yields `err('comment.attachments entries must be strings')`. But the adjacent `replyTo` handling silently swallows malformed input: `const replyTo = typeof obj.replyTo === 'string' && obj.replyTo.length > 0 ? obj.replyTo : undefined`. If a client sends `replyTo: 123` or `replyTo: { id: '...' }` (a plausible client bug — passing the whole comment object instead of its id), the field is silently dropped and a *root* comment is created instead of the intended threaded reply. The operator sees their reply detached from its parent with no error to explain why.

Per the project's "throw errors, no silent fallbacks" guideline, the two optional fields in the same branch should fail the same way. A reasonable fix: when `obj.replyTo !== undefined && (typeof obj.replyTo !== 'string' || obj.replyTo.length === 0)`, return `err('comment.replyTo must be a non-empty string')`, matching the `attachments` shape-rejection contract.

---

### AUDIT-20260602-05 — Promote route accepts a JSON array body without error, diverging from the shared `readJsonObjectBody` helper's array rejection

Finding-ID: AUDIT-20260602-05
Status:     fixed-cd19600f
Severity:   low
Surface:    `packages/studio/src/routes/api.ts` promote-to-entry handler (the inline body parse, ~lines 605-625) vs `readJsonObjectBody` (~lines 145-160)

The new shared helper `readJsonObjectBody` explicitly rejects arrays: `if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return 400 'expected JSON object body'`. The promote route, however, parses its optional body inline and only checks `if (typeof body !== 'object' || body === null)` — `Array.isArray` is omitted, so a JSON array body (`[]`, `[1,2]`) passes the guard, then `Reflect.get(body, 'sourceEntry')` returns `undefined` and the request proceeds as a no-sourceEntry promote. The two body-parse sites that should behave identically don't. Either route the promote handler through `readJsonObjectBody` (it already exists and the comment claims it was lifted to dedupe exactly this shape), or add the `Array.isArray` check inline so the contract matches.

---

### AUDIT-20260602-06 — Dead disjunct in the promote-route error mapping

Finding-ID: AUDIT-20260602-06
Status:     fixed-07d2c85b
Severity:   low
Surface:    `packages/studio/src/routes/api.ts` promote-to-entry catch block (~lines 645-665)

The error-to-status mapping contains `if (msg.startsWith('screenshot filename') || msg === 'screenshot filename is required')`. The second disjunct is fully subsumed by the first — `'screenshot filename is required'.startsWith('screenshot filename')` is always true — so the `=== ` comparison is unreachable dead code. More broadly, this catch block is a fragile ladder of seven `msg.startsWith(...)` / `msg.includes(...)` string matches against exception messages from `screenshot-persistence.ts` / `readSidecar` / the annotation writer; any wording change in those throwers silently re-routes a 400/404/409 to a 500. Compare the attach route, which uses the up-front `lookupEntrySidecar` helper for the unknown-entry 404 rather than string-matching `'sidecar not found'` after a deep throw. Collapsing the dead disjunct is trivial; the larger hygiene point is that typed error classes (or sharing `lookupEntrySidecar` for the sidecar case) would make these mappings robust instead of string-coupled.


## Diff under audit

The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn't).

diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
index 55bae8d8..d8f5363a 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
@@ -4652,3 +4652,79 @@ The sibling reader `packages/core/src/journal/read.ts:14-20` handles the identic
 A reasonable fix is to mirror `read.ts`: return `[]` only on ENOENT, and either re-throw the non-ENOENT error or emit it as an `error`-severity finding ("could not read journal directory: …") so the operator sees that the check could not run rather than that it ran and found nothing.
 
 ---
+
+## 2026-06-02 — audit-barrage lift (20260602T152049423Z-graphical-entries)
+
+### AUDIT-20260602-01 — Orphan-promote moves + deletes the file BEFORE validating the comment exists — unknown-commentId (a handled 404 path) destroys the operator's screenshot
+
+Finding-ID: AUDIT-20260602-01
+Status:     fixed-c25d914a
+Severity:   high
+Surface:    `packages/studio/src/lib/screenshot-attach.ts:promoteOrphanToEntry` (the `await moveFile(orphanPath, writtenPath)` line through the trailing `attachScreenshotToCommentServer` call, ~lines 200-235)
+
+`promoteOrphanToEntry` performs its destructive side effects in the wrong order. The sequence is: check orphan exists → `readSidecar` (entry) → `mkdir destDir` → collision check → **`await moveFile(orphanPath, writtenPath)`** (rename, which deletes the orphan) → write cross-entry sidecar → **then** `attachScreenshotToCommentServer`, which is the FIRST place the comment's existence is checked (`findCommentByIdFolded` → `throw 'unknown commentId'`). The route explicitly maps that throw to a 404 (`api.ts` promote handler, `if (msg.includes('unknown commentId')) return c.json(..., 404)`), so unknown-commentId is a *normal, expected* error path — not a corruption case.
+
+On that path the file has already been renamed out of `screenshots-orphan/` into the entry's `scrapbook/screenshots/` dir (and a `.meta.json` sidecar possibly written), but no `edit-comment` annotation references it. The operator gets a 404 and assumes nothing happened; on retry the orphan is gone, so the route now returns `404 orphan screenshot not found` — the screenshot is unrecoverable from the orphan path and dangles unreferenced in the entry dir. The promote-route test `returns 404 when the commentId is not present` (screenshot-promote-route.test.ts) passes precisely because it never asserts the orphan survived — it confirms the 404 but not the data-loss side effect.
+
+The fix is to validate the comment exists *before* moving the file: call `findCommentByIdFolded` (or factor the existence check out of `attachScreenshotToCommentServer`) immediately after `readSidecar`, and only proceed to `moveFile`/sidecar-write/attach once every precondition that can produce a 4xx has been checked. Add a test asserting the orphan still exists after a 404-commentId promote.
+
+---
+
+### AUDIT-20260602-02 — `attachScreenshotToCommentServer` stores `relativePath` verbatim with no path-shape validation, defeating the render layer's documented security boundary
+
+Finding-ID: AUDIT-20260602-02
+Status:     fixed-2a44aa07
+Severity:   medium
+Surface:    `packages/studio/src/lib/screenshot-attach.ts:attachScreenshotToCommentServer` (~lines 120-150); `packages/studio/src/routes/api.ts` attach route (~lines 565-595); `plugins/deskwork-studio/public/src/entry-review/sidebar-render.ts:buildAttachmentStrip` (~lines 279-322)
+
+The attach route accepts `relativePath` and the helper validates only `typeof newRelativePath !== 'string' || newRelativePath.length === 0` — no traversal / shape check. The path is appended verbatim to `attachments[]`, persisted to the journal, and later `buildAttachmentStrip` does `img.setAttribute('src', path)` verbatim against the studio's static-file handler. The render docstring asserts *"the persistence layer's filename regex (`screenshot-persistence.ts`) is the security boundary against malformed filenames"* — but the attach route never routes through that regex. The screenshot was validated when it was first *persisted* (Step 8.3.3); the attach route then re-accepts an arbitrary client-supplied string with no guarantee it corresponds to that persisted file. A client could PATCH `attachments: ["../../../../etc/passwd"]` and the render serves it as an `<img src>` resolved by the static handler. Note the promote route *does* call `assertSafeScreenshotFilename(filename)`, so the two attach paths have inconsistent validation rigor.
+
+The blast radius is bounded (operator-only dev tooling), but the studio binds to the Tailscale interface by default, so a tailnet peer is in reach, and the inconsistency means the render's stated invariant is false. A reasonable fix: validate `relativePath` in `attachScreenshotToCommentServer` against the same project-relative-screenshots shape the persistence layer enforces (must resolve under `<entryDir>/scrapbook/screenshots/` after normalization; reject `..` segments and absolute paths), so both the attach and promote routes share one boundary.
+
+---
+
+### AUDIT-20260602-03 — Paste/drop always synthesizes a `.png` filename regardless of the actual image MIME type
+
+Finding-ID: AUDIT-20260602-03
+Status:     fixed-069d100b
+Severity:   medium
+Surface:    `plugins/deskwork-studio/public/src/entry-review/screenshot-paste-drop.ts:persistAsOrphan` (~the `const filename = \`${timestamp}-${hash}.png\`` line) and `IMAGE_TYPES` allowlist
+
+`IMAGE_TYPES` permits `image/png`, `image/jpeg`, `image/gif`, and `image/webp`, but `persistAsOrphan` hard-codes `.png` into the synthesized filename for every accepted blob. A dropped or pasted JPEG/GIF/WebP is written to disk as `<timestamp>-<hash>.png` containing non-PNG bytes. The studio's static handler will set `Content-Type: image/png` from the `.png` extension while serving JPEG/GIF bytes; browsers that honor `X-Content-Type-Options: nosniff` will refuse to render it, and the on-disk artifact has a lying extension that confuses any later tooling (re-mark workflow, doctor rules, manual inspection). The animation is also lost for GIF/WebP if anything keys behavior off the extension.
+
+The fix is to derive the extension from the blob's MIME type (`image/jpeg → .jpg`, `image/gif → .gif`, `image/webp → .webp`, default `.png`) when synthesizing the filename. The server-side filename regex must then accept those extensions too — worth confirming `screenshot-persistence.ts` allows non-`.png` extensions, otherwise the allowlist of four image types is effectively a lie and the code should narrow `IMAGE_TYPES` to PNG-only to match what it can actually persist.
+
+---
+
+### AUDIT-20260602-04 — New-comment body parser silently drops a non-string `replyTo` instead of rejecting it, unlike the sibling `attachments` validation
+
+Finding-ID: AUDIT-20260602-04
+Status:     fixed-d84cc66f
+Severity:   medium
+Surface:    `packages/studio/src/routes/entry-annotation-body.ts` (the `comment` branch, the new `attachments` + `replyTo` handling, ~lines 84-120)
+
+The new `attachments` handling correctly *rejects* a malformed shape: a non-array yields `err('comment.attachments must be an array of strings')` and a non-string member yields `err('comment.attachments entries must be strings')`. But the adjacent `replyTo` handling silently swallows malformed input: `const replyTo = typeof obj.replyTo === 'string' && obj.replyTo.length > 0 ? obj.replyTo : undefined`. If a client sends `replyTo: 123` or `replyTo: { id: '...' }` (a plausible client bug — passing the whole comment object instead of its id), the field is silently dropped and a *root* comment is created instead of the intended threaded reply. The operator sees their reply detached from its parent with no error to explain why.
+
+Per the project's "throw errors, no silent fallbacks" guideline, the two optional fields in the same branch should fail the same way. A reasonable fix: when `obj.replyTo !== undefined && (typeof obj.replyTo !== 'string' || obj.replyTo.length === 0)`, return `err('comment.replyTo must be a non-empty string')`, matching the `attachments` shape-rejection contract.
+
+---
+
+### AUDIT-20260602-05 — Promote route accepts a JSON array body without error, diverging from the shared `readJsonObjectBody` helper's array rejection
+
+Finding-ID: AUDIT-20260602-05
+Status:     fixed-cd19600f
+Severity:   low
+Surface:    `packages/studio/src/routes/api.ts` promote-to-entry handler (the inline body parse, ~lines 605-625) vs `readJsonObjectBody` (~lines 145-160)
+
+The new shared helper `readJsonObjectBody` explicitly rejects arrays: `if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return 400 'expected JSON object body'`. The promote route, however, parses its optional body inline and only checks `if (typeof body !== 'object' || body === null)` — `Array.isArray` is omitted, so a JSON array body (`[]`, `[1,2]`) passes the guard, then `Reflect.get(body, 'sourceEntry')` returns `undefined` and the request proceeds as a no-sourceEntry promote. The two body-parse sites that should behave identically don't. Either route the promote handler through `readJsonObjectBody` (it already exists and the comment claims it was lifted to dedupe exactly this shape), or add the `Array.isArray` check inline so the contract matches.
+
+---
+
+### AUDIT-20260602-06 — Dead disjunct in the promote-route error mapping
+
+Finding-ID: AUDIT-20260602-06
+Status:     fixed-07d2c85b
+Severity:   low
+Surface:    `packages/studio/src/routes/api.ts` promote-to-entry catch block (~lines 645-665)
+
+The error-to-status mapping contains `if (msg.startsWith('screenshot filename') || msg === 'screenshot filename is required')`. The second disjunct is fully subsumed by the first — `'screenshot filename is required'.startsWith('screenshot filename')` is always true — so the `=== ` comparison is unreachable dead code. More broadly, this catch block is a fragile ladder of seven `msg.startsWith(...)` / `msg.includes(...)` string matches against exception messages from `screenshot-persistence.ts` / `readSidecar` / the annotation writer; any wording change in those throwers silently re-routes a 400/404/409 to a 500. Compare the attach route, which uses the up-front `lookupEntrySidecar` helper for the unknown-entry 404 rather than string-matching `'sidecar not found'` after a deep throw. Collapsing the dead disjunct is trivial; the larger hygiene point is that typed error classes (or sharing `lookupEntrySidecar` for the sidecar case) would make these mappings robust instead of string-coupled.
diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
index 716c7a36..528bb656 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
@@ -1547,6 +1547,111 @@ Disposition: closed by commit `2fb0bac9` — Status flip landed immediately afte
 - [x] Test passes: N/A.
 - [x] Audit-log Status flipped to `fixed-2fb0bac9` per disposition.
 
+
+### Task 1.12 (fix-finding-AUDIT-20260602-01): AUDIT-20260602-01 — Orphan-promote moves + deletes the file BEFORE validating th…
+
+Closes AUDIT-20260602-01. Surface: `packages/studio/src/lib/screenshot-attach.ts:promoteOrphanToEntry` (the `await moveFile(orphanPath, writtenPath)` line through the trailing `attachScreenshotToCommentServer` call, ~lines 200-235). Severity: high.
+
+- [x] Step 0: working-code invariant — on the success path the orphan file IS moved to the entry-anchored dir AND the comment's `attachments[]` is updated; the fix reorders the precondition checks without disturbing that flow.
+- [x] Step 1: bug-repro test landed at `packages/studio/test/screenshot-promote-route.test.ts` (`preserves the orphan file when commentId is unknown (AUDIT-20260602-01)`).
+- [x] Step 1b: regression-lock test landed at `packages/studio/test/screenshot-promote-route.test.ts` (`still moves the orphan to the destination on the success path (AUDIT-20260602-01 regression-lock)`).
+- [x] Step 2: bug-repro confirmed failing against pre-fix code (ENOENT on the orphan stat — file was already consumed); regression-lock confirmed passing against pre-fix.
+- [x] Step 3: fix implemented in `packages/studio/src/lib/screenshot-attach.ts:promoteOrphanToEntry` — `findCommentByIdFolded` lookup moved upstream of `mkdir`/`moveFile`/sidecar-write/attach.
+- [x] Step 4: bug-repro flipped to green; regression-lock stayed green; full studio suite passes 1240 → 1242 (+2 tests).
+- [x] Step 5: committed at `c25d914a` with `Closes AUDIT-20260602-01`.
+
+**Acceptance Criteria:**
+
+- [x] Failing test exists at `packages/studio/test/screenshot-promote-route.test.ts`.
+- [x] Regression-lock test exists in the same file; test block count for this finding is 2.
+- [x] `npx vitest run packages/studio/test/screenshot-promote-route.test.ts` exits 0 (11 → 12 tests pass).
+- [x] Audit-log Status flipped to `fixed-c25d914a`.
+
+
+### Task 1.13 (fix-finding-AUDIT-20260602-02): AUDIT-20260602-02 — `attachScreenshotToCommentServer` stores `relativePath` verb…
+
+Closes AUDIT-20260602-02. Surface: `packages/studio/src/lib/screenshot-attach.ts:attachScreenshotToCommentServer` (~lines 120-150); `packages/studio/src/routes/api.ts` attach route (~lines 565-595); `plugins/deskwork-studio/public/src/entry-review/sidebar-render.ts:buildAttachmentStrip` (~lines 279-322). Severity: medium.
+
+- [x] Step 1: 4 new bug-repro cases landed at `packages/studio/test/screenshot-attach-route.test.ts` — parent-dir traversal, absolute path, sibling-entry decoy, malformed filename.
+- [x] Step 2: all four returned 200 against pre-fix code (the route stored `../../../../etc/passwd` verbatim) — bug confirmed.
+- [x] Step 3: fix implemented — new `assertSafeAttachmentRelativePath(projectRoot, entry, relativePath)` helper exported from `screenshot-persistence.ts`; called from `attachScreenshotToCommentServer`. `mapAnnotationWriteError` extended to map `relativePath ...` + `screenshot filename ...` throws to 400.
+- [x] Step 4: all four bug-repro cases return 400 post-fix; full studio suite 1242 → 1246 (+4 tests).
+- [x] Step 5: committed at `2a44aa07` with `Closes AUDIT-20260602-02`.
+
+**Acceptance Criteria:**
+
+- [x] Failing test exists at `packages/studio/test/screenshot-attach-route.test.ts`.
+- [x] `npx vitest run packages/studio/test/screenshot-attach-route.test.ts` exits 0 (9 → 13 tests pass).
+- [x] Audit-log Status flipped to `fixed-2a44aa07`.
+
+
+### Task 1.14 (fix-finding-AUDIT-20260602-03): AUDIT-20260602-03 — Paste/drop always synthesizes a `.png` filename regardless o…
+
+Closes AUDIT-20260602-03. Surface: `plugins/deskwork-studio/public/src/entry-review/screenshot-paste-drop.ts:persistAsOrphan` (~the `const filename = \`${timestamp}-${hash}.png\`` line) and `IMAGE_TYPES` allowlist. Severity: medium.
+
+- [x] Step 1: 3 new bug-repro cases landed at `packages/studio/test/entry-review/screenshot-paste-drop.test.ts` — image/jpeg → .jpg, image/gif → .gif, image/webp → .webp.
+- [x] Step 2: all three returned `.png` against pre-fix code (the synthesized filename was hard-coded `.png`).
+- [x] Step 3: fix implemented — new `EXTENSION_BY_MIME` table + `extensionForBlob` helper in `screenshot-paste-drop.ts`; `FILENAME_RE` in `screenshot-persistence.ts` widened to `(png|jpg|jpeg|gif|webp)`. Persistence-test contract updated to match (the `.jpg-rejected` test was the bug, not the spec).
+- [x] Step 4: all three bug-repro cases pass post-fix; full studio suite 1246 → 1248 (+3 paste-drop, -1 deleted + 2 added in persistence = +4 net new across tests).
+- [x] Step 5: committed at `069d100b` with `Closes AUDIT-20260602-03`.
+
+**Acceptance Criteria:**
+
+- [x] Failing test exists at `packages/studio/test/entry-review/screenshot-paste-drop.test.ts`.
+- [x] `npx vitest run packages/studio/test/entry-review/screenshot-paste-drop.test.ts` exits 0.
+- [x] Audit-log Status flipped to `fixed-069d100b`.
+
+
+### Task 1.15 (fix-finding-AUDIT-20260602-04): AUDIT-20260602-04 — New-comment body parser silently drops a non-string `replyTo…
+
+Closes AUDIT-20260602-04. Surface: `packages/studio/src/routes/entry-annotation-body.ts` (the `comment` branch, the new `attachments` + `replyTo` handling, ~lines 84-120). Severity: medium.
+
+- [x] Step 1: 5 new test cases landed at `packages/studio/test/entry-api.test.ts` — 3 bug-repro (replyTo: 42, replyTo: {}, replyTo: '') + 2 regression-lock (omitted replyTo persists as root, string replyTo persists as reply target).
+- [x] Step 2: all three bug-repro cases returned 200 against pre-fix code (parser silently dropped the malformed value).
+- [x] Step 3: fix implemented in `packages/studio/src/routes/entry-annotation-body.ts` — replyTo handling switched from silent-fallback to `err('comment.replyTo must be a non-empty string')` on malformed shape, matching the sibling `attachments` contract.
+- [x] Step 4: all 3 bug-repro cases return 400 post-fix; regression-lock cases stay green. Full studio suite 1248 → 1253 (+5 tests).
+- [x] Step 5: committed at `d84cc66f` with `Closes AUDIT-20260602-04`.
+
+**Acceptance Criteria:**
+
+- [x] Failing test exists at `packages/studio/test/entry-api.test.ts`.
+- [x] `npx vitest run packages/studio/test/entry-api.test.ts` exits 0 (7 → 12 tests pass).
+- [x] Audit-log Status flipped to `fixed-d84cc66f`.
+
+
+### Task 1.16 (fix-finding-AUDIT-20260602-05): AUDIT-20260602-05 — Promote route accepts a JSON array body without error, diver…
+
+Closes AUDIT-20260602-05. Surface: `packages/studio/src/routes/api.ts` promote-to-entry handler (the inline body parse, ~lines 605-625) vs `readJsonObjectBody` (~lines 145-160). Severity: low.
+
+- [x] Step 1: new bug-repro test landed at `packages/studio/test/screenshot-promote-route.test.ts` — POST with JSON array body returns 400.
+- [x] Step 2: pre-fix code returned 200 (the inline parse only checked `typeof === 'object'` without `Array.isArray`).
+- [x] Step 3: fix implemented — replaced the inline parse with a call to the shared `readJsonObjectBody` helper, which uniformly rejects arrays.
+- [x] Step 4: bug-repro returns 400 post-fix; full studio suite 1253 → 1254 (+1 test).
+- [x] Step 5: committed at `cd19600f` with `Closes AUDIT-20260602-05`.
+
+**Acceptance Criteria:**
+
+- [x] Failing test exists at `packages/studio/test/screenshot-promote-route.test.ts`.
+- [x] `npx vitest run packages/studio/test/screenshot-promote-route.test.ts` exits 0 (12 tests pass).
+- [x] Audit-log Status flipped to `fixed-cd19600f`.
+
+
+### Task 1.17 (fix-finding-AUDIT-20260602-06): AUDIT-20260602-06 — Dead disjunct in the promote-route error mapping
+
+Closes AUDIT-20260602-06. Surface: `packages/studio/src/routes/api.ts` promote-to-entry catch block (~lines 645-665). Severity: low.
+
+- [x] Step 1: new regression-lock test landed at `packages/studio/test/screenshot-promote-route.test.ts` — asserts two filename-* throw shapes (forbidden-chars `..hop.png`, bad extension `bad.txt`) still map to 400 after the disjunct collapse.
+- [x] Step 2: the dead disjunct was unreachable code rather than a behaviour bug — the regression-lock test pins the remaining `msg.startsWith('screenshot filename')` mapping so the collapse can be verified.
+- [x] Step 3: fix implemented — collapsed `if (msg.startsWith('screenshot filename') || msg === 'screenshot filename is required')` to `if (msg.startsWith('screenshot filename'))`. The architectural concern (string-coupled error mapping) is logged in the audit-log entry for a separate refactor pass.
+- [x] Step 4: regression-lock pass; full studio suite 1254 → 1255 (+1 test).
+- [x] Step 5: committed at `07d2c85b` with `Closes AUDIT-20260602-06`.
+
+**Acceptance Criteria:**
+
+- [x] Failing test exists at `packages/studio/test/screenshot-promote-route.test.ts`.
+- [x] `npx vitest run packages/studio/test/screenshot-promote-route.test.ts` exits 0 (13 tests pass).
+- [x] Audit-log Status flipped to `fixed-07d2c85b`.
+
 ### Task 1.7 (fix-finding-AUDIT-20260601-07): AUDIT-20260601-07 — spatialAnchor schema accepts semantically-invalid per-kind combinations
 
 Closes AUDIT-20260601-07 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02 + codex-03; cross-model). Surface: `packages/core/src/schema/draft-annotation.ts:39-46` (`SpatialAnchorSchema`); docstring claims at `review/types.ts:69-72` and `draft-annotation.ts:34-37`.
diff --git a/packages/studio/src/lib/screenshot-attach.ts b/packages/studio/src/lib/screenshot-attach.ts
index cc17c143..94e32b7c 100644
--- a/packages/studio/src/lib/screenshot-attach.ts
+++ b/packages/studio/src/lib/screenshot-attach.ts
@@ -42,6 +42,7 @@ import type {
   DraftAnnotation,
 } from '@deskwork/core/review/types';
 import {
+  assertSafeAttachmentRelativePath,
   assertSafeScreenshotFilename,
   entryScreenshotsDir,
   orphanScreenshotsDir,
@@ -126,6 +127,13 @@ export async function attachScreenshotToCommentServer(
   if (typeof newRelativePath !== 'string' || newRelativePath.length === 0) {
     throw new Error('newRelativePath is required');
   }
+  // AUDIT-20260602-02 — validate the attachment path against the
+  // entry's scrapbook-screenshots dir shape. The render layer's
+  // docstring asserts the persistence-layer filename regex is the
+  // security boundary; without this check the attach route would
+  // bypass that boundary by accepting any client-supplied string.
+  const entry = await readSidecar(projectRoot, entryId);
+  assertSafeAttachmentRelativePath(projectRoot, entry, newRelativePath);
   const comment = await findCommentByIdFolded(projectRoot, entryId, commentId);
   if (comment === null) {
     throw new Error(`unknown commentId ${commentId} on entry ${entryId}`);
@@ -192,11 +200,22 @@ export async function promoteOrphanToEntry(
   }
   const entry = await readSidecar(projectRoot, entryId);
   const destDir = entryScreenshotsDir(projectRoot, entry);
-  await mkdir(destDir, { recursive: true });
   const writtenPath = join(destDir, filename);
   if (existsSync(writtenPath)) {
     throw new Error(`screenshot already exists at ${writtenPath}`);
   }
+  // AUDIT-20260602-01 — validate the comment exists BEFORE moving the
+  // file. Unknown commentId is a 404 path the route maps explicitly;
+  // if we move the orphan first, the operator's screenshot is consumed
+  // out of the orphan dir and on retry the route now returns "orphan
+  // screenshot not found" — unrecoverable. Every 4xx-shaped precondition
+  // (sidecar lookup, commentId existence, dest collision) is checked
+  // before any destructive side-effect.
+  const comment = await findCommentByIdFolded(projectRoot, entryId, commentId);
+  if (comment === null) {
+    throw new Error(`unknown commentId ${commentId} on entry ${entryId}`);
+  }
+  await mkdir(destDir, { recursive: true });
   await moveFile(orphanPath, writtenPath);
   const rel = relative(projectRoot, writtenPath);
   const relativeWrittenPath =
diff --git a/packages/studio/src/lib/screenshot-persistence.ts b/packages/studio/src/lib/screenshot-persistence.ts
index 1c5daad4..7a3b7642 100644
--- a/packages/studio/src/lib/screenshot-persistence.ts
+++ b/packages/studio/src/lib/screenshot-persistence.ts
@@ -38,28 +38,34 @@
 
 import { existsSync } from 'node:fs';
 import { mkdir, rename, writeFile } from 'node:fs/promises';
-import { basename, dirname, isAbsolute, join, relative } from 'node:path';
+import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
 import { readSidecar } from '@deskwork/core/sidecar';
 import type { Entry } from '@deskwork/core/schema/entry';
 import { resolveIndexPath } from './entry-resolver.ts';
 
 /**
  * Tight filename regex. Permits:
- *   - UUID-prefixed entry-anchored form (`<uuid>-<timestamp>.png`).
- *   - Orphan timestamp+hash form (`<timestamp>-<hash>.png`).
+ *   - UUID-prefixed entry-anchored form (`<uuid>-<timestamp>.<ext>`).
+ *   - Orphan timestamp+hash form (`<timestamp>-<hash>.<ext>`).
+ *
+ * AUDIT-20260602-03 — the extension is one of png / jpg / jpeg / gif
+ * / webp so the IMAGE_TYPES allowlist on the paste/drop client side
+ * is honoured end-to-end. The server's static-file handler maps the
+ * extension to Content-Type, so the on-disk extension matching the
+ * bytes is load-bearing for correct rendering.
  *
  * Rejects:
  *   - Path separators (`/`, `\`).
  *   - Parent-dir hops (`..`).
  *   - Leading dot.
- *   - Non-png extension.
+ *   - Any extension outside the allowlist.
  *   - Empty strings.
  *
  * The two valid forms share a regex shape: 1+ non-separator chars
- * ending in `.png`, with at least one hyphen separating the prefix
+ * ending in `.<ext>`, with at least one hyphen separating the prefix
  * from the timestamp / hash.
  */
-const FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9-]+\.png$/;
+const FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9-]+\.(png|jpg|jpeg|gif|webp)$/;
 
 export interface PersistResult {
   /** Absolute path the bytes were written to. */
@@ -123,6 +129,58 @@ export function orphanScreenshotsDir(projectRoot: string): string {
   return join(projectRoot, '.deskwork', 'screenshots-orphan');
 }
 
+/**
+ * AUDIT-20260602-02 — Validate that a client-supplied attachment
+ * `relativePath` resolves to a file directly under the entry's
+ * scrapbook-screenshots dir, with a filename that satisfies
+ * `assertSafeScreenshotFilename`.
+ *
+ * Throws a descriptive error on mismatch — the attach route maps the
+ * throw to a 400. The check is the same security boundary the
+ * persistence layer enforces at write time; this helper extends it to
+ * the attach surface so a client can't bypass the persistence regex
+ * by attaching an arbitrary path string after the fact.
+ *
+ * The route's documented contract:
+ *   - relativePath must be project-root-relative (no absolute path).
+ *   - relativePath must not contain `..` segments.
+ *   - relativePath, resolved against projectRoot, must equal
+ *     `<entryScreenshotsDir>/<filename>` exactly.
+ *   - `<filename>` (the basename) must pass the persistence-layer
+ *     filename regex.
+ */
+export function assertSafeAttachmentRelativePath(
+  projectRoot: string,
+  entry: Entry,
+  relativePath: string,
+): void {
+  if (typeof relativePath !== 'string' || relativePath.length === 0) {
+    throw new Error('relativePath (non-empty string) is required');
+  }
+  if (isAbsolute(relativePath)) {
+    throw new Error(
+      `relativePath must be project-root-relative (got absolute: ${JSON.stringify(relativePath)})`,
+    );
+  }
+  if (relativePath.includes('..')) {
+    throw new Error(
+      `relativePath must not contain '..' segments (got ${JSON.stringify(relativePath)})`,
+    );
+  }
+  const expectedDir = entryScreenshotsDir(projectRoot, entry);
+  const resolved = resolve(projectRoot, relativePath);
+  const resolvedDir = dirname(resolved);
+  if (resolvedDir !== expectedDir) {
+    throw new Error(
+      `relativePath must resolve under ${expectedDir} (got ${JSON.stringify(relativePath)} resolving to ${resolvedDir})`,
+    );
+  }
+  // The basename portion must satisfy the same regex the persistence
+  // layer enforces at write time — sharing one boundary between
+  // persist + attach.
+  assertSafeScreenshotFilename(basename(resolved));
+}
+
 /**
  * Persist `bytes` to the entry's scrapbook-screenshots dir under
  * `filename`. Looks up the entry's sidecar to resolve the dir; refuses
diff --git a/packages/studio/src/routes/api.ts b/packages/studio/src/routes/api.ts
index 02997d1f..836d2ad1 100644
--- a/packages/studio/src/routes/api.ts
+++ b/packages/studio/src/routes/api.ts
@@ -140,6 +140,16 @@ function mapAnnotationWriteError(c: Context, err: unknown): Response {
   if (msg.includes('unknown commentId')) {
     return c.json({ error: msg }, 404);
   }
+  // AUDIT-20260602-02 — relativePath shape / filename-regex throws
+  // are validation failures; map to 400. The attach helper validates
+  // the path against the entry's scrapbook-screenshots dir before
+  // appending; any throw from that boundary is a client-input issue.
+  if (
+    msg.startsWith('relativePath ') ||
+    msg.startsWith('screenshot filename')
+  ) {
+    return c.json({ error: msg }, 400);
+  }
   return c.json({ error: msg }, 500);
 }
 
@@ -626,20 +636,18 @@ export function createApiRouter(ctx: StudioContext): Hono {
       const idsResult = readValidEntryAndCommentIds(c);
       if (idsResult instanceof Response) return idsResult;
       const { entryId, commentId } = idsResult;
-      let body: unknown = {};
-      // Body is optional. Only attempt JSON parse when content-type
-      // hints at it — a bare POST without a body is the in-entry
-      // (non-cross-entry) common case.
+      // AUDIT-20260602-05 — route the optional body through the
+      // shared readJsonObjectBody helper so arrays + non-object
+      // shapes are rejected with the same contract every sibling
+      // route enforces. The body is OPTIONAL, so only call the
+      // helper when content-type hints at JSON; a bare POST is the
+      // common in-entry case.
+      let body: Record<string, unknown> = {};
       const contentType = c.req.header('content-type') ?? '';
       if (contentType.toLowerCase().includes('application/json')) {
-        try {
-          body = await c.req.json();
-        } catch {
-          return c.json({ error: 'invalid JSON body' }, 400);
-        }
-        if (typeof body !== 'object' || body === null) {
-          return c.json({ error: 'expected JSON object body' }, 400);
-        }
+        const parsed = await readJsonObjectBody(c);
+        if (parsed instanceof Response) return parsed;
+        body = parsed;
       }
       const sourceRaw = Reflect.get(body, 'sourceEntry');
       const sourceEntry =
@@ -669,7 +677,12 @@ export function createApiRouter(ctx: StudioContext): Hono {
         if (msg.startsWith('malformed ')) {
           return c.json({ error: msg }, 400);
         }
-        if (msg.startsWith('screenshot filename') || msg === 'screenshot filename is required') {
+        // AUDIT-20260602-06 — the prior shape included a
+        // `|| msg === 'screenshot filename is required'` disjunct
+        // that was always subsumed by msg.startsWith('screenshot
+        // filename'). Removed. Every screenshot-filename-* throw from
+        // screenshot-persistence.ts starts with the same prefix.
+        if (msg.startsWith('screenshot filename')) {
           return c.json({ error: msg }, 400);
         }
         if (msg.startsWith('orphan screenshot not found')) {
diff --git a/packages/studio/src/routes/entry-annotation-body.ts b/packages/studio/src/routes/entry-annotation-body.ts
index c0b872eb..2f7d6c71 100644
--- a/packages/studio/src/routes/entry-annotation-body.ts
+++ b/packages/studio/src/routes/entry-annotation-body.ts
@@ -101,10 +101,18 @@ export function parseEntryAnnotationBody(body: unknown): ParseResult {
         }
         attachments = arr;
       }
-      const replyTo =
-        typeof obj.replyTo === 'string' && obj.replyTo.length > 0
-          ? obj.replyTo
-          : undefined;
+      // AUDIT-20260602-04 — reject a malformed replyTo with 400
+      // instead of silently dropping it. The sibling `attachments`
+      // validation already enforces shape-rejection; replyTo follows
+      // the same contract so an operator's threaded reply can't be
+      // turned into a detached root comment by a client bug.
+      let replyTo: string | undefined;
+      if (obj.replyTo !== undefined) {
+        if (typeof obj.replyTo !== 'string' || obj.replyTo.length === 0) {
+          return err('comment.replyTo must be a non-empty string');
+        }
+        replyTo = obj.replyTo;
+      }
       const draft: AnnotationDraftFromBody = {
         type: 'comment',
         workflowId,
diff --git a/packages/studio/test/entry-api.test.ts b/packages/studio/test/entry-api.test.ts
index 09b005f3..3a33370d 100644
--- a/packages/studio/test/entry-api.test.ts
+++ b/packages/studio/test/entry-api.test.ts
@@ -173,6 +173,121 @@ describe('POST /api/dev/editorial-review/entry/:entryId/annotate', () => {
     );
     expect(status).toBe(400);
   });
+
+  // AUDIT-20260602-04 — Bug-repro: a non-string replyTo on a new
+  // comment is a malformed shape and MUST be rejected with 400 (same
+  // contract as the sibling `attachments` validation). Pre-fix the
+  // parser silently dropped non-string replyTo, creating a root
+  // comment instead of the intended reply — operator's threaded reply
+  // appears detached with no error to explain why.
+  it(
+    'returns 400 when comment.replyTo is a non-string value (AUDIT-20260602-04)',
+    async () => {
+      await writeSidecar(projectRoot, entry('Drafting'));
+      const app = createApp({ projectRoot, config: cfg });
+      const { status, body } = await postJson(
+        app,
+        `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotate`,
+        {
+          type: 'comment',
+          workflowId: ENTRY_UUID,
+          version: 1,
+          range: { start: 0, end: 4 },
+          text: 'reply',
+          replyTo: 42,
+        },
+      );
+      expect(status).toBe(400);
+      const obj = asObj(body);
+      expect(typeof obj.error).toBe('string');
+      expect((obj.error as string).toLowerCase()).toMatch(/replyto/);
+    },
+  );
+
+  it(
+    'returns 400 when comment.replyTo is an object (AUDIT-20260602-04)',
+    async () => {
+      await writeSidecar(projectRoot, entry('Drafting'));
+      const app = createApp({ projectRoot, config: cfg });
+      const { status } = await postJson(
+        app,
+        `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotate`,
+        {
+          type: 'comment',
+          workflowId: ENTRY_UUID,
+          version: 1,
+          range: { start: 0, end: 4 },
+          text: 'reply',
+          replyTo: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
+        },
+      );
+      expect(status).toBe(400);
+    },
+  );
+
+  it(
+    'returns 400 when comment.replyTo is an empty string (AUDIT-20260602-04)',
+    async () => {
+      await writeSidecar(projectRoot, entry('Drafting'));
+      const app = createApp({ projectRoot, config: cfg });
+      const { status } = await postJson(
+        app,
+        `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotate`,
+        {
+          type: 'comment',
+          workflowId: ENTRY_UUID,
+          version: 1,
+          range: { start: 0, end: 4 },
+          text: 'reply',
+          replyTo: '',
+        },
+      );
+      expect(status).toBe(400);
+    },
+  );
+
+  it(
+    'accepts an omitted replyTo (existing root-comment contract holds)',
+    async () => {
+      await writeSidecar(projectRoot, entry('Drafting'));
+      const app = createApp({ projectRoot, config: cfg });
+      const { status } = await postJson(
+        app,
+        `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotate`,
+        {
+          type: 'comment',
+          workflowId: ENTRY_UUID,
+          version: 1,
+          range: { start: 0, end: 4 },
+          text: 'root',
+        },
+      );
+      expect(status).toBe(200);
+    },
+  );
+
+  it(
+    'accepts a string replyTo (existing reply contract holds)',
+    async () => {
+      await writeSidecar(projectRoot, entry('Drafting'));
+      const app = createApp({ projectRoot, config: cfg });
+      const { status, body } = await postJson(
+        app,
+        `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotate`,
+        {
+          type: 'comment',
+          workflowId: ENTRY_UUID,
+          version: 1,
+          range: { start: 0, end: 4 },
+          text: 'reply',
+          replyTo: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
+        },
+      );
+      expect(status).toBe(200);
+      const ann = asObj(asObj(body).annotation);
+      expect(ann.replyTo).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
+    },
+  );
 });
 
 describe('GET /api/dev/editorial-review/entry/:entryId/annotations', () => {
diff --git a/packages/studio/test/entry-review/screenshot-paste-drop.test.ts b/packages/studio/test/entry-review/screenshot-paste-drop.test.ts
index 867d5005..6477a766 100644
--- a/packages/studio/test/entry-review/screenshot-paste-drop.test.ts
+++ b/packages/studio/test/entry-review/screenshot-paste-drop.test.ts
@@ -179,6 +179,82 @@ describe('bindPasteHandler', () => {
     expect(onError).not.toHaveBeenCalled();
   });
 
+  // AUDIT-20260602-03 — Bug-repro: pasting a JPEG must synthesize a
+  // filename ending in .jpg, not .png. Pre-fix the handler hard-coded
+  // .png regardless of MIME type, producing a lying extension and a
+  // mismatch between Content-Type and actual bytes.
+  it(
+    'derives the .jpg extension from an image/jpeg blob (AUDIT-20260602-03)',
+    async () => {
+      mockOrphanSuccess();
+      const target = document.createElement('textarea');
+      document.body.appendChild(target);
+      const onScreenshotAttached = vi.fn();
+      bindPasteHandler(target, {
+        onScreenshotAttached,
+        now: () => new Date('2026-06-01T00:00:00.000Z'),
+      });
+      const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'paste.jpg', {
+        type: 'image/jpeg',
+      });
+      target.dispatchEvent(makeClipboardEvent(file));
+      for (let i = 0; i < 5; i += 1) {
+        await new Promise((r) => setTimeout(r, 0));
+      }
+      expect(onScreenshotAttached).toHaveBeenCalledTimes(1);
+      const call = onScreenshotAttached.mock.calls[0][0];
+      expect(call.filename).toMatch(/\.jpg$/);
+    },
+  );
+
+  it(
+    'derives the .gif extension from an image/gif blob (AUDIT-20260602-03)',
+    async () => {
+      mockOrphanSuccess();
+      const target = document.createElement('textarea');
+      document.body.appendChild(target);
+      const onScreenshotAttached = vi.fn();
+      bindPasteHandler(target, {
+        onScreenshotAttached,
+        now: () => new Date('2026-06-01T00:00:00.000Z'),
+      });
+      const file = new File([new Uint8Array([0x47, 0x49, 0x46])], 'paste.gif', {
+        type: 'image/gif',
+      });
+      target.dispatchEvent(makeClipboardEvent(file));
+      for (let i = 0; i < 5; i += 1) {
+        await new Promise((r) => setTimeout(r, 0));
+      }
+      expect(onScreenshotAttached).toHaveBeenCalledTimes(1);
+      const call = onScreenshotAttached.mock.calls[0][0];
+      expect(call.filename).toMatch(/\.gif$/);
+    },
+  );
+
+  it(
+    'derives the .webp extension from an image/webp blob (AUDIT-20260602-03)',
+    async () => {
+      mockOrphanSuccess();
+      const target = document.createElement('textarea');
+      document.body.appendChild(target);
+      const onScreenshotAttached = vi.fn();
+      bindPasteHandler(target, {
+        onScreenshotAttached,
+        now: () => new Date('2026-06-01T00:00:00.000Z'),
+      });
+      const file = new File([new Uint8Array([0x52, 0x49, 0x46, 0x46])], 'p.webp', {
+        type: 'image/webp',
+      });
+      target.dispatchEvent(makeClipboardEvent(file));
+      for (let i = 0; i < 5; i += 1) {
+        await new Promise((r) => setTimeout(r, 0));
+      }
+      expect(onScreenshotAttached).toHaveBeenCalledTimes(1);
+      const call = onScreenshotAttached.mock.calls[0][0];
+      expect(call.filename).toMatch(/\.webp$/);
+    },
+  );
+
   it('does not call onScreenshotAttached for a plain-text paste', async () => {
     const fetchSpy = mockOrphanSuccess();
     const target = document.createElement('textarea');
diff --git a/packages/studio/test/screenshot-attach-route.test.ts b/packages/studio/test/screenshot-attach-route.test.ts
index 9459ebac..411a4d75 100644
--- a/packages/studio/test/screenshot-attach-route.test.ts
+++ b/packages/studio/test/screenshot-attach-route.test.ts
@@ -228,4 +228,60 @@ describe('POST /api/dev/editorial-review/entry/:entryId/comment/:commentId/attac
     expect(status).toBe(404);
     expect(asObj(body).error).toMatch(/unknown commentId/);
   });
+
+  // AUDIT-20260602-02 — Bug-repro: the attach route MUST reject a
+  // relativePath that doesn't resolve under the entry's
+  // scrapbook/screenshots/ dir. Pre-fix the route stored the
+  // client-supplied path verbatim, defeating the render layer's
+  // documented security boundary.
+  it(
+    'returns 400 when relativePath contains a parent-dir traversal (AUDIT-20260602-02)',
+    async () => {
+      const commentId = await seedComment(projectRoot, 'note');
+      const app = createApp({ projectRoot, config: cfg });
+      const { status, body } = await postAttach(app, ENTRY_UUID, commentId, {
+        relativePath: '../../../../etc/passwd',
+      });
+      expect(status).toBe(400);
+      expect(asObj(body).error).toMatch(/relativePath/);
+    },
+  );
+
+  it(
+    'returns 400 when relativePath is absolute (AUDIT-20260602-02)',
+    async () => {
+      const commentId = await seedComment(projectRoot, 'note');
+      const app = createApp({ projectRoot, config: cfg });
+      const { status } = await postAttach(app, ENTRY_UUID, commentId, {
+        relativePath: '/etc/passwd.png',
+      });
+      expect(status).toBe(400);
+    },
+  );
+
+  it(
+    'returns 400 when relativePath points outside the entry scrapbook dir (AUDIT-20260602-02)',
+    async () => {
+      const commentId = await seedComment(projectRoot, 'note');
+      const app = createApp({ projectRoot, config: cfg });
+      // Looks like a project-relative path but resolves to a
+      // sibling entry's tree — not the attach route's contract.
+      const { status } = await postAttach(app, ENTRY_UUID, commentId, {
+        relativePath: 'docs/bar/scrapbook/screenshots/decoy.png',
+      });
+      expect(status).toBe(400);
+    },
+  );
+
+  it(
+    'returns 400 when relativePath has a malformed filename (AUDIT-20260602-02)',
+    async () => {
+      const commentId = await seedComment(projectRoot, 'note');
+      const app = createApp({ projectRoot, config: cfg });
+      const { status } = await postAttach(app, ENTRY_UUID, commentId, {
+        relativePath: 'docs/foo/scrapbook/screenshots/.hidden.png',
+      });
+      expect(status).toBe(400);
+    },
+  );
 });
diff --git a/packages/studio/test/screenshot-persistence.test.ts b/packages/studio/test/screenshot-persistence.test.ts
index 5fc9d98b..e3ebea2b 100644
--- a/packages/studio/test/screenshot-persistence.test.ts
+++ b/packages/studio/test/screenshot-persistence.test.ts
@@ -71,8 +71,34 @@ describe('assertSafeScreenshotFilename', () => {
     );
   });
 
-  it('rejects a filename without the .png extension', () => {
-    expect(() => assertSafeScreenshotFilename('foo.jpg')).toThrow(/filename/);
+  it('accepts the four image extensions (png/jpg/jpeg/gif/webp) — AUDIT-20260602-03', () => {
+    // The IMAGE_TYPES allowlist on the paste/drop client side
+    // permits all four image MIMEs; the server filename regex
+    // honours the same set so the MIME-derived extension lands on
+    // disk as the bytes themselves.
+    expect(() =>
+      assertSafeScreenshotFilename('2026-06-02T00-00-00-000Z-deadbeef.png'),
+    ).not.toThrow();
+    expect(() =>
+      assertSafeScreenshotFilename('2026-06-02T00-00-00-000Z-deadbeef.jpg'),
+    ).not.toThrow();
+    expect(() =>
+      assertSafeScreenshotFilename('2026-06-02T00-00-00-000Z-deadbeef.jpeg'),
+    ).not.toThrow();
+    expect(() =>
+      assertSafeScreenshotFilename('2026-06-02T00-00-00-000Z-deadbeef.gif'),
+    ).not.toThrow();
+    expect(() =>
+      assertSafeScreenshotFilename('2026-06-02T00-00-00-000Z-deadbeef.webp'),
+    ).not.toThrow();
+  });
+
+  it('rejects a filename with an extension outside the image allowlist', () => {
+    // .txt / .pdf / .svg are NOT permitted — IMAGE_TYPES caps the
+    // accepted shapes at png/jpeg/gif/webp.
+    expect(() => assertSafeScreenshotFilename('foo.txt')).toThrow(/filename/);
+    expect(() => assertSafeScreenshotFilename('foo.pdf')).toThrow(/filename/);
+    expect(() => assertSafeScreenshotFilename('foo.svg')).toThrow(/filename/);
   });
 
   it('rejects the empty string', () => {
diff --git a/packages/studio/test/screenshot-promote-route.test.ts b/packages/studio/test/screenshot-promote-route.test.ts
index 4700d688..43afd2f1 100644
--- a/packages/studio/test/screenshot-promote-route.test.ts
+++ b/packages/studio/test/screenshot-promote-route.test.ts
@@ -277,6 +277,152 @@ describe('POST /api/dev/editorial-review/screenshots/orphan/:filename/promote-to
     expect(asObj(body).error).toMatch(/unknown commentId/);
   });
 
+  // AUDIT-20260602-01 — Bug-repro: the destructive file move MUST NOT
+  // happen before the commentId existence check. Unknown-commentId is a
+  // normal 404 path; if the orphan file is consumed before the 404
+  // fires, the operator's screenshot is unrecoverable on retry.
+  it(
+    'preserves the orphan file when commentId is unknown (AUDIT-20260602-01)',
+    async () => {
+      await seedOrphan(projectRoot, FILENAME);
+      const app = createApp({ projectRoot, config: cfg });
+      const missingComment = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
+      const orphanPath = join(
+        projectRoot,
+        '.deskwork',
+        'screenshots-orphan',
+        FILENAME,
+      );
+      const destPath = join(
+        projectRoot,
+        'docs',
+        'foo',
+        'scrapbook',
+        'screenshots',
+        FILENAME,
+      );
+      const { status } = await postPromote(
+        app,
+        FILENAME,
+        ENTRY_UUID,
+        missingComment,
+      );
+      expect(status).toBe(404);
+      // The orphan still exists — operator can retry with the right
+      // commentId.
+      const orphanInfo = await stat(orphanPath);
+      expect(orphanInfo.size).toBe(PNG_MAGIC.length);
+      // The destination file was NOT written.
+      await expect(stat(destPath)).rejects.toThrow();
+    },
+  );
+
+  // AUDIT-20260602-01 — Regression-lock: the working-code invariant the
+  // fix preserves — when every precondition holds, the orphan IS moved
+  // to the entry-anchored path and the comment's attachments[] is
+  // updated. Pins the success-path data flow so the validation reorder
+  // can't accidentally bypass the move.
+  it(
+    'still moves the orphan to the destination on the success path (AUDIT-20260602-01 regression-lock)',
+    async () => {
+      const commentId = await seedComment(projectRoot);
+      await seedOrphan(projectRoot, FILENAME);
+      const orphanPath = join(
+        projectRoot,
+        '.deskwork',
+        'screenshots-orphan',
+        FILENAME,
+      );
+      const destPath = join(
+        projectRoot,
+        'docs',
+        'foo',
+        'scrapbook',
+        'screenshots',
+        FILENAME,
+      );
+      const app = createApp({ projectRoot, config: cfg });
+      const { status, body } = await postPromote(
+        app,
+        FILENAME,
+        ENTRY_UUID,
+        commentId,
+      );
+      expect(status).toBe(200);
+      // Orphan is gone (move semantics).
+      await expect(stat(orphanPath)).rejects.toThrow();
+      // Destination exists with the same byte count.
+      const destInfo = await stat(destPath);
+      expect(destInfo.size).toBe(PNG_MAGIC.length);
+      // attachments[] now references the moved file.
+      expect(asObj(body).attachments).toEqual([
+        `docs/foo/scrapbook/screenshots/${FILENAME}`,
+      ]);
+    },
+  );
+
+  // AUDIT-20260602-06 — Regression-lock: collapsing the dead
+  // disjunct (`|| msg === 'screenshot filename is required'`) in the
+  // promote-route error map must not regress the live path —
+  // every screenshot-filename-* throw from
+  // assertSafeScreenshotFilename starts with the prefix the remaining
+  // disjunct matches. This test pins the malformed-filename ->
+  // 400 mapping after the disjunct collapse.
+  it(
+    'maps screenshot-filename-* validation throws to 400 (AUDIT-20260602-06 regression-lock)',
+    async () => {
+      const commentId = await seedComment(projectRoot);
+      const app = createApp({ projectRoot, config: cfg });
+      // Filename with forbidden characters — triggers a
+      // `screenshot filename contains forbidden characters` throw.
+      const { status: forbiddenStatus, body: forbiddenBody } = await postPromote(
+        app,
+        '..hop.png',
+        ENTRY_UUID,
+        commentId,
+      );
+      expect(forbiddenStatus).toBe(400);
+      expect(asObj(forbiddenBody).error).toMatch(/screenshot filename/);
+      // Filename whose extension is outside the image allowlist —
+      // triggers a `screenshot filename must match` throw.
+      const { status: extStatus, body: extBody } = await postPromote(
+        app,
+        'bad.txt',
+        ENTRY_UUID,
+        commentId,
+      );
+      expect(extStatus).toBe(400);
+      expect(asObj(extBody).error).toMatch(/screenshot filename/);
+    },
+  );
+
+  // AUDIT-20260602-05 — Bug-repro: a JSON array body must be rejected
+  // with 400. Pre-fix the promote route's inline body parse omitted
+  // the Array.isArray check that the shared readJsonObjectBody helper
+  // enforces; arrays passed the typeof object guard and the route
+  // proceeded as a no-sourceEntry promote.
+  it(
+    'returns 400 when the body is a JSON array (AUDIT-20260602-05)',
+    async () => {
+      const commentId = await seedComment(projectRoot);
+      await seedOrphan(projectRoot, FILENAME);
+      const app = createApp({ projectRoot, config: cfg });
+      const res = await app.fetch(
+        new Request(
+          `http://x/api/dev/editorial-review/screenshots/orphan/${encodeURIComponent(FILENAME)}/promote-to-entry/${ENTRY_UUID}/comment/${commentId}`,
+          {
+            method: 'POST',
+            headers: { 'content-type': 'application/json' },
+            body: JSON.stringify([{ sourceEntry: SOURCE_ENTRY }]),
+          },
+        ),
+      );
+      expect(res.status).toBe(400);
+      const obj = (await res.json()) as Record<string, unknown>;
+      expect(obj.error).toMatch(/object/);
+    },
+  );
+
   it('returns 409 when an entry-anchored file of the same name already exists', async () => {
     const commentId = await seedComment(projectRoot);
     await seedOrphan(projectRoot, FILENAME);
diff --git a/plugins/deskwork-studio/public/src/entry-review/screenshot-paste-drop.ts b/plugins/deskwork-studio/public/src/entry-review/screenshot-paste-drop.ts
index a03d388d..2f729649 100644
--- a/plugins/deskwork-studio/public/src/entry-review/screenshot-paste-drop.ts
+++ b/plugins/deskwork-studio/public/src/entry-review/screenshot-paste-drop.ts
@@ -43,6 +43,31 @@ import {
 
 const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
 
+/**
+ * AUDIT-20260602-03 — derive a filename extension from the blob's
+ * MIME type. The IMAGE_TYPES allowlist enumerates the accepted
+ * shapes; this table is the parallel "what does the server-side
+ * filename regex see" mapping. Defaults to `.png` for image/png so
+ * the legacy filename shape is preserved.
+ */
+const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
+  'image/png': 'png',
+  'image/jpeg': 'jpg',
+  'image/gif': 'gif',
+  'image/webp': 'webp',
+};
+
+function extensionForBlob(blob: Blob): string {
+  const ext = EXTENSION_BY_MIME[blob.type];
+  if (ext === undefined) {
+    // The IMAGE_TYPES allowlist is the gate; extractImage* refuse
+    // unrecognised MIMEs before this function runs. Throwing here is
+    // a defense-in-depth assertion in case the gate is bypassed.
+    throw new Error(`unsupported image MIME type: ${JSON.stringify(blob.type)}`);
+  }
+  return ext;
+}
+
 export interface AttachmentEvent {
   /** Relative path the orphan-screenshot endpoint persisted to. */
   readonly relativeWrittenPath: string;
@@ -161,7 +186,11 @@ export async function persistAsOrphan(
 ): Promise<AttachmentEvent> {
   const timestamp = filesystemSafeIsoTimestamp(now());
   const hash = await shortHashOfBlob(blob);
-  const filename = `${timestamp}-${hash}.png`;
+  // AUDIT-20260602-03 — extension derived from MIME, not hard-coded
+  // .png. The server-side filename regex permits the four image
+  // extensions to keep the IMAGE_TYPES allowlist honest.
+  const ext = extensionForBlob(blob);
+  const filename = `${timestamp}-${hash}.${ext}`;
   const result = await postOrphanScreenshot(blob, filename);
   return { relativeWrittenPath: result.relativeWrittenPath, filename };
 }


## What to look for

- **Correctness bugs** — logic errors, off-by-one, null/undefined paths, race conditions, missing error handling, swallowed exceptions.
- **Design issues** — coupling between layers that should be independent, leaking abstractions, primitives that should compose but don't, configuration that should be data ending up as code.
- **Missed edge cases** — what happens with empty input? Maximum input? Concurrent calls? Partial failure? Network unavailability? Operator interrupt mid-operation? What is the behavior on a fresh install vs. an upgrade?
- **Code-quality concerns** — files growing past a reasonable cap, names that don't reveal intent, dead code, duplicated logic, magic numbers without explanation, tests that don't test the contract they claim to test.
- **Cross-cutting impact** — does this diff touch a surface that other surfaces depend on? Are those other surfaces updated? Are migrations needed? Are doctor rules / schemas / validators updated to match the new shape?
- **Documentation drift** — does the README / SKILL.md / PRD describe the behavior the code actually implements? If the spec changed, did the implementation? If the implementation changed, did the spec?
- **Operator-discipline traps** — placeholder comments, swallowed errors, hardcoded paths/values that should be configurable, fallbacks that hide failure modes, mock data outside test code. These are bug-factories per project guidelines.

## Output format

For each finding you surface, emit ONE markdown block in this exact shape:

```
### <heading: one-line summary of the finding>

Finding-ID: AUDIT-BARRAGE-<your-model-name>-<NN>
Status:     open
Severity:   <blocking | high | medium | low | informational>
Surface:    <repo-relative-path:line-range> OR <description of the surface if not anchored to a single file>

<one-to-three paragraphs of body: what the finding is, why it matters, what evidence you relied on, what a reasonable fix would look like. Be specific. Cite line numbers from the diff. If the finding is structural / cross-file, name every file affected.>
```

Number the findings sequentially (`-01`, `-02`, ...). Use `blocking` only for issues that would break the feature's stated goals in obvious ways; `high` for correctness bugs adopters will hit; `medium` for design issues that compound over time; `low` for hygiene; `informational` for context you think the operator should see but isn't itself a bug.

## If you find nothing — say so explicitly

If you walk the diff carefully and find no findings worth surfacing, emit ONE block in this shape instead:

```
### No findings

Finding-ID: AUDIT-BARRAGE-<your-model-name>-CLEAN
Status:     open
Severity:   informational
Surface:    (the entire diff)

I walked the diff for the feature named above and found no findings worth surfacing. My specific reasoning: <three-to-five sentences explaining what you checked, why those checks came back clean, and what you would have flagged if it had been present.>
```

**Do not pad with weak findings.** A confident "I checked X, Y, Z and they are clean for these reasons" is more useful to the operator than three vague low-severity notes. The cross-model diversity gives the operator independent signal; an empty clean report from your CLI is itself a signal when paired with findings from your siblings.

## Hard constraints

- **No deferral phrases.** Don't write phrases like "fix later", "address in a follow-up", or other commitments to deferred work. The dispatch-wrapper rejects these as bug-factories. If you spot a deferral phrase IN the diff, surface it as a finding.
- **Anchor findings to evidence.** A finding that says "this might be a problem" without naming the specific file + line is not actionable. Name the surface, quote the relevant code, explain what's wrong.
- **One issue per finding block.** Don't bundle multiple concerns into one entry; the operator triages each block as a discrete signal.
- **Provenance is your model name.** Replace `<your-model-name>` in the Finding-ID with the CLI you are (`claude`, `codex`, `gemini`, etc.). This is how the operator joins findings across models.
