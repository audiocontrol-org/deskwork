## deskwork

Open-source Claude Code plugins distributed as a monorepo under the `deskwork` name (after its flagship plugin). Each plugin is self-contained under `plugins/<name>/`. The root `.claude-plugin/marketplace.json` wires plugins together as a marketplace that can be installed via `claude plugin install --marketplace https://github.com/audiocontrol-org/deskwork <plugin>`.

## Plugins

| Name | Status | Purpose |
|---|---|---|
| `deskwork` | In progress — see `docs/1.0/001-IN-PROGRESS/deskwork-plugin/` | Editorial calendar lifecycle |
| `feature-image` | Planned | Feature image generation |
| `analytics` | Planned | Content performance analytics |

## Session Lifecycle

### Starting a Session

1. Read the feature workplan and latest journal entry
2. Check open GitHub issues for the feature
3. Review `DEVELOPMENT-NOTES.md` for past session corrections
4. Report context to the user and confirm the session goal
5. Do NOT start coding until the user confirms

Use `/session-start` to automate this, or `/feature-pickup` to resume a feature.

### Ending a Session

1. Update the feature `README.md` status table
2. Update `workplan.md` (check off completed acceptance criteria)
3. Write a `DEVELOPMENT-NOTES.md` entry
4. Comment on or close GitHub issues as appropriate
5. Commit all documentation changes

Use `/session-end` to automate this.

### Project Management

See `/Users/orion/work/PROJECT-MANAGEMENT.md` (work-level) for standards. Use `/feature-help` for the full feature lifecycle.

Feature documentation lives in `docs/1.0/<status>/<slug>/`:
- `001-IN-PROGRESS/` — active development
- `003-COMPLETE/` — merged and shipped

Each feature directory contains: `prd.md`, `workplan.md`, `README.md`, and optionally `implementation-summary.md`.

### Before Committing — Review Checklist

- [ ] Workplan updated with completed acceptance criteria?
- [ ] Could this task have been delegated to a sub-agent?
- [ ] No ad-hoc test infrastructure left behind?
- [ ] No fabricated claims (all data verified from source)?
- [ ] Documentation updated if behavior changed?
- [ ] No secrets, `.env` files, or build artifacts staged?
- [ ] Commit message is descriptive and has no Claude attribution?

## Sub-Agent Delegation

| Task Type | Agent |
|-----------|-------|
| Feature planning, PRD creation, branch/worktree setup | project-orchestrator |
| Implementation delegation, workplan tracking, PR delivery | feature-orchestrator |
| Code quality review, best practices | code-reviewer |
| Feature docs, plugin READMEs, SKILL.md authoring | documentation-engineer |
| TypeScript logic, adapter and helper code | typescript-pro |
| Codebase health, DRY violations, guideline adherence | codebase-auditor |
| Plugin structure, skill composition | architect-reviewer |

Always instruct agents to **use the Write/Edit tool to persist all changes to disk**.

## Repository Layout

```text
deskwork/
├── .claude-plugin/
│   └── marketplace.json      # Marketplace manifest (git-subdir entries)
├── plugins/
│   └── <plugin>/              # Self-contained plugin directory
│       ├── .claude-plugin/
│       │   └── plugin.json
│       ├── skills/
│       │   └── <skill>/SKILL.md
│       ├── bin/               # Helper scripts — added to PATH by Claude Code
│       ├── lib/               # Library code (TypeScript)
│       ├── package.json
│       └── README.md
├── docs/                      # Feature PRDs, workplans, impl notes
├── DEVELOPMENT-NOTES.md       # Session journal
├── package.json               # npm workspaces root
├── LICENSE                    # GPL-3.0-or-later
└── README.md
```

Plugins are self-contained — no cross-plugin `../` imports.

## Worktree Convention

Feature work happens in worktrees under `~/work/deskwork-work/`. The worktree directory name is the feature slug (no prefix). Example:

```
~/work/deskwork-work/deskwork-plugin/   # feature/deskwork-plugin branch
~/work/deskwork-work/analytics-mvp/     # feature/analytics-mvp branch (future)
```

## Plugin Conventions

- Each plugin gets one directory under `plugins/`
- Skills use kebab-case directory names; skill name in SKILL.md frontmatter matches
- Skills are composable and UNIX-style — one skill per action, never a monolith
- Interactive skills prompt one argument at a time when multiple are required
- Bundle helper scripts as proper scripts under `bin/`, not ad-hoc shell
- Adapter layer under `lib/` decouples skill logic from host project structure
- Skills read configuration via the adapter; never hardcode paths

## Core Requirements

### Security

- Never hardcode secrets in code or config files
- Use environment variables for sensitive data
- Never commit `.env` files

### Error Handling

Never implement fallbacks or use mock data outside of test code. Throw errors with descriptive messages instead. Fallbacks and mock data are bug factories.

### Code Quality

- TypeScript strict mode
- No `any`, no `as Type`, no `@ts-ignore`
- Composition over inheritance
- Use the `@/` import pattern
- Files must be under 300–500 lines — refactor larger files

### Repository Hygiene

- Build artifacts go in `dist/` (gitignored)
- Never bypass pre-commit or pre-push hooks — fix issues instead
- Never commit temporary files or build artifacts

## Common Commands

```bash
npm install                              # install workspace deps
npm --workspace plugins/<plugin> test    # run one plugin's tests
claude plugin validate plugins/<plugin>  # validate plugin manifest
claude --plugin-dir plugins/<plugin>     # load plugin into a Claude Code session
```

## Documentation Standards

- Don't call what you have built "production-ready"
- Never specify project management goals in temporal terms — use milestone, sprint, phase
- Never offer baseless projection statistics
- Use GitHub links (not file paths) in issue descriptions

## Development Journal Format

Each session gets an entry in `DEVELOPMENT-NOTES.md`:

```markdown
## YYYY-MM-DD: [Session Title]
### Feature: [feature-slug]
### Worktree: [slug]

**Goal:** [What we set out to do]

**Accomplished:**
- [What was done]

**Didn't Work:**
- [What failed and why]

**Course Corrections:**
- [PROCESS] [Description]
- [UX] [Description]
- [COMPLEXITY] [Description]

**Quantitative:**
- Messages: ~N
- Commits: N
- Corrections: N

**Insights:**
- [What was learned]
```

## Critical Don'ts

- Never hardcode secrets
- Never bypass pre-commit/pre-push hooks
- Never commit build artifacts
- Never commit `.env` files
- Never implement fallbacks or mock data outside test code
- Never add Claude attribution to git commits or PR descriptions
- Never call builds "production-ready"
