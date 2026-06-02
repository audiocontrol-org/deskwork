# Agent Discipline

Project-scoped rules for how an agent should behave when working on deskwork. These are durable: anyone working on this codebase, from any worktree or machine, should follow them. New lessons learned in conversation that would otherwise go to auto-memory belong here instead — auto-memory is keyed to the working-directory path and does not survive worktree switches or fresh clones.

## Use /frontend-design for all design tasks

For any design decision — a new UI surface, a redesign, an affordance-placement decision, a visual-language choice, anything asking *"what should this look like / how should this work"* — invoke **`/frontend-design`** first; it produces 2–3 mockups the operator picks from before implementation. Skip only when the design is fully determined upstream. Applies to dispatch prompts too.

> Composed into the implement + setup skills (precondition step) — see `plugins/dw-lifecycle/skills/implement/SKILL.md` § Composed disciplines.

## Audit findings: scope-don't-defer + TDD enforcement

> *"Filing a bug report isn't good enough. It MUST BE SCOPED INTO THE WORKPLAN… A broken implementation is not done — it's broken. And… TDD principles should apply such that a test that exercises the bug is written before the fix is implemented."* (operator)

The discipline is mechanized — see **`/dw-lifecycle:promote-findings`** (scope-into-workplan as the only default disposition), the **`check-open-findings`** implement-loop gate, the **`check-fix-task-tdd`** commit-msg gate, and the **`fix-task-tdd-discipline`** doctor rule. Don't re-derive the policy here; the verbs own it.

## Audit-barrage: structured cross-model audit

Audit-barrage is the **third independent audit surface** (alongside the in-band self-audit and the SDD two-reviewer cycle) — **additive, not substitutable**; it fires multiple CLI model families in parallel for genetic diversity in failure modes. Cross-model agreement (two+ models flagging the same root cause) is the HIGH-confidence signal.

> See **`/dw-lifecycle:audit-barrage`** ([SKILL.md](../../plugins/dw-lifecycle/skills/audit-barrage/SKILL.md)) for when to run, the render+fire verb pair, triage steps, and override paths.

## scope-discovery: tooling-feedback + reading reports

Two disciplines, both composed into the `scope-inventory` skill body (`plugins/dw-lifecycle/skills/scope-inventory/SKILL.md` § Composed disciplines):

