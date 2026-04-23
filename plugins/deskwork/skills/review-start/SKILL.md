---
name: review-start
description: Enqueue a longform draft for editorial review. Reads the blog file from disk, creates a review workflow in state `open`, and reports divergence between disk and the workflow's current version (if any). Idempotent — running twice returns the same workflow.
---

## Review Start

Begin a review cycle for a blog post that's already been scaffolded and drafted.

### Input

```
/deskwork:review-start <slug>
/deskwork:review-start --site <slug> <slug>
```

### Steps

1. Resolve `--site` (or default).
2. Invoke the helper:

```
deskwork-review-start.ts <project-root> [--site <slug>] <slug>
```

The helper:
- Reads the blog markdown (honoring `blogFilenameTemplate`)
- Calls `createWorkflow` (idempotent on `(site, slug, contentKind)`)
- Reports whether the workflow is fresh or a prior one matched
- Reports divergence between disk and the workflow's current version, if any

3. Report to the operator: workflow id, state (`open`), and the URL of the studio review page (if the studio is running). Suggest opening the page.

### Body-state warnings

The helper reports a `bodyState` field in its JSON output. If `placeholder`, warn the operator that the file is still the scaffold placeholder and recommend `/deskwork:draft` before proceeding with review.

### Divergence warnings

If `divergence` is non-null, the file on disk differs from the workflow's recorded current version. This means either:
- The agent edited disk directly via `/deskwork:iterate` without snapshotting yet (legitimate in-flight work — iterate will snapshot when invoked)
- Stale journal state (reconcile manually)

Report the divergence; do NOT auto-commit disk as a new version.

### Error handling

- **No blog file** — helper lists sibling slugs on that site. Do NOT create one to "fix" it; the user should run `/deskwork:outline` or `/deskwork:draft` first.
- **Duplicate workflow** — the helper returns the existing one with `fresh: false`. This is expected idempotence.
