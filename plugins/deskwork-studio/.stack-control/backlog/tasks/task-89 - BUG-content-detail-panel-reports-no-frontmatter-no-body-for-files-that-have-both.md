---
id: TASK-89
title: >-
  BUG: content-detail panel reports 'no frontmatter / no body' for files that
  have both
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - bug
dependencies: []
references:
  - gh-103
ordinal: 89000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Symptom

`/dev/content/<collection>/<root>?node=<path>` selects a content node. The right panel claims to render the node's frontmatter and body preview. For a real, non-empty file with valid frontmatter, the panel shows:

- `FRONTMATTER · 0 fields · No frontmatter detected.`
- `PREVIEW · No body content yet.`
- `SCRAPBOOK · 0 items · scrapbook empty`

## Repro (against this project, v0.9.7 marketplace install)

1. `cd /Users/orion/work/deskwork-work/deskwork-plugin`
2. Boot studio: `deskwork-studio --no-tailscale --port 47500`
3. Navigate: `http://127.0.0.1:47500/dev/content/deskwork-internal/1.0?node=1.0%2F001-IN-PROGRESS%2Fdeskwork-plugin%2Fprd`
4. Right panel claims "No frontmatter detected" and "No body content yet."

## Ground truth

`docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md` exists, has 481 lines, has frontmatter:

```yaml
---
deskwork:
  id: 9845c268-670f-4793-b986-0433e9ef4fb9
title: "PRD: deskwork-plugin"
---
```

The longform review surface (`/dev/editorial-review/9845c268-670f-4793-b986-0433e9ef4fb9?site=deskwork-internal`) renders the file body fine. Same file, different surface, different result.

## Severity

High. The content-detail panel's whole purpose ("Select a node to read its head matter, preview its body, and browse its scrapbook" — the page's own promise) is to render this content. Adopters seeing "No body" for a populated file conclude their file is broken.

## Hypothesis

Either (a) path resolution is reading the wrong on-disk file (synthetic-vs-tracked tagging confused by hierarchical paths under `docs/1.0/`), (b) the frontmatter parser silently fails on the `deskwork:` namespace and surfaces "0 fields", or (c) the API endpoint that backs the right panel returns empty for this path shape. Worth instrumenting the `/api/dev/content/...` endpoint that backs this panel.
<!-- SECTION:DESCRIPTION:END -->
