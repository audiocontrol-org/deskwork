# dw-lifecycle Plugin — Design

**Status:** Spec (output of `/superpowers:brainstorming`)
**Date:** 2026-04-29
**Source:** Brainstorming session in `audiocontrol.org-editorial-calendar` worktree, 2026-04-29
**Target release:** dw-lifecycle v0.1.0

---

## 1. Overview & goals

`dw-lifecycle` is a Claude Code plugin that orchestrates a managed-project feature lifecycle (define → setup → issues → implement → review → ship → complete) by composing two canonical Anthropic-shipped plugins instead of duplicating the practices they embody:

- **`superpowers`** (process disciplines: brainstorming, writing-plans, TDD, verification-before-completion, etc.)
- **`feature-dev`** (specialist subagents: `code-explorer`, `code-architect`, `code-reviewer`)

The plugin owns project-management substrate the canonical layer doesn't cover (PRD/workplan/README scaffolding, status-organized docs under `docs/<version>/<status>/<slug>/`, GitHub issue patterns, branch + worktree conventions, session journal lifecycle). It explicitly does NOT reimplement any practice already canonicalized upstream.

### Motivations

Three primary, one tentative:

- **A — Add discipline.** The existing in-tree `/feature-*` skills don't enforce TDD, verification-before-completion, brainstorming-before-implementation, multi-proposal architecture, or other rigor that superpowers and feature-dev have canonicalized.
- **B — Reduce duplication.** The in-tree skills have homegrown analogues of practices Anthropic now ships canonical versions of. Consolidate by delegating to the canonical layer.
- **C — Standardize and make portable.** Ship as a plugin so it's adoptable across projects (deskwork-plugin first, audiocontrol.org-editorial-calendar second, others after).
- **D (maybe) — Refactor toward process-discipline shape.** Open question; design doesn't depend on it.

### Constraint

Per the operator's framing: *"I want to make sure that I don't duplicate (a possibly inferior version of) the commonly accepted best practices, which I suspect the /feature-dev plugin is or will become. But, I want to be able to tailor it to my own needs."*

Translation: the canonical disciplines stay canonical; the lifecycle orchestration gets tailored. This rules out designs that re-implement upstream practices and rules out designs that surrender the project-management substrate.

### What this plugin is NOT

- NOT a replacement for `superpowers`. dw-lifecycle declares it as a required peer.
- NOT a replacement for `feature-dev`. dw-lifecycle dispatches its agents but covers a different scope (managed-project lifecycle vs. one-shot feature additions to unmanaged code).
- NOT a content-pipeline plugin. That space is `deskwork`. The two are complementary siblings in the same marketplace.
- NOT a forkable, opinion-by-opinion-configurable plugin. The lifecycle stages, workplan-driven implementation, stop-at-PR rule, journal format, and PRD/workplan templates are opinionated; only paths/branches/version-aware doc shape are config-driven.

---

## 2. Architecture

Three layers, top-down dependency direction:

```
LAYER 3 — dw-lifecycle (this plugin; lifecycle orchestration; opinionated; tailored)

  Public surface (slash commands):
    /dw-lifecycle:install
    /dw-lifecycle:define
    /dw-lifecycle:setup
    /dw-lifecycle:issues
    /dw-lifecycle:implement
    /dw-lifecycle:review
    /dw-lifecycle:ship
    /dw-lifecycle:complete
    /dw-lifecycle:pickup
    /dw-lifecycle:extend
    /dw-lifecycle:teardown
    /dw-lifecycle:doctor
    /dw-lifecycle:help
    /dw-lifecycle:session-start
    /dw-lifecycle:session-end

  Owns:
    - PRD / workplan / README templates
    - docs/<version>/<status>/<slug>/ directory lifecycle
      (001-IN-PROGRESS, 002-WAITING, 003-COMPLETE)
    - DEVELOPMENT-NOTES.md journal format
    - GitHub issue patterns (parent + per-phase + tracking tables)
    - Branch + worktree naming conventions
    - State-transition logic between lifecycle stages

                       │ depends on (REQUIRED peer)
                       ▼

LAYER 2 — superpowers (process disciplines; canonical)

  Provides: brainstorming, writing-plans, executing-plans,
    subagent-driven-development, dispatching-parallel-agents,
    using-git-worktrees, test-driven-development,
    systematic-debugging, verification-before-completion,
    requesting-code-review, receiving-code-review,
    finishing-a-development-branch, writing-skills

                       │ recommended (NOT REQUIRED) peer
                       ▼

LAYER 1 — feature-dev (specialist agents; canonical)

  Provides agents (invokable via the Agent tool):
    code-explorer, code-architect, code-reviewer
```

