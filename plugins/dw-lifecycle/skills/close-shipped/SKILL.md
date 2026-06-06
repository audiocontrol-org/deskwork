---
name: close-shipped
description: "Release-time pending-verification labeling. Phase 15 redesign: mechanical narrowing → per-candidate Agent dispatch (parallel, via the Agent tool from within the agent's Claude Code session) → operator-curated propose | apply. Does NOT close the issue — closure waits for operator verification per the project rule."
---

# /dw-lifecycle:close-shipped

The release-time verb for surfacing issues whose fixes landed in a release, so the operator (or the issue author) can verify against the installed artifact before closing.

The skill walks FOUR independent evidence sources in the range `<from-tag>..<to-tag>`, merges findings by issue number with a per-source provenance trail, then for each referenced open issue: posts a verification-request comment + adds a `pending-verification` label. Closure is intentionally NOT automated -- the project's `.claude/rules/agent-discipline.md` § "Issue closure requires verification in a formally-installed release" is the gate.

This skill is part of the hygiene-skill family (`/dw-lifecycle:debt-report` for read-only state; `/dw-lifecycle:triage-issues` and `/dw-lifecycle:promote-deferrals` for issues/workplan mutations; `/dw-lifecycle:archive-branch` for branches; this skill for release-time labeling).

## When to use

Run immediately after a release tag is pushed. The skill's job is the disposition signal: every issue that has a fix in the release gets a comment naming the version + a label flagging it for verification. The operator (or the author) reads the label-filtered queue, installs the release, walks the original symptom, and closes by hand.

## Steps

The skill operates in three phases (`scan` → agent dispatch → `propose`) followed by an operator review and a final `apply` invocation. The Agent-tool dispatch is what the agent (you) does in the middle; the rest is CLI helpers the agent invokes.

### Phase A — scan + agent dispatch + propose

1. Resolve `--from-tag` and `--to-tag` (or accept the defaults: previous + most-recent `v*` tags). Compute the per-run timestamp once (ISO-8601 with `:` and `.` replaced for filesystem safety, e.g. `2026-06-04T15-22-31-417Z`) and thread it through every scratch artifact path in the rest of this phase. The per-run dir is `.dw-lifecycle/close-shipped/runs/<timestamp>/`.

   **Why a per-run project-local dir, not `/tmp/`.** Bare `/tmp/<name>` paths violate `.claude/rules/file-handling.md` § "Never use bare `/tmp/<name>` paths" — they're shared-namespace and race-prone across concurrent worktrees, parallel sessions, and dispatched sub-agents. The per-run project-local scheme mirrors the existing `.dw-lifecycle/close-shipped/proposals-<timestamp>.json` convention, isolates artifacts per-worktree, and keeps the run auditable post-hoc.

2. Run the scan helper to emit the candidate bundle set:

   ```bash
   dw-lifecycle close-shipped scan --from-tag <vA> --to-tag <vB> \
     --output .dw-lifecycle/close-shipped/runs/<timestamp>/bundles.json
   ```

3. Read the bundles JSON. Count `bundles.length`. If the count exceeds the configured threshold (default 50), surface the count to the operator and confirm before continuing.
4. **Dispatch one Agent tool call per bundle, in parallel.** Single message with N `Agent({...})` tool_use blocks. Each agent gets:
   - `subagent_type: 'general-purpose'`
   - A prompt composed from the bundle using this template:

     ```
     You are evaluating whether a GitHub issue's fix was shipped in a specific release range.

     Issue #{number}: {title}
     State: {state}
     Body:
     {body}

     Recent comments:
     {recent_comments_joined}

     Evidence from the release (commits, PR, audit-log, workplan):
     {bundle_as_yaml}

     Question: Did the work above actually CLOSE this issue?

     A commit/PR closes an issue if its work made the issue's reported problem go
     away. References, back-links, cross-cites, and "tracks #N for context"
     patterns are NOT closes. Mere mentions, back-fill links, or docs commits that
     cite the issue number for context are NOT closes.

     Return strict JSON only:
     {"verdict": "shipped" | "not-shipped" | "uncertain", "reason": "<one sentence>"}
     ```

