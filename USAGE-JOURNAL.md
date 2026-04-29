# Usage Journal

In-the-trenches log of using the deskwork plugin + studio against real content. Distinct from `DEVELOPMENT-NOTES.md`:

- **DEVELOPMENT-NOTES.md** is contributor-facing: what we *built* this session, course corrections to development process, quantitative shipped-stuff.
- **USAGE-JOURNAL.md** (this file) is user-research-facing: what frictions we *hit* using the plugin and studio for real editorial work, what surprised us, what worked. Primary source material for adopter-experience UX work.

Each session that exercises the plugin in earnest gets an entry here. Capture: install / acquisition friction, lifecycle skill behavior, studio interactions, anything that surprised the operator (positively or negatively). Include direct quotes from the operator where they sharpen a finding. Tag items with **friction** / **fix** / **insight** when they cut clearly.

Append-only — keep prior entries verbatim so the friction history compounds.

Populating this file is a step in `/session-end`. If a session didn't exercise the plugin (e.g., infrastructure-only work), note that and skip — but reflect on whether something *should* have been exercised.

---

## 2026-04-28: Authoring + reviewing the source-shipped-plan via the public-channel marketplace install

**Session goal:** install deskwork in the deskwork-plugin monorepo (a non-website tool repo, dogfooding the plugin against itself), then use the lifecycle skills + studio to author + review the architectural plan that defines the source-shipped re-architecture.

**Surface exercised:** `/plugin marketplace add` + `/plugin install` + `/deskwork:install` + `deskwork add/plan/outline/draft/review-start` + `deskwork-studio` + `/dev/editorial-review/<id>` review URL.

### Setup phase

#### 1. Privileged-path violation

**friction.** First install attempt was about to hand-write `.deskwork/config.json` directly because I (the agent) had skills already loaded — without realizing the marketplace install was actually shadowed by a privileged `extraKnownMarketplaces` entry in `.claude/settings.local.json` pointing at the local source tree.

**fix.** Operator's Socratic correction: *"What's the first step of using a plugin?"* — pointed me at acquisition. Then: *"How do users acquire the deskwork plugin?"* — pointed me at the README's `/plugin marketplace add` + `/plugin install`. The privileged-path entries got removed from settings before re-attempting the install.

**insight.** When an agent has skills already loaded, it can be working from a privileged install path without realizing it. The cleanup discipline: read `settings.local.json` (and `settings.json`) for `extraKnownMarketplaces`, `enabledPlugins`, etc. — anything that shadows the public-channel install is a privileged shortcut that breaks the dogfood signal.

#### 2. Fabricated install command

**friction.** I quoted `claude plugin install --marketplace https://github.com/audiocontrol-org/deskwork <plugin>` from memory. Operator: *"Why didn't you look at the plugin's acquisition instructions?"* The plugin's README documents `/plugin marketplace add` followed by `/plugin install <plugin>@<marketplace>` — Claude Code slash commands, not shell commands.

**fix.** Saved as agent-discipline rule (now in `.claude/rules/agent-discipline.md`).

**insight.** The fabrication wasn't out-of-thin-air — `.claude/CLAUDE.md` had stale install syntax. Two doc sources disagreed (CLAUDE.md and the plugin README); CLAUDE.md was wrong. Fixed CLAUDE.md to point at the plugin README rather than duplicating syntax. Doc-drift between an internal contributor doc and the canonical adopter doc is a real failure mode — eliminate by pointing rather than duplicating.

#### 3. Malformed `/plugin marketplace add` paste

**friction.** Operator's first paste was three lines mashed together as one command, producing a malformed-URL error. Recovered by running each slash command separately.

**insight.** Multi-step slash-command sequences with newlines vs spaces are easy to fat-finger when copying from docs. The plugin README presents them as three separate code blocks, which helps, but a one-step "install everything" affordance would eliminate the trap.

#### 4. The deskwork-studio install failure (false alarm)

**friction.** `/plugin install deskwork-studio@deskwork` initially returned *"Plugin 'deskwork-studio' not found in any marketplace"* — even though `marketplace.json` listed it.

**diagnosis.** The settings.local.json `extraKnownMarketplaces` entry was pointing at the local source tree (a directory-source marketplace), and the directory-source resolver was failing on the second plugin entry. Removing the privileged path made `/plugin install deskwork-studio@deskwork` succeed cleanly.

