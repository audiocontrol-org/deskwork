---
name: dispatch-wrapper
description: "Wrap a sub-agent dispatch with the scope-discovery grammar gate — stackctl wrap-prompt augments a task prompt with the required Searched/Included/Excluded return grammar (+ a refactor-preconditions prelude when the task is a refactor); stackctl validate-return parses the sub-agent's reply and rejects it when a grammar block is missing, the same-class audit was skipped, or an exclusion reason carries a forbidden-deferral phrase"
---

# /stack-control:dispatch-wrapper

Thin adapter over the two `stackctl` verbs that bracket a sub-agent dispatch (the vendor-neutral core; this skill adds nothing the CLI can't do — it sequences and reports). The orchestrating Claude session can only dispatch through the Agent tool (a runtime primitive, not a TypeScript callable), so the wrap is split into two Bash-invocable halves:

- `stackctl wrap-prompt` — emits the augmented prompt (your task prompt + the required-return-grammar instruction + an optional refactor-context prelude). Paste stdout into the Agent tool's `prompt` parameter.
- `stackctl validate-return` — parses the sub-agent's reply against the grammar and exits `0` (accept) or `1` (re-dispatch with a correction note built from the JSON it emits).

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl` verbs it calls, never in a git hook. The skill travels with the plugin install.

## The required return grammar

The sub-agent must conclude its response with:

```
Searched: <pattern> — <N matches>
Included: <file:line>, <file:line>, ...
Excluded: <file:line> — <one-line reason that is not a deferral>
```

`validate-return` rejects when: any block is missing; `Searched` count > 1 while `Included` covers exactly 1 and `Excluded` is empty (the same-class audit was skipped); or any `Excluded` reason contains a forbidden-deferral phrase (`for now`, `TODO`, `defer to v2`, …). When the task is a refactor, `wrap-prompt` also appends the refactor-preconditions prelude.

## Steps

1. **Augment the prompt** (write your task prompt to a file first):

   ```bash
   stackctl wrap-prompt --agent-type implementer --prompt-file ./task.md
   ```

   Paste stdout into the Agent tool's `prompt`. Useful flags: `--repo-root <path>` (resolve project overrides; default cwd), `--quiet` (suppress the stderr summary).

2. **Validate the reply.** Pipe the Agent tool's return through `validate-return` (`-` reads stdin, mirroring `gh --body-file -`):

   ```bash
   echo "$RESPONSE" | stackctl validate-return --response-file - --agent-type implementer
   ```

   Or pass a file with `--response-file <path>`. Add `--json` to emit only the structured result.

3. **Branch on the exit code:** `0` = accept the sub-agent's work; `1` = re-dispatch with a correction note built from the violations in the JSON; `2` = usage error (missing flag, unknown agent-type, empty stdin).

## Project overrides

Both verbs read project-local override files relative to `--repo-root` when present (each REPLACES the built-in list — no merge):

- `.stack-control/scope-discovery/forbidden-deferral-phrases.yaml` — `phrases:` + `regexes:` lists.
- `.stack-control/scope-discovery/refactor-markers.yaml` — `markers:` list (regex sources) that decide when the refactor prelude is appended.

## Notes

- Ambiguous nouns (`stub`, `placeholder`, `pending`, `temporary`) do NOT trip on bare appearance — only in a deferral collocation (`placeholder for now`, `stub until v3`). The ALL-CAPS comment markers (`TODO`, `FIXME`, `XXX`) trip on a bare match.
- The `Searched` count must end in a whitelisted head noun (`matches`, `hits`, `occurrences`, `call sites`, `files`, `issues`, …) with up to 3 modifier tokens before it.