### Boundary contract

Three rules that prevent re-introducing duplication:

1. **Layer 3 never reimplements a Layer 2 discipline.** If superpowers ships brainstorming, `/dw-lifecycle:define` calls into it; it does not have its own interview flow.
2. **Layer 3 never reimplements a Layer 1 agent.** If feature-dev ships `code-explorer`, `/dw-lifecycle:implement` dispatches it; it does not have its own codebase-analysis subroutine.
3. **Layer 3 is free to add** orchestration that no canonical layer covers — PRD scaffolding, status-organized doc moves, issue tracking, journal lifecycle. Those stay Layer 3 because nothing canonical does them.

### Dependency posture

- `superpowers` is a **required** peer plugin. Skills exit on first invocation if it's missing.
- `feature-dev` is a **recommended** peer. Skills run without it but skip agent-dispatch steps with a one-line warning. Operator can install or ignore.
- `peerPlugins` is declared in `plugin.json` as a documentation-only field for v1 (Claude Code's plugin manifest doesn't enforce inter-plugin deps yet). `/dw-lifecycle:doctor`'s `peer-plugins` rule detects missing peers and prints install instructions.

### Distribution

Plugin lives **inside the deskwork monorepo** as a sibling to `deskwork` and `deskwork-studio`. Distributed via the same `audiocontrol-org/deskwork` marketplace adopters already use.

---

## 3. Skill-by-skill integration map

| Slash command | What it owns (Layer 3) | Invokes (Layer 2 superpowers) | Dispatches (Layer 1 feature-dev) |
|---|---|---|---|
| `/dw-lifecycle:install` | Bootstraps `.dw-lifecycle/config.json`; probes host project; writes config after operator confirms detected values | — | — |
| `/dw-lifecycle:define` | Writes `feature-definition.md` envelope (problem / scope / approach / tasks) | `brainstorming` for the interview | `code-explorer` (optional, when feature touches existing code — orient before scoping) |
| `/dw-lifecycle:setup` | Creates `docs/<targetVersion>/001-IN-PROGRESS/<slug>/` + populates PRD / workplan / README templates from definition | `using-git-worktrees` (branch + worktree); `writing-plans` (workplan generation from definition) | — |
| `/dw-lifecycle:issues` | Parses workplan; creates parent + per-phase GitHub issues; back-fills issue links into workplan | — | — |
| `/dw-lifecycle:implement` | Walks workplan tasks; updates progress; commits at task boundaries | `subagent-driven-development` (delegation discipline); `dispatching-parallel-agents` (when tasks are independent); `test-driven-development` (when tests apply) | `code-explorer` (codebase orientation); `code-architect` (multi-proposal design before coding) |
| `/dw-lifecycle:review` | Selects scope of changes to review; collates findings | `requesting-code-review` (how to request well); `receiving-code-review` (how to integrate findings without performative agreement) | `code-reviewer` (replaces in-house reviewer agent — canonical wins) |
| `/dw-lifecycle:ship` | Verifies acceptance criteria; opens PR; **stops at PR creation** (operator owns the merge) | `verification-before-completion` (evidence before assertions); `finishing-a-development-branch` (PR creation flow) | — |
| `/dw-lifecycle:complete` | Moves docs from `001-IN-PROGRESS/` to `003-COMPLETE/`; updates ROADMAP; closes issues | — | — |
| `/dw-lifecycle:pickup` | Reads workplan + checks issue status + reports next-action | — | — |
| `/dw-lifecycle:extend` | Adds phases to PRD/workplan; creates new GitHub issues for added phases | `writing-plans` (reuse for new phase content) | — |
| `/dw-lifecycle:teardown` | Removes branch + worktree (infrastructure-only; no opinion on feature status) | `using-git-worktrees` (teardown side) | — |
| `/dw-lifecycle:session-start` | Bootstrap session: read workplan + journal entry + open issues; report context | — | — |
| `/dw-lifecycle:session-end` | Append journal entry; update feature docs; commit documentation changes | — | — |
| `/dw-lifecycle:doctor` | Audit binding between calendar/journal/docs/issues; opt-in `--fix` | — | — |
| `/dw-lifecycle:help` | Render lifecycle diagram + current state of active features | — | — |