**insight.** Privileged shortcuts in settings.local.json don't just give a "different but functionally equivalent" install — they actively interfere with the public-channel resolver. The dogfood signal is corrupted in subtle ways the operator can't easily diagnose without removing the privileged path entirely.

#### 5. Acquisition succeeded but the skill text was old

**friction.** After fixing the schema (host became optional) and pushing PR #52 to main, ran `/plugin marketplace update deskwork` which reported *"1 plugin bumped"*. Then `/deskwork:install` — but the loaded skill text was the OLD text, not the rewritten version.

**diagnosis.** Two caches:
- `~/.claude/plugins/marketplaces/deskwork/` — the marketplace clone, refreshed by `/plugin marketplace update`.
- `~/.claude/plugins/cache/deskwork/<plugin>/<version>/` — the plugin install, replaced only when the version differs.

Plugin version was still `0.8.1`. New marketplace clone had the new content, but `/plugin install deskwork@deskwork` saw `version: 0.8.1` matching the existing install and (apparently) didn't replace the cache contents.

**fix.** Bumped to `v0.8.2` via `npm run version:bump 0.8.2`, pushed to main, tagged. After `/plugin marketplace update` + `/plugin install deskwork-studio@deskwork` (which now showed `0.8.2 ≠ 0.8.1` cached) the new content landed.

