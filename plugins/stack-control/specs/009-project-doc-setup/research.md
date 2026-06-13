# Research: Post-Install Project Setup (project-doc-setup)

Phase 0. All five Open Questions were resolved in `/speckit-clarify` (see spec § Clarifications), so there are **no `NEEDS CLARIFICATION` items** to resolve here. This document records the grounded design decisions (each traced to existing code or a clarification) plus the alternatives weighed.

## D1 — Config file & format: `.stack-control/config.yaml`

- **Decision**: One YAML config per installation at `<installation-root>/.stack-control/config.yaml`, validated against a new `schema/stackctl-config.yaml.schema.json`. Its **presence marks the installation root** (Clarification OQ-1).
- **Rationale**: Mirrors the established plugin convention — `src/scope-discovery/audit-barrage/config-loader.ts` already loads `.stack-control/audit-barrage-config.yaml` (project override) against a JSON schema, with snake_case wire → camelCase in-memory and fail-loud validation. `grammarDirs()` already references `.stack-control/grammars`. So `.stack-control/` is the existing per-project home; the installation config belongs there. Reusing the load/validate pattern avoids a second config style.
- **Alternatives**: a root marker file separate from config (rejected — two artifacts where one suffices; config presence is a sufficient marker); JSON or TOML (rejected — YAML is the plugin's config convention); a single repo-wide config listing installations (rejected — that's the registry model OQ-1 declined).

## D2 — Installation resolution: upward walk, surface-agnostic

- **Decision**: A new `src/config/installation.ts` resolves an installation from a **starting directory** by walking up to the nearest ancestor containing `.stack-control/config.yaml`. Nearest-wins on nesting; stop at the filesystem root; **fail loud** (descriptive error) when none is found. The function takes a directory argument (defaulting to `process.cwd()`), never a host-specific handle — surface-agnostic per FR-026.
- **Rationale**: Matches the mental model adopters already have (git/`tsconfig`/`package.json`). Distinct from the existing `repoRoot()` (which is `git rev-parse --show-toplevel`) because an installation root is NOT necessarily the git root — a monorepo holds several installations under one git root. The "context is a directory" shape is what lets a future MCP `roots` value flow through unchanged.
- **Alternatives**: explicit registry (OQ-1 B — rejected: bookkeeping + a second source of truth); per-invocation selector only (OQ-1 C — rejected: hostile default, though it remains available as an override later); reusing `repoRoot()` (rejected: wrong boundary for monorepos).

## D3 — Path resolution: per-file override > base dir > audience-split default

- **Decision**: `src/config/resolve-paths.ts` resolves each working-file key to an absolute path with precedence **per-file override > base directory > audience-split default** (Clarifications OQ-2/OQ-3). Audience-split defaults: human docs (`ROADMAP.md`, `DESIGN-INBOX.md`) at the installation root; internal stores (backlog, program audit log, the config itself) under `.stack-control/`. A pure function; collision/escape detection (FR-024) lives here.
- **Rationale**: A base-dir + per-file-override schema is the conventional config ergonomic and satisfies FR-018's full independence while keeping the common case a one-liner. Audience-split keeps human docs discoverable and machinery tidy (OQ-2).
- **Alternatives**: per-file-only (verbose common case); base-dir + fixed names (fails FR-018 independence); co-locate everything under `.stack-control/` (buries the human docs — OQ-2 A, rejected).

## D4 — Verb name & surfaces: `stackctl setup` + `/stack-control:setup`

- **Decision**: A `setup` subcommand (matching the feature/roadmap codename `project-doc-setup`), plus a thin `/stack-control:setup` skill that wraps it. The CLI is the sole capability path; the skill is an adapter (FR-025).
- **Rationale**: Consistent naming with the roadmap codename; mirrors dw-lifecycle's/deskwork's one-shot setup pattern while keeping the CLI-first, surface-agnostic contract (FR-025/SC-009). `--at <dir>` lets an operator target a specific installation root explicitly (and is how monorepo per-package setup is driven).
- **Alternatives**: `init` (rejected — `setup` matches the codename and avoids collision with `backlog`/git "init" connotations); skill-only (rejected — violates FR-025).

## D5 — Auto-on-first-use shares the scaffold path with explicit setup

- **Decision**: Extract the scaffold logic into `src/setup/scaffold.ts`, called by **both** `setup` and the verbs' read-path resolver when a working file is missing. On the auto path the verb **announces** what it created, creates only empty/contentless files, then proceeds (FR-015/016/017). Identical artifacts via the shared writer (FR-017).
- **Rationale**: One scaffolding code path guarantees explicit and lazy bootstraps are indistinguishable (FR-017) and keeps the fail-loud spirit (visible, contentless) while honoring the operator's chosen trigger model.
- **Alternatives**: separate lazy-create code (rejected — drift risk between the two paths); abort-on-missing only (rejected — operator chose explicit + auto).

