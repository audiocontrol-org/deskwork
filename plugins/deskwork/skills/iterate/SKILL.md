---
name: iterate
description: Snapshot the agent's revised content file as a new workflow version and transition back to in-review. Run after the agent has addressed operator comments by rewriting the file on disk. Works for longform (`--kind longform`), outlines (`--kind outline`), and shortform drafts (`--kind shortform`). Optionally records per-comment dispositions (addressed / deferred / wontfix) that the studio sidebar renders as badges.
---

## Iterate

Called by the agent AFTER rewriting the content file on disk to address an operator's review comments. This helper:

1. Reads the current file (SSOT: disk IS the article / outline / shortform copy)
2. Appends a new workflow version with `originatedBy: 'agent'`
3. Optionally records per-comment disposition annotations
4. Transitions the workflow back to `in-review` so the operator can review the new version

The same review pipeline drives all three content kinds — the only difference is which file disk path the helper reads back from.

### Prerequisite

The operator's `/deskwork:iterate <slug>` invocation IS the request to iterate — per THESIS Consequence 2, the studio's "Request iteration" button is a clipboard-copy of this slash command and does NOT mutate workflow state. The skill itself reads margin notes, rewrites the file, and flips the workflow back to `in-review` after appending the new version (longform/outline path).

For shortform (legacy workflow-object model): the underlying CLI requires the workflow to be in state `iterating` before snapshotting; that gate is enforced by the CLI itself, not by the skill prose.

### Input

```
/deskwork:iterate <slug>
/deskwork:iterate --site <slug> [--kind longform|outline|shortform] [--dispositions <path>] <slug>
/deskwork:iterate <slug> --kind shortform --platform linkedin
/deskwork:iterate <slug> --kind shortform --platform reddit --channel rprogramming
```

### Steps

1. Resolve `--site` (default).
2. Read the studio's pending comments (the operator's unresolved comments on the current version).
3. For each comment, decide the disposition:
   - `addressed` — the rewrite handles this comment
   - `deferred` — legitimate but out of scope for this iteration
   - `wontfix` — rejected with reason
4. Rewrite the content file on disk. Load the site's voice skill (if one exists) first — voice-appropriate rewrites save iteration cycles. The file path depends on the workflow's kind:
   - **longform / outline** (entry-centric): `<dir>/index.md` — single document evolves through stages (Issue #222 — Option B). Stage-aware routing has been retired; `index.md` is always "the document under review." `<dir>` is `dirname(entry.artifactPath)` with one level stripped if that dirname is `scrapbook/` (legacy pre-doctor sidecars). After approve, the prior stage's content lives at `<dir>/scrapbook/<priorStage>.md` as a frozen snapshot — read it for reference if useful, but rewrite `index.md` itself.
   - **shortform**: `<contentDir>/<slug>/scrapbook/shortform/<platform>[-<channel>].md` — the same file the studio's review surface writes back to on Save.
5. Optionally write a `dispositions.json` file mapping commentId → `{ disposition, reason? }`.
6. Invoke the helper:

```
deskwork iterate [--site <slug>] [--kind longform|outline|shortform] \
                    [--platform <p>] [--channel <c>] \
                    [--dispositions <path>] <slug>
```

For longform / outline, the `--kind` flag's role is metadata for the iteration journal record (`stage` field) — it's no longer a file router. For shortform it still selects the legacy workflow-object code path.

`--platform` (and optionally `--channel`) are required for shortform iterations so the helper resolves the same scrapbook file the workflow is bound to.

The helper appends v(n+1) from disk, emits address annotations, and flips the workflow to `in-review`.

7. Report: new version number, list of addressed comment ids.

### Examples

```
# Longform — defaults to --kind longform
/deskwork:iterate my-article

# Outline — same file (index.md), recorded under stage Outlining in the journal
/deskwork:iterate my-article --kind outline

# Shortform — LinkedIn post
/deskwork:iterate my-article --kind shortform --platform linkedin

# Shortform — Reddit cross-post with a channel
/deskwork:iterate my-article --kind shortform --platform reddit --channel rprogramming
```

### Error handling

- **No active workflow** (shortform only) — for shortform, the workflow must be scaffolded first via `/deskwork:shortform-start`. The longform/outline entry-centric path does not require a separate review-start step; the first `/deskwork:iterate` invocation against an entry creates the workflow. (Note: `/deskwork:review-start` was retired with the entry-centric pipeline redesign — references to it in older docs are stale.)
- **Disk identical to current version** — the helper does NOT refuse on identical content (the operator may be pinning marginalia or off-file work as a new version). The orchestrating skill decides whether file edits are needed first.
- **Missing `--platform` for a shortform workflow** — helper refuses. Pass the same platform/channel the workflow was started with.

### Dispositions file format

```json
{
  "<commentId-1>": { "disposition": "addressed" },
  "<commentId-2>": { "disposition": "deferred", "reason": "out of scope for this pass" },
  "<commentId-3>": { "disposition": "wontfix", "reason": "..." }
}
```

Use the Write tool to create the file before invoking the helper.