5. Collect the verdicts. For each candidate, parse the agent's response as JSON. If the first parse fails, re-dispatch ONCE with a short correction note (e.g. "your previous response was not valid JSON; return only the verdict JSON"). If the second response also fails to parse, record `agent_verdict: "error"` with the raw response excerpt.

6. Write the collected verdicts JSON to `.dw-lifecycle/close-shipped/runs/<timestamp>/verdicts.json` with shape `{ "verdicts": [{ "issue": <number>, "verdict": "...", "reason": "..." }, ...] }`. The verdicts file is the per-run artifact; the orchestrator does the parse-and-collect work in-session from the sub-agents' JSON responses, so the sub-agents themselves don't write to disk.

7. Run the propose helper:

   ```bash
   dw-lifecycle close-shipped propose \
     --bundles .dw-lifecycle/close-shipped/runs/<timestamp>/bundles.json \
     --verdicts .dw-lifecycle/close-shipped/runs/<timestamp>/verdicts.json
   ```

   This writes the proposal JSON under `.dw-lifecycle/close-shipped/proposals-<timestamp>.json` and prints the markdown summary table.

8. Stop. Surface the proposal path + markdown table to the operator. The operator reviews the proposal file, fills in the `decision` field per item (`accept-verdict` / `override-shipped` / `override-not-shipped` / `skip`), then re-invokes the skill in apply mode.

### Phase B — apply

1. Run the apply helper:

   ```bash
   dw-lifecycle close-shipped apply --proposal <path-from-phase-A>
   ```

2. Pre-validation: every item must have a non-empty `decision`. If any is empty, the helper exits 2 and the operator re-edits the proposal.

