# deskwork

Codex project guide for this repository. This is the Codex-facing equivalent of the legacy `.claude/CLAUDE.md`, with the same durable project rules adapted to this environment.

For adopter install and usage, follow each plugin's own README. Do not quote install commands from memory or duplicate them here.

## Core Principle

Deskwork manages **collections of markdown content**, not websites.

The unit of work is a content collection: a tree of markdown files plus supporting media, bound by `deskwork.id` frontmatter UUIDs. A website is only one downstream renderer of that collection. If a design or implementation assumes *"there must be a website here"*, that coupling is the bug.

Implications:

- `host` is optional metadata, not a requirement.
- Collection detection matters more than renderer detection.
- Studio surfaces should work without a configured host.
- Doctor rules operate on collection state first, renderer-specific concerns second.

## Plugins

| Name | Status | Purpose |
|---|---|---|
| `deskwork` | In progress | Editorial calendar lifecycle |
| `feature-image` | Planned | Feature image generation |
| `analytics` | Planned | Content performance analytics |

## Session Lifecycle

### Start

1. Read the active feature workplan and latest journal entry.
2. Check open GitHub issues for the feature.
3. Review `DEVELOPMENT-NOTES.md` for recent corrections.
4. Report context and confirm the session goal.
5. Do not start coding until the user confirms if the work is a planning/resume flow.

When reporting workflow state or answering "what's the next step", name the
single immediate next action only. Do not bundle the following step into the
same answer unless the operator explicitly asks for the sequence. If later
steps are mentioned for context, label them as later and do not execute them
from a generic "do it."

Use the `stack-control` workflow as the canonical path. For session pickup in the
active stack-control installation, prefer `plugins/stack-control/skills/session-start/`
and the active plugin-local Spec Kit feature under `plugins/stack-control/specs/`.

### End

1. Update the feature `README.md`.
2. Update `workplan.md`.
3. Write a `DEVELOPMENT-NOTES.md` entry.
4. Update or close GitHub issues as appropriate.
5. Commit documentation changes.

Use `plugins/stack-control/skills/session-end/`.

## Feature Lifecycle

The old repo-wide `.agents/skills/feature-*` workflow is deprecated and should
not be used for new feature work.

Canonical feature path:

1. Use `plugins/stack-control/skills/define/` to author a new Spec Kit feature
   in the active stack-control installation.
2. Use `plugins/stack-control/skills/extend/` to iterate the spec to runnable.
3. Use `plugins/stack-control/skills/execute/` to drive implementation through
   the front door.
4. Use the stack-control backlog, roadmap, session, and release surfaces for
   supporting workflow management.

For non-feature documents, use the deskwork lifecycle directly.

## Repository Layout

```text
deskwork/
├── .claude-plugin/             # Claude marketplace manifest (legacy platform surface)
├── .agents/                    # Codex-local project guidance, rules, and skills
├── packages/
│   ├── core/
│   ├── cli/
│   └── studio/
├── plugins/
│   └── <plugin>/
│       ├── .claude-plugin/
│       ├── skills/
│       ├── bin/
│       ├── .runtime-cache/
│       ├── package.json
│       └── README.md
├── scripts/
├── docs/
├── DEVELOPMENT-NOTES.md
├── USAGE-JOURNAL.md
└── README.md
```

This repo still ships Claude-compatible plugins under `plugins/*`. The Codex port in `.agents/` is project guidance for working on this repo, not a replacement for plugin payloads.

## Worktree Convention

Feature worktrees live under `~/work/deskwork-work/<slug>`.

Example:

- `~/work/deskwork-work/deskwork-plugin/`
- `~/work/deskwork-work/analytics-mvp/`

## Plugin Conventions

- One plugin per directory under `plugins/`
- Skills use kebab-case directory names
- One skill per action
- Interactive skills prompt one argument at a time
- Helper scripts belong in `bin/`, not ad-hoc shell snippets
- Plugin shell version and published package version stay in lockstep
- In workspace dev, prefer the workspace symlink path; in adopter mode, rely on the plugin shell's first-run install behavior
- Studio client assets build into `.runtime-cache/`
- Per-project overrides live under `.deskwork/templates/` and `.deskwork/doctor/`

## Coding Requirements

### Security

- Never hardcode secrets
- Use environment variables for sensitive data
- Never commit `.env` files

### Error Handling

Do not implement silent fallbacks or mock data outside test code. Prefer explicit errors with actionable messages.

### Code Quality

- TypeScript strict mode
- No `any`
- No unchecked `as Type` casts
- No `@ts-ignore`
- Composition over inheritance
- Use existing repo import patterns
- Refactor files that grow beyond roughly 300–500 lines

### Repository Hygiene

- Build artifacts belong in `dist/` or `.runtime-cache/`
- Do not bypass hooks
- Do not commit temporary files or local scratch artifacts

## Commands

```bash
npm install
npm --workspace @deskwork/<pkg> test
claude plugin validate plugins/<plugin>
claude --plugin-dir plugins/<plugin>
make publish
bash scripts/smoke-marketplace.sh
```

## Delegation

Codex should do work locally by default.

If the user explicitly asks for delegation or parallel agent work:

- use a worker/explorer split only for bounded subtasks
- keep file ownership disjoint
- do not let a delegated "out of scope" note stand as the disposition

Absent explicit user permission, do not assume subagent delegation is available just because the legacy Claude workflow named specialist agents.

## Documentation Standards

- Do not call the project "production-ready"
- Do not express project management goals in temporal terms
- Do not invent metrics or projections
- Use GitHub links in issue descriptions, not local file paths

## Journal Format

`DEVELOPMENT-NOTES.md` entries should include:

- Goal
- Accomplished
- Didn't Work
- Course Corrections
- Quantitative
- Insights

Use correction tags from `.agents/rules/session-analytics.md`.

## Codex Rule Index

Read these when relevant:

- `.agents/rules/agent-discipline.md`
- `.agents/rules/documentation.md`
- `.agents/rules/file-handling.md`
- `.agents/rules/testing.md`
- `.agents/rules/session-analytics.md`
- `.agents/rules/workflow-playbooks.md`
