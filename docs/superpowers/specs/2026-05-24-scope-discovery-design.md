---
title: Scope-discovery protocol — canonization into dw-lifecycle — design spec
slug: scope-discovery
date: 2026-05-24
status: draft
deskwork:
  doc: design-spec
---

# Scope discovery — canonization into dw-lifecycle — design

## Problem

The `dw-lifecycle` plugin's existing skill set (`define / setup / implement / review / ship`) carries a project through a feature lifecycle, but it does NOT enforce upfront scope discovery on system-wide work, and it does NOT enforce sibling-enumeration on sub-agent dispatches. Both are agent-side discipline gaps that have been measurably expensive in real work — the audiocontrol pilot's motivation:

> *Motivated by the Roland S-330/S-550 v3 redesign (May 2026), which spent ~230 operator turns over 60 hours doing brute-force discovery the agent should have done in 10–15 minutes at session start. ... The protocol treats agent-side enforcement as code, not directives — passive rules in `CLAUDE.md` and agent prompts have demonstrably failed against persistent pathologies in this repo. Every gate the protocol introduces is code-shaped: it rejects the bad shape mechanically, not by asking the agent to remember.*

Audiocontrol built and validated the protocol in-repo: `/scope-inventory <slug>` for upfront discovery, `/scope-widen "<complaint>"` for mid-implementation widening, a pre-commit clone-detector gate, a sub-agent dispatch wrapper enforcing `Searched/Included/Excluded` return grammar, Step 0 refactor-preconditions, anti-patterns + adopter-manifests + editor-symmetry + deprecation-queue scan types. Paper-tested at 87.5% coverage against the s550 redesign's 32 documented surfaces. Pilot home: `~/work/audiocontrol-work/audiocontrol-scope-discovery-protocol/docs/scope-discovery/README.md`.

This feature canonizes the protocol into dw-lifecycle so any project using dw-lifecycle gets it. The audiocontrol pilot's repo-local copy becomes one adopter among many; the deskwork repo becomes the second adopter, exercising the canonization end-to-end against the in-flight `graphical-entries` feature.

## Goals

- Move the protocol's CODE (scanners, validators, discovery agents, dispatch wrapper, schema validators) into the `dw-lifecycle` plugin as plugin-shipped TypeScript modules.
- Leave the protocol's CONFIG (dispositioned baselines, anti-patterns registry, adopter-manifests, editor-symmetry matrix, deprecation queue, migration map) project-owned at `<projectRoot>/.dw-lifecycle/scope-discovery/`.
- Integrate the protocol's slash commands and gates into the existing dw-lifecycle pipeline: `define` auto-runs `scope-inventory`; `implement` auto-runs `scope-widen` on multi-file tasks; `review` auto-runs the clone detector against the diff; the dispatch wrapper engages on sub-agent dispatches. All auto-invocations opt-out-able per-phase. Pre-commit hook + agent-prompt mirrors are opt-in scaffolds.
- Preserve agent-readability (TypeScript, no opaque binaries) per THESIS Consequence 1.
- Preserve the override seam per THESIS Consequence 3: project-side YAML configs are first-class; per-file scanner overrides via `/dw-lifecycle:customize scope-discovery <name>`.
- Migrate the audiocontrol pilot smoothly: existing `tools/scope-discovery/` + `docs/scope-discovery/` translate cleanly to `.dw-lifecycle/scope-discovery/`; the pilot's CONFIG (clones.yaml, anti-patterns.yaml, etc.) ports verbatim; project-specific extensions of the CODE either become customize-overrides or contributions back to the plugin.
- Exercise the canonization end-to-end against the deskwork-side `graphical-entries` feature before the feature enters implementation.

## Captured but pending operator scope decision

(Items below are designed so the operator can scope explicitly. The capture itself doesn't decide whether they ship in v1 — that's a separate operator-driven pass per the `Capture mode vs scope mode` rule in `.claude/rules/agent-discipline.md`.)

