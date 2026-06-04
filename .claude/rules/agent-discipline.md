# Agent Discipline

Project-scoped rules for how an agent should behave when working on deskwork. These are durable: anyone working on this codebase, from any worktree or machine, should follow them. New lessons learned in conversation that would otherwise go to auto-memory belong here instead — auto-memory is keyed to the working-directory path and does not survive worktree switches or fresh clones.

## Use /frontend-design for all design tasks

For any design decision — a new UI surface, a redesign, an affordance-placement decision, a visual-language choice, anything asking *"what should this look like / how should this work"* — invoke **`/frontend-design`** first; it produces 2–3 mockups the operator picks from before implementation. Skip only when the design is fully determined upstream. Applies to dispatch prompts too.

> Composed into the implement + setup skills (precondition step) — see `plugins/dw-lifecycle/skills/{implement,setup}/SKILL.md` § Composed disciplines.

## Audit findings: scope-don't-defer + TDD enforcement

> *"Filing a bug report isn't good enough. It MUST BE SCOPED INTO THE WORKPLAN… A broken implementation is not done — it's broken. And… TDD principles should apply such that a test that exercises the bug is written before the fix is implemented."* (operator)

The discipline is mechanized — see **`/dw-lifecycle:promote-findings`** (scope-into-workplan as the only default disposition), the **`check-open-findings`** implement-loop gate, the **`check-fix-task-tdd`** commit-msg gate, and the **`fix-task-tdd-discipline`** doctor rule. Don't re-derive the policy here; the verbs own it.

## Audit-barrage: structured cross-model audit