- **Tooling-feedback:** for scope-discovery features, log friction in `tooling-feedback.md` the moment it surfaces (one friction per entry: Repro / Workaround / Suggested-fix; append-only) — the cumulative log is the v1 ship-gate signal.
- **Inventory ≠ discovery:** a green `scope-inventory` means "no match against the *registered* catalog," NOT "no novel anti-patterns." Before saying "no findings," read the stderr `categories:` line + `synthesis.md`; if `novel-shape-candidate`/`discovered-candidate`/`pendingMeta` > 0 it is NOT all-clear. Failure mode: KeygroupSummary regression, [#315](https://github.com/audiocontrol-org/deskwork/issues/315).

## Read documentation before quoting commands

Before writing or speaking any install/setup command for a tool, plugin, library, or service: **read the tool's own documentation first**. Quote the documented command verbatim. Do not quote commands from memory or compose plausible-sounding CLI syntax.

**Why:** Quoting `claude plugin install --marketplace <url> <plugin>` for the deskwork plugin install — when the actual README documents `/plugin marketplace add <url>` followed by `/plugin install <plugin>@<marketplace>` (Claude Code slash commands, not shell commands) — is the fabrication failure mode the operator's Socratic-prompt-engineering thesis catalogs (acting on facts the agent invented). The plugin documents itself. Bypassing the README to invent syntax wastes the operator's attention on corrections that wouldn't have been needed.

**How to apply:**
- Read `plugins/<name>/README.md` end-to-end before doing anything with that plugin's install or commands.
- Source-of-truth > plausible-sounding recall — *especially* when the answer feels obvious. Confidence about ambient knowledge is when fabrication slips in.
- Generalizes beyond plugins: read the tool's docs whenever it documents itself.

## Operator owns scope decisions

The operator decides what's in scope; never pre-decide for them. Don't unilaterally defer your own scope — when work has a "main thing + follow-up" shape, propose the split as a *question* rather than filing a follow-up that makes a unilateral cut look handled. Hedged responses (*"probably,"* *"maybe later,"* *"we'll see"*) default to ASKING, not to "deferred." An *"out of scope"* section is valid only when the operator excluded those items in conversation.

> The paired failure mode — sub-agent dispatch reports' "out of scope but flagging" notes are action lists, not dispositions — is composed into `plugins/dw-lifecycle/skills/implement/SKILL.md` § Composed disciplines.

## Capture mode vs scope mode: specs capture everything; scoping is a later, explicit pass

A spec / PRD / definition is a **capture artifact** — record everything known or knowably-implied (every edge case, cross-cut impact, and open question) so the operator has a complete picture. **Scoping is a separate, explicit, operator-driven pass AFTER capture.** Never insert scope-cuts the operator didn't ask for (*"YAGNI,"* *"deferred,"* *"not in v1,"* *"out of scope for now,"* scope-advisory tables) — that's scope-pushback dressed as discipline, the same shape as "just for now," and it compounds with the agent's hallucination + forgetting tendencies. Operator: *"I don't need you to push back on scope… capture everything we know. THEN we can worry about how to scope it."*

> Composed into the define + deskwork:iterate skills — see `plugins/dw-lifecycle/skills/define/SKILL.md` § Composed discipline.

## Empty revisions beat missed changes

When the operator invokes a capture/snapshot (`/deskwork:iterate`, `/deskwork:approve`, etc.), **run it as asked** — don't pre-decide a no-op skip. Captures are append-only and disk-cheap; an empty revision is bounded noise, a missed change is unbounded baseline drift. Run it even when your own judgment says "nothing pending." Operator: *"I'd rather have empty revisions than miss changes."*

> Composed into the deskwork:iterate + deskwork:approve skills — see `plugins/deskwork/skills/approve/SKILL.md` § Composed discipline.

## The orchestrator session is separate from the implementation session

The dw-lifecycle role splits across **two distinct Claude Code sessions**. The **orchestrator session** (main repo working tree) runs define → setup → PRD iterate/approve → issues — infrastructure prep. The **implementation session** (feature worktree, `~/work/<project>-work/<slug>/`) runs `/dw-lifecycle:implement` and does the feature's code. The orchestrator session does NOT invoke `/dw-lifecycle:implement` (the boundary is the session, not a sub-agent dispatch). Operator's framing: *"you are the orchestrator, not the implementer… implementation must be done in a different worktree which implies a different claude session."* (Operator can override this boundary explicitly.)

> Composed into the setup + issues exit-step and the implement-skill precondition — see `plugins/dw-lifecycle/skills/{setup,issues,implement}/SKILL.md` § Composed disciplines.

## "Just for now" is bullshit — no temporary fallbacks, no IOU comments, no will-fix-later deferrals

**Reject every "just for now" / "for now" / "we'll fix it later" / "DONE_WITH_CONCERNS, address in F-later" pattern.** Not as a sub-agent's escalation. Not as a code comment. Not as a controller-side acceptance. Every single "just for now" is a nucleation site for bad behavior that compounds invisibly and never gets cleaned up.

The operator's framing, verbatim: *"Every time you or a subagent do something 'JUST FOR NOW', it turns into a nucleation site of bad behavior which never gets fixed and worsens the problem."*

**Why:** v0.13.0 shipped with `window.prompt()` for the scrapbook `+ NEW NOTE` button. The pre-existing client (~80 lines, working, functional) had a real inline composer with filename + body + secret toggle. F1's sub-agent **deleted that composer** during a 917-line client rewrite to fit the project's 300–500 line file cap, replaced it with a `window.prompt()`, and labeled it with a code comment: `// New note (prompt-based fallback; F5 will replace with composer)`. F5's actual plan scoped *drop zone + secret section* — drop zone is the upload path, a different code path from new-note. F5 finished its planned scope cleanly. F6's walkthrough signed *"INTEGRATION VERIFIED"* without clicking the button. The IOU shipped to release as user-visible regression — see [#166](https://github.com/audiocontrol-org/deskwork/issues/166).

The "for now" code comment was the **only** record of the deferral. It traveled across G2, G3, G4 design reviews + final walkthrough + a release tag, and at every checkpoint everyone (including me) treated the comment as proof that the issue was tracked. It wasn't. Comments don't track work. Issues track work. Workplans track work. Comments rot in place.

**The "convention canon" trap:** the operator's prior framing on `/release` skill design — *"What we do 'just for now' overwhelmingly becomes conventional canon"* — applies inside implementation, not just at the procedure level. A "fallback for F1" doesn't get replaced in F5. It just becomes the canonical UX. The pre-F1 inline composer existed for months; the F1-shipped `prompt()` survived four design-review gates + a final walkthrough + a release; the "for now" became "the way new-note works" until the operator spotted it post-release.

**The class of failure modes this rule names:**

| The pattern | What it actually means |
|---|---|
| *"Preserve old behavior for now"* | I deleted real functionality and labeled it a temporary fallback |
| *"F-later will replace this"* | I'm passing a problem to a future dispatch whose scope I haven't checked |
| *"DONE_WITH_CONCERNS, will fix"* | I flagged it for myself; nobody else will see this until the operator trips over it |
| *"Quick fallback so I can keep moving"* | I shipped degraded UX as the new default |
| *"TODO: address in v0.X"* | Buried in a code comment; nobody is tracking this; the version reference is now stale |
| *"Stub for now, real impl in next pass"* | The stub IS the impl now |
| *"Hardcoded for now"* | The hardcoded value will never get parameterized |
| *"Disabled the test for now"* | The test will never get re-enabled |

These are not project-management entries. They are **debt that compounds invisibly**, because the very act of writing the deferral comment makes the agent (or the controller) feel like the issue was tracked. It wasn't.

**How to apply:**

- **Before writing a code comment that mentions a future dispatch / version / phase / "later" / "for now" / "next pass," STOP.** Replace the comment with one of:
  - **A GitHub issue link** — file the issue first, paste the link in the comment if a code-side breadcrumb is genuinely needed (often it isn't; the issue is the disposition, not the comment).
  - **An immediate fix** — do the work now, even if it widens the dispatch beyond its planned scope.
  - **An explicit operator decision** — surface the trade-off in conversation, get a decision, record the decision in the issue or workplan (not a code comment).
  - There is no fourth option. *"// TODO: F5 will replace"* is not a fourth option. It is the failure mode this rule names.

- **Before authoring a "fallback" / "for now" / "quick path," verify the existing behavior.** If the existing behavior is richer than what you're about to ship, you are not adding a fallback — you are *removing* functionality. Removing functionality is a separate decision that needs explicit operator approval. *"Temporary degradation pending later restoration"* is not a self-issued license to remove working code; it is a euphemism for shipping a regression.

- **As a controller accepting a sub-agent's report:** every concern in `DONE_WITH_CONCERNS` must end in one of these four dispositions: (1) addressed in this commit, (2) filed as a GitHub issue with link, (3) scoped into a downstream dispatch whose plan/spec you have **read and verified** explicitly contains the deferred work, or (4) explicit operator decision to defer with documented acceptance criteria. There is no fifth option. *"Code comment + future-dispatch promise"* is not a disposition. *"F-later will handle it"* without checking F-later's actual plan is not a disposition. *"We'll come back to it"* is not a disposition.

- **As a sub-agent reporting concerns:** the report must be actionable, not narrative. Don't write *"new-note UX intentionally degraded for F1 — F5 restores the rich composer."* Write *"NEEDS DECISION: F1 client rewrite cannot fit the 300-line cap while preserving the inline composer at scrapbook-client.ts:703-779. Options: (a) widen F1 scope to include cap-relief refactor, (b) split the composer into its own module under the same cap, (c) file as separate issue and ship F1 without the composer."* The first form is an IOU. The second form forces a decision.

- **As yourself, mid-implementation:** if you find yourself thinking *"I'll just put a fallback here for now and circle back,"* the future you who is supposed to circle back doesn't exist. There will be a different task, a different session, and the comment will rot. Either do the work now or file the issue now.

- **Audit your own diffs before commit:** grep your changes for `for now`, `just for now`, `TODO`, `FIXME`, `HACK`, `XXX`, `temporary`, `stub`, `placeholder`, `pending`, `until F`, `until v`. Any hit is a flag to either fix the underlying thing or file the issue. None of these strings should land in a commit unless paired with a GitHub issue number that the comment is *referencing* (not promising).

- **The rule applies retroactively to inherited code.** If you encounter an existing *"// TODO: replace with X"* / *"// fallback for now"* comment while editing nearby code, you have two options: (a) fix it as part of the current change, or (b) file an issue and update the comment to reference the issue number. *"Leaving it because it's not my code"* is not an option once you've read it — you've been informed; the disposition is yours now.

**The hard test:** when in doubt, ask — *"if a release shipped today with this code as-is, would I be embarrassed in front of the operator?"* If yes, the deferral is bullshit. Fix it now or file the issue now. If you're tempted to argue *"but the release is weeks away,"* re-read the convention-canon trap above. The release is always closer than the deferral expects.

## Packaging is UX — never paper over install bugs

When evaluating on a real install, treat the install state as ground truth — never copy missing files into the cache or reconstruct the *"intended"* surface to make the evaluation pass. Install-level defects (404s, missing bundles, dead UI) are top-priority blockers; fix the public path (file the packaging issue, fix source, push, re-release), don't paper over. Operator: *"Packaging IS UX."*

> Composed into the complete / close-shipped skills (install-verification step) — see `plugins/dw-lifecycle/skills/complete/SKILL.md` § Composed disciplines.

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

Deskwork metadata embedded in operator-owned files MUST be namespaced under `deskwork.*` — the host renderer owns the global frontmatter keyspace (`id`, `state`, `date`, `tags`, `slug`), and claiming a top-level key collides (v0.7.0's top-level `id:` → Issue #38). On **read**, look only at `data.deskwork?.<field>` — never fall back to top-level.

The **write** side is now gated: `frontmatter.ts`'s write helpers throw on a top-level reserved key (`assertNamespacedDeskworkKeys`), and the `legacy-top-level-id-migration` doctor rule cleans already-written legacy data. So the always-on residue is just the read-side convention above + "new deskwork fields go under `deskwork.*` by default."

## Project workflow conventions

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

## Issue closure requires verification in a formally-installed release

No issue closes until its fix is verified in a **formally-installed release** — uniformly for operator-, customer-, and agent-filed issues. A commit / passing local test / green workspace suite is a status update, not "fixed" (it masks packaging defects, wrong-environment success, and address-the-wrong-problem). After a commit: post hash + change, issue **stays open**. After release: post version, **still open** until a real install + walk-through proves the symptoms gone. The closing transition is the **operator's** (or issue author's) call — the agent posts evidence, never closes.

> Composed into the complete / close-shipped skills — see `plugins/dw-lifecycle/skills/complete/SKILL.md` § Composed disciplines. The post-release labeling is mechanized by `/dw-lifecycle:close-shipped`.

**Marketplace-clone script contract (sub-rule):** once a `~/.claude/plugins/marketplaces/deskwork/scripts/<name>.sh` is documented for adopters (e.g. wired into a SessionStart hook), its **path, name, flag set, and exit-code contract become a frozen adopter contract** — never rename/remove; add an alias or no-op instead (e.g. `--dry-run` aliases `--check`). The same applies to documented CLI subcommands.

## Closure is a structural step, not aspirational

A feature's lifecycle has two halves — shipping and closing — and only shipping has natural momentum. The hygiene-skill family mechanizes closure so it fires at the same cadence as ship-work. The load-bearing contract (shared with "Issue closure requires verification…" above): **the agent posts evidence; the operator decides.** The agent that shipped a fix is the wrong party to judge whether it matches the operator's lived experience of the bug.

> See the hygiene family for the mechanism: **`/dw-lifecycle:close-shipped`** (post-release pending-verification labeling), **`:complete`** (pre-merge no-bare-TBDs gate), **`:debt-report`** / **`:worktree-report`** (read-only snapshots), and **`:triage-issues`** / **`:promote-deferrals`** / **`:archive-branch`** / **`:dismantle-worktrees`** (batched-proposal mutations). Stale-worktree failure mode: [#347](https://github.com/audiocontrol-org/deskwork/issues/347).
