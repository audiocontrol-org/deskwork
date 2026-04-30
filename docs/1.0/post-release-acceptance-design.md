---
title: Post-release customer acceptance playbook
description: A pair of skills that codify how to evaluate the freshly-installed deskwork marketplace plugin, surface friction, and file issues — using the deskwork pipeline itself as the triage surface.
targetKeywords:
  - post-release
  - acceptance
  - dogfood
  - playbook
deskwork:
  id: 1c3bfe8f-e9c2-4133-ab88-2aa08d9fa702
---

## Design: post-release customer acceptance playbook

**Status:** in brainstorming review (2026-04-30) — **stop-gap, migrates into dw-lifecycle when ready** (see *Stop-gap status* below).
**Source:** operator framing — *"We should have a post-release customer acceptance playbook that we run through — not hard-coded tooling, but a skill (or a composition of skills) that codify how to evaluate the installed plugin to ensure it's sane and file bugs if it's not. This should include playwright inspection of the studio. We should update that playbook as we add/update features."*

### Stop-gap status — migrates into dw-lifecycle when ready

This entire feature — both the `/post-release:*` skill family designed below AND the existing `/release` skill it integrates with — is **stop-gap scaffolding** that lives inside the deskwork plugin only because dw-lifecycle does not yet expose the capability to customize or override lifecycle stages and skills. When dw-lifecycle gains that capability, the migration is a forward-marching certainty, not a maybe:

- **`/release` and `/post-release:walk` + `/post-release:file-issues` migrate into dw-lifecycle.** They are deskwork-project-management procedures, not editorial-pipeline procedures; their natural home is dw-lifecycle's customizable-workflow surface. Folding them in there lets adopters override or extend the procedures per-project (which is the whole reason dw-lifecycle exists).
- **The path of this design doc itself will change.** Once dw-lifecycle owns the migration target, this file moves to whatever path dw-lifecycle prescribes for in-flight feature designs (likely under a dw-lifecycle-managed `docs/` subtree, or as a dw-lifecycle calendar entry with its own conventions). Treat the current path `docs/1.0/post-release-acceptance-design.md` as ephemeral.
- **Generated artifacts move too.** The findings docs at `docs/post-release/<version>-acceptance.md` and the playbook at `docs/post-release/playbook.md` are similarly transitional. Their final location is dw-lifecycle's call.
- **Stays-current procedural amendments** (the dw-lifecycle / feature-define checklist additions described in *Playbook — stays-current mechanism* below) become typed phases in dw-lifecycle's customizable workflow surface once it lands. Cross-reference: *Stays-current mechanism (future — once dw-lifecycle ships customizable workflows)*.

This stop-gap framing is binding: any decision in this design that conflicts with eventual migration into dw-lifecycle should be re-opened. Specifically: schema choices, file paths, and skill names should stay simple enough that the migration is a move-and-rename rather than a re-architect.

### Problem

Across the last three sessions the operator has done a manual post-release dogfood walk against the marketplace install and filed cumulative ~13 GitHub issues per release (Phase 26 packaging + Phase 27 studio bugs). The walk is the highest-yield bug-finding mechanism this project has — every Phase 27 issue came from running the v0.9.7 install, none from auditing source.

Three problems with leaving the walk as a manual ritual:

1. **It can be skipped.** Releases ship without the walk if attention is elsewhere. The bugs surface later, in adopter context, instead of during the release window where they're cheap to fix.
2. **It rots with feature surface.** As new studio surfaces / commands / workflows ship, the implicit "what to walk through" knowledge has to live somewhere. Right now it lives in the operator's head and in scattered DEVELOPMENT-NOTES.md entries.
3. **The triage step is undirected.** The operator decides per-finding whether to file, what title to use, what severity. The deskwork plugin itself was built precisely for this kind of structured-finding-with-margin-notes review surface — but isn't being used on its own bug triage.

The operator's principle: *if it's worth doing, enshrine it as a skill so the procedure can't drift.*

### Goals

