# Contract: `stackctl tier-vocab [--json]`

The one NEW verb this feature adds (D1) — a read-only, installation-scoped surface that reports the
enclosing installation's tier vocabulary and the derived heuristic bucket bindings. Registered in
`src/cli.ts`'s `SUBCOMMANDS`, following the existing `src/subcommands/*.ts` style (strict arg parse,
fail-loud, no silent ignore). Read-only computation — it reads config and emits to stdout; it
mutates no installation state. It is the authoring-time analogue of `resolve-tiers` (which reads the
same `tier_map` at execute time).

---

## `stackctl tier-vocab [--json]`

Resolve the enclosing installation, read its `tier_map`, and emit the tier labels, each label's
resolved model, and the derived `{cheapest, mid, mostCapable}` bucket bindings (FR-004a). The
`/stack-control:define` tasks seam runs this **before** driving `/speckit-tasks` and injects
`renderTierRequirement(<this output>)` into the backend conversation (FR-002).

**Args** (strict — unknown flag / stray positional ⇒ exit 2):
- `--json` (optional) — emit the `TierVocab` as JSON (default and only output mode today; reserved
  for a future human-summary mode, mirroring `resolve-tiers --json`).

There is **no `--spec`**: this verb is installation-scoped (it reads `.stack-control/config.yaml`),
not spec-scoped. The installation is resolved by walking up from the cwd (`findInstallation`), the
established installation-anchor mechanism.

**Behavior**:
1. Resolve the enclosing installation (walk up from cwd). **No enclosing installation** ⇒ fail loud,
   exit 1, stderr names the missing installation + the `stackctl setup` remediation (installation-
   anchor invariant — no fallback location).
2. Load its config through the existing fail-loud loader. **Malformed config** (bad YAML, unknown
   key, out-of-range `tier_map` value, etc.) ⇒ the loader throws; the verb exits non-zero with the
   loader's prefixed message (no silent best-effort parse — Principle V).
3. **`tier_map` present and non-empty** ⇒ compute `bucketBindings(tierMap)` and emit the `TierVocab`
   JSON to stdout, **exit 0**.
4. **`tier_map` absent or empty** ⇒ emit `{ "configured": false, "configPath": "<path>" }` to
   stdout AND a loud advisory to stderr naming the missing `tier_map` and the config path to fix it,
   **exit 0**. Generation is **not** blocked (FR-009): the seam still authors tasks, tagging each
   `[tier:UNSET]`, and the existing floor catches them fail-loud at execute.

**Exit codes**: `0` vocab emitted (configured OR absent — both are exit 0) · `1` no enclosing
installation, or a fatal config-load error · `2` usage error (unknown flag / stray positional).

**Guarantees** (unit-tested on fixtures — the four states, D6):
- **Configured** (`tier_map: {fast: haiku, balanced: sonnet, powerful: opus}`) ⇒ exit 0; stdout is a
  `TierVocab` with `configured:true`, three `labels` (each `model` ∈ accepted set and `= tier_map[label]`),
  and `buckets = { cheapest: fast, mid: balanced, mostCapable: powerful }` (data-model Example A).
- **Absent** (no `tier_map`) ⇒ exit **0**; stdout `{configured:false, configPath}`; stderr advisory
  names `tier_map` + the config path. (Not blocked — FR-009.)
- **Malformed** (`tier_map: {fast: "not-a-model"}`, or bad YAML, or unknown top-level key) ⇒ exit
  non-zero; stderr is the loader's fail-loud message (e.g. `… is not an accepted model
  (haiku|sonnet|opus|fable)`). No partial vocab emitted.
- **No installation** (run outside any `.stack-control/` tree) ⇒ exit 1; stderr names the missing
  installation + `stackctl setup`.
- Output is identical whether or not the superpowers plugin is installed (no coupling).

---

## Output shape (`TierVocab`, `--json`)

**Configured:**
```jsonc
{
  "configured": true,
  "configPath": "/abs/path/.stack-control/config.yaml",
  "labels": [
    { "label": "fast",     "model": "haiku",  "rank": 0 },
    { "label": "balanced", "model": "sonnet", "rank": 1 },
    { "label": "powerful", "model": "opus",   "rank": 2 }
  ],
  "buckets": { "cheapest": "fast", "mid": "balanced", "mostCapable": "powerful" }
}
```

**Absent (FR-009):**
```jsonc
{ "configured": false, "configPath": "/abs/path/.stack-control/config.yaml" }
```

`labels[].model` ∈ the accepted-model set and `= tier_map[labels[].label]`; `labels[].rank =`
index of `model` in `MODEL_CAPABILITY_RANK`; `buckets` is `bucketBindings(tier_map)` (data-model
§ Tier ranking). `configured` is the discriminant a consumer switches on.

---

## Discovery / front door

Registered in three places, mirroring `resolve-tiers` (a read-only verb fronted by a skill, with no
standalone skill of its own):

- `src/cli.ts` `SUBCOMMANDS` — `'tier-vocab': runTierVocab`.
- `src/cli-help/surfaces/spec-misc.ts` — a `buildFlatSurfaceCommand({ verb: 'tier-vocab', … })`
  descriptor so `--help` renders and `check-front-door`'s help assertions stay green.
- `src/capability/fronted-operations.ts` `INTERNAL_VERBS` — add `'tier-vocab'` (read-only
  computation fronted by the `/stack-control:define` skill; **no** standalone
  `/stack-control:tier-vocab` skill by design, exactly as `resolve-tiers` is fronted by
  `/stack-control:execute`).

Read-only computation ⇒ no front-door *mediation* required, but the implementation MUST keep
`stackctl check-front-door` exit 0 (028 US4) — the three registrations above are what satisfy it.
