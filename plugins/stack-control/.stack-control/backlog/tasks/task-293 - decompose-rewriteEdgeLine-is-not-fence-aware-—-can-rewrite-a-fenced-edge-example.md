---
id: TASK-293
title: >-
  decompose rewriteEdgeLine is not fence-aware — can rewrite a fenced edge
  example
status: To Do
assignee: []
created_date: '2026-06-19 04:26'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 293000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
027 fixed cluster.appendEdge to skip field-looking bullets inside fenced code blocks (codex-01). The shared rewriteEdgeLine (used by decompose repoint) has the SAME latent issue: a unit with a fenced depends-on/part-of EXAMPLE in its scope could have that example rewritten by decompose. Pre-existing (006) but same class as the cluster fence fix; make rewriteEdgeLine fence-aware (mirror scopeOf/appendEdge). Surfaced by 027 phase-6 govern (claude MEDIUM).
<!-- SECTION:DESCRIPTION:END -->