- **Codify the walk** as a skill that can run unattended (or with minimal interaction) and produces a structured findings document.
- **Use the deskwork plugin's review pipeline** as the triage surface — the findings doc is ingested as a longform document, the operator reviews/edits/iterates/approves in the studio (margin notes + inline editor), and approved findings get filed as GitHub issues.
- **Two modes:**
  - **Cursory** — fast, runs as the post-release default. Boot + routes + assets + Playwright visual scan.
  - **Deep** — opt-in, runs an end-to-end editorial workflow through the install (`add → plan → outline → draft → review-start → iterate → approve`). Catches CLI-side regressions.
- **Stay current with feature surface** via a structured playbook file (`docs/post-release/playbook.md`) that lists per-surface assertions, supplemented by auto-discovery from the studio's `/dev/` index for surfaces not yet in the playbook.
- **Self-heal**: surfaces missing from the playbook become "no playbook entry for this surface" findings — which themselves go through the review pipeline and remind the next iteration to add an entry.

### Non-goals

- **Not a replacement for the dogfood-as-development discipline** (`agent-discipline.md` *"Stay in agent-as-user dogfood mode"*). The walk is post-release verification; it doesn't substitute for using the plugin on real work during development.
- **Not gated CI.** The walk involves Playwright + a real marketplace install + a deskwork review cycle that takes operator time. Putting it in CI conflicts with the project's *"No test infrastructure in CI"* rule. It runs locally, on demand, with the operator present.
- **Not a security review.** The studio is dev-only with no auth (per existing project posture). The walk verifies functional surface, not threat-model surface.

### Architecture

Two skills, both shipped as part of a new `post-release` skill family inside the `deskwork` plugin (rationale below):

| Skill | Purpose | When invoked |
|---|---|---|
| `/post-release:walk` | Boot the studio against the latest marketplace install, walk surfaces, generate findings markdown, ingest the doc into deskwork as a longform document, enqueue review workflow, surface review URL. | (1) `/release` end-prompt: *"verify install now? [y/N]"*; (2) ad-hoc by operator. |
| `/post-release:file-issues` | After the operator approves the findings document in the studio (workflow `state === applied`), parse the approved markdown, file `gh issue create` for each finding with operator confirmation per issue. | After `/deskwork:approve` finishes for the findings document. |

**Why a new skill family inside the `deskwork` plugin** (vs. a new plugin or skills inside `deskwork-studio`):

- The walk needs the deskwork CLI (`deskwork ingest`, `deskwork review-start`) — already ships with the `deskwork` plugin shell.
- The walk drives the studio (Playwright) — but doesn't require the studio plugin shell to be the host. The studio is just the surface being walked.
- A separate `post-release` plugin would force adopters to install a second plugin to run a workflow that's intrinsically about the deskwork plugin itself. Folding the skills into the existing `deskwork` plugin keeps the install footprint minimal.

**Inputs:**

