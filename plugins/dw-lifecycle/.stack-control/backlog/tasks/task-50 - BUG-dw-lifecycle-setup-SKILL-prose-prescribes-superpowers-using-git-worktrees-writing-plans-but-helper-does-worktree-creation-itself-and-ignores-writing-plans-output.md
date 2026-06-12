---
id: TASK-50
title: >-
  BUG: dw-lifecycle:setup SKILL prose prescribes superpowers:using-git-worktrees
  + writing-plans, but helper does worktree creation itself and ignores
  writing-plans output
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - bug
dependencies: []
references:
  - gh-126
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`/dw-lifecycle:setup` SKILL.md prose at `plugins/dw-lifecycle/skills/setup/SKILL.md` lists 5 steps. Two of them (Step 2 and Step 3) are inconsistent with what the helper at `src/subcommands/setup.ts` actually does.

## Step 2 — `superpowers:using-git-worktrees`

SKILL.md says:

> 2. Invoke `superpowers:using-git-worktrees` for branch + worktree creation. The worktree path follows `config.worktrees.naming`.

But the helper at `src/subcommands/setup.ts:107` creates the branch + worktree itself:

```ts
execFileSync('git', ['-C', root, 'worktree', 'add', worktreePath, '-b', branchName, 'HEAD'], { ... });
```

Following the SKILL literally produces a collision: `using-git-worktrees` creates `feature/<slug>` first, then the helper's `worktree add ... -b feature/<slug>` fails with "branch already exists". The SKILL's promise that the worktree path "follows config.worktrees.naming" is also unenforceable via using-git-worktrees, which prescribes `.worktrees/` in-project or `~/.config/superpowers/worktrees/<project>/<branch>` — neither matches the dw-lifecycle config naming pattern.

## Step 3 — `superpowers:writing-plans`

SKILL.md says:

> 3. Invoke `superpowers:writing-plans` to generate the workplan content from the feature definition (if `--definition <path>` given) or from a fresh design conversation. The output is the body of `workplan.md`.

But the helper at `src/subcommands/setup.ts:140-148` does NOT accept any writing-plans output. It reads the definition file directly and APPENDS its raw content to the workplan template as a comment-bordered chunk:

```ts
if (definitionFile) {
  const defContent = readFileSync(definitionFile, 'utf8');
  const wpPath = join(docsDir, 'workplan.md');
  const wp = readFileSync(wpPath, 'utf8');
  writeFileSync(wpPath, wp + '\n<!-- Definition imported from: ' + definitionFile + ' -->\n' + defContent + '\n', 'utf8');
}
```

The helper has no `--workplan-content <path>` flag. Whatever `writing-plans` would produce gets discarded.

## Why this matters

An adopter following the SKILL prose verbatim will (a) hit the worktree collision and (b) produce a workplan that's "definition pasted as a comment" instead of a structured plan. Both deviations from the prose are silent.

## Suggested fix shape

Either:
- Drop Steps 2 and 3 from the SKILL prose. The helper is self-contained; the SKILL just announces and shells out.
- Keep Steps 2 and 3 but restructure: have the helper accept the worktree path + workplan body as inputs (`--worktree-path`, `--workplan-content`), so the orchestration layer composes the three skills correctly.

The former is simpler and matches the helper's current self-contained shape. The latter is more flexible but more code.

Surfaced during the customize-hooks dogfood (2026-04-30).
<!-- SECTION:DESCRIPTION:END -->
