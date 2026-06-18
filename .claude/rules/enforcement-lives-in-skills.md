# Enforcement lives in skills — not in git hooks

The `dw-lifecycle` plugin's enforcement primitives live in **skill bodies + CLI verbs**, never in git hooks the adopter doesn't get from `claude plugin install`. This rule is the operational form of the principle captured in `docs/superpowers/specs/2026-06-03-no-git-hook-enforcement.md` (the ADR).

## The rule

1. **Never wire `dw-lifecycle` enforcement into `.husky/`.** Not in this repo, not in adopter setup advice, not as a "for now" workaround. The husky stubs that remain in this repo (`.husky/pre-commit`, `.husky/pre-push`) are no-op pass-throughs; the audit-trail comments at the top of each stub explain the relocation. If the project deletes husky entirely later, that's fine; if it keeps the stubs for husky-presence reasons, that's also fine. **Neither stub nor any future hook file may contain `dw-lifecycle` enforcement.**

2. **When you find yourself reaching for a hook, relocate to a skill body instead.** The lifecycle waypoints are the canonical homes:
   - **`/dw-lifecycle:session-start`** — advisory structural snapshot at session boot (counts, no refusal).
   - **`/dw-lifecycle:implement`** — enforce at task boundaries. Structural chain + audit-barrage chain + workplan-aware open-findings gate + fix-task TDD check.
   - **`/dw-lifecycle:session-end`** — closing discipline (`check-disposition-survivor`, no-bare-TBDs, no-open-findings-without-disposition).
   - **`/dw-lifecycle:review`** — primary PR-readiness surface (Step 0 refactor preconditions + structural chain + fleet symmetry).
   - **`/dw-lifecycle:complete`** — pre-merge gate (existing no-bare-TBDs + post-release verification).

3. **Primitives stay; wiring moves.** The CLI verbs that DO the checking (`check-clones`, `check-anti-patterns`, `check-adopters`, `check-disposition-survivor`, `check-module-symmetry`, `check-refactor-preconditions`, `audit-barrage`, `audit-barrage-lift`, `promote-findings`, `check-open-findings`, `apply-audit-flips`, `implement-hook` etc.) all stay. An adopter who wants a project-specific git hook can wire any of them manually — we just don't ship the install machinery, and we don't rely on hooks ourselves. (Phase 25 rename: `check-editor-symmetry` is preserved as a deprecation alias for one release cycle; removal target v0.37.0.)

4. **Adopters get the discipline from `claude plugin install`, not from a separate `install-*-hooks` invocation.** No `install-scope-discovery-hooks`, no `install-agent-prompts` writing to `.git/hooks/`, no `hooks-installed.json` manifest. The discipline travels with the skill bodies the plugin ships.

5. **If a discipline cannot be expressed in a skill body or CLI verb, it does not get added.** A "this only works as a git hook" framing is the indicator that the discipline either doesn't belong in this plugin (it's a project-specific local invariant) or needs to be reshaped until it fits a verb + skill-body invocation.

## How to apply

- **Before adding any new enforcement to this plugin, ask: where does it fire?** The answer must be the name of a skill (`/dw-lifecycle:session-start`, `/dw-lifecycle:implement`, etc.) or a CLI verb. *"In a pre-commit hook"* is not a valid answer.
- **When porting existing discipline (e.g. an old hook-bound check) into the new architecture, write the test first.** The test exercises the skill-body behavior, not the hook. If the only test you can write is *"the hook script returns exit 1"*, the test is wrong; rewrite to exercise the skill body that calls the verb.
- **When an adopter friction report names a missing enforcement, propose the relocation, not the hook.** Example: *"my project needs check-clones to refuse commits"* → response is *"wire `check-clones --gate-mode` into your project's own `.husky/pre-commit`; the plugin gives you the verb; the wiring is your project's call."* Not: *"we'll add `install-scope-discovery-hooks` back."*
- **When the implement-loop bookkeeping load is too high, tune the dampener / severity filter / chain shape, not the wiring.** The pathology that motivated this rule is *"hook-gates amplify scope errors"* — adding more hook gates is the wrong direction.
- **In commit messages that retire hook plumbing, cite this rule.** E.g. *"per `.claude/rules/enforcement-lives-in-skills.md`, the X check now fires from `/dw-lifecycle:implement` end-of-task instead of `.husky/commit-msg`."*

## Anti-patterns to refuse

- **Adding any `.husky/<hook>` content for `dw-lifecycle` enforcement.** The stubs are the final state. New content goes in a skill body.
- **Re-introducing `install-scope-discovery-hooks` or any sibling install verb that writes to `.husky/`, `.git/hooks/`, or any other hook surface.** If the adopter wants hooks, they wire them themselves.
- **A "for now" hook that we promise to relocate later.** Per `agent-discipline.md` § "Just for now is bullshit", these never get relocated — they become canon.
- **A skill body that delegates enforcement to a hook via `eval` or sub-shell composition.** The skill body IS the surface; the verb it invokes IS the primitive. There is no third layer.
- **An adopter-facing doc that recommends wiring our verbs into a hook as the "right way."** Adopters can; they shouldn't have to. The skill bodies are the right way.
- **Treating a `--no-verify` push as evidence the hook is doing its job.** A `--no-verify` push by the maintainer is evidence the hook chain is broken (refusing legitimate commits or unsustainable in bookkeeping load). The fix is reshaping the chain, not normalizing the bypass.

