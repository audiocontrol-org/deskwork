---
id: TASK-51
title: >-
  deskwork-studio: .runtime-cache freshness check misses transitively-imported
  source changes (stale client bundles survive version bumps)
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - bug
dependencies: []
references:
  - gh-272
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Symptom

After bumping `@deskwork/studio` to a new version that fixes a client-side bug, the marketplace-installed studio continues to serve the OLD client JS bundle from `.runtime-cache/dist/` until the operator manually deletes the cache directory.

Concretely, this released v0.22.2 with a one-line fix in `plugins/deskwork-studio/public/src/entry-review/range-utils.ts` ("Pattern too long" iOS crash; commit `a5b2fa4`). After `/plugin marketplace update deskwork` brought v0.22.2 into the marketplace clone and the bin shim reinstalled `@deskwork/studio@0.22.2`, the running studio still served the pre-fix bundle. The startup banner reported:

```
deskwork-studio: built 0 client assets (12 cached) -> /Users/orion/.claude/plugins/marketplaces/deskwork/plugins/deskwork-studio/.runtime-cache/dist
```

12 cached / 0 built — the freshness check considered every output fresh, even though the underlying source HAD changed.

Manual workaround: `rm -rf <pluginRoot>/.runtime-cache` then restart. After the cache delete, the startup banner reported `built 12 client assets (0 cached)` and the fix appeared in the new bundle.

## Repro

1. Land any client-side change in a transitively-imported file under `plugins/deskwork-studio/public/src/<subdir>/` that is NOT itself an esbuild entrypoint (e.g. `entry-review/range-utils.ts`).
2. Bump + release + publish v0.X.Y.
3. From an adopter machine: `/plugin marketplace update deskwork`. The marketplace clone fetches; source files update; `node_modules/@deskwork/studio` reinstalls.
4. Restart `deskwork-studio` (or invoke it for the first time post-update).
5. Observed: startup says `built 0 client assets (N cached)`. Served JS is from the pre-update build. The fix is invisible.
6. Expected: startup detects the source change (any source file in the transitive import graph has an mtime / hash newer than the corresponding cached bundle) and rebuilds. Banner reports `built N client assets`.

## Root cause hypothesis

Each bundle in `.runtime-cache/dist/<entrypoint>.js` ships with a sibling `<entrypoint>.js.meta.json` listing the inputs the bundle was built from. For `editorial-review-client.js.meta.json`, the inputs list ENTRYPOINT files only (`editorial-review-client.ts`, `editorial-review-editor.ts`, `lightbox.ts`, `clipboard.ts`, two `mobile-shell/*.ts` files, plus a handful of `node_modules/*` deps) — it does NOT include `entry-review/range-utils.ts`, `entry-review/annotations.ts`, or any of the other transitively-imported files under `entry-review/`.

If the startup esbuild's freshness check uses this inputs list (compare bundle mtime vs max-input-mtime), it will miss any change to a transitively-imported file because those files aren't in the list.

Verified mtimes for the relevant repro:

```
$ stat -f '%Sm %N' \
    ~/.claude/plugins/marketplaces/deskwork/plugins/deskwork-studio/public/src/entry-review/range-utils.ts \
    ~/.claude/plugins/marketplaces/deskwork/plugins/deskwork-studio/.runtime-cache/dist/editorial-review-client.js
May 22 01:25:42 2026 .../public/src/entry-review/range-utils.ts
May 16 00:07:29 2026 .../.runtime-cache/dist/editorial-review-client.js
```

Source is ~6 days newer than the bundle. A correct freshness check would have triggered a rebuild.

## Impact

- **Adopters silently run stale client code after every `/plugin marketplace update deskwork`** if the released change touched a transitively-imported file (not a direct entrypoint). The publish pipeline + version bump + bin-shim reinstall all succeed, but the studio keeps serving the old bundle. Adopters experience "the fix didn't ship" with no obvious diagnostic.
- **Surfaced during v0.22.2 dogfood** — the iOS "Pattern too long" fix did not take effect against the released artifact until the operator (manually) deleted `.runtime-cache`. The release had passed every gate (preconditions / version validate / smoke / tag / push / GitHub release publish) and the npm tarballs were correct — the failure was entirely in the post-install client-asset rebuild step.
- **The studio's startup banner reports `built 0 client assets (N cached)` as if it were the success case.** No warning, no diff, no version stamp on the bundle. Operators have no way to notice the staleness short of opening DevTools and inspecting the served JS.

## Fix options

1. **Use esbuild's full metafile output for freshness checking.** Esbuild can emit a complete `metafile` containing every transitive input. Pivot the cache-validity check off that instead of the current per-entrypoint inputs list. Cost: small — esbuild already computes this.

2. **Hash-based freshness instead of mtime-based.** Walk the source tree under `public/src/`, hash the contents, compare against a hash stored in the cache. Catches the "mtime preserved by git on file content change" edge case too. Cost: a bit more work; needs a stable hashing strategy that handles transitive imports.

3. **Invalidate the entire cache on every `@deskwork/studio` version bump.** Cheap — read the installed `@deskwork/studio@<version>` from `node_modules/@deskwork/studio/package.json`, store it alongside the cache, blow the whole cache when the version differs. Coarse but reliable; matches the bin-shim's own reinstall trigger.

4. **Always rebuild on startup (no cache).** Simplest. Cost: every startup pays the esbuild compile time (~1-2 seconds in our measurements). Trade-off: bad on slow machines / cold starts.

5. **Stamp the bundle with the package version + commit hash; surface in the banner.** Doesn't fix the staleness, but gives the operator a way to detect it. Defense-in-depth alongside one of the above.

Option 3 is probably the lowest-risk + highest-leverage: tie cache invalidation to the same signal (`@deskwork/studio` version) that already drives the bin-shim's reinstall. Option 1 is the structurally correct fix. Option 5 is worth adding regardless.

## Companion concern: the banner masks the failure

`built 0 client assets (N cached)` reads like a normal startup line. An operator scanning the banner has no signal that "0 built" might be wrong. Consider:

- Flagging `0 built` only when at least one source-tree file changed since the cache mtime (still mtime-based but flagged when ambiguous)
- Including the `@deskwork/studio` version on the banner line
- Including the bundle's source-hash digest on the banner line

## Related

- v0.22.2 release commit: `5cd4846`
- The fix that wasn't picked up: `a5b2fa4` ("guard fuzzy fallback on long anchors")
- The operator-side symptom this masked: iOS marginalia review surface still showed "Failed to load annotations: Pattern too long for this browser." after `/plugin marketplace update deskwork` and a studio restart.
- The dogfood-side rule this collides with: `.claude/rules/agent-discipline.md` "Packaging is UX — never paper over install bugs." This is precisely a packaging bug — the published artifact was correct but the post-install rebuild silently dropped the fix.
<!-- SECTION:DESCRIPTION:END -->
