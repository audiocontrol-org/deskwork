I walked the Phase 2 diff — schema invariants, loader resolution paths, preset correctness, and the packaging/build wiring. Findings below.

### `loadPipelineTemplate` interpolates an unsanitized `id` into a filesystem path — path traversal

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   medium
Surface:    `packages/core/src/pipelines/loader.ts:118-141` (`loadPipelineTemplate`), `:36-38` (`projectOverridesDir`), `packages/core/src/pipelines/types.ts:96` (`id: z.string().min(1)`)

`loadPipelineTemplate` builds both candidate paths by string-interpolating the caller-supplied `id` directly: `join(projectOverridesDir(projectRoot), \`${id}.json\`)` and `join(PLUGIN_DEFAULTS_DIR, \`${id}.json\`)`. The only guard is `id.length === 0`. There is no charset constraint — the schema validates the `id` field *inside* a loaded file, but never the *requested* id. An `id` of `"../../../../etc/some"` normalizes out of the intended directory, so `loadPipelineTemplate('../../../../tmp/evil', root)` reads an arbitrary `.json` file from disk and runs it through the schema; the id-mismatch error path (`readAndValidate` line 78) even echoes the foreign file's `id` field back to the caller, a limited info-leak.

This matters because downstream phases (3–7) resolve templates by an id that originates from operator-authored sidecar frontmatter (the lane's pipeline/template id) — exactly the untrusted-input surface AUDIT-20260529-30 dispositioned at medium for lane-id injection. A malformed sidecar `pipeline: "../../foo"` becomes a directory-escape read. A reasonable fix: validate the requested `id` against the canonical kebab-case charset (e.g. `/^[a-z0-9][a-z0-9-]*$/`) at the top of `loadPipelineTemplate` and throw before any path construction — mirroring how AUDIT-30 imported `LANE_ID_REGEX`. The same guard belongs on the `id` field in `PipelineTemplateSchema` so a stored template can't carry a traversal id either.

### `.passthrough()` silently accepts misspelled optional field names — no-silent-fallback violation

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   medium
Surface:    `packages/core/src/pipelines/types.ts:107-110` (`.passthrough()`), `:101` (`lockedStages: ...optional()`)

The schema uses blanket `.passthrough()` to tolerate a single known extra key (`$rationale`). The cost: every unknown top-level key is silently accepted, including *typos of real optional fields*. An operator authoring a custom template who writes `"lockdStages": ["Review"]` (transposed) gets zero diagnostics — `lockedStages` resolves to `undefined`, the pipeline ships with no lock gate, and the iterate verb that should be refused at the lock stage now silently permits edits. This is precisely the "fallbacks and mock data are bug factories / no silent fallbacks" discipline the project enforces (`.claude/CLAUDE.md` § Error Handling): a misconfiguration that should fail loudly instead degrades silently.

`$rationale` is a *known* field, not arbitrary passthrough. The narrower, safer shape is to declare it explicitly — `$rationale: z.string().optional()` — and drop `.passthrough()` (default strip, or `.strict()` if you want unknown keys rejected outright). Then a misspelled `lockedStages` surfaces as an unknown-key error (strict) or is at least not mistaken for the real field. As written, the loader's JSDoc claim that operators "are free to include or omit the field" undersells that they're also free to misspell `lockedStages`/`offPipelineStages` with no feedback.

### `PLUGIN_DEFAULTS_DIR` doubles as the module directory AND the preset registry — a stray `.json` becomes a phantom template

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   low
Surface:    `packages/core/src/pipelines/loader.ts:31` (`PLUGIN_DEFAULTS_DIR`), `:148-159` (`listJsonBasenames`), `:180-189` (`listAvailablePipelineTemplates`)

`listAvailablePipelineTemplates` enumerates *every* `.json` basename in `PLUGIN_DEFAULTS_DIR`, which is `dirname(import.meta.url)` — i.e. the compiled module's own directory (`dist/pipelines/` or `src/pipelines/`). The directory therefore serves two roles at once: it holds the loader/types JS modules *and* acts as the canonical preset registry. Today only the five preset JSONs live there, so it works. But any future non-template JSON that lands in `src/pipelines/` (a metadata file, a generated manifest, a `tsconfig.json` fragment, an editor's `.json` scratch) is copied to `dist/pipelines/` by the build `cp src/pipelines/*.json` step and then appears as a bogus template id in the operator picker — which fails when `loadPipelineTemplate` tries to validate it as a `PipelineTemplate`.

