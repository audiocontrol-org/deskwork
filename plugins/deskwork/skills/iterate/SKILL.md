---
name: iterate
description: Append a new revision of the entry's content after the agent has addressed operator marginalia. Bumps the entry's revision counter; the new revision joins the entry's append-only history (visible via the studio's revision-history surface). Works for longform (`--kind longform`), outlines (`--kind outline`), and shortform drafts (`--kind shortform`). Optionally records per-comment dispositions (addressed / deferred / wontfix) that the studio sidebar renders as badges.
---

## Iterate

Called by the agent AFTER rewriting the content file on disk to address an operator's marginalia. This helper:

1. Reads the current file (SSOT: disk IS the article / outline / shortform copy)
2. Appends a new revision with `originatedBy: 'agent'` (see `DESKWORK-STATE-MACHINE.md` § Versions and revisions)
3. Optionally records per-comment disposition annotations
4. The studio re-reads the entry's annotations on the next page load — operator inspects the new revision and either approves the entry forward or leaves more marginalia

The same revision-history mechanism drives all three content kinds — the only difference is which file disk path the helper reads back from.

### Prerequisite

The operator's `/deskwork:iterate <slug>` invocation IS the request to iterate — per THESIS Consequence 2, the studio's "Request iteration" button is a clipboard-copy of this slash command and does NOT mutate sidecar state. The skill itself reads marginalia, rewrites the file, and appends the new revision.

Iterate is **stage-gated** per `DESKWORK-STATE-MACHINE.md` Commandment II: the verb runs on stages that permit edits (Ideas / Planned / Outlining / Drafting). Final locks content; iterate refuses there. Published is immutable. Off-pipeline stages (Blocked / Cancelled) need induct first.

For shortform (legacy workflow-object model): the underlying CLI's shortform path has additional internal bookkeeping; iterate's contract is the same — append a new revision after the rewrite.

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

The helper appends a new revision (revision N+1) from disk and emits per-comment disposition annotations.

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
  "<commentId-1>": { "disposition": "addressed", "reason": "addressed by adding § X at line N" },
  "<commentId-2>": { "disposition": "deferred", "reason": "out of scope for this pass" },
  "<commentId-3>": { "disposition": "wontfix", "reason": "..." }
}
```

Per Phase 8 Step 8.1.2's schema tightening, the `reason` field is **required** for every `addressed` disposition. State the constraint plainly:

- `addressed` — MUST carry a non-empty `reason` string. The reason is the agent's record of what the iteration did to satisfy the operator's margin note (e.g. *"addressed by adding § Migration Notes at line 142"*, *"addressed by rewriting the opening paragraph in active voice"*). The studio renders this reason next to the "addressed in v_N_" stamp so the operator can verify the disposition without re-reading the whole revision.
- `deferred` — `reason` is OPTIONAL. Supply one when the deferral has substance (*"out of scope for this pass — filed as #NNN"*); omit it when the disposition is self-evident.
- `wontfix` — `reason` is OPTIONAL but strongly recommended. A `wontfix` without a reason reads as dismissive; spell out why the comment is rejected so the operator can push back if the rejection is wrong.

Legacy dispositions files (or omitted-`reason` shapes) where `addressed` lacks a non-empty `reason` are **REFUSED by the CLI at parse time** (exit 2) — the helper exits with a clear error naming the offending `commentId` and showing the expected shape before any journal-write runs. Existing reasonless `addressed` annotations already in the journal (pre-Step-8.1.2 data) continue to be read; the studio renders them with "no reason recorded" text near the stamp. The contract is forward-only — every NEW iteration must supply a reason.

Use the Write tool to create the file before invoking the helper.
