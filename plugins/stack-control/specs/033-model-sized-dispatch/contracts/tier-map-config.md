# Contract: `tier_map` in `.stack-control/config.yaml`

An additive section on the existing installation config (`InstallationConfig`), parsed by the
existing `src/config/config-loader.ts` (extended), following the `parsePaths` precedent:
fail-loud, unknown-key rejection, non-empty-string validation. Wire snake_case → in-memory
camelCase.

---

## Wire format (YAML)

```yaml
version: 1
tier_map:
  fast: haiku
  balanced: sonnet
  powerful: opus
```

- `tier_map` maps an **operator-chosen tier label → model keyword**.
- **Keys** (tier labels): free semantic strings (`fast`, `balanced`, `powerful`, or any label the
  operator's `tasks.md` references via `[tier:<label>]`). Never model identifiers.
- **Values** (model keywords): MUST be in the dispatch surface's **accepted-model set** — a host
  capability constant (e.g. `haiku | sonnet | opus | fable` for the Claude Code subagent surface;
  D4). The accepted-model set is owned by the dispatch surface, not by the tier map.

**Recommended default (harvested from superpowers SDD's complexity taxonomy)** — documented as a
starter, **not hardcoded** (the operator may rename/remap freely; FR-007): `fast` for mechanical
single-file tasks, `balanced` for multi-file integration, `powerful` for design/architecture.

---

## In-memory type (added to `src/config/types.ts`)

```ts
/** Operator-configured tier label → model keyword map (033). */
export type TierMap = Readonly<Record<string, string>>;

export interface InstallationConfig {
  readonly version: number;
  readonly baseDir?: string;
  readonly paths?: InstallationPaths;
  readonly tierMap?: TierMap;   // NEW — additive
}
```

`tier_map` is added to the config-loader's `KNOWN_TOP_LEVEL` set (else the existing unknown-key
guard rejects it).

---

## Validation (fail-loud, before any dispatch — Principle V / FR-007 / FR-008)

A `parseTierMap` helper mirroring `parsePaths` enforces:

| Condition | Result |
|---|---|
| `tier_map` present but not a mapping | error: `tier_map must be a mapping` |
| an empty tier-label key (`"": ...`) | error: `tier_map has an empty tier label` |
| a non-string / empty value | error: `tier_map[<label>] must be a non-empty model keyword` |
| a value outside the accepted-model set | error: `tier_map[<label>] = '<v>' is not an accepted model (haiku\|sonnet\|opus\|fable)` |

**Absent `tier_map`**: NOT a loader error by itself (the field is optional). It becomes a **run**
error at `resolve-tiers` time when any task declares a tier (`no tier_map configured; cannot
resolve tier '<label>' for task <id>` — FR-008), keeping config-load decoupled from a given run's
needs while still failing loud before dispatch.

---

## Accepted-model-set ownership (capability, not vendor — Principle III / IX)

The accepted-model set is defined once as a **dispatch-surface capability constant**, not inline
in the tier-map parser. Adding a host whose subagent surface accepts a different model set
contributes a different constant behind the same seam — the tier-map validator is unchanged
(it consults the constant). The tier map itself names only labels and operator-chosen model
keywords; it never branches on a vendor identity.
