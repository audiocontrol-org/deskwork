I walked the diff focusing on the new server helper (`screenshot-attach.ts`), the two new routes, the body-parser extension, the client paste/drop + attach modules, and the render strip. The most serious issue is a non-atomic file move on a handled error path. Findings below.

---

### Orphan-promote moves + deletes the file BEFORE validating the comment exists — unknown-commentId (a handled 404 path) destroys the operator's screenshot

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   high
Surface:    `packages/studio/src/lib/screenshot-attach.ts:promoteOrphanToEntry` (the `await moveFile(orphanPath, writtenPath)` line through the trailing `attachScreenshotToCommentServer` call, ~lines 200-235)

`promoteOrphanToEntry` performs its destructive side effects in the wrong order. The sequence is: check orphan exists → `readSidecar` (entry) → `mkdir destDir` → collision check → **`await moveFile(orphanPath, writtenPath)`** (rename, which deletes the orphan) → write cross-entry sidecar → **then** `attachScreenshotToCommentServer`, which is the FIRST place the comment's existence is checked (`findCommentByIdFolded` → `throw 'unknown commentId'`). The route explicitly maps that throw to a 404 (`api.ts` promote handler, `if (msg.includes('unknown commentId')) return c.json(..., 404)`), so unknown-commentId is a *normal, expected* error path — not a corruption case.

On that path the file has already been renamed out of `screenshots-orphan/` into the entry's `scrapbook/screenshots/` dir (and a `.meta.json` sidecar possibly written), but no `edit-comment` annotation references it. The operator gets a 404 and assumes nothing happened; on retry the orphan is gone, so the route now returns `404 orphan screenshot not found` — the screenshot is unrecoverable from the orphan path and dangles unreferenced in the entry dir. The promote-route test `returns 404 when the commentId is not present` (screenshot-promote-route.test.ts) passes precisely because it never asserts the orphan survived — it confirms the 404 but not the data-loss side effect.

The fix is to validate the comment exists *before* moving the file: call `findCommentByIdFolded` (or factor the existence check out of `attachScreenshotToCommentServer`) immediately after `readSidecar`, and only proceed to `moveFile`/sidecar-write/attach once every precondition that can produce a 4xx has been checked. Add a test asserting the orphan still exists after a 404-commentId promote.

---

### `attachScreenshotToCommentServer` stores `relativePath` verbatim with no path-shape validation, defeating the render layer's documented security boundary

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   medium
Surface:    `packages/studio/src/lib/screenshot-attach.ts:attachScreenshotToCommentServer` (~lines 120-150); `packages/studio/src/routes/api.ts` attach route (~lines 565-595); `plugins/deskwork-studio/public/src/entry-review/sidebar-render.ts:buildAttachmentStrip` (~lines 279-322)

The attach route accepts `relativePath` and the helper validates only `typeof newRelativePath !== 'string' || newRelativePath.length === 0` — no traversal / shape check. The path is appended verbatim to `attachments[]`, persisted to the journal, and later `buildAttachmentStrip` does `img.setAttribute('src', path)` verbatim against the studio's static-file handler. The render docstring asserts *"the persistence layer's filename regex (`screenshot-persistence.ts`) is the security boundary against malformed filenames"* — but the attach route never routes through that regex. The screenshot was validated when it was first *persisted* (Step 8.3.3); the attach route then re-accepts an arbitrary client-supplied string with no guarantee it corresponds to that persisted file. A client could PATCH `attachments: ["../../../../etc/passwd"]` and the render serves it as an `<img src>` resolved by the static handler. Note the promote route *does* call `assertSafeScreenshotFilename(filename)`, so the two attach paths have inconsistent validation rigor.

The blast radius is bounded (operator-only dev tooling), but the studio binds to the Tailscale interface by default, so a tailnet peer is in reach, and the inconsistency means the render's stated invariant is false. A reasonable fix: validate `relativePath` in `attachScreenshotToCommentServer` against the same project-relative-screenshots shape the persistence layer enforces (must resolve under `<entryDir>/scrapbook/screenshots/` after normalization; reject `..` segments and absolute paths), so both the attach and promote routes share one boundary.

---

### Paste/drop always synthesizes a `.png` filename regardless of the actual image MIME type

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   medium
Surface:    `plugins/deskwork-studio/public/src/entry-review/screenshot-paste-drop.ts:persistAsOrphan` (~the `const filename = \`${timestamp}-${hash}.png\`` line) and `IMAGE_TYPES` allowlist

