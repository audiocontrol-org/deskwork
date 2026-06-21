---
name: session-end
description: "Capture-only session close. Assembles a journal entry (auto-deriving the mechanical/quantitative sections from git log, leaving the narrative for the agent), captures surfaced tooling friction, runs an advisory clone-snapshot, surfaces the backlog items that progressed (evidence; operator owns the status transition), then commits AND pushes the doc changes. No refuse-to-end gates. Wraps `stackctl session-end`."
---

# /stack-control:session-end

Record the close of a session durably. This is the **capture-only** half of the
session lifecycle: it writes down what happened, commits it, and pushes it (an
unpushed record is lost when the ephemeral worktree is reclaimed — pushing is the
final mile). It **never refuses to close** on open findings or TBDs (capture-only
posture) and **never queries GitHub**.

> Per `.claude/rules/enforcement-lives-in-skills.md`, the capture-only discipline
> lives in this skill body + the `stackctl session-end` verb — not in a rule or a
> git hook.

**Which installation the verb targets:** the nearest enclosing stack-control
installation (the nearest ancestor with `.stack-control/config.yaml`); every
working file — journal, tooling-feedback, clone scope — resolves through that
installation's configured paths. Outside any installation the verb **fails loud**
directing you to `stackctl setup` (no bundled-copy fallback).

## Compass orientation (024 — advisory, MANUAL; not recorded by the verb)

session-end is **capture-only** and never refuses to close. As an **optional, manual
orientation** step the agent MAY run the compass against the active item to surface an
**off-rail** condition (e.g. a spec dir authored with no roadmap node) before closing:

```bash
stackctl workflow compass <item> --intent session-end
```

`session-end` is a phase-neutral finishing intent: the verdict is `on-course` on any **pipeline**
node, and `off-rail` when no node exists **OR the node is in a terminal side-state**
(`blocked`/`cancelled`/`retired`) — the off-rail side-state check precedes the neutral branch
(AUDIT-BARRAGE claude-03). **Honest scope (AUDIT-BARRAGE codex-03):** `stackctl
session-end` does **not** itself call the compass or persist a compass warning — the only
warning it renders is for uncommitted non-doc changes. This compass check is therefore an
operator/agent-facing orientation aid, not a recorded backstop; if an off-rail item must be
preserved for the next session, capture it explicitly (e.g. `stackctl backlog`). Wiring a
recorded compass warning into the verb is scoped to `multi:feature/unskippable-workflow-protocol`.
(The hard-refusal compass embedding lives in the authoring/advancing skills — `define` /
`design` / `execute` / `release` — per FR-006; session-end's capture-only posture is preserved.)

## What it does

```bash
stackctl session-end \
  [--at <dir>] [--since <sha>] [--no-push] [--friction "<note>"]... [--json]
```

1. **Journal entry.** Appends an entry at the configured `journal` path (newest
   first). The **mechanical / quantitative** sections — commit count + subjects,
   files-changed, backlog items touched — are **auto-derived from
   `git log <boundary>..HEAD`** (re-derived from source, never fabricated). The
   **narrative** sections (Goal / Accomplished / Didn't Work / Course Corrections /
   Insights) are emitted as **empty slots for you to compose** — review and fill
   them before publishing. An honest **sparse entry is still written** on a no-op
   session (empty-but-honest beats skipped). The entry shape follows a configured
   template (`<root>/.stack-control/journal-template.md`) when present, else the
   documented default.
2. **Tooling friction.** Each `--friction "<note>"` is appended (append-only) to
   the configured `tooling_feedback` path. None surfaced → skipped cleanly.
   **Route upstream-tool defects to GitHub, not only the local file.** When the
   friction is a defect in `stackctl` / the stack-control plugin itself (a crash,
   a wrong result, a missing capability) — as opposed to a note about *this
   project's* work — **file a GitHub issue against
   [`audiocontrol-org/deskwork`](https://github.com/audiocontrol-org/deskwork/issues)**
   (`gh issue create --repo audiocontrol-org/deskwork`) with one reproduction per
   issue. The local `tooling_feedback` file is a session-local breadcrumb; the
   GitHub issue is the durable, cross-project record that actually gets triaged.
   A local-file-only capture of an upstream-tool defect is lost to the tool's
   maintainers — GitHub is the portable channel that reaches them.
3. **Advisory clone-snapshot.** Runs over the configured `clone_scope` and surfaces
   new duplication. Advisory — **never blocks**; skips with a note when the scope
   is unconfigured or the snapshot tool is absent.
4. **Progressed backlog.** Surfaces the backlog items **referenced in this
   session's commits** as evidence — with their **current status verbatim**. It
   performs **0 status transitions**; promoting/closing an item is the operator's
   later call.
5. **Commit + push.** Stages and commits **only the doc working files**
   (doc-only); **warns (does not block)** when uncommitted non-doc changes exist;
   then **pushes** with a bounded retry, unless `--no-push`.

- `--since <sha>` sets an explicit session boundary (else merge-base with the base
  branch → `HEAD~N` fallback).
- `--json` emits the machine-readable `SessionEndReport`.

## The discipline (why this exists)

1. **Capture-only — never refuse to close.** session-end has no gates. It records
   the state of the world (including open work) and closes. Gating belongs to other
   verbs, not the close ceremony.
2. **Auto-derive numbers; compose narrative by hand.** The quantitative sections
   are re-derived from `git log`; the narrative is yours to write. The verb never
   invents narrative it didn't live.
3. **Push is the final mile.** A committed-but-unpushed record is lost on container
   reclaim. A push failure surfaces (exit 3) with the record safe locally — it is
   not reported as a clean close.
4. **The local backlog, never GitHub.** Progressed items come from commit
   references against the local backlog; no GitHub-issue call is made, and no item
   status is transitioned.

## Exit codes

- `0` — close captured + committed (+ pushed unless `--no-push`).
- `1` — fail-loud: outside any installation, or a working file could not be written.
- `2` — usage error (unknown flag / missing value).
- `3` — committed locally but the **push failed** (record is safe; retry the push).

## CLI-first

The CLI is the vendor-neutral core; this skill is a thin adapter that quotes the
verb and adds **no behavior the CLI lacks**. `stackctl session-end` runs to
completion in a plain shell with no Claude Code surface.
