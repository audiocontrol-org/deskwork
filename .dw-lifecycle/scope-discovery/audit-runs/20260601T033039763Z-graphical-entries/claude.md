I've now grounded my candidate findings against the actual repo. Key verifications:

- **journal-events persistence schema** (`journal-events.ts:115`): `EntryAnnotationEvent.annotation` reuses `DraftAnnotationSchema`, so the three new fields flow into the persisted journal shape automatically — **no missing surface there** (false alarm, correctly ruled out).
- **Consumer surfaces** (grep): `spatialAnchor` / `replyTo` / `attachments` appear in exactly **4 files** — schema, types, the read-bridge, and the test. No renderer, no studio surface, no doctor rule references them. The docstrings' repeated "the renderer enforces ... at use time" claim points at a consumer that does not yet exist anywhere in `packages/`.

Here are my findings.

---

### spatialAnchor schema accepts semantically-invalid per-kind combinations; the "renderer enforces at use time" it defers to does not exist

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   medium
Surface:    `packages/core/src/schema/draft-annotation.ts:39-46` (`SpatialAnchorSchema`); docstring claims at `review/types.ts:69-72` and `draft-annotation.ts:34-37`

`SpatialAnchorSchema` is a flat `z.object` with every position field independently optional: `selector`, `x`, `y` are each `.optional()` regardless of `kind`. So every one of these parses successfully today: `{kind:'pixel'}` (no coordinates), `{kind:'dom-selector'}` (no selector), `{kind:'pixel', selector:'#x'}` (selector on a pixel anchor), `{kind:'svg-element', x:1, y:2}` (coordinates on a selector anchor). The schema's own docstring acknowledges the gap — *"All fields are optional at the schema level ... the renderer enforces that the right combination is present for each `kind` at use time"* — but a grep across `packages/` shows the three new fields are referenced in only four files (the schema, the TS interface, the read-bridge, and the test). **There is no renderer.** The "enforces at use time" consumer the schema delegates correctness to does not exist, so nothing validates the combination anywhere, and these annotations land in the append-only `entry-annotation` journal (`journal-events.ts:111-116`) where bad data is permanent.

This is the bug-factory shape the project guidelines name explicitly ("never implement fallbacks ... validation gaps are bug-factories; throw instead"). The new test file reinforces the gap rather than catching it: it exercises only valid combinations plus an unknown-`kind` rejection (`draft-annotation-thread-anchor.test.ts:75-130`), never asserting that a `pixel` without coordinates or a `dom-selector` without a selector is rejected — so the loose behavior is now codified as "correct." A reasonable fix is `z.discriminatedUnion('kind', [...])` (or `.superRefine`) so `pixel` requires `x`+`y` and forbids `selector`, while `dom-selector`/`svg-element` require `selector` and forbid `x`/`y`. That moves enforcement to the one place every write path already passes through, instead of a downstream consumer that may never be written.

---

### attachments paths are unconstrained `z.array(z.string())` — absolute paths and `../` traversal pass, contradicting the field's own "relative paths under scrapbook/screenshots" contract and the journal's portability precedent

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   medium
Surface:    `packages/core/src/schema/draft-annotation.ts:72` (`attachments: z.array(z.string()).optional()`); contract docstring at `review/types.ts:134-141`

The `attachments` field is documented as *"Relative paths under `<entryDir>/scrapbook/screenshots/` ... Stored as relative paths so the entry tree is portable"* (`types.ts:134-141`), but the schema validates only that each element is a string. `['/etc/passwd']`, `['../../../../some/file.png']`, and `['scrapbook/../../escape.png']` all parse successfully. These strings are destined to be resolved against the entry directory and loaded/rendered by the studio (per Task 12.4 in the workplan, "comment renders the marked version"). Depending on the eventual resolution call, an absolute path wins outright (`path.resolve(entryDir, '/etc/passwd')` → `/etc/passwd`) and `../` traversal escapes the entry tree regardless — a portability break at minimum and a path-traversal read primitive at worst, written permanently into the append-only journal.

This directly contradicts an existing, audited precedent in the same schema family: `journal-events.ts:243-250` (AUDIT-20260530-81) records that the `lane-config-repair` event deliberately stores a **project-relative** path because *"embedding the authoring host's absolute filesystem layout would break the record the first time the project is moved, cloned, or rebuilt."* The new `attachments` field reintroduces exactly the failure that prior finding closed, with zero enforcement. The test only covers well-formed relative paths and a non-array rejection (`draft-annotation-thread-anchor.test.ts:54-72, 246-253`) — never an absolute or traversal path. A fix: a `.refine` per element rejecting `path.isAbsolute(p)` and any segment-normalized path that escapes `scrapbook/screenshots/` (or, minimally, rejecting absolute paths and `..` segments).

