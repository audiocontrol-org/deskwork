---
id: TASK-62
title: >-
  deskwork-studio: stale running process after plugin upgrade silently 404s on
  /static/* with no log signal
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-216
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

After a plugin upgrade (e.g., `/plugin install deskwork-studio@deskwork` followed by `/reload-plugins` in Claude Code) that moves the studio's install directory, an already-running studio process keeps serving HTML but silently 404s on every `/static/*` request. The symptom is "HTML loads but the page looks completely unstyled" — no CSS, no client JS — with **no error in the studio's own logs** to indicate why.

## Repro

1. Install deskwork-studio: `/plugin install deskwork-studio@deskwork` and `/reload-plugins`. The plugin lands at `~/.claude/plugins/cache/deskwork/deskwork-studio/<version>/`.
2. Launch the studio: `/deskwork-studio:studio`. The studio binds to port 47321 and writes its built assets to `<install-root>/.runtime-cache/dist/`.
3. Run a plugin upgrade or `/reload-plugins` after a marketplace bump. The plugin install location moves (in my repro: from `~/.claude/plugins/cache/deskwork/deskwork-studio/0.16.0/` to `~/.claude/plugins/marketplaces/deskwork/plugins/deskwork-studio/`). The OLD `.runtime-cache/dist/` directory is removed.
4. The studio Node process keeps running. It still has its in-memory route handlers — HTML rendering works fine — but the static-asset directory it tries to serve from is gone.
5. Open `http://localhost:47321/` in a browser.

## Observed

- Page renders raw HTML with no styling. JS modules fail to load. Looks completely broken.
- Server log is silent. No error messages. The studio process isn't aware its assets are gone.
- `curl -I http://localhost:47321/static/css/editorial-studio.css` → 404, but the user has no obvious clue *why* it's 404 other than seeing the unstyled page.
- The user invokes `/deskwork-studio:studio` again to relaunch — but the wrapper script still discovers a "running" studio (port already in use) and reports the existing instance, doubling down on the broken state.

## Expected

Either:

**Option A (preferred):** the studio detects on startup OR per-request that its asset directory is missing, exits with a clear error like:

```
deskwork-studio: dist directory missing at <path> — was the plugin moved or upgraded? Exiting; relaunch with `/deskwork-studio:studio`.
```

**Option B:** the `/deskwork-studio:studio` skill / wrapper detects on launch that an already-running studio process is bound to a now-stale install path, kills it, and relaunches from the current path. Surface in the banner: `note: previous studio at <stale path> was killed before launch (plugin upgrade)`.

**Option C (cheapest):** when serving `/static/*` and the file isn't found, log a `WARN` with the disk path that was attempted. A 404 with no log makes diagnosis impossible without reaching for `lsof`.

## Diagnostic that worked (for the issue body)

```
$ pgrep -fl deskwork-studio
79151 node /Users/orion/.claude/plugins/cache/deskwork/deskwork-studio/0.16.0/...
$ ls /Users/orion/.claude/plugins/cache/deskwork/deskwork-studio/0.16.0/
ls: ... No such file or directory
```

The Node process held a file handle to a non-existent install dir. Killing PID 79151 and relaunching via the new install path (`~/.claude/plugins/marketplaces/deskwork/plugins/deskwork-studio/bin/deskwork-studio`) resolved the issue: the new process did its first-run install, rebuilt the 12 client assets in `<new-install>/.runtime-cache/dist/`, and `/static/css/editorial-studio.css` returned 200.

## Severity

Medium. Self-resolves once the operator knows the trick (kill + relaunch). But until then, the studio looks completely broken with no diagnostic guidance — and the most natural debugging path (check the server log) returns nothing useful.

## Frequency

Once per plugin upgrade. Higher for early adopters who upgrade often, low for stable users. But the failure mode is exactly when an operator has just done `/plugin install` to get an improvement they're excited about — bad first impression.

## Suggested fix priority

1. **Option C immediately** — log the missing disk path in the static-asset 404 handler. ~5 lines of code; surfaces the issue to anyone reading logs.
2. **Option A as the structural fix** — startup probe + periodic recheck (or per-request fail-fast). The Node process should not persist past the moment its dist disappears.
3. **Option B if/when the skill runtime supports cross-process introspection** — nice-to-have but not critical if A is in place.

## Linked

- Adjacent deskwork bug: [#214](https://github.com/audiocontrol-org/deskwork/issues/214) (self-description framing) — same session.
- Adjacent: [#215](https://github.com/audiocontrol-org/deskwork/issues/215) (`approve` journal/sidecar drift + calendar regenerator path bug) — same session.

---

*Filed by an AI assistant (Claude) at the user's direct request after diagnosing the issue during an active editorial-studio session. Happy to share the lsof + log artifacts that surfaced the diagnosis.*
<!-- SECTION:DESCRIPTION:END -->
