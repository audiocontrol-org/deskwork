---
name: session-start
description: "Read-only boot orientation for a fresh agent session. Resolves the enclosing stack-control installation and reports the roadmap ready/blocked frontier, the active Spec Kit spec's chain position (+ the next /speckit-* step), the latest journal entry, the open local backlog, and a branch-staleness advisory — then STOPS. No authoring or implementation step fires. Wraps `stackctl session-start`."
---

# /stack-control:session-start

Orient a fresh agent at the start of a session, then **stop**. This is the
read-only half of the session lifecycle: it gathers everything an agent needs to
act correctly without re-explanation, prints it, and takes **no** action — the
two-session boundary (orientation is separate from authoring/implementation).

> Per `.claude/rules/enforcement-lives-in-skills.md`, the report-and-stop
> discipline lives in this skill body + the `stackctl session-start` verb — not in
> a rule or a git hook.

**Which installation the verb targets:** the verb resolves the **nearest
enclosing stack-control installation** — the nearest ancestor with a
`.stack-control/config.yaml` — and reads every working file through that
installation's configured paths (roadmap, journal, backlog). No hardcoded path,
branch, or feature slug (#122). Run [`/stack-control:setup`](../setup/SKILL.md)
once to create an installation. Outside any installation the verb **fails loud**
directing you to `stackctl setup` (no bundled-copy fallback).

## What it reports

```bash
stackctl session-start [--at <dir>] [--json]
```

1. **Roadmap** — the ready/next frontier and the blocked items (the 006 reasoner
   over the configured `ROADMAP.md`).
2. **Active spec** — the Spec Kit feature the tool's own `.specify/feature.json`
   points at, which authoring artifacts are present, and the inferred next
   `/speckit-*` step (e.g. plan-but-no-tasks → `/speckit-tasks`; tasks present →
   `/speckit-analyze` then `/speckit-implement`). "No active spec" is a clean
   signal, not an error.
3. **Latest journal entry** — the most recent development-journal entry (continuity
   thread). "No prior journal entry" on a first session.
4. **Open backlog** — the open items in the **local backlog** (the `backlog`
   store). This is NOT GitHub issues — the verb never queries GitHub.
5. **Branch-staleness advisory** — whether the branch is behind its base
   (upstream, else the repo default branch). Advisory only; **never blocks**.
   Undeterminable (detached HEAD / no base) → a clean skip note.

- `--at <dir>` orients on the installation enclosing `<dir>` instead of the cwd.
- `--json` emits the machine-readable `OrientationReport` (for non-Claude-Code
  adapters).

## The discipline (why this exists)

1. **Report, then STOP.** session-start never invokes a `/speckit-*` step, never
   writes anything, never starts implementation. It hands the agent a picture and
   gets out of the way. The next move is the operator's.
2. **Read-only.** Running it twice produces an identical report and **0 on-disk
   changes**. It is safe to re-run anytime.
3. **The local backlog, never GitHub.** Work-tracking surfaces read the local
   backlog store; the verb makes no GitHub-issue call.

## Exit codes

- `0` — oriented and reported (including every "none"/"skipped" sub-state).
- `1` — fail-loud: run outside any installation, or a required working file is
  unreadable/malformed.
- `2` — usage error (unknown flag).

## CLI-first

The CLI is the vendor-neutral core; this skill is one thin adapter that quotes the
verb and adds **no behavior the CLI lacks**. `stackctl session-start` runs to
completion in a plain shell with no Claude Code surface.
