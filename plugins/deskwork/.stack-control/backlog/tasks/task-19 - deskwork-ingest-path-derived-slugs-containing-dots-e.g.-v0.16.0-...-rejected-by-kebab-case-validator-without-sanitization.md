---
id: TASK-19
title: >-
  deskwork ingest: path-derived slugs containing dots (e.g. 'v0.16.0-...')
  rejected by kebab-case validator without sanitization
status: To Do
assignee: []
created_date: '2026-06-10 19:00'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-221
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/221

## Symptom

`deskwork ingest <file>` rejects path-derived slugs that contain `.` characters, even when the source filename is a perfectly reasonable name like `2026-05-05-v0.16.0-verification-walk.md`. The kebab-case validator only accepts `[a-z0-9][a-z0-9-]*` segments, and a path-derived slug containing `v0.16.0` triggers:

```
skip <slug-with-dots>  derived slug "<slug-with-dots>" is not valid kebab-case (must match [a-z0-9][a-z0-9-]* segments separated by '/')
```

The dots come from version strings (`v0.16.0`), date stamps (some operators use `2026.05.06`), or any other dot-containing token before the `.md` extension.

## Reproduction (today, 2026-05-06)

```bash
# Walk script with a version in the filename:
echo "---\ntitle: walk\n---\n" > 2026-05-05-v0.16.0-verification-walk.md
deskwork ingest 2026-05-05-v0.16.0-verification-walk.md
# Plan: 0 add, 1 skip
# skip open-issue-tranche-cleanup/v0.16.0-verification-walk
#   derived slug "open-issue-tranche-cleanup/v0.16.0-verification-walk" is not
#   valid kebab-case (must match [a-z0-9][a-z0-9-]* segments separated by '/')
```

Workaround:

```bash
deskwork ingest --slug open-issue-tranche-cleanup/v016-verification-walk \
  2026-05-05-v0.16.0-verification-walk.md
# Plan: 1 add, 0 skip
```

## Why this matters

Versions and dates in filenames are common. Operators shouldn't have to know the slug regex's quirks to ingest a perfectly reasonable filename. The current behavior is:

- Generates a slug from the path
- Validates it against the kebab-case regex
- Refuses if invalid
- Operator has to either rename the file (lossy / loses version metadata in the filename) or re-invoke with `--slug` (knowledge required)

## Fix direction

Three options:

1. **Sanitize before validate.** In `packages/core/src/ingest-derive.ts` (the `deriveSlug` function), pre-process path-derived slugs by replacing `.` with `-` before the regex check. `v0.16.0-verification-walk` becomes `v0-16-0-verification-walk` automatically — valid kebab-case, version preserved (just with hyphens). Operator-friendly default.

2. **Suggest the sanitized form in the error message.** Keep the strict regex, but the error includes a concrete `--slug <sanitized>` suggestion. Operator copy-pastes. More friction than option 1 but no surprise transformation.

3. **Loosen the slug regex to accept `.`.** Probably not — dots in path segments interact with file extension parsing and FS conventions. Could break downstream code that splits on `.`.

Recommend option 1 for path-derived slugs (sanitize), keeping the regex strict for `--slug` explicit (operator-supplied; if they typed dots they meant it; surface the rejection clearly).

## Disposition

In-scope for the open-issue-tranche-cleanup feature's Phase 10 evaluation pass.
<!-- SECTION:DESCRIPTION:END -->
