# Design: the `backlog` surface (backlog.md backend)

> **Status:** brainstorm output (2026-06-09 session). This is the design seed for a Spec Kit
> feature (`/speckit-specify`), not an implementation plan. It captures the operator decisions
> made during the brainstorm so the spec author inherits settled ground.

## Problem

`ROADMAP.md` must stay a **small, carefully curated** DAG of work we *know* we want to do.
But agents trip over bugs, gaps, and follow-ups constantly while working, and there is no
low-friction, **structured** place to dump them. The two choices today are both wrong for this:

- **GitHub issues** — unstructured for agents, awkward to query/triage, easy to flood, and
  flooding `ROADMAP.md` with them destroys the curation that makes it useful.
- **`audit-log.md`** — governed/barrage-scoped; not a general intake.

We need a **slush pile**: a structured, agent-easy intake for found work that is deliberately
*separate* from the curated roadmap. Capture must be one move; triage is a later, separate pass
(capture ≠ scope).

## Decision summary (operator, this session)

1. **Substrate: backlog.md** (markdown-native task manager; TypeScript + npm; built-in MCP server,
   not used — see below). Chosen over **beads** (Dolt-backed graph tracker) because backlog.md keeps
   the slush as **git-diffable markdown in the working tree** — consistent with the thesis principle
   *"memory loss → durable **written** artifacts"* — and matches our TS/npm stack with no Go/Dolt
   toolchain. beads' advantages (hash-ID merge-safety, semantic dedup, `discovered-from` provenance)
   matter most under heavy concurrent multi-agent flooding, which the operator explicitly deferred
   (*"we can worry about that when it becomes a problem"*). The markdown files are portable, so a
   later migration to beads or hash-suffixed IDs is not a one-way door.