---

### replyTo single-level-threading invariant is documented but enforced nowhere — no referential integrity, no self-reference / cycle / tombstone-target guard

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   medium
Surface:    `packages/core/src/schema/draft-annotation.ts:69` (`replyTo: z.string().optional()`); invariant asserted at `review/types.ts:128-134`

`types.ts:128-134` states a hard invariant: *"Threading is single-level: a reply's `replyTo` always points at a root comment, never at another reply."* The schema enforces only `z.string().optional()`. Nothing — not the schema, not `applyEdits`, not any doctor rule (grep confirms no consumer references `replyTo`) — prevents: (a) a `replyTo` that points at another reply, producing the multi-level thread the doc forbids; (b) `replyTo === own id` (self-reply); (c) `replyTo` pointing at a non-existent comment id; or (d) `replyTo` pointing at a comment that a later `delete-comment` event has tombstoned (this module explicitly folds `delete-comment` tombstones — header lines 20-28). Empty-string `replyTo: ''` also passes. When the Task 12-era threading UI assumes single-level + a resolvable, live target, any of these malformed chains break rendering or orphan a reply.

Because referential integrity is cross-comment, it can't live in `DraftAnnotationSchema` alone — but that's an argument for adding a doctor rule (the project added an `entry-lane-missing` doctor rule for an analogous "field present but invalid" gate in a sibling step), not for shipping a documented invariant with no enforcement anywhere. At minimum the schema can reject the trivially-detectable cases (empty-string `replyTo`); the structural invariants (single-level, live target, no self-reference) warrant a doctor rule that walks the folded annotation set per entry. As written, the invariant is an unenforced comment — the exact "documented but unguarded" shape the project's discipline rules call out.

---

### spatialAnchor x/y lack `.nonnegative()` / `.finite()` while the sibling Range schema in the same file uses `.int().nonnegative()` — inconsistent coordinate discipline

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   low
Surface:    `packages/core/src/schema/draft-annotation.ts:44-45` (`x`/`y`) vs `:26-29` (`RangeSchema`)

In the same file, `RangeSchema` constrains its numeric fields to `z.number().int().nonnegative()` (`:27-28`), but `SpatialAnchorSchema` declares `x: z.number().optional()` and `y: z.number().optional()` (`:44-45`) with no bounds. The docstring describes `x`/`y` as *"pixel coordinates against the rendered visual's intrinsic dimensions"* (`types.ts:55-58`) — pixel coordinates against an intrinsic dimension are nonnegative and finite by definition, yet `{kind:'pixel', x:-50, y:NaN}` (or `Infinity`) parses. This is a small, isolated inconsistency rather than a correctness bug (JSON round-tripping can't carry `NaN`/`Infinity`, so on-disk data is partly protected), but a directly-constructed annotation can hold a negative or non-finite coordinate, and the divergence from the sibling schema's discipline is gratuitous. Fix: `x: z.number().nonnegative().optional()` (optionally `.finite()`), matching the Range fields' intent. Calibrated low because the practical exposure is narrow and it overlaps the same "schema too permissive" surface as AUDIT-BARRAGE-claude-01.

---

**Checks that came back clean (so the operator can read absence-of-finding as signal):** The `cloneSpatialAnchor` and `attachments`/array spreads are genuine defensive copies (no shared-reference leak). The `applyEdits` preservation of `replyTo`/`attachments`/`spatialAnchor` (`annotations.ts` diff lines 327-360) correctly mirrors the existing `anchorPrefix`/`anchorSuffix` pass-through, so an `edit-comment` no longer silently drops the new fields. The journal persistence shape is correctly auto-derived (not a missing surface). The additive-optional change is genuinely backward-compatible — the "other annotation types unaffected" test block (`:155-259`) covers all eight sibling types. `cloneSpatialAnchor`'s `StoredSpatialAnchor` parameter type is the wider (Zod-inferred) shape, so its reuse in `applyEdits` with a canonical `SpatialAnchor` argument is correct variance, not a latent type hole — I checked this specifically and chose not to flag it as it would be padding.
