# Implementation Plan: Post-Install Project Setup (project-doc-setup)

**Branch**: `feature/stack-control` (one long-lived program branch) | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-project-doc-setup/spec.md`

## Summary

Deliver a `stackctl setup` verb (and a thin `/stack-control:setup` skill over it) that scaffolds a stack-control **installation** — the governed working files the `inbox`/`roadmap`/`backlog`/governance verbs require — into an adopter project, plus the **shared installation-config + resolver** those verbs read through. Today every verb hardcodes its working file to the plugin-bundled copy (`DEFAULT_DOC` in `inbox.ts`/`roadmap.ts`, `backlogRoot()`, `grammarDirs()`), with code comments saying *"until `design:gap/project-relative-doc-discovery` lands"*. This feature lands it.

The load-bearing piece is a single **config + resolution port** exercised by **two concrete instances in this feature** (constitution Principle II — an abstraction is trusted only once two real instances flow through it): the **create-side** (`setup` writes the config + scaffolds files) and the **read-side** (the existing verbs resolve their working file *through* the same config). Resolution is an **upward directory walk** from the invocation context to the nearest `.stack-control/config.yaml` (config presence marks the installation root — surface-agnostic: a directory today, a client root later), then **per-file override > base dir > audience-split default** for each working file. Setup is **non-destructive + idempotent**, reachable both explicitly and **auto-on-first-use** (announced, contentless), and **fails loud** on malformed files, ambiguous roots, and cross-installation collisions. The audit log is **two-tier**: setup scaffolds the program-level log; per-feature logs (`specs/<feature>/audit-log.md`) are the feature lifecycle's job.

The in-repo dogfood is the strongest test: `plugins/stack-control` becomes a real installation with a repo-root `.stack-control/config.yaml` whose per-file overrides record its *actual* (scattered) layout — proving configurable locations on a messy real tree.

## Technical Context

**Language/Version**: TypeScript (strict), executed via `tsx` (Node ≥20) — matches the existing plugin.

**Primary Dependencies**:
- Existing in-tree: `yaml` (already used by the audit-barrage `config-loader.ts` — the precedent this feature mirrors for load+validate); the `document-model` engine (roadmap/inbox parsers, for empty-but-valid scaffolds + verify); `repo.ts` git helpers.
- External (reused from 008, NOT new): the `backlog` binary, for the backlog store skeleton via the deterministic `filesystem_only` config (no interactive `backlog init`).
- No new runtime dependency.

**Storage**: per-installation governed working files on disk (markdown + a YAML store), bound by one `.stack-control/config.yaml` per installation (its presence marks the root). The config is the authoritative input to resolution; no database.

**Testing**: Vitest. Integration tests build real installation trees in tmp dirs (testing rule: never mock the filesystem) and run the actual verbs against the scaffolds; the backlog skeleton is exercised against the real `backlog` binary. RED-first per Principle I.

**Target Platform**: `stackctl` CLI (Node), runnable by any agent or human in a plain shell — no Claude Code surface required (FR-025/SC-009).

**Project Type**: single project (the stack-control plugin; CLI tool).

**Performance Goals**: setup is a handful of local file writes + one backlog-store init + a verify pass (sub-second). The upward walk is O(depth) stat calls. No throughput concern.

**Constraints**: no fallbacks / fail-loud (Principle V) — a missing config (run outside any installation), an ambiguous/colliding location, or a malformed working file raises a descriptive error naming the artifact + remediation, never a silent bundled-copy fallback or false-clean report; non-destructive (never overwrite existing content — content-hash invariant); no network/secrets/interactive input (FR-014); files ≤ 500 lines (Principle VI); no `any`/`as`/`@ts-ignore`.

**Scale/Scope**: a handful of working files per installation; a repo holds a small number of installations. The per-feature audit-log partition keeps any single log bounded (the size-control decision).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How this plan satisfies it |
|---|---|---|
| I. Test-First (NON-NEGOTIABLE) | ✅ | Every unit RED-first: the upward-walk resolver, path-precedence + collision refusal, config load/validate, each empty-but-valid scaffold (verified by running its consuming verb), non-destructive/idempotent setup, monorepo isolation, and auto-on-first-use parity. |
| II. Integration-First, No Speculative Building | ✅ **(load-bearing here)** | The config+resolution port is built from **two concrete instances inside this feature** — the create-side (setup writes) and the read-side (verbs resolve). It is NOT designed from one imagined use; the read-side wiring of `inbox`/`roadmap`/`backlog`/`grammars` is the second instance that proves the port. The in-repo dogfood config is a third real instance. |
| III. Branch on Capabilities, Never Provider Identity | ✅ (N/A axis) | No provider/plan-source branching. Resolution branches on a directory/context, never a vendor. |
| IV. Division of Labor | ✅ | deskwork owns the substrate it scaffolds (docs tree, config). Setup never writes back into a provider artifact; it reads the invocation context and writes deskwork-owned files only. |
| V. No Fallbacks / fail-loud | ✅ | Run-outside-installation, ambiguous root, location collision/escape, malformed working file → descriptive error; never a silent bundled-copy fallback, never a false-clean "ready" report. Auto-on-first-use is the only non-abort path and it is announced + contentless (FR-016). |
| VI. Strict Typing & Composition | ✅ | Composition: a pure resolver + pure path-resolution + scaffold writers + verify, injected into the `setup` verb and the verbs' read path. Interface-typed config. New modules each well under the cap. No `any`/`as`/`@ts-ignore`. |
| VII. Commit & Push Early and Often | ✅ | One logical change per commit (RED then GREEN), pushed at task boundaries; no AI attribution. |
| VIII. Faithful Tool Adoption | ✅ | Authored through the Spec Kit chain in order; reuses 008's deterministic backlog `filesystem_only` init rather than re-deriving; mirrors the audit-barrage `config-loader` pattern rather than inventing a new config style. |
| IX. Execution-Backend Pluggability | ✅ (N/A axis) | No execution engine/backends in this feature. |

**Result: PASS — no violations.** Complexity Tracking is empty.

### Scope-coordination note (surfaced, not decided)

FR-003 + SC-004 require the verbs' **read path** to resolve through the new config (otherwise "verbs work after setup" can't be demonstrated), and Principle II requires a second concrete instance through the port. So the read-side wiring that `design:gap/project-relative-doc-discovery` describes is **in scope here**. This likely **subsumes** that roadmap item. That is an operator/roadmap call — flagged for `/speckit-tasks` and a `roadmap reconcile`, not decided in this plan.

## Project Structure

### Documentation (this feature)

```text
specs/009-project-doc-setup/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions grounded in the existing resolution code
├── data-model.md        # Phase 1 — InstallationConfig schema, working-file set, resolution algorithm, setup report
├── quickstart.md        # Phase 1 — runnable validation scenarios (all 5 user stories + SC-009 plain-shell)
├── contracts/
│   ├── setup-cli.md      # Phase 1 — the `stackctl setup` verb contract
│   └── stackctl-config.md# Phase 1 — the `.stack-control/config.yaml` format + resolution contract (shared with read-side)
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
plugins/stack-control/
├── src/
│   ├── cli.ts                          # +register `setup: runSetupCli` in SUBCOMMANDS
│   ├── config/                         # NEW — the shared installation config + resolver (the Principle-II shared port)
│   │   ├── installation.ts             # upward-walk: (startDir) → nearest ancestor with .stack-control/config.yaml; nearest-wins; fail-loud on no-match
│   │   ├── config-loader.ts            # load + validate .stack-control/config.yaml (mirrors audit-barrage config-loader; YAML snake→camel)
│   │   ├── resolve-paths.ts            # per-file override > base > audience-split default; collision/escape detection (FR-024)
│   │   └── types.ts                    # InstallationConfig, WorkingFileKey, ResolvedInstallation
│   ├── setup/                          # NEW — create-side
│   │   ├── scaffold.ts                 # empty-but-valid skeleton writers per working-file key (shared by setup + auto-on-first-use)
│   │   ├── verify.ts                   # well-formedness check per working file (runs the consuming parser; fail-loud)
│   │   └── report.ts                   # created / already-present / skipped / malformed report shape
│   ├── subcommands/
│   │   ├── setup.ts                    # NEW — runSetupCli; --at <dir>; non-destructive; idempotent; verify; report; exit 0/2
│   │   ├── inbox.ts                    # MODIFIED — DEFAULT_DOC resolves via config/installation (read-side, FR-003); env seam kept
│   │   ├── roadmap.ts                  # MODIFIED — DEFAULT_DOC resolves via config/installation; env seam kept
│   │   └── document-verb-shared.ts     # MODIFIED — grammarDirs() resolves against the installation root, not raw cwd
│   └── backlog/
│       └── root.ts                     # MODIFIED — backlogRoot() resolves via config (STACKCTL_BACKLOG_DIR seam kept)
├── schema/
│   └── stackctl-config.yaml.schema.json# NEW — config wire-format schema (mirrors schema/audit-barrage-config.yaml.schema.json)
├── skills/setup/SKILL.md               # NEW — /stack-control:setup touch point (thin adapter over the CLI; capture≠scope N/A)
└── tests/
    ├── config/{installation,resolve-paths,config-loader}.test.ts   # resolver + precedence + collision + load/validate
    └── setup/{fresh,idempotent,configurable,monorepo,verify,auto-on-first-use}.test.ts  # US1–US5 + FR-015/016/017

# Repo-root dogfood artifact (NOT under plugins/):
.stack-control/config.yaml              # NEW — the in-repo installation's own config: root = repo root; per-file overrides record the
                                        #       actual scattered layout (ROADMAP.md/DESIGN-INBOX.md under plugins/stack-control/,
                                        #       program audit log under docs/.../). Proves configurable locations on a real tree.
```

**Structure Decision**: One new verb namespace, `stackctl setup`, plus a new `src/config/` module that is the **single shared resolution port** (the create-side `setup/` and the read-side verb wiring both depend on it — the two Principle-II instances). The config format and load/validate mirror the existing audit-barrage `config-loader.ts` + JSON-schema convention rather than inventing a new style; the backlog-store skeleton reuses 008's deterministic `filesystem_only` init. The in-repo dogfood gets a real repo-root config so the plugin's own verbs resolve through the new port (no bundled-copy special-case — that would violate Principle V).

## Complexity Tracking

> No constitution violations — no entries.
