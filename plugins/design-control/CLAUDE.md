# design-control plugin — read before working here

**Scope:** this file applies ONLY to work on the `design-control` plugin. It lives at the
plugin root — NOT in the monorepo's top-level `.claude/` — deliberately: per the lifecycle
philosophy this plugin is built on, **rules are path-scoped and load only where relevant.**
A session working on `deskwork`, `stack-control`, or anything else must not be forced to
carry this context. Claude Code loads this nested `CLAUDE.md` when a session reads or edits
files under `plugins/design-control/`, which is exactly the scope intended.

## Read the thesis first — every session that touches this plugin

Before changing anything here, read
[`../../DESIGN-DISCIPLINE-THESIS.md`](../../DESIGN-DISCIPLINE-THESIS.md), starting with its
opening section **"Why a discipline at all — the lifecycle philosophy."** It is the WHY
beneath every decision in this plugin. The load-bearing points:

- **Policy is enforced by a process, not a rule.** Agents are capable-but-unreliable
  ("insane, hyperintelligent toddlers"); you get good outcomes by engineering the crib so
  the bad outcome can't happen — not by lecturing the agent.
- **Stochastic correctness.** Pit independent models against the same work via the
  **audit-barrage**; cross-model agreement is the genuine-defect signal. The lo-fi lint's
  own correctness is validated by the barrage (the `audit/lint-adversarial-prompt.md`
  process), NOT by its author's imagined failure cases — the author shares the lint's blind
  spots.
- **Scope-discovery.** Drift / coverage / clone tracking is the catalog; discovered
  leakage classes are registered there, not scattered across ad-hoc tests.
- **Never roll your own verification** — orchestrate existing engines. `/frontend-design` is
  the engine for the *authoring* concerns; the **referee is a cross-model audit-barrage** (the
  Level-2 productization of the audit-barrage discipline) that judges a screenshot / live web
  interface against wireframe-spirit + design-language-letter — `/frontend-design` in the
  Claude agent, each other family's equivalent in its agent, cross-model agreement as the
  signal, findings via the audit protocol. The wireframe's inverted-teeth lint is a crib;
  "inventory before iterating" and "look, don't deduce" are rituals that replace unreliable
  agent attention.

## Level 1 vs Level 2 — do not conflate

Two distinct applications of the same disciplines:
- **Level 1 (how we DEVELOP this plugin):** stack-control's scope-discovery + audit-barrage run
  over our TypeScript (clone/coverage scans; cross-model code review; adversarial validation of
  the lint). Dogfooding.
- **Level 2 (what this plugin SHIPS):** design-control *productizes* the design-domain forms of
  the same disciplines for adopters building design-heavy products — **surface scope-discovery**
  (inventory every UI surface of a class before iterating) and the **cross-model design
  audit-barrage referee**. "We barraged our lint code" (L1) is NOT "design-control provides
  adversarial design review" (L2).

design-control is the UX/UI-surface specialization of the sibling **stack-control** plugin's
stance. Source essay: <https://stackcontrol.org/blog/the-lifecycle-and-why-agents-need-one/>.

## Working conventions (this plugin)

- **Intake routing (operator rules, 2026-06-10):** two tracks, split by who can fix it:
  - **This project's bugs, gaps, and slushed audit findings → the local backlog FIRST**
    (`stackctl backlog capture <title> --type bug|gap --ref <pointer>`, or `backlog
    import-slush` once #442 lands). Work is then **selected OUT of the backlog by the
    operator** — the agent never picks a backlog item to work on unilaterally. Capture ≠
    scope: capturing is always in-bounds and immediate; selection is the operator's. When a
    slushed audit-log finding migrates, flip its `Status:` to `migrated-to-backlog <task-id>`
    in place.
  - **Tooling friction (defects in tools this project consumes — stackctl, Spec Kit, any
    upstream) → a GitHub issue on the tool's repo**, which is reliably cross-project; the
    installation-scoped backlog is a burn-down queue and must not accumulate items this
    project cannot fix. If a friction item was already captured locally, mark it Done with a
    `filed-upstream` label + the issue URL in its notes (precedent: TASK-3/4/5 → #441/#440/#442).
    The append-only `tooling-feedback.md` repro log remains a valid companion record.
- Adversarial validation of the lint is a **re-runnable process**, not a hand-authored
  fixture set: `audit/lint-adversarial-prompt.md` fired via `stackctl audit-barrage`.
  Codify every genuine defeat into the deterministic vitest corpus (the crib) + register the
  leakage class via `stackctl scope-widen`.
- TypeScript: strict, `@/` imports, no `any`/`as`/`@ts-ignore`, files < 300–500 lines, no
  fallbacks/mock-data outside tests (throw instead). `npm --workspace @deskwork/plugin-design-control test`
  runs `tsc --noEmit && vitest`.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
