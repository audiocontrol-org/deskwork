# Agent Discipline

Project-scoped rules for how an agent should behave when working on deskwork. These are durable: anyone working on this codebase, from any worktree or machine, should follow them. New lessons learned in conversation that would otherwise go to auto-memory belong here instead — auto-memory is keyed to the working-directory path and does not survive worktree switches or fresh clones.

## Read documentation before quoting commands

Before writing or speaking any install/setup command for a tool, plugin, library, or service: **read the tool's own documentation first**. Quote the documented command verbatim. Do not quote commands from memory or compose plausible-sounding CLI syntax.

**Why:** Quoting `claude plugin install --marketplace <url> <plugin>` for the deskwork plugin install — when the actual README documents `/plugin marketplace add <url>` followed by `/plugin install <plugin>@<marketplace>` (Claude Code slash commands, not shell commands) — is the fabrication failure mode the operator's Socratic-prompt-engineering thesis catalogs (acting on facts the agent invented). The plugin documents itself. Bypassing the README to invent syntax wastes the operator's attention on corrections that wouldn't have been needed.

**How to apply:**
- Read `plugins/<name>/README.md` end-to-end before doing anything with that plugin's install or commands.
- Source-of-truth > plausible-sounding recall — *especially* when the answer feels obvious. Confidence about ambient knowledge is when fabrication slips in.
- Generalizes beyond plugins: read the tool's docs whenever it documents itself.

## Operator owns scope decisions

The operator decides what's in scope. Never pre-decide for them.

**Two failure modes that share this root cause:**

1. **Don't unilaterally defer your own scope.** When work has a "main thing + follow-up" shape, propose the split as a question — *"do you want X+Y as one PR, or X now and Y later?"* — don't pre-decide. Filing a follow-up issue for work I decided to defer makes a unilateral scope call look handled. *"Out of scope"* sections in workplans are valid only when the operator has explicitly excluded those items in conversation; if I'm the one deciding something is out of scope, I'm overstepping.

