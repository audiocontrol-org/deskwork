# Contract: `stackctl` CLI

The deterministic primitive the front-door skills call. Mirrors `dw-lifecycle`'s `cli.ts` dispatcher shape (relative ESM imports, `tsx`-run, in-tree). Every verb below is unit-tested RED-first (Principle I).

## Dispatcher

`bin/stackctl <verb> [flags]` → `tsx src/cli.ts` → dispatch on `<verb>`. Unknown verb → exit 2 with a usage line listing known verbs (mirrors dw-lifecycle's `unknown arg` behavior). No flag is silently ignored.

## Verbs (Feature 1)

### `stackctl execute-check --spec <dir>`

Validate that a Spec Kit spec directory is in a **runnable** state for native `/speckit-implement`.

- **Input**: `--spec <dir>` (absolute or repo-relative path to `specs/<feature>/`). Missing flag → exit 2, error `execute-check: --spec <dir> required`.
- **Success**: all artifacts native execution requires are present → exit `0`, prints nothing on stderr (or a one-line `runnable` on stdout).
- **Failure (not runnable)**: exit `≠0`, stderr names the missing artifact, e.g. `execute-check: FATAL — specs/003-…/tasks.md missing; spec not runnable (run /speckit-tasks first).` **Never** exit 0 on a non-runnable spec; **never** fabricate a runnable verdict (FR-008 / Principle V / VR-1).
- **Failure (spec dir absent)**: exit `≠0`, `execute-check: FATAL — spec dir <dir> not found`.

What "runnable" means is pinned by what native `/speckit-implement` consumes (at minimum `tasks.md`; the test fixture encodes the exact set). The check reads only; it does not author or repair.

### `stackctl curate-check --spec <dir>`

Report a spec's curation state so the `curate` skill knows what to advance.

- **Input**: `--spec <dir>` (required, same error shape as above).
- **Output**: exit `0`; stdout reports presence of `spec.md`, `plan.md`, `tasks.md` (machine-readable line, e.g. `spec=yes plan=yes tasks=no`). Read-only.
- **Spec dir absent**: exit `≠0`, descriptive error.

### `stackctl version`

- Prints stack-control's version (== `plugin.json#version`). Exit `0`.

## Invariants

- **No fallbacks**: a check that cannot determine state fails loud; it never defaults to "ok" (Principle V).
- **No provider identity**: no verb branches on which tool authored the spec (Principle III).
- **Typed + small**: each subcommand is its own module under `src/subcommands/`, < 300–500 lines, no `any`/`as`/`@ts-ignore` (Principle VI).
- **Isolation**: `stackctl` imports nothing from `plugins/dw-lifecycle/src` (VR-2).
