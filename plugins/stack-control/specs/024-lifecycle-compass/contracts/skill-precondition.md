# Contract: Lifecycle Skill Precondition (the embedded compass gate)

FR-006/FR-007: every lifecycle skill opens by consulting the compass for its own item +
intent and refuses loud on a non-zero verdict, performing none of its work. The rules live in
exactly one place (the compass + the governed `WORKFLOW.md`), invoked through a shared helper —
not re-encoded per skill. Enforcement is the skill body + CLI verb, never a git hook
(`.claude/rules/enforcement-lives-in-skills.md`).

## The shared helper — `src/lifecycle-precondition.ts`

Exposes the canonical precondition so each SKILL.md and any programmatic caller invokes the
compass the same way:

```
checkLifecyclePrecondition({ item, intent }) → { proceed: boolean; verdict: Verdict }
```

- Resolves the installation + governed doc + item (reusing `workflow.ts`'s `resolve`).
- Computes the compass verdict for `(item, intent)`.
- `proceed` is `true` iff `verdict.exitCode === 0` (`on-course` / `behind`).
- On non-zero: returns `proceed: false` with the verdict's `reason` + `skippedStep` so the
  caller emits a uniform refusal message.

The helper is the single place the refusal message shape lives; skills do not hand-roll it.

## The skill-body contract (each lifecycle SKILL.md)

Every lifecycle skill — at minimum `define`, `execute`, the `after_implement` govern hook,
`ship`, `release`, `session-end` (FR-006) — opens with a precondition step:

```
1. Resolve the item this invocation operates on (its --item / the active item).
   - No item and no resolvable active item ⇒ refuse loud, direct the agent to capture/name
     the item (spec Edge Case). Do NOT proceed.
2. Run: stackctl workflow compass <item> --intent <this-skill-name>
3. Non-zero exit ⇒ HARD REFUSAL: print the compass reason (it names the violated invariant +
   the skipped step) and STOP. Perform none of the skill's work.
4. Zero exit ⇒ proceed normally (the gate is transparent on the happy path).
```

## Refusal behavior (SC-002)

- An `ahead` verdict ⇒ refuse naming the skipped step (e.g. "refusing: `specifying` work
  requested but `designing` step is skipped — run `/stack-control:design` first").
- An `off-rail` verdict ⇒ refuse naming the missing node / side-state (e.g. "refusing: no
  roadmap node for this spec dir — capture it first").
- No work is performed on a non-zero verdict (no file written, no transition, no PR).
- An `on-course`/`behind` verdict ⇒ the skill runs (SC-002, acceptance US2.3).

## What this does and does not bind (FR-014 honest boundary)

- **Binds**: an agent following its skills cannot skip a step — the skill it runs orients for
  it and refuses if off-rail. This is the threat model (agent drift).
- **Does not bind**: a human (or agent) using raw `git`/`gh` to author/advance directly. No
  verb embeds the compass there. The backstop is that the *finishing* skills
  (`ship`/`release`/`session-end`) refuse without the full recorded evidence chain (spec Edge
  Cases). This boundary MUST be documented, not overclaimed (FR-014).

## Tests (lifecycle-precondition.test.ts)

- An item whose verdict is `ahead` ⇒ `proceed: false`, reason names the skipped step.
- An orphan (no node) ⇒ `proceed: false`, reason names the missing node.
- An `on-course` item ⇒ `proceed: true`.
- A `behind` item ⇒ `proceed: true` (allow-with-note).
- No resolvable item ⇒ fail loud (not a silent proceed).
