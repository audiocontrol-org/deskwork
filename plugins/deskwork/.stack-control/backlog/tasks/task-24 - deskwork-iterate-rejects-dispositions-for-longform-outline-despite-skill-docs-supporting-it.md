---
id: TASK-24
title: >-
  deskwork iterate rejects --dispositions for longform/outline despite skill
  docs supporting it
status: To Do
assignee: []
created_date: '2026-06-10 19:00'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-198
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/198

**Symptom**

`deskwork iterate --kind longform --dispositions <path> <slug>` rejects with:

```
--dispositions is currently only supported with --kind=shortform.
```

The skill prose at `plugins/deskwork/skills/iterate/SKILL.md` documents `--dispositions` as supported for all three kinds:

> Works for longform (`--kind longform`), outlines (`--kind outline`), and shortform drafts (`--kind shortform`).
>
> 5. Optionally write a `dispositions.json` file mapping commentId → `{ disposition, reason? }`.

But the CLI hard-rejects everything except shortform. So the agent's only path through iterate-with-dispositions is shortform.

**Impact**

After an agent runs `/deskwork:iterate` against a longform/outline workflow with operator comments, the studio's marginalia sidebar still shows every comment as unresolved — no `addressed` / `deferred` / `wontfix` badge appears, even though the agent did address each one in the rewrite. The operator has to manually click "Resolve" on every comment to clear them. Visual evidence: in the post-iterate review surface for the PRD at `b3f20364-…`, the comment "We need a section that describes the six phases" still renders as an unresolved comment with a "RESOLVE" button — even though v1 of the PRD has the new `## Phases` section that addresses it.

**Reproduction (v0.15.0)**

1. Have a longform entry with at least one operator comment in the studio.
2. Rewrite the disk file to address the comment.
3. Write a `dispositions.json` mapping the comment ID to `{ "disposition": "addressed" }`.
4. Run `deskwork iterate --kind longform --dispositions <path> <slug>`.
5. Observed: CLI refuses with the error above. Either drop `--dispositions` (and lose the badge UX) or change `--kind` to a value that doesn't match the workflow's actual kind (which the helper would also reject downstream).

**Fix direction**

The shortform path in `packages/cli/src/commands/iterate.ts` (or wherever the dispositions handler lives) plumbs `dispositions.json` through to a per-comment annotation emitter that writes `address-annotation` records into the journal. That same emitter should run for `--kind longform` and `--kind outline`. The kind-specific code path for shortform is the file-resolution step (which scrapbook file is the workflow bound to); dispositions don't depend on that.

Likely a single early-return guard like:
```ts
if (flags.dispositions !== undefined && flags.kind !== 'shortform') {
  fail('--dispositions is currently only supported with --kind=shortform.', 2);
}
```
that needs to be deleted, plus making sure the disposition-emit step actually fires for the longform/outline paths.

**Regression test**

`packages/cli/test/iterate-*.test.ts` (read the existing iterate test files for conventions). Two cases:
- Longform iterate with valid `--dispositions <path>` → succeeds, address-annotation records appear in the entry's history journal.
- Outline iterate with valid `--dispositions <path>` → same.

**Related: this is the third ingest/iterate bug surfaced during the same dogfood walk** as #197. Cumulative finding: the skill prose for the lifecycle and review surface is ahead of what the CLI ships. Worth a separate audit pass, but out of scope for this fix.
<!-- SECTION:DESCRIPTION:END -->
