# Contract: `stackctl resolve-tiers --spec <dir>`

The one NEW verb this feature adds — the testable, fail-loud **pre-dispatch tier-resolution
gate**. Registered in `src/cli.ts`'s `SUBCOMMANDS`, following the existing `src/subcommands/*.ts`
style (strict arg parse, fail-loud, no silent ignore). Read-only computation — it parses
`tasks.md` + reads config and emits to stdout; it mutates no installation state.

---

## `stackctl resolve-tiers --spec <dir> [--json]`

Parse the `[tier:]` tags in `<dir>/tasks.md`, resolve each task's tier against the installation's
`tier_map`, and emit a per-task `{id, tierLabel, model}` resolution — OR fail loud with the
**complete** tier-error set (FR-006). The execute skill runs this **before** dispatching any
subagent and uses the output to set each subagent's explicit model.

**Args** (strict — unknown flag / missing value / stray positional ⇒ exit 2):
- `--spec <dir>` (required) — the spec dir (must contain `tasks.md`).
- `--json` (optional) — emit the `TierResolution` as JSON (default). Reserved for a future human
  summary mode.

**Behavior**:
1. Resolve the enclosing installation + its `tier_map`. (Absent `tier_map` is not itself an error
   here — it becomes a per-task error in step 5 if any task declares a tier. A *malformed* or
   out-of-range `tier_map` is a loud config-load error — see `tier-map-config.md`.)
2. Read `<dir>/tasks.md` (fail loud, exit 1, if missing — reuses the execute-check pattern).
3. Parse → `TieredTask[]` (collect all parse errors).
4. For each task, resolve `tierLabel` against the tier map + the accepted-model set.
5. **If any error** (parse / no-tier / unknown-tier / no-map-for-tiered-task): print every error
   to stderr, one per line, prefixed `resolve-tiers: <category>:`, and exit 1. **No partial
   resolution is emitted.**
6. **Else**: print the `TierResolution` JSON to stdout, exit 0.

**Exit codes**: `0` resolution emitted · `1` resolution/validation failure (errors on stderr) ·
`2` usage error.

**Guarantees** (unit-tested on fixtures):
- A `tasks.md` with a no-tier task ⇒ exit 1, stderr names the task (SC-002). No resolution.
- An unknown-tier task ⇒ exit 1, stderr names task + tier (SC-002). No resolution.
- A tiered task with no `tier_map` configured ⇒ exit 1, stderr names the absent map (FR-008). No
  resolution.
- A fully-valid plan ⇒ exit 0, stdout is a `TierResolution` whose every task's `model` ∈ the
  accepted-model set and equals `tier_map[task.tierLabel]` (SC-001).
- Multiple distinct errors ⇒ **all** printed before exit (FR-006), not first-error-abort.
- Output is identical whether or not the superpowers plugin is installed (FR-013 / SC-006 — the
  verb has no superpowers coupling).

---

## Output shape (`TierResolution`, `--json`)

```jsonc
{
  "specDir": "specs/033-model-sized-dispatch",
  "tasks": [
    { "id": "T001", "tierLabel": "fast",     "model": "haiku" },
    { "id": "T002", "tierLabel": "powerful", "model": "opus"  }
  ]
}
```

`tasks[].model` ∈ the accepted-model set; `tasks[].model === tier_map[tasks[].tierLabel]`. The
execute skill maps `id → model` and passes that model explicitly on each subagent dispatch.

---

## Discovery / front door

Registered in `src/cli.ts` and surfaced through `--help` descriptors so
`stackctl check-front-door`'s skill↔verb parity + help assertions stay green (the
`/stack-control:execute` skill names the verb). Read-only computation ⇒ no front-door *mediation*
required, but the implementation MUST keep `check-front-door` exit 0 (028 US4).
