# dispatch-wrapper convention

This template documents the `dispatch-wrapper` convention used by
`dw-lifecycle` orchestrator skills. Copy the relevant sections into your
own orchestrator SKILL.md when you dispatch sub-agents and want
structured returns.

## Purpose

The dispatch wrapper enforces structured returns from sub-agent
dispatches. Without it, sub-agents can return free-form prose that the
controller has to parse loosely; with `wrap()`, the controller can rely
on a stable grammar plus structural rejection of forbidden-deferral
phrases.

Without the wrapper, the failure mode is:

- Sub-agent fixes one file the operator pointed at and returns
  "Done, fixed it."
- Controller has no way to know other sibling matches exist.
- The "just one place" assumption gets baked into the commit. The
  operator catches the missed siblings on the next walk-through.

With the wrapper, the failure mode is structurally rejected:

- Sub-agent must end its return with `Searched:` / `Included:` /
  `Excluded:` blocks.
- If `Searched` reports N matches and `Included` covers exactly 1 with
  `Excluded` empty, the wrapper rejects (skipped-audit detector).
- If any `Excluded` reason contains a deferral phrase ("for now",
  "TODO", "fix later", etc.), the wrapper rejects.

## Library API

```ts
import {
  wrap,
  DispatchRejected,
} from '@deskwork/plugin-dw-lifecycle/scope-discovery/dispatch-wrapper';

try {
  const result = await wrap(
    'typescript-pro',
    'Refactor every consumer of the legacy primitive to the new shape.',
    {
      dispatchFn: ({ agentType, prompt }) =>
        // your project's Agent-tool dispatcher
        runAgent({ subagent_type: agentType, prompt }),
    },
  );
  // result.searched / result.included / result.excluded are now
  // structured types you can reason about programmatically.
} catch (err) {
  if (err instanceof DispatchRejected) {
    // The wrapper has already rejected the return. Surface the message
    // to the operator and either retry with a clarifying prompt or
    // abort the orchestration step.
    console.error(`Dispatch rejected: ${err.message}`);
  }
  throw err;
}
```

## The grammar the wrapper enforces

The wrapper injects a directive at the end of every dispatched prompt
that asks the sub-agent to conclude with:

```text
Searched: <pattern> — <N matches>
Included: <file:line>, <file:line>, ...
Excluded: <file:line> — <one-line reason that is not a deferral>
          [, <file:line> — <reason>, ...]
```

- **Searched:** the grep/search pattern that enumerates every instance
  of the class of thing being fixed + total match count.
- **Included:** file:line pairs the fix covers (comma-separated).
- **Excluded:** file:line pairs the fix intentionally did NOT cover,
  each with a one-line non-deferral reason.

## What the wrapper rejects

1. **Missing blocks.** Any of `Searched`, `Included`, `Excluded` absent
   from the return.
2. **Skipped same-class audit.** `Searched` count > 1, `Included`
   covers exactly 1 match, `Excluded` empty. The sub-agent saw the
   sibling matches but didn't address them and didn't justify the
   exclusion.
3. **Forbidden-deferral phrases in `Excluded` reasons.** Substring
   matches: `"for now"`, `"just for now"`, `"TODO"`, `"FIXME"`,
   `"HACK"`, `"XXX"`, `"temporary"`, `"stub"`, `"placeholder"`,
   `"pending"`, `"defer"`, `"deferred"`, `"next pass"`, `"next time"`,
   `"address in"`, `"eventually"`, `"will fix"`, `"will address"`,
   `"we'll fix"`, `"we'll get"`, `"we'll come back"`. Regex matches:
   `/until F<digit>/`, `/until v<digit>/`, `/until phase <digit>/`,
   collocated `later` ("fix later", "in a later pass"), collocated
   `follow-up` ("as a follow-up", "follow-up issue").

The forbidden-deferral list is sourced from
`.claude/rules/agent-discipline.md` § "'Just for now' is bullshit".
Updating that rule is the canonical way to extend the built-in list.

## Refactor-context auto-prelude

When the task prompt contains a refactor marker (the words `refactor`,
`extraction`, `clones.yaml`, `canonical_side`, or `tests_proof`), the
wrapper appends an additional **REFACTOR-CONTEXT PRECONDITIONS** prelude
to the dispatched prompt. The prelude tells the sub-agent to verify the
extraction matches the `canonical_side` branch named in the
`clones.yaml` entry and to verify `tests_proof.sha` genuinely shows the
test failure on broken code.

The marker set is intentionally narrow — false positives are cheap
(extra prelude on a non-refactor dispatch is harmless) but false
negatives are the failure mode this exists to prevent (refactor
dispatch without the Step 0 obligation).

## Project overrides

The forbidden-deferral list and the refactor-marker set can both be
overridden per project. The override files live under
`.dw-lifecycle/scope-discovery/`:

### `forbidden-deferral-phrases.yaml`

```yaml
# Replaces the built-in FORBIDDEN_DEFERRAL_PHRASES + _REGEXES lists.
# At least one of `phrases:` or `regexes:` must be present.

phrases:
  - "for now"
  - "just for now"
  - "TODO"
  # ...

regexes:
  - 'until\s+F\d'
  - 'until\s+v\d'
  # ...
```

When this file exists, it REPLACES the built-in defaults (no merge —
the project owns the full list). Schema:
`plugins/dw-lifecycle/src/scope-discovery/schema/forbidden-deferral-phrases.yaml.schema.json`.

### `refactor-markers.yaml`

```yaml
# Replaces the built-in REFACTOR_CONTEXT_MARKERS regex list.
# A match on any marker triggers the refactor-context prelude.

markers:
  - 'refactor'
  - 'extract(?:ion|ing)?'
  - 'clones?\.yaml'
  - 'canonical_side'
  - 'tests_proof'
```

When this file exists, it REPLACES the built-in defaults. Schema:
`plugins/dw-lifecycle/src/scope-discovery/schema/refactor-markers.yaml.schema.json`.

## How to adopt in your own orchestrator SKILL.md

In an orchestrator SKILL.md that dispatches sub-agents, the convention
looks like:

1. Identify the dispatch points in the skill flow (the steps that read
   "dispatch a `typescript-pro` agent to refactor X" or similar).
2. Wrap each dispatch in `wrap()`:
   - The first argument is the agent type (e.g. `typescript-pro`,
     `code-reviewer`).
   - The second argument is the task prompt the orchestrator would have
     sent to the agent.
   - The third argument is `{ dispatchFn }`. The `dispatchFn` callback
     is how `wrap()` calls into the host runtime's Agent tool.
3. Handle `DispatchRejected` explicitly. A rejection is a signal that
   the sub-agent didn't satisfy the grammar; either retry with a
   clarifying prompt or abort and surface the error to the operator.

## Reference

- Code: `plugins/dw-lifecycle/src/scope-discovery/dispatch-wrapper.ts`
- Grammar: `plugins/dw-lifecycle/src/scope-discovery/dispatch-grammar.ts`
- Refactor prelude:
  `plugins/dw-lifecycle/src/scope-discovery/refactor-preconditions-prompt.ts`
- Adversarial harness:
  `plugins/dw-lifecycle/src/__tests__/scope-discovery/dispatch-wrapper.test.ts`
- Rule source for forbidden-deferral list:
  `.claude/rules/agent-discipline.md` § "'Just for now' is bullshit"