**insight.** Real adopter-facing constraint. Doc / skill updates DON'T propagate to existing installs without a version bump. Operators following "edit the docs, push to main" mental models will be surprised when their existing install doesn't see the change. Either the plugin install logic should detect content-hash differences (not just version-string), OR every doc/code change requires a version bump (current state — RELEASING.md doesn't say this clearly).

### Install phase

#### 6. Stale `/tmp/deskwork-install-config.json`

**friction.** Wrote the install skill's recommended config to `/tmp/deskwork-install-config.json` but the Write tool failed (*"file has not been read yet"*). The helper still ran — but against an OLD config from an earlier session that had `audiocontrol` and `editorialcontrol` sites for a different project. Result: this project got `.deskwork/config.json` configured for the wrong sites, plus two empty calendar markdown files in `docs/`.

**fix.** Removed the wrong artifacts (`rm -rf .deskwork docs/editorial-calendar-{audiocontrol,editorialcontrol}.md`), Read the tmp file, then Write the correct config, then re-ran the helper.

**insight.** The `/tmp/deskwork-install-config.json` filename is not session-scoped. If a previous session left a config there, the install helper picks it up silently. Fixes:
- Use a session-unique tmp filename (PID, timestamp, UUID).
- Have the install helper print the FULL config it's about to apply before writing.
- Have the install helper fail if invoked without an explicit config path (already does — but the Write-failure-then-Bash-success path bypassed this).

#### 7. Missing `author` field

**friction.** After successful install, `deskwork outline` failed: *"Cannot scaffold blog post: no author configured. Set 'author' at the top level of .deskwork/config.json, or pass an explicit author."*

**fix.** Re-ran install helper with author added to the config. Idempotent — preserved existing calendar.

**insight.** The install skill's Step 2 doesn't ask about `author`. The schema treats it as optional, but downstream skills (outline, scaffolding) require it for the blog frontmatter `author:` field. Two cleanups:
1. Install skill should ask about `author` up front.
2. OR `outline` should accept an `--author` flag, prompt interactively, or default to git's `user.name`.

#### 8. The lifecycle dance is verbose

Lifecycle commands fired in order: `add` → `plan` → `outline` → `draft` → `review-start`. Each succeeded. Each prints the calendar entry's full state to stdout — readable, but each output is ~10 lines that scroll past quickly. After 5 commands, the terminal is full of repeated context.

**insight.** A `deskwork status <slug>` command (or `deskwork lifecycle-summary <slug>`) showing the current entry's path through the lifecycle in one place would help operators tracking multi-entry projects. Could be a single line: `source-shipped-deskwork-plan: Drafting (since 2026-04-28T21:17, 1 review workflow open)`.

#### 9. The body-merge step

The lifecycle scaffolds `docs/<slug>/index.md` with frontmatter + an H1 + a `<!-- Write your post here -->` placeholder. We had a fully-written plan at `~/.claude/plans/i-feel-like-our-resilient-kahan.md` that needed to land in the scaffolded file.

The merge: keep frontmatter (10 lines) from scaffold, drop scaffold's H1+placeholder body, append the entire plan file (which has its own H1). Done with `cat` + `head` outside the deskwork CLI.

**insight.** No deskwork affordance for "I already have the body — drop it into the scaffolded file." The `ingest` skill backfills entries from existing files, but it expects the file to already be at the right contentDir path, not at an arbitrary external path. A `deskwork import-body <slug> <external-path>` would close this gap.

### Review phase

#### 10. Studio CLI inconsistency: positional vs flag

**friction.** First boot attempt: `deskwork-studio . 2>&1` → *"error: unknown argument: ."* The CLI doesn't accept positional args, only `-r/--project-root <path>`.

**fix.** Re-invoked with `--project-root .` (or just no arg, since cwd is the default).

**insight.** `deskwork install <config-path>` accepts a positional arg (config path); `deskwork-studio` does not. CLI inconsistency. `deskwork-studio` could accept a positional arg as a shortcut for `--project-root` (matching `deskwork install`'s pattern).

#### 11. Auto-incremented port worked

The Phase 22 auto-increment behavior fired correctly — port 47321 was held by another studio instance. Helpful boot message: *"port 47321 was in use; using 47323 instead"*. Positive signal — recording.

#### 12. The review surface loaded with dead JS — exactly as predicted

`http://localhost:47323/dev/editorial-review/4180c05e-c6a3-4b3d-8fc1-2100492c3f38` rendered the plan prose cleanly. Console: `editorial-review-client.js: 404`. Same packaging bug as v0.8.1 (we hadn't touched the bundle/dist packaging in v0.8.2 — only the schema / install skill).

UX audit captured at `docs/source-shipped-deskwork-plan/scrapbook/ux-audit-2026-04-28.md`. The dominant blocker is still the missing client JS bundles.

#### 13. Chat-driven iteration is real and tedious

With JS dead, comments must come through chat ("on the line that says X, change it to Y"). Each comment is a verbal pointer instead of a visual margin anchor. For a 389-line plan, this is workable but lossy. Iteration cycle becomes:

1. Operator scrolls + reads in studio
2. Operator messages agent: "in Phase 4, second bullet, change X to Y"
3. Agent edits the file
4. Agent runs `deskwork iterate`
5. Operator reloads URL, sees v2

Each cycle has ~3 round-trips' worth of latency. With working margin notes the cycle would be ~1.5 round-trips.

### Cross-cutting observations

**A. The plugin reinstall cycle is heavy** — 8 distinct steps from "edit source" to "retry the workflow that surfaced the issue." Most steps should be invisible (auto-merge, auto-tag) but per the rule we don't bypass the public path. Current cost: ~5 minutes per source-fix iteration.

**B. The pre-push hook works** — caught a stale `bundle/cli.mjs` after a schema change to core (cli imports core; bundle was rebuilt by the hook). Confirms a positive signal.

**C. The marketplace's per-plugin tarball boundary** forces the bundle/server.mjs + bundle/cli.mjs pattern. Source-shipping (Phase 1+4 of the in-flight plan) needs to address how `@deskwork/core` reaches per-plugin tarballs — symlink with possible release-time materialization.

#### 14. Iterate button copies a stale slash-command name

**friction.** After v0.8.3 unblocked the studio's interaction layer (margin notes, buttons), operator clicked **Iterate**. The button copied `/editorial-iterate --site deskwork-internal source-shipped-deskwork-plan` to the clipboard. Pasted into Claude Code: *"Unknown command: /editorial-iterate"*.

**diagnosis.** The deskwork plugin's lifecycle skills are namespaced under `/deskwork:*` (so `/deskwork:iterate`). The studio's button-handler code in `plugins/deskwork-studio/public/src/editorial-review-client.ts` emits the legacy `/editorial-*` names (lines ~1481, 1482, 1504, 1505). Fix is a one-file source change.

**also.** The catalogue at `packages/studio/src/lib/editorial-skills-catalogue.ts` and the manual page at `packages/studio/src/pages/help.ts` are riddled with the same legacy names AND describe a slightly older lifecycle shape (e.g., `editorial-draft` was scaffold-and-advance; current is `outline` scaffolds, `draft` advances). That's a bigger documentation-refresh task — separate scope.

**insight.** The minimum fix for this iteration is the button-handler clipboard texts only (4 strings + 2 hint messages). Ship as v0.8.4. The catalogue + manual-page refresh follows. **Pattern to watch**: every place the studio emits a slash-command for the operator to paste into Claude Code is a coupling point with the plugin's skill namespace. Future skill renames will need to sweep these emit points (and `git grep '/editorial-'` would have surfaced them all in one pass).

**operator quote**: *"This is what was pasted into my clipboard when I clicked the iterate button: ❯ Unknown command: /editorial-iterate"*

#### 15. Workflow stuck in `iterating` with no recovery path

**friction.** After v0.8.4 was supposed to fix the slash-command name, operator's first paste of the Iterate-button output still hit `/editorial-iterate` because the running studio process was still bound to the v0.8.3 cache. The workflow state transitioned to `iterating` on the click; the paste failed; the action buttons disappeared from the strip; no way to re-trigger the clipboard copy.

**fix.** v0.8.5 — server-rendered `[data-action="copy-cmd"][data-cmd]` button paired with the `iterating` and `approved` state labels. Generic client-side handler runs `copyAndToast` on click. The pending command is built server-side via a new `pendingSkillCmd()` helper that mirrors the client-side button-handler logic for consistency.

**insight.** The studio transitions workflow state on button click, then expects the operator to run the corresponding slash command in Claude Code. If anything between click and successful slash-command invocation fails (clipboard issue, paste-into-wrong-window, slash-command rejected, agent crashed mid-iterate), the workflow is stranded with no in-studio recovery. v0.8.5's re-copy button is the minimum fix; the pattern of "client clicks transition state, operator must complete the loop in Claude Code" is brittle by design and worth revisiting (could be its own enhancement issue: in-studio retry/cancel for stuck states).

**operator quote**: *"There should be an affordance that tells me a) it's already waiting for the iteration skill invocation and; b) offers a way to load the skill invocation magic words into my clipboard again."*

#### 16. Margin note → iteration round-trip worked end-to-end

**fix.** First completed iteration through the deskwork pipeline post-v0.8.5. Operator left one margin note: *"Why do we need a default collection?"* anchored on `defaultSite → defaultCollection`. Agent read the comment from the workflow journal (`.deskwork/review-journal/history/`), rewrote the plan to surface three candidate treatments (rename / eliminate / re-term), ran `deskwork iterate --dispositions <path>` with the comment marked `addressed`. v2 snapshotted, workflow back in `in-review`, operator reloaded and saw v2.

**insight.** This is the workflow finally working. End-to-end latency: ~3 minutes per round (operator types comment → agent reads + rewrites + iterates → operator reloads). For a long doc with 12 comments, that's an afternoon; for a 1-comment round it felt fast. The disposition-with-reason mechanism (writing a `dispositions.json` for the iterate helper) records *why* the agent took the action it did, but that reasoning lives in JSON not in the studio sidebar — leads directly to the next item.

#### 17. Operator surfaced the agent-reply gap

**friction.** *"There's currently no way for the agent to make a further comment on a margin note to engage in a comment about the issue. The agent MUST make a change to the document in order to move the iteration forward, when often, further clarification/discussion may be needed."*

**fix.** Filed as enhancement [#54](https://github.com/audiocontrol-org/deskwork/issues/54) — capsule agent replies paired to operator comments, rendered inline in the studio sidebar with disposition badges. Constraint: short capsules, not essays; long discussion still goes in chat. Implementation sketch: extend the existing `--dispositions <path>` mechanism on `deskwork iterate` to accept reply text; render in the sidebar via a new `agentReplies` field on the comment record.

**operator quote**: *"That conversation can certainly happen in the agent chat interface, but then we lose the UX comfort of the review surface where the user [peruses] multiple requests for clarification at a time. Of course, we don't want to write essays in the margin notes, but we might want to write capsule summaries of in-chat discussions about multiple margin note entries that the user can comfortably peruse on a device better suited to review."*

**insight.** The iteration loop today is one-directional (operator → agent → document change). Real editorial review is conversational. Each margin note is a question more often than an instruction; the operator wants a reply they can peruse without scrolling chat history. The fix doesn't require multi-turn threading initially — a single agent capsule per operator comment, rendered with the existing disposition badge, would cover most cases.

#### 18. Plans-as-documents vs features-as-project-state — the distinction matters

**friction.** Asked the operator a leading question: should the feature-doc layout become the deskwork content collection? Reading: collapse them, one model. Operator's answer: no. *"We don't want to put 'feature' shaped things into deskwork. Deskwork is about tracking, ideation, creation, and editing documents — documents of any flavor."*

**insight.** Deskwork's job is editing; the feature-docs layout is project state. The PRD is a *document* that *describes* a feature; the feature itself (with its phases, GitHub issues, branch state, implementation tracking) is something else. Same content, different abstractions. Don't collapse.

The clean integration: PRD flows through deskwork's review/iterate/approve cycle (because it's a document); implementation gates on the workflow being `applied` (because the document IS the contract). The workplan is implementation tracking, not subject to deskwork review (operator's framing: *"I don't really care about the workplan as long as we get the PRD right"*). This led to baking the deskwork iteration step into `/feature-setup`, `/feature-extend`, and `/feature-implement` — strict gate, no override, PRD-only review.

#### 19. The recursive-dogfood pattern shipped four real releases

**insight.** Used the broken deskwork plugin to author and iterate the architectural plan for fixing the broken deskwork plugin. Each broken surface surfaced exactly when we needed to use it; each fix unblocked the next iteration. The arc:

| Step | Surfaced | Shipped |
|---|---|---|
| 1 | LinkedIn shortform review surface has dead JS | (problem identified — v0.8.1) |
| 2 | Schema rejects non-website project for the dogfood install | v0.8.2 — host-becomes-optional |
| 3 | After v0.8.2 install, studio JS still 404s in marketplace install | v0.8.3 — gitignore exception, dist files commit |
| 4 | After v0.8.3 unblocks JS, Iterate button copies stale slash-command | v0.8.4 — `/editorial-*` → `/deskwork:*` |
| 5 | Stale-bundle paste left workflow in `iterating` with no recovery | v0.8.5 — re-copy affordance |
| 6 | Studio works end-to-end; iterate the plan; approve v2 | (no new release — used existing v0.8.5) |
| 7 | Plans aren't features; bake deskwork into `/feature-*` skills | (skill amendments — landed in this session) |

Five releases earlier in the same calendar day (v0.7.0 → v0.8.1, prior session). Four more in this session (v0.8.2 → v0.8.5). Nine releases on 2026-04-28 — most driven by dogfood discoveries, none planned in advance. The pattern: reach for the tool, hit a broken edge, fix the edge, retry, hit the next broken edge. Public-channel discipline forces every fix through release-and-reinstall, which is slow per-iteration but honest about what an adopter would experience.

### Cross-cutting observations (continued from initial entry)

**D. Public-channel reinstall cycle is the bottleneck.** ~5 minutes per source-fix iteration: edit → commit → bump version → tag → push → release-workflow runs (~2 min) → operator runs marketplace update + install + reload → restart studio. Multiplied across 4 iteration loops in this session, that's ~20 minutes of pure ceremony. Phase 23's source-shipped architecture would compress this to "edit + npm-install + tsx restart" — much tighter feedback loop, while still honest about what the adopter sees (because the adopter ALSO runs source via tsx after their first npm install).

**E. The studio's port auto-increment worked silently and well.** Multi-process testing across this session left a cluster of studios on 47321/47322/47323/47324. Phase 22c's auto-increment + boot-banner-prints-the-actual-port worked exactly as designed; never had to figure out which studio was on which port from external context.

**F. Marketplace cache vs install cache.** Two separate things. `/plugin marketplace update` refreshes the marketplace clone at `~/.claude/plugins/marketplaces/deskwork/`. `/plugin install` replaces the install cache at `~/.claude/plugins/cache/deskwork/<plugin>/<version>/` ONLY if the version differs. Doc/skill changes pushed without a version bump don't propagate. Hit this twice; required v0.8.3 + v0.8.4 to actually be discrete version bumps. Worth documenting more visibly in `RELEASING.md`.


---

## 2026-04-29: March the omnibus PRD through deskwork to expose adoption friction; fix the bug cluster

**Session goal:** Clear the `/feature-implement` strict gate so Phase 23 (source-shipped re-architecture) can begin. The gate requires the omnibus PRD's deskwork workflow to be `applied`. The PRD predates the deskwork-baked feature lifecycle (no `deskwork.id` in frontmatter, no review workflow). Operator's framing on hitting the gate-letter-vs-spirit conflict: *"use /deskwork:add to add the prd; we'll march it through the process to find friction points."*

**Surface exercised:** `/deskwork:add` + `/deskwork:plan` + `/deskwork:ingest` + `/deskwork:outline` + `/deskwork:draft` + `/deskwork:review-start` + `deskwork doctor` + `deskwork-studio` + `/dev/editorial-studio` + `/dev/content/<collection>/<path>` + `/dev/editorial-review/<id>` + `/dev/editorial-review-shortform` + `/dev/editorial-help` + `/dev/scrapbook/<collection>/<slug>`.

### Phase 1 — march the PRD through deskwork

#### 1. `/deskwork:add` for an existing file is the wrong skill

**friction.** Used `/deskwork:add "PRD: deskwork-plugin"` against an existing file at `docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md`. Lands the entry in Ideas with no binding to the actual file. The skill prose doesn't mention `/deskwork:ingest` exists. Adopter mental model: *"I have a file; I want it in the calendar"* → `/deskwork:add`. But `/deskwork:add` is for **new ideas not yet drafted**.

**fix.** Filed [#58](https://github.com/audiocontrol-org/deskwork/issues/58). `/deskwork:add` should redirect to `/deskwork:ingest` for existing files; both should be discoverable from each other's prose.

#### 2. Mandatory SEO keywords are nonsensical for internal docs

**friction.** `/deskwork:plan` requires keywords. SEO keywords for a PRD make no sense — there's no search index this doc is optimizing for. Forced descriptive tags (`deskwork-plugin`, `prd`, `feature-tracking`, `internal-doc`) just to advance the stage.

**fix.** Filed [#57](https://github.com/audiocontrol-org/deskwork/issues/57). Make keywords optional, or generalize the field from `targetKeywords` to `tags`.

#### 3. Content type vocabulary hard-coded for websites

**friction.** `/deskwork:add --type` accepts `blog` / `youtube` / `tool`. PRD doesn't fit any. Forced `blog` because it has the right technical shape (markdown file in contentDir) — but it's not a blog post.

**fix.** Filed [#60](https://github.com/audiocontrol-org/deskwork/issues/60). Make content types collection-defined; `doc` / `internal-doc` / `spec` as built-in defaults.

#### 4. No remove subcommand

**friction.** Realized #58 mid-march; wanted to delete the wrong-skill entry and start over. Closest is `/deskwork:pause` — but pause is for *"actively-not-working-on, may resume,"* not *"never should have been added."* Recovery required hand-editing `.deskwork/calendar.md`.

**fix.** Filed [#59](https://github.com/audiocontrol-org/deskwork/issues/59). New `/deskwork:remove <slug>` subcommand for the added-by-mistake case.

#### 5. Calendar stage decoupled from review workflow state

**friction.** While editing the calendar, noticed the source-shipped-plan entry sits in `Drafting` stage despite its review workflow being terminal `applied`. No auto-advance from workflow → calendar.

**fix.** Filed [#61](https://github.com/audiocontrol-org/deskwork/issues/61). Define the relationship between workflow state and calendar stage; auto-advance on `applied`/`cancelled`.

#### 6. `/deskwork:ingest` on a file with no frontmatter — wrong defaults

**friction.** PRD has no YAML frontmatter at all. Dry-run plan: `add deskwork-plugin/prd Ideas 2026-04-28 slug:path state:default date:mtime`. Three problems: (1) defaults to Ideas stage despite the file having multi-thousand-word body, (2) date is mtime (last edit) not first-commit (editorial creation), (3) no documented behavior for what `--apply` does on a frontmatter-free file.

**fix.** Filed [#62](https://github.com/audiocontrol-org/deskwork/issues/62). State-inference heuristic for legacy docs; date waterfall through git history; explicit no-frontmatter behavior.

#### 7. `/deskwork:ingest --apply` doesn't write `deskwork.id` to the file (BUG)

**friction.** This is the one. Ingest creates a calendar entry with UUID `9845c268-...` but does NOT write `deskwork:` frontmatter to the source file. Calendar entry is **orphaned at creation**. Doctor immediately flags `missing-frontmatter-id`.

**fix.** Filed [#63](https://github.com/audiocontrol-org/deskwork/issues/63). FIXED IN SOURCE this session. Awaiting v0.8.6 release.

#### 8. Ingest derives title from slug, ignores headings + frontmatter title

**friction.** Calendar shows title as `Prd` (titlecased last slug segment) — not `PRD: deskwork-plugin` from the H2 heading. Studio renders the bad title throughout. Manual fix would touch every surface.

**fix.** Filed [#64](https://github.com/audiocontrol-org/deskwork/issues/64). Title-derivation waterfall: frontmatter `title:` > H1 > H2 > slug-titlecase fallback.

#### 9. Doctor `--yes` skips ambiguous cases (couldn't auto-recover from #63)

**friction.** Tried `deskwork doctor --fix=missing-frontmatter-id --yes` to recover from #63. Doctor detected the unbound entry but skipped in `--yes` mode (couldn't guess which file to bind). The originating ingest call already KNEW the file path — the data was just lost in transit.

**fix.** Filed [#65](https://github.com/audiocontrol-org/deskwork/issues/65). Capture binding hint at ingest time; doctor uses it for `--yes` auto-fix.

#### 10. `/deskwork:outline` scaffolds a duplicate file even when entry is bound elsewhere (BUG)

**friction.** With the PRD bound (after I manually added `deskwork.id`), ran `/deskwork:outline deskwork-plugin/prd`. The slug-derived path is `docs/deskwork-plugin/prd/index.md`; the actual file is at `docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md`. Outline created a NEW file at the slug-derived path. Doctor immediately flagged `duplicate-id` — both files have UUID `9845c268-...`.

**fix.** Filed [#66](https://github.com/audiocontrol-org/deskwork/issues/66). FIXED IN SOURCE. Outline now consults the content index for the entry's UUID before scaffolding; refuses with *"Cannot scaffold: entry … is already bound to file at …"*.

#### 11. `/deskwork:review-start` can't find the file — slug-derived path lookup ignores UUID binding (BUG umbrella)

**friction.** Ran `/deskwork:review-start deskwork-plugin/prd`. Failed: *"No blog markdown at docs/deskwork-plugin/prd/index.md."* The actual file is at `docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md` with the right `deskwork.id`. Studio's HTTP handler does the right thing (UUID first, then template); CLI's review-start command calls `resolveBlogFilePath` directly. **Two parallel implementations of the same lookup.**

Likely additional instances (untested but suspected): `/deskwork:approve`, `/deskwork:iterate`, `/deskwork:publish`, all inheriting the same bug.

**fix.** Filed [#67](https://github.com/audiocontrol-org/deskwork/issues/67) as the umbrella. FIXED IN SOURCE. New `resolveEntryFilePath` in `@deskwork/core/paths` consolidates the UUID-first-then-template precedence; the studio's `resolveLongformFilePath` now delegates to it (one source of truth). Four CLI commands refactored.

### Phase 2 — exercise the studio surfaces, surface remaining friction

#### 12. Dashboard polls a 404 endpoint

**friction.** Console error: `404 /api/dev/editorial-studio/state-signature`. Dashboard footer claims `auto-refresh · 10s`. Either the endpoint doesn't exist or the client URL is wrong.

**fix.** Filed [#68](https://github.com/audiocontrol-org/deskwork/issues/68).

#### 13. Dashboard + manual still emit legacy `/editorial-*` slash names

**friction.** v0.8.4 fixed BUTTON-emitted commands. Empty-state PROSE was missed. Ideas section: *"Run `/editorial-add` to capture one."* Same for `/editorial-plan`, `/editorial-outline`. Paused was correctly updated — inconsistent. The manual page has 12 legacy references.

**fix.** Filed [#69](https://github.com/audiocontrol-org/deskwork/issues/69). Single grep + replace across renderers.

#### 14. Content tree renders ghost path for non-template-located files (BUG)

**friction.** `/dev/content/deskwork-internal/1.0` shows the PRD's file path as `/1.0/001-IN-PROGRESS/deskwork-plugin/prd/index.md` — that path doesn't exist. Real path is `/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md` (no `prd/` directory). The same review link uses the correct UUID — proving the binding is in the data; only display is broken.

**fix.** Filed [#70](https://github.com/audiocontrol-org/deskwork/issues/70). FIXED IN SOURCE. `ContentNode.filePath` now carries the actual on-disk path; renderer uses it.

#### 15. Content tree fabricates `/blog/<slug>` URL for host-less collection

**friction.** Same content tree shows `/blog/deskwork-plugin/prd` labelled *"public URL on the host site"* — but the `deskwork-internal` collection has no `host` configured. v0.8.2's host-optional work missed this rendering surface.

**fix.** Filed [#71](https://github.com/audiocontrol-org/deskwork/issues/71). Coordinated with Phase 24's collection-vocabulary sweep.

#### 16. Shortform desk shows hard-coded platform list

**friction.** *"Supported platforms: reddit, linkedin, youtube, instagram"* — these are audiocontrol.org's distribution targets, not universal. Shows on every collection regardless.

**fix.** Filed [#72](https://github.com/audiocontrol-org/deskwork/issues/72). Make platforms collection-config-defined.

### Phase 3 — fix the bug cluster, validate end-to-end

After 16 issues filed, operator's framing: *"What I like about what we've done so far: you uncovered your own UX issues. We need to be in that state as often as possible."* Saved as agent-discipline rule.

Dispatched typescript-pro with a precise brief covering the 4-bug cluster (#63, #66, #67, #70). Agent returned with: 11 source files modified, 5 test files added (21 cases), 652 workspace tests green, both plugins validate, typecheck clean. One judgment call worth noting: `packages/studio/src/pages/content.ts` was already over the 500-line guideline before the changes — agent flagged in summary, did not refactor (correctly per the no-opportunistic-cleanup constraint).

**Dogfood validation against this monorepo via the workspace binary** (`./node_modules/.bin/deskwork`):

| Bug | Reproduction | Result |
|---|---|---|
| **#67** | `deskwork review-start deskwork-plugin/prd` | ✓ workflow `d05ebd7d-…` created via UUID lookup |
| **#63** | `deskwork ingest <fresh-file> --apply` (no frontmatter) | ✓ `deskwork.id` prepended; UUID matches calendar |
| **#66** | `deskwork outline <bound-entry>` | ✓ refused with *"Cannot scaffold: entry … is already bound to file at …"* |
| **#70** | `/dev/content/deskwork-internal/1.0` | ✓ PRD shows `/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md` (real path) |

### Cross-cutting observations

**G. Bugs cluster around abstraction seams.** Phase 19's UUID-binding contract landed in some places (calendar, doctor's three-tier search, studio HTTP handlers) but not in CLI subcommands, scaffold, ingest, or content-tree rendering. The seam between "abstraction introduced" and "every consumer migrated" is exactly where bugs hide. Centralizing the UUID-first lookup in one `resolveEntryFilePath` eliminated the seam.

**H. Agent-as-user dogfood is the highest-throughput friction-finding mode.** 16 issues in one session — roughly 4× the rate I'd surface from abstract UX review. Each issue has a concrete reproduction recorded as it happened, not reconstructed after the fact. The fixes that emerge are tightly scoped because the bug surfaces with its exact friction context. Operator's quote is now a project rule.

**I. Strict gates surface real workflow questions.** The `/feature-implement` strict refusal forced a confrontation: does the omnibus PRD belong in deskwork's editorial pipeline at all? The march that resulted produced 16 issues + 4 bug fixes. A gate-bypass would have produced 0 of those. Strict gates aren't just preventing bad work — they expose where the model and the work diverge.

**J. The fix isn't done until the public path is fixed.** Source-level fixes that pass unit tests + dogfood validation against the workspace binary are NOT the same as adopters getting the fix. The marketplace tarball at v0.8.5 is what real users see; v0.8.6 ships the fix to that surface. This session's work is half-done; release-and-reinstall in next session is the second half. (And THAT validation step uses the public-channel install path — closing the loop honestly.)

**K. The `/dev/editorial-review/<id>` error page when no workflow exists is reasonable.** When I navigated to the PRD's review URL with no workflow yet, the page rendered: *"No galley to review."* with the slug, the error reason, the suggested CLI command, and a back link. Clear and actionable. (The suggested command would have failed due to #67, but that's a downstream of the bug, not the error page's fault.)

**L. Studio breadcrumb inconsistency** — minor friction not filed yet. Scrapbook viewer's breadcrumb collection-name links to `/dev/editorial-studio` (dashboard), but content-tree's collection-name breadcrumb links to `/dev/content/<collection>/`. Same context, two destinations. Could consolidate as part of a future studio polish pass.