## Pre-implementation gate

Before writing or modifying any enforcement primitive in this plugin:

1. **Read the ADR** (`docs/superpowers/specs/2026-06-03-no-git-hook-enforcement.md`). Confirm the principle still applies.
2. **Name the firing surface** — which skill body / CLI verb invocation will trigger this check?
3. **Confirm the test exercises that surface.** Not the hook. Not the standalone CLI in isolation (unless the CLI itself is the unit under test).
4. **If the answer to #2 is "a git hook," reshape the work until it isn't.** If you genuinely cannot, surface the conflict to the operator before writing code — the answer may be that the discipline doesn't belong in this plugin.

## When this rule conflicts with shipping speed

It doesn't. Relocating a check from a hook to a skill body is not more expensive than writing the hook — the verb already exists; the skill body invokes it. The cost is in the *thinking before the code* — same shape as the `.claude/rules/affordance-placement.md` rule (component-attached affordances aren't more expensive than toolbar buttons; the cost is in the design decision, not the code).

## 026 amendment — a PLUGIN-SHIPPED PreToolUse hook IS a permitted enforcement surface (Decision 5)

The capability-interface-mediation feature (specs/026) ships a Claude Code **PreToolUse hook** (`plugins/stack-control/hooks/hooks.json` → `bin/intercept`) that refuses a raw fronted-backend call at the point of invocation. This is NOT a contradiction of this rule — it is the rule's own principle applied correctly:

- **The test is "does it travel with `claude plugin install`?"**, not "is it technically a hook?" A **git hook** (`.husky/`, `.git/hooks/`) does NOT travel with the plugin install — the adopter must discover and wire it (the exact "doesn't exist for an adopter who follows the README" failure this rule names). A **plugin-shipped Claude Code hook** (`hooks/hooks.json` at the plugin root, auto-discovered on install) DOES travel with the install — the adopter gets it from `claude plugin install`, no separate wiring.
- So: **git hooks remain forbidden; a plugin-shipped PreToolUse / `hooks.json` hook is permitted** when (a) it ships inside the plugin and is auto-loaded on install, and (b) it contains NO decision logic — it is a thin adapter that calls a `stackctl` verb (the decision lives in the vendor-neutral CLI core, the same skill-bodies-+-verbs discipline). The 026 interceptor satisfies both: `bin/intercept` only marshals the payload to `stackctl mediate-check`/`intercept`; the decision is the `capability/` core.
- **Defense-in-depth, not the sole guarantee.** Per FR-014/FR-017 the interceptor is best-effort (a deliberate raw bypass outside the skill surface is out of scope); the load-bearing guarantee remains the US3 per-phase graduate gate (bypassed work cannot graduate), which lives in the CLI verbs + gate — exactly where this rule says enforcement belongs.

In short: the firing surface for 026 mediation is a plugin-shipped hook + the `mediate-check` CLI verb — both travel with the install — never a git hook.

## Why this rule exists

This rule was written 2026-06-03 after v0.35.0's release required three `--no-verify` pushes for bookkeeping commits the audit-finding gates refused. That session — driving Phase 22/23 of scope-discovery on a feature branch — produced [#401](https://github.com/audiocontrol-org/deskwork/issues/401), [#402](https://github.com/audiocontrol-org/deskwork/issues/402), [#403](https://github.com/audiocontrol-org/deskwork/issues/403) and the synthesis: the audit-finding gates we ship aren't installable for adopters, so we've been measuring a UX we don't actually ship.

The operator's framing, verbatim, drove the principle: *"the discipline does not exist for an adopter who installs the plugin and follows the README."* The fix is to wire discipline through surfaces that travel with the plugin install — skills and CLI verbs — not through hooks the adopter has to discover and wire separately.

The rule applies forward to every enforcement primitive this plugin ever adds. When tempted to reach for `.husky/`, re-read the ADR.

## Cross-references

- ADR: `docs/superpowers/specs/2026-06-03-no-git-hook-enforcement.md` — the design rationale + retirement list + relocation map.
- Related rule: `agent-discipline.md` § "Use the deskwork plugin only through the publicly-advertised distribution channel" — the broader principle this rule specializes.
- Related rule: `agent-discipline.md` § "Just for now is bullshit" — the failure mode this rule prevents.
- Triggers: [#401](https://github.com/audiocontrol-org/deskwork/issues/401), [#402](https://github.com/audiocontrol-org/deskwork/issues/402), [#403](https://github.com/audiocontrol-org/deskwork/issues/403).
- Parent issue: [#404](https://github.com/audiocontrol-org/deskwork/issues/404) — Phase 24 of scope-discovery.