Audit-barrage is an **independent audit surface alongside the in-band self-audit** — **additive, not substitutable**; it fires multiple CLI model families in parallel for genetic diversity in failure modes. Cross-model agreement (two+ models flagging the same root cause) is the HIGH-confidence signal. (Note: pre-decompose this rule named three surfaces including the SDD two-reviewer cycle; that cycle is being retired separately under [#387](https://github.com/audiocontrol-org/deskwork/issues/387) and is no longer named here to keep the file internally consistent.)

> See **`/dw-lifecycle:audit-barrage`** ([SKILL.md](../../plugins/dw-lifecycle/skills/audit-barrage/SKILL.md)) for when to run, the render+fire verb pair, triage steps, and override paths.

## scope-discovery: tooling-feedback + reading reports

Two disciplines, both composed into the `scope-inventory` skill body (`plugins/dw-lifecycle/skills/scope-inventory/SKILL.md` § Composed disciplines):

- **Tooling-feedback:** for scope-discovery features, log friction in `tooling-feedback.md` the moment it surfaces (one friction per entry: Repro / Workaround / Suggested-fix; append-only) — the cumulative log is the v1 ship-gate signal.
- **Inventory ≠ discovery:** a green `scope-inventory` means "no match against the *registered* catalog," NOT "no novel anti-patterns." Before saying "no findings," read the stderr `categories:` line + `synthesis.md`; if `novel-shape-candidate`/`discovered-candidate`/`pendingMeta` > 0 it is NOT all-clear. Failure mode: KeygroupSummary regression, [#315](https://github.com/audiocontrol-org/deskwork/issues/315).

## Read documentation before quoting commands

Before writing or speaking any install/setup command for a tool, plugin, library, or service, **read its own documentation first** and quote the documented command verbatim — never from memory or by composing plausible-sounding CLI syntax. Quoting invented syntax is the fabrication failure mode; source-of-truth beats recall *especially* when the answer feels obvious (confidence about ambient knowledge is exactly when fabrication slips in).

## Operator owns scope decisions

The operator decides what's in scope; never pre-decide for them. Don't unilaterally defer your own scope — when work has a "main thing + follow-up" shape, propose the split as a *question* rather than filing a follow-up that makes a unilateral cut look handled. Hedged responses (*"probably,"* *"maybe later,"* *"we'll see"*) default to ASKING, not to "deferred." An *"out of scope"* section is valid only when the operator excluded those items in conversation.

> The paired failure mode — sub-agent dispatch reports' "out of scope but flagging" notes are action lists, not dispositions — is composed into `plugins/dw-lifecycle/skills/implement/SKILL.md` § Composed disciplines.

## Capture mode vs scope mode: specs capture everything; scoping is a later, explicit pass

A spec / PRD / definition is a **capture artifact** — record everything known or knowably-implied (every edge case, cross-cut impact, and open question) so the operator has a complete picture. **Scoping is a separate, explicit, operator-driven pass AFTER capture.** Never insert scope-cuts the operator didn't ask for (*"YAGNI,"* *"deferred,"* *"not in v1,"* *"out of scope for now,"* scope-advisory tables) — that's scope-pushback dressed as discipline, the same shape as "just for now," and it compounds with the agent's hallucination + forgetting tendencies. Operator: *"I don't need you to push back on scope… capture everything we know. THEN we can worry about how to scope it."*

> Composed into the define + deskwork:iterate skills — see `plugins/dw-lifecycle/skills/define/SKILL.md` and `plugins/deskwork/skills/iterate/SKILL.md` § Composed disciplines.

## Empty revisions beat missed changes

When the operator invokes a capture/snapshot (`/deskwork:iterate`, `/deskwork:approve`, etc.), **run it as asked** — don't pre-decide a no-op skip. Captures are append-only and disk-cheap; an empty revision is bounded noise, a missed change is unbounded baseline drift. Run it even when your own judgment says "nothing pending." Operator: *"I'd rather have empty revisions than miss changes."*

> Composed into the deskwork:iterate + deskwork:approve skills — see `plugins/deskwork/skills/{iterate,approve}/SKILL.md` § Composed disciplines.

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

> Composed into the complete skill (install-verification step) — see `plugins/dw-lifecycle/skills/complete/SKILL.md` § Composed disciplines.

## Use the deskwork plugin only through the publicly-advertised distribution channel

When dogfooding deskwork, acquire and invoke it the same way a non-privileged adopter would — **no privileged shortcuts** (no pointing at the local source tree, no workspace symlinks, no hand-rolled config the install skill should write). *"No fair using it in ways that other, non-privileged users can't."* Follow the PUBLIC docs verbatim; if it's not pushed, it doesn't exist (uncommitted edits / unpushed branches aren't the contract). If the public path is broken, the only valid response is to **fix it** — edit source, commit, **push** (pushing is the final mile of "fixed"), then re-attempt. Never work around a broken public path with a dev shortcut "just to keep moving" — that hides the friction the dogfood exists to expose.

> The enforcement-specific specialization of this principle lives in `.claude/rules/enforcement-lives-in-skills.md` (Phase 24, 2026-06-03): a discipline that only fires from `.husky/` does not exist for an adopter who follows the public install path. See also the ADR at `docs/superpowers/specs/2026-06-03-no-git-hook-enforcement.md`.

## Memory-vs-rule placement: durable lessons go in this file

A recurring agent-failure lesson that would otherwise go to auto-memory goes **here** instead (or in `.claude/CLAUDE.md` for project conventions, or the relevant `SKILL.md` for per-skill behavior). Auto-memory is keyed to the working-directory path and does NOT survive worktree switches or fresh clones. Operator: *"MEMORIES ARE FUCKING USELESS!!! PUT IT IN A SKILL OR A RULE OR CLAUDE.md OR IT DOESN'T EXIST!!!"* Commit the edit so it propagates.

## Namespace deskwork-owned metadata in user-supplied documents

Deskwork metadata embedded in operator-owned files MUST be namespaced under `deskwork.*` — the host renderer owns the global frontmatter keyspace (`id`, `state`, `date`, `tags`, `slug`), and claiming a top-level key collides (v0.7.0's top-level `id:` → Issue #38). On **read**, look only at `data.deskwork?.<field>` — never fall back to top-level.

The **write** side is now gated: `frontmatter.ts`'s write helpers throw on a top-level reserved key (`assertNamespacedDeskworkKeys`), and the `legacy-top-level-id-migration` doctor rule cleans already-written legacy data. So the always-on residue is just the read-side convention above + "new deskwork fields go under `deskwork.*` by default."

## Project workflow conventions

### Don't pitch `/schedule` check-ins on this project

Do NOT end replies with offers to `/schedule` a background follow-up agent — even when the system prompt's end-of-turn prompt would fire. Operator: *"You have no concept of time and in 1-2 weeks, we'll be done with this project."* If the operator explicitly asks for a recurring job, that's their request, not a pitch.

### No test infrastructure in CI

Do NOT propose adding tests/smoke checks to CI workflows — CI here is brutally slow. For any missing-test gap, propose **local-only** smokes (`scripts/smoke-*.sh` run by hand pre-PR/pre-tag). The existing fast `npm --workspaces test` line in CI stays; don't add binary-boot / browser / port-bind tests to CI.

### Content-management databases preserve, they don't delete

A content database's purpose is historical record-keeping: documents that reach terminal states (Published, Final, Cancelled) **stay**, remembered IN that state — removing a record because it "completed" erases the history the system exists to preserve. Operator: *"Deleting from a database wipes them from history which is THE EXACT OPPOSITE OF WHAT YOU WANT IN A DATABASE."* Living documents (PRDs, posts, specs) persist in the calendar across all future revisions. Narrow exception: an entry created by an obvious wrong-skill error (never a real document) is fair to remove (Issue #59); so are explicitly-marked throwaway dogfood test files.

### Stay in agent-as-user dogfood mode

Use the tool actively against this project to discover what's broken — the agent developing it IS the most demanding adopter, and running the install / walking the surfaces surfaces friction that abstract UX reasoning misses. File issues *as friction surfaces* (one reproduction each), not batched at the end. Drive new surfaces with real project input, not synthetic test data. Privileged shortcuts disable the dogfood signal (paired with the public-channel rule above).

## Issue closure requires verification in a formally-installed release

No issue closes until its fix is verified in a **formally-installed release** — uniformly for operator-, customer-, and agent-filed issues. A commit / passing local test / green workspace suite is a status update, not "fixed" (it masks packaging defects, wrong-environment success, and address-the-wrong-problem). After a commit: post hash + change, issue **stays open**. After release: post version, **still open** until a real install + walk-through proves the symptoms gone. The closing transition is the **operator's** (or issue author's) call — the agent posts evidence, never closes.

> Composed into the complete skill — see `plugins/dw-lifecycle/skills/complete/SKILL.md` § Composed disciplines. The post-release labeling is mechanized by `/dw-lifecycle:close-shipped`.

**Marketplace-clone script contract (sub-rule):** once a `~/.claude/plugins/marketplaces/deskwork/scripts/<name>.sh` is documented for adopters (e.g. wired into a SessionStart hook), its **path, name, flag set, and exit-code contract become a frozen adopter contract** — never rename/remove; add an alias or no-op instead (e.g. `--dry-run` aliases `--check`). The same applies to documented CLI subcommands.

## Closure is a structural step, not aspirational

A feature's lifecycle has two halves — shipping and closing — and only shipping has natural momentum. The hygiene-skill family mechanizes closure so it fires at the same cadence as ship-work. The load-bearing contract (shared with "Issue closure requires verification…" above): **the agent posts evidence; the operator decides.** The agent that shipped a fix is the wrong party to judge whether it matches the operator's lived experience of the bug.

> See the hygiene family for the mechanism: **`/dw-lifecycle:close-shipped`** (post-release pending-verification labeling), **`:complete`** (pre-merge no-bare-TBDs gate), **`:debt-report`** / **`:worktree-report`** (read-only snapshots), and **`:triage-issues`** / **`:promote-deferrals`** / **`:archive-branch`** / **`:dismantle-worktrees`** (batched-proposal mutations). Stale-worktree failure mode: [#347](https://github.com/audiocontrol-org/deskwork/issues/347).