### Notable behavioral changes from existing `/feature-*`

1. **In-house `code-reviewer` agent retires.** `/dw-lifecycle:review` dispatches feature-dev's `code-reviewer`. Boundary contract says use the canonical specialist.
2. **Workplan generation gets `writing-plans` instead of in-house template-driven generation.** Project-specific WRAPPER (PRD scaffolding, status-organized docs, GitHub issue linkage) stays.
3. **`/dw-lifecycle:implement` opens with multi-proposal architecture** (feature-dev's `code-architect` proposes 2–3 approaches before coding).
4. **`/dw-lifecycle:ship` stop-at-PR rule ported verbatim** from deskwork-plugin's amended `/feature-ship`.

### What does NOT change

- All project-management substrate preserved verbatim: `docs/<version>/<status>/<slug>/`, PRD/workplan/README templates, `DEVELOPMENT-NOTES.md` format, GitHub issue patterns, branch naming.
- Slash command shape: composable, UNIX-style, one command per action. No monolithic guided flow.

### Deferred for v2+

- `/dw-lifecycle:debug` — not adding. `superpowers:systematic-debugging` fires organically when bugs surface inside `/dw-lifecycle:implement`.
- Custom agents — v1 ships zero agents; all subagent invocations route to feature-dev or to existing project agents.

---

## 4. Parameterization & config schema

`.dw-lifecycle/config.json` lives at each host project root (mirrors `.deskwork/config.json` shape):

```jsonc
{
  "version": 1,

  "docs": {
    "root": "docs",                          // default: "docs"
    "byVersion": true,                       // when true, paths include /<targetVersion>/
    "defaultTargetVersion": "1.0",           // applied when /dw-lifecycle:setup omits --target
    "knownVersions": ["1.0", "1.1"],         // for doctor's version-shape-drift rule
    "statusDirs": {
      "inProgress": "001-IN-PROGRESS",
      "waiting": "002-WAITING",
      "complete": "003-COMPLETE"
    }
  },

  "branches": {
    "prefix": "feature/"                     // default: "feature/"
  },

  "worktrees": {
    "naming": "<repo>-<slug>"                // template; <repo> = current repo basename
  },

  "journal": {
    "path": "DEVELOPMENT-NOTES.md",
    "enabled": true
  },

  "tracking": {
    "platform": "github",                    // v1: github only
    "parentLabels": ["enhancement"],
    "phaseLabels": ["enhancement"]
  },

  "session": {
    "start": { "preamble": "" },             // optional project-specific bootstrap text
    "end":   { "preamble": "" }
  }
}
```

### Version-sensitive path resolution

When `docs.byVersion` is `true`:

- `/dw-lifecycle:setup --target 1.0 my-slug` → `docs/1.0/001-IN-PROGRESS/my-slug/`
- `/dw-lifecycle:setup --target 1.1 other-slug` → `docs/1.1/001-IN-PROGRESS/other-slug/`
- `--target` defaults to `config.docs.defaultTargetVersion`
- `/dw-lifecycle:complete` reads the feature's tracked target from its workplan/README frontmatter and moves to `docs/<that-version>/003-COMPLETE/<slug>/`. The version travels with the feature.
- `/dw-lifecycle:extend my-slug --retarget 1.1` opt-in mid-flight re-targeting (renames directory, updates frontmatter, leaves a forwarding stamp in the journal).

When `docs.byVersion` is `false`, the version segment is omitted: `docs/001-IN-PROGRESS/my-slug/`.

### What stays opinionated (NOT configurable)

Hardcoded; adopters who want different shape fork the plugin:

- The lifecycle stages themselves
- The workplan-driven implementation pattern
- The stop-at-PR rule in `/dw-lifecycle:ship`
- The boundary contract with superpowers and feature-dev
- The journal entry template (path is configurable; format is not)
- The PRD / workplan / README templates (configurable templates is a v2+ concern)

### Discovery (install)

`/dw-lifecycle:install` probes the host project to detect existing shape (docs/<version>/, branch prefix, repo name, journal file presence) and writes a starter config after operator confirms each detected value. No silent defaults that get wrong on first install.

### Doctor rules (initial)

- `missing-config` — no `.dw-lifecycle/config.json` exists
- `peer-plugins` — `superpowers` or `feature-dev` not installed
- `version-shape-drift` — `docs/<v>/<status>/<slug>/` directories exist for versions not yet in `config.docs.knownVersions`
- `orphan-feature-doc` — directory in `001-IN-PROGRESS/` with no matching workplan
- `stale-issue` — GitHub issue closed but feature still in `001-IN-PROGRESS/`
- `journal-feature-mismatch` — journal entry references a slug with no doc directory

Default mode is read-only audit; opt-in repair via `--fix=<rule>`. Mirrors deskwork doctor's posture.

---

## 5. Plugin packaging in the deskwork repo

### File layout

```text
deskwork-plugin/                              (repo root)
├── .claude-plugin/
│   └── marketplace.json                      # add dw-lifecycle entry
├── plugins/
│   ├── deskwork/                             # existing
│   ├── deskwork-studio/                      # existing
│   └── dw-lifecycle/                         # NEW
│       ├── .claude-plugin/
│       │   └── plugin.json
│       ├── skills/
│       │   ├── install/SKILL.md
│       │   ├── define/SKILL.md
│       │   ├── setup/SKILL.md
│       │   ├── issues/SKILL.md
│       │   ├── implement/SKILL.md
│       │   ├── review/SKILL.md
│       │   ├── ship/SKILL.md
│       │   ├── complete/SKILL.md
│       │   ├── pickup/SKILL.md
│       │   ├── extend/SKILL.md
│       │   ├── teardown/SKILL.md
│       │   ├── session-start/SKILL.md
│       │   ├── session-end/SKILL.md
│       │   ├── doctor/SKILL.md
│       │   └── help/SKILL.md
│       ├── bin/
│       │   └── dw-lifecycle                  # CLI wrapper
│       ├── src/                              # TypeScript source for the bin
│       │   ├── cli.ts
│       │   ├── config.ts                     # loads .dw-lifecycle/config.json
│       │   ├── docs.ts                       # version-aware doc-tree resolution
│       │   ├── workplan.ts                   # workplan parser + writer
│       │   ├── journal.ts                    # DEVELOPMENT-NOTES entry append
│       │   ├── tracking-github.ts            # gh issue create/update
│       │   └── transitions.ts                # state-transition handlers (atomic file moves)
│       ├── templates/
│       │   ├── prd.md
│       │   ├── workplan.md
│       │   ├── readme.md
│       │   └── feature-definition.md
│       ├── package.json                      # workspace member
│       ├── README.md
│       └── LICENSE
└── packages/                                 # existing shared TS packages
                                              # dw-lifecycle does NOT add one for v1
```

### Plugin metadata

`plugins/dw-lifecycle/.claude-plugin/plugin.json`:

```jsonc
{
  "name": "dw-lifecycle",
  "version": "0.1.0",
  "description": "Project lifecycle orchestration plugin — define → setup → issues → implement → review → ship → complete. Composes superpowers (process disciplines) and feature-dev (specialist agents).",
  "license": "GPL-3.0-or-later",
  "metadata": {
    "peerPlugins": {
      "required": ["superpowers"],
      "recommended": ["feature-dev"]
    }
  }
}
```

`peerPlugins` is documentation-only for v1. `/dw-lifecycle:doctor`'s `peer-plugins` rule reads it to detect missing peers.

### Marketplace registration

Append to `.claude-plugin/marketplace.json`:

```jsonc
{
  "name": "dw-lifecycle",
  "description": "Project lifecycle orchestration; composes superpowers + feature-dev.",
  "source": "./plugins/dw-lifecycle",
  "category": "development"
}
```

Adopters install via the existing deskwork marketplace:

```text
/plugin marketplace add https://github.com/audiocontrol-org/deskwork
/plugin install dw-lifecycle@deskwork
```

### Bin / CLI

The bin handles file-touching atomic operations: parse/write workplans, append journal entries, move docs across status directories with frontmatter preservation, create GitHub issues. Skills shell out via `dw-lifecycle <subcommand>` (mirrors how deskwork skills shell out to `deskwork <subcommand>`).

Initial subcommand surface:

```text
dw-lifecycle install <project-root>
dw-lifecycle setup <slug> [--target <version>]
dw-lifecycle issues <slug>
dw-lifecycle transition <slug> <to-stage>
dw-lifecycle journal-append <slug> --file <entry.md>
dw-lifecycle doctor [--fix=<rule>] [--yes]
```

Skills compose around these. Brainstorming/architecting/coding/reviewing logic stays in skills + invoked-canonical-skills; the bin only handles deterministic file/issue mechanics.

### Versioning and release

Independent semver from `deskwork` and `deskwork-studio` (Phase 23's source-shipped re-architecture sets the precedent). Initial ship at `v0.1.0`. Same release pipeline as the existing plugins. The release process must verify `vendor/` population before publishing — issue audiocontrol-org/deskwork#81 covers a related v0.8.7 packaging regression that must be resolved before dw-lifecycle's first release goes through the same pipeline.

---

## 6. Migration path & rollout

Same dual-pipeline holding pattern deskwork used when displacing its own predecessor at audiocontrol.org. Both lifecycles run side-by-side until dw-lifecycle proves itself.

### Phase 1 — Build (in the deskwork repo)

- Scaffold `plugins/dw-lifecycle/` per Section 5.
- Port the existing **deskwork-plugin's own `.claude/skills/feature-*`** as the source of truth for the slash-command set. (Those have shipped real work; they're more battle-tested than other variants.)
- Wire each skill to the canonical layer per Section 3's integration map. No shortcuts; if a discipline is missing from superpowers/feature-dev that you genuinely need, file upstream first.
- Build the bin. State-transitions, doc-tree moves with version awareness, journal append, GitHub issue automation.
- Tag `v0.1.0`. Cut release through deskwork's existing pipeline.

### Phase 2 — Dogfood inside deskwork-plugin

- Install `dw-lifecycle@deskwork` in the deskwork-plugin worktree itself.
- Run `/dw-lifecycle:install` to write `.dw-lifecycle/config.json`.
- Drive the next deskwork-plugin feature end-to-end through dw-lifecycle.
- The in-tree `/feature-*` skills stay in place (NOT deleted, NOT renamed). They're the fallback if dw-lifecycle is broken. Marked `[DEPRECATED — see /dw-lifecycle:<command>]` in their descriptions only.
- File upstream issues for friction. Cut `v0.1.x` patches. Re-attempt.
- **Acceptance:** two consecutive features driven through dw-lifecycle end-to-end without falling back to the in-tree skills.

### Phase 3 — Validate against audiocontrol.org

- Install in `audiocontrol.org-editorial-calendar`.
- The deskwork-plugin's `/feature-*` skills and audiocontrol's `/feature-*` skills are not identical — running against audiocontrol surfaces version-targeting edge cases (audiocontrol uses `docs/<version>/`; deskwork-plugin has only `docs/1.0/`) and PRD-template differences.
- File-and-fix loop continues. Likely 1–2 release patches.
- **Acceptance:** one feature driven through dw-lifecycle in audiocontrol.org end-to-end.

### Phase 4 — Adopt across remaining projects

- Other projects you manage (one at a time).
- Once each project has driven a feature end-to-end through dw-lifecycle, the in-tree `/feature-*` skills in that project get deleted.

### Risk management

- **Bisect-friendly rollout.** Phase 2's "in-tree skills stay in place" rule is non-negotiable until dw-lifecycle has driven the acceptance count.
- **Bug bisect window.** Each phase's acceptance bar is the minimum gate. If a release patch lands during a feature's lifecycle, the workplan may be half-driven by old, half by new — that's expected; doctor's `--fix` rules cover the cleanup.
- **Rollback plan.** If a major design problem surfaces during Phase 2, the dual-pipeline pattern means rollback is `/plugin uninstall dw-lifecycle@deskwork` + revert one or two file states. The in-tree fallback is still functional.

---

## 7. Edge cases, error handling, testing

### Graceful degradation across peer plugins

| Scenario | Behavior |
|---|---|
| `superpowers` not installed | Required peer. Skills exit immediately with: `"/dw-lifecycle:<command> requires the superpowers plugin. Install: /plugin install superpowers@claude-plugins-official"`. No fallback. |
| `feature-dev` not installed | Recommended peer. Skills run but skip agent-dispatch steps. Print one-line warning at start of `/dw-lifecycle:implement` and `/dw-lifecycle:review`: `"feature-dev not detected; using single-agent fallback. Install: /plugin install feature-dev@claude-plugins-official"`. |
| Both missing | First-encountered missing peer wins; doctor reports both. |

`/dw-lifecycle:doctor`'s `peer-plugins` rule detects missing peers and prints install instructions. Read-only by default; `--fix` is not offered for plugin installation (operator owns plugin choices).

### Namespace conflict avoidance

- `/feature-dev` slash command is unrelated to `/dw-lifecycle:*` commands — no collision.
- feature-dev's `code-explorer`, `code-architect`, `code-reviewer` are agent names. dw-lifecycle **must not** define agents with those names. Vitest assertion at plugin build time: `plugins/dw-lifecycle/agents/` is empty for v1.
- README documents that `/feature-dev` and `/dw-lifecycle:*` are complementary, not competing.

### Error handling at boundaries

- **Missing config.** Any non-`install` skill exits with: `"No .dw-lifecycle/config.json found. Run /dw-lifecycle:install first."`
- **Malformed workplan.** Parser errors include line number + the failing line. No silent recovery.
- **GitHub API failures** (rate limit / auth). Surface gh CLI's stderr verbatim. No retry.
- **Branch already exists.** `/dw-lifecycle:setup` aborts; surfaces the existing branch.
- **Doc directory exists for a different slug.** `/dw-lifecycle:setup` aborts; never overwrites.
- **Version directory missing.** `/dw-lifecycle:setup --target 1.1` against a host with no `docs/1.1/` creates the version directory atomically. `/dw-lifecycle:doctor` flags any version directory present in the file tree but absent from `config.docs.knownVersions`.

### Testing strategy

Vitest tests for the bin, following `superpowers:test-driven-development`:

- `workplan.test.ts` — parser round-trips fixture workplans byte-identical
- `config.test.ts` — loader rejects invalid configs with field-specific errors; defaults applied where appropriate
- `docs.test.ts` — version-aware path resolution; `byVersion: true/false` modes; `<targetVersion>` slot substitution
- `transitions.test.ts` — state moves preserve frontmatter; idempotent re-runs are no-ops
- `journal.test.ts` — append doesn't corrupt prior entries; structured-format validation
- `tracking-github.test.ts` — gh CLI invocation shapes (mocked at the shell level)

Local smoke tests (no CI per deskwork's no-CI-testing rule): `scripts/smoke-dw-lifecycle.sh` runs install → setup → issues → ship against a temp repo fixture.

Real dogfooding (Phase 2's "two consecutive features driven through dw-lifecycle") is the load-bearing integration test. Test fixtures cover deterministic mechanics only; agent quality is judged by operator review during dogfooding.

### Documentation

- `plugins/dw-lifecycle/README.md` — install, peer plugins, slash commands, config schema, the canonical-vs-tailored boundary contract, version-aware paths.
- Each `SKILL.md` follows deskwork's existing skill-doc shape (one paragraph of intent, then numbered steps, then error handling).
- `docs/1.0/<status>/dw-lifecycle/` in the deskwork-plugin repo holds the PRD, workplan, README, and (eventually) `implementation-summary.md` — same convention this very plugin will encode.

---

## 8. Open questions / out of scope for v1

- **Tracking platforms beyond GitHub.** Linear, Jira, etc. — `tracking.platform` is a config field but only `"github"` is implemented for v1. Add platforms in v0.2+ as adopters need them.
- **Configurable PRD/workplan templates.** v1 ships one canonical shape. v2+ can let adopters override templates via `.dw-lifecycle/templates/`.
- **Custom agents.** v1 ships zero agents. v2+ can add them if specific operator workflows surface needs that feature-dev's agents don't cover.
- **Cross-project feature tracking.** No support yet for features that span multiple repos. Out of scope for v1; revisit if/when needed.
- **`/dw-lifecycle:debug`.** Not adding; `superpowers:systematic-debugging` fires organically when bugs surface inside `/dw-lifecycle:implement`.

---

## 9. Acceptance criteria

dw-lifecycle v0.1.0 ships when:

- [ ] All 15 slash commands exist as `SKILL.md` files in `plugins/dw-lifecycle/skills/`
- [ ] Each skill conforms to Section 3's integration map (correct superpowers invocations + feature-dev dispatches)
- [ ] `bin/dw-lifecycle` implements the six initial subcommands (install / setup / issues / transition / journal-append / doctor)
- [ ] `.dw-lifecycle/config.json` schema is implemented per Section 4 (with version-aware path resolution)
- [ ] All vitest tests pass (workplan / config / docs / transitions / journal / tracking-github)
- [ ] Local smoke test passes against a temp repo fixture
- [ ] `plugin.json`, `marketplace.json` entry, and `README.md` exist
- [ ] `/dw-lifecycle:doctor` flags missing peer plugins correctly
- [ ] Plugin loads cleanly via `/plugin install dw-lifecycle@deskwork`
- [ ] Release-pipeline blocker resolved: issue [audiocontrol-org/deskwork#81](https://github.com/audiocontrol-org/deskwork/issues/81) (empty-`vendor/` packaging regression in v0.8.7) is fixed before v0.1.0 ships through the shared release pipeline

Phase 2 dogfood-acceptance (after v0.1.0 ships):

- [ ] Two consecutive features driven through dw-lifecycle in the deskwork-plugin worktree, end-to-end, without falling back to the in-tree `/feature-*` skills
- [ ] In-tree `/feature-*` skills marked `[DEPRECATED]` in their descriptions

Phase 3 cross-project-acceptance:

- [ ] One feature driven through dw-lifecycle in `audiocontrol.org-editorial-calendar`, end-to-end
- [ ] Version-aware path handling validated against `docs/<version>/` shape

---

## Appendix — Brainstorm provenance

This design is the output of a `/superpowers:brainstorming` session conducted in the `audiocontrol.org-editorial-calendar` worktree on 2026-04-29. The session was triggered by surfacing duplication between the operator's homegrown `/feature-*` family and Anthropic's `claude-plugins-official` marketplace plugins (`superpowers`, `feature-dev`).

The brainstorm followed the canonical six-section flow (architecture → integration map → parameterization → packaging → migration → edge cases) with explicit user sign-off at each section boundary. Course corrections during the brainstorm:

- **Distribution shape pivot:** initial design assumed extraction from audiocontrol.org; user redirected to building inside the deskwork monorepo as a sibling plugin.
- **Version-aware paths:** initial parameterization design treated `docs/1.0/` as a static convention; user clarified it's release-target-aware (`docs/1.0/`, `docs/1.1/`, etc.) and that the version travels with the feature.
- **Worktree path correction:** initial worktree provisioning used `~/work/deskwork-work/<branch-tail>`; user clarified the deskwork pattern is `~/work/deskwork-work/deskwork-<slug>` (matching `deskwork-plugin`, `deskwork-triage`).

---

## 10. 2026-05-03 Audit-Driven Extension

The implementation audit on 2026-05-03 found that `dw-lifecycle` only partially conforms to this design. The key issue is not that the architecture is wrong; it is that several user-visible behaviors remain at the "skill prose promise" layer instead of being backed by reliable deterministic substrate.

### Gaps the extension is meant to close

1. **Peer-plugin contract is not trustworthy in implementation.**
   `superpowers` / `feature-dev` posture is foundational to the architecture, but doctor currently hardcodes peer absence instead of inspecting the real install state.

2. **Bootstrap fidelity is below the portability bar.**
   The install skill promises probe → confirm → write, but the helper currently writes `defaultConfig()` with no project-shape detection.

3. **Setup fidelity is below the PRD/workflow bar.**
   The setup helper does not write a `deskwork.id` into the PRD, and it appends the definition file to `workplan.md` instead of seeding `prd.md`.

4. **Version-retargeting is promised but not implemented.**
   The `extend` skill describes same-stage retarget behavior that the transition helper cannot actually perform.

5. **Portability remains only partial because deskwork-specific conventions are still shipped as defaults.**
   Session-* and feature-doc shapes remain tightly coupled to this repo's conventions.

### Remediation approach

The fix shape stays faithful to the original architecture:

- **Do not** collapse the plugin back into deskwork-specific in-tree skills.
- **Do not** add custom subagents.
- **Do** strengthen the deterministic helper substrate where the PRD depends on reliability.
- **Do** move project-coupled conventions behind explicit override seams.

### New follow-up phase

Add a new post-ship remediation phase after the original Phase 7 / 8 bug and customize-hook work:

- **Phase 9 — PRD conformance hardening**
  - real peer-plugin detection
  - install probe/confirm implementation
  - PRD-first setup flow (`deskwork.id`, definition import into PRD)
  - actual retarget support across version directories
  - end-to-end audit rerun against the updated implementation

### Updated acceptance for this reopened arc

The reopened feature should not be considered complete again until:

- the high-severity audit gaps are closed in code
- the skill layer and helper layer no longer materially contradict each other
- one fresh adopter-shaped dogfood run can execute `define → setup → issues → implement/review/ship scaffolding` without manual repair of config or docs

This extension intentionally preserves the original v0.1.0 design history while tightening the implementation to match the architecture it already claims.
