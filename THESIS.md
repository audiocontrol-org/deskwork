---
title: Deskwork architectural thesis
description: The architectural commitments deskwork is built around — agent-as-primary-tool, skills do the work, operator extends via their agent. Read before touching any deskwork code.
deskwork:
  doc: thesis
  status: load-bearing
  id: f8fe989e-e845-4b4b-a5fb-1ef2bf77309e
---

# Deskwork architectural thesis

Read this before touching any deskwork code.

This file exists because the thesis was implicit in the project's design but
not written down anywhere discoverable, which let the wrong architecture
creep into the studio's review surface and waste an angry session
correcting it. The thesis is the contract; the code below it must conform.
The project's `/session-start` skill loads this file every session; future
sessions of any agent should land here first.

## The canonical source

> *"You never leave the agent for a static tool. You talk to it. It does the work."*
>
> *"The agent's toolkit isn't a static configuration you set up once; it
> evolves, under your direction, in response to what the work actually needs."*
>
> — <https://editorialcontrol.org/blog/build-and-run-your-editorial-calendar-in-your-ai-agent/>

The blog post is the canonical source. Everything below derives from it.

## What the thesis means

The agent (Claude, in a Claude Code session) is the primary tool. Every
other piece of deskwork — CLI verbs, the studio, doctor rules, sidecars,
the calendar — exists to be **read, edited, and orchestrated by that
agent**. *Static* tools (opaque code the agent can't see or evolve, server
endpoints that hide multi-step logic, UI that takes business-logic actions
without surfacing what it's doing) are what the thesis rejects.

The thesis is about *opacity*, not about *compilation*. A `tsc`-compiled JS
module distributed as an npm package, with its TypeScript source in a
public repo the operator's agent can read, edit, and PR against, is
agent-readable. A precompiled binary with no source equivalent, or a
server endpoint that runs a multi-step state machine on a button click, is
a static tool.

## Four architectural consequences

### Consequence 1: distribution must keep the source agent-reachable

This consequence has been re-architected once already, and the project
docs still carry honey pots from the previous shape. Read the current
state, not the historical plan.

**Current shape (v0.10.0+, Phase 26 npm pivot):** `@deskwork/core`,
`@deskwork/cli`, and `@deskwork/studio` publish to the public npm
registry. Plugin shells `npm install --omit=dev @deskwork/<pkg>@<version>`
on first invocation and dispatch through `node_modules/.bin/`. The
*source* lives in this open-source repo at `packages/<pkg>/src/`; the
*shipped artifact* is `dist/` (compiled JS + `.d.ts`). The operator's
agent can read both — the JS in
`~/.claude/plugins/cache/.../node_modules/@deskwork/<pkg>/` is plain
readable JS, and the TypeScript source is one `git clone` (or GitHub URL
fetch) away.

**Why this shape, not pure source:** the prior plan
([`docs/source-shipped-deskwork-plan/index.md`](docs/source-shipped-deskwork-plan/index.md))
proposed a vendor/symlink architecture where `@deskwork/core` reached
plugins via in-tree symlinks at install. Three install-blockers in three
v0.9.x releases (#88, the husky walk-up, #93) all rooted in the same
place: Claude Code's marketplace install path doesn't survive workspace
dep resolution. Phase 26 (PRD §444+) pivoted to npm to put workspace dep
resolution into the domain that actually solves it natively.

**The thesis still holds.** npm packages of open-source TypeScript with
readable JS dist meet the bar. What's rejected is *opacity* —
closed-source binaries, services the plugin makes opaque API calls to,
"intelligent" backends that hide logic from the operator.

**What's NOT the current shape:** the v0.9.0 vendor/symlink /
`materialize-vendor` / `source.ref`-pin machinery. References to that as
current state in this repo are honey pots from before the Phase 26 pivot
and should be flagged for cleanup, not extended.

### Consequence 2: skills do the work; the studio routes commands

This consequence is where the project mostly missed its own thesis and
where most of the corrective sessions have come from.

**Skills are the load-bearing programs.** `/deskwork:approve`,
`/deskwork:iterate`, `/deskwork:reject`, `/deskwork:publish`,
`/deskwork:add`, `/deskwork:ingest`, `/deskwork:doctor`,
`/deskwork:customize`, etc. are how work gets done in the editorial
pipeline. Each skill orchestrates the agent through its task: read
marginalia, apply editorial judgment, edit the file, call the CLI,
advance state, write the journal, regenerate the calendar. The skill is
rich, agent-shaped, and evolves with the work the operator is doing —
exactly the tool shape the thesis names as right.

**The studio is a routing and capture surface, not a controller.** Its
legitimate jobs are:

- **Capture marginalia** (margin notes attached to text ranges).
- **Support content edits** (textarea / source mode, save back to the
  file). This is the one mutation the studio is allowed to perform on
  the operator's content tree — and only on the file body, not the
  state machine.
- **Visualize calendar state** (dashboard, press queue, content tree,
  scrapbook, manual).
- **Route operator commands to skills.** Approve / Iterate / Reject /
  Publish buttons MUST copy the corresponding skill command
  (`/deskwork:approve <slug>`, etc.) to the operator's clipboard. The
  operator pastes into Claude Code; the skill runs; the skill does the
  work.

What the studio does **not** do:

- **Mutate state-machine state from button clicks.** No server endpoint
  that advances stage, sets `reviewState`, bumps iteration counters, or
  emits stage-transition journal events when invoked from a UI button.
  Those mutations belong to skills, period.
- **Duplicate skill logic in UI code.** If a skill does X, the UI does
  NOT do X. The UI surfaces that X is expected and routes the operator
  to the skill that does X.
- **Render server-driven workflows that bypass the agent.** A flow
  where the operator clicks a button and a server-side handler
  executes a multi-step state transition without the agent ever
  seeing it produces exactly the static tool the thesis is named to
  prevent.

**Infrastructure for clipboard-copy already exists.**
[`plugins/deskwork-studio/public/src/clipboard.ts`](plugins/deskwork-studio/public/src/clipboard.ts)
exposes `copyToClipboard` (Async Clipboard API + execCommand fallback)
and `copyOrShowFallback` (renders a manual-copy `<pre>` panel when the
write fails). Use it when wiring operator-facing buttons to skills.

### Consequence 3: the operator extends the plugin via their agent

This is the consequence that's *not yet fully built* and is most at risk
of being forgotten under load. Capture it here so future sessions
prioritize it.

The thesis says the agent's toolkit "evolves, under your direction, in
response to what the work actually needs." That's not a slogan — it's a
build commitment. The operator must be able to ask their agent to
customize deskwork for their project, and the agent must have a clean
seam to do that work in.

**The intended shape (planned, partially built):**

- **Defaults inside the plugin.** Plugin ships sensible defaults at
  `plugins/deskwork-studio/templates/<name>.ts`,
  `packages/core/src/doctor/rules/<name>.ts`, etc. Operator never
  touches those.
- **Overrides in the operator's project repo.** `<projectRoot>/.deskwork/templates/<name>.ts`,
  `<projectRoot>/.deskwork/doctor/<name>.ts`,
  `<projectRoot>/.deskwork/prompts/<name>.md`. The operator commits these
  to their own git history; deskwork upgrades replace defaults but never
  touch overrides. Their custom code lives with their content.
- **Override resolver inside the plugin.** Every render path / rule
  loader / prompt read first checks the project-local override path,
  falls back to the plugin default. Single point of dispatch; new
  override categories slot in by registration.
- **`/deskwork:customize` skill** is the agent-facing seam. The operator
  asks the agent to customize a behavior; the agent runs
  `/deskwork:customize <category> <name>`, which copies the plugin's
  default file into `<projectRoot>/.deskwork/<category>/<name>.ts`. The
  operator (or the agent on their behalf) then edits that file. The
  plugin loads the override on the next invocation. No fork required.
- **Skills shadow.** Operator skills under `<projectRoot>/.claude/skills/<name>/`
  shadow plugin-shipped skills of the same name. Claude Code's skill
  discovery already supports this natively; no new infrastructure.

**What's actually built today:** the `/deskwork:customize` skill exists
(`plugins/deskwork/skills/customize/SKILL.md`) and the override resolver
core helper exists (`packages/core/src/overrides.ts`). Two override
categories are wired: `templates` (studio page renderers) and `doctor`
(custom rules). `prompts` is reserved but not yet active.

**What's not built yet** (the gap the operator is naming):
- The set of override categories is small — the studio's review surface,
  per-stage workflows, the manual's content, glossary, command vocabulary,
  the calendar render shape, the entry-review affordance set, etc. all
  lack override seams today. Adopters can fork plugin behavior only at
  the dimensions the plugin chose to expose, and those are few.
- There's no operator-facing documentation that says, "these are the
  extension points; here's what each lets you change." A real adopter
  hits the limits before they discover the seam.
- The plugin itself is not yet shaped around the assumption that adopters
  will customize most of what they touch. Some renderers and helpers
  embed assumptions that block override-ability without a refactor.

**Implication for design and review:** when adding a new feature or
modifying an existing one, ask:

- *Is this a place an operator might want different behavior in their own
  project?* If yes, it needs an override seam from day one — not as a
  follow-up.
- *Is this defaulted behavior or load-bearing behavior?* If defaulted,
  publish it as a default the override resolver can shadow. If
  load-bearing, document why and what the operator's recourse is.
- *Can the operator's agent edit the override?* If the answer requires
  the operator to leave the agent and edit a file by hand, the seam is
  insufficiently agent-shaped. Evolve toward agent-driven customization.

The current state of this consequence is the project's largest debt
against the thesis. It's not a feature backlog — it's a build
commitment that the project hasn't honored yet.

### Consequence 4: the implementation loop must be autonomously self-regulating

The thesis says the agent is the primary tool. The natural extension is that the agent can execute multi-task workplans without the operator having to babysit each iteration. The end-state vision the project is converging toward:

> Point an orchestrator agent at a workplan, fire off `/dwi`, come back when the entire workplan is fully implemented, fully tested, and fully audited — unless there are ambiguities in the spec uncovered during execution that can only be resolved by asking the operator to provide direction.

The operator's attention is the binding resource. Every mechanical step — pick up the next task, run the audit, scope the findings, slush the nits, gate the commits, ship the release — should happen without the operator in the loop. The operator's attention should be reserved for what only they can do: resolve genuine spec ambiguities that surface during execution.

This is a build commitment, not a slogan. It shapes design choices:

- **Mechanical pickiness is the agent's job, not the operator's.** Status flips, audit lifts, finding-scoping, slush-disposition — none of these require operator input on the happy path. When they do require operator input, that's a bug to fix structurally, not a prompt to surface.
- **Cross-model audit coverage is non-negotiable on new work.** The autonomous loop's self-correction relies on the third audit surface (the audit-barrage) running on every new commit. Skipping audits to save compute is the failure mode that lets bad work accumulate undetected through a 70-task burndown.
- **Findings get scoped, not deferred.** A finding the loop doesn't immediately address must be either (a) scoped into the workplan as a fix-task with TDD discipline, or (b) explicitly slushed when the dampener engages. *"Code comment + future-dispatch promise"* is not a disposition (see the existing *"Just for now is bullshit"* discipline).
- **Spec ambiguity is the ONLY legitimate halt.** When the loop genuinely cannot proceed without operator direction, it halts loudly with a structured question the operator can answer in 30 seconds. Halts on other failure modes (test red, lint fail, tsc error, finding scoped) are bugs in the loop's mechanization, not reasons to interrupt the operator.
- **Skip-around-blocked-tasks is a design surface, not an afterthought.** A halted task shouldn't strand independent downstream work. Identifying which downstream work is genuinely independent (vs. constrained by the blocked answer) is part of what the loop has to do well to amortize the operator's offline time.

**What's actually built today:** the mechanical half is largely in place. The workplan-aware gate, the audit-barrage hook, the auto-promote/auto-slush triad, the TDD commit gate, the closure mechanization (`apply-audit-flips`, `close-shipped`) all serve this consequence. The autonomous loop runs end-to-end for the mechanical pieces today.

**What's not built yet:** the **operator-interaction surface for genuine spec ambiguity**. There's no structural way for the loop to halt with *"this task has a genuine ambiguity; here are the options; awaiting direction"* and then resume cleanly when the operator answers — let alone the skip-around-blocked-tasks subtlety. Today the agent's default is *"make the reasonable call; operator redirects if wrong,"* which is fine for interactive sessions but breaks for overnight autonomous loops.

The detailed design space for this is captured in `ROADMAP.md` § *"Autonomous implementation loop — long-term arc."* The thesis-level commitment is: **the loop is the agent's job; the operator's attention is for ambiguity.**

**Implication for design and review:** when adding to the lifecycle skills, ask:

- *Does this require operator input on the happy path?* If yes, why? Can the mechanical question be answered by the agent from spec / repo state / audit-log? If a prompt is structurally needed, can it be deferred to a halt-with-question that the operator answers async rather than blocking the loop?
- *Does this add a new halt condition?* If yes, is the halt classifiable as "genuine spec ambiguity" vs. "loop failed mechanically"? Only the first is acceptable as a halt; the second is a bug.
- *Does this preserve forward progress when the agent CAN proceed?* Skip-around-blocked-tasks is a goal; design new mechanisms with skip-friendliness in mind.

### Pattern: adjacent assets belong in the entry's scrapbook (concrete example)

When an entry has related assets — screenshots illustrating an audit, mockups for a design doc, source data for a spec, reference images for a draft — those belong in the entry's per-entry **scrapbook** directory (adjacent to the content file at `dirname(artifactPath) + '/scrapbook/'`), NOT in a sibling directory parallel to the doc. The plugin already serves them through the existing scrapbook infrastructure:

- The scrapbook viewer at `/dev/scrapbook/<site>/<path>` renders per-kind cards.
- The scrapbook drawer in the review surface composes them alongside the entry's body.
- Binary files are reachable via `/api/dev/scrapbook-file?site=…&entryId=…&name=…` (entry-id mode — works for projects whose layout doesn't match the kebab-case slug template) or the slug-shape `?path=…&name=…` mode for projects that follow the simple-blog `<contentDir>/<slug>/index.md` convention.

This pattern emerged from the issue-158 UX-audit case study: an audit doc was authored with screenshots in a sibling `2026-05-03-issue-158-screenshots/` directory. Inline image references rendered as broken icons on the review surface because the studio's review surface doesn't serve content-tree-relative URLs from arbitrary paths — and rightly so. The architecturally correct shape was to move the screenshots into the entry's scrapbook (where they're already served) and reference them via the scrapbook-file route. The wrong-but-tempting alternative was to invent a new entry-asset route + a rehype `<img src>` rewriter — pure reinvention of infrastructure that already exists.

When the agent reaches for a sibling directory + new server route + custom URL rewriter, the question to ask first is *"is there already a place for this?"* For per-entry assets, the scrapbook is the answer.

The `/deskwork:add` and `/deskwork:ingest` skills both surface this pattern in their prose (drop research artifacts in `<entry>/scrapbook/`; flag adjacent asset directories during ingest). The pattern shows up here in the thesis because it's a consequence of the broader principle: use the existing seam, not a new directory. New routes / new directories / new addressing modes should be the last resort, after asking whether the existing infrastructure can serve.

## The anti-patterns this thesis rejects

| Anti-pattern | What it looks like | Why it violates the thesis |
|---|---|---|
| **UI button → server endpoint → state-machine call** | A studio button POSTs to `/api/dev/...` which calls a core helper that sets `reviewState`, bumps `iterationByStage`, emits a stage-transition. | The skill `/deskwork:<verb>` exists to do that work, with the agent's editorial judgment in the loop. The UI bypasses the agent entirely. |
| **Validation logic embedded in the UI** | The studio checks "is the file content unchanged" or "is this stage transition allowed" in TypeScript on the server route. | Validation lives in the CLI / skill that's the load-bearing path. UI checks gate the operator's command and produce mid-flow errors when the UI thinks it knows better. |
| **Opaque tools the agent can't read** | A precompiled binary with no source equivalent, a service the plugin makes opaque API calls to, a server backend that hides logic. | The thesis is about opacity. If the agent can't read it, it can't help evolve it. |
| **UI that takes a multi-step action without surfacing what it's doing** | A "Publish" button that runs build → upload → invalidate-cache invisibly. | Replace with a clipboard-copy of the skill command. The agent does the work; the operator sees each step in the chat transcript. |
| **Hardcoded behavior with no override seam** | A renderer / rule / vocabulary / workflow that has *one* shape and the operator can't replace it without forking the plugin. | The operator's toolkit must "evolve under your direction." If the only way to change behavior is a plugin PR, the toolkit isn't evolving — the operator is. |
| **Fork-to-customize as the documented path** | Adopter docs that say "if you want different behavior, clone the plugin and edit." | The override seam is the documented path. Forks accumulate; overrides stay isolated to the operator's project. |

## How to apply this thesis when designing or fixing code

Before adding any non-trivial behavior, ask:

1. **Is this work that a skill could do?** If yes, the skill should do
   it and the studio should route the operator's intent to the skill
   via clipboard-copy.
2. **Is this content capture or visualization?** If yes, the studio is
   the right place — that's its legitimate job.
3. **Does this require multi-step state changes?** If yes, those belong
   in a skill, not in a server endpoint or client handler.
4. **Could the operator's agent read this code?** If the answer is "in
   theory but they'd never see it" because the code is structured as
   opaque server logic the operator never touches, you've built a static
   tool. Restructure.
5. **Is this a place an operator might want different behavior?** If
   yes, it needs an override seam. Default + override resolver + a
   `/deskwork:customize` registration, from day one.

## Process discipline

- Read this file at the start of every session (the project's
  `/session-start` skill loads it).
- If you find a violation in shipped code, file an issue referencing
  this document. Don't paper over it; don't extend it; don't "fix" it
  within its own broken shape. The right fix is always to restore the
  skill / studio / override-seam division of labor.
- The agent-discipline rules in `.claude/rules/agent-discipline.md`
  codify specific operational behaviors; those rules exist as
  instances of this thesis. The thesis is the why; those rules are the
  how.
