I walked the Phase 3 diff — the lane module (types/loader/bootstrap/detection), the schema broadening (`currentStage`→string, new `lane`/`artifactKind`), the journal-event additions, and the editorial-default helper widenings. Findings below.

### Lane id flows into filesystem path with no charset validation (path traversal + no canonical-charset guard)

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   medium
Surface:    `packages/core/src/lanes/loader.ts:33-49` (`laneConfigPath`), `:90-115` (`loadLaneConfig`), `packages/core/src/schema/entry.ts:148` (`lane: z.string().min(1).optional()`)

`loadLaneConfig(id, projectRoot)` builds the path via `join(lanesDir(projectRoot), \`${id}.json\`)` and the only id-guard is `id.trim().length === 0`. There is no charset validation. An `id` of `../../../../etc/something` resolves outside `.deskwork/lanes/`, and `existsSync`+`readFileSync` then read that arbitrary `.json`. The id-mismatch check (`result.data.id !== expectedId`) fires only *after* the read, so the out-of-tree read already happened.

The `id` is not always operator-typed: `EntrySchema.lane` is `z.string().min(1).optional()` — NOT regex-bound — so a malformed/hostile sidecar (`lane: "../../secrets"`) flows straight into `loadLaneConfig` at any caller that resolves an entry's lane. This is the *exact* charset gap the prior AUDIT-20260529-30 found at the studio render site and fixed there with `LANE_ID_REGEX` + a `lane-unrouted` fallback. That fix was applied downstream; the canonical chokepoint (the loader) and the schema's home (`entry.ts`) still don't enforce the charset. The right fix is here: bind `lane` (and the loader's `id` param) to the canonical lane-id regex so traversal is rejected before any path is constructed, rather than re-patching every consumer.

### `StrictLaneConfig` / `StrictPipelineTemplate` are no-op type aliases; the justifying comments misdescribe Zod `.passthrough()`

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   medium
Surface:    `packages/core/src/lanes/types.ts:69-78` (`StrictLaneConfig`), `packages/core/src/pipelines/types.ts:137-161` (`StrictPipelineTemplate`)

Both new aliases claim to "narrow" a `z.infer` type that `.passthrough()` supposedly "widens … to allow arbitrary extra keys." In Zod v3, `.passthrough()` changes only *runtime* parsing (unknown keys are preserved on the parsed object); it does **not** add a `[k: string]: unknown` index signature to the inferred static type — that requires `.catchall(z.unknown())`. So `type LaneConfig = z.infer<typeof LaneConfigSchema>` is already exactly `{ id; name; pipelineTemplate; contentDir }`, and `StrictLaneConfig = Pick<LaneConfig, 'id'|'name'|'pipelineTemplate'|'contentDir'>` is structurally identical to `LaneConfig`. The alias buys zero additional type safety, and the stated benefit ("typos like `lane.pipelineTemlpate` fail at compile time rather than silently resolving to `unknown`") is false — accessing an unknown property of `LaneConfig` is *already* a compile error because there's no index signature.

This matters because the comment asserts a behavior contributors will rely on (passing the wide type where the strict type is expected, "to catch typos"), and it ships an exported abstraction (`type StrictLaneConfig`, `type StrictPipelineTemplate` are both in the barrels) that other code may adopt under a false premise. Recommended fix: verify against the project's actual Zod version with a one-line type probe (`const _x: LaneConfig = {} as Record<string, unknown>` should error if there's no index signature). If confirmed, delete the aliases and the misdescribing comments, or — if the team genuinely wants extra-key safety — switch the schemas off `.passthrough()` to an explicit `.catchall()` and document the real behavior.

### `detectArtifactKind` classifies non-existent paths for file cases — inconsistent on-disk contract masks missing artifacts

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   medium
Surface:    `packages/core/src/lanes/detection.ts:46-77`

The module doc says the function "classifies an on-disk path," but only the `html-mockup` branch touches disk (`existsSync`/`statSync`/`index.html` probe). The `.md`, `.html`, and image branches dispatch purely on `extname` with **no existence check**. So `detectArtifactKind('/deleted/post.md')` returns `'markdown'` for a file that isn't there, while a deleted html-mockup directory falls through `existsSync(...) === false` → `extname('') ` → throws `unsupported artifact extension`.