The coupling is invisible until someone trips it. A more robust design names the preset set explicitly (a `PRESET_IDS` constant the build also drives, or a `presets.json` index) rather than inferring the registry from "whatever `.json` files happen to sit next to the compiled module." Low severity because nothing stray exists today, but the failure mode is silent-until-broken and the enumeration result feeds an operator-facing picker.

### Verify `dist/pipelines/*.json` actually ships in the published tarball (`files` whitelist not in diff)

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   medium
Surface:    `packages/core/package.json:214-215` (`build`/`prepack` cp step); `files` whitelist (not shown in diff)

The build/prepack scripts now `mkdir -p dist/pipelines && cp src/pipelines/*.json dist/pipelines/`, so the JSON lands in `dist/` at pack time. But the whole feature depends on those JSON files being present *next to the compiled loader* in the published `@deskwork/core` package — `loadPipelineTemplate` resolves them via `import.meta.url` relative to `dist/pipelines/loader.js`. The diff does not show `package.json`'s `files` field. If `files` enumerates specific dist subpaths (a common pattern) rather than shipping `dist/` wholesale, the copied `dist/pipelines/*.json` will be excluded from the tarball, and every `loadPipelineTemplate` call in the marketplace-installed package throws "file not found" while the in-repo workspace (which runs against `src/`) and all vitest tests (which import `../../src/pipelines/loader.ts`) pass green.

This is exactly the packaging-is-UX / "tests pass while the published artifact breaks" failure mode the project's release discipline names (the v0.11.0 missing-`zod` precedent). It cannot be confirmed from this diff alone — flag it for a `npm pack --dry-run` check (or the marketplace smoke) to assert `dist/pipelines/blog-post.json` et al. appear in the file list before this ships. The test suite categorically cannot catch it because no test exercises the built `dist/` resolution path.

### `dev` watch never re-copies preset JSON after an edit (build/watch asymmetry)

Finding-ID: AUDIT-BARRAGE-claude-05
Status:     open
Severity:   low
Surface:    `packages/core/package.json:217` (`dev` script), `:214-215` (`build`/`prepack`)

`build` and `prepack` both copy `src/pipelines/*.json` into `dist/pipelines/`, but `dev` is `npm run build && tsc -b --watch`. The initial `npm run build` copies the JSON once; thereafter `tsc --watch` only recompiles `.ts` → `.js` and has no awareness of `.json` files. An operator iterating on a preset (or testing an override) during `dev` edits the JSON, sees no dist update, and runs against a stale copy — a confusing "my change didn't take" loop. Low severity (dev-only, the JSON is also readable from `src/` in source-mode), but it's the kind of asymmetry that wastes a debugging session. Either add a parallel JSON watcher (e.g. `chokidar`/`nodemon` on `src/pipelines/*.json`) or document in the script comment that JSON edits require a manual `npm run build` during dev.

### Loader resolves on case-insensitive filesystems then throws a confusing id-mismatch

Finding-ID: AUDIT-BARRAGE-claude-06
Status:     open
Severity:   low
Surface:    `packages/core/src/pipelines/loader.ts:124-138` (`loadPipelineTemplate`), `:73-78` (`readAndValidate` id check)

On macOS's default case-insensitive filesystem (the operator's stated platform — Darwin 24.6.0), `existsSync(join(PLUGIN_DEFAULTS_DIR, 'Editorial.json'))` returns true for the on-disk `editorial.json`. `loadPipelineTemplate('Editorial', root)` therefore passes the `existsSync` gate, reads `editorial.json`, then trips the `result.data.id !== expectedId` check and throws `declares id "editorial" but was loaded as "Editorial"`. The error is technically loud (good — no silent wrong-template), but it's a misleading message for what is really a case-mismatch, and the same call on a case-sensitive Linux CI box would instead throw the cleaner "not found." The behavior thus diverges by host OS, which makes a reproduction depend on the developer's filesystem. Pairing this with the charset guard recommended in claude-01 (normalize/reject non-canonical ids up front) would make the failure deterministic across platforms. Low severity — it fails closed either way.
