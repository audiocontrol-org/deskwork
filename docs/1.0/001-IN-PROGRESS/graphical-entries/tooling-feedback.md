# Tooling Feedback — graphical-entries (scope-discovery dogfood)

Running log of friction, pathologies, and improvement opportunities in the scope-discovery + duplication tooling, captured during graphical-entries implementation as the v1 dogfood signal. Each entry is one observable friction point with a Repro / Workaround / Suggested-fix shape; the log is append-only (entries are never deleted — closed ones get a `Status` line + closing-commit reference).

## How to operate this log

- File entries the moment friction surfaces — don't batch them; the cumulative set teaches more than a single end-of-feature "audit."
- Use the category legend below; pick severity by impact on the operator (`high` blocks work or hides bugs; `medium` slows work meaningfully; `low` is a papercut).
- Never delete an entry. Closed entries stay in the log with their closing-commit SHA + a one-line summary of the fix.
- Each entry's body is **Repro → Workaround used → Suggested fix** — operator-recognizable shapes, not just "make it better."
- Promote an entry to a GitHub issue when it needs explicit triage (architecture-level concern, recurring pattern across audits, design decision). TF entries that stay tooling-internal stay in this log.

## Category legend

- **A** — anti-patterns registry
- **AM** — adopter-manifests registry
- **CL** — clones.yaml + clone-detector
- **GATE** — pre-commit / hook ergonomics
- **DSC** — discovery agents / synthesis
- **MISC** — everything else (build, packaging, agent dispatch hygiene, ergonomics)

## Severity legend

- **high** — blocks work or hides bugs
- **medium** — slows work meaningfully
- **low** — papercut

## Status summary

| TF | Status | Closing commit |
|---|---|---|
| TF-001 | Open | — |
| TF-002 | Open | — |

## How to add an entry

1. Hit friction or pathology or notice an improvement opportunity.
2. Pick a category (A / AM / CL / GATE / DSC / MISC) and severity (high / medium / low).
3. Append a new section at the bottom (or insert by topic if it pairs with an existing entry) with the next TF-NNN id.
4. Include: Repro (what happened), Workaround used (what unblocked), Suggested fix (the operator-recognizable shape of a fix, not just "make it better").
5. Commit alongside the work that surfaced it.

---

## TF-001 · GATE · high · `install-scope-discovery-hooks` reports success but hooks silently skipped when husky's `.husky/_` dispatcher isn't bootstrapped

**Repro:**

1. In a fresh worktree without `node_modules/` (no `npm install` run yet), with `package.json` containing `"husky": "^9.x"` and a `prepare` script invoking husky, run `dw-lifecycle install-scope-discovery-hooks` (v0.23.0).
2. The skill reports `mode=husky`, writes (or confirms) `.husky/pre-commit` with the managed scope-discovery block, and updates `.dw-lifecycle/scope-discovery/hooks-installed.json`. Output looks like success.
3. `git config --get core.hooksPath` returns `.husky/_`.
4. `ls .husky/_` — directory doesn't exist (husky's npm `prepare` script never ran).
5. `git commit -m 'anything'` succeeds with **zero hook invocations** (git silently skips missing hooks-path dirs). The dogfood gate chain doesn't fire.

Surfaced in this worktree during the 2026-05-25 dogfood install: three commits (`7bdf026`, `1e31f06`, `2a17d8d`) committed cleanly with the managed block already in place; the pre-commit hook was a no-op because `.husky/_` wasn't bootstrapped.

**Workaround used:**

Ran `npm install` in the worktree (377 packages added, husky's `prepare` script bootstrapped `.husky/_` automatically). Re-tested by invoking `bash .husky/pre-commit` directly — all five gates (`detect-clones`, `check-anti-patterns`, `check-adopters`, `check-disposition-survivor`, `check-editor-symmetry`) ran cleanly.

**Suggested fix:**

- **Light:** the skill prints a warning at the end of install when husky-detected AND `.husky/_` doesn't exist: `"husky dispatcher not bootstrapped — run \`npm install\` before committing or hooks will silently skip"`. Documentation note in the canary install path: "the dogfood install assumes `npm install` has been run in the worktree." Cheapest fix; relies on operator reading the warning.
- **Medium:** the skill detects the missing `.husky/_` and runs `npm install` itself (or `npm install --ignore-scripts` plus `npx husky install`) as part of the install flow. Adopter-friendly: a single `install-scope-discovery-hooks` call fully arms the hook chain regardless of whether the worktree has been bootstrapped.
- **Heavy:** ship a post-install verification step that does a synthetic empty commit (`git commit --allow-empty -m 'dw-lifecycle: verify hooks fire'`) on a throwaway test ref, asserts the hook output appears, and rolls back. Surfaces the silently-skipped failure mode immediately and gives the operator a green-light signal.

Recommended: **Medium**. The Light variant relies on operators noticing the warning; the dogfood-handoff already named "every commit on this feature exercises scope-discovery's pre-commit hooks" as a first-class deliverable, so silently-skipped hooks defeats the dogfood contract. Medium completes the install in one operator-recognizable step.

## TF-002 · GATE · medium · `hooks-installed.json` accumulates entries across worktrees (committed manifest pollutes new worktrees)

**Repro:**

1. In worktree A (`/Users/orion/work/deskwork-work/scope-discovery`), run `install-scope-discovery-hooks` on 2026-05-25 at 10:58Z. Manifest at `.dw-lifecycle/scope-discovery/hooks-installed.json` records three files: worktree A's `.husky/pre-commit`, `.claude/agents/code-reviewer.md`, `.claude/agents/codebase-auditor.md` — all with worktree A's absolute paths.
2. Commit the manifest to the scope-discovery branch; eventually merge to main.
3. Create worktree B (`/Users/orion/work/deskwork-work/graphical-entries`) off main. The manifest file is now present in worktree B with worktree A's paths.
4. In worktree B, run `install-scope-discovery-hooks` on 2026-05-25 at 21:59Z. The manifest is updated — but the install **appends** worktree B's entry (`/Users/orion/work/deskwork-work/graphical-entries/.husky/pre-commit`) to the existing file rather than replacing stale entries. Result: a 4-entry manifest mixing two worktrees' paths.

**Workaround used:**

Left the stale entries in place (cosmetic only — they don't affect hook firing, just tracking). The operator-visible manifest now records files that don't exist at the listed paths from this worktree's perspective.

**Suggested fix:**

The manifest is a transactional record of where THIS install put managed files, not a permanent project artifact. Two shapes:

- **Light:** gitignore `.dw-lifecycle/scope-discovery/hooks-installed.json`. Each worktree maintains its own local manifest; nothing leaks across worktrees. Simplest; the cost is loss of audit trail at the commit level (which the journal can carry instead).
- **Medium:** on install, the skill computes the absolute realpath of the target worktree and removes any entries from the manifest whose realpath doesn't resolve under the current target. Net effect: re-running install in a fresh worktree replaces stale cross-worktree entries with this worktree's; manifests stay clean per-install.
- **Heavy:** namespace the manifest by worktree — `.dw-lifecycle/scope-discovery/hooks-installed/<realpath-hash>.json`. Each worktree's install writes its own file. Inspectable + multi-worktree-aware. Heaviest; probably overkill.

Recommended: **Light** (gitignore). The manifest is transactional state, not source-of-truth — exactly the shape that belongs outside version control. Closes the surface; the journal preserves any audit need.