The asymmetry produces opposite failure modes for the same root cause (missing artifact): silent success for markdown/html/image, loud throw for html-mockup. If `detectArtifactKind` is used by doctor/migration to classify entries' on-disk artifacts (the stated purpose), a deleted markdown artifact is silently reported as a valid `markdown` kind — a fallback-shaped masking of a real failure, which the project's "no silent fallbacks" rule targets. A reasonable fix: probe existence once at the top and refuse a non-existent path with a clear error, then dispatch on extension; OR explicitly document that detection is path-shape-only and disk presence is the caller's responsibility (and remove "on-disk" from the doc). Either way, make the markdown/html/image branches consistent with the html-mockup branch.

### `bootstrap` doc claims "no readable config → no-config" but only checks existence; a corrupt config throws

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   low
Surface:    `packages/core/src/lanes/bootstrap.ts:74-83`

The docblock states: *"If the project has no readable `.deskwork/config.json` (e.g. never installed), returns `{ created: false, reason: 'no-config' }`."* The code only guards `if (!existsSync(cfgPath)) return no-config;` and then calls `readConfig(projectRoot)` unguarded. A config file that exists but is corrupt (malformed JSON, schema-invalid) makes `readConfig` throw, which propagates out of `bootstrapDefaultLaneIfMissing` — contradicting the "best-effort hook, callers can invoke unconditionally at install-flow boundaries" contract the same docblock and the function-level `@throws` advertise ("never throws on the nothing-to-do cases").

Throwing on a corrupt config is arguably *correct* (no silent fallback), so the code is likely fine and the **doc is wrong** — "no readable" should be "absent." But the mismatch matters because the comment tells callers they can invoke this unconditionally; a caller wiring it into studio first-boot per that promise will get an unhandled throw on a corrupt config. Fix the doc to say the function refuses (throws) on an unreadable/corrupt config, or catch+rethrow with lane-bootstrap context.

### Schema accepts whitespace-only stage values; `min(1)` is not `trim()`

Finding-ID: AUDIT-BARRAGE-claude-05
Status:     open
Severity:   low
Surface:    `packages/core/src/schema/entry.ts:108` (`StageStringSchema = z.string().min(1)`), `packages/core/test/schema/entry.test.ts:75-101`

`StageStringSchema` is `z.string().min(1, 'stage must be a non-empty string')`, so `currentStage: '   '` (whitespace-only, length ≥ 1) parses successfully. The new test "rejects an entry with an empty-string stage" only covers `''` — there's no coverage or rejection for whitespace-only. Compare `loadLaneConfig`, which deliberately uses `id.trim().length === 0` to reject whitespace ids (loader.ts:91). The two sibling "non-empty identifier" validations disagree: lane ids reject `'   '`, stage values accept it.

A whitespace stage will silently fail every editorial-default helper (`nextStage('   ')` → null, `isLinearPipelineStage('   ')` → false) and never match a lane template's stage set, surfacing later as a confusing "stage has no successor / not in template" with no indication the value was whitespace. Recommended: `z.string().trim().min(1)` (or a `.refine(s => s.trim().length > 0)`) on `StageStringSchema`, plus a regression test for the whitespace case mirroring the empty-string one.

### `inferPriorStageFromJournal` silently changed semantics: a non-editorial `from` is now skipped instead of returned

Finding-ID: AUDIT-BARRAGE-claude-06
Status:     open
Severity:   low
Surface:    `packages/core/src/doctor/migrate.ts:248-260`

Before this diff, the loop returned `e.from` for the most-recent stage-transition whose `to` is not Blocked/Cancelled — unconditionally. Now it returns only `if (isEditorialStage(e.from))`; when `e.from` is a non-editorial value, the `if` is false and the loop **continues scanning earlier transitions** rather than returning. So the function no longer reports "the stage you were in before being blocked" when that prior stage was lane-specific — it walks past it and may return an older editorial stage, or fall through to the `'Drafting'` default.

For the editorial-only legacy migration this is a no-op (all `from` values are editorial), as the comment argues. But the behavior change is latent: the moment any journal carries a non-editorial `from` (which the same Phase 3 broadened `StageTransitionEvent.from` to `StageStringSchema` to permit — journal-events.ts:63-64), `inferPriorStageFromJournal` will silently skip it and produce a wrong prior-stage for the resume target. Since the function's whole job is to reconstruct prior state, "skip and guess Drafting" is a worse failure than surfacing the real (non-editorial) value. If the migration is genuinely editorial-only, assert/refuse on a non-editorial `from` rather than silently skipping; if it must tolerate lane stages, return the raw `from` and let the caller narrow.