- `--mode cursory|deep` (default: cursory).
- `--version <ver>` (default: most-recent v-tag visible to the marketplace install — read from `~/.claude/plugins/marketplaces/deskwork/.claude-plugin/marketplace.json`).
- `--port <n>` (default: studio's auto-port range starting 47321) — passed through to the studio launch.

**State surfaces:**

- Findings doc lives at `docs/post-release/<version>-acceptance.md`. Frontmatter binds it to the calendar via `deskwork.id`. Multiple acceptance walks (e.g., `v0.10.0` and `v0.10.1`) coexist as separate calendar entries.
- Walk artifacts (screenshots, console-error logs) land in `docs/post-release/<version>-artifacts/`. The findings doc references them by relative path so the studio renders them inline as reviewer context.

**Composition:**

- `/post-release:walk` shells out to `deskwork ingest` and `deskwork review-start` once the findings doc is written. Does NOT re-implement the deskwork pipeline.
- `/post-release:file-issues` shells out to `gh issue create` per confirmed finding. Does NOT re-implement GitHub API access.

### Cursory mode

Runs in this order:

1. **Verify install state.** Read marketplace.json, confirm the local install matches the version we're verifying. If not, surface "marketplace install is at vX, asked to verify vY — run `/plugin marketplace update deskwork` first" and abort.
2. **Boot studio.** Launch `deskwork-studio` (Tailscale-aware default per `agent-discipline.md` rule) against the project root. Capture the loopback URL for Playwright.
3. **Auto-discover surfaces.** Fetch `/dev/` (the index page added in Phase 17). Parse out the route table. Extend with any routes named in the playbook file that aren't reachable from the index (e.g., `/dev/editorial-review/<id>` for a workflow that exists).
4. **Per-surface walk.** For each discovered surface:
   - Navigate via `browser_navigate`.
   - Take a screenshot to `docs/post-release/<version>-artifacts/<surface-slug>.png`.
   - Capture console errors via `browser_console_messages`.
   - Capture network failures via `browser_network_requests`.
   - Run any playbook-defined assertions for this surface (see *Playbook stays-current* below).
5. **Aggregate findings.** Each non-OK observation (4xx/5xx, console error, failed network request, failed assertion, missing playbook entry) becomes a *finding* with: severity (bug/enhancement/info), title, body, optional artifact references.
6. **Generate findings doc.** Write `docs/post-release/<version>-acceptance.md` (template below). Include a header section (version, walk mode, walk timestamp), a per-surface section with embedded screenshots, and a "Findings" section with one subsection per finding.
7. **Ingest + review-start.** `deskwork ingest <path>` → bind a `deskwork.id`. `deskwork review-start --site <site> <slug>` → enqueue a longform workflow.
8. **Surface URL.** Print `/dev/editorial-review/<workflow-id>` for the operator to open in the studio.

**Time budget:** 5–10 minutes for the walk + artifacts. Operator review time is separate (and bounded by the operator).

### Deep mode

Cursory plus an end-to-end editorial workflow drive against a sandbox project (a `tmp` dir created for the walk; not the operator's real project):

1. **Cursory walk first.** Same as above; if cursory finds blocking issues (5xx, no studio boot), surface them and don't proceed to deep — the deep walk would just compound failures.
2. **Sandbox setup.** Create a tmp project root. Run `/deskwork:install --no-prompt` (or equivalent CLI) against it. Verify `.deskwork/config.json` lands.
3. **End-to-end workflow drive:**
   - `deskwork add --site <site> "Test idea — <version>"` → assert calendar entry lands in Ideas.
   - `deskwork plan --site <site> <slug>` → assert stage transitions to Planned.
   - `deskwork outline --site <site> <slug>` → assert Outlining + workflow created.
   - `deskwork draft --site <site> <slug>` → assert Drafting + scaffold file written.
   - `deskwork review-start --site <site> <slug>` → assert workflow `state === open`.
   - `deskwork iterate --site <site> <slug>` (with a deterministic prompt that doesn't require an LLM call — e.g., a no-op iterate) → assert version bumps.
   - `deskwork approve <workflow-id>` → assert `state === applied` + destination file written.
   - `deskwork publish --site <site> <slug>` → assert Published + datePublished set.
4. **Studio cross-check.** After the CLI drive completes, walk the studio against the sandbox project root. Each stage of the drive should be visible in the dashboard at the appropriate moment. Screenshot the dashboard at each transition.
5. **Findings.** Any CLI failure, unexpected state, or studio mismatch becomes a finding. Otherwise an info-level "deep workflow drive completed cleanly" finding is appended.

**Time budget:** 25–45 minutes for the full deep walk. Operator review is separate.

### Findings document format

Markdown with a structured shape so `/post-release:file-issues` can parse it deterministically. Format:

```markdown
---
deskwork:
  id: <auto-generated-uuid>
title: Post-release acceptance — v0.10.0
---

# Post-release acceptance — v0.10.0

**Walk mode:** cursory
**Walked at:** 2026-04-30T18:14:22Z
**Marketplace version:** v0.10.0
**Studio loopback:** http://127.0.0.1:47321/

## Surfaces walked

- [x] `/dev/` (index)
- [x] `/dev/editorial-studio` (dashboard)
- [x] `/dev/editorial-help` (manual)
- [x] `/dev/editorial-review-shortform` (shortform desk)
- [x] `/dev/content` (content tree)
- [ ] `/dev/editorial-review/<some-id>` (no open workflows — skipped)

## Findings

### Finding 01 — Dashboard rows have no link target on rows without workflows

**Severity:** bug
**Surface:** `/dev/editorial-studio`
**Artifact:** [`docs/post-release/v0.10.0-artifacts/dashboard.png`](v0.10.0-artifacts/dashboard.png)

The Drafting stage section renders rows for entries without an open workflow, but those rows have no `<a href>` — clicking does nothing.

Repro: navigate to the dashboard with at least one Drafting entry that has no open workflow. Hover the slug. Pre-fix: cursor is text caret. Post-fix: cursor is pointer; click navigates to `/dev/content/<site>/<root>?node=<slug>`.

### Finding 02 — No playbook entry for `/dev/editorial-review-shortform`

**Severity:** enhancement
**Surface:** `/dev/editorial-review-shortform`

Cursory walk reached this surface via auto-discovery from the `/dev/` index, but `docs/post-release/playbook.md` has no per-surface assertions for it. Generic checks (200 + assets + no console errors) passed, but domain-specific checks couldn't run.

Action: add a section for this surface to the playbook in the next dw-lifecycle planning cycle.
```

**Parsing rules** (consumed by `/post-release:file-issues`):

- Each `### Finding NN — <title>` heading produces one GitHub issue.
- The `**Severity:**` field maps to a label (`bug`, `enhancement`, `info`).
- The `**Surface:**` field is included in the issue body as a `Surface: <path>` line.
- Artifact references are uploaded as image attachments via `gh issue create --body-file` + a separate `gh release upload` step (or referenced as relative paths under `docs/post-release/<version>-artifacts/` once committed to the branch).
- Findings with `**Severity:** info` are NOT filed as issues (they're walk-record only — the operator can choose to convert one to a real issue manually if needed).
- Findings can be DELETED in the studio editor before approval. Deleted sections don't get filed.

### File-issues mechanics

Invoked AFTER the operator approves the findings doc in the studio (workflow `state === applied`).

1. **Verify state.** Read the workflow journal entry for the findings doc. If `state !== applied`, refuse with: *"Findings doc workflow is `<state>`. Approve in the studio first."*
2. **Read approved version.** The applied version is the v(N) the operator approved — read from the destination file (the markdown), NOT from the journal (the journal has older versions).
3. **Parse findings.** Per the format above.
4. **Per-finding confirmation loop.** For each finding (skipping `info`-level):
   - Print the title + severity + surface + first 80 chars of body.
   - Prompt: `File this issue? [y/N/edit]`
   - On `y`: invoke `gh issue create --title "<title>" --body-file <tmp> --label <severity>`.
   - On `edit`: open the body in `$EDITOR`, then prompt again.
   - On `N`: skip.
5. **Summary.** After all findings processed, print: *"Filed N issues, skipped M, edited K. Findings doc remains at `<path>`."* The findings doc itself is now part of git history; nothing to clean up.
6. **Optional cross-link.** Each filed issue body ends with: *"Surfaced by post-release acceptance walk: [v0.10.0 acceptance](docs/post-release/v0.10.0-acceptance.md)."*

### Playbook — stays-current mechanism

Per the operator's directive: *"part of the dw-lifecycle planning for new features/capabilities/architectures, etc. is a review and update of the post-release customer acceptance playbook."*

**File:** `docs/post-release/playbook.md`

Format: per-surface sections with assertions tagged `cursory` or `deep`:

```markdown
## Surface: `/dev/editorial-studio` (dashboard)

### Cursory assertions

- [ ] Page returns 200.
- [ ] Every linked CSS/JS asset returns 200.
- [ ] No `console.error` in the page lifecycle.
- [ ] At least one `<a href>` in every dashboard stage section that has rows (i.e., rows have link targets — checks fix for #110).
- [ ] No legacy `/editorial-(add|plan|outline|draft|publish|distribute)` slash commands in `data-copy` attributes (checks fix for #69 / #104).

### Deep assertions

- [ ] After driving an entry through `add → plan → outline → draft`, the dashboard reflects the entry in the right stage column with the right meta strip.
```

**Stays-current mechanism (current — pre-dw-lifecycle-customizable-workflows):**

- The deskwork project's standard feature workflow (`/feature-define` / `/feature-extend` today; `/dw-lifecycle:define` once canonized) gains a checklist item: *"Review `docs/post-release/playbook.md`. Add or update assertions for the surfaces this feature touches."*
- This is procedural. It will fail when forgotten. The auto-discovery + "no playbook entry for this surface" finding is the safety net.

**Stays-current mechanism (future — once dw-lifecycle ships customizable workflows):**

- The playbook-update step becomes a typed phase in dw-lifecycle's feature workflow. The phase has acceptance criteria that block the workflow from advancing until the operator confirms playbook updates were considered. This is a sentence today; it requires real engineering in dw-lifecycle to land. Tracked separately from this skill.
- This is the same migration arc described in *Stop-gap status* at the top. The whole `/release` + `/post-release:*` family lands inside dw-lifecycle's customizable-workflow surface at that point; the playbook-update phase is one piece of that broader move. Designs and paths in this doc are provisional until that lands.

### Integration with `/release`

The hook into `/release` lives at the END of the existing five-pause flow:

- After Pause 5 (final push) succeeds and the release page is created, prompt:

```
Run /post-release:walk now to verify the install? [y/N]
> 
```

- On `y`: invoke `/post-release:walk --version v<just-shipped>`. The skill takes over.
- On `N`: print: *"Run `/post-release:walk` whenever you're ready. The walk needs the marketplace to be updated to v<version> first: `/plugin marketplace update deskwork`."*

The skill is decoupled from `/release` — re-invocable any time post-release. Useful when the operator spots something later and wants to re-verify, or when dogfooding ad-hoc against the most-recent release without a fresh ship.

### Open questions for operator review

1. **Sandbox project for deep mode** — should the sandbox live at a deterministic path (`/tmp/deskwork-acceptance-<version>`) or a fresh `mktemp` per run? Deterministic is faster (cache between runs) but state-leaky between versions. Recommendation: `mktemp`; clean up at the end. Override?
2. **Issue labels** — current proposal: severity maps to label name (`bug`, `enhancement`, `info`). Should there also be a `post-release` label so dogfood-surfaced issues are queryable? Recommendation: yes. Override?
3. **What if the operator never approves the findings doc?** — the doc lingers in the calendar with no terminal state. Per `agent-discipline.md`, *"content-management databases preserve, they don't delete"* — that's fine; the entry stays in `Drafting` (or wherever the workflow stalled). Recommendation: leave it; the next walk for v(N+1) creates a separate entry.
4. **Pre-existing GitHub issues** — should the file-issues step de-dup against existing open issues by title similarity? Risk: false-positive de-dup hides a real issue. Recommendation: no de-dup; if the operator confirms a finding that's a duplicate, they can close it manually with a cross-link comment. Override?
5. **Where does the skill family live in the repo?** — proposed `plugins/deskwork/skills/post-release/{walk,file-issues}/SKILL.md`. Or should this be a separate `post-release` plugin shell? Recommendation: inside the deskwork plugin (rationale in *Architecture* above). Override?

### Implementation order (preview — not yet a plan)

1. `docs/post-release/playbook.md` — initial playbook with assertions for current studio surfaces (v0.10.0 baseline).
2. `/post-release:walk` cursory mode — minimum viable walk: boot, auto-discover, screenshots, console errors, generate findings doc, ingest + review-start. Skip playbook assertions for v1.
3. `/post-release:walk` playbook assertions — wire the parsed playbook into the walk.
4. `/post-release:walk` deep mode — sandbox + CLI drive + studio cross-check.
5. `/post-release:file-issues` — parse approved findings doc, prompt-and-file.
6. `/release` end-prompt integration.
7. dw-lifecycle workflow checklist amendment (procedural; one-line addition to the feature-define / feature-extend skill bodies).

This is a sketch. The actual implementation plan comes after the design is approved (via `superpowers:writing-plans`).