2. **A new thing called "backlog."** It captures bugs + gaps agents find, **plus** a one-time import
   of the 37 open GitHub issues. `DESIGN-INBOX`/inbox, `ROADMAP`, and (except the slush portion —
   see #5) `audit-log` are **untouched**. Replacing the homegrown roadmap + insight-capture with
   backlog is a **later, separate** decision (*"if we like it, we may… but not yet"*).

3. **GitHub is not mutated.** The import is a one-way snapshot for the trial; issues stay open and
   canonical. Their fate is decided later by whether backlog.md proves out (*"if we like backlog.md,
   we'll retire github; if backlog.md sucks, we won't"*).

4. **Opinionated verb, concrete backend, port deferred.** We build `/stack-control:backlog` touch
   points that shell to backlog.md as the **one** concrete backend — NOT a formal backend-agnostic
   port + registry. This is Constitution **Principle II (Integration-First, No Speculative Building)**
   and the program's settled discipline for the Spec Kit provider port (roadmap § "Two distinct
   pluggability axes": *build against one real provider first, generalize from real instances rather
   than one imagined provider*). The verb is the stable contract; if a second backend ever appears,
   dispatch is extracted into the adapter then — derived from reality, not imagination.

5. **Migrate `slush-findings` into the backlog — one integrated phase.** The audit-barrage's
   dampener-parked residual findings *are* real-but-unfixed bugs/gaps, so they belong in the same
   pile. This unifies the two "slush" concepts rather than partitioning them, and resolves the
   `slush-findings` naming collision. The operator chose to build this together with the backlog
   foundation (not split into a later phase), accepting that the (in-use) governance convergence loop
   now depends on backlog.md.

## Alternatives considered

Two alternatives were evaluated **hands-on** this session (not from READMEs): `beads` (`bd` 1.0.5) and
`backlog.md` (1.46.0) were each installed into a scratch project and driven through the slush-pile
workflow (one-move capture, structured fields, separating a pile from a curated view, dependency
support, the git/storage story, the agent-integration surface).

### beads — rejected for this use

beads (`bd`) is a *"distributed graph issue tracker for AI agents, powered by Dolt."* It is the
richer **graph** engine and is genuinely stronger where this slush pile is weaker:

- `discovered-from` provenance edges, semantic `find-duplicates`, `bd ready`/`bd blocked`, a `graph`
  render, typed edges (`relates_to`/`duplicates`/`supersedes`).
- **Hash IDs + Dolt cell-merge** — purpose-built for many agents writing concurrently (the
  zero-conflict design directly targets the merge friction tracked in #413).

It was rejected as the substrate because:

- **SSOT is an opaque binary Dolt DB**, gitignored (`.dolt/`, `*.db`), synced over a separate
  `refs/dolt/data` ref namespace — not the working tree, not `git diff`-able. The `.beads/issues.jsonl`
  export is committable but the docs explicitly warn *"don't treat JSONL as the source of truth."*
  This collides with the thesis's load-bearing principle *"memory loss → durable **written**
  artifacts"* — the slush store would not be a readable artifact.
- **Go + Dolt toolchain** vs the project's TypeScript/npm stack.
- **Invasive `init`**: it auto-wrote `CLAUDE.md`, `.claude/settings.json` (a SessionStart hook),
  `AGENTS.md`, a `SKILL.md`, **and auto-committed to git** — against a repo with a curated `CLAUDE.md`
  + rules + an existing `session-start` skill.

beads' decisive advantage — concurrent multi-agent merge-safety — was explicitly deferred by the
operator (*"we can worry about that when it becomes a problem"*). Because backlog.md stores plain
markdown, a later migration to beads (or hash-suffixed IDs) is not a one-way door.

### head-to-head (verified)

| Dimension | beads | backlog.md |
|---|---|---|
| Storage | Dolt binary DB, gitignored, separate `refs/dolt/data` sync | YAML-frontmatter `.md` files, one per task, **in the working tree** |
| Prose-auditable (barrage/operator reads the store) | ✗ (only the JSONL mirror) | ✓ — it *is* markdown |
| Stack fit | Go + Dolt | **TypeScript + npm** (matches) |
| One-move capture | `bd q` → ID | `task create` / `draft create` |
| Keep slush out of a curated view | labels + query language | status / drafts tier (no `--label` filter on `list`) |
| Dedup a flood | ✓ semantic `find-duplicates` | ✗ fuzzy `search` only |
| Provenance | ✓ `discovered-from` | ✗ generic `depends-on` only |
| Merge-safe under parallel agents | ✓ hash IDs, zero-conflict | ✗ sequential `TASK-1` IDs |
| Ready / unblocked view | ✓ `bd ready` | ~ `sequence list` (dependency order) |
| Capture → curate seam | `bd promote` (wisp→bead) | `draft promote` (draft→task) |
| Install invasiveness | high (auto-wrote files + auto-committed) | lower (interactive; non-interactive skips client setup) |
| UI | text / JSONL | kanban TUI + web UI |

### build-your-own `SLUSH.md` — rejected

A governed `SLUSH.md` + a hand-built `/stack-control:slush` verb on the existing `document-model`
engine was considered (it would stay fully in-model and add zero external deps). Rejected because
backlog.md *is* the markdown slush pile done well — a hand-rolled one would reimplement
query/board/cleanup/drafts worse, and a flat governed markdown doc floods (the very failure mode the
pile exists to avoid). The opinionated-verb-over-concrete-backend decision (#4) captures the
in-model benefit (an opinionated `/stack-control:backlog` touch point) without the reimplementation.

## Architecture

```
agent / human
   │  stackctl backlog capture "…" --type bug
   ▼
src/subcommands/backlog.ts        opinionated verb — stamps project conventions (labels, type)
   │
   ▼
src/backlog/backend.ts            thin typed adapter — spawns the `backlog` CLI; NO fallbacks
   │                              (this is the deferred-port seam, concretely typed to backlog.md)
   ▼
backlog.md (`backlog` binary)     THE concrete backend — owns the file format & operations
   │
   ▼
backlog/tasks/task-N - title.md   YAML-frontmatter markdown, committed to the repo
```

This is the plugin's first **external-backend adapter** verb — the same family as the front door
shelling out to `/speckit-implement`, distinct from `inbox`/`roadmap` which consume the in-tree
`document-model` engine. backlog.md owns the markdown format; our verb is an opinionated facade, not
a reimplementation.

## Intake: three sources, one pile

| Source | Surface | Cadence |
|---|---|---|
| Agent-found bugs/gaps | `stackctl backlog capture "…" --type bug\|gap [--ref <url>]` | ongoing |
| Open GitHub issues (37) | `stackctl backlog import-github --dry-run\|--apply` | one-time |
| Audit-barrage residuals | `slush-findings` (rewired destination) + `stackctl backlog import-slush` (backfill) | ongoing + one-time |

- **Capture** stamps a project label (e.g. `agent-found`) and a type, then delegates to
  `backlog task create`. One move; the agent does not lose its current thread.
- **GitHub import** reads `gh issue list --json number,title,body,labels,url`, creates one task per
  issue, maps GitHub labels → backlog labels, and records `--ref <issue-url>` as the `gh-NNN`
  backlink. **Idempotent**: an issue whose `gh-NNN` ref already exists is skipped. Implemented in
  `tsx` (not shell) so `#` characters in issue bodies never trip the permission gate. `--dry-run`
  first.
- **Audit-barrage residuals** — see the migration section below.

## The `slush-findings` migration

Today `slush-findings` (the audit-barrage convergence dampener) writes
`Status: acknowledged-slush-pile-<date>` *into* `audit-log.md` to terminate the convergence loop
once it is HIGH-quiet. After this feature:

- **The dampener *decision* stays in the governance flow** — when to slush is the convergence loop's
  logic and is not coupled out. Only the **destination** of parked findings changes.
- **Forward mechanism:** dampener-parked MEDIUM/LOW findings become **backlog tasks** — severity →
  priority, with provenance (feature slug, barrage finding ID) and a ref back to the `audit-log.md`
  entry. The audit-log entry then carries a `migrated-to-backlog <task-id>` disposition instead of a
  parked status that lives in the log indefinitely. HIGHs are still never slushed.
- **Backfill:** `stackctl backlog import-slush` performs a one-time import of existing
  `acknowledged-slush-pile-<date>` entries already in `audit-log.md`.
- **`--burn-down`** ("go back through the slush pile and burn it down") folds into *working the
  backlog* — the backlog **is** the burn-down queue. `slush-findings` drops its `--burn-down` flag.

**Boundary revision (explicit):** the slush portion of `audit-log.md` now flows out to the backlog;
`audit-log.md` remains the clean convergence ledger (open / fixed). This revises the session's
earlier "audit-log untouched" framing, by operator decision.

## Components

- `src/subcommands/backlog.ts` — `runBacklogCli`; subactions `capture`, `list`, `import-github`,
  `import-slush`. Registered `backlog: runBacklogCli` in `src/cli.ts` `SUBCOMMANDS`.
- `src/backlog/backend.ts` — thin typed adapter spawning the `backlog` binary; parses `--plain` /
  JSON output; throws a descriptive error on missing binary or non-zero exit. Shared by the verb and
  the rewired `slush-findings`.
- `src/subcommands/slush-findings.ts` — rewired so its destination is the backlog (via the adapter)
  rather than an in-`audit-log` status; loses `--burn-down`.
- `skills/backlog/SKILL.md` — the `/stack-control:backlog` touch point: when to capture (a bug/gap
  found mid-work), the **capture ≠ scope** discipline, and the verb surface.
- `tests/backlog/` — integration tests spawning the **real** `backlog` binary against tmp-dir
  fixtures (testing rule: never mock the filesystem; exercise the adapter + verb boundary). Unit
  tests for label/type and severity→priority mapping, and GitHub-import idempotency.
- `backlog/config.yml` at the repo root — committed; `filesystem_only: true` (backlog performs no git
  operations of its own — we commit, hooks intact), default statuses to start, `task_prefix`.
- `backlog.md` added to `plugins/stack-control/package.json` dependencies (pinned).

## Verb surface (v1)

`capture` · `list` · `import-github` · `import-slush`. Triage and inspection are delegated to
backlog.md's native commands (`board`, `show`, `cleanup`) rather than re-wrapped — keeping our
surface thin and faithful (Principle VIII).

## Error handling

No fallbacks (Principle V): a missing `backlog` or `gh` binary throws with the remediation; a
non-zero exit from the backend surfaces stderr and propagates a non-zero exit. No silent skips.

## Testing

Test-First (Principle I): a RED test precedes each unit. Integration tests run against the real
`backlog` binary on tmp fixtures (mirroring the `inbox`/`roadmap` test style: a CLI runner + tmp
copies + committed fixtures). Unit tests cover the mapping logic and import idempotency.

## Scope

**In:** backlog.md adopted (`backlog/config.yml` committed, dep pinned) · `capture` + `list` verb +
`SKILL.md` · `import-github` one-shot · `slush-findings` rewired to the backlog + `import-slush`
backfill.

**Deferred (named, not silently cut):**
- MCP integration (single-vendor now; backlog.md ships the server, so it is reversible).
- A formal backend-agnostic port / registry (extract from a real second backend, per Principle II).
- A backlog → `ROADMAP.md` promotion seam.
- The GitHub close/migrate disposition (decided later, by trial outcome).
- Replacing `DESIGN-INBOX`/inbox or `ROADMAP` with the backlog.
- Concurrency / merge-safe IDs (beads territory; revisit if flooding becomes a problem).
- A dependency-graph overlay reusing the roadmap reasoner over backlog tasks (see "Future" below).

## Future: dependency-graph overlay (not v1)

backlog.md's native dependency support is lean — a `dependencies:` array plus a `sequence` command
that computes topological waves; no `ready`/`blocked`/`graph` verb, no reverse-dependent view, one
edge type (`depends-on`). The project's own reasoner is richer **and already store-agnostic at the
`WorkItem` boundary**: the views in `src/roadmap/graph.ts` (`ready`, `blockedBy`, `dependents`,
`unmetDependencies`) operate on an abstract `WorkItem` / `RoadmapModel`, not on `ROADMAP.md`. The
only coupling to the markdown engine is the `toWorkItem(unit)` projection.

So our dependency capabilities could be **overlaid** on backlog.md by writing a sibling projection
`backlogTaskToWorkItem()` that maps:

- `dependencies: […]` → `dependsOn`
- backlog's `--parent` (native parent/child) → `partOf`
- a label convention (e.g. `deferred-until:…`) → `deferredUntil`
- backlog status `Done` → the "satisfies a `depends-on` edge" status (today a satisfied-status
  constant in `graph.ts`, scoped to `shipped`)

Then `graph.ts`'s views run **unchanged**, exposed as `stackctl backlog next/blocked/graph`. The one
bounded piece: `order`/`topoOrder` lives in `document-model/edges.ts` typed to `Unit`, so pure
ordering either re-expresses over `WorkItem` or synthesizes Units — a small lift, not a
reimplementation. This is the "opinionated capability over a pluggable backend" thesis applied to
dependency reasoning: the graph reasoner is the capability; `ROADMAP.md` and backlog.md are two
stores it can project from.

**Why not v1 (Principle II — Integration-First, No Speculative Building):** speculative until
backlog.md has proven out *and* we want it to grow toward the roadmap's role. The satisfied-status
semantics differ enough between a slush pile (`Done`) and the curated roadmap (`shipped`) that real
use should set the rule. What v1 *should* do is keep the door open — have `src/backlog/backend.ts`
expose tasks (with `dependencies` / `parent` / labels) in a structured form a future projection can
consume. This is the validated path that closes the graph-feature gap if backlog ever eyes replacing
`ROADMAP.md`.

## Why MCP is not used

backlog.md ships an MCP server, but for this trial we use **skill + CLI**, not MCP. MCP's real
advantages (typed tool calls, cross-vendor portability) are modest for a single-vendor (Claude Code)
dogfood and are largely recovered by backlog.md's `--plain` / JSON output. Its costs are exactly the
ones we want to avoid: a per-session daemon with a lifecycle, config in `settings.json` that drifts
across worktrees, and quiet handshake failures. A committed `SKILL.md` + the pinned `backlog` bin
travel into every worktree automatically and fail loudly — consistent with the thesis's preference
for fail-loud mechanical surfaces and the `enforcement-lives-in-skills` rule (skills + CLI verbs, not
background processes). If multi-vendor capture matters later, the MCP server can be added then.

## Process note

This is a stack-control plugin feature, so it follows the project's Spec Kit lifecycle
(`/speckit-specify` → `clarify` → `plan` → `tasks` → `implement` → `after_implement` governance),
implemented in a **separate** implementation session/worktree per the orchestrator/implementation
split. This design doc is the input to `/speckit-specify`, not a superpowers implementation plan.

## Decisions log

| # | Decision | Rationale |
|---|---|---|
| 1 | Substrate = backlog.md (over beads) | Markdown-in-tree (prose-auditable, git-diffable); TS/npm stack fit; concurrency deferred |
| 2 | A new "backlog"; inbox/roadmap/(most of)audit-log untouched | Keep the curated roadmap small; trial backlog before any replacement |
| 3 | GitHub not mutated; import is a one-way snapshot | Trial outcome decides GitHub's fate later |
| 4 | Opinionated verb, concrete backend, port deferred | Principle II; the Spec Kit provider-port discipline |
| 5 | Migrate `slush-findings` into the backlog, one phase | The parked residuals are bugs/gaps; unify the two slush concepts |
| 6 | skill + CLI, not MCP | Fail-loud, worktree-portable, no daemon to janitor; reversible |
