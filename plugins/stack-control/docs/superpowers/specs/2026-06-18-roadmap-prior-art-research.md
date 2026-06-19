# Prior-art research — governed-markdown-DAG roadmap vs Backlog.md and the field

**Date:** 2026-06-18
**For:** the build-vs-adopt decision on `impl:gap/roadmap-edge-mutation-and-cluster` (spec 027), paused at `/speckit-clarify`.
**Method:** the `deep-research` multi-agent workflow ran (101 agents) but its **adversarial verification phase was rate-limited** — every claim returned vote `0-0` (no verifier executed), so the harness's "all 25 refuted / inconclusive" headline is an artifact of the API rate limit, NOT a real refutation. The 25 extracted claims are genuine leads from real sources. The two highest-value, least-known leads (Beads, markdown-plan) were then **directly verified by WebFetch**; the rest are corroborated against established knowledge. Confidence is marked per item.

## Landscape map

| Tool | Store | Dependency model | Typed edges? | Lifecycle/state-gated deps? | Grouping/epics | Dep-ordered scheduling | Confidence |
|---|---|---|---|---|---|---|---|
| **Backlog.md** (our existing backlog backend) | one markdown file per task, in git | `--depends-on/--dep` on tasks | no (single dep type) | no | `--parent` sub-tasks + `--milestone` | `sequence` command | verified locally (v1.46 CLI) |
| **markdown-plan** (rexgarland) | SINGLE markdown doc → tree/DAG | `@(unique-substring)` refs | no (one type + list nesting) | no | list nesting only | est/burn-up via `mdplan` | verified (WebFetch) |
| **Beads** (steveyegge) | Dolt SQL DB (jsonl = export) | typed: `blocks`, `parent-child`, `relates_to`, `duplicates`, `supersedes` | **yes** | partial (status states; `bd ready` = no open blockers; epic rollup is a known hard problem, issue #1495) | parent-child epics, hierarchical IDs | `bd ready` | verified (WebFetch) |
| **Org-mode** (+ org-depend, Org Edna) | plaintext outline | `BLOCKER`/`TRIGGER` props; `ORDERED` | **yes** (blocker vs trigger) | **yes** — parent can't be DONE with TODO children; Org Edna matches `todo-state?(STATE)` | outline nesting | `ORDERED` sequential | high (well-documented) |
| **Taskwarrior** (+ twdeps) | flat DB | `depends` attr | no (single) | no (urgency only) | projects/tags | urgency sort | high |
| **Airflow** | Python DAG | edges = execution order | grouping vs edges | **yes** — trigger rules gate on upstream STATE | `TaskGroup` (non-blocking, UI) | topological | high |
| **CLI help (clap/Typer/Cobra/oclif)** | — | — | — | — | — | — | help+parsing+completion derived from ONE definition (high) |

## Closest prior art to our exact model

No single tool matches all four of our axes (single governed markdown DOC + TYPED edges + LIFECYCLE-gated satisfaction + a mutation/query CLI). The closest by axis:

- **Document model (single governed markdown DAG):** `markdown-plan` — but untyped edges, substring refs (no stable ids), estimation-focused. Our heading-keyed `<phase>:<kind>/<slug>` ids + typed edges are strictly richer.
- **Typed edges + lifecycle-state-gated satisfaction:** `Org-mode` + `Org Edna` is the strongest prior art — `BLOCKER`/`TRIGGER` typed edges, and Edna conditions can match a specific TODO state (`todo-state?(STATE)`), which is *exactly* "depends-on satisfied only when target reaches state X." This proves our novel-feeling edge semantics are an established concept (in a different host: Emacs outlines, not a CLI DAG doc).
- **Agent-native typed-edge graph with a ready-list + blocking-vs-grouping split:** `Beads` — closest in PURPOSE/niche (multi-agent, hash-ids, `bd ready`, epic-vs-blocking distinction). **Notable signal:** a sophisticated peer in our exact niche deliberately chose a **SQL/Dolt store, not markdown-as-graph**, having judged flat files insufficient for graph queries at scale. That is a direct caution to our governed-markdown-DAG bet.
- **Non-blocking grouping vs blocking dependency (our `part-of` vs `depends-on`):** `Airflow` `TaskGroup` (non-blocking, organizational) vs dependency edges (blocking) is the cleanest industrial precedent; Beads' epic-vs-blocking is the issue-tracker precedent.

## What Backlog.md already gives you vs what is genuinely novel

**Already solved off-the-shelf (reinvention risk):**
- **Self-documenting CLI** (`--help` everywhere, complete usage, shell completion) — Backlog.md has it; and "help derived from one parser definition" is a *commoditized* pattern across clap/Typer/Cobra/oclif/commander. **Our US1 / shared-parser pillar is reinventing a library feature.**
- **Edit existing items incl. dependencies** (`task edit --dep`, labels, status, ordinal) — Backlog.md already mutates existing items. **Most of the deferred edge-mutation capability is not novel.**
- **Grouping** (`--parent`, `--milestone`) and **dependency-ordered scheduling** (`sequence`), board/overview/search/MCP/web UI.

**Genuinely novel in the stack-control roadmap (defensible to build):**
1. **Lifecycle-coupled edge semantics in combination:** `depends-on` satisfied ONLY at the terminal `shipped` state + `part-of` explicitly non-blocking + `deferred-until` prose conditions. Each piece has prior art (Org Edna state-gating; Airflow trigger rules; Airflow TaskGroup) — novel-in-combination, not novel-in-concept.
2. **Integration with the stack-control workflow/compass lifecycle** (design→spec→impl phase-derivation, gates, `reconcile` against on-disk spec dirs). No off-the-shelf equivalent — this is the real differentiator.
3. **One governed parseable markdown document** sharing the `document-primitives` engine with the other governed docs (DESIGN-INBOX, WORKFLOW.md). This is an *architectural* choice, not a task-tool feature — and it is the main reason adopting Backlog.md as the roadmap store would conflict with the foundation.

## Build-vs-adopt recommendation

- **Discoverability pillar (US1 / "shared parser combinator"): ADOPT, don't build.** "Help can't drift from parsing because both derive from one definition" is exactly what clap/Typer/Cobra/oclif/commander already provide. stack-control is Node/tsx → adopt a mature arg-parser (e.g. commander/yargs-style) that yields `--help` + usage + completion from one declaration, rather than hand-rolling a bespoke combinator. This collapses the largest part of the 027 build.
- **Roadmap STORE: keep bespoke (do NOT adopt Backlog.md here).** The governed-single-markdown-document property is load-bearing for the `document-primitives` foundation; adopting Backlog.md's one-file-per-task store would fracture it. BUT heed the Beads signal: if the roadmap graph grows large or query-heavy, the flat-doc bet has a known ceiling — keep the graph operations behind a clean seam so a store swap stays possible.
- **Edge-mutation + cluster verbs: keep thin, on the governed doc.** They must operate on the governed markdown (so Backlog.md can't own them), but the SEMANTICS are well-trodden — implement minimally, don't gold-plate.
- **Lifecycle-coupled edges + workflow integration: keep bespoke** — the genuine novel core; no adopt option fits. Worth citing Org Edna / Airflow trigger-rules as design precedent for the state-gated satisfaction.

**Net:** 027 as currently specced over-builds. The defensible core is (lifecycle edges + cluster-on-governed-doc + honest header); the discoverability pillar should be re-scoped to "adopt a parser library," not "build a shared combinator." This roughly halves the feature and removes the part most clearly duplicated by prior art.

## Caveats

- The workflow's automated verification did not run (rate-limited); non-WebFetch-verified rows are corroborated from established knowledge, not adversarially checked. Org-mode/clap/Typer/Cobra/oclif/Airflow claims are well-established; if any single one becomes load-bearing for a decision, verify it directly.
- Sources: github.com/MrLesk/Backlog.md; github.com/rexgarland/markdown-plan; github.com/steveyegge/beads (+ issue #1495); orgmode.org TODO-dependencies + worg/org-depend; nongnu.org/org-edna-el; taskwarrior.org; clap-rs/clap; typer.tiangolo.com; cobra.dev; oclif.io; astronomer.io Airflow dependencies.