- **Plugin-extension-point intercept of the Agent tool.** Currently no Claude Code extension point allows a plugin to wrap every Agent invocation in an adopter project. The pilot's dispatch wrapper requires the orchestrator to explicitly call `wrap()`. A plugin-level intercept would automate this. Captured as Future Work; depends on upstream Claude Code work.
- **Studio surface for the clones baseline.** dw-lifecycle has no studio today; if one ever lands, the `clones.yaml` backlog (~495 entries on audiocontrol post-pilot) is the obvious first render with sortable columns + per-row disposition actions. Captured for future work.
- **Per-language extensibility.** v1 supports `.ts/.tsx` (jscpd + ts-morph + ast-grep). Adopters with `.go`, `.py`, `.rs`, `.kt` get a path via `/dw-lifecycle:customize` to override the language-specific scanners. Plugin design supports this; v1 ships TypeScript-only scanners; explicit language additions are subsequent features that plug into the existing seam.
- **v2 enhancement classes (per pilot's "Honest limitations").** `dom-visual-walker` (Playwright-driven; catches layout density, scrollbar shift, clipped elements), `a11y-audit` (axe-core; catches focus order, ARIA, keyboard nav), `vestigial-copy-audit` (catches strings that no longer apply), `component-roster` (catches sub-components below route surfaces). Each is its own future feature; captured here as the design space for "what other discovery agents could compose into `/scope-inventory`."
- **CI integration.** v1 ships pre-commit gates as the default. CI integration is a project-specific wiring task (operators add `dw-lifecycle check-*` invocations to their workflow YAMLs). Plugin includes a `.github/workflows/scope-discovery.yml` exemplar.
- **Cross-project rollup view.** Multi-repo organizations may want a single dashboard of clones / anti-patterns / holdouts across all their projects using dw-lifecycle. Plugin-side data export (`dw-lifecycle scope-export --json`) makes this possible; the rollup UI itself is a separate project. Captured for future work.

## Approach

### Where things live

| Layer | Location | Lifecycle |
|---|---|---|
| Scanners / validators / discovery agents / dispatch wrapper (CODE) | `plugins/dw-lifecycle/src/scope-discovery/` | Plugin default; per-file project override at `<projectRoot>/.dw-lifecycle/scope-discovery/<name>.ts` via `/dw-lifecycle:customize scope-discovery <name>` |
| Dispositioned baselines (CONFIG) | `<projectRoot>/.dw-lifecycle/scope-discovery/{clones,anti-patterns,adopter-manifests,migration-map}.yaml` + `{editor-symmetry,deprecation-queue}.md` | Project-owned by definition; plugin ships none |
| JSON Schemas for the CONFIG files | `plugins/dw-lifecycle/src/scope-discovery/schema/*.schema.json` | Plugin-shipped; `/dw-lifecycle:doctor` validates project YAMLs against them |
| Per-feature evidence trail | `docs/<v>/001-IN-PROGRESS/<slug>/scope-inventory/runs/<stamp>-<runId>/` + `scope-manifest.yaml` in the feature docs dir | Auto-generated by `/dw-lifecycle:scope-inventory` |
| Pre-commit hook scaffold | `.githooks/pre-commit` + Husky config in adopter project | Opt-in via `/dw-lifecycle:install-scope-discovery-hooks` |
| Static agent-prompt mirrors | Adopter project's `.claude/agents/{code-reviewer,codebase-auditor}.md` §Step 0 verification sections | Opt-in via `/dw-lifecycle:install-agent-prompts`; canonical fragment at plugin-shipped `refactor-preconditions-checklist.md` is source of truth; drift checked by `/dw-lifecycle:doctor` |
| Hooks-installed manifest | `<projectRoot>/.dw-lifecycle/scope-discovery/hooks-installed.json` | Records hook + agent-prompt install provenance (when, by which dw-lifecycle version, which files touched); enables clean uninstall |

### Pipeline integration

Existing dw-lifecycle skills extend to auto-invoke scope-discovery at the right phase. Every auto-invocation has an explicit opt-out flag so adopters with smaller projects can quiet the protocol.

| Existing skill | Scope-discovery composition |
|---|---|
| `/dw-lifecycle:define` | Auto-runs `scope-inventory` after writing the feature definition. Flag `--no-scope-inventory` opts out. |
| `/dw-lifecycle:implement` | Auto-runs `scope-widen` on each task that touches multiple files. Flag `--no-scope-widen` opts out. Sub-agent dispatches use the dispatch wrapper enforcing `Searched/Included/Excluded` grammar. |
| `/dw-lifecycle:review` | Auto-runs the clone detector against the diff. Flag `--no-clone-check` opts out. |
| `/dw-lifecycle:doctor` | Validates project YAMLs against schemas; checks for mirror drift between agent-prompt mirrors and the canonical fragment; reports drift between project per-file overrides and plugin defaults (> N-line diff threshold). |
| `/dw-lifecycle:customize` | Extends to support `scope-discovery <name>` (copies an individual plugin default into `.dw-lifecycle/scope-discovery/<name>.ts` for editing). |

Pre-commit hook + dispatch wrapper + agent-prompt mirrors are opt-in scaffolds (the plugin does not reach into the adopter's `.githooks/` or wrap their Agent tool without explicit consent).

### New slash commands

```
/dw-lifecycle:scope-inventory <slug>                 — upfront discovery for a system-wide feature
/dw-lifecycle:scope-widen "<complaint>"              — mid-implementation sibling enumeration
/dw-lifecycle:scope-summary [--surface <glob>]       — "how many pending in my surface?" query
/dw-lifecycle:check-clones [--gate-mode]             — manual clone-detector run
/dw-lifecycle:check-anti-patterns [--gate-mode]      — manual anti-pattern scan
/dw-lifecycle:check-deprecations [--write]           — regenerate deprecation queue
/dw-lifecycle:check-adopters [--gate-mode]           — adopter-manifest holdout check
/dw-lifecycle:check-editor-symmetry [--write]        — regenerate editor-symmetry matrix
/dw-lifecycle:check-refactor-preconditions [--gate]  — Step 0 schema validator
/dw-lifecycle:dispose-clone <id> --as <d> [args]     — disposition a clone group
/dw-lifecycle:refresh-clones-baseline                — re-run detector + update clones.yaml
/dw-lifecycle:install-scope-discovery                — bootstrap config dir + schemas
/dw-lifecycle:install-scope-discovery-hooks          — write pre-commit + Husky scaffold (opt-in)
/dw-lifecycle:install-agent-prompts                  — install §Step 0 mirrors into .claude/agents/
/dw-lifecycle:uninstall-scope-discovery-hooks        — manifest-driven hook removal
/dw-lifecycle:migrate-from-pilot                     — audiocontrol-specific (pilot → canonized migration)
/dw-lifecycle:validate-scope-discovery               — run adversarial validator harnesses
/dw-lifecycle:scope-export [--json]                  — emit current state (clones + anti-patterns + holdouts + summary) for external consumption
```

### The four discovery agents (universal core)

Plugin-shipped at `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/`:

| Agent | Universality | Customization |
|---|---|---|
| `ui-route-enumerator` | React-Router-specific default | Operator overrides for Vue Router / Next.js / SolidStart / SvelteKit / etc. via `/dw-lifecycle:customize scope-discovery discovery-agents/ui-route-enumerator` |
| `ast-grep-matrix` | Universal patterns (any-type, ts-ignore, magic numbers); curated pattern list configurable per project | Pattern list at `.dw-lifecycle/scope-discovery/ast-grep-patterns.yaml`; individual scanner overridable per file |
| `clone-detector-reader` | Universal — reads project's `clones.yaml` | No override needed; reads project config directly |
| `prd-themed-pattern-hunter` | Universal — operates on PRD frontmatter + body | Stopword list + top-N tunable via project config |

Plus a synthesis pass at `synthesis.ts` that folds the four agents' JSON outputs into a `scope-manifest.yaml` validated by `scope-manifest.schema.json`.

### Config-activated discovery agents (audiocontrol-style)

Additional discovery agents ship in the plugin, activate only when project config carries the relevant entries:

| Agent | Activation |
|---|---|
| `regime-holdout-detector` | Activates only if `.dw-lifecycle/scope-discovery/anti-patterns.yaml` OR `.../adopter-manifests.yaml` has entries. Synthesizes the four scan types (anti-pattern, adopter-manifest, editor-symmetry, deprecation) into a `regime_holdouts:` section on the scope manifest. |
| `editor-symmetry-scanner` | Activates only if `.dw-lifecycle/scope-discovery/editor-symmetry.md` exists with manifest entries. Renders the fleet-matrix view across `modules/*-editor/` (or per-project equivalent). |
| `adopter-manifest-checker` | Activates only if `adopter-manifests.yaml` has entries. Checks files matching each primitive's adopter glob for canonical-`from` imports; surfaces holdouts. |

Adopters without parallel editor modules or primitive-migration tracking pay no cost for these agents (they no-op).

### v2 enhancement-class discovery agents (captured for future expansion)

Per the pilot's "Honest limitations (v1)" section:

| Agent | Catches |
|---|---|
| `dom-visual-walker` | Layout density, scrollbar-induced layout shift, clipped-element edges (Playwright-driven) |
| `a11y-audit` | Focus order, ARIA semantics, keyboard nav (axe-core) |
| `vestigial-copy-audit` | Strings that no longer apply |
| `component-roster` | Sub-components below route surfaces |

Each is its own subsequent feature. The plugin's discovery-agent interface is designed to accept additional agents without API changes; new agents register themselves at startup.

### Dispatch wrapper extension model

| Model | What it does | V1 status |
|---|---|---|
| **Library API** | Plugin exports `wrap(agentType, prompt, options)` from `@dw-lifecycle/scope-discovery/dispatch-wrapper`; orchestrator imports + calls explicitly | Ships in v1 (matches pilot) |
| **Skill-prose convention** | Plugin ships `dispatch-wrapper-prelude.md` template that orchestrator skills include in sub-agent prompts | Ships in v1 as supplement |
| **Plugin-extension-point intercept** | Would auto-wrap every Agent tool invocation in adopter projects | Captured under § Future Work — depends on upstream Claude Code extension point |

The wrapper enforces:

1. `Searched / Included / Excluded` return grammar (rejects on missing labels).
2. If `Searched: count > 1` and `Included: 1`, `Excluded:` must enumerate the omitted matches.
3. No `Excluded:` reason contains a forbidden-deferral phrase (`"for now"`, `"TODO"`, `"fix later"`, `"until F<n>"`, etc.).
4. When the dispatched task carries a refactor marker (`Closes clones.yaml` / `refactor disposition` / `disposition: refactor` / `extraction commit` / literal `canonical_side` reference), appends the `REFACTOR_PRECONDITIONS_CHECKLIST` prelude.

Forbidden-phrase list sourced from `.claude/rules/agent-discipline.md` §"'Just for now' is bullshit" — the wrapper mechanically enforces what that rule names. Adopters whose `agent-discipline.md` differs can override the forbidden-phrase list via `.dw-lifecycle/scope-discovery/forbidden-deferral-phrases.yaml`.

### Step 0 (Refactor Preconditions)

| Component | Where |
|---|---|
| Schema validator (`clones-yaml.refactor.ts`) | Plugin module; runs via `dw-lifecycle check-refactor-preconditions` |
| Refactor disposition requirement | `canonical_side` + `canonical_reason` (Step 0a, four branches) AND `tests` + `tests_proof.sha` + `tests_proof.demonstration` (Step 0b, three branches) |
| Enforcement | Parse-time (schema validator) + commit-time (pre-commit hook) + dispatch-time (wrapper prelude) |
| `/dw-lifecycle:dispose-clone --as refactor` | Refuses without `--canonical-side` + `--tests-proof` flags OR interactive prompt elicits them |
| Canonical fragment | Plugin ships `refactor-preconditions-checklist.md`; static agent-prompt mirrors generated from it; drift checked by `/dw-lifecycle:doctor` |

Step 0a's four branches: (i) one side has documented regime → that side is canonical; (ii) all sides correctly migrated → extract into a new shared primitive; (iii) no side is canonical → name the new shape before extraction; (iv) cannot decide → disposition as `keep-with-reason` pending regime clarification.

Step 0b's three branches: (i) regression-detecting tests exist with recorded proof-of-detection; (ii) tests exist but no recorded proof → create the proof first (deliberately break canonical-side, capture failure, restore); (iii) no tests exist → write tests first, then proof-of-detection commit.

### Schemas

V1 ships the audiocontrol pilot's schemas verbatim, expressed as JSON Schema at `plugins/dw-lifecycle/src/scope-discovery/schema/`:

- `clones.yaml.schema.json` — `id` (content-hashed), `members [file:line]`, `lines`, `disposition` (`refactor` / `keep-with-reason` / `ignore-with-justification`), `reason`; refactor-specific: `canonical_side`, `canonical_reason`, `tests`, `tests_proof`, `new_shape_summary`
- `anti-patterns.yaml.schema.json` — `id`, `pattern_type` (`glob` / `regex` / `ast-grep` / `ts-morph`), `pattern` (type-specific value), `canonical_replacement`, `severity` (`blocks` / `warns`), `reason`
- `adopter-manifests.yaml.schema.json` — primitive id, expected adopter `glob`, `exceptions:` (permanent opt-outs), `tracked_holdouts:` (deferred-but-known migrations with required `path` + `issue` + `reason`)
- `migration-map.yaml.schema.json` — id, from-primitive, to-primitive, plan, in-flight migrations
- `scope-manifest.yaml.schema.json` — per-feature manifest produced by `/scope-inventory`
- `config.yaml.schema.json` — `.dw-lifecycle/scope-discovery/config.yaml` with `schemaVersion` integer + per-agent activation flags + per-project tunables

`editor-symmetry.md` and `deprecation-queue.md` are markdown-with-tables generated by their respective scanners; not schema-validated (regenerable from CODE + CONFIG).

### Anti-pattern pattern types

| Type | Cost | When |
|---|---|---|
| `glob` | Cheapest | File-name patterns (e.g., "any `*-OLD.ts` file") |
| `regex` | Cheap | Content-naive token matches (e.g., "any line containing `as any`") |
| `ast-grep` | Mid | Syntactic pattern with one tree-walk cost |
| `ts-morph` | Most expensive | Full TypeScript AST query with type info |

Each anti-pattern declares its `pattern_type`; the scanner dispatches accordingly. V1 ships all four mechanisms. Operators write entries declaring which mechanism applies.

### CLI subcommands replace Makefile targets

The pilot uses Makefile targets (`make scope-inventory FEATURE=<slug>`, `make refresh-clones-baseline`, `make check-deprecations-write`, etc.). dw-lifecycle CLI subcommands replace these; adopters don't need a Makefile to use the protocol. Each CLI subcommand has a corresponding skill prose entry (per the existing dw-lifecycle skill-vs-CLI parity convention).

### Pre-commit hook scaffold

`/dw-lifecycle:install-scope-discovery-hooks` writes the hook into the adopter project:

- Writes `.githooks/pre-commit` (creates if absent; offers `--merge` / `--replace` / `--force` if existing).
- Registers with Husky if `package.json` has Husky config.
- Hook invocations: `dw-lifecycle check-clones --gate-mode`, `dw-lifecycle check-anti-patterns --gate-mode`, `dw-lifecycle check-refactor-preconditions --gate-mode`. Each subcommand exits non-zero on gate violations.
- Records install state in `.dw-lifecycle/scope-discovery/hooks-installed.json` for `/dw-lifecycle:uninstall-scope-discovery-hooks` idempotency.
- Plugin documents a `.github/workflows/scope-discovery.yml` exemplar for adopters wanting CI gates.

### Static agent-prompt mirrors

The pilot installs §"Step 0 verification" sections into `.claude/agents/code-reviewer.md` + `.claude/agents/codebase-auditor.md`. The plugin's install skill does the same with operator opt-in:

- `/dw-lifecycle:install-agent-prompts` writes the §"Step 0 verification" sections.
- Refuses if existing prompts don't carry an expected dw-lifecycle marker; `--merge` appends; `--force` overwrites.
- Source of truth: `refactor-preconditions-checklist.md` (plugin-shipped). Mirrors are generated from it.
- `/dw-lifecycle:doctor` checks for mirror drift; `/dw-lifecycle:install-agent-prompts --refresh` regenerates from canonical source.

### Validator suite + gutted-stub self-check

The pilot's adversarial validator harnesses port verbatim:

- `clone-detector.validate.ts` — 4 scenarios incl. gutted-stub
- `dispatch-wrapper.validate.ts` — 43 scenarios incl. two-level gutted-stub
- `anti-patterns.validate.ts`
- `refactor-preconditions.validate.ts` (covers Step 0a × 4 branches + Step 0b × 3 branches)

Each suite's gutted-stub self-check: the harness feeds a stub of the gate's logic through the assertions and FAILS if the stub correctly passes. If someone gutted a gate's actual logic, the validator catches it.

Plugin exposes `dw-lifecycle validate-scope-discovery` to run the harnesses; adopters use this to verify their installed gates have teeth.

## Real-world validation case: graphical-entries

The deskwork-side `graphical-entries` feature (spec at `docs/superpowers/specs/2026-05-16-graphical-entries-design.md`, currently at Drafting revision 6, not yet `/dw-lifecycle:setup`'d) becomes the first real-world test case for the canonized scope-discovery protocol.

### Sequencing constraint

scope-discovery v1 ships BEFORE `graphical-entries` enters implementation. The two features are temporally coupled:

```
scope-discovery design (this spec) → approve → ship v1 → install in deskwork
  ↓
graphical-entries /dw-lifecycle:setup (which auto-runs /scope-inventory)
  ↓
graphical-entries implementation proceeds with the protocol active end-to-end
```

If scope-discovery v1 isn't ready when graphical-entries needs to start implementation, the canary doesn't run — graphical-entries proceeds without the protocol, scope-discovery loses its first dogfood opportunity.

### What scope-discovery exercises against graphical-entries

The protocol's components map onto graphical-entries' design surface:

| Component | What it exercises on graphical-entries |
|---|---|
| `/dw-lifecycle:scope-inventory graphical-entries` | Fans the four discovery agents across the deskwork codebase. Expected to surface: every hardcoded reference to the canonical eight stages (`Ideas / Planned / Outlining / Drafting / Final / Published / Blocked / Cancelled`) that needs to become template-driven under the new lanes model; every reader of the `comment` annotation type that needs to handle the new optional `replyTo` / `attachments` / `spatialAnchor` fields; every studio route that needs to compose with the new graphical review surface; every CLI helper that reads `currentStage` enum values. |
| `/dw-lifecycle:scope-widen "the graphical review surface must serve mockups without chrome on iOS AND desktop equally"` | Should reveal both viewport's render paths in the studio review surface, including the runtime-cache delivery layer (per the just-shipped `#272` lesson — five layers between npm tarball and iPhone). |
| Anti-patterns registered for deskwork | Hardcoded stage references (which the lanes feature explicitly retires); single-pipeline assumptions in stage-list iteration code; legacy `reviewState` references (per `DESKWORK-STATE-MACHINE.md` Commandment III — vestigial schema type still exists); studio surfaces that assume `host` is required (per the deskwork CLAUDE.md "collections of markdown content, not websites" principle). |
| Step 0 enforcement on lane-refactor clones | As `graphical-entries` refactors the single-pipeline assumption, every clone group the refactor touches gets `canonical_side` (Step 0a) + `tests_proof` (Step 0b) recorded before extraction lands. Real refactor work exercises the gate naturally. |
| Dispatch wrapper on graphical-entries' sub-agent dispatches | Each graphical-entries implementation task that dispatches a specialist agent (`typescript-pro` for the schemes module, `documentation-engineer` for new SKILL.md prose, `feature-orchestrator` for phased delivery) passes through the wrapper. The wrapper's `Searched/Included/Excluded` enforcement on every dispatch verifies the agents enumerate siblings before writing code. |
| `/dw-lifecycle:scope-summary --surface "plugins/deskwork-studio/public/src/**"` | Quick "how many pending clones touch the studio?" check for an operator working on graphical-entries' studio surface. |

### Coverage matrix deliverable

V1's validation produces `docs/<v>/001-IN-PROGRESS/scope-discovery/paper-test-graphical-entries.md` — analogous to the pilot's `paper-test-s550.md`. The matrix lists every documented surface graphical-entries will touch, and for each surface records whether `/scope-inventory` + `/scope-widen` + the anti-patterns scanner surfaced it. The combined coverage number (analogous to the pilot's 87.5%) is the v1 acceptance signal: if scope-discovery's first real dogfood catches < ~80% of graphical-entries' documented surfaces, the protocol needs design refinement before ship.

### Deskwork-as-adopter migration

The deskwork repo's install flow:

1. dw-lifecycle releases scope-discovery v1.
2. `/dw-lifecycle:install-scope-discovery` from `/Users/orion/work/deskwork`: bootstraps `.dw-lifecycle/scope-discovery/` with empty `clones.yaml` / `anti-patterns.yaml` + schemas + README pointer.
3. `/dw-lifecycle:refresh-clones-baseline` runs the clone detector against the deskwork codebase, produces the initial dispositioned baseline (every entry initially un-dispositioned). Operator drains the backlog over time (likely as part of graphical-entries' refactor work — the in-flight feature naturally touches many of the clone groups).
4. Operator authors `anti-patterns.yaml` entries for the deskwork-specific patterns named above (hardcoded stages, legacy reviewState, etc.).
5. `/dw-lifecycle:install-scope-discovery-hooks` wires the pre-commit gate.
6. `/dw-lifecycle:install-agent-prompts` writes the §Step 0 mirrors into the deskwork project's `.claude/agents/` (if those exist; the deskwork project's agent definitions live elsewhere — verify before install).
7. `/dw-lifecycle:setup graphical-entries` (this is the canary) auto-runs `/scope-inventory`; operator reviews the resulting manifest.

## Migration

Three adopter cases:

| Adopter | Migration path |
|---|---|
| **Audiocontrol (the pilot's home)** | `/dw-lifecycle:migrate-from-pilot` reads existing `tools/scope-discovery/` + `docs/scope-discovery/`. Copies CONFIG (the YAMLs) into `.dw-lifecycle/scope-discovery/` verbatim. Diffs the audiocontrol-side CODE against plugin defaults; surfaces each project-specific extension as either (a) operator-elected customize override, or (b) candidate contribution back to the plugin. Pre-commit hook updated to call `dw-lifecycle` subcommands instead of `make` targets. Audiocontrol's `tools/scope-discovery/` is archived (kept as historical reference) once parity is confirmed. |
| **Deskwork (mid-feature install, the canary)** | Greenfield install path against the existing deskwork codebase, mid-graphical-entries-implementation. Baselines start empty; operator drains incrementally; anti-patterns added as the operator identifies them. graphical-entries' `/dw-lifecycle:setup` exercises the canonized protocol end-to-end. |
| **Greenfield adopter** | `/dw-lifecycle:install-scope-discovery` creates empty config dir + schemas + README pointer. First clone-detector run produces baseline; operator dispositions over time. Anti-patterns + adopter-manifests populated incrementally as the project grows. |

## Data model summary

### New on-disk files

```
<projectRoot>/.dw-lifecycle/scope-discovery/
├── config.yaml                          # schemaVersion + per-agent activation + tunables
├── clones.yaml                          # dispositioned clone-group baseline
├── anti-patterns.yaml                   # project-registered anti-patterns
├── adopter-manifests.yaml               # primitive-adopter expectations (optional)
├── migration-map.yaml                   # in-flight migrations (optional)
├── editor-symmetry.md                   # fleet-matrix view (generated; optional)
├── deprecation-queue.md                 # @deprecated tracker (generated; optional)
├── ast-grep-patterns.yaml               # tunable pattern list for ast-grep-matrix
├── forbidden-deferral-phrases.yaml      # overrides dispatch-wrapper phrase list (optional)
├── hooks-installed.json                 # install provenance for clean uninstall
└── discovery-agents/                    # project overrides of individual plugin defaults
    └── <agent-name>.ts                  # e.g., ui-route-enumerator.ts (Vue Router override)
```

Plus per-feature artifacts at `docs/<v>/001-IN-PROGRESS/<slug>/scope-inventory/runs/<stamp>-<runId>/`.

## Studio implications

dw-lifecycle has no studio surface today. If a dw-lifecycle studio ever lands, the `clones.yaml` backlog is the obvious first render: sortable table with disposition actions per row, gated state-machine for Step 0a / Step 0b inline editing. Captured as future work.

## Doctor rules

New rules added to `/dw-lifecycle:doctor`:

- `scope-discovery-config-missing` — `.dw-lifecycle/scope-discovery/config.yaml` absent; surface install hint.
- `scope-discovery-schema-stale` — config's `schemaVersion` is older than plugin's current; surface migration steps.
- `clones-yaml-schema-violation` — entry fails clones.yaml schema validation.
- `clones-yaml-refactor-incomplete` — `disposition: refactor` entry missing Step 0a / Step 0b fields.
- `anti-patterns-yaml-schema-violation` — entry fails anti-patterns schema validation.
- `mirror-drift` — agent-prompt mirror in `.claude/agents/` doesn't match canonical fragment.
- `override-drift` — project's per-file scanner override diverges from plugin default by > N lines (operator advisory; not an error).
- `hooks-installed-missing` — `hooks-installed.json` references files that no longer exist (pre-commit hook deleted manually); surface re-install hint.

## Skill changes

- **NEW:** `/dw-lifecycle:scope-inventory`, `/dw-lifecycle:scope-widen`, `/dw-lifecycle:scope-summary`, `/dw-lifecycle:check-clones`, `/dw-lifecycle:check-anti-patterns`, `/dw-lifecycle:check-deprecations`, `/dw-lifecycle:check-adopters`, `/dw-lifecycle:check-editor-symmetry`, `/dw-lifecycle:check-refactor-preconditions`, `/dw-lifecycle:dispose-clone`, `/dw-lifecycle:refresh-clones-baseline`, `/dw-lifecycle:install-scope-discovery`, `/dw-lifecycle:install-scope-discovery-hooks`, `/dw-lifecycle:install-agent-prompts`, `/dw-lifecycle:uninstall-scope-discovery-hooks`, `/dw-lifecycle:migrate-from-pilot`, `/dw-lifecycle:validate-scope-discovery`, `/dw-lifecycle:scope-export`.
- **UPDATED:** `/dw-lifecycle:define` (auto-runs scope-inventory; `--no-scope-inventory` opts out), `/dw-lifecycle:implement` (auto-runs scope-widen; sub-agent dispatches wrapped; `--no-scope-widen` opts out), `/dw-lifecycle:review` (auto-runs clone detector; `--no-clone-check` opts out), `/dw-lifecycle:doctor` (new rules per § Doctor rules above), `/dw-lifecycle:customize` (supports `scope-discovery <name>` category).

## Testing

- **Unit (vitest).** Schema validators, scanners (clone detector, anti-patterns scanner, deprecation scanner, adopter-manifest checker, editor-symmetry scanner, refactor-preconditions validator), discovery agents (the four universal + the three config-activated), dispatch wrapper.
- **Adversarial validator harnesses with gutted-stub self-check.** Ported verbatim from the pilot: `clone-detector.validate.ts` (4 scenarios), `dispatch-wrapper.validate.ts` (43 scenarios), plus equivalents for the other gates. Self-check pattern: each harness includes a stub of the gate; assertions fail if the stub correctly passes.
- **Integration (vitest with tmp project fixtures).** Tmp project with seeded `clones.yaml` / `anti-patterns.yaml` / etc.; exercise `/dw-lifecycle:scope-inventory`, `/dw-lifecycle:check-clones`, `/dw-lifecycle:dispose-clone`, `/dw-lifecycle:install-scope-discovery-hooks`, `/dw-lifecycle:install-agent-prompts` end-to-end against the fixture.
- **Real-world validation: graphical-entries paper-test.** `docs/<v>/001-IN-PROGRESS/scope-discovery/paper-test-graphical-entries.md` produces the coverage matrix against graphical-entries' documented surfaces (analogous to the pilot's `paper-test-s550.md`). Combined coverage > ~80% is the v1 acceptance signal.
- **No CI changes** per the deskwork project rule "No test infrastructure in CI." Local `npm --workspace @deskwork/plugin-dw-lifecycle test` is the gate.

## Risks

- **Adopter overhead.** `/scope-inventory` fans four (or five with regime-holdout-detector) discovery agents in parallel per `/dw-lifecycle:define`. On a large codebase the agents take real time. Mitigation: opt-out flag, plus the auto-invocation is conditional on the feature being system-wide (skill prose surfaces the option when the operator's feature definition mentions cross-cutting concerns).
- **Plugin-vs-pilot drift during migration.** The audiocontrol pilot's CODE has accumulated bug fixes and project-specific tweaks the canonization may lose. Mitigation: `/dw-lifecycle:migrate-from-pilot` produces a diff report per file; operator reviews each project-specific extension as either contribute-back or customize-override.
- **Schema evolution.** The pilot's schemas may need refinements once the canonized plugin sees real adopter use. Mitigation: `schemaVersion` integer on `config.yaml`; doctor flags adopters on stale schemas; migration scripts ship per minor schema bump.
- **Pre-commit hook conflicts.** Adopters with existing `.githooks/pre-commit` content can't have the dw-lifecycle gates auto-installed without merge logic. Mitigation: `--merge` / `--replace` / `--force` flags + interactive prompt + hooks-installed.json provenance.
- **Mirror drift between plugin-shipped checklist and adopter agent-prompts.** If adopters hand-edit their `.claude/agents/*.md` mirrors and the canonical fragment evolves, the mirrors drift. Mitigation: `/dw-lifecycle:doctor` flags drift; `/dw-lifecycle:install-agent-prompts --refresh` regenerates.
- **graphical-entries canary scope risk.** If scope-discovery v1 doesn't ship before graphical-entries needs to start implementation, the canary fails to run and v1 loses its acceptance signal. Mitigation: this spec's § Implementation phases is sequenced so the dw-lifecycle plugin updates ship first; graphical-entries' `/dw-lifecycle:setup` waits.
- **Dispatch wrapper requires orchestrator cooperation.** Until upstream Claude Code adds a plugin-extension intercept, the wrapper only engages when the orchestrator explicitly calls `wrap()`. Orchestrators that forget bypass the gate silently. Mitigation: skill-prose convention complements the library API; pre-commit hook catches the resulting missed-clone artifact even if dispatch wasn't wrapped; `/dw-lifecycle:doctor` checks updated `/dw-lifecycle:*` skills for `wrap()` invocation.

## Implied scope captured

Per the `Capture mode vs scope mode` rule, items below are designed so the operator can scope explicitly. v1 may include all, some, or only the audiocontrol-pilot subset. Capture without pre-scope.

- **Cross-language scanner plug-in points.** v1 scanners are TypeScript-only. Plug-in points exist for `.go` / `.py` / `.rs` / `.kt` / `.java`; adopters add language packs via `/dw-lifecycle:customize scope-discovery scanners/<lang>`.
- **Custom forbidden-deferral phrase list per project.** Default sourced from `.claude/rules/agent-discipline.md`; project override at `.dw-lifecycle/scope-discovery/forbidden-deferral-phrases.yaml`.
- **Dispatch wrapper test surface for adopters.** Plugin includes a test harness for adopters to write project-specific dispatch-wrapper tests against their own orchestrators; the audiocontrol 43-scenario harness is the exemplar.
- **Custom discovery agents.** Operators write new agents at `.dw-lifecycle/scope-discovery/discovery-agents/<name>.ts`; the synthesis pass picks them up at startup. v1 design covers this; pattern documented in plugin docs.
- **Scope-manifest schema evolution.** v1 ships schema v1; future feature work likely adds fields (e.g., for v2 enhancement-class agents). `schemaVersion` integer + migration scripts handle evolution.
- **`/scope-inventory` agent-fleet parallelism.** Agents fan out in parallel per the existing `dispatching-parallel-agents` skill discipline; no new mechanism needed.
- **`paper-test-<feature>.md` coverage matrix as a standard deliverable.** Plugin includes a template for adopters to produce per-feature coverage matrices against historical incidents; helps calibrate whether the protocol's surface catches the bugs it exists to catch.
- **Hooks-installed manifest with version provenance.** Records dw-lifecycle plugin version that wrote each installed file; enables clean uninstall + upgrade migration.
- **Override drift reporting.** `/dw-lifecycle:doctor` reports drift > N lines between project per-file overrides and plugin defaults; operator advisory (not error).
- **Adopter-friendly README + LAYOUT.md + refactor-preconditions-checklist.md.** Plugin ships these as templates copied into `.dw-lifecycle/scope-discovery/docs/` on install; operators may override locally.
- **`/dw-lifecycle:scope-export --json`.** Emit current state (clones + anti-patterns + holdouts + summary) for external consumption (dashboards, multi-repo rollups, monitoring tools).
- **CI workflow exemplar.** `.github/workflows/scope-discovery.yml` exemplar shipped in plugin docs; adopters copy into their `.github/workflows/` and tune.
- **Drift detection between dw-lifecycle defaults and audiocontrol's project-specific extensions during migration.** Surfaced by `/dw-lifecycle:migrate-from-pilot` as a per-file report; operator chooses contribute-back vs customize-override per extension.
- **Studio surface for clones backlog (deferred).** If dw-lifecycle ever ships a studio, the `clones.yaml` backlog is the obvious first render.
- **Cross-repo rollup view (deferred).** Multi-repo organizations consuming `scope-export --json` from each repo into a single dashboard; plugin enables the data layer, the UI is downstream.

## Implementation phases (high-level)

The implementation decomposes into ~10 phases. Setup will scaffold a workplan from these. Numbers are approximate phase sizes, not commitments. Acceptance criterion for v1 is the graphical-entries canary running cleanly + paper-test coverage > ~80%.

1. **Plugin-side scanner core: clone detector + jscpd-runner + clones.yaml parser/writer.** Port verbatim from pilot; unit tests + gutted-stub self-check.
2. **Anti-patterns + refactor-preconditions + adopter-manifests scanners.** Port verbatim from pilot; unit + adversarial tests.
3. **The four universal discovery agents + synthesis pass.** Port + generalize (UI-route-enumerator becomes React-Router-default + override-able). Schema validation for scope-manifest.
4. **Config-activated discovery agents (regime-holdout-detector, editor-symmetry-scanner, adopter-manifest-checker).** Port with activation conditional on project config.
5. **Dispatch wrapper + skill-prose convention template.** Library API verbatim from pilot; prelude template shipped as plugin asset.
6. **CLI subcommands.** All ~20 new CLI verbs land; each invokes its corresponding scanner / discovery agent / writer.
7. **Slash command skill prose.** SKILL.md files for each of the ~18 new + 5 updated `/dw-lifecycle:*` skills.
8. **Install / migrate / uninstall machinery.** `/dw-lifecycle:install-scope-discovery`, `/dw-lifecycle:install-scope-discovery-hooks`, `/dw-lifecycle:install-agent-prompts`, `/dw-lifecycle:migrate-from-pilot`, `/dw-lifecycle:uninstall-*`. Hooks-installed manifest. README + LAYOUT.md templates.
9. **Doctor rule additions.** Schema validation rules + mirror-drift / override-drift / hooks-installed-missing.
10. **deskwork canary install + graphical-entries paper-test deliverable.** Install scope-discovery in the deskwork repo; populate baselines; run `/dw-lifecycle:setup graphical-entries` (auto-invoking `/scope-inventory`); produce `paper-test-graphical-entries.md` coverage matrix. Acceptance signal: ~80% combined coverage.

## Companion references

- **Audiocontrol pilot's canonical README** — `/Users/orion/work/audiocontrol-work/audiocontrol-scope-discovery-protocol/docs/scope-discovery/README.md` (314 lines). Source of truth for protocol semantics.
- **Audiocontrol pilot's CODE** — `/Users/orion/work/audiocontrol-work/audiocontrol-scope-discovery-protocol/tools/scope-discovery/` (~30 TypeScript files). Source for verbatim port.
- **Audiocontrol pilot's CONFIG** — `/Users/orion/work/audiocontrol-work/audiocontrol-scope-discovery-protocol/docs/scope-discovery/` (YAMLs + markdown trackers). Source for schema design.
- **Pilot's motivating analysis** — `~/work/audiocontrol-work/audiocontrol-scope-discovery-protocol/docs/analysis/s550-redesign-scope-discovery.md`. The 5-day brute-force tail that motivated the protocol.
- **Pilot's coverage paper-test** — `~/work/audiocontrol-work/audiocontrol-scope-discovery-protocol/docs/1.0/001-IN-PROGRESS/scope-discovery-protocol/paper-test-s550.md`. Template for the graphical-entries equivalent.
- **dw-lifecycle's existing customize pattern** — `plugins/dw-lifecycle/skills/customize/SKILL.md`. The override-seam pattern this design extends to `scope-discovery <name>` category.
- **THESIS Consequence 3** — `THESIS.md`. The override-resolver pattern this design honors.
- **Capture-mode rule** — `.claude/rules/agent-discipline.md` §"Capture mode vs scope mode". The rule this spec adheres to (no pre-scoping; full design capture).
- **'Just for now' is bullshit rule** — `.claude/rules/agent-discipline.md` §"'Just for now' is bullshit". The rule the dispatch wrapper's forbidden-phrase list mechanically enforces.
- **graphical-entries design spec** — `docs/superpowers/specs/2026-05-16-graphical-entries-design.md`. The real-world validation case (canary).
- **DESKWORK-STATE-MACHINE.md** — `DESKWORK-STATE-MACHINE.md`. The canonical pipeline contract the lanes feature retires; surfaces in scope-discovery's anti-patterns for the deskwork-as-adopter install.

## Open questions

None blocking. The implementation phasing's order is sequenced for the graphical-entries canary; sub-decisions inside each phase (e.g., exact CLI flag naming, exact migration helper UX) are workplan-time concerns.