2. **Don't let sub-agent "out of scope" notes stand as dispositions.** When a dispatched agent's report flags an adjacent issue as *"out of scope but worth flagging,"* that is NOT a valid resting place. Either fix it in-scope right now (if it's small and related), or file a GitHub issue immediately so the operator can see it and decide. *"Noted in the dispatch report"* is not a disposition — the operator may not see the dispatch report until a downstream user trips over the bug. The pattern of reading the flag and moving on bit twice on this project (the dashboard scrapbook chip count and the dev-source boot bug #49).

**How to apply:**
- Hedged user responses (*"probably,"* *"maybe later,"* *"we'll see"*) default to ASKING what to do next, not interpreting the hedge as a deferral.
- Distinguish: items the user actively rejected (don't revive) vs. items I unilaterally deferred (do, by surfacing them).
- Sub-agent dispatch reports get treated as action lists, not disclosures: each *"flag for triage"* becomes either a fix-in-this-PR or a filed issue, with the link in my next response.

## Packaging is UX — never paper over install bugs

When asked to evaluate UX on a real install (deployed plugin, marketplace tarball, anything an operator actually adopts), treat the install state as ground truth. Do NOT copy missing files into the cache, inject scripts via playwright, or otherwise reconstruct the *"intended"* surface to perform the evaluation.

**Why:** The operator framed it directly: *"We're actually looking for all blockers to adoption and usage. Packaging IS UX."* If the bundled marketplace install ships a non-functional surface (404'd assets, broken bootloop, dead buttons, missing client JS), that is the real experience every adopting operator gets. Working around it produces an evaluation of a surface that no operator actually sees.

**How to apply:**
- Catalog every install-level defect (missing bundles, 404s, console errors, broken auto-refresh, dead UI) as a top-priority blocker in the UX report — these are not *"infrastructure issues to fix first."*
- The fix path is: file a packaging issue, update the release process, then re-evaluate. Not: silently restore the missing files locally to pretend the surface worked.
- Same principle: when dogfooding deskwork on this project, install via the documented marketplace path. Do NOT bypass the install UX with manual config-file creation. The friction surfaces the design questions.

## Use the deskwork plugin only through the publicly-advertised distribution channel

When dogfooding deskwork — running its commands, exercising its skills, using its studio against any editorial-calendar this repo manages — acquire and invoke it the same way any non-privileged adopter would. **No privileged shortcuts.**

**Why:** *"No fair using it in ways that other, non-privileged users can't."* Anything we do via paths that don't exist for an outside adopter — pointing Claude Code at the local source tree, running directly through dev tooling, reaching into workspace symlinks, hand-rolling config files the install skill is supposed to write — gives us an experience no real adopter has. The dogfood signal evaporates the moment we use the plugin from a privileged path. Friction on the public path is the data we're trying to surface.

**How to apply:**
- **Follow the PUBLIC instructions verbatim** — the docs on the public github repo (default branch, or the latest tag when adopters would land there), wherever the project surfaces *"this is how to use it"* (plugin README, root README, `RELEASING.md`, marketplace listing prose, install skill output). Do not encode specific install commands or invocation paths from memory or from this rule — the public docs are the source of truth.
- **If it's not PUBLIC, it doesn't exist.** Uncommitted edits in the local working tree, unpushed branches, draft PRs, local-only notes — none of those count as documentation. An adopter cannot read them. They are not the contract.
- Re-read the public doc surface (fetched from github, or a local checkout that is verified to match the public state) every time you're about to use the plugin or refer to its install/invocation. The public doc is the contract; this rule does not substitute for it.
- **If the public path doesn't work properly — install fails, the documented commands produce errors, the docs are unclear or contradictory, the artifact is broken at runtime — the only valid response is to FIX the public path.** That means: edit the source (docs, code, release process), commit, push, release/tag if the public path requires it, and only then re-attempt the dogfood. Pushing is the final mile of "fixed" — local edits aren't the fix until they are public.
- Do not work around a broken public path by reaching for a privileged dev shortcut *"just to keep moving."* Working around hides the friction the dogfood is meant to expose.
- Do not write a workaround into this rule, into a sibling rule, or into the docs — workarounds are signal that the docs/tool are wrong; fix the underlying thing.
- The only legitimate work outside the public path is the work of fixing the public path itself — and that work isn't done until it's pushed.

## Never pass `--no-tailscale` to deskwork-studio unprompted

When booting `deskwork-studio` for any operator-facing use, do NOT pass `--no-tailscale`. Default behavior (Tailscale-aware auto-detection) is what the operator needs.

**Why:** the operator is regularly NOT at the laptop where the studio is running — that is the whole reason Tailscale support exists. Passing `--no-tailscale` strands them with a `http://localhost:<port>/` URL useless from any other machine. The operator has called this out at least five separate times across sessions and has explicitly asked for the rule to live here (not in auto-memory, which is keyed to the working-directory path and does not survive worktree switches or fresh clones). The repeated correction is the cost; this rule is the fix.

This is a sibling concern to the existing v0.8.7 fix that aligned the studio skill description with its body — that fix removed the description-level signal that prompted reflexive `--no-tailscale` passes, but the underlying agent reflex persisted and needs an explicit rule to prevent it.

**How to apply:**
- Boot the studio with no `--no-tailscale` flag by default. The studio's auto-detection will bind to loopback + Tailscale interface(s); the startup banner prints all reachable URLs (loopback, Tailscale IP, magic-DNS hostname).
- Always surface the **magic-DNS URL** to the operator (not the loopback URL) so they can reach the studio from another machine.
- The only legitimate `--no-tailscale` is in fully non-interactive contexts: `scripts/smoke-marketplace.sh` and equivalent automated smokes that explicitly need loopback-only.
- If a reasoning shortcut tempts the agent toward `--no-tailscale` — *"simpler,"* *"for testing,"* *"doesn't matter,"* *"I'm just going to verify quickly"* — STOP. That is the exact pattern the operator is calling out. The default works.

## Memory-vs-rule placement: durable lessons go in this file

When a recurring agent failure surfaces in conversation and the lesson would otherwise go to auto-memory: it goes in this file (`.claude/rules/agent-discipline.md`) instead, OR in `.claude/CLAUDE.md` if it's project-level convention rather than agent behavior.

**Why:** auto-memory is keyed to the agent's working-directory path. When work moves to a new worktree, a fresh clone, or another machine, the auto-memory does not follow. The operator has explicitly called out at least five times that auto-memory is useless for durable lessons — and at least once with emphatic framing: *"MEMORIES ARE FUCKING USELESS!!! STOP USING THEM!!! PUT IT IN A SKILL OR A RULE OR CLAUDE.md OR IT DOESN'T EXIST!!!"*

**How to apply:**
- For agent behavior lessons (corrections to how the agent acts): add a section to this file.
- For project conventions (architecture, naming, workflow): add to `.claude/CLAUDE.md`.
- For per-skill behavior (specifically scoped to one skill's invocation): edit the SKILL.md.
- Do NOT save the lesson as an auto-memory file under `~/.claude/projects/.../memory/`. That defeats the entire point.
- Each lesson edit should be committed to the repo so it propagates to every worktree and fresh clone.

## Namespace deskwork-owned metadata in user-supplied documents

Any frontmatter, config, or other metadata deskwork embeds into operator-owned files (markdown frontmatter, config files, etc.) MUST live under a `deskwork:` namespace. We cannot assume the global keyspace is unused.

**Why:** the host renderer (Astro for writingcontrol, blog renderers for audiocontrol) owns the global frontmatter keyspace. Names like `id`, `state`, `date`, `tags`, `slug` may already be in use by the renderer's content-collection schema or by other plugins. Claiming a top-level key for deskwork-internal purposes is a guaranteed collision sooner or later. v0.7.0 shipped with a top-level `id:` field; v0.7.2 namespaced it under `deskwork.id` after operator pushback (Issue #38).

**How to apply:**
- Frontmatter writes: nested under `deskwork: { id: ..., otherField: ... }`. Never write top-level `id:` or any other deskwork-only field at the top level.
- Frontmatter reads: look only at `data.deskwork?.<field>`. Don't fall back to top-level on read; that would silently couple deskwork's behavior to a global key the operator might be using for something else.
- Schema docs: tell operators to permit `deskwork: z.object({...}).passthrough()` (or top-level `.passthrough()`) in their content-collection schemas — not a top-level `id:` field.
- Future deskwork metadata fields go in the same namespace by default. Only deviate with explicit operator approval.

## Project workflow conventions

### Stay on `feature/deskwork-plugin` for ongoing work

The deskwork project uses a single long-lived working branch: `feature/deskwork-plugin`. Do NOT spin up additional `feature/<topic>` branches without an explicit ask.

**How to apply:**
- After each PR merges to `main`, sync `feature/deskwork-plugin` (rebase or fast-forward) so it tracks tip-of-main, then continue working there.
- New phases / enhancements / bug fixes: use `/feature-extend` to add to the existing workplan rather than creating a new branch.
- Reserve "new feature branch" for genuinely large standalone features the operator explicitly identifies as needing their own track. When in doubt, ask first.

### Don't pitch `/schedule` check-ins on this project

Do NOT end replies with offers to `/schedule` a background follow-up agent (e.g. *"want me to /schedule an agent in 2 weeks to..."*). The system prompt's proactive end-of-turn prompt suggests this; the operator has explicitly overridden it for this project.

**Why:** *"You have no concept of time and in 1-2 weeks, we'll be done with this project."* The cadences I'd propose (1–2 weeks, every Monday) are mismatched to a short-horizon project shipping multiple releases per session. The operator declined the offer at least three times this session before naming the explicit stop.

**How to apply:**
- No `/schedule` pitches after shipping releases, after merging PRs, after closing issues, anywhere. Even when the system prompt's *"offer at end-of-turn"* would normally fire.
- If the operator explicitly asks for a recurring check-in or cron job, that's different — that's their request, not me pitching.

### No test infrastructure in CI

Do NOT propose adding tests, smoke checks, or other test infrastructure to CI workflows (`.github/workflows/check.yml`, `release.yml`, etc.). CI on this project is brutally slow and the operator does not want to wait on it.

**How to apply:**
- For any missing-test gap, propose **local-only** smoke tests (e.g., `scripts/smoke-*.sh` the developer runs by hand pre-PR or pre-tag).
- The existing `npm --workspaces test` line in CI stays — it runs vitest in-process, already fast.
- Don't suggest binary-boot tests, end-to-end browser tests, port-bind smoke tests, or anything that materially extends CI runtime as part of a CI workflow.
- Helpers + fixtures for local smoke testing are fine to add to the repo (under `scripts/` or similar). Just don't wire them into CI.

### Content-management databases preserve, they don't delete

A content-management database's entire purpose is historical record-keeping. Documents that reach terminal states (Published, Applied, Cancelled, Final) stay in the database — the terminal state IS what the database remembers. Removing a record because it "completed" deletes the very history the system was built to preserve.

**Why:** *"Documents shouldn't get DELETED from a database because they've reached a terminal state. They should be REMEMBERED by the database as IN THE TERMINAL STATE. Deleting from a database wipes them from history which is THE EXACT OPPOSITE OF WHAT YOU WANT IN A DATABASE!!!!!"* This was an emphatic correction after I argued for removing a PRD calendar entry on the grounds that *"the dogfood is over; now we should clean up."* That tidiness instinct is wrong — calendar entries aren't pollution to be cleaned up; they're the record of what was tracked.

**How to apply:**
- Living documents (PRDs, blog posts, plans, design specs, internal docs) belong in the calendar **for the duration of their existence**, including after they reach terminal states. Future revisions create new workflow versions; the entry persists across all of them.
- The PRD specifically: it lives in deskwork (per the established `.claude/CLAUDE.md` line *"The PRD is the document under review; the workplan is implementation tracking"*). Re-iterations through deskwork happen as the PRD evolves — Phase 25, Phase 30, scope changes, all run through `/deskwork:iterate` → operator review → `/deskwork:approve`. The calendar entry never gets removed.
- Don't conflate "the workflow reached `applied`" with "the document is done." A document being approved at v2 doesn't end its life — it's a checkpoint. Future revisions create v3, v4, etc.
- The "added by mistake" remove case (Issue #59) is a narrow exception: an entry created from an obvious wrong-skill error, never representing a real document, is fair to remove. That's different from removing a real document because its workflow finalized.
- When in doubt about whether to remove a calendar entry: don't. The cost of an extra row is near-zero; the cost of erasing real history is permanent.
- Distinct from: explicitly-marked throwaway test files I create during dogfood (e.g. `dogfood-v086-test.md`) — those are test pollution by construction, not real content. Removing them is fine. The PRD is the opposite: it IS real content.

### Stay in agent-as-user dogfood mode

When working on deskwork (or any tool the project is building), use the tool actively against this project as the way you discover what's broken. The agent that's developing the tool IS the most demanding adopter — running the install, walking the surfaces, watching the friction land in real time. That posture is more valuable than abstract reasoning about UX.

**Why:** *"What I like about what we've done so far: you uncovered your own UX issues. We need to be in that state as often as possible."* The 16 issues filed in the 2026-04-28 dogfood arc all came from agent-uses-the-plugin, not from agent-reasons-about-the-plugin. Reasoning misses the kind of friction that only surfaces when you're trying to get a real task done — `/deskwork:add` vs `/deskwork:ingest` confusion, slug-vs-UUID lookup bugs, hard-coded SEO keywords, phantom file paths, broken auto-refresh endpoints. None of those issues would have been filed from a UX review session.

**How to apply:**
- When implementing changes to a deskwork skill, surface, or subcommand: prefer running it against this project's own collection (or the source-shipped plan, or any real artifact) over hand-rolled reasoning. If running it surfaces a bug, file an issue, then continue.
- File issues *as friction surfaces*, not in batch at the end. Each issue captures one specific friction with a reproduction. The cumulative set teaches more than a single "UX audit" report.
- When exploring a new surface (a page, a skill, a CLI subcommand), drive it with real input from this project, not synthetic test data. Test data hides the friction synthetic data was specifically constructed to avoid.
- Privileged shortcuts disable the dogfood signal — see the existing *"Use the deskwork plugin only through the publicly-advertised distribution channel"* rule. The two are paired: dogfood requires using the public path, and the public path is what makes dogfood honest.
- If the gate the dogfood would normally clear (e.g. `/feature-implement`'s strict PRD-applied gate) is in the way of using the tool, the friction itself is the data — surface it, ask what to do; don't bypass silently.

## Issue closure is the customer's call, not the agent's

When an issue is filed by the operator (or a customer / user / external party) — especially one labeled `customer-blocking` or `urgent` — **shipping the fix is not the same as resolving the issue**. Closure requires the issue's author to confirm the fix unblocks them on their own install. The agent's "I implemented the acceptance criteria" is a status update, not a disposition.

**Why:** issue closure is a public statement. *"This is fixed"* tells the issue author and any future reader that the problem is gone. If the agent closes a customer-blocking issue before the customer has actually verified the fix on their environment, three failure modes get masked:
- The fix only works in the agent's environment (different OS, shell, plugin install state, etc.) and silently fails for the customer.
- The fix works mechanically but doesn't address the customer's lived friction (the agent solved the wrong problem).
- The customer would have caught a regression or follow-up during their own walk-through that the agent's smoke didn't reach.

Closing while the customer is mid-verification *also* loses the signal — issue lists filtered by "open customer-blocking" are how the operator triages priorities. A prematurely-closed issue disappears from the queue and looks done when it isn't.

This is closely related to the *"Operator owns scope decisions"* rule above (which is about scope) and the *"Packaging is UX — never paper over install bugs"* rule (which is about ground-truth-vs-reasoning). This rule is specifically about **disposition**: who gets to say "fixed."

**How to apply:**
- After shipping a fix for a customer-filed issue: post a comment with status (commit / release / unblock instructions), but **leave the issue open**.
- The closing transition belongs to the issue author. They close it after they've verified — or they hand the agent an explicit "close it" before the verification, which is fine because that's their call.
- For agent-filed issues against the same project (e.g., issues filed during a dogfood walk): closing after the fix lands is fine — the agent IS the issue author.
- The same logic generalizes: status updates on shared artifacts (issue dispositions, PR review states, calendar workflow approvals) where another party owns the disposition belong to that party, not the agent.

Once a script at `~/.claude/plugins/marketplaces/deskwork/scripts/<name>.sh` is documented for adopters (e.g., in a `.claude/settings.json` SessionStart hook snippet, or in a README troubleshooting section), its **path, name, and CLI flag set become a contract**. Breaking changes silently break deployed adopter configurations.

**Why:** adopters wire these scripts into their Claude Code session-start hooks (per `plugins/deskwork/README.md` Troubleshooting section, post-#131). Their `.claude/settings.json` references the absolute marketplace-clone path with specific flags. When `/plugin marketplace update deskwork` runs, the script gets updated in place — but the adopter's settings.json doesn't. If the new script renames a flag, the hook fires with an unknown flag and exits 2; the operator's session boots with a broken hook and no obvious diagnostic. Same shape as a public API breakage.

**How to apply:**
- **Path stability:** never rename or relocate a script that's been documented for adopters. Adding new scripts under `scripts/` is fine; moving an existing one isn't.
- **Flag stability:** documented flags (`--quiet`, `--check`, `--dry-run`, etc.) are forever. Adding new flags is fine; removing or renaming existing ones is a breaking change. When a flag's behavior is genuinely improved, keep the old flag as an alias or a no-op so existing hooks don't fail (e.g., `--dry-run` aliases to `--check` after the v0.10.1 rename; `--json` is now a no-op for back-compat with v0.9.8 of `deskwork repair-install`).
- **Behavior stability:** documented exit-code contracts (0 healthy/repaired, 1 failure, 2 usage error) shouldn't churn. Adopters write their hooks against these.
- **Output stability:** `--quiet` mode's silent-on-healthy contract is load-bearing for hook UX. Don't add new "informational" stdout in `--quiet` mode without thinking about whether it'll spam adopter sessions.
- The same discipline applies to the `deskwork` / `deskwork-studio` / `dw-lifecycle` CLI subcommands more broadly, but the marketplace-clone scripts have a special exposure because they get wired directly into session-start hooks rather than invoked via the bin shim. Friction in the bin shim is recoverable; friction in the script is invisible until the operator notices their session-start hook stopped working.

The repair-install.sh script (post-#131) prints a one-line version banner when not `--quiet`. Operators triaging "did the fix land?" can see the version without reading the file. That banner format is now also part of the contract — keep it stable enough that adopters can grep for it if they ever build automation around it.