`IMAGE_TYPES` permits `image/png`, `image/jpeg`, `image/gif`, and `image/webp`, but `persistAsOrphan` hard-codes `.png` into the synthesized filename for every accepted blob. A dropped or pasted JPEG/GIF/WebP is written to disk as `<timestamp>-<hash>.png` containing non-PNG bytes. The studio's static handler will set `Content-Type: image/png` from the `.png` extension while serving JPEG/GIF bytes; browsers that honor `X-Content-Type-Options: nosniff` will refuse to render it, and the on-disk artifact has a lying extension that confuses any later tooling (re-mark workflow, doctor rules, manual inspection). The animation is also lost for GIF/WebP if anything keys behavior off the extension.

The fix is to derive the extension from the blob's MIME type (`image/jpeg → .jpg`, `image/gif → .gif`, `image/webp → .webp`, default `.png`) when synthesizing the filename. The server-side filename regex must then accept those extensions too — worth confirming `screenshot-persistence.ts` allows non-`.png` extensions, otherwise the allowlist of four image types is effectively a lie and the code should narrow `IMAGE_TYPES` to PNG-only to match what it can actually persist.

---

### New-comment body parser silently drops a non-string `replyTo` instead of rejecting it, unlike the sibling `attachments` validation

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   medium
Surface:    `packages/studio/src/routes/entry-annotation-body.ts` (the `comment` branch, the new `attachments` + `replyTo` handling, ~lines 84-120)

The new `attachments` handling correctly *rejects* a malformed shape: a non-array yields `err('comment.attachments must be an array of strings')` and a non-string member yields `err('comment.attachments entries must be strings')`. But the adjacent `replyTo` handling silently swallows malformed input: `const replyTo = typeof obj.replyTo === 'string' && obj.replyTo.length > 0 ? obj.replyTo : undefined`. If a client sends `replyTo: 123` or `replyTo: { id: '...' }` (a plausible client bug — passing the whole comment object instead of its id), the field is silently dropped and a *root* comment is created instead of the intended threaded reply. The operator sees their reply detached from its parent with no error to explain why.

Per the project's "throw errors, no silent fallbacks" guideline, the two optional fields in the same branch should fail the same way. A reasonable fix: when `obj.replyTo !== undefined && (typeof obj.replyTo !== 'string' || obj.replyTo.length === 0)`, return `err('comment.replyTo must be a non-empty string')`, matching the `attachments` shape-rejection contract.

---

### Promote route accepts a JSON array body without error, diverging from the shared `readJsonObjectBody` helper's array rejection

Finding-ID: AUDIT-BARRAGE-claude-05
Status:     open
Severity:   low
Surface:    `packages/studio/src/routes/api.ts` promote-to-entry handler (the inline body parse, ~lines 605-625) vs `readJsonObjectBody` (~lines 145-160)

The new shared helper `readJsonObjectBody` explicitly rejects arrays: `if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return 400 'expected JSON object body'`. The promote route, however, parses its optional body inline and only checks `if (typeof body !== 'object' || body === null)` — `Array.isArray` is omitted, so a JSON array body (`[]`, `[1,2]`) passes the guard, then `Reflect.get(body, 'sourceEntry')` returns `undefined` and the request proceeds as a no-sourceEntry promote. The two body-parse sites that should behave identically don't. Either route the promote handler through `readJsonObjectBody` (it already exists and the comment claims it was lifted to dedupe exactly this shape), or add the `Array.isArray` check inline so the contract matches.

---

### Dead disjunct in the promote-route error mapping

Finding-ID: AUDIT-BARRAGE-claude-06
Status:     open
Severity:   low
Surface:    `packages/studio/src/routes/api.ts` promote-to-entry catch block (~lines 645-665)

The error-to-status mapping contains `if (msg.startsWith('screenshot filename') || msg === 'screenshot filename is required')`. The second disjunct is fully subsumed by the first — `'screenshot filename is required'.startsWith('screenshot filename')` is always true — so the `=== ` comparison is unreachable dead code. More broadly, this catch block is a fragile ladder of seven `msg.startsWith(...)` / `msg.includes(...)` string matches against exception messages from `screenshot-persistence.ts` / `readSidecar` / the annotation writer; any wording change in those throwers silently re-routes a 400/404/409 to a 500. Compare the attach route, which uses the up-front `lookupEntrySidecar` helper for the unknown-entry 404 rather than string-matching `'sidecar not found'` after a deep throw. Collapsing the dead disjunct is trivial; the larger hygiene point is that typed error classes (or sharing `lookupEntrySidecar` for the sidecar case) would make these mappings robust instead of string-coupled.
