# design-control plugin — read before working here

**Scope:** this file applies ONLY to work on the `design-control` plugin. It
is intentionally path-scoped to `plugins/design-control/` so Codex sessions
working elsewhere in the monorepo do not inherit this plugin's rules.

## Read the thesis first

Before changing anything here, read
[`../../DESIGN-DISCIPLINE-THESIS.md`](../../DESIGN-DISCIPLINE-THESIS.md),
starting with **"Why a discipline at all — the lifecycle philosophy."** The
load-bearing points:

- Policy is enforced by process, not reminders.
- Stochastic correctness matters: use the audit-barrage to validate what the
  author of a check will miss.
- Scope-discovery is part of the product discipline, not optional cleanup.
- Never roll your own verification engine when an existing engine can be
  orchestrated.

## Level Split

Do not conflate the two levels of discipline in this plugin.

- **Level 1:** how this plugin is developed. stack-control governs our
  TypeScript, backlog, clone pressure, and audit-barrage review.
- **Level 2:** what this plugin ships to adopters. design-control productizes
  surface inventory, lo-fi wireframes, design-language specs, and the
  cross-model design referee.

Evidence about Level 1 dogfooding is not automatically evidence that Level 2
adopter workflows are complete.

## Working Conventions

- The canonical installation root for this domain is `plugins/design-control/`.
- Use stack-control session-start and session-end for this installation.
- Use the local backlog for project bugs and gaps. Tooling friction in consumed
  tools belongs upstream.
- Adversarial validation findings must land in deterministic tests and, when
  relevant, scope-discovery catalogs.
- TypeScript is strict; no `any`, unchecked `as`, or `@ts-ignore`.
- No silent fallbacks or mock data outside tests.
- Commit and push in small increments when making real progress.

## Host Neutrality

This domain must be usable by both Codex and Claude operators through the same
stack-control and Spec Kit artifacts. Host-specific wording may differ, but the
governed files, acceptance standards, and workflow state are shared.

<!-- SPECKIT START -->
For additional context about technologies, project structure, shell commands,
and important implementation details, read the current plan.
<!-- SPECKIT END -->
