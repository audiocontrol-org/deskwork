---
id: TASK-449
title: >-
  stackctl execute-check rejects the relative --spec path that spec-check
  accepts (requires absolute)
status: To Do
assignee: []
created_date: '2026-06-25 19:02'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-505
ordinal: 448000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

`stackctl execute-check --spec <dir>` resolves its `--spec` path differently than its sibling
`stackctl spec-check --spec <dir>`. In the same front-door flow, `spec-check` accepts a
repo-relative path while `execute-check` rejects the identical value as "not found" and requires an
absolute path. Two sibling verbs in the same `/stack-control:execute` gate sequence should resolve
the same path argument the same way.

## Environment

- stack-control plugin (deskwork cache) version 0.55.1 / 0.53.2 skills; `stackctl` on PATH
- Host: macOS (darwin 24.6.0), run from the repo root of a stack-control installation
- Installation root: repo root containing `.stack-control/config.yaml`, spec dirs under `specs/`

## Reproduction

From the installation root (`/Users/orion/work/offing`), with spec dir
`specs/010-faithful-capture-substrate` present and runnable (`tasks.md` exists):

```
$ stackctl spec-check --spec specs/010-faithful-capture-substrate
spec=yes plan=yes tasks=yes            # exit 0 — repo-relative path accepted

$ stackctl execute-check --spec specs/010-faithful-capture-substrate
execute-check: FATAL — spec dir specs/010-faithful-capture-substrate not found   # exit 1

$ stackctl execute-check --spec "$(pwd)/specs/010-faithful-capture-substrate"
runnable                                # exit 0 — only the ABSOLUTE path works
```

## Expected

`execute-check` accepts the same repo-relative `--spec` value `spec-check` does (resolve both
relative to the installation root, or document the difference). As-is, an agent following the
`/stack-control:execute` skill — which calls `spec-check` then `execute-check` with the same path —
hits a spurious FATAL on the second call and must discover the absolute-path workaround.

## Impact

Low severity but high friction: it breaks the obvious copy-the-same-arg flow between two verbs the
execute skill invokes back-to-back, and the FATAL wording ("spec dir not found") misleads toward
"the spec is missing" rather than "this verb wants an absolute path."

## Surfaced by

Driving `/stack-control:execute` on spec-010 (faithful-capture-substrate), 2026-06-25.
<!-- SECTION:DESCRIPTION:END -->