## D6 — Empty-but-valid skeletons, proven by the consuming parser

- **Decision**: Each scaffold writes the **minimal structurally-valid** artifact its consumer accepts: empty governed roadmap (heading-keyed, zero items), empty governed inbox (including the source-registry structure its parser requires — cf. the missing-source-entry class, issue #433), empty backlog store (the 008 `filesystem_only` `backlog/config.yml` + dir), empty program audit log. Each skeleton's validity is asserted by a test that **runs the consuming verb against it** (verify reuses the same parser — FR-009).
- **Rationale**: "Structurally valid, not a blank file" (FR-002). The only trustworthy validity oracle is the consumer's own parser, so verify and the scaffold tests both go through it.
- **Alternatives**: hand-rolled templates checked by string match (rejected — drifts from the parser's real expectations; the #433 class shows blank files fail).

## D7 — Backlog store init reuses 008's deterministic `filesystem_only` equivalent

- **Decision**: Scaffold the backlog store by writing a `filesystem_only: true` `backlog/config.yml` (+ dir) exactly as 008 established, NOT by running the interactive, git-requiring `backlog init`.
- **Rationale**: 008 discovered `backlog init` is interactive and git-requiring; the hand-authored `filesystem_only` config is the verified deterministic equivalent (spec edge case + FR-008). Reuse keeps one mechanism.
- **Alternatives**: drive `backlog init` (rejected — interactive + git dependency violates FR-014/FR-008).

## D8 — Read-side wiring of the three current resolution points

- **Decision**: Replace the bundled-default resolution in `inbox.ts`/`roadmap.ts` (`DEFAULT_DOC`), `backlog/root.ts` (`backlogRoot()`), and `document-verb-shared.ts` (`grammarDirs()`) so each resolves through `src/config/installation.ts` + `resolve-paths.ts` when run inside an installation; **fail loud (no bundled-copy fallback)** when outside one. The existing env seams (`STACKCTL_INBOX_DEFAULT_DOC`, `STACKCTL_BACKLOG_DIR`) are preserved as test seams/overrides.
- **Rationale**: These three points carry code comments explicitly deferring to *"`design:gap/project-relative-doc-discovery`"* (AUDIT-20260609-06/12). This feature is that landing. Wiring the read path is required by FR-003/SC-004 and is the second Principle-II instance through the port.
- **Alternatives**: leave the verbs bundled-default and ship only the create-side (rejected — FR-003/SC-004 unmet; the port would be designed from one instance, violating Principle II).

## D9 — In-repo dogfood: `plugins/stack-control` as a real installation rooted at the repo root

- **Decision**: Add a repo-root `.stack-control/config.yaml` whose **per-file overrides record the dogfood's actual (scattered) layout** — `ROADMAP.md`/`DESIGN-INBOX.md` under `plugins/stack-control/`, the program audit log under `docs/1.0/.../`, the backlog under `plugins/stack-control/backlog/`. Installation root = repo root (so `specs/<feature>/audit-log.md` per-feature logs sit under it).
- **Rationale**: After D8 the plugin's own verbs resolve through config (no bundled special-case — Principle V). Recording the real messy layout via overrides is the strongest possible test of configurable locations (D3) and removes the env-var/`--doc` crutches the code comments call out.
- **Alternatives**: a bundled-copy special-case "no config → use plugin tree" (rejected — silent fallback, Principle V); relocating the dogfood files to the audience-split defaults (rejected — needless churn; the override path is exactly what adopters with existing layouts need, so dogfood it).
- **Open at implementation (low-risk)**: the exact root choice (repo root vs `plugins/stack-control/`) is finalized when wiring D8 against the real tree; repo-root is the working assumption because per-feature audit logs live at `specs/<feature>/` (repo-root-relative).

## D10 — Collision / nesting semantics (FR-024)

- **Decision**: Nesting permitted; nearest config wins; a parent's scope excludes nested child subtrees. Setup **refuses with a fail-loud error** any configured location that escapes its installation's scope or collides with another installation's resolved file.
- **Rationale**: git/`tsconfig` nesting semantics (least surprise) + Principle V. Preserves the US4 isolation guarantee.
- **Alternatives**: warn-not-refuse (OQ-5 B — rejected, risks silent interference); disallow nesting (OQ-5 C — rejected, blocks root-program + per-package monorepos).
