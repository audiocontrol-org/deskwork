---
name: studio
description: Launch the deskwork web studio — a local dev server (default port 4321) exposing the editorial dashboard, longform review surface, scrapbook viewer, and the compositor's manual. Reads .deskwork/config.json from the current project. Use when the operator wants a browser surface for the editorial workflow rather than driving everything through CLI subcommands.
---

## Studio

Launch the deskwork studio against the current project. The studio runs as a local Hono server with no network dependencies; everything reads from / writes to the project's `.deskwork/` tree on disk.

### Step 1 — Confirm the project root

The studio reads `.deskwork/config.json` relative to a project root. Defaults to `process.cwd()` of the launched process. If the operator wants to point at a different tree, capture the absolute path before invoking.

### Step 2 — Pick a port

The default is `4321`. If the operator already runs another dev server on that port (Astro defaults to 4321 too), pick something else and pass `--port`. Common alternates: `47321`, `47323`, `8421`.

### Step 3 — Launch

Invoke the wrapper (available on PATH because it lives under the plugin's `bin/`):

```
deskwork-studio --project-root /absolute/path/to/project --port 4321
```

The wrapper resolves to a workspace-linked binary when running in dev, or to `npx -y @deskwork/studio@latest` otherwise. The first npx call pulls the package; subsequent calls are sub-second.

The server logs:

```
deskwork-studio listening on http://localhost:4321
  project root: /absolute/path/to/project
```

Press Ctrl-C to stop.

### Step 4 — Routes the operator can visit

| Path | Surface |
|---|---|
| `/` | Redirects to `/dev/editorial-studio` |
| `/dev/editorial-studio` | Dashboard — calendar across all sites, awaiting press, recent proofs, voice-drift signal |
| `/dev/editorial-review/<slug>` | Longform review (margin notes, editor, decision controls) for an active workflow |
| `/dev/editorial-review-shortform` | Shortform review desk (Reddit, LinkedIn, YouTube, Instagram) |
| `/dev/editorial-help` | The compositor's manual — reference for the editorial workflow and skill catalogue |
| `/dev/scrapbook/<site>/<slug>` | Scrapbook viewer for research artifacts attached to an entry |

### Step 5 — Report to the operator

After launch, tell them:

- The URL (`http://localhost:<port>/dev/editorial-studio`)
- Which routes to visit for the surface they asked for
- That the server reads from `.deskwork/config.json` — if no config exists, `/deskwork:install` should run first

### Notes

- The studio is **dev-only**. There is no auth and no remote-access posture; bind only to localhost. Do not expose it to the public internet.
- All mutations from the studio go through the same `@deskwork/core` handlers the CLI uses, so calendar/journal state stays consistent regardless of which surface the operator drives.
- If the wrapper fails to find a binary AND `npx` cannot reach the registry, the package isn't published yet (v0.1 not yet cut). In that case, run from the deskwork repo directly: `node_modules/.bin/deskwork-studio --project-root <path>`.
