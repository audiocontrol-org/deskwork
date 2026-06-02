### `attachments: string[]` cannot carry the required raw/marked metadata

Finding-ID: AUDIT-BARRAGE-codex-01
Status:     open
Severity:   high
Surface:    packages/core/src/review/types.ts:137-143; packages/core/src/schema/draft-annotation.ts:71-72; packages/core/test/schema/draft-annotation-thread-anchor.test.ts:56-71

The feature scope requires marked attachments to reference both the rendered marked file and the raw original via `originalAttachment`. This diff models `attachments` as a bare `string[]` in both the TypeScript type and Zod schema, and the test only asserts arrays of path strings. There is no place to store per-attachment metadata such as `{ path, originalAttachment }`, version metadata, tool metadata, or similar.

That shape will force a later incompatible schema change or an out-of-band side table to satisfy Step 12.3.4 and the re-mark workflow. A reasonable fix is to introduce an attachment object now, or a deliberate backwards-compatible union if legacy string paths must be supported, with tests proving `originalAttachment` round-trips.

### Folded edits make the new comment fields immutable, leaving no append-only update path for save/re-mark

Finding-ID: AUDIT-BARRAGE-codex-02
Status:     open
Severity:   high
Surface:    packages/core/src/schema/draft-annotation.ts:113-121; packages/core/src/entry/annotations.ts:328-357

The append-only annotation store updates comments through `edit-comment` events and `applyEdits()`, but the new `replyTo`, `attachments`, and `spatialAnchor` fields are explicitly preserved unchanged because `edit-comment` does not expose them. That means the future “Save markup updates the comment annotation’s `attachments[]`” and “Re-mark updates to the new version while preserving prior versions” flows have no normal journaled mutation path for an existing comment.

This matters because mutating the original `comment` event would violate the journal model, while emitting an `edit-comment` cannot change the attachment list. The fix should extend the edit-comment schema and folding logic for the fields that are meant to evolve, especially `attachments`, and add a folded-view test showing an attachment update wins without rewriting the original comment event.

### Attachment paths are documented as portable scrapbook-relative paths but validated as arbitrary strings

Finding-ID: AUDIT-BARRAGE-codex-03
Status:     open
Severity:   medium
Surface:    packages/core/src/review/types.ts:137-143; packages/core/src/schema/draft-annotation.ts:71-72; packages/core/test/schema/draft-annotation-thread-anchor.test.ts:155-162

The type docs say attachments are “Relative paths under `<entryDir>/scrapbook/screenshots/`” so the entry tree remains portable, but the schema accepts any string in the array. Absolute paths, `../` traversal, empty strings, and paths outside `scrapbook/screenshots/` all parse successfully. The negative test only rejects a non-array value, not invalid path contents.

That weakens the persistence contract before the renderer/lightbox starts consuming these paths. A reasonable fix is a small path schema that rejects absolute paths, empty segments, traversal, and non-`scrapbook/screenshots/` prefixes, with tests for each rejected case.
