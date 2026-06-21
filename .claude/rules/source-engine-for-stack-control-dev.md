# When DEVELOPING stack-control, govern with `./bin/stackctl` (source), not bare `stackctl` (installed cache)

When you are **developing stack-control itself** in this monorepo and you run `stackctl govern` (or any verb whose behavior you just changed in source), you MUST invoke **`./bin/stackctl`** from `plugins/stack-control/` — the **source engine** (tsx over `src/`, the in-progress version, e.g. 0.52.1). **Bare `stackctl` on PATH resolves to the INSTALLED plugin cache** (`~/.claude/plugins/cache/deskwork/stack-control/<published-version>/bin/stackctl`, e.g. 0.52.0) — the LAST RELEASED engine, which does **not** contain your uncommitted/unreleased fixes.

## Why this matters (it is expensive to get wrong)

If you govern with the installed cache while developing engine fixes, the barrage audits your source **code diff** (correct), but the **engine behavior** — override short-circuit, hunk-fingerprint, payload scoping, diff-base resolution — is the OLD released version. Symptoms that mean "you're on the wrong engine":

- `--override` runs a **full barrage** then graduates (instead of short-circuiting in ~0.5s with "zero render/barrage/lift/slush"). The FR-017 short-circuit only exists in the newer source.
- Phase checkpoints get **`hunkBlocks: 0`** → whole-file freshness → every shared-file edit **re-stales** earlier phases (the O(n²) entanglement loop). The TASK-357 in-monorepo hunk fix only engages in source.
- Your just-written verb fix "doesn't take effect."

The 2026-06-20 and 2026-06-21 sessions BOTH burned large amounts of compute (many needless override barrages, repeated phase re-staling) because govern ran the bare `stackctl` cache. Switching to `./bin/stackctl` made overrides instant (0 barrage) and per-phase govern converge cleanly — the difference between a grind and a smooth burndown.

## How to apply

- **Verify once per session before governing:** `which stackctl` (cache path + released version) vs `./bin/stackctl version` (source version). If they differ and you're testing engine changes, use `./bin/stackctl`.
- **Use `./bin/stackctl` for every `govern` / engine-behavior verb run while developing.** Bare `stackctl` is fine only for read-only orientation that doesn't depend on your changes, or when you deliberately want the released engine.
- **Adopter-facing docs/skills still say bare `stackctl`** — that is correct for ADOPTERS (who run the installed plugin). This rule is the DEV-time exception, not a contradiction: the SKILL.md warning that `plugins/stack-control/bin/stackctl` 404s in a HOST install (#480) is about adopter installs, not this monorepo where the source bin exists.

## Why this rule exists

A durable lesson (per `agent-discipline.md` § Memory-vs-rule placement): the trap recurs every session that develops the engine, auto-memory does not survive worktree switches, and the cost (wasted barrage compute + a confusing entanglement loop that looks like a real bug) is high. Operator decision 2026-06-20: use `./bin/stackctl` (source engine) for the burndown.
