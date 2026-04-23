---
name: iterate
description: Snapshot the agent's revised blog file as a new workflow version and transition back to in-review. Run after the agent has addressed operator comments by rewriting the blog markdown on disk. Optionally records per-comment dispositions (addressed / deferred / wontfix) that the studio sidebar renders as badges.
---

## Iterate

Called by the agent AFTER rewriting the blog markdown on disk to address an operator's review comments. This helper:

1. Reads the current blog file (SSOT: disk IS the article)
2. Appends a new workflow version with `originatedBy: 'agent'`
3. Optionally records per-comment disposition annotations
4. Transitions the workflow back to `in-review` so the operator can review the new version

### Prerequisite

The workflow must be in state `iterating`. The operator clicks "Request iteration" in the studio to move a workflow from `in-review` → `iterating`. That's the signal the agent should start drafting.

### Input

```
/deskwork:iterate <slug>
/deskwork:iterate --site <slug> [--kind longform|outline] [--dispositions <path>] <slug>
```

### Steps

1. Resolve `--site` (default).
2. Read the studio's pending comments (the operator's unresolved comments on the current version).
3. For each comment, decide the disposition:
   - `addressed` — the rewrite handles this comment
   - `deferred` — legitimate but out of scope for this iteration
   - `wontfix` — rejected with reason
4. Rewrite the blog markdown on disk. Load the site's voice skill (if one exists) first — voice-appropriate rewrites save iteration cycles.
5. Optionally write a `dispositions.json` file mapping commentId → `{ disposition, reason? }`.
6. Invoke the helper:

```
deskwork-iterate.ts <project-root> [--site <slug>] [--kind longform|outline] \
                    [--dispositions <path>] <slug>
```

The helper appends v(n+1) from disk, emits address annotations, and flips the workflow to `in-review`.

7. Report: new version number, list of addressed comment ids.

### Error handling

- **No active workflow** — surface the helper's error. The operator must run `/deskwork:review-start` first.
- **Workflow not in `iterating`** — do NOT try to force the state. Operator clicks "Request iteration" in the studio.
- **Disk identical to current version** — the helper refuses. The agent must actually rewrite the file, not just re-run iterate.

### Dispositions file format

```json
{
  "<commentId-1>": { "disposition": "addressed" },
  "<commentId-2>": { "disposition": "deferred", "reason": "out of scope for this pass" },
  "<commentId-3>": { "disposition": "wontfix", "reason": "..." }
}
```

Use the Write tool to create the file before invoking the helper.
