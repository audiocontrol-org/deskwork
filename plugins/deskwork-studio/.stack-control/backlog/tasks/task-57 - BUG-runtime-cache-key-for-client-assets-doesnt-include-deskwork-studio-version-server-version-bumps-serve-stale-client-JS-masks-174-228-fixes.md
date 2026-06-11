---
id: TASK-57
title: >-
  BUG: runtime-cache key for client assets doesn't include @deskwork/studio
  version; server-version bumps serve stale client JS (masks #174 / #228 fixes)
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-231
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## BUG: studio's runtime-cache key for client assets doesn't include the @deskwork/studio version; server-version bumps serve stale client JS

### Symptom

After upgrading deskwork-studio from v0.16.0 to v0.17.1 via the marketplace and relaunching, the running server is v0.17.1 (`@deskwork/studio` in `node_modules` is v0.17.1, the launched binary resolves to that version), but the **client bundle served to the browser is still the v0.16.0 build**. Visible consequence: the Save button on the entry-review surface remains disabled with the v0.16.0-era tooltip "MODIFIED — SAVE PENDING #174", even though #174's fix shipped in v0.17.1 (commit `fix(studio): enable Save button — in-place file write per THESIS Consequence 2 (#174, #228)`).

The fix didn't fail to deliver — it landed in the v0.17.1 server source. It just never made it into the client bundle the browser actually loads.

### Root cause (probable)

The studio's startup banner shows:

```
deskwork-studio: built 0 client assets (12 cached) -> .../.runtime-cache/dist
```

The `.runtime-cache/dist/` directory holds the compiled client JS files (`editorial-review-client.js`, `editorial-review-editor.js`, etc.). On first launch under v0.16.0, those 12 files were built and cached. After the marketplace bumped the plugin to v0.17.1 and reinstalled `@deskwork/studio`, the server-side code is the new version — but `build-client-assets` saw the cache as warm (12 files present) and skipped the rebuild entirely. So the v0.17.1 server hands out v0.16.0-compiled client JS.

The cache-key heuristic almost certainly hashes the source files of the client modules without including the `@deskwork/studio` package version, the plugin manifest version, or the source-file mtimes against the new install. When the npm install replaces the source tree atomically (mtimes update, hashes change), it should invalidate the cache — but per the empirical behavior, it doesn't.

### Reproduction

1. Project with deskwork-studio v0.16.0 installed and the studio launched at least once (12 client assets are cached at `.runtime-cache/dist/`).
2. `/plugin marketplace update deskwork` → bumps deskwork-studio to v0.17.1 in the marketplace tree.
3. `/plugin install deskwork-studio@deskwork` (or wait for auto-reinstall on next launch).
4. Launch the studio.
5. Banner reports `built 0 client assets (12 cached)`.
6. Open `/dev/editorial-review/entry/<uuid>`. The Save button still has the v0.16.0 tooltip ("MODIFIED — SAVE PENDING #174") and stays disabled.

### Workaround we used

```bash
rm -rf <plugin-root>/.runtime-cache/dist
# or just rm -rf the whole .runtime-cache dir
```

Then relaunch. Banner reports `built 12 client assets (0 cached)`. Now the v0.17.1 client JS is what the browser receives, the Save button is enabled, the new tooltip ("Save the current text to disk (Cmd/Ctrl+S)") is visible, the fix works.

### Why this matters past one release

Every time a v0.X+1 fix touches client-side code (which is most of the studio's user-visible fixes), adopters who already had a prior version installed will hit this. The maintainer's verification done on a workspace dist won't reproduce it (they wipe their own caches between builds); the marketplace install is what hits stale cache.

This is also a silent failure — no error, no warning, no banner saying "client cache hit on stale source." Adopters reasonably file new issues against the v0.X+1 release for fixes that already landed.

### Acceptance

1. After a marketplace upgrade that bumps `@deskwork/studio`'s package version, the next launch rebuilds the client bundle without the operator having to clear `.runtime-cache/` by hand.
2. The cache-key heuristic includes (at minimum) `@deskwork/studio`'s package version, or the package's `node_modules` install timestamp, or hashes the actual source files post-install rather than relying on a stale snapshot.
3. The startup banner makes it obvious which version the client bundle was built FOR — e.g., `built 12 client assets for studio@0.17.1` — so a stale build is visible.

### Impact: this masks #174 / #228 (Save button) for adopters who upgraded

Per the maintainer's note on #174: *"stays open until verified against a v0.17.1 marketplace install per `.claude/rules/agent-discipline.md` formally-installed-release rule."* That verification fails out of the box for any adopter who had v0.16.0 installed first. The fix is correct; the delivery is broken.

### Related

- audiocontrol-org/deskwork#174 — Save button design (fix landed in v0.17.1)
- audiocontrol-org/deskwork#228 — Save button stays inactive (filed by us; deferred to #174's fix)
- audiocontrol-org/deskwork#77 — `build-client-assets` esbuild concurrent-boot race + non-atomic writes (Phase 23 blocker; same component, different failure mode)

### Origin

Surfaced 2026-05-06 mid-session, immediately after upgrading from v0.16.0 → v0.17.1 to verify the Save button fix per #228. Browser still showed the disabled Save button. Diagnosed via the startup banner's `built 0 client assets (12 cached)` line + comparing the served JS against the v0.17.1 source. `rm -rf .runtime-cache` + relaunch resolved it. Filing so the next adopter doesn't have to run the same diagnostic.
<!-- SECTION:DESCRIPTION:END -->
