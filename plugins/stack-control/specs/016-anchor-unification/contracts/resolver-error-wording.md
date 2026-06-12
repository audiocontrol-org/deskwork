# Contract: Resolver Error Wording Classes

One shared decision point (`classifyResolverError`) renders resolver failures identically across all verbs. Normative for FR-009, FR-012, FR-013. The not-found class wording is a FROZEN adopter contract — this feature changes where the decision lives and who applies it, never the not-found text itself.

## Classes

| Condition | stderr shape | Remediation in message | Notes |
|---|---|---|---|
| No domain encloses the start dir | `<verb>: FATAL — <existing not-found message>` | `stackctl setup` | Unchanged text; now applied by ALL resolver-consuming verbs (today: 2 gate correctly, 6 over-apply) |
| Overlapping domains discovered | `<verb>: <overlap message naming every root>` | none (setup cannot fix overlap) | NEW class; never the `FATAL — `+setup shape |
| Malformed domain config | `<verb>: <parse error verbatim>` | n/a | NO wording class; identical across verbs |
| Any other resolver error (escape, collision, …) | `<verb>: <message verbatim>` | n/a | NO wording class |

## Machine-readability guarantee

Tooling and skill bodies may pattern-match `: FATAL — ` + `stackctl setup` as exactly "no enclosing domain — run setup". After this feature that match has zero false positives (SC-005). Anything else on stderr is NOT a setup problem.

## Emission sites (all consume the shared helper)

`src/subcommands/backlog.ts`, `src/scope-discovery/install-scope-discovery.ts` (today correctly gated — behavior preserved), `src/scope-discovery/scope-widen.ts`, `src/scope-discovery/scope-inventory.ts`, `src/subcommands/slush-findings.ts`, `src/subcommands/audit-barrage.ts`, `src/subcommands/audit-barrage-lift.ts` (today unconditional — non-not-found errors lose the class), plus `src/subcommands/govern.ts` for the sub-step divergence FATAL (FR-002).

## Reporting duties (loud-by-default, FR-012)

- Config resolution reports its source per run: `config: domain-override (<path>)` or `config: plugin-default (<path>)`.
- An active `STACKCTL_BACKLOG_DIR` override is reported whenever it changes a resolution outcome.
- govern's exclude/slush sub-steps either succeed against the run's anchor or the run fails loud naming the diverging sub-step — no non-fatal skip lines.
