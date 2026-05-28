---
name: close-shipped
description: "Release-time pending-verification labeling for issues referenced in commits between two release tags. Posts a verification-request comment and adds a label to each referenced open issue. Does NOT close the issue -- closure waits for operator verification per the project rule."
---

# /dw-lifecycle:close-shipped

The release-time verb for surfacing issues whose fixes landed in a release, so the operator (or the issue author) can verify against the installed artifact before closing.

The skill scans `git log <from-tag>..<to-tag>` for issue references, then for each referenced open issue: posts a verification-request comment + adds a `pending-verification` label. Closure is intentionally NOT automated -- the project's `.claude/rules/agent-discipline.md` § "Issue closure requires verification in a formally-installed release" is the gate.

This skill is part of the hygiene-skill family (`/dw-lifecycle:debt-report` for read-only state; `/dw-lifecycle:triage-issues` and `/dw-lifecycle:promote-deferrals` for issues/workplan mutations; `/dw-lifecycle:archive-branch` for branches; this skill for release-time labeling).

## When to use

Run immediately after a release tag is pushed. The skill's job is the disposition signal: every issue that has a fix in the release gets a comment naming the version + a label flagging it for verification. The operator (or the author) reads the label-filtered queue, installs the release, walks the original symptom, and closes by hand.

## Steps

1. Confirm the project root has `.dw-lifecycle/config.json` (otherwise run `/dw-lifecycle:install` first).
2. Confirm the `--from-tag` and `--to-tag` (defaults: previous and most-recent `v*` tags) are both present locally (`git fetch --tags origin` if not).
3. Run a dry-run first to inspect the commits + issue references the skill will act on:

```
dw-lifecycle close-shipped [--from-tag <vA>] [--to-tag <vB>] [--repo <owner/repo>] [--label <name>] --dry-run
```

4. Re-run without `--dry-run` to apply the comment + label.

## What it does

### Tag-range resolution

| Override supplied | `--to-tag` | `--from-tag` |
|---|---|---|
| neither | most-recent `v*` tag | second-most-recent `v*` tag |
| `--to-tag` only | the supplied value | most-recent `v*` strictly less than `--to-tag` |
| `--from-tag` only | most-recent `v*` tag | the supplied value |
| both | the supplied value | the supplied value |

`v*` tags are sorted by semver (`vMAJOR.MINOR.PATCH` with optional `-PRERELEASE`), not by tag-creation date -- a tag that gets re-pointed mid-release does not reorder the list.

When no `v*` tag exists locally, OR when only one tag exists and the operator did not supply `--from-tag`, the skill exits 2 with a message asking the operator to pass `--from-tag` explicitly. (No fallback to "first commit"; the explicit error is what tells the operator the auto-detection assumption is broken.)

### Commit-log scan

`git log <from-tag>..<to-tag>` produces the commit list. The scanner recognizes six reference shapes:

| Verb | Pattern | Example |
|---|---|---|
| closes | `Closes #NNN` / `Closed #NNN` (case-insensitive) | `Closes #123` |
| fixes | `Fixes #NNN` / `Fixed #NNN` | `Fixes #45` |
| resolves | `Resolves #NNN` / `Resolved #NNN` | `Resolves #99` |
| refs | `Refs #NNN` / `Ref: #NNN` | `Refs #88` |
| parens | `(#NNN)` (GitHub-PR-merge convention) | `feat(area): subject (#7)` |
| plain | `#NNN` with word boundaries | `see also #12` |

URLs in commit messages are stripped before pattern matching so `/pull/NNN` and `/issues/NNN` path segments are not mis-extracted as `#NNN`.

References are deduplicated per issue across all scanned commits. The contributing-commits list per issue is preserved so the comment body names every commit that mentioned the issue.

### Apply step (per issue)

For each issue in the deduplicated list:

1. `gh issue view <num> --json state,labels` to read current state.
2. If state is CLOSED: skip with `skipped-already-closed`. No mutation.
3. If labels already include the target label: skip with `skipped-already-labeled`. No mutation.
4. Otherwise:
   - `gh issue comment <num> --body "<verification-request body>"`
   - `gh issue edit <num> --add-label <label>`

Both gh calls run per issue; if one fails and the other succeeds, the outcome is recorded as `comment-only` or `label-only` and the per-issue error is surfaced in the final summary.

### Comment body shape

```
Shipped in <to-tag>. Please verify against an installed release before closing this issue.

Source commits in this release:
- <sha1>: <subject1>
- <sha2>: <subject2>
...

Install / repro instructions (per the project rule "Issue closure requires verification in a formally-installed release"):
1. Install / upgrade to <to-tag>.
2. Reproduce the original issue.
3. If the fix holds, close with a brief note.
4. If not, comment with the surviving symptom.
```

### Why it never closes

Closure is a disposition, not a status update. The project rule requires verification against the installed artifact -- which is something the operator (or the issue author) does, not the agent. The label + comment are the disposition signal: the issue is fix-shipped-pending-verification. The operator's `gh issue list --label pending-verification` is the queue they walk.

## Flags

| Flag | Default | What it does |
|---|---|---|
| `--from-tag <vA>` | second-most-recent `v*` tag | Start of the commit range. Exclusive of `<vA>`. |
| `--to-tag <vB>` | most-recent `v*` tag | End of the commit range. Inclusive of `<vB>`. |
| `--repo <owner/repo>` | auto-detected from `origin` | Override the GitHub repo target. |
| `--label <name>` | `pending-verification` | The label to add to each referenced open issue. Adopters can configure their own convention. |
| `--dry-run` | off | Print the resolved tag range, scanned commits, and per-issue plan WITHOUT mutating any issue. Exits 0. |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Range scanned successfully; one or more issues applied OR no issues referenced OR every issue skipped (already-closed / already-labeled). Also: any dry-run that succeeds. |
| 1 | Every applicable issue failed. |
| 2 | Structurally invalid range: a tag does not exist locally, no `v*` tags exist and no overrides were supplied, the range is reversed, or the GitHub repo cannot be auto-detected. |

## Wiring into /release

The deskwork monorepo's `/release` skill is project-internal (`.claude/skills/release/`) and not part of the dw-lifecycle plugin distribution. To auto-invoke `close-shipped` post-publish, add a step after Pause 5 (the final push) that runs:

```
dw-lifecycle close-shipped --to-tag v<version>
```

The `--to-tag` is the just-pushed tag; the `--from-tag` defaults to the previous release. The step is operator-opt-in -- a release that ships preview / candidate / unstable bits may want to skip the verification-request flood.

For non-deskwork adopters with their own release flows: invoke `close-shipped` as the last step of the release procedure, after the tag is pushed to origin. The skill's pre-flight on `assertTagsExist` will refuse if the tag has not propagated yet, which is the right failure mode.

## Why it ships as a single-action verb

Like `/dw-lifecycle:archive-branch`, `close-shipped` has no operator-judgment seam that would justify a propose / apply split. The scanner is deterministic; the apply step is the same shape for every issue (state-check -> comment -> label); the per-issue partial-success is recorded inline. The dry-run flag covers the "preview first" use case.

If an adopter project has issues that need per-issue commentary tailoring (e.g. different repro steps per surface), the right path is to run `close-shipped --dry-run`, copy the issue list, then run `gh issue comment` manually for the customized cases -- not to add per-issue customization flags to the skill itself.
