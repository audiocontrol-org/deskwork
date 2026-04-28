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
