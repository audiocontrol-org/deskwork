---
id: TASK-10
title: >-
  CLI: no command to enumerate pending annotations; `iterate` silently reports
  addressedComments: []
status: To Do
assignee: []
created_date: '2026-06-10 18:59'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-267
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/267

## Summary

`deskwork iterate` reports `addressedComments: []` even when the entry has unresolved operator annotations on disk. The annotations exist as journal records under `.deskwork/review-journal/history/<timestamp>-<uuid>.json` with `kind: "entry-annotation"`, but the iterate helper does not surface them to the caller and there is no CLI command for an agent (or human) to enumerate the pending annotations for an entry before invoking iterate.

The `deskwork:iterate` SKILL.md step 2 instructs the agent to *"Read the studio's pending comments (the operator's unresolved comments on the current version)"* — but no CLI path is provided to do this, leaving the agent to either grep JSON files manually or guess at the studio's HTTP API endpoints.

## Reproduction

1. Adopt deskwork on a project; ingest a markdown file:
   ```
   deskwork ingest --state-field status path/to/spec.md --apply
   ```
2. Launch the studio: `deskwork-studio` (or invoke the `deskwork-studio:studio` skill).
3. In the studio, open the entry's review surface and leave a margin comment on a passage. The comment is persisted to `.deskwork/review-journal/history/<timestamp>-<uuid>.json` with shape:
   ```json
   {
     "kind": "entry-annotation",
     "at": "<iso>",
     "entryId": "<entry-uuid>",
     "annotation": {
       "type": "comment",
       "workflowId": "<entry-uuid>",
       "version": 1,
       "range": { "start": <int>, "end": <int> },
       "text": "<operator marginalia>",
       "category": "other",
       "anchor": "<anchor>",
       "id": "<comment-uuid>",
       "createdAt": "<iso>"
     }
   }
   ```
4. Invoke `deskwork iterate <slug>`. Result:
   ```json
   {
     "entryId": "<entry-uuid>",
     "site": "<site>",
     "slug": "<slug>",
     "stage": "Drafting",
     "version": 1,
     "addressedComments": []
   }
   ```

Expected: `addressedComments` lists (or some sibling output lists) the comment IDs that exist on the entry and that the agent should consider before rewriting. Actual: silent empty array even though the comment is plainly on disk.

## Impact

- The contract documented in `deskwork:iterate` SKILL.md ("Read the studio's pending comments") is unimplemented from the CLI side. The skill defaults to a no-op iteration that snapshots disk state without acknowledging the operator's marginalia.
- The agent can mistakenly report "no comments to address" to the operator, as happened in [this session's spec review](https://github.com/audiocontrol-org/audiocontrol/issues/424). The operator caught it; an inattentive agent might not.
- The only workarounds available to an agent are (a) grep the `.deskwork/review-journal/` JSON files directly, parsing the unstable journal-record schema, or (b) probe the studio's HTTP API by guessing endpoints (every endpoint I tried returned 404).

## Requested feature

A first-class CLI command — name suggestion `deskwork annotations` or `deskwork comments` — that enumerates pending annotations for an entry.

Suggested interface:

```
deskwork annotations <slug>                          # default: pending only, current version, JSON
deskwork annotations <slug> --include-resolved       # include addressed/deferred/wontfix
deskwork annotations <slug> --version <n>            # filter to a specific revision
deskwork annotations <slug> --format text            # human-readable instead of JSON
deskwork annotations <slug> --kind comment           # filter by annotation type
```

Default JSON shape:

```json
{
  "entryId": "<uuid>",
  "slug": "<slug>",
  "version": 1,
  "annotations": [
    {
      "id": "<comment-uuid>",
      "kind": "comment",
      "version": 1,
      "range": { "start": 5248, "end": 5267 },
      "anchor": "<anchor-string>",
      "category": "other",
      "text": "<operator marginalia>",
      "createdAt": "<iso>",
      "disposition": null
    }
  ]
}
```

Should also surface annotations whose `disposition` is `addressed`/`deferred`/`wontfix` from prior iterations when `--include-resolved` is set — useful for an agent verifying its disposition record was persisted.

## Why this matters for the iterate workflow

The `deskwork:iterate` skill's documented agent procedure is:

> 2. Read the studio's pending comments (the operator's unresolved comments on the current version).
> 3. For each comment, decide the disposition: addressed / deferred / wontfix
> 4. Rewrite the content file on disk.
> 5. Optionally write a dispositions.json file
> 6. Invoke the helper

Step 2 currently has no implementation. The agent cannot perform step 3 (decide a disposition per comment) without first reading the comments. Without a CLI surface for step 2, every iteration cycle either silently ignores marginalia or relies on an out-of-band channel (the operator telling the agent "go look at the studio") which defeats the calendar's design.

A `deskwork annotations <slug>` command would close the loop and let the iterate skill execute its documented procedure end-to-end without studio scraping or journal-file grepping.

## Possibly related

- `deskwork-studio`'s review surface is the only existing read path for annotations; consider whether the new CLI command should share parsing code with the studio's annotation loader so the schema stays single-source.
- If a `--watch` or `--since <iso>` mode is contemplated, it would let an agent poll for new comments without re-reading the whole journal each time.

## Operating environment

- deskwork CLI: `@deskwork/cli@0.21.0` (first-run installed against the v0.21.0 plugin manifest)
- deskwork-studio: `@deskwork/studio` 0.21.0
- Host: macOS Darwin 24.6.0
- Plugin marketplace head: `audiocontrol-org/deskwork@<current>`

## Operator-visible session that motivated this

See the parent audiocontrol session at [audiocontrol-org/audiocontrol#424](https://github.com/audiocontrol-org/audiocontrol/issues/424) — the operator left a margin comment on a draft spec; the agent ran `deskwork iterate` and reported zero comments addressed; the operator caught the discrepancy and pointed the agent at the annotation, which the agent then found by manually grepping the review-journal files.
<!-- SECTION:DESCRIPTION:END -->