3. **Label pre-flight (Phase 16 / [#411](https://github.com/audiocontrol-org/deskwork/issues/411)).** Before the per-item loop, `apply` checks whether the target label exists in the repo (`gh label list --search <label> --json name`). If the label is missing, it auto-creates the label with the canonical color + description and surfaces a one-line `created '<label>' label on <repo> (color <hex>)` note. If the auto-create itself fails (permissions / rate limit / etc.), `apply` aborts with an actionable `InvalidProposalError` BEFORE any comment posts — that's the half-applied-state guard. The pre-flight runs exactly once per `apply` invocation.

4. Per-item dispatch: each `accept-verdict`-shipped or `override-shipped` item posts a `pending-verification` comment + adds the label via `gh`. Failures recorded per-item; partial-success surfaces with per-row reasons.

5. Report `applied: N, skipped: M, failed: P` to the operator. Any pre-flight `created` note prints on stdout before the summary line.

## Legacy fallback

A bare `dw-lifecycle close-shipped --from-tag <vA> --to-tag <vB>` invocation (no sub-verb) still runs the pre-Phase-15 4-walker flow. The legacy path is preserved for one release cycle to give adopters time to migrate; in a later version it will require an explicit `--legacy` flag, then be removed entirely.

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

### Four evidence sources

Each source is independent and contributes findings keyed by issue number; the merge layer deduplicates by issue and surfaces a per-source provenance trail in the per-issue comment body.

| Source | Walks | "Fixed" signal | Issue association |
|---|---|---|---|
| (a) commit-log | `git log <from-tag>..<to-tag>` | GitHub fix-keyword in commit subject/body | the issue number cited (`Closes #NNN` / `Fixes #NNN` / `Resolves #NNN`) |
| (b) audit-log | every `docs/<v>/<inProgress>/<slug>/audit-log.md` | a `Status: fixed-<sha>` entry whose SHA is reachable in the range | `Tracks-Issue: NNN` field (canonical), fallback to body prose (Closes/Fixes/Refs, inline `#NNN`) |
| (c) tooling-feedback | every `docs/<v>/<inProgress>/<slug>/tooling-feedback.md` | a TF entry's `Status: Closed | <sha>` whose SHA is reachable in the range | `Promoted to issue: #NNN` / `Tracked at: #NNN` / inline `#NNN` |
| (d) workplan-checkbox | every `docs/<v>/<inProgress>/<slug>/workplan.md` | a `[x]` task line carrying a `· [#NNN](url)` back-fill | the issue number in the back-fill |

Reachability for sources (b) and (c) uses `git merge-base --is-ancestor <sha> <toTag>` AND the inverse check that the SHA is NOT already in `<fromTag>` — both must hold. Source (d) has no SHA association; the checkbox itself is the "fixed" signal.

**Audit-log entry-tracked issue (Phase 14 / [#369](https://github.com/audiocontrol-org/deskwork/issues/369)):** each audit-log entry can carry an explicit `Tracks-Issue: NNN` line alongside the other entry fields (`Finding-ID:` / `Status:` / `Severity:` / `Surface:`). When present, the walker treats this as the canonical issue for the entry and IGNORES body fix-keyword text — which may be prose-cited as a code example or descriptive narrative rather than a claim. When absent, the walker falls back to body-scrape so pre-Phase-14 entries keep working without migration. The splitter recognizes both `## entry-name` and `### entry-name` heading conventions so adopters who organize audit-logs as a flat list (`## AUDIT-NNN — ...`) get the same per-entry parsing as adopters who nest entries under date headers (`## DATE` parent + `### entry-name` children).

Features that do not ship audit-log.md / tooling-feedback.md / workplan.md contribute zero findings from the missing source(s) — no error.

#### Cross-source merge

Per-issue, the merge layer surfaces:

- `sources` — deduplicated list of evidence sources that flagged the issue, sorted in canonical order (commit-log → audit-log → tooling-feedback → workplan-checkbox).
- `commits` — every scanned commit attributed to the issue across all sources (deduplicated by SHA prefix).
- `provenance` — full evidence trail (one entry per source-finding) with path and detail strings.
- `orphan_source` — true when commit-log AND audit-log (or any two SHA-carrying sources) cite mutually-exclusive SHAs for the same issue. Surfaced as a warning in the per-issue comment; the agent does NOT auto-resolve.

### Commit-log scan (source a)

`git log <from-tag>..<to-tag>` produces the commit list. The scanner recognizes ONLY GitHub's own auto-close grammar — three fix-keyword verbs that match how GitHub itself decides which issues a commit closes:

| Verb | Pattern | Example |
|---|---|---|
| closes | `Closes #NNN` / `Close #NNN` / `Closed #NNN` (case-insensitive; optional `:` / `#` separator) | `Closes #123` |
| fixes | `Fixes #NNN` / `Fix #NNN` / `Fixed #NNN` | `Fixes #45` |
| resolves | `Resolves #NNN` / `Resolve #NNN` / `Resolved #NNN` | `Resolves #99` |

**Not extracted:** bare `#NNN` mentions, `Refs #NNN` citations, and `(#NNN)` end-of-subject PR-merge markers. These are references / PR-numbers, not fix-shipping signals. The Phase 13 / [#366](https://github.com/audiocontrol-org/deskwork/issues/366) narrowing dropped them after the v0.27.0 dogfood surfaced false-positive `pending-verification` comments on adjacent / cross-linked / PR-merge issues. Adopters who want PR-number tracking or bare-mention sweeps can compose a separate walker on top of the raw commit stream.

**PR-merge commit subjects (`^Merge pull request #N from <branch>`) are dropped entirely** — the merge ceremony's PR-number isn't a fix signal, and the actual fix commits travel inside the merge as their own scanned records.

For non-merge commits, URLs are stripped before pattern matching so `/pull/NNN` and `/issues/NNN` path segments are not mis-extracted as `#NNN`. PR-merge commits are dropped entirely before any URL stripping or pattern matching — the early-return path means the merge-subject AND its body never reach the URL-stripping step.

References are deduplicated per issue across all scanned commits. The contributing-commits list per issue is preserved so the comment body names every commit that mentioned the issue.

**Comma-separated lists** (`Closes #10, #11, #12.`) only surface the explicitly-verb-prefixed issue (`#10`) — `#11` and `#12` are bare mentions per GitHub's own grammar. Adopters who close multiple issues from one commit need to repeat the verb: `Closes #10, closes #11, closes #12`.

#### Project-convention adapter: end-of-subject parens (Phase 14 / [#369](https://github.com/audiocontrol-org/deskwork/issues/369))

Many projects mark fix-shipping commits with `subject (#NNN)` — end-of-subject parens — instead of explicit `Closes` / `Fixes` / `Resolves` verbs. The deskwork project itself uses this convention. Phase 13's strict behavior dropped the shape because the same pattern appears in back-fill / cite commits that don't actually close the issue.

Adopters whose convention uses end-of-subject parens can opt back in via `.dw-lifecycle/close-shipped-config.yaml`:

```yaml
treat_end_of_subject_parens_as_fix_marker: true
```

When the knob is `true`:

- `feat(area): subject (#42)` — surfaces #42 (verb `parens`). End-of-subject anchor satisfied.
- `feat(area): subject (#42) trailing text` — does NOT surface. Parens not at end.
- `feat(area): subject` body `Closes #43` — `#43` still surfaces via the regular `Closes` verb; the parens knob is additive.

When the file is absent or the knob is `false`, Phase 13's strict behavior holds — only `Closes` / `Fixes` / `Resolves` count.

Adopters who use GitHub's auto-close grammar literally should leave the file absent. Adopters whose convention uses the parens shape (or who want to recover from a historical commit corpus that used it) should opt in. The trade-off: the knob relaxes GitHub-strict grammar in exchange for project-convention support; mid-subject and body parens stay dropped under both modes so the back-fill / cite false positives don't return.

**Known limitation:** the end-of-subject anchor catches genuine fix commits AND back-fill docs commits whose subject happens to end in `(#NNN)`. The pre-fix shape `docs(scope): back-fill parent issue (#NNN)` still surfaces under the knob — the anchor can't distinguish `feat(scope): fix (#NNN)` from `docs(scope): back-fill (#NNN)` mechanically. Adopters who care can either (a) put back-fill issue refs MID-subject (`docs(scope): back-fill (#NNN) link in workplan`) so the anchor skips them, (b) curate the dry-run output before apply, or (c) wait for the Phase 13 Medium follow-up under [#366](https://github.com/audiocontrol-org/deskwork/issues/366) — the operator-curation `propose | apply` split is the architectural answer.

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

Evidence trail:
- commit-log: <sha1>: <subject1>; <sha2>: <subject2>
- audit-log: docs/<v>/<inProgress>/<slug>/audit-log.md — AUDIT-NNN — status fixed-<sha>
- tooling-feedback: docs/<v>/<inProgress>/<slug>/tooling-feedback.md — TF-NNN — closed-by <sha>
- workplan-checkbox: docs/<v>/<inProgress>/<slug>/workplan.md — line N: - [x] Step ... · [#NNN](url)

Note: orphan-source warning — commit-log cites SHA(s) [...]; audit-log cites SHA(s) [...]; the two sets are disjoint. The agent did not auto-resolve; verify which fix actually landed.

Install / repro instructions (per the project rule "Issue closure requires verification in a formally-installed release"):
1. Install / upgrade to <to-tag>.
2. Reproduce the original issue.
3. If the fix holds, close with a brief note.
4. If not, comment with the surviving symptom.
```

Only the sources that actually flagged the issue appear in the trail. The orphan-source line appears only when the merger detects mutually-exclusive SHAs across two SHA-carrying sources.

### Why it never closes

Closure is a disposition, not a status update. The project rule requires verification against the installed artifact -- which is something the operator (or the issue author) does, not the agent. The label + comment are the disposition signal: the issue is fix-shipped-pending-verification. The operator's `gh issue list --label pending-verification` is the queue they walk.

## Flags

| Flag | Default | What it does |
|---|---|---|
| `--from-tag <vA>` | second-most-recent `v*` tag | Start of the commit range. Exclusive of `<vA>`. |
| `--to-tag <vB>` | most-recent `v*` tag | End of the commit range. Inclusive of `<vB>`. |
| `--repo <owner/repo>` | auto-detected from `origin` | Override the GitHub repo target. |
| `--label <name>` | `pending-verification` | The label to add to each referenced open issue. Adopters can configure their own convention. |
| `--dry-run` | off | Print the resolved tag range, scanned commits, per-source evidence, and per-issue plan WITHOUT mutating any issue. Exits 0. |
| `--release-notes-body` | off | Emit ONLY the markdown body suitable for `gh release edit --notes` (no other output). Skips the apply step. Exits 0. |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Range scanned successfully; one or more issues applied OR no issues referenced OR every issue skipped (already-closed / already-labeled). Also: any dry-run that succeeds. |
| 1 | Every applicable issue failed. |
| 2 | Structurally invalid range: a tag does not exist locally, no `v*` tags exist and no overrides were supplied, the range is reversed, or the GitHub repo cannot be auto-detected. |

## Wiring into /release

The deskwork monorepo's `/release` skill is project-internal (`.claude/skills/release/`) and not part of the dw-lifecycle plugin distribution. There are TWO integration surfaces — the post-push prompt + the auto-generated release-notes body.

### (1) Post-push prompt at Pause 5

Add a step after Pause 5 (the final push) that runs:

```
dw-lifecycle close-shipped --to-tag v<version>
```

The `--to-tag` is the just-pushed tag; the `--from-tag` defaults to the previous release. The step is operator-opt-in -- a release that ships preview / candidate / unstable bits may want to skip the verification-request flood.

### (2) Auto-generated release-notes body

Pipe the skill's release-notes output into `gh release edit` so adopters reading `gh release view v<version>` see the closure trail.

Use the in-tree per-run path scheme (matches the Phase A precedent from #412) — `.dw-lifecycle/close-shipped/runs/<timestamp>/release-notes.md` is worktree-safe and never clobbers under concurrent invocations:

```
RUN_DIR=".dw-lifecycle/close-shipped/runs/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$RUN_DIR"
dw-lifecycle close-shipped --to-tag v<version> --release-notes-body > "$RUN_DIR/release-notes.md"
gh release edit v<version> --notes-file "$RUN_DIR/release-notes.md"
```

Or via process substitution in a single line:

```
gh release edit v<version> --notes-file <(dw-lifecycle close-shipped --to-tag v<version> --release-notes-body)
```

Per `.claude/rules/file-handling.md` § "Never use bare `/tmp/<name>` paths," bare `/tmp/release-notes.md` is unsafe: two concurrent `/release` invocations in different worktrees would clobber each other. The in-tree runs-dir form preserves the artifact alongside the closure proposals + verdicts the rest of the verb writes there.

The body shape:

```
## Pending verification

Shipped in v<version>; awaiting operator verification per the issue-closure-requires-formally-installed-release rule.

- #NNN — <subject> (evidence: commit-log, audit-log)
- #NNN — <subject> (evidence: commit-log)

To verify: install v<version>, reproduce each issue against the installed release, close with verification confirmation.
```

When no issues are flagged for verification, the body still renders the heading + a one-line empty-state notice so the release page is consistent across releases.

For non-deskwork adopters with their own release flows: invoke `close-shipped` as the last step of the release procedure, after the tag is pushed to origin. The skill's pre-flight on `assertTagsExist` will refuse if the tag has not propagated yet, which is the right failure mode.

## Why the propose | apply split now exists (Phase 15)

Earlier versions shipped `close-shipped` as a single-action verb on the
assumption that the scanner was deterministic enough to dispatch the
apply step without operator review. Six release cycles of dogfood
disproved this: each release surfaced false-positive `pending-verification`
labels on adjacent, cross-linked, or PR-merge issues, and each fix
narrowed the scanner one step further without ever closing the gap
([#366](https://github.com/audiocontrol-org/deskwork/issues/366) was
the proposal to escape the loop).

Phase 15 separates the concerns: the `scan` helper does mechanical
narrowing (every `#NNN` mention from every evidence source is a
candidate), per-bundle Agent dispatches render the judgment ("did this
commit set actually CLOSE the issue?"), and the `propose | apply` split
puts the operator in the disposition seat. Adopters who want different
repro steps per surface still own the proposal JSON they hand-edit
before `apply`; the per-row `decision` field is the seam.
