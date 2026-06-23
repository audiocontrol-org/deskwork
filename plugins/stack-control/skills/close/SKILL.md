---
name: close
description: "Close a shipped roadmap item and everything it contains — the operator-confirmed post-ship terminal move. Shows the full transitive cascade (the item's part-of subtree's recorded closes: ids) as a dry-run, prompts you to confirm (and, when self-hosting, to validate the installed release), then runs `roadmap advance --to closed` which closes the deduped backlog ids and advances the item to the terminal `closed` phase. Never closes automatically."
---

# /stack-control:close

A **shipped** item is not actually finished: its contained work still needs
closing, and (for projects that publish an artifact) the release still needs
validating. `shipped` is therefore **no longer the end of the lifecycle** — the
terminal phase is **`closed`**, reached only by this one **operator-confirmed**
move. The lifecycle surfaces a shipped item as *not yet closed* (so it isn't
forgotten), but closure **never fires automatically** (FR-016 / SC-004).

This skill is the operator-facing surface for the **post-ship terminal advance**.
It drives one CLI verb — `stackctl roadmap advance <id> --to closed` — which:

- walks the item's `part-of` subtree (visited-Set, diamond-safe),
- closes every terminal member's recorded `closes:` ∪ `ref:` backlog ids (uniform
  for `shipped`/`cancelled`/`retired`/`closed` members),
- **skips and reports** any non-terminal (in-flight) child — it does not block the
  parent's closure,
- and, on `--apply`, advances the item's status to the terminal `closed`.

The cascade touches **only recorded ids** (never inferred). An unknown recorded id
fails loud in the dry-run before anything is written.

> Per `.claude/rules/enforcement-lives-in-skills.md`, the discipline lives in this
> skill body + the `stackctl roadmap advance` verb it calls — it travels with the
> plugin install, never a git hook. There is no auto-close trigger anywhere.

## Preconditions

- The item is in status **`shipped`** — `closed` is reachable only from `shipped`
  (the compass refuses `closed` from any other phase). If it is not shipped yet,
  finish shipping first.
- The item's resolved backlog ids are recorded in its (and its subtree members')
  `closes:` set. Record them without hand-editing via
  `/stack-control:roadmap resolves <node> --add TASK-… …`, or rely on the
  auto-back-link that `backlog done`/`promote` performs for tasks carrying a
  parent-node ref.

## Steps

1. **Orient (optional).** Confirm the item is shipped and see the pending close:

   ```bash
   stackctl workflow status <id>
   ```

   A shipped item reports `closed` as its legitimate next move.

2. **Dry-run — the operator-confirm guard (writes nothing).** Show the full
   transitive cascade plan:

   ```bash
   stackctl roadmap advance <id> --to closed
   ```

   Read the plan: the nodes whose ids will close, any **skipped** non-terminal
   children, the deduped `closeIds`, the `alreadyClosed` ids, and (if any) the
   `unknownIds` that would make the run fail loud. Nothing is written yet.

3. **Confirm.** Decide whether to proceed. There is **no validation criterion**
   baked into the lifecycle (the stage is install-agnostic — FR-017): whatever you
   inspect before confirming is your call, not a gate.

   - **When self-hosting** (closing a stack-control feature you just shipped), this
     is the moment to **validate the installed release** — install the published
     plugin and walk the surfaces the feature touched, so "closed" reflects a
     release that actually works, not just a green local tree. (Per the project's
     issue-closure discipline, a fix isn't done until verified in a formally
     installed release.) This is operator judgment performed here, never modeled as
     a workflow criterion or a `tasks.md` task.

4. **Apply — close + advance, as one action.** On confirmation:

   ```bash
   stackctl roadmap advance <id> --to closed --apply
   ```

   This runs the cascade (closes the deduped subtree ids; already-closed ids are
   reported as no-ops; idempotent) **and** advances the item's status to the
   terminal `closed`. Re-running is safe.

## Notes

- To close **only** an item's contained ids without advancing its status (e.g.
  mid-cleanup), use `stackctl roadmap close-related <id> --cascade` (same dry-run
  / `--apply` discipline; does not change status). `advance --to closed` is the
  lifecycle move that does both.
- A non-terminal child is **reported, never closed** — in-flight siblings do not
  block closing the resolved work, and they remain tracked.

## CLI-first

The CLI is the vendor-neutral core; this skill is a thin adapter that quotes the
verb and adds no behavior the CLI lacks. `stackctl roadmap advance <id> --to
closed` runs to completion in a plain shell with no Claude Code surface.
